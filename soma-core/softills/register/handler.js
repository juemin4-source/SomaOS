#!/usr/bin/env node
/**
 * meta-softill-register — handler.js
 *
 * 注册权（Hand）：将 verify-pass 的候选写入 Shadow Registry。
 * 核心约束：
 * 1. 必须提供 verifyReceiptHash — 拒绝无验证直接注册
 * 2. 只写 shadow-registry/，不碰生产库
 * 3. 跨查 capability-lock（如果存在）
 *
 * 拒绝幻觉的最后一道防线：
 * - 无 verifyReceiptHash → REJECT
 * - verify 状态非 PASS → REJECT
 * - 候选路径不存在 → REJECT
 * - 注册后生成完整 receipt 形成闭环
 *
 * 使用: node handler.js <input.json>
 */

const fs = require('fs');
const path = require('path');
const { createReceipt, sha256, loadJSON, readJSONFromFile, softillResult } = require('../_shared/receipt-utils.js');

const SHADOW_REGISTRY_DIR = path.resolve(__dirname, '..', '..', 'shadow-registry');
const CANDIDATES_DIR = path.join(SHADOW_REGISTRY_DIR, 'candidates');

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
  console.log(softillResult('meta-softill-register', 'error', `${type}: ${msg}`, {}, []));
  process.exit(1);
}

