#!/usr/bin/env node
/**
 * code-review-pattern-matcher — handler.mjs (ESM)
 *
 * Match review patterns against code. Supports PAT-001~012 + extension patterns.
 * L1_transform — 消化类 Softill
 * Forge target: TASK-SKILL-FAMILY-CODE-REVIEW-PILOT-001
 * NOTE: Direct write due to forge ESM/CJS compat issue (meta-softill-v0.1 has "type":"module")
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const PATTERNS = {
  'PAT-001': { name: 'OBO', severity: 'P1', desc: 'Off-by-one on zero-indexed array', test: (c) => /<=\s*\.length/.test(c) },
  'PAT-002': { name: 'NLL', severity: 'P1', desc: 'Property access without null guard', test: (c) => /\.[a-zA-Z]+\s*\(/.test(c) && !/if\s*\(/.test(c.split('\n').slice(-5).join('\n')) },
  'PAT-003': { name: 'RSL', severity: 'P1', desc: 'Resource leak, no finally/defer', test: (c) => /(open|create|lock|connect)/.test(c) && !/(finally|defer|close|destroy|disconnect)/.test(c) },
  'PAT-004': { name: 'INP', severity: 'P0', desc: 'External data to SQL/shell/eval', test: (c) => /(exec|eval|spawn|query)\s*\(/.test(c) && /\+(?!\+)/.test(c) },
  'PAT-005': { name: 'TYP', severity: 'P2', desc: '== between different types', test: (c) => /[^=!]==[^=]/.test(c) && !/===/.test(c) },
  'PAT-006': { name: 'ERR', severity: 'P1', desc: 'Empty catch or ignored error', test: (c) => /catch\s*\([^)]*\)\s*\{\s*\}/.test(c) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(c) },
  'PAT-007': { name: 'SMT', severity: 'P1', desc: 'Global var in async without mutex', test: (c) => /(let|var)\s+\w+\s*=\s*[^;]+/.test(c) && /async/.test(c) && !/lock|mutex|atomic/.test(c) },
  'PAT-008': { name: 'CMP', severity: 'P2', desc: 'Float === or NaN compare', test: (c) => /===\s*NaN/.test(c) || /NaN\s*===/.test(c) || /===\s*(0x|[0-9]+\.[0-9])/.test(c) },
  'PAT-009': { name: 'INT', severity: 'P2', desc: 'Arithmetic on bounded type without guard', test: (c) => /[+\-*/]\s*[a-zA-Z]/.test(c) && !/if\s*\(/.test(c.split('\n').slice(-3).join('\n')) },
  'PAT-010': { name: 'LOG', severity: 'P2', desc: 'De Morgan violation', test: (c) => /!\s*\(/.test(c) && /&&/.test(c) },
  'PAT-011': { name: 'SEC', severity: 'P0', desc: 'Literal key/secret/token', test: (c) => /(api_key|apikey|secret|token|password)\s*[:=]\s*["'"][^"']{16,}["'']/.test(c) },
  'PAT-012': { name: 'ASY', severity: 'P1', desc: 'async without await or .catch', test: (c) => /async\s+/.test(c) && !/await/.test(c) && !/\.catch/.test(c) },
};

export function handle(input = {}, context = {}) {
  try {
    return handleImpl(input, context);
  } catch (err) {
    return { softill: 'code-review-pattern-matcher', result: 'ERROR', summary: err.message || 'Unhandled error', data: {}, evidence: [] };
  }
}

function handleImpl(input, context) {
  const code = input.code || '';
  const filePath = input.filePath || input.file || 'unknown';
  const activePatterns = input.patterns || Object.keys(PATTERNS);
  const findings = [];

  if (!code || code.trim().length === 0) {
    return { softill: 'code-review-pattern-matcher', result: 'FAILED', summary: 'No code provided', data: { filePath }, evidence: [] };
  }

  const lines = code.split('\n');
  for (const [pid, pattern] of Object.entries(PATTERNS)) {
    if (!activePatterns.includes(pid)) continue;
    try {
      if (pattern.test(code)) {
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            findings.push({
              patternId: pid, patternName: pattern.name, severity: pattern.severity,
              file: filePath, line: i + 1, summary: pattern.desc,
              evidence: [{ type: 'code-quote', content: lines[i].substring(0, 200) }],
              confidence: 'PLAUSIBLE', category: pattern.severity === 'P0' ? 'security' : 'correctness',
            });
          }
        }
      }
    } catch (e) { /* skip pattern on error */ }
  }

  // Deduplicate by (patternId, line)
  const seen = new Set();
  const uniqueFindings = findings.filter(f => {
    const k = f.patternId + ':' + f.line;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    softill: 'code-review-pattern-matcher',
    result: 'PASS',
    summary: uniqueFindings.length + ' pattern matches in ' + filePath,
    data: { filePath, findings: uniqueFindings, totalPatterns: activePatterns.length, patternsRun: activePatterns },
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
  console.log(JSON.stringify({ softill: 'code-review-pattern-matcher', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
