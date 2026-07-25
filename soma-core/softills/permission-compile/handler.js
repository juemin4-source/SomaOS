#!/usr/bin/env node
/**
 * permission-compile — handler.js
 *
 * Compile permission rules from Soma Core format to host config format.
 * Validates rule syntax, resolves conflicts, outputs structured permission set.
 * Does NOT write to config — pure compilation.
 * 级别: L1_transform
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED_OPERATIONS = ['read_file', 'write_file', 'shell_exec', 'network_request', 'screen_capture', 'file_search', 'content_search'];

function handle(input) {
  if (!input || !input.rules || !Array.isArray(input.rules)) {
    return { error: 'rules array is required', valid: false, compiled: [] };
  }

  const compiled = [];
  const conflicts = [];
  const errors = [];

  for (let i = 0; i < input.rules.length; i++) {
    const rule = input.rules[i];
    const result = compileRule(rule, i);
    if (result.error) {
      errors.push(result);
    } else {
      compiled.push(result);
    }
  }

  // Conflict detection: same operation with different allow values
  const byOp = {};
  for (const c of compiled) {
    if (!byOp[c.operation]) byOp[c.operation] = [];
    byOp[c.operation].push(c);
  }

  for (const [op, items] of Object.entries(byOp)) {
    const allows = new Set(items.map(i => i.allow));
    if (allows.size > 1) {
      conflicts.push({
        operation: op,
        message: 'Conflicting rules for ' + op + ': allow=' + [...allows].join(' and '),
        rules: items.map(i => i.id),
      });
    }
  }

  // Conflict resolution: explicit deny wins
  const resolved = [];
  const seen = new Set();
  for (const c of compiled) {
    const key = c.operation;
    if (!c.allow) {
      // Deny always wins — replace any previous allow
      const idx = resolved.findIndex(r => r.operation === key);
      if (idx >= 0) resolved[idx] = c;
      else resolved.push(c);
    } else if (!seen.has(key)) {
      resolved.push(c);
      seen.add(key);
    }
  }

  return {
    compiled: resolved,
    conflicts,
    errors,
    ruleCount: {
      input: input.rules.length,
      compiled: resolved.length,
      conflicts: conflicts.length,
      errors: errors.length,
    },
    valid: errors.length === 0,
  };
}

function compileRule(rule, index) {
  if (!rule || !rule.operation) {
    return { error: 'Rule at index ' + index + ' missing operation', index };
  }

  if (!SUPPORTED_OPERATIONS.includes(rule.operation)) {
    return { error: 'Unsupported operation: ' + rule.operation + ' at index ' + index, index };
  }

  const id = 'perm-' + index + '-' + rule.operation.replace(/_/g, '-');

  const compiled = {
    id,
    operation: rule.operation,
    allow: rule.allow !== false,
    source: 'rule:' + index,
  };

  if (rule.paths) compiled.constraint = { glob: rule.paths };
  if (rule.patterns) compiled.constraint = { pattern: rule.patterns.join('|') };
  if (rule.reason) compiled.reason = rule.reason;

  return compiled;
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
    return fail('Input required: provide { rules: [...] }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    const status = result.valid ? 'PASS' : 'FAILED';
    const rc = result.ruleCount || { compiled: 0, input: 0, conflicts: 0 };
    const summary = 'Compiled ' + rc.compiled + '/' + rc.input + ' rules' +
      (rc.conflicts > 0 ? ' (' + rc.conflicts + ' conflicts detected)' : '');

    console.log(JSON.stringify({ softill: 'permission-compile', result: status, summary, data: result, evidence: [], meta: { name: 'permission-compile', level: 'L1_transform', v: '0.3.0' } }, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'permission-compile', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle, SUPPORTED_OPERATIONS };

if (require.main === module) main();
