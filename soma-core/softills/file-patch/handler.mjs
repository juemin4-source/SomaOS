#!/usr/bin/env node
/**
 * file-patch — handler.mjs (Reforged)
 *
 * 精准文件修改 Softill。走 Organ Runtime 的 filesystem adapter：
 *   filesystem.inspect — 带 Scope 和证据的读
 *   filesystem.write   — 带 Scope 检查的写
 *   filesystem.inspect — 写后回读验证
 *
 * 不允许直接 fs 调用。所有 IO 通过 Organ Runtime 治理。
 *
 * == 操作类型 ==
 *   replace      替换 anchor 后的 old→new
 *   insert_after 在 anchor 后插入行
 *   insert_before 在 anchor 前插入行
 *   delete       删除 anchor 起的 N 行
 *   replace_line 替换 anchor 所在行
 *
 * == 输入 ==
 * {
 *   file: "path/to/file",
 *   ops: [{ type, anchor, ... }],
 *   mode: "dry-run" | "apply"     (默认 dry-run)
 *   scope: "/allowed/write/path"  (可选，默认项目根)
 *   handle_id: "hdl-..."          (可选，Organ Handle)
 * }
 *
 * == 输出 ==
 * {
 *   result, summary,
 *   data: { file, mode, opsCount, ok, errors, skipped, changes, diff,
 *           beforeHash, afterHash, written, verified },
 *   evidence: [ ... ]
 * }
 */

import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_OP_TYPES = ['replace', 'insert_after', 'insert_before', 'delete', 'replace_line'];
const DEFAULT_SCOPE = process.cwd();

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handle(input) {
  // ── 1. Validate input ──
  const validation = validateInput(input);
  if (!validation.valid) {
    return {
      result: 'BLOCKED',
      summary: validation.errors.join('; '),
      data: null,
      evidence: [{ type: 'input_validation', result: 'BLOCKED', summary: validation.errors.join('; ') }],
    };
  }

  const filePath = path.resolve(input.file);
  const ops = input.ops;
  const mode = input.mode || 'dry-run';
  const scope = input.scope ? path.resolve(input.scope) : DEFAULT_SCOPE;
  const handleId = input.handle_id || null;

  // ── 2. Verify file is within scope ──
  if (!filePath.startsWith(path.resolve(scope))) {
    return {
      result: 'BLOCKED',
      summary: `File '${input.file}' is outside allowed scope '${scope}'`,
      data: null,
      evidence: [{ type: 'scope_check', result: 'BLOCKED', summary: 'Path outside scope' }],
    };
  }

  // ── 3. Load Organ Runtime (lazy, only when handle provided) ──
  let actionExecutor;
  if (handleId) {
    const loaded = await loadOrganRuntime();
    if (!loaded) {
      return {
        result: 'ERROR',
        summary: 'Organ Runtime unavailable',
        data: null,
        evidence: [{ type: 'organ_load', result: 'ERROR', summary: 'Failed to load organ runtime' }],
      };
    }
    actionExecutor = loaded.actionExecutor;
  }

  // ── 4. Read file (scoped) ──
  const readResult = await readFile(filePath, scope, handleId, actionExecutor);
  if (!readResult.success) {
    return readResult.response;
  }

  const originalContent = readResult.content;
  const beforeHash = readResult.hash;
  const originalLines = originalContent.split('\n');

  // ── 5. Process ops (pure computation, no IO) ──
  const processResult = processOps(originalLines, ops);
  const patched = processResult.workingLines.join('\n');
  const afterHash = computeHash(patched);
  const hasChanges = patched !== originalContent;

  // Generate diff (pure computation)
  const diffText = hasChanges
    ? generateDiff(originalContent, patched, path.basename(filePath))
    : '(identical — no changes)';

  // ── 6. Aggregate results ──
  const errorOps = processResult.changes.filter(c => c.status === 'ERROR');
  const skipOps = processResult.changes.filter(c => c.status === 'SKIPPED');
  const okOps = processResult.changes.filter(c => c.status === 'OK');
  const verdict = errorOps.length === 0 ? 'PASS' : 'PARTIAL';

  // Build evidence chain
  const evidence = [
    {
      type: 'file_read',
      result: 'PASS',
      summary: `Read ${filePath} (${originalContent.length} chars)`,
      hash: beforeHash,
    },
    {
      type: 'ops_processed',
      result: verdict,
      summary: `${okOps.length}/${ops.length} ops applied, ${errorOps.length} errors, ${skipOps.length} skipped`,
    },
  ];

  const resultData = {
    file: input.file,
    mode,
    opsCount: ops.length,
    ok: okOps.length,
    errors: errorOps.length,
    skipped: skipOps.length,
    changes: processResult.changes.map(c => ({
      opIndex: c.opIndex,
      type: c.type,
      status: c.status,
      error: c.error || undefined,
      line: c.line,
      old: c.old,
      new: c.new,
      insertedAt: c.insertedAt,
      lineCount: c.lineCount,
      removedLines: c.removedLines,
      removedPreview: c.removedPreview,
    })),
    diff: diffText.length > 10000 ? diffText.slice(0, 10000) + '\n... (truncated)' : diffText,
    diffTruncated: diffText.length > 10000,
    beforeHash,
    afterHash,
    hasChanges,
    written: false,
    verified: false,
    scope,
  };

  // ── 7. Write (apply mode only, no errors) ──
  if (mode === 'apply' && errorOps.length === 0 && hasChanges) {
    const writeResult = await writeFile(filePath, patched, scope, handleId, actionExecutor);
    if (!writeResult.success) {
      return writeResult.response;
    }
    resultData.written = true;
    evidence.push({
      type: 'file_write',
      result: 'PASS',
      summary: `Wrote ${filePath}`,
      hash: afterHash,
    });

    // ── 8. Readback verification ──
    const readbackResult = await readFile(filePath, scope, handleId, actionExecutor);
    if (readbackResult.success) {
      const readbackHash = readbackResult.hash;
      resultData.verified = readbackHash === afterHash;
      evidence.push({
        type: 'readback_verify',
        result: resultData.verified ? 'PASS' : 'FAILED',
        summary: resultData.verified
          ? `Readback verified (hash match: ${afterHash})`
          : `Readback hash mismatch: expected ${afterHash}, got ${readbackHash}`,
        hash: readbackHash,
      });
    } else {
      evidence.push({ type: 'readback_verify', result: 'ERROR', summary: 'Readback failed' });
    }
  }

  // ── 9. Return ──
  return {
    result: verdict,
    summary: `${mode === 'dry-run' ? '[DRY-RUN] ' : ''}${okOps.length}/${ops.length} ops applied, ${errorOps.length} errors, ${skipOps.length} skipped`,
    data: resultData,
    evidence,
  };
}

