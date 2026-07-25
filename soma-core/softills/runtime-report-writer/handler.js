#!/usr/bin/env node
/**
 * runtime-report-writer — handler.js
 *
 * 统一生成 runtime_report。收集执行结果并写入文件。
 * 它是交付凭证——没有 runtime_report，任务不算完成。
 *
 * 输入:
 * {
 *   taskId, result, summary,
 *   commandsRun, filesRead, filesWritten, testsRun,
 *   evidence, stateSnapshot, handoffSummary
 * }
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '..', '..', 'soma', 'reports');
const LOG_DIR = path.resolve(__dirname, '..', '..', 'soma', 'logs');

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
  if (!taskId) return out('ERROR', 'taskId required');

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Build trace path
  const tracePath = input.tracePath || path.join(LOG_DIR, `${taskId}.ndjson`);

  // Estimate tokens saved (rough heuristic)
  const commandsRunCount = (input.commandsRun || []).length;
  const filesReadCount = (input.filesRead || []).length;
  const estimatedTokensSaved = commandsRunCount * 5000 + filesReadCount * 3000;

  const report = {
    type: 'runtime_report',
    taskId,
    result: input.result || 'DONE',
    summary: input.summary || '',
    commandsRun: input.commandsRun || [],
    filesRead: input.filesRead || [],
    filesWritten: input.filesWritten || [],
    testsRun: input.testsRun || [],
    evidence: input.evidence || [],
    stateSnapshot: input.stateSnapshot || {},
    estimatedTokensSaved,
    tracePath,
    handoffSummary: input.handoffSummary || '',
    startedAt: input.startedAt || null,
    completedAt: new Date().toISOString(),
  };

  const filePath = path.join(REPORTS_DIR, `${taskId}.report.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  return out('PASS', `Report written: ${taskId} → ${report.result}`, {
    taskId,
    result: report.result,
    file: filePath,
    evidenceCount: report.evidence.length,
    commandsRunCount: report.commandsRun.length,
    filesWrittenCount: report.filesWritten.length,
    estimatedTokensSaved,
    handoffSummary: report.handoffSummary.slice(0, 200),
  });
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'runtime-report-writer', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
