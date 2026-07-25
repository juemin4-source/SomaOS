#!/usr/bin/env node
/**
 * llm-call — handler.js
 *
 * llm-call — softill
 * 级别: L0_read_probe
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

function handle(input, context) {
  return { detected: Object.keys(input || {}), input };
  
  
  
  
}

// ═════════════════════════════════════════════════════
// CLI 入口
// ═════════════════════════════════════════════════════

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return fail(`Read fail: ${e.message}`); }
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail(`Parse error: ${e.message}`); }
    });
    return;
  } else {
    input = { input: process.argv[2] || '' };
  }
  run(input);
}

function run(input) {
  const result = handle(input, {});
  const ev = result.evidence || [];
  console.log(JSON.stringify({ softill: 'llm-call', result: 'PASS', summary: 'ok', data: result, evidence: ev, meta: { name: 'llm-call', level: 'L0_read_probe', v: '0.2.0' } }, null, 2));
  process.exit(0);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'llm-call', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
