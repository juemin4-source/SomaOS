/**
 * register.js — 注册 softill 到 registry，支持 manifest 声明
 *
 * 扩展功能：
 * - 注册时可附加 manifest（输入/输出 schema、前置条件、验证器）
 * - 查看/更新已有条目
 * - 生成 registry 摘要报告
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, loadRegistry, saveRegistry, out } = require('./utils');

function register(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');

  const registry = loadRegistry();
  if (!registry) return out('ERROR', 'Registry not found. Create softill-registry.json first.');

  const action = input.action || 'register';

  switch (action) {
    case 'register': return doRegister(name, input, registry);
    case 'update':   return doUpdate(name, input, registry);
    case 'remove':   return doRemove(name, registry);
    case 'manifest': return attachManifest(name, input, registry);
    case 'summary':  return doSummary(registry);
    default: return out('ERROR', `Unknown register action: ${action}`);
  }
}

function doRegister(name, input, registry) {
  if (registry.softills[name]) {
    return out('WARN', `Already registered: ${name}. Use action:update to modify.`);
  }

  // 检查 handler 是否存在（不强制，但提醒）
  const hasHandler = require('fs').existsSync(path.join(SOFTILLS_DIR, name, 'handler.js'));

  const entry = {
    name,
    level: input.level || 'L0_read_probe',
    writesSource: input.writesSource ?? false,
    writesSomaState: input.writesSomaState ?? false,
    requiresBeforeWrite: input.requiresBeforeWrite ?? false,
    requiresAfterWrite: input.requiresAfterWrite ?? false,
    deterministic: input.deterministic ?? true,
    sideEffects: input.sideEffects || [],
    allowedRuntimeStages: input.allowedRuntimeStages || ['context_compile'],
    defaultCost: input.defaultCost || 'low',
    outputContract: 'softill_result',
  };

  // 可选字段
  if (input.notes) entry.notes = input.notes;
  if (input.depends) entry.depends = input.depends;
  if (input.dependsDescription) entry.dependsDescription = input.dependsDescription;
  if (input.manifest) entry.manifest = input.manifest;
  if (input.tags) entry.tags = input.tags;

  registry.softills[name] = entry;
  saveRegistry(registry);

  return out('PASS', `Registered: ${name}${hasHandler ? '' : ' (no handler.js yet)'}`, {
    mode: 'register',
    name,
    entry,
    hasHandler,
    totalSoftills: Object.keys(registry.softills).length,
  });
}

function doUpdate(name, input, registry) {
  if (!registry.softills[name]) {
    return out('ERROR', `Not registered: ${name}. Use action:register to add.`);
  }

  const existing = registry.softills[name];
  const updateFields = ['level', 'writesSource', 'writesSomaState',
    'requiresBeforeWrite', 'requiresAfterWrite', 'deterministic',
    'sideEffects', 'allowedRuntimeStages', 'defaultCost', 'outputContract',
    'notes', 'depends', 'dependsDescription', 'manifest', 'tags'];

  const changed = [];
  for (const field of updateFields) {
    if (input[field] !== undefined) {
      if (JSON.stringify(existing[field]) !== JSON.stringify(input[field])) {
        changed.push(field);
        existing[field] = input[field];
      }
    }
  }

  registry.softills[name] = existing;
  saveRegistry(registry);

  return out('PASS', `Updated: ${name} (${changed.length} fields changed)`, {
    mode: 'update',
    name,
    changed,
    entry: existing,
  });
}

function doRemove(name, registry) {
  if (!registry.softills[name]) {
    return out('WARN', `Not in registry: ${name}`);
  }

  delete registry.softills[name];
  saveRegistry(registry);

  return out('PASS', `Removed: ${name}`, {
    mode: 'remove',
    name,
    totalSoftills: Object.keys(registry.softills).length,
  });
}

function attachManifest(name, input, registry) {
  if (!registry.softills[name]) {
    return out('ERROR', `Not registered: ${name}. Register first.`);
  }

  const manifest = {
    accepts: input.accepts || [],
    produces: input.produces || [],
    requires: input.requires || [],
    preserves: input.preserves || [],
    validators: input.validators || [],
    errors: input.errors || [],
  };

  registry.softills[name].manifest = manifest;
  saveRegistry(registry);

  return out('PASS', `Manifest attached: ${name}`, {
    mode: 'manifest',
    name,
    manifest,
  });
}

function doSummary(registry) {
  const byLevel = {};
  const byStage = {};

  for (const [name, entry] of Object.entries(registry.softills)) {
    // 按 level 统计
    byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;

    // 按 stage 统计
    for (const stage of entry.allowedRuntimeStages || []) {
      byStage[stage] = (byStage[stage] || 0) + 1;
    }
  }

  const total = Object.keys(registry.softills).length;
  const withManifest = Object.values(registry.softills).filter(e => e.manifest).length;
  const withDeps = Object.values(registry.softills).filter(e => e.depends && e.depends.length > 0).length;

  return out('PASS', `Registry: ${total} softills (${withManifest} with manifest, ${withDeps} with deps)`, {
    mode: 'summary',
    total,
    withManifest,
    withDeps,
    byLevel,
    byStage,
  });
}

module.exports = { register };
