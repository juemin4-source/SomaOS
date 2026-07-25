#!/usr/bin/env node
/**
 * build-eye — handler.js
 *
 * 构建编排器。跑编译、抓错误、分析、报告。
 *
 * 用法: node handler.js <input-json>
 * 输入: { command, cwd, timeout?, mode: "cargo"|"npm"|"tauri"|"auto" }
 * 输出: { result, errors, warnings, duration, summary }
 */

const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const cmd = input.command || '';
  const cwd = path.resolve(input.cwd || process.cwd());
  const timeout = input.timeout || 300000;
  const mode = input.mode || 'auto';

  let buildCmd = cmd;
  if (!buildCmd) {
    if (mode === 'cargo') buildCmd = 'cargo build 2>&1';
    else if (mode === 'tauri') buildCmd = 'npx tauri build 2>&1';
    else if (mode === 'npm') buildCmd = 'npm run build 2>&1';
    else return out('ERROR', 'command or mode required');
  }

  const start = Date.now();
  let stdout = '';

  try {
    stdout = execSync(buildCmd, { cwd, encoding: 'utf-8', timeout, maxBuffer: 50 * 1024 * 1024, stdio: 'pipe' });
  } catch (e) {
    stdout = e.stdout || '';
    const stderr = e.stderr || '';
    if (stderr && !stdout.includes(stderr.slice(0, 100))) stdout += '\n' + stderr;
  }

  const duration = Date.now() - start;
  const lines = stdout.split('\n');

  // Parse errors
  const errors = []; const warnings = [];
  let currentError = null;

  for (const line of lines) {
    // Rust: error[E0000]: message
    const rustErr = line.match(/^error\[(\w+)\]:\s*(.+)/);
    if (rustErr) { errors.push({ code: rustErr[1], message: rustErr[2].slice(0, 200), context: line }); continue; }

    // Rust: error: message
    const rustErr2 = line.match(/^error:\s*(.+)/);
    if (rustErr2 && !line.includes('could not compile')) { errors.push({ code: 'generic', message: rustErr2[1].slice(0, 200), context: line }); continue; }

    // Rust: warning: message
    const rustWarn = line.match(/^warning:\s*(.+)/);
    if (rustWarn) { warnings.push({ message: rustWarn[1].slice(0, 200), context: line }); continue; }

    // npm ERR!
    if (line.includes('npm ERR!') && !line.includes('code')) {
      errors.push({ code: 'npm', message: line.replace('npm ERR!', '').trim().slice(0, 200), context: line });
    }

    // Failed to run / error: failed
    if (line.match(/error:\sfailed\sto/) || line.match(/^failed\s+to\s+build/)) {
      errors.push({ code: 'build', message: line.slice(0, 200), context: line });
    }

    // File:line:col: error/message (from TypeScript/JS)
    const tsErr = line.match(/^(.+)\((\d+),\d+\):\s+(error|warning)\s+(\w+)\s*:\s*(.+)/);
    if (tsErr) {
      const e = { file: tsErr[1], line: tsErr[2], code: tsErr[4], message: tsErr[5].slice(0, 200), context: line };
      if (tsErr[3] === 'error') errors.push(e); else warnings.push(e);
    }
  }

  const grouped = {};
  for (const e of errors) { grouped[e.code] = (grouped[e.code] || 0) + 1; }

  const success = errors.length === 0;
  const hasBinary = fs.existsSync(path.join(cwd, 'target', 'release'))
    || fs.existsSync(path.join(cwd, 'build'));

  // Find built binary
  let binaryPath = null;
  const searchPaths = [
    'target/release/somaos.exe', 'target/release/somaos',
    'target/debug/somaos.exe', 'target/debug/somaos',
  ];
  for (const sp of searchPaths) {
    const fp = path.join(cwd, sp);
    if (fs.existsSync(fp)) { binaryPath = fp; break; }
  }

  return out(success ? 'PASS' : 'FAIL',
    success
      ? `Build OK (${(duration / 1000).toFixed(0)}s)${binaryPath ? ' → ' + path.relative(cwd, binaryPath) : ''}`
      : `${errors.length} errors, ${warnings.length} warnings (${(duration / 1000).toFixed(0)}s)`,
    { success, duration: duration + 'ms', durationSec: (duration / 1000).toFixed(1),
      errors: errors.slice(0, 30), warnings: warnings.slice(0, 20),
      errorCount: errors.length, warningCount: warnings.length,
      groupedErrors: grouped, binaryPath,
      outputPreview: stdout.slice(0, 2000), outputTruncated: stdout.length > 2000,
    }
  );
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'build-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
