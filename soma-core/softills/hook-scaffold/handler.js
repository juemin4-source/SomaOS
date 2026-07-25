#!/usr/bin/env node
/**
 * hook-scaffold — handler.js
 *
 * Scaffold hook files for any of 6 host event types.
 * Generates standard skeleton with input/output signatures, error handling,
 * trace hooks, and isolation-compliant header (no business logic).
 * 级别: L5_generate
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED_HOOKS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'PreCompact',
];

const HOOK_SIGNATURES = {
  UserPromptSubmit: { input: '{ prompt, contextSize, mode }', output: '{ sessionId, taskType, complexity }' },
  PreToolUse: { input: '{ toolName, args, sessionState }', output: '{ operation, target, context }' },
  PostToolUse: { input: '{ toolName, result, duration }', output: '{ operation, status, summary }' },
  PostToolUseFailure: { input: '{ toolName, error, code }', output: '{ operation, errorType, recoverable }' },
  Stop: { input: '{ reason, contextState }', output: '{ reason, finalState }' },
  PreCompact: { input: '{ contextSize, threshold }', output: '{ size, urgency, priority }' },
};

function handle(input) {
  if (!input || !input.hookType) {
    return { error: 'hookType is required', valid: false };
  }

  const hookType = input.hookType;
  if (!SUPPORTED_HOOKS.includes(hookType)) {
    return { error: `Unsupported hook type: ${hookType}. Supported: ${SUPPORTED_HOOKS.join(', ')}`, valid: false };
  }

  const targetDir = input.targetDir ? path.resolve(input.targetDir) : path.join(process.cwd(), '.claude', 'hooks');
  const hookFileName = `${hookType}.js`;
  const hookFilePath = path.join(targetDir, hookFileName);
  const content = generateHookContent(hookType);

  const result = { hookType, hookFileName, hookFilePath, content, signature: HOOK_SIGNATURES[hookType], valid: true };

  if (input.write !== false) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(hookFilePath, content, 'utf-8');
    result.written = true;
    result.targetDir = targetDir;
  }

  return result;
}

function generateHookContent(hookType) {
  const sig = HOOK_SIGNATURES[hookType];
  const adapterEventName = getAdapterEventName(hookType);

  return `/**
 * ${hookType} — Host Hook
 *
 * HOST EVENT: ${hookType}
 * ADAPTER EVENT: ${adapterEventName}
 *
 * THIS FILE IS A HOST ADAPTER.
 * It does NOT contain business logic, Combo references, or Registry queries.
 * It adapts the host event into a generic format for Soma Core.
 *
 * Input:  ${sig.input}
 * Output: ${sig.output}
 */

async function handle${hookType}(input) {
  try {
    const adapted = {
      eventId: '${adapterEventName}',
      timestamp: new Date().toISOString(),
      payload: mapPayload(input),
      source: '${hookType}',
    };
    return adapted;
  } catch (error) {
    return {
      eventId: '${adapterEventName}',
      timestamp: new Date().toISOString(),
      payload: { error: error.message },
      source: '${hookType}',
      status: 'ERROR',
    };
  }
}

function mapPayload(input) {
  if (!input || typeof input !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (value === null || value === undefined) {
      sanitized[key] = null;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 10);
    } else if (typeof value === 'object') {
      sanitized[key] = { ...value };
    }
  }
  return sanitized;
}

module.exports = { handle${hookType} };

if (require.main === module) {
  (async () => {
    const testInput = process.argv[2] ? JSON.parse(process.argv[2]) : { test: true };
    const result = await handle${hookType}(testInput);
    console.log(JSON.stringify(result, null, 2));
  })();
}
`;
}

function getAdapterEventName(hookType) {
  const map = {
    UserPromptSubmit: 'session_start',
    PreToolUse: 'tool_preamble',
    PostToolUse: 'tool_result',
    PostToolUseFailure: 'tool_error',
    Stop: 'session_stop',
    PreCompact: 'context_before_trim',
  };
  return map[hookType] || 'unknown_event';
}

// ═════════════════════════════════════════════════════
// CLI 入口
// ═════════════════════════════════════════════════════

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
    return fail('Input required: provide { hookType, targetDir? }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    if (!result.valid) {
      console.log(JSON.stringify({ softill: 'hook-scaffold', result: 'FAILED', summary: result.error, data: result, evidence: [], meta: { name: 'hook-scaffold', level: 'L5_generate', v: '0.3.0' } }, null, 2));
      process.exit(1);
      return;
    }
    const summary = result.written ? 'Created ' + result.hookFileName + ' at ' + result.targetDir : 'Generated ' + result.hookFileName + ' (dry run)';
    console.log(JSON.stringify({ softill: 'hook-scaffold', result: 'PASS', summary, data: result, evidence: result.written ? [result.hookFilePath] : [], meta: { name: 'hook-scaffold', level: 'L5_generate', v: '0.3.0' } }, null, 2));
    process.exit(0);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'hook-scaffold', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle, SUPPORTED_HOOKS, HOOK_SIGNATURES, getAdapterEventName };

if (require.main === module) main();
