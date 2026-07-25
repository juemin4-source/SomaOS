/**
 * utils.js — 元 Softill 共享工具
 *
 * 加载 registry / adapter registry / 格式化输出 / 路径常量
 */

const fs = require('fs');
const path = require('path');

// 07-verified-softills 是当前 softill 目录
const SOFTILLS_DIR = path.resolve(__dirname, '..', '..');
// Registry 权威位置在 combo-lab runtime
const REGISTRY_PATH = path.resolve('G:/AI/Claude-Workspace/Projects/somaos-combo-lab/.claude/runtime/softill-registry.json');

const LEVELS = {
  L0_read_probe:  { risk: 'none',  needsGuard: false, sim: 'sensory' },
  L1_transform:   { risk: 'none',  needsGuard: false, sim: 'tendon' },
  L2_validate:    { risk: 'low',   needsGuard: false, sim: 'immune' },
  L3_write:       { risk: 'high',  needsGuard: true,  sim: 'muscle' },
  L4_state:       { risk: 'low',   needsGuard: false, sim: 'hormone' },
  L5_generate:    { risk: 'medium',needsGuard: true,  sim: 'reproduction' },
};

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); } catch { return null; }
}

function saveRegistry(registry) {
  // 排序并写入
  registry.softills = Object.fromEntries(
    Object.entries(registry.softills).sort((a, b) => a[0].localeCompare(b[0]))
  );
  registry.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

function loadAdapterRegistry() {
  try {
    return JSON.parse(fs.readFileSync(path.join(SOMA_ROOT, 'adapters', 'registry.json'), 'utf-8'));
  } catch { return null; }
}

function validateLevel(level) {
  return !!LEVELS[level];
}

function out(result, summary, data) {
  console.log(JSON.stringify({
    softill: 'meta-softill',
    result,
    summary,
    data: data || {},
    evidence: []
  }, null, 2));
  process.exit(result === 'PASS' ? 0 : result === 'WARN' ? 0 : 1);
}

function getSoftillDirs() {
  return fs.readdirSync(SOFTILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map(d => d.name);
}

function softillExists(name) {
  return fs.existsSync(path.join(SOFTILLS_DIR, name, 'handler.js'));
}

module.exports = {
  SOFTILLS_DIR,
  REGISTRY_PATH,
  LEVELS,
  loadRegistry,
  saveRegistry,
  validateLevel,
  out,
  getSoftillDirs,
  softillExists,
};