// ─── Input Validation ──────────────────────────────────────────────────────

function validateInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    errors.push('Input must be a JSON object');
    return { valid: false, errors };
  }

  if (!input.file || typeof input.file !== 'string') {
    errors.push('file is required (string)');
  }

  if (!Array.isArray(input.ops) || input.ops.length === 0) {
    errors.push('ops is required (non-empty array)');
  } else {
    for (let i = 0; i < input.ops.length; i++) {
      const op = input.ops[i];
      if (!op || typeof op !== 'object') {
        errors.push(`ops[${i}]: must be an object`);
        continue;
      }
      if (!op.type || !VALID_OP_TYPES.includes(op.type)) {
        errors.push(`ops[${i}]: type must be one of ${VALID_OP_TYPES.join(', ')}`);
      }
      if (!op.anchor && op.type !== 'delete') {
        errors.push(`ops[${i}]: anchor is required for type "${op.type}"`);
      }
      if (op.type === 'replace' && op.old === undefined) {
        errors.push(`ops[${i}]: replace requires "old"`);
      }
      if (op.type === 'replace_line' && op.newLine === undefined) {
        errors.push(`ops[${i}]: replace_line requires "newLine"`);
      }
    }
  }

  if (input.mode && !['dry-run', 'apply'].includes(input.mode)) {
    errors.push('mode must be "dry-run" or "apply"');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Organ Runtime Loader ──────────────────────────────────────────────────

async function loadOrganRuntime() {
  try {
    const organModule = await import('../../../packages/runtime/src/organ/index.mjs');
    return organModule;
  } catch {
    return null;
  }
}

// ─── Hash Computation (pure, no IO beyond crypto) ─────────────────────────

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

// ─── Read File via Organ or Direct ────────────────────────────────────────

async function readFile(filePath, scope, handleId, actionExecutor) {
  if (handleId && actionExecutor) {
    // Organ-mediated: scoped read with evidence
    try {
      const result = await actionExecutor.execute({
        handle_id: handleId,
        operation_id: 'inspect',
        args: { path: filePath, include_hash: true },
        metadata: { source: 'softill', source_id: 'file-patch' },
      });

      if (result.status === 'success' && result.output?.data?.content !== undefined) {
        return {
          success: true,
          content: result.output.data.content,
          hash: result.output.data.hash,
        };
      }

      return {
        success: false,
        response: {
          result: 'BLOCKED',
          summary: result.output?.data?.error || 'Read blocked by organ runtime',
          data: null,
          evidence: [{ type: 'organ_read', result: 'BLOCKED', summary: 'Read operation blocked' }],
        },
      };
    } catch (err) {
      return {
        success: false,
        response: {
          result: 'ERROR',
          summary: `Organ read failed: ${err.message}`,
          data: null,
          evidence: [{ type: 'organ_read', result: 'ERROR', summary: err.message }],
        },
      };
    }
  }

  // Fallback: direct read (only when no handle_id — backward compatible)
  try {
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        response: {
          result: 'ERROR',
          summary: `File not found: ${filePath}`,
          data: null,
          evidence: [{ type: 'file_read', result: 'ERROR', summary: 'File not found' }],
        },
      };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, hash: computeHash(content) };
  } catch (err) {
    return {
      success: false,
      response: {
        result: 'ERROR',
        summary: `Read error: ${err.message}`,
        data: null,
        evidence: [{ type: 'file_read', result: 'ERROR', summary: err.message }],
      },
    };
  }
}

