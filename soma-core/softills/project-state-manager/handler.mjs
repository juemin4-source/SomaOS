#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * project-state-manager — handler.js
 *
 * 读取 / 更新 project-state.json。
 * 它是 Project State 的手——所有状态变更走这里，不靠人手改。
 *
 * 输入: { action, ... }
 * action: read | setPhase | setTask | appendDecision | appendRisk | markDeprecated | updatePolicy
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

const DEFAULT_PATH = path.resolve(__dirname, '..', '..', 'soma', 'state', 'project-state.json');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const action = input.action || 'read';
  const statePath = input.file || DEFAULT_PATH;

  // Read current state
  let state = {};
  if (fs.existsSync(statePath)) {
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); }
    catch (e) { return out('ERROR', `Cannot parse project-state: ${e.message}`); }
  }

  let changed = false;
  let log = [];

  switch (action) {
    case 'read':
      return out('PASS', 'project-state read', { state });

    case 'setPhase': {
      if (!input.phase) return out('ERROR', 'phase required');
      state.currentPhase = input.phase;
      changed = true;
      log.push(`phase → ${input.phase}`);
      break;
    }

    case 'setTask': {
      if (!input.taskId) return out('ERROR', 'taskId required');
      state.activeTask = input.taskId;
      changed = true;
      log.push(`activeTask → ${input.taskId}`);
      break;
    }

    case 'clearTask': {
      state.activeTask = null;
      changed = true;
      log.push('activeTask cleared');
      break;
    }

    case 'appendDecision': {
      if (!input.decision) return out('ERROR', 'decision required');
      if (!state.recentDecisions) state.recentDecisions = [];
      state.recentDecisions.push(input.decision);
      if (state.recentDecisions.length > 20) state.recentDecisions.shift(); // keep latest 20
      changed = true;
      log.push(`decision added: ${input.decision.slice(0, 60)}`);
      break;
    }

    case 'appendRisk': {
      if (!input.risk) return out('ERROR', 'risk required');
      if (!state.openRisks) state.openRisks = [];
      state.openRisks.push(input.risk);
      changed = true;
      log.push(`risk added: ${input.risk.slice(0, 60)}`);
      break;
    }

    case 'resolveRisk': {
      if (!input.risk) return out('ERROR', 'risk required');
      if (!state.openRisks) state.openRisks = [];
      const idx = state.openRisks.indexOf(input.risk);
      if (idx === -1) return out('ERROR', `Risk not found: ${input.risk}`);
      state.openRisks.splice(idx, 1);
      changed = true;
      log.push(`risk resolved: ${input.risk.slice(0, 60)}`);
      break;
    }

    case 'markDeprecated': {
      if (!input.path) return out('ERROR', 'path required');
      if (!state.deprecatedPaths) state.deprecatedPaths = [];
      state.deprecatedPaths.push(input.path);
      changed = true;
      log.push(`deprecated: ${input.path}`);
      break;
    }

    case 'updatePolicy': {
      if (!input.policy) return out('ERROR', 'policy required');
      state.runtimePolicy = input.policy;
      changed = true;
      log.push(`policy → ${input.policy}`);
      break;
    }

    case 'updateLastStable': {
      if (!input.summary) return out('ERROR', 'summary required');
      state.lastStableState = input.summary;
      changed = true;
      log.push('lastStableState updated');
      break;
    }

    case 'batch': {
      // Multiple updates in one call
      const updates = input.updates || [];
      for (const u of updates) {
        if (u.action === 'setPhase') { state.currentPhase = u.value; log.push(`phase → ${u.value}`); changed = true; }
        if (u.action === 'setTask') { state.activeTask = u.value; log.push(`task → ${u.value}`); changed = true; }
        if (u.action === 'appendDecision') {
          if (!state.recentDecisions) state.recentDecisions = [];
          state.recentDecisions.push(u.value);
          if (state.recentDecisions.length > 20) state.recentDecisions.shift();
          log.push(`decision: ${(u.value||'').slice(0, 60)}`); changed = true;
        }
        if (u.action === 'appendRisk') {
          if (!state.openRisks) state.openRisks = [];
          state.openRisks.push(u.value);
          log.push(`risk: ${(u.value||'').slice(0, 60)}`); changed = true;
        }
      }
      break;
    }

    default:
      return out('ERROR', `Unknown action: ${action}. Valid: read, setPhase, setTask, clearTask, appendDecision, appendRisk, resolveRisk, markDeprecated, updatePolicy, updateLastStable, batch`);
  }

  state.lastUpdated = new Date().toISOString();

  if (changed) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  }

  return out('PASS', changed ? `${log.length} change(s) applied` : 'No changes', {
    action,
    changed,
    log,
    state,
    file: statePath,
  });
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'project-state-manager', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();