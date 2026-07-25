#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * meta-softill-scaffold — handler.js
 *
 * 骨架权（Hand）：从模板生成新的 Softill 目录骨架。
 * 不覆盖已有目录，不调用 LLM。
 *
 * 使用: node handler.js <input.json>
 * 或从 stdin 读取 JSON
 */


import fs from 'fs';

import path from 'path';

import { createReceipt, sha256, loadJSON, readJSONFromFile, softillResult } from '../_shared/receipt-utils.js.js';

const TEMPLATES = {
  eye: {
    'handler.js': `#!/usr/bin/env node
/**
 * <NAME> — handler.js
 * [Eye] 观察类 Softill
 */


import fs from 'fs';

import path from 'path';

function main() { parseInput(handle); }
function parseInput(cb) {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
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
function exitError(type, msg) { console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'error', summary: type + ': ' + msg, data: {}, evidence: [] })); process.exit(1); }
function handle(input) {
  // TODO: 实现观察逻辑
  console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'pass', summary: '<NAME> 执行完成', data: { observed: true }, evidence: [] }));
  process.exit(0);
}
`,
    'softill.json': JSON.stringify({
      name: '<NAME>',
      type: 'eye',
      maturity: 'L0',
      description: '<DESCRIPTION>',
      capabilities: ['eye'],
      handler: 'handler.js',
    }, null, 2) + '\n',
    'SKILL.md': `# <NAME>

## 类型
Eye — 观察类 Softill

## 职责
<DESCRIPTION>

## 输入
\`\`\`json
{
  "target": "<path>"
}
\`\`\`

## 输出
\`\`\`json
{
  "type": "softill_result",
  "softill": "<NAME>",
  "status": "pass | fail | error",
  "summary": "...",
  "data": {},
  "evidence": []
}
\`\`\`
`,
  },
  hand: {
    'handler.js': `#!/usr/bin/env node
/**
 * <NAME> — handler.js
 * [Hand] 执行类 Softill
 */


import fs from 'fs';

import path from 'path';

function main() { parseInput(handle); }
function parseInput(cb) {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
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
function exitError(type, msg) { console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'error', summary: type + ': ' + msg, data: {}, evidence: [] })); process.exit(1); }
function handle(input) {
  // TODO: 实现执行逻辑
  console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'pass', summary: '<NAME> 执行完成', data: { executed: true }, evidence: [] }));
  process.exit(0);
}
`,
    'softill.json': JSON.stringify({
      name: '<NAME>',
      type: 'hand',
      maturity: 'L0',
      description: '<DESCRIPTION>',
      capabilities: ['tentacle'],
      handler: 'handler.js',
    }, null, 2) + '\n',
    'SKILL.md': `# <NAME>

## 类型
Hand — 执行类 Softill

## 职责
<DESCRIPTION>

## 输入
\`\`\`json
{
  "action": "...",
  "params": {}
}
\`\`\`

## 输出
\`\`\`json
{
  "type": "softill_result",
  "softill": "<NAME>",
  "status": "pass | fail | error",
  "summary": "...",
  "data": {},
  "evidence": []
}
\`\`\`
`,
  },
  gate: {
    'handler.js': `#!/usr/bin/env node
/**
 * <NAME> — handler.js
 * [Gate] 验证类 Softill
 */


import fs from 'fs';

import path from 'path';

function main() { parseInput(handle); }
function parseInput(cb) {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
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
function exitError(type, msg) { console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'error', summary: type + ': ' + msg, data: {}, evidence: [] })); process.exit(1); }
function handle(input) {
  const checks = [];
  // TODO: 实现验证检查
  const allPassed = checks.every(c => c.pass);
  console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: allPassed ? 'pass' : 'fail', summary: allPassed ? '所有检查通过' : '部分检查失败', data: { checks, passed: checks.filter(c => c.pass).length, total: checks.length }, evidence: [] }));
  process.exit(allPassed ? 0 : 1);
}
`,
    'softill.json': JSON.stringify({
      name: '<NAME>',
      type: 'gate',
      maturity: 'L0',
      description: '<DESCRIPTION>',
      capabilities: ['judge'],
      handler: 'handler.js',
    }, null, 2) + '\n',
    'SKILL.md': `# <NAME>

## 类型
Gate — 验证类 Softill

## 职责
<DESCRIPTION>

## 输入
\`\`\`json
{
  "candidatePath": "<path>",
  "contract": {}
}
\`\`\`

## 输出
\`\`\`json
{
  "type": "softill_result",
  "softill": "<NAME>",
  "status": "pass | fail | error",
  "summary": "...",
  "data": {
    "checks": [],
    "passed": 0,
    "total": 0
  },
  "evidence": []
}
\`\`\`
`,
  },
  workshop: {
    'handler.js': `#!/usr/bin/env node
/**
 * <NAME> — handler.js
 * [Workshop] 生产类 Softill — 只做受控落盘，不调 LLM
 */


import fs from 'fs';

import path from 'path';

import crypto from 'crypto';

function main() { parseInput(handle); }
function parseInput(cb) {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
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
function exitError(type, msg) { console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'error', summary: type + ': ' + msg, data: {}, evidence: [] })); process.exit(1); }
function handle(input) {
  const files = input.files || [];
  const outputDir = input.outputDir || path.resolve(__dirname, 'output');
  const written = [];

  for (const f of files) {
    const targetPath = path.resolve(outputDir, f.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, f.content);
    const hash = crypto.createHash('sha256').update(f.content).digest('hex');
    written.push({ path: f.path, size: f.content.length, contentHash: hash });
  }

  console.log(JSON.stringify({ type: 'softill_result', softill: '<NAME>', status: 'pass', summary: '锻造完成: ' + written.length + ' 文件', data: { written, outputDir }, evidence: [] }));
  process.exit(0);
}
`,
    'softill.json': JSON.stringify({
      name: '<NAME>',
      type: 'workshop',
      maturity: 'L0',
      description: '<DESCRIPTION>',
      capabilities: ['workshop'],
      handler: 'handler.js',
    }, null, 2) + '\n',
    'SKILL.md': `# <NAME>

## 类型
Workshop — 生产类 Softill

## 职责
<DESCRIPTION>

## 约束
不调用 LLM 生成代码，只做受控落盘

## 输入
\`\`\`json
{
  "files": [{ "path": "...", "content": "..." }],
  "outputDir": "<path>"
}
\`\`\`

## 输出
\`\`\`json
{
  "type": "softill_result",
  "softill": "<NAME>",
  "status": "pass | fail | error",
  "summary": "...",
  "data": {
    "written": [{ "path": "...", "size": 0, "contentHash": "sha256" }],
    "outputDir": "..."
  },
  "evidence": []
}
\`\`\`
`,
  },
};

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
  console.log(softillResult('meta-softill-scaffold', 'error', `${type}: ${msg}`, {}, []));
  process.exit(1);
}