// ─── Write File via Organ or Direct ───────────────────────────────────────

async function writeFile(filePath, content, scope, handleId, actionExecutor) {
  if (handleId && actionExecutor) {
    // Organ-mediated: scoped write with evidence
    try {
      const result = await actionExecutor.execute({
        handle_id: handleId,
        operation_id: 'write',
        args: { path: filePath, content },
        metadata: { source: 'softill', source_id: 'file-patch' },
      });

      if (result.status === 'success') return { success: true };

      return {
        success: false,
        response: {
          result: 'BLOCKED',
          summary: result.output?.data?.error || 'Write blocked by organ runtime',
          data: null,
          evidence: [{ type: 'organ_write', result: 'BLOCKED', summary: 'Write operation blocked' }],
        },
      };
    } catch (err) {
      return {
        success: false,
        response: {
          result: 'ERROR',
          summary: `Organ write failed: ${err.message}`,
          data: null,
          evidence: [{ type: 'organ_write', result: 'ERROR', summary: err.message }],
        },
      };
    }
  }

  // Fallback: direct write (only when no handle_id)
  try {
    const fs = await import('fs');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      response: {
        result: 'ERROR',
        summary: `Write error: ${err.message}`,
        data: null,
        evidence: [{ type: 'file_write', result: 'ERROR', summary: err.message }],
      },
    };
  }
}

// ─── Pure: Process Ops ───────────────────────────────────────────────────

