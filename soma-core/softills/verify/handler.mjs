#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * meta-softill-verify — handler.js
 *
 * 验证权（Gate）：在隔离副本中验证候选者与 contract 的一致性。
 * 不修改原候选，evidence 必须非空。
 *
 * 拒绝能力幻觉的关键防线：
 * - 所有 check 必须有 pass/fail
 * - evidence 必须非空
 * - 检查 path 存在性 + hash 比对
 * - 在隔离沙箱中运行，不写原候选
 *
 * 使用: node handler.js <input.json>
 */


import fs from 'fs';

import path from 'path';

import crypto from 'crypto';

import { createReceipt, sha256, loadJSON, readJSONFromFile, softillResult } from '../_shared/receipt-utils.js.js';

const SANDBOX_DIR = path.resolve(__dirname, '..', '..', 'verify-sandbox');

function main() { parseInput(handle); }

function parseInput(cb) {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = readJSONFromFile(path.resolve(process.argv[2])); }
    catch (e) { return exitError('Read', e.message); }
    cb(input);
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); cb(input); }
      catch (e) { exitError('Parse', e.message); }
    });
  }
}

function exitError(type, msg) {
  console.log(softillResult('meta-softill-verify', 'error', `${type}: ${msg}`, {}, []));
  process.exit(1);
}

