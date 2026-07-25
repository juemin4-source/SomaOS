#!/usr/bin/env node
/**
 * evidence-collector — handler.js
 *
 * 收集证据，服务 before_delivery guard。
 * 没有 evidence，不准 claim complete。
 *
 * 输入: { taskId, evidence: [...] }
 *   每条 evidence: { type, result, summary, source }
 *   type: test | schema | gate | file | diff | command
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

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
  const taskId = input.taskId;
  const evidence = input.evidence || [];

  if (!taskId && evidence.length === 0 && input.mode !== 'check') {
    return out('ERROR', 'taskId or evidence required');
  }

  const mode = input.mode || 'collect';

  switch (mode) {
    case 'collect': {
      // Validate each evidence item
      const collected = [];
      const errors = [];

      for (let i = 0; i < evidence.length; i++) {
        const ev = evidence[i];
        if (!ev.type) { errors.push(`evidence[${i}]: missing type`); continue; }
        if (!ev.result) { errors.push(`evidence[${i}]: missing result`); continue; }

        const validTypes = ['test', 'schema', 'gate', 'file', 'diff', 'command', 'manual'];
        if (!validTypes.includes(ev.type)) {
          errors.push(`evidence[${i}]: invalid type "${ev.type}". Valid: ${validTypes.join(', ')}`);
          continue;
        }

        collected.push({
          type: ev.type,
          result: ev.result,
          summary: (ev.summary || '').slice(0, 500),
          source: ev.source || 'unknown',
          timestamp: new Date().toISOString(),
        });
      }

      const verdict = errors.length === 0 ? 'PASS' : 'PARTIAL';

      // If a target task file exists, append evidence to it
      if (taskId) {
        const taskDir = path.resolve(__dirname, '..', '..', 'soma', 'tasks');
        const taskPath = path.join(taskDir, `${taskId}.json`);
        if (fs.existsSync(taskPath)) {
          try {
            const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
            if (!task.evidence) task.evidence = [];
            for (const ev of collected) {
              const key = `${ev.type}:${ev.result}:${ev.summary.slice(0, 100)}`;
              if (!task.evidence.some(e => e.includes && e.includes(key))) {
                task.evidence.push(`[${ev.type}] ${ev.result}: ${ev.summary.slice(0, 200)}`);
              }
            }
            task.lastUpdated = new Date().toISOString();
            fs.writeFileSync(taskPath, JSON.stringify(task, null, 2) + '\n', 'utf-8');
          } catch {}
        }
      }

      return out(verdict, `${collected.length} evidence collected, ${errors.length} errors`, {
        mode: 'collect',
        taskId,
        collected,
        errors,
        passCount: collected.length,
        errorCount: errors.length,
      });
    }

    case 'check': {
      // Check if task has enough evidence to pass delivery guard
      const taskDir = path.resolve(__dirname, '..', '..', 'soma', 'tasks');
      const taskPath = path.join(taskDir, `${taskId}.json`);
      if (!fs.existsSync(taskPath)) return out('ERROR', `Task not found: ${taskId}`);

      const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
      const ev = task.evidence || [];
      const evidenceByType = {};
      for (const e of ev) {
        const typeMatch = e.match(/^\[(\w+)\]/);
        const type = typeMatch ? typeMatch[1] : 'other';
        if (!evidenceByType[type]) evidenceByType[type] = [];
        evidenceByType[type].push(e);
      }

      const hasTestEvidence = (evidenceByType['test'] || []).length > 0;
      const hasGateEvidence = (evidenceByType['gate'] || []).length > 0;
      const hasFileEvidence = (evidenceByType['file'] || []).length > 0;
      const totalCount = ev.length;

      const deliveryReady = totalCount >= 2 && (hasTestEvidence || hasGateEvidence);

      return out(deliveryReady ? 'PASS' : 'PARTIAL', `Evidence check: ${totalCount} items (test:${hasTestEvidence}, gate:${hasGateEvidence})`, {
        mode: 'check',
        taskId,
        deliveryReady,
        evidenceByType,
        totalCount,
        hasTestEvidence,
        hasGateEvidence,
        hasFileEvidence,
        requiresMore: !deliveryReady,
      });
    }

    default:
      return out('ERROR', `Unknown mode: ${mode}. Valid: collect, check`);
  }
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'evidence-collector', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : result === 'PARTIAL' ? 1 : 1);
}

if (require.main === module) main();
