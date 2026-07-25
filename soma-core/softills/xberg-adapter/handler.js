#!/usr/bin/env node
/**
 * xberg-adapter — handler.js
 *
 * 文档提取引擎：96 种格式（PDF/Office/图片/邮件 → Markdown/JSON/Text）。
 * Rust 写的 xberg CLI 封装。
 *
 * 输入: { file, format: "markdown"|"json"|"text" }
 * 输出: { content, metadata, format }
 *
 * 依赖: cargo install xberg
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const file = input.file || input.path;
  const format = input.format || 'markdown';
  if (!file) return out('ERROR', 'file required');
  const fp = path.resolve(file);
  if (!fs.existsSync(fp)) return out('ERROR', 'File not found: ' + fp);

  // Check/install
  let ready = false;
  try { execSync('xberg --version 2>&1', { stdio: 'pipe', timeout: 3000 }); ready = true; }
  catch { try { execSync('cargo install xberg 2>&1', { stdio: 'pipe', timeout: 120000 }); ready = true; } catch {} }
  if (!ready) return out('ERROR', 'xberg not available and install failed');

  try {
    const outFmt = { markdown: '--markdown', json: '--json', text: '--text' }[format] || '--markdown';
    const raw = execSync(`xberg "${fp}" ${outFmt}`, { encoding: 'utf-8', timeout: 30000, maxBuffer: 20 * 1024 * 1024 }).trim();
    const lines = raw.split('\n').length;
    return out('PASS', `Extracted ${lines} lines (${format})`, { content: raw.slice(0, 5000), format, file: input.file, length: raw.length, truncated: raw.length > 5000 });
  } catch (e) {
    return out('ERROR', e.message.slice(0, 200));
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'xberg-adapter', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
