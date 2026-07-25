#!/usr/bin/env node
/**
 * host-probe — handler.js
 *
 * Probe host environment capabilities.
 * Detects Claude Code CLI/IDE/API, lists installed hooks, reports config locations,
 * enumerates available tools. Read-only — never modifies host state.
 * 级别: L0_read_probe (corrected from auto-detected L4_state)
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

const HOOK_NAMES = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'PreCompact'];

function handle(input) {
  const probeType = (input && input.probeType) || 'all';
  const hostRoot = input && input.hostRoot ? path.resolve(input.hostRoot) : null;

  const result = {};

  if (probeType === 'all' || probeType === 'hooks') {
    result.hooks = probeHooks(hostRoot);
  }
  if (probeType === 'all' || probeType === 'config') {
    result.config = probeConfig(hostRoot);
  }
  if (probeType === 'all' || probeType === 'tools') {
    result.tools = probeTools();
  }
  if (probeType === 'all' || probeType === 'environment') {
    result.environment = probeEnvironment(hostRoot);
  }

  if (probeType === 'all' || probeType === 'capabilities') {
    result.capabilities = probeHostCapabilities(hostRoot);
  }

  return result;
}

function probeHooks(hostRoot) {
  const hooks = {};
  for (const name of HOOK_NAMES) {
    const hookPath = findHookPath(name, hostRoot);
    hooks[name] = {
      installed: !!hookPath,
      path: hookPath || null,
    };
    if (hookPath && fs.existsSync(hookPath)) {
      try {
        const content = fs.readFileSync(hookPath, 'utf-8');
        hooks[name].size = content.length;
        hooks[name].valid = content.includes('module.exports') || content.includes('async function');
      } catch {
        hooks[name].valid = false;
      }
    }
  }
  return hooks;
}

function findHookPath(hookName, hostRoot) {
  const candidates = [];
  if (hostRoot) {
    candidates.push(path.join(hostRoot, '.claude', 'hooks', `${hookName}.js`));
    candidates.push(path.join(hostRoot, 'hooks', `${hookName}.js`));
  }
  // Common locations
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  if (homeDir) {
    candidates.push(path.join(homeDir, '.claude', 'hooks', `${hookName}.js`));
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function probeConfig(hostRoot) {
  const config = { files: [] };
  const searchPaths = [];

  if (hostRoot) {
    searchPaths.push(path.join(hostRoot, '.claude', 'settings.json'));
    searchPaths.push(path.join(hostRoot, '.claude', 'settings.local.json'));
  }
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  if (homeDir) {
    searchPaths.push(path.join(homeDir, '.claude', 'settings.json'));
    searchPaths.push(path.join(homeDir, '.claude', 'settings.local.json'));
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(content);
        config.files.push({
          path: p,
          exists: true,
          size: content.length,
          parseable: true,
          hooks: extractHookConfig(parsed),
        });
      } catch {
        config.files.push({ path: p, exists: true, parseable: false });
      }
    }
  }

  config.summary = `${config.files.length} config file(s) found`;
  return config;
}

function extractHookConfig(config) {
  if (!config || typeof config !== 'object') return [];
  // Search for hook references in settings
  const hooks = [];
  const knownHookPrefixes = HOOK_NAMES.map(n => n.toLowerCase().replace(/submit|use|failure|compact/g, m => m[0]));
  for (const [key, value] of Object.entries(config)) {
    // Generic hook pattern detection — use lowercase matching only
    const k = key.toLowerCase();
    for (const hookName of HOOK_NAMES) {
      const hk = hookName.toLowerCase();
      if (k.includes(hk) || hk.includes(k)) {
        hooks.push({ key, value: typeof value === 'string' ? value : JSON.stringify(value).slice(0, 100), hookType: hookName });
        break;
      }
    }
  }
  return hooks;
}

function probeTools() {
  return {
    detected: [],
    note: 'Tool enumeration depends on runtime context; tools are detected at call time',
  };
}

function probeEnvironment(hostRoot) {
  const env = {
    hostType: detectHostType(),
    platform: process.platform,
    nodeVersion: process.version,
  };
  if (hostRoot) {
    env.workDir = hostRoot;
  }
  return env;
}

function detectHostType() {
  // Detect if running inside Claude Code CLI
  const envKeys = Object.keys(process.env).map(k => k.toLowerCase());
  if (envKeys.some(k => k.includes('claude') && k.includes('code'))) return 'claude-code-cli';
  if (envKeys.some(k => k.includes('claude') && k.includes('desktop'))) return 'claude-desktop';
  if (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.toLowerCase().includes('vscode')) {
    if (envKeys.some(k => k.includes('claude'))) return 'claude-code-vscode';
  }
  return 'unknown';
}

function probeHostCapabilities(hostRoot) {
  const caps = {
    supportsHooks: true,
    supportsConfig: true,
    supportsPermissions: true,
  };
  if (hostRoot) {
    const claudeDir = path.join(hostRoot, '.claude');
    caps.hasClaudeDir = fs.existsSync(claudeDir);
    if (caps.hasClaudeDir) {
      const hasHooksDir = fs.existsSync(path.join(claudeDir, 'hooks'));
      const hasSettings = fs.existsSync(path.join(claudeDir, 'settings.json'));
      caps.hooksDirExists = hasHooksDir;
      caps.configExists = hasSettings;
    }
  }
  return caps;
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
    let bufLen = 0;
    process.stdin.on('data', c => { chunks.push(c); bufLen += c.length; });
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail(`Parse error: ${e.message}`); }
    });
    return;
  } else {
    input = { probeType: 'all' };
  }
  run(input);
}

function run(input) {
  try {
    const result = handle(input);
    const summaryLines = [];
    if (result.hooks) {
      const installed = Object.values(result.hooks).filter(h => h.installed).length;
      summaryLines.push(`${installed}/${Object.keys(result.hooks).length} hooks installed`);
    }
    if (result.config) {
      summaryLines.push(result.config.summary);
    }
    if (result.environment) {
      summaryLines.push(`host: ${result.environment.hostType}`);
    }
    const summary = summaryLines.length > 0 ? summaryLines.join('; ') : 'ok';
    console.log(JSON.stringify({
      softill: 'host-probe',
      result: 'PASS',
      summary,
      data: result,
      evidence: [],
      meta: { name: 'host-probe', level: 'L0_read_probe', v: '0.3.0' },
    }, null, 2));
    process.exit(0);
  } catch (e) {
    fail(`Handler error: ${e.message}`);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'host-probe', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
