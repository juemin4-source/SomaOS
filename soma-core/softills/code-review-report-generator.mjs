#!/usr/bin/env node
/**
 * code-review-report-generator — handler.mjs (ESM)
 *
 * Merge analysis outputs into structured review report.
 * L1_transform — 输出类 Softill
 * Forge target: TASK-SKILL-FAMILY-CODE-REVIEW-PILOT-001
 * NOTE: Direct write due to forge ESM/CJS compat issue
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export function handle(input = {}, context = {}) {
  try {
    return handleImpl(input, context);
  } catch (err) {
    return { softill: 'code-review-report-generator', result: 'ERROR', summary: err.message || 'Unhandled error', data: {}, evidence: [] };
  }
}

function handleImpl(input, context) {
  const strategy = input.strategy || {};
  const diffAnalysis = input.diff_analysis || input.diffAnalysis || {};
  const patternFindings = input.pattern_findings || input.patternFindings || [];
  const strategySelected = strategy.selected || 'standards-spec';
  const bodyUsed = input.body || 'read-only';

  // Collect all findings from pattern findings
  const findings = [];
  if (Array.isArray(patternFindings)) {
    patternFindings.forEach(pf => {
      if (pf.data && pf.data.findings) {
        pf.data.findings.forEach(f => findings.push(f));
      }
    });
  } else if (patternFindings.data && patternFindings.data.findings) {
    patternFindings.data.findings.forEach(f => findings.push(f));
  }

  // Sort by severity
  const sev = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
  findings.sort((a, b) => (sev[a.severity] || 99) - (sev[b.severity] || 99));

  const highestSev = findings.length > 0 ? findings[0].severity : 'NONE';
  const verdict = highestSev === 'P0' ? 'FAIL' : highestSev === 'P1' ? 'PASS_WITH_NOTES' : 'PASS';

  return {
    softill: 'code-review-report-generator',
    result: 'PASS',
    summary: 'Report generated: ' + findings.length + ' findings, verdict=' + verdict,
    data: {
      meta: {
        reportId: 'review-' + Date.now(),
        timestamp: new Date().toISOString(),
        target: {
          diffRef: input.diff_ref || input.diffRef || 'unknown',
          filesChanged: (diffAnalysis.data && diffAnalysis.data.totalFiles) || 0,
          linesChanged: (diffAnalysis.data && diffAnalysis.data.totalFiles) ? (diffAnalysis.data.totalAdded + diffAnalysis.data.totalRemoved) : 0,
        },
        body: bodyUsed,
        strategy: strategySelected,
      },
      summary: { totalFindings: findings.length, highestSeverity: highestSev, verdict },
      findings: findings,
      strategy: {
        selected: strategySelected,
        reason: strategy.reason || 'Auto-selected',
        archetypes: strategy.archetypes || [strategySelected],
        softillsUsed: [],
      },
      negativeFindings: [],
    },
    evidence: [],
  };
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = resolve(process.argv[2]);
    try { input = JSON.parse(readFileSync(p, 'utf-8')); }
    catch (e) { return fail('Read fail: ' + e.message); }
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail('Parse error: ' + e.message); }
    });
    return;
  } else { input = process.argv[2] ? { input: process.argv[2] } : {}; }
  run(input);
}
function run(input) {
  const result = handle(input, {});
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === 'ERROR' ? 1 : 0);
}
function fail(msg) {
  console.log(JSON.stringify({ softill: 'code-review-report-generator', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}
if (require.main === module) main();
