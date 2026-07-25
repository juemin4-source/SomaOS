#!/usr/bin/env node
/**
 * meta-softill-forge — handler.js
 *
 * 执行权（Workshop）：将准备好的模板文件受控落盘到 workspace。
 * 核心约束：不调用 LLM 生成代码，只落盘已有内容。
 * 每个文件必须计算 contentHash 以形成证据链。
 *
 * 使用: node handler.js <input.json>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createReceipt, sha256, loadJSON, readJSONFromFile, softillResult } = require('../_shared/receipt-utils.js');

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
  console.log(softillResult('meta-softill-forge', 'error', `${type}: ${msg}`, {}, []));
  process.exit(1);
}

function handle(input) {
  const files = input.files || [];
  const outputDir = input.outputDir ? path.resolve(input.outputDir) : path.resolve(__dirname, '..', '..', 'workspace');
  const sourceBlueprint = input.sourceBlueprint || null;
  const blueprintContent = input.blueprintContent || null;

  // 验证至少有一个文件要写
  if (files.length === 0) {
    const receipt = createReceipt({
      softill: 'meta-softill-forge',
      operation: 'forge',
      status: 'error',
      input,
      output: { error: '没有文件需要写入' },
      evidence: [],
    });
    console.log(softillResult('meta-softill-forge', 'error', '没有文件需要写入', { receiptHash: receipt.receipt.meta.receiptHash }, []));
    process.exit(0);
  }

  // 验证 files 结构
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.path || f.content === undefined) {
      const receipt = createReceipt({
        softill: 'meta-softill-forge',
        operation: 'forge',
        status: 'error',
        input,
        output: { error: `files[${i}] 缺少 path 或 content`, file: f },
        evidence: [],
      });
      console.log(softillResult('meta-softill-forge', 'error', `files[${i}] 缺少 path 或 content`, { receiptHash: receipt.receipt.meta.receiptHash }, []));
      process.exit(0);
    }
  }

  // 确保输出目录存在
  fs.mkdirSync(outputDir, { recursive: true });

  // 写文件并计算 hash
  const written = [];
  const allContents = [];

  for (const f of files) {
    const targetPath = path.resolve(outputDir, f.path);

    // 确保目标路径在 outputDir 内（路径穿越防护）
    if (!targetPath.startsWith(outputDir + path.sep) && targetPath !== outputDir) {
      written.push({
        path: f.path,
        status: 'skipped',
        reason: 'PATH_TRAVERSAL',
        detail: `路径 ${targetPath} 不在 outputDir ${outputDir} 内`,
      });
      continue;
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, f.content);

    const contentHash = crypto.createHash('sha256').update(f.content, 'utf-8').digest('hex');
    const stat = fs.statSync(targetPath);

    written.push({
      path: f.path,
      fullPath: targetPath,
      size: stat.size,
      contentHash,
      status: 'written',
    });

    allContents.push(f.content);
  }

  // 计算 blueprintHash
  const fullPayload = JSON.stringify({ files: files.map(f => ({ path: f.path, contentHash: crypto.createHash('sha256').update(f.content).digest('hex') })), sourceBlueprint });
  const blueprintHash = sha256(fullPayload);

  // 证据: 写入清单
  const evidenceDir = path.resolve(__dirname, '..', '..', 'receipts', 'evidence');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, `forge-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify({
    blueprintHash,
    sourceBlueprint,
    outputDir,
    written,
    timestamp: new Date().toISOString(),
  }, null, 2));

  const receipt = createReceipt({
    softill: 'meta-softill-forge',
    operation: 'forge',
    status: 'pass',
    input,
    output: {
      written: written.map(w => ({ path: w.path, size: w.size, contentHash: w.contentHash })),
      blueprintHash,
      outputDir,
      fileCount: written.filter(w => w.status === 'written').length,
    },
    evidence: [evidenceFile],
    inputHash: input.inputHash || null,
  });

  console.log(softillResult('meta-softill-forge', 'pass',
    `锻造完成: ${written.filter(w => w.status === 'written').length}/${files.length} 文件写入`,
    {
      written: written.map(w => ({ path: w.path, size: w.size, contentHash: w.contentHash })),
      blueprintHash,
      outputDir,
      receiptHash: receipt.receipt.meta.receiptHash,
      receiptPath: receipt.receipt.meta.receiptPath,
    },
    [evidenceFile]));
  process.exit(0);
}

if (require.main === module) main();
