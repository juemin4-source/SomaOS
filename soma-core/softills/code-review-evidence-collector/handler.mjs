#!/usr/bin/env node
/**
 * code-review-evidence-collector — handler.mjs (ESM)
 *
 * Collect and format evidence from review run.
 * L1_transform — 收集类 Softill
 * Forge target: TASK-SKILL-FAMILY-CODE-REVIEW-PILOT-001
 * NOTE: Direct write due to forge ESM/CJS compat issue
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

export function handle(input = {}, context = {}) {
  try {
    return handleImpl(input, context);
  } catch (err) {
    return { softill: 'code-review-evidence-collector', result: 'ERROR', summary: err.message || 'Unhandled error', data: {}, evidence: [] };
  }
}

function handleImpl(input, context) {
  const report = input.report || input.review_report || {};
  const strategy = input.strategy || {};
  const outputDir = input.outputDir || context.evidenceDir || 'evidence';
  const resolvedDir = resolve(outputDir);
  const strategySelected = strategy.selected || report.data?.meta?.strategy || 'unknown';
  const bodyUsed = input.body || report.data?.meta?.body || 'read-only';

  if (!existsSync(resolvedDir)) mkdirSync(resolvedDir, { recursive: true });

  const now = new Date();
  const suffix = now.toISOString().replace(/[:.]/g, '-');
  const evidenceFile = resolve(resolvedDir, 'evidence-' + suffix + '.json');

  const evidence = {
    meta: {
      collector: 'code-review-evidence-collector',
      timestamp: now.toISOString(),
      strategy: strategySelected,
      body: bodyUsed,
    },
    report: report.data || {},
    trace: { strategySelected, bodyUsed, timestamp: now.toISOString() },
    artifacts: input._artifacts || [],
  };

  writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), 'utf-8');

  return {
    softill: 'code-review-evidence-collector',
    result: 'PASS',
    summary: 'Evidence collected to ' + evidenceFile,
    data: { evidencePath: evidenceFile, hasReport: !!report.data },
    evidence: [evidenceFile],
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
  console.log(JSON.stringify({ softill: 'code-review-evidence-collector', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
