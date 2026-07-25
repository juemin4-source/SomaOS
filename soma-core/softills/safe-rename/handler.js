#!/usr/bin/env node

/**
 * safe-rename v0.1 — handler.js
 *
 * 批量重命名工具。模板语法抄自 RustRush-CLIKit。
 * 安全设计：dry-run 默认 + 冲突检测。
 *
 * 模板语法：
 *   {source}      原文件名（不含扩展名）
 *   {suffix}      扩展名（含点号）
 *   {prefix}      前缀（第一个点号前）
 *   {n}           序号 1-based
 *   {n:width=4}   序号补零
 *   {date}        YYYY-MM-DD
 *   {datetime}    YYYYMMDD-HHMMSS
 *   {rand:4}      随机数
 */

const fs = require('fs');
const path = require('path');

function parseTemplate(template, file, index) {
  const parsed = path.parse(file);
  const source = parsed.name;
  const suffix = parsed.ext;

  let result = template;
  result = result.replace(/\{n:width=(\d+)\}/g, (_, w) => String(index).padStart(+w, '0'));
  result = result.replace('{n}', String(index));
  result = result.replace('{source}', source);
  result = result.replace('{suffix}', suffix);
  result = result.replace('{prefix}', file.includes('.') ? file.split('.')[0] : source);
  result = result.replace('{date}', new Date().toISOString().slice(0, 10));
  result = result.replace('{datetime}', new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 15));
  result = result.replace('{rand:4}', String(Math.floor(1000 + Math.random() * 9000)));
  return result;
}

function scanFiles(targets, cwd) {
  const files = [];
  for (const t of targets) {
    if (t.includes('*') || t.includes('?')) {
      const re = new RegExp('^' + t.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      for (const f of fs.readdirSync(cwd)) {
        if (re.test(f) && fs.statSync(path.join(cwd, f)).isFile()) files.push(f);
      }
    } else {
      const p = path.resolve(cwd, t);
      if (fs.existsSync(p)) files.push(t);
    }
  }
  return files;
}

function handle(input) {
  const targets = input.targets || [];
  const pattern = input.pattern || '{source}{suffix}';
  const dryRun = input.dryRun !== false;
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();

  if (!targets.length) return { result: 'error', data: { error: 'No targets' } };
  if (!fs.existsSync(cwd)) return { result: 'error', data: { error: `Not found: ${cwd}` } };

  const matched = scanFiles(targets, cwd);
  if (!matched.length) return { result: 'ok', data: { operations: [], message: 'No files matched' } };

  const ops = matched.map((f, i) => ({ from: f, to: parseTemplate(pattern, f, i + 1) }));
  const conflicts = ops.filter(o => o.from !== o.to && fs.existsSync(path.join(cwd, o.to)));

  if (dryRun) {
    return { result: conflicts.length ? 'warn' : 'ok', data: { dryRun: true, cwd, total: ops.length, operations: ops, conflicts } };
  }

  if (conflicts.length) return { result: 'fail', data: { error: `${conflicts.length} conflict(s)`, conflicts } };

  const done = [];
  for (const o of ops) {
    if (o.from === o.to) { done.push({ ...o, skipped: true }); continue; }
    try { fs.renameSync(path.join(cwd, o.from), path.join(cwd, o.to)); done.push({ ...o }); }
    catch (e) { done.push({ ...o, error: e.message }); }
  }

  const errors = done.filter(o => o.error);
  return { result: errors.length ? 'partial' : 'ok', data: { cwd, total: ops.length, operations: done } };
}

function main() {
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try { console.log(JSON.stringify(handle(JSON.parse(Buffer.concat(chunks).toString())))); }
    catch { console.log(JSON.stringify({ result: 'error', data: { error: 'Invalid JSON' } })); }
  });
}

if (require.main === module) main();
module.exports = { handle, parseTemplate, scanFiles };