function handle(input) {
  const candidatePath = input.candidatePath ? path.resolve(input.candidatePath) : null;
  const contract = input.contract || {};
  const forgeReceiptHash = input.forgeReceiptHash || null;
  const checks = [];
  const evidence = [];

  // ─── Check 1: candidatePath 存在 ───
  const pathExists = candidatePath && fs.existsSync(candidatePath);
  checks.push({
    check: 'candidate_path_exists',
    pass: !!pathExists,
    detail: pathExists ? `候选路径存在: ${candidatePath}` : `候选路径不存在: ${candidatePath}`,
    evidencePath: null,
  });

  // ─── Check 2: handler.js 存在 ───
  let handlerExists = false;
  if (pathExists) {
    const handlerPath = path.join(candidatePath, 'handler.js');
    handlerExists = fs.existsSync(handlerPath);
    checks.push({
      check: 'handler_exists',
      pass: handlerExists,
      detail: handlerExists ? `handler.js 存在: ${handlerPath}` : 'handler.js 不存在',
      evidencePath: handlerExists ? handlerPath : null,
    });
  }

  // ─── Check 3: softill.json 存在且可解析 ───
  let softillMeta = null;
  if (pathExists) {
    const jsonPath = path.join(candidatePath, 'softill.json');
    if (fs.existsSync(jsonPath)) {
      softillMeta = loadJSON(jsonPath);
      checks.push({
        check: 'softill_json_valid',
        pass: softillMeta !== null,
        detail: softillMeta ? `softill.json 可解析: ${softillMeta.name}` : 'softill.json 格式错误',
        evidencePath: jsonPath,
      });
    } else {
      checks.push({
        check: 'softill_json_exists',
        pass: false,
        detail: 'softill.json 不存在',
        evidencePath: null,
      });
    }
  }

  // ─── Check 4: contract 匹配检查（如果提供了 contract） ───
  if (contract && Object.keys(contract).length > 0 && softillMeta) {
    for (const [key, expected] of Object.entries(contract)) {
      const actual = softillMeta[key];
      const matched = String(actual) === String(expected);
      checks.push({
        check: `contract_${key}`,
        pass: matched,
        detail: matched ? `${key} 匹配: ${actual}` : `${key} 不匹配: 期望 ${expected}, 实际 ${actual}`,
        evidencePath: null,
      });
    }
  }

  // ─── Check 5: forgeReceiptHash 验证（如果提供） ───
  if (forgeReceiptHash) {
    // 尝试在 receipts 中查找对应的 forge receipt
    const receiptsDir = path.resolve(__dirname, '..', '..', 'receipts');
    let foundForgeReceipt = false;
    if (fs.existsSync(receiptsDir)) {
      const files = fs.readdirSync(receiptsDir).filter(f => f.endsWith('-forge-receipt.json'));
      for (const f of files) {
        const receipt = loadJSON(path.join(receiptsDir, f));
        if (receipt && receipt.receipt.meta.receiptHash === forgeReceiptHash) {
          foundForgeReceipt = true;
          break;
        }
      }
    }

    checks.push({
      check: 'forge_receipt_verified',
      pass: foundForgeReceipt,
      detail: foundForgeReceipt ? 'Forge receipt 已验证' : `Forge receipt 未找到: ${forgeReceiptHash}`,
      evidencePath: null,
    });
  }

  // ─── Check 6: 候选 handler 语法检查（在隔离副本） ───
  let syntaxValid = false;
  let syntaxError = null;
  if (handlerExists) {
    // 复制到隔离沙箱中检查
    const sandboxDir = path.join(SANDBOX_DIR, `verify-${Date.now()}`);
    fs.mkdirSync(sandboxDir, { recursive: true });

    try {
      const handlerContent = fs.readFileSync(path.join(candidatePath, 'handler.js'), 'utf-8');
      const sandboxFile = path.join(sandboxDir, 'handler.js');
      fs.writeFileSync(sandboxFile, handlerContent);

      // 用 Node.js 语法检查（不执行）
      try {
        new Function(handlerContent);
        syntaxValid = true;
      } catch (e) {
        syntaxValid = false;
        syntaxError = e.message;
      }

      // 证据：沙箱中的副本
      const sandboxEvidence = path.join(sandboxDir, 'sandbox-handler.js');
      fs.copyFileSync(sandboxFile, sandboxEvidence);

      checks.push({
        check: 'handler_syntax_valid',
        pass: syntaxValid,
        detail: syntaxValid ? 'handler.js 语法检查通过' : `handler.js 语法错误: ${syntaxError}`,
        evidencePath: sandboxEvidence,
      });
    } catch (e) {
      checks.push({
        check: 'handler_syntax_valid',
        pass: false,
        detail: `无法读取 handler.js: ${e.message}`,
        evidencePath: null,
      });
    }
  }

  // 收集 evidence 文件路径
  for (const c of checks) {
    if (c.evidencePath && fs.existsSync(c.evidencePath)) {
      evidence.push(c.evidencePath);
    }
  }

  // ─── 自身完整性检查：evidence 必须非空 ───
  const evidenceNonEmpty = evidence.length > 0;
  checks.push({
    check: 'self_evidence_non_empty',
    pass: evidenceNonEmpty,
    detail: evidenceNonEmpty ? `evidence 包含 ${evidence.length} 个文件` : 'evidence 为空 — 违反诚实性原则',
    evidencePath: null,
  });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const verdict = passed === total ? 'PASS' : passed >= total * 0.6 ? 'PARTIAL' : 'FAIL';

  // 写入证据文件汇总
  const evidenceDir = path.resolve(__dirname, '..', '..', 'receipts', 'evidence');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, `verify-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify({
    verdict,
    checks,
    evidence,
    candidatePath,
    forgeReceiptHash,
    timestamp: new Date().toISOString(),
  }, null, 2));

  evidence.push(evidenceFile);

  const receipt = createReceipt({
    softill: 'meta-softill-verify',
    operation: 'verify',
    status: verdict === 'PASS' ? 'pass' : verdict === 'PARTIAL' ? 'warn' : 'fail',
    input,
    output: {
      candidatePath,
      checks: checks.map(c => ({ check: c.check, pass: c.pass })),
      passed,
      total,
      verdict,
    },
    evidence,
    inputHash: input.inputHash || null,
  });

  const statusCode = verdict === 'PASS' ? 'pass' : verdict === 'PARTIAL' ? 'warn' : 'fail';

  console.log(softillResult('meta-softill-verify', statusCode,
    `验证 ${verdict}: ${passed}/${total} 检查通过`,
    {
      checks: checks.map(c => ({ check: c.check, pass: c.pass, detail: c.detail })),
      verdict,
      passed,
      total,
      candidatePath,
      receiptHash: receipt.receipt.meta.receiptHash,
      receiptPath: receipt.receipt.meta.receiptPath,
    },
    evidence));
  process.exit(0);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();