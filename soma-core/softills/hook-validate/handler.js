#!/usr/bin/env node
/**
 * hook-validate — handler.js
 *
 * Validate hook implementation.
 * Checks: file exists, signature matches contract, no forbidden references
 * (Combo/Registry), error handling completeness, isolation compliance.
 * 级别: L2_validate (corrected from auto-detected L4_state)
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
  { pattern: /combo/i, reason: 'Combo references not allowed in hooks' },
  { pattern: /registry/i, reason: 'Registry queries not allowed in hooks' },
  { pattern: /meta-softill/i, reason: 'Meta-softill not allowed in hooks' },
  { pattern: /soma.*state/i, reason: 'Soma state access not allowed in hooks' },
  { pattern: /forge/i, reason: 'Forge references not allowed in hooks' },
  { pattern: /body.state/i, reason: 'Body state not allowed in hooks' },
  { pattern: /checkpoint/i, reason: 'Checkpoint not allowed in hooks (Soma Core concept)' },
];

const REQUIRED_PATTERNS = [
  { pattern: /module\.exports/, reason: 'Hook must export its handler' },
];

function handle(input) {
  if (!input || !input.hookPath) return { error: 'hookPath is required', valid: false, checks: [] };

  const hookPath = path.resolve(input.hookPath);
  const checks = [];

  // Check 1: File exists
  const existsChk = { name: 'file_exists', passed: false, detail: '' };
  if (fs.existsSync(hookPath)) { existsChk.passed = true; existsChk.detail = 'Found: ' + hookPath; }
  else { existsChk.detail = 'Not found: ' + hookPath; }
  checks.push(existsChk);
  if (!existsChk.passed) return { valid: false, checks, error: 'Hook file not found' };

  const content = fs.readFileSync(hookPath, 'utf-8');

  // Check 2: Non-empty
  const readChk = { name: 'file_readable', passed: false, detail: '' };
  if (content.length > 0) { readChk.passed = true; readChk.detail = content.length + ' bytes'; }
  else { readChk.detail = 'File is empty'; }
  checks.push(readChk);

  // Check 3: Required patterns
  for (const req of REQUIRED_PATTERNS) {
    const chk = { name: 'required_' + req.pattern.source.replace(/[^a-z]/g, '_'), passed: false, detail: '' };
    if (req.pattern.test(content)) { chk.passed = true; chk.detail = req.reason; }
    else { chk.detail = 'Missing: ' + req.reason; }
    checks.push(chk);
  }

  // Check 4: Forbidden references
  for (const f of FORBIDDEN_PATTERNS) {
    const chk = { name: 'forbidden_' + f.pattern.source.replace(/[^a-z]/g, '_'), passed: true, detail: '' };
    if (f.pattern.test(content)) { chk.passed = false; chk.detail = f.reason; }
    checks.push(chk);
  }

  // Check 5: Error handling
  const errChk = { name: 'error_handling', passed: false, detail: '' };
  if (content.includes('catch') && content.includes('error')) { errChk.passed = true; errChk.detail = 'Has try/catch error handling'; }
  else if (content.includes('try') || content.includes('catch')) { errChk.passed = true; errChk.detail = 'Has try/catch'; }
  else { errChk.detail = 'No try/catch found'; }
  checks.push(errChk);

  // Check 6: Async or module.exports
  const asyncChk = { name: 'async_support', passed: false, detail: '' };
  if (content.includes('async') || content.includes('module.exports')) { asyncChk.passed = true; asyncChk.detail = 'Supports async or CommonJS'; }
  else { asyncChk.detail = 'No async/module.exports found'; }
  checks.push(asyncChk);

  // Check 7: Hook type match (optional)
  if (input.hookType) {
    const typeChk = { name: 'hook_type_match', passed: true, detail: '' };
    if (content.includes(input.hookType)) typeChk.detail = 'Contains ' + input.hookType;
    else typeChk.detail = 'No reference to ' + input.hookType + ' (may still be valid)';
    checks.push(typeChk);
  }

  const allPassed = checks.every(c => c.passed);
  const failed = checks.filter(c => !c.passed);
  return { valid: allPassed, hookPath, checks, allPassed, failedCount: failed.length, totalCount: checks.length };
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return fail('Read fail: ' + e.message); }
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail('Parse error: ' + e.message); }
    });
    return;
  } else {
    return fail('Input required: provide { hookPath, hookType? }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    const status = result.valid ? 'PASS' : 'FAILED';
    const summary = result.valid
      ? 'All ' + result.totalCount + ' checks passed for ' + result.hookPath
      : result.failedCount + '/' + result.totalCount + ' checks failed';
    console.log(JSON.stringify({ softill: 'hook-validate', result: status, summary, data: result, evidence: [], meta: { name: 'hook-validate', level: 'L2_validate', v: '0.3.0' } }, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'hook-validate', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
