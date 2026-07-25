#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * worker-spawn — handler.js
 *
 * Prepare a worker session environment in an isolated worktree with task goal
 * 级别: L4_state
 * 生成: meta-softill blueprint (v0.2 七面元器)
 *
 * NOTE: This softill prepares the session environment and returns the launch
 * configuration. The actual window spawning is handled by the adapter layer
 * (foundry-dispatch.ps1 or equivalent) since it requires shell-level process control.
 */


import fs from 'fs';

import path from 'path';

function handle(input, context) {
  const outputDir = input.outputDir || input.worktreePath;
  const goal = input.goal || '';
  const role = input.role || 'worker';
  const taskId = input.taskId || 'unknown';
  const hardRules = input.hardRules || [];
  const reportPath = input.reportPath || `C:\\Users\\liuyiyu\\AppData\\Local\\Temp\\claude\\worker-reports\\${taskId}.md`;

  // Validate
  if (!outputDir && !input.worktreePath) {
    return { result: 'BLOCKED', reason: 'outputDir or worktreePath is required', evidence: [] };
  }

  try {
    // Ensure output directory exists
    const workDir = path.resolve(outputDir);
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    // Ensure report directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Write initial prompt file
    const promptPath = path.join(workDir, '.worker-prompt.txt');
    const promptContent = `${goal}\n\n报告路径: ${reportPath}`;
    fs.writeFileSync(promptPath, promptContent, 'utf-8');

    // Write hard rules if any
    if (hardRules.length > 0) {
      const rulesContent = hardRules.map(r => `- ${r}`).join('\n');
      fs.writeFileSync(path.join(workDir, '.worker-rules.txt'), rulesContent, 'utf-8');
    }

    // Generate launch configuration — 启动外部独立 Claude Code 进程
    // 使用 Node.js child_process 而非内联 agent，降低 token 消耗
    const targetDir = workDir;
    const launchConfig = {
      workDir: targetDir,
      taskId: taskId,
      role: role,
      goal: goal,
      reportPath: reportPath,
      promptFile: '.worker-prompt.txt',
      launchCommand: `cd /d "${targetDir}" && claude "${promptPath}"`,
      shellCommand: `claude "${promptPath}"`,
    };

    return {
      result: 'PASS',
      status: 'SESSION_READY',
      workDir: targetDir,
      taskId: taskId,
      launchConfig: launchConfig,
      evidence: [
        { type: 'worker_session_prepared', taskId, role, workDir: targetDir },
      ],
    };
  } catch (err) {
    return {
      result: 'ERROR',
      reason: `Failed to prepare worker session: ${err.message}`,
      evidence: [{ type: 'error', message: err.message }],
    };
  }
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
    softill: 'worker-spawn',
    result: status,
    summary: result.reason || `Worker session ready at ${result.worktreePath}`,
    data: result,
    evidence: ev,
    meta: { name: 'worker-spawn', level: 'L4_state', v: '0.2.0' },
  }, null, 2));
  process.exit(code);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'worker-spawn', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

export default { handle };



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();