#!/usr/bin/env node
/**
 * code-review-diff-reader — handler.mjs (ESM)
 *
 * Read and structure git diff data for code review.
 * L0_read_probe — 观察类 Softill
 * Forge: TASK-SKILL-FAMILY-CODE-REVIEW-PILOT-001
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

export function handle(input = {}, context = {}) {
  try {
    return handleImpl(input, context);
  } catch (err) {
    return {
      softill: 'code-review-diff-reader',
      result: 'ERROR',
      summary: err.message || 'Unhandled error',
      data: {},
      evidence: [],
    };
  }
}

function handleImpl(input, context) {
  const diffRef = input.diffRef || input.diff_ref || 'HEAD';
  const repoRoot = input.repoRoot || context.cwd || process.cwd();
  const cwd = resolve(repoRoot);

  if (!existsSync(cwd)) {
    return {
      softill: 'code-review-diff-reader',
      result: 'ERROR',
      summary: `Repository root not found: ${cwd}`,
      data: {},
      evidence: [],
    };
  }

  let stdout;
  try {
    stdout = execSync(`git diff ${diffRef}...HEAD`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return {
      softill: 'code-review-diff-reader',
      result: 'ERROR',
      summary: `Git diff failed: ${e.message}`,
      data: { diffRef, cwd },
      evidence: [],
    };
  }

  if (!stdout || stdout.trim().length === 0) {
    return {
      softill: 'code-review-diff-reader',
      result: 'FAILED',
      summary: 'No diff found or empty diff',
      data: { diffRef, empty: true },
      evidence: [],
    };
  }

  // Parse diff into structured format
  const files = [];
  const filePattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  let match;
  const fileMap = new Map();

  // Split by file
  const fileSections = stdout.split(/\ndiff --git /);
  for (let i = 0; i < fileSections.length; i++) {
    const section = i === 0 ? fileSections[i] : 'diff --git ' + fileSections[i];
    const headerMatch = section.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[2];
    const hunks = [];
    const hunkPattern = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/gm;
    let hunkMatch;
    const lines = section.split('\n');

    while ((hunkMatch = hunkPattern.exec(section)) !== null) {
      const oldStart = parseInt(hunkMatch[1]);
      const newStart = parseInt(hunkMatch[3]);
      const hunkHeader = hunkMatch[5]?.trim() || '';
      hunks.push({
        oldStart,
        newStart,
        header: hunkHeader,
      });
    }

    const addedLines = (section.match(/\n\+/g) || []).length - 1; // -1 for diff header
    const removedLines = (section.match(/\n\-/g) || []).length - 1;
    const isNew = section.includes('new file mode');
    const isDeleted = section.includes('deleted file mode');

    files.push({
      path: filePath,
      oldPath: headerMatch[1],
      status: isNew ? 'added' : isDeleted ? 'deleted' : 'modified',
      hunks,
      addedLines,
      removedLines,
      totalChanges: addedLines + removedLines,
    });
  }

  return {
    softill: 'code-review-diff-reader',
    result: 'PASS',
    summary: `Read diff: ${files.length} files, ${files.reduce((s, f) => s + f.totalChanges, 0)} changes`,
    data: {
      diffRef,
      files,
      totalFiles: files.length,
      totalAdded: files.reduce((s, f) => s + f.addedLines, 0),
      totalRemoved: files.reduce((s, f) => s + f.removedLines, 0),
      languages: [...new Set(files.map(f => f.path.split('.').pop()).filter(Boolean))],
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
  } else {
    input = process.argv[2] ? { input: process.argv[2] } : {};
  }
  run(input);
}

function run(input) {
  const result = handle(input, {});
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === 'ERROR' ? 1 : 0);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'code-review-diff-reader', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

if (require.main === module) main();
