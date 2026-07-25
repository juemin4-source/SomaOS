/**
 * hook.js — 注册/触发事件钩子与定时任务
 *
 * 事件钩子：在特定事件发生时自动调用 softill（如 after_write、before_delivery）
 * 定时任务：按 cron 计划自动触发 softill
 */

const fs = require('fs');
const path = require('path');
const { SOMA_ROOT, loadRegistry, out } = require('./utils');

const HR = path.join(SOMA_ROOT, 'hooks-registry.json');

function loadHooks() {
  try { return JSON.parse(fs.readFileSync(HR, 'utf-8')); } catch { return { hooks: [], cron: [] }; }
}

function saveHooks(h) {
  const dir = path.dirname(HR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HR, JSON.stringify(h, null, 2) + '\n', 'utf-8');
}

function handleHook(input) {
  const action = input.action || 'status';

  switch (action) {
    case 'register':   return registerHook(input);
    case 'unregister': return unregisterHook(input);
    case 'trigger':    return triggerHook(input);
    case 'cron':       return registerCron(input);
    case 'status':     return hookStatus();
    default: return out('ERROR', `Unknown hook action: ${action}. Use: register, unregister, cron, trigger, status`);
  }
}

function registerHook(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');
  if (!input.event) return out('ERROR', 'event required (e.g. after_write, before_delivery)');

  const reg = loadHooks();
  const hk = {
    id: `${name}-${input.event}`,
    softill: name,
    event: input.event,
    description: input.description || '',
    filter: input.filter || {},
    mode: input.mode || 'background',
  };

  const exist = reg.hooks.findIndex(h => h.id === hk.id);
  if (exist >= 0) reg.hooks[exist] = hk;
  else reg.hooks.push(hk);
  saveHooks(reg);

  return out('PASS', `Hook registered: ${name} ← ${input.event}`, { hook: hk });
}

function unregisterHook(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');

  const reg = loadHooks();
  reg.hooks = reg.hooks.filter(h =>
    !(h.softill === name && (!input.event || h.event === input.event))
  );
  saveHooks(reg);

  return out('PASS', `Hook removed for ${name}${input.event ? ' / ' + input.event : ''}`);
}

function triggerHook(input) {
  if (!input.event) return out('ERROR', 'event required');

  const reg = loadHooks();
  const matched = reg.hooks.filter(h => h.event === input.event);
  if (matched.length === 0) return out('PASS', `No hooks for event: ${input.event}`);

  const results = [];
  for (const hk of matched) {
    const hp = path.join(path.resolve(SOMA_ROOT, '..', 'softills'), hk.softill, 'handler.js');
    if (!fs.existsSync(hp)) {
      results.push({ hook: hk.id, status: 'SKIPPED', error: 'handler not found' });
      continue;
    }
    try {
      const tmp = path.join(SOMA_ROOT, 'runtime', '.inputs', `hook_${hk.id}_${Date.now()}.json`);
      if (!fs.existsSync(path.dirname(tmp))) fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(input.data || { event: input.event }), 'utf-8');
      const r = require('child_process').spawnSync('node', [hp, tmp], { encoding: 'utf-8', timeout: 30000 });
      try { fs.unlinkSync(tmp); } catch {}
      results.push({ hook: hk.id, softill: hk.softill, status: r.status === 0 ? 'PASS' : 'FAIL', mode: hk.mode });
    } catch (e) {
      results.push({ hook: hk.id, status: 'ERROR', error: e.message });
    }
  }

  const failed = results.filter(r => r.status !== 'PASS');
  return out(
    failed.length > 0 ? 'PARTIAL' : 'PASS',
    `${results.length} hooks triggered for ${input.event} (${failed.length} failed)`,
    { event: input.event, hooks: results, matchedCount: matched.length }
  );
}

function registerCron(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');
  if (!input.schedule) return out('ERROR', 'schedule required (cron format: "0 * * * *")');

  const reg = loadHooks();
  const cj = {
    id: `${name}-cron`,
    softill: name,
    trigger: 'time',
    schedule: input.schedule,
    description: input.description || '',
    mode: input.mode || 'background',
  };

  const exist = reg.cron.findIndex(c => c.id === cj.id);
  if (exist >= 0) reg.cron[exist] = cj;
  else reg.cron.push(cj);
  saveHooks(reg);

  return out('PASS', `Cron registered: ${name} ← ${input.schedule}`, { cron: cj });
}

function hookStatus() {
  const reg = loadHooks();
  const byEvent = {};
  for (const h of reg.hooks || []) {
    if (!byEvent[h.event]) byEvent[h.event] = [];
    byEvent[h.event].push(h.softill);
  }
  const bySchedule = {};
  for (const c of reg.cron || []) {
    if (!bySchedule[c.schedule]) bySchedule[c.schedule] = [];
    bySchedule[c.schedule].push(c.softill);
  }
  const total = (reg.hooks?.length || 0) + (reg.cron?.length || 0);

  return out('PASS',
    `${total} triggers (${reg.hooks?.length || 0} event hooks, ${reg.cron?.length || 0} cron jobs)`,
    { hooks: reg.hooks || [], cron: reg.cron || [], byEvent, bySchedule }
  );
}

module.exports = { handleHook };