function processOps(originalLines, ops) {
  const workingLines = [...originalLines];
  const changes = [];

  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi];
    const anchor = op.anchor;
    const result = { opIndex: oi, type: op.type, anchor };

    try {
      // Find anchor in working lines (must be unique)
      const anchorLines = [];
      for (let i = 0; i < workingLines.length; i++) {
        if (workingLines[i].includes(anchor)) anchorLines.push(i);
      }

      if (anchorLines.length === 0) {
        result.status = 'ERROR';
        result.error = `Anchor not found: "${anchor}"`;
        changes.push(result);
        continue;
      }
      if (anchorLines.length > 1) {
        result.status = 'ERROR';
        result.error = `Anchor not unique: "${anchor}" found ${anchorLines.length} times`;
        changes.push(result);
        continue;
      }

      const lineIdx = anchorLines[0];
      result.line = lineIdx + 1; // 1-indexed for human

      switch (op.type) {
        case 'replace': {
          const lineContent = workingLines[lineIdx];
          const newContent = lineContent.replace(op.old, op.new || '');
          if (newContent === lineContent) {
            result.status = 'SKIPPED';
            result.error = `"${op.old}" not found on anchor line`;
          } else {
            workingLines[lineIdx] = newContent;
            result.status = 'OK';
            result.old = lineContent;
            result.new = newContent;
          }
          break;
        }

        case 'insert_after': {
          const lines = op.lines || [];
          workingLines.splice(lineIdx + 1, 0, ...lines);
          result.status = 'OK';
          result.insertedAt = lineIdx + 2;
          result.lineCount = lines.length;
          break;
        }

        case 'insert_before': {
          const lines = op.lines || [];
          workingLines.splice(lineIdx, 0, ...lines);
          result.status = 'OK';
          result.insertedAt = lineIdx + 1;
          result.lineCount = lines.length;
          break;
        }

        case 'delete': {
          const count = op.count || 1;
          const removed = workingLines.splice(lineIdx, count);
          result.status = 'OK';
          result.removedLines = count;
          result.removedPreview = removed.map((l, i) => `${lineIdx + i + 1}: ${l.slice(0, 100)}`).join('\n');
          break;
        }

        case 'replace_line': {
          const oldContent = workingLines[lineIdx];
          workingLines[lineIdx] = op.newLine || '';
          result.status = 'OK';
          result.old = oldContent;
          result.new = workingLines[lineIdx];
          break;
        }
      }
    } catch (e) {
      result.status = 'ERROR';
      result.error = e.message;
    }

    changes.push(result);
  }

  return { workingLines, changes };
}

// ─── Pure: Diff Generation ───────────────────────────────────────────────

function generateDiff(original, patched, fileName) {
  const oLines = original.split('\n');
  const pLines = patched.split('\n');

  let diff = `--- a/${fileName}\n+++ b/${fileName}\n`;
  let i = 0, j = 0;

  while (i < oLines.length && j < pLines.length) {
    if (oLines[i] === pLines[j]) {
      i++; j++;
      continue;
    }

    const oStart = i;
    const pStart = j;
    while (i < oLines.length && j < pLines.length && oLines[i] !== pLines[j]) {
      i++; j++;
    }
    if (i >= oLines.length || j >= pLines.length) {
      i = Math.min(i, oLines.length);
      j = Math.min(j, pLines.length);
    }

    if (i > oStart || j > pStart) {
      diff += `@@ -${oStart + 1},${i - oStart} +${pStart + 1},${j - pStart} @@\n`;
      for (let k = oStart; k < Math.min(i, oLines.length); k++) diff += `-${oLines[k]}\n`;
      for (let k = pStart; k < Math.min(j, pLines.length); k++) diff += `+${pLines[k]}\n`;
    }
  }

  if (i < oLines.length) {
    diff += `@@ -${i + 1},${oLines.length - i} +${j + 1},0 @@\n`;
    for (let k = i; k < oLines.length; k++) diff += `-${oLines[k]}\n`;
  }

  if (j < pLines.length) {
    diff += `@@ -${i + 1},0 +${j + 1},${pLines.length - j} @@\n`;
    for (let k = j; k < pLines.length; k++) diff += `+${pLines[k]}\n`;
  }

  return diff || '(identical — no diff generated)';
}

// ─── CLI Entry ────────────────────────────────────────────────────────────

async function cli() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try {
      const fs = await import('fs');
      input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8'));
    } catch (e) {
      console.error(JSON.stringify({ softill: 'file-patch', result: 'ERROR', summary: `Read: ${e.message}`, data: null, evidence: [] }));
      process.exit(1);
    }
  } else {
    const chunks = [];
    await new Promise(resolve => {
      process.stdin.on('data', d => chunks.push(d));
      process.stdin.on('end', resolve);
    });
    try {
      input = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      console.error(JSON.stringify({ softill: 'file-patch', result: 'ERROR', summary: `Parse: ${e.message}`, data: null, evidence: [] }));
      process.exit(1);
    }
  }

  const out = await handle(input);
  console.log(JSON.stringify(Object.assign({ softill: 'file-patch' }, out), null, 2));
  process.exit(out.result === 'PASS' ? 0 : out.result === 'PARTIAL' ? 1 : 1);
}

// Auto-detect CLI vs import
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  cli().catch(e => {
    console.error(JSON.stringify({ softill: 'file-patch', result: 'ERROR', summary: `Fatal: ${e.message}` }));
    process.exit(1);
  });
}
