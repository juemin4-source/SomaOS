#!/usr/bin/env node

/**
 * context-extractor — handler.js
 *
 * 从目标文件中提取最小必要上下文，避免 AI / agent 反复读取完整文件。
 *
 * 用法：
 *   node handler.js <input-json-path>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');
const { fingerprintSync } = require('./src/file-fingerprint');
const { extract } = require('./src/extract-context');
const { formatJson, formatMarkdown } = require('./src/format-output');

function main() {
  let input;

  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }
  } else {
    let data = '';
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => {
      try { input = JSON.parse(data); handle(input); }
      catch (e) { console.error('Invalid JSON on stdin'); process.exit(1); }
    });
    return;
  }

  handle(input);
}

function handle(input) {
  const filePath = path.resolve(input.file);
  const anchors = input.anchors || [];
  const radius = input.radius || 80;
  const format = input.format || 'json';

  // 校验：必须是文件
  if (!fs.existsSync(filePath)) {
    const err = { error: `File not found: ${filePath}` };
    console.log(JSON.stringify(err, null, 2));
    process.exit(1);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    const err = { error: `Not a file: ${filePath}` };
    console.log(JSON.stringify(err, null, 2));
    process.exit(1);
  }

  // 读取文件
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fp = fingerprintSync(filePath);

  // 提取上下文
  const { slices, missing } = extract(lines, anchors, radius);

  const result = {
    file: filePath,
    fingerprint: fp,
    lineCount: lines.length,
    slices,
    missingAnchors: missing,
    summary: `Extracted ${slices.length} slice(s) from ${path.basename(filePath)}.`,
  };

  // 输出
  if (format === 'markdown') {
    console.log(formatMarkdown(result));
  } else {
    console.log(JSON.stringify(Object.assign({softill:"context-extractor"}, result), null, 2));
  }

  process.exit(missing.length > 0 ? 1 : 0);
}

if (require.main === module) main();
module.exports = { handle };
