#!/usr/bin/env node
/**
 * task-card-issue — handler.js
 *
 * Create and issue a task card with lifecycle management (pending/running/completed)
 * 级别: L3_write
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */

const fs = require('fs');
const path = require('path');

function handle(input, context) {
  const goal = input.goal || '';
  const taskId = input.taskId || generateTaskId();
  const role = input.role || 'worker';
  const riskLevel = input.riskLevel || 'L1';
  const experimentId = input.experimentId || '';
  const name = input.name || (goal ? goal.slice(0, 60) : taskId);
  const repoRoot = input.repoRoot || path.resolve(__dirname, '..', '..', '..');
  const reportPath = input.reportPath || `tasks/reports/${taskId}.md`;
  const action = input.action || 'create'; // create | issue | advance | complete
  const fromLifecycle = input.fromLifecycle || '';
  const toLifecycle = input.toLifecycle || '';

  const tasksDir = path.resolve(repoRoot, 'tasks');
  const pendingDir = path.join(tasksDir, 'pending');
  const runningDir = path.join(tasksDir, 'running');
  const completedDir = path.join(tasksDir, 'completed');
  const reportsDir = path.resolve(repoRoot, 'tasks', 'reports');

  // Validate — only "create" action requires goal
  if (action === 'create' && !goal) {
    return { result: 'BLOCKED', reason: 'goal is required for create action', evidence: [] };
  }

  try {
    // Ensure directories exist
    [pendingDir, runningDir, completedDir, reportsDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    switch (action) {
      case 'create': {
        // Create a new task card in pending/
        const card = {
          schema_version: '2',
          task_id: taskId,
          experiment: experimentId,
          name: name,
          type: input.type || 'Experiment',
          task_status: input.taskStatus || 'Lab Only',
          role: role,
          risk_level: riskLevel,
          writer_count: 1,
          auditor: 'separate read-only session',
          output_report: reportPath,
          goal: goal,
          scope: {
            in_scope: input.inScope || ['*'],
            out_of_scope: input.outOfScope || ['production'],
            not_modifying: ['production runtime', 'production registry', 'production state'],
          },
          hard_rules: input.hardRules || [
            '完成后将结论写入 ' + reportPath,
            'do not modify production runtime',
          ],
          lifecycle: 'pending',
          pass_conditions: input.passConditions || [],
          stop_conditions: input.stopConditions || [],
          created_at: new Date().toISOString(),
        };
        const cardPath = path.join(pendingDir, `${taskId}.json`);
        fs.writeFileSync(cardPath, JSON.stringify(card, null, 2), 'utf-8');
        return {
          result: 'PASS',
          taskId: taskId,
          cardPath: cardPath,
          lifecycle: 'pending',
          reportPath: reportPath,
          evidence: [{ type: 'task_card_created', taskId, path: cardPath }],
        };
      }

      case 'issue': {
        // Move from pending/ to running/
        const srcPath = path.join(pendingDir, `${taskId}.json`);
        const dstPath = path.join(runningDir, `${taskId}.json`);
        if (!fs.existsSync(srcPath)) {
          return { result: 'BLOCKED', reason: `Task card not found: ${srcPath}`, evidence: [] };
        }
        const card = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        card.lifecycle = 'running';
        card.started_at = new Date().toISOString();
        fs.writeFileSync(dstPath, JSON.stringify(card, null, 2), 'utf-8');
        fs.unlinkSync(srcPath);
        return {
          result: 'PASS',
          taskId: taskId,
          cardPath: dstPath,
          lifecycle: 'running',
          evidence: [{ type: 'task_card_issued', taskId, from: 'pending', to: 'running' }],
        };
      }

      case 'complete': {
        // Move from running/ to completed/
        const srcPath = path.join(runningDir, `${taskId}.json`);
        const dstPath = path.join(completedDir, `${taskId}.json`);
        if (!fs.existsSync(srcPath)) {
          return { result: 'BLOCKED', reason: `Running task card not found: ${srcPath}`, evidence: [] };
        }
        const card = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        card.lifecycle = 'completed';
        card.completed_at = new Date().toISOString();
        card.result = input.result || 'PASS';
        fs.writeFileSync(dstPath, JSON.stringify(card, null, 2), 'utf-8');
        fs.unlinkSync(srcPath);
        return {
          result: 'PASS',
          taskId: taskId,
          cardPath: dstPath,
          lifecycle: 'completed',
          evidence: [{ type: 'task_card_completed', taskId }],
        };
      }

      case 'advance': {
        // Advance lifecycle: pending → running, running → completed
        if (fromLifecycle === 'pending' && toLifecycle === 'running') {
          return handle({ ...input, action: 'issue' }, context);
        }
        if (fromLifecycle === 'running' && toLifecycle === 'completed') {
          return handle({ ...input, action: 'complete' }, context);
        }
        return {
          result: 'BLOCKED',
          reason: `Unsupported lifecycle transition: ${fromLifecycle} → ${toLifecycle}`,
          evidence: [],
        };
      }

      default:
        return { result: 'BLOCKED', reason: `Unknown action: ${action}`, evidence: [] };
    }
  } catch (err) {
    return {
      result: 'ERROR',
      reason: `Task card operation failed: ${err.message}`,
      evidence: [{ type: 'error', message: err.message }],
    };
  }
}

function generateTaskId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = Math.floor(Math.random() * 90000) + 10000;
  return `TASK-${date}-${seq}`;
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
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail(`Parse error: ${e.message}`); }
    });
    return;
  } else {
    input = { input: process.argv[2] || '' };
  }
  run(input);
}

function run(input) {
  const result = handle(input, {});
  const status = result.result === 'PASS' ? 'PASS' :
                 result.result === 'BLOCKED' ? 'BLOCKED' : 'ERROR';
  const code = status === 'PASS' ? 0 : 1;
  const ev = result.evidence || [];
  console.log(JSON.stringify({
    softill: 'task-card-issue',
    result: status,
    summary: result.reason || `Task card ${result.taskId} ${result.lifecycle}`,
    data: result,
    evidence: ev,
    meta: { name: 'task-card-issue', level: 'L3_write', v: '0.2.0' },
  }, null, 2));
  process.exit(code);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'task-card-issue', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