function handle(input) {
  const name = input.name;
  const softillType = input.type || 'eye';
  const description = input.description || `${name} Softill`;
  const outputDir = input.outputDir ? path.resolve(input.outputDir) : path.resolve(__dirname, '..', '..', 'workspace', name);

  // 参数验证
  if (!name) {
    const receipt = createReceipt({
      softill: 'meta-softill-scaffold',
      operation: 'scaffold',
      status: 'error',
      input,
      output: { error: '缺少 name 参数' },
      evidence: [],
    });
    console.log(softillResult('meta-softill-scaffold', 'error', '缺少 name 参数', { receiptHash: receipt.receipt.meta.receiptHash }, []));
    process.exit(0);
  }

  if (!TEMPLATES[softillType]) {
    const receipt = createReceipt({
      softill: 'meta-softill-scaffold',
      operation: 'scaffold',
      status: 'error',
      input,
      output: { error: `不支持的 Softill 类型: ${softillType}`, supportedTypes: Object.keys(TEMPLATES) },
      evidence: [],
    });
    console.log(softillResult('meta-softill-scaffold', 'error', `不支持的 Softill 类型: ${softillType}`, { receiptHash: receipt.receipt.meta.receiptHash, supportedTypes: Object.keys(TEMPLATES) }, []));
    process.exit(0);
  }

  // 不覆盖已有目录 — 防幻觉保护
  if (fs.existsSync(outputDir)) {
    const receipt = createReceipt({
      softill: 'meta-softill-scaffold',
      operation: 'scaffold',
      status: 'fail',
      input,
      output: { error: '输出目录已存在', outputDir },
      evidence: [],
    });
    console.log(softillResult('meta-softill-scaffold', 'fail',
      `目录已存在，不覆盖: ${outputDir}`,
      { receiptHash: receipt.receipt.meta.receiptHash, outputDir },
      []));
    process.exit(0);
  }

  // 创建目录
  fs.mkdirSync(outputDir, { recursive: true });

  // 根据类型生成模板文件
  const template = TEMPLATES[softillType];
  const created = [];

  for (const [filename, content] of Object.entries(template)) {
    const filePath = path.join(outputDir, filename);
    const filled = content.replace(/<NAME>/g, name).replace(/<DESCRIPTION>/g, description);
    fs.writeFileSync(filePath, filled);

    const contentHash = sha256(filled);
    created.push({ path: filename, contentHash });
  }

  // 证据: 记录创建的文件结构
  const evidenceDir = path.resolve(__dirname, '..', '..', 'receipts', 'evidence');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, `scaffold-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify({ name, type: softillType, outputDir, created }, null, 2));

  const receipt = createReceipt({
    softill: 'meta-softill-scaffold',
    operation: 'scaffold',
    status: 'pass',
    input,
    output: {
      name,
      type: softillType,
      outputDir,
      created: created.map(c => c.path),
      fileCount: created.length,
    },
    evidence: [evidenceFile],
    inputHash: input.inputHash || null,
  });

  console.log(softillResult('meta-softill-scaffold', 'pass',
    `骨架 ${name} (${softillType}) 已创建: ${created.length} 个文件`,
    {
      name,
      type: softillType,
      outputDir,
      created: created.map(c => c.path),
      receiptHash: receipt.receipt.meta.receiptHash,
      receiptPath: receipt.receipt.meta.receiptPath,
    },
    [evidenceFile]));
  process.exit(0);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();