function handle(input) {
  const candidateName = input.candidateName;
  const sourcePath = input.sourcePath ? path.resolve(input.sourcePath) : null;
  const verifyReceiptHash = input.verifyReceiptHash;
  const verifyReceiptPath = input.verifyReceiptPath || null;
  const targetState = input.targetState || 'draft';

  const rejections = [];

  // ─── Guard 1: 必须提供 verifyReceiptHash ───
  if (!verifyReceiptHash) {
    rejections.push({
      guard: 'verify_receipt_required',
      pass: false,
      detail: '缺少 verifyReceiptHash — 拒绝无验证注册',
    });
  }

  // ─── Guard 2: 验证 receipt 存在且状态为 PASS ───
  if (verifyReceiptHash) {
    const receiptsDir = path.resolve(__dirname, '..', '..', 'receipts');
    let verifyReceiptFound = false;
    let verifyStatus = null;

    if (fs.existsSync(receiptsDir)) {
      const files = fs.readdirSync(receiptsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const receipt = loadJSON(path.join(receiptsDir, f));
        if (receipt && receipt.receipt.meta.receiptHash === verifyReceiptHash) {
          verifyReceiptFound = true;
          verifyStatus = receipt.receipt.meta.status;
          break;
        }
      }
    }

    // Also check verifyReceiptPath directly
    if (!verifyReceiptFound && verifyReceiptPath) {
      const receipt = loadJSON(verifyReceiptPath);
      if (receipt && receipt.receipt.meta.receiptHash === verifyReceiptHash) {
        verifyReceiptFound = true;
        verifyStatus = receipt.receipt.meta.status;
      }
    }

    if (!verifyReceiptFound) {
      rejections.push({
        guard: 'verify_receipt_found',
        pass: false,
        detail: `Verify receipt 未找到: ${verifyReceiptHash}`,
      });
    } else if (verifyStatus !== 'pass') {
      rejections.push({
        guard: 'verify_receipt_status',
        pass: false,
        detail: `Verify receipt 状态为 ${verifyStatus}，需要 pass`,
      });
    }
  }

  // ─── Guard 3: 候选名称必须存在 ───
  if (!candidateName) {
    rejections.push({
      guard: 'candidate_name_required',
      pass: false,
      detail: '缺少 candidateName',
    });
  }

  // ─── Guard 4: 源路径必须存在 ───
  if (sourcePath && !fs.existsSync(sourcePath)) {
    rejections.push({
      guard: 'source_path_exists',
      pass: false,
      detail: `源路径不存在: ${sourcePath}`,
    });
  }

  if (!sourcePath) {
    rejections.push({
      guard: 'source_path_required',
      pass: false,
      detail: '缺少 sourcePath',
    });
  }

  // ─── Guard 5: 目标状态必须合法 ───
  if (!['draft', 'experimental'].includes(targetState)) {
    rejections.push({
      guard: 'valid_target_state',
      pass: false,
      detail: `无效目标状态: ${targetState}，仅支持 draft 或 experimental`,
    });
  }

  // ─── Guard 6: 跨查 Capability Lock（如果存在） ───
  const capabilityLockPath = path.resolve(__dirname, '..', '..', 'fixtures', 'mock-capability-lock.yaml');
  if (fs.existsSync(capabilityLockPath)) {
    const lockContent = fs.readFileSync(capabilityLockPath, 'utf-8');
    // 简单检查候选名是否在 lock 中
    const inLock = lockContent.includes(candidateName);
    rejections.push({
      guard: 'capability_lock_check',
      pass: inLock,
      detail: inLock ? `${candidateName} 在能力锁中` : `${candidateName} 不在能力锁中 — 建议审查`,
      warnOnly: !inLock,
    });
  }

  // ─── 有硬拒绝时提前退出 ───
  const hardRejections = rejections.filter(r => !r.warnOnly && !r.pass);
  if (hardRejections.length > 0) {
    const receipt = createReceipt({
      softill: 'meta-softill-register',
      operation: 'register',
      status: 'error',
      input,
      output: {
        candidateName,
        rejections: hardRejections.map(r => ({ guard: r.guard, detail: r.detail })),
        allRejections: rejections,
      },
      evidence: [],
    });

    console.log(softillResult('meta-softill-register', 'error',
      `拒绝注册: ${hardRejections.length} 项 guard 未通过`,
      {
        candidateName,
        rejections: hardRejections.map(r => ({ guard: r.guard, detail: r.detail })),
        receiptHash: receipt.receipt.meta.receiptHash,
      },
      []));
    process.exit(0);
  }

  // ─── 执行注册 ───
  fs.mkdirSync(CANDIDATES_DIR, { recursive: true });

  const candidateDir = path.join(CANDIDATES_DIR, candidateName);
  if (fs.existsSync(candidateDir)) {
    // 版本化：添加时间戳后缀
    const ts = Date.now().toString(36);
    const versionedName = `${candidateName}-${ts}`;
    // 仍然在 shadow registry 内
    const versionedDir = path.join(CANDIDATES_DIR, versionedName);
    fs.mkdirSync(versionedDir, { recursive: true });

    // 复制源文件
    copyDirSync(sourcePath, versionedDir);

    // 写注册记录
    const registryRecord = {
      name: versionedName,
      originalName: candidateName,
      state: targetState,
      registeredAt: new Date().toISOString(),
      sourcePath,
      verifyReceiptHash,
      registryType: 'shadow',
      version: `0.1.0-${targetState}`,
    };
    fs.writeFileSync(path.join(versionedDir, 'registry-record.json'), JSON.stringify(registryRecord, null, 2));

    // 写注册索引
    const index = loadJSON(path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json')) || { registrations: [] };
    index.registrations.push(registryRecord);
    fs.writeFileSync(path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json'), JSON.stringify(index, null, 2));

    const receipt = createReceipt({
      softill: 'meta-softill-register',
      operation: 'register',
      status: 'pass',
      input,
      output: {
        name: versionedName,
        originalName: candidateName,
        state: targetState,
        registeredAt: versionedDir,
        versioned: true,
      },
      evidence: [path.join(versionedDir, 'registry-record.json')],
      inputHash: input.inputHash || null,
    });

    console.log(softillResult('meta-softill-register', 'pass',
      `候选 ${versionedName} 已注册 (版本化，因 ${candidateName} 已存在)`,
      {
        name: versionedName,
        originalName: candidateName,
        state: targetState,
        registeredAt: versionedDir,
        versioned: true,
        receiptHash: receipt.receipt.meta.receiptHash,
        receiptPath: receipt.receipt.meta.receiptPath,
      },
      [path.join(versionedDir, 'registry-record.json')]));
    process.exit(0);
  }

  // 正常注册
  fs.mkdirSync(candidateDir, { recursive: true });

  // 复制源文件
  if (sourcePath && fs.existsSync(sourcePath)) {
    copyDirSync(sourcePath, candidateDir);
  }

  // 写注册记录
  const registryRecord = {
    name: candidateName,
    state: targetState,
    registeredAt: new Date().toISOString(),
    sourcePath,
    verifyReceiptHash,
    verifyReceiptPath,
    registryType: 'shadow',
    version: `0.1.0-${targetState}`,
    rejections: rejections.filter(r => r.warnOnly),
  };
  fs.writeFileSync(path.join(candidateDir, 'registry-record.json'), JSON.stringify(registryRecord, null, 2));

  // 写注册索引
  const index = loadJSON(path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json')) || { registrations: [] };
  index.registrations.push(registryRecord);
  fs.writeFileSync(path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json'), JSON.stringify(index, null, 2));

  const receipt = createReceipt({
    softill: 'meta-softill-register',
    operation: 'register',
    status: 'pass',
    input,
    output: {
      name: candidateName,
      state: targetState,
      registeredAt: candidateDir,
    },
    evidence: [path.join(candidateDir, 'registry-record.json'), path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json')],
    inputHash: input.inputHash || null,
  });

  console.log(softillResult('meta-softill-register', 'pass',
    `候选 ${candidateName} 已注册为 ${targetState}`,
    {
      name: candidateName,
      state: targetState,
      registeredAt: candidateDir,
      receiptHash: receipt.receipt.meta.receiptHash,
      receiptPath: receipt.receipt.meta.receiptPath,
    },
    [path.join(candidateDir, 'registry-record.json'), path.join(SHADOW_REGISTRY_DIR, 'shadow-index.json')]));
  process.exit(0);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (require.main === module) main();
