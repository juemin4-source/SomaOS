#!/usr/bin/env node
/**
 * host-config-patch — handler.js
 *
 * Patch host configuration files with backup.
 * Applies JSON Patch operations, generates diff, verifies config is
 * parseable after patch, provides rollback path.
 * 级别: L3_write
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

function handle(input) {
  if (!input || !input.patches || !Array.isArray(input.patches)) {
    return { error: 'patches array is required', valid: false };
  }

  const configPath = input.configPath ? path.resolve(input.configPath) : path.join(process.cwd(), '.claude', 'settings.json');
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Read current config
  let config = {};
  let originalContent = '';
  let configExisted = false;

  if (fs.existsSync(configPath)) {
    configExisted = true;
    originalContent = fs.readFileSync(configPath, 'utf-8');
    try {
      config = JSON.parse(originalContent);
    } catch (e) {
      return { error: 'Config parse error: ' + e.message, valid: false };
    }
  }

  // Create backup
  const backupPath = (input.backup !== false && configExisted) ? configPath + '.backup.' + Date.now() : null;
  if (backupPath) {
    fs.writeFileSync(backupPath, originalContent, 'utf-8');
  }

  // Apply patches
  const appliedPatches = [];
  for (let i = 0; i < input.patches.length; i++) {
    const patch = input.patches[i];
    try {
      const result = applyPatch(config, patch);
      appliedPatches.push({ index: i, path: patch.path, op: patch.op || 'add', success: true });
      if (result.changed) config = result.config;
    } catch (e) {
      appliedPatches.push({ index: i, path: patch.path, op: patch.op || 'add', success: false, error: e.message });
      // Roll back on error
      if (backupPath && fs.existsSync(backupPath)) {
        fs.writeFileSync(configPath, originalContent, 'utf-8');
      }
      return { error: 'Patch ' + i + ' failed: ' + e.message + ' — rolled back', valid: false, appliedPatches };
    }
  }

  // Write patched config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  // Verify parseable
  let verified = false;
  try {
    JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    verified = true;
  } catch {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.writeFileSync(configPath, originalContent, 'utf-8');
    }
    return { error: 'Config verification failed — restored backup', valid: false, appliedPatches };
  }

  // Generate diff
  const newContent = JSON.stringify(config, null, 2) + '\n';
  const diff = generateDiff(originalContent, newContent, configPath);

  return {
    configPath,
    backupPath,
    patchesApplied: appliedPatches.filter(p => p.success).length,
    patchesTotal: input.patches.length,
    verified,
    diff,
    valid: true,
  };
}

function applyPatch(config, patch) {
  const pathParts = (patch.path || '').split('/').filter(Boolean);
  const op = patch.op || 'add';
  const value = patch.value;

  if (pathParts.length === 0) {
    if (op === 'replace') {
      return { config: value, changed: true };
    }
    return { config, changed: false };
  }

  let current = config;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  const lastKey = pathParts[pathParts.length - 1];

  if (op === 'add' || op === 'replace') {
    current[lastKey] = value;
  } else if (op === 'remove') {
    delete current[lastKey];
  } else if (op === 'merge') {
    if (typeof current[lastKey] === 'object' && typeof value === 'object') {
      Object.assign(current[lastKey], value);
    } else {
      current[lastKey] = value;
    }
  }

  return { config, changed: true };
}

function generateDiff(oldStr, newStr, filePath) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const changes = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes.push({ line: i + 1, old: oldLines[i] || null, new: newLines[i] || null });
    }
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
    return fail('Input required: provide { patches: [...], configPath? }');
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    if (!result.valid) {
      console.log(JSON.stringify({ softill: 'host-config-patch', result: 'FAILED', summary: result.error, data: result, evidence: [], meta: { name: 'host-config-patch', level: 'L3_write', v: '0.3.0' } }, null, 2));
      process.exit(1);
      return;
    }
    const summary = 'Patched ' + result.configPath + ' (' + result.patchesApplied + '/' + result.patchesTotal + ' patches)' +
      (result.backupPath ? ' [backup: ' + result.backupPath + ']' : '');
    const evidence = [result.configPath];
    if (result.backupPath) evidence.push(result.backupPath);

    console.log(JSON.stringify({ softill: 'host-config-patch', result: 'PASS', summary, data: result, evidence, meta: { name: 'host-config-patch', level: 'L3_write', v: '0.3.0' } }, null, 2));
    process.exit(0);
  } catch (e) {
    fail('Handler error: ' + e.message);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'host-config-patch', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
