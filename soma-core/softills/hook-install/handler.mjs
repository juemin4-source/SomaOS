#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * hook-install — handler.js
 *
 * Install hook files into host configuration.
 * Registers hook path to event in settings.json, generates diff,
 * verifies config is parseable after install. Creates backup before modifying.
 * 级别: L3_write (corrected from auto-detected L0_read_probe)
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */


import fs from 'fs';

import path from 'path';

const SUPPORTED_HOOKS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'PreCompact'];

function handle(input) {
  if (!input || !input.hookType) return { error: 'hookType is required', valid: false };
  if (!SUPPORTED_HOOKS.includes(input.hookType)) return { error: 'Unsupported hook type: ' + input.hookType, valid: false };

  const hookType = input.hookType;
  const hookPath = input.hookPath ? path.resolve(input.hookPath) : null;
  const configPath = input.configPath ? path.resolve(input.configPath) : path.join(process.cwd(), '.claude', 'settings.json');

  if (hookPath && !fs.existsSync(hookPath)) return { error: 'Hook file not found: ' + hookPath, valid: false };

  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  let config = {};
  let originalContent = '';
  let configExisted = false;

  if (fs.existsSync(configPath)) {
    configExisted = true;
    originalContent = fs.readFileSync(configPath, 'utf-8');
    try { config = JSON.parse(originalContent); }
    catch (e) { return { error: 'Config parse error: ' + e.message, valid: false }; }
  }

  const backupPath = configExisted ? configPath + '.backup.' + Date.now() : null;
  if (backupPath) fs.writeFileSync(backupPath, originalContent, 'utf-8');

  if (!config.hooks) config.hooks = {};
  const previousValue = config.hooks[hookType] || null;
  if (!config.hooks[hookType] || input.force) config.hooks[hookType] = hookPath || ('./.claude/hooks/' + hookType + '.js');

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  let verified = false;
  try {
    const reread = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    verified = reread.hooks && reread.hooks[hookType] !== undefined;
  } catch {
    if (backupPath && fs.existsSync(backupPath)) fs.writeFileSync(configPath, originalContent, 'utf-8');
    return { error: 'Config verification failed — restored backup', valid: false };
  }

  const newContent = JSON.stringify(config, null, 2) + '\n';
  const diff = generateDiff(originalContent, newContent, configPath);

  return { hookType, configPath, backupPath, previousValue, currentValue: config.hooks[hookType], verified, diff, valid: true };
}

function generateDiff(oldStr, newStr, filePath) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const changes = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) changes.push({ line: i + 1, old: oldLines[i] || null, new: newLines[i] || null });
  }
  return { file: filePath, changes, changeCount: changes.length };
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
    return fail('Input required: provide { hookType, hookPath?, configPath? }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    if (!result.valid) {
      console.log(JSON.stringify({ softill: 'hook-install', result: 'FAILED', summary: result.error, data: result, evidence: [], meta: { name: 'hook-install', level: 'L3_write', v: '0.3.0' } }, null, 2));
      process.exit(1);
      return;
    }
    const summary = 'Installed ' + result.hookType + ' hook' + (result.backupPath ? ' (backup: ' + result.backupPath + ')' : '');
    const evidence = [result.configPath];
    if (result.backupPath) evidence.push(result.backupPath);
    console.log(JSON.stringify({ softill: 'hook-install', result: 'PASS', summary, data: result, evidence, meta: { name: 'hook-install', level: 'L3_write', v: '0.3.0' } }, null, 2));
    process.exit(0);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'hook-install', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

export default { handle, SUPPORTED_HOOKS };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();