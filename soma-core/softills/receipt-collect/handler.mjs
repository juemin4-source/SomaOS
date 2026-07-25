#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * receipt-collect — handler.js
 *
 * Collect execution receipt and evidence after task completion
 * 级别: L4_state
 * 生成: meta-softill blueprint (v0.2 七面元器)
 */


import fs from 'fs';

import path from 'path';

function handle(input, context) {
  const taskId = input.taskId;
  const worktreePath = input.worktreePath;
  const reportPath = input.reportPath || `tasks/reports/${taskId}.md`;
  const repoRoot = input.repoRoot || path.resolve(__dirname, '..', '..', '..');
  const collectEvidence = input.collectEvidence !== false;

  // Validate
  if (!taskId) {
    return { result: 'BLOCKED', reason: 'taskId is required', evidence: [] };
  }

  try {
    const receipt = {
      receiptId: `RECEIPT-${taskId}`,
      taskId: taskId,
      collectedAt: new Date().toISOString(),
      worktreePath: worktreePath || null,
      reportPath: reportPath,
      sources: [],
      evidence: [],
      status: 'PENDING',
    };

    // 1. Collect the completion report
    const fullReportPath = path.resolve(repoRoot, reportPath);
    if (fs.existsSync(fullReportPath)) {
      const reportContent = fs.readFileSync(fullReportPath, 'utf-8');
      receipt.sources.push({
        type: 'report',
        path: fullReportPath,
        size: reportContent.length,
        exists: true,
      });
      // Extract verdict from report if possible
      const verdictMatch = reportContent.match(/Verdict:\s*(\S+)/i);
      if (verdictMatch) {
        receipt.verdict = verdictMatch[1];
      }
    } else {
      receipt.sources.push({
        type: 'report',
        path: fullReportPath,
        exists: false,
        note: 'Report not yet written',
      });
    }

    // 2. Collect evidence from worktree
    if (worktreePath && collectEvidence && fs.existsSync(worktreePath)) {
      // Scan for evidence files
      const evidenceDir = path.join(worktreePath, 'evidence');
      if (fs.existsSync(evidenceDir)) {
        const evidenceFiles = [];
        function scanDir(dir) {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                scanDir(fullPath);
              } else {
                const stat = fs.statSync(fullPath);
                evidenceFiles.push({
                  path: fullPath,
                  size: stat.size,
                  modifiedAt: stat.mtime.toISOString(),
                });
              }
            }
          } catch {}
        }
        scanDir(evidenceDir);
        receipt.evidence.push(...evidenceFiles);
      }

      // Check for completion markers
      const completionFiles = [
        '.soma/session.json',
        '.initial-prompt.txt',
      ];
      for (const cf of completionFiles) {
        const cfPath = path.join(worktreePath, cf);
        if (fs.existsSync(cfPath)) {
          receipt.sources.push({
            type: 'completion_marker',
            path: cfPath,
            exists: true,
          });
        }
      }
    }

    // 3. Collect task card status
    const tasksBase = path.resolve(repoRoot, 'tasks');
    const cardLocations = ['running', 'completed', 'pending'];
    for (const loc of cardLocations) {
      const cardPath = path.join(tasksBase, loc, `${taskId}.json`);
      if (fs.existsSync(cardPath)) {
        const card = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
        receipt.sources.push({
          type: 'task_card',
          path: cardPath,
          lifecycle: card.lifecycle,
          role: card.role,
        });
        receipt.status = card.lifecycle === 'completed' ? 'COMPLETED'
                       : card.lifecycle === 'running' ? 'RUNNING'
                       : 'PENDING';
        break;
      }
    }

    // 4. Determine final status
    const hasReport = receipt.sources.some(s => s.type === 'report' && s.exists);
    const hasCard = receipt.sources.some(s => s.type === 'task_card');

    if (receipt.status === 'COMPLETED' && hasReport) {
      receipt.overallStatus = 'VERIFIED';
      receipt.verdict = receipt.verdict || 'PASS';
    } else if (receipt.status === 'COMPLETED') {
      receipt.overallStatus = 'COMPLETED_NO_REPORT';
    } else if (receipt.status === 'RUNNING') {
      receipt.overallStatus = 'IN_PROGRESS';
    } else if (!hasCard && !hasReport) {
      receipt.overallStatus = 'NOT_FOUND';
    } else {
      receipt.overallStatus = 'PARTIAL';
    }

    return {
      result: 'PASS',
      receipt: receipt,
      summary: `Receipt collected for ${taskId}: ${receipt.overallStatus}`,
      evidence: [
        { type: 'receipt_collected', taskId, status: receipt.overallStatus, sourcesCount: receipt.sources.length },
      ],
    };
  } catch (err) {
    return {
      result: 'ERROR',
      reason: `Failed to collect receipt: ${err.message}`,
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
    softill: 'receipt-collect',
    result: status,
    summary: result.reason || result.summary || 'Receipt collected',
    data: result,
    evidence: ev,
    meta: { name: 'receipt-collect', level: 'L4_state', v: '0.2.0' },
  }, null, 2));
  process.exit(code);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'receipt-collect', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

export default { handle };



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();