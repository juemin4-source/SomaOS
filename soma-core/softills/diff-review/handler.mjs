#!/usr/bin/env node
/**
 * diff-review — handler.mjs (Reforged from stub)
 *
 * 读取 Diff → 识别作用范围 → 发现意外变化 → 检查 Protected Scope。
 * 判断逻辑委托给 skill.change-safety 方法能力。
 *
 * Identity: 独立 Softill（稳定任务能力）
 * Legacy Origin: src/softills/diff-review/handler.js (broken stub)
 *
 * == 输入 ==
 *   {
 *     cwd?: string,
 *     baseRef?: string,       // git base ref (default: HEAD)
 *     headRef?: string,       // git head ref (default: working tree)
 *     diffText?: string,      // inline diff text (skip git call)
 *     allowedScope?: string[],// 预期变更范围
 *     protectedPaths?: string[]  // 额外保护路径
 *   }
 *
 * == 输出 ==
 *   {
 *     result: 'PASS' | 'FAIL' | 'ERROR',
 *     summary: string,
 *     data: {
 *       files: [{ path, status, additions, deletions, hunks }],
 *       scopes: string[],
 *       scopeDetails: string[],
 *       unexpectedChanges: [{ path, reason }],
 *       protectedScopeViolations: [{ path, rule, severity }],
 *       riskLevel: 'low' | 'medium' | 'high'
 *     }
 *   }
 *
 * == 契约 ==
 *   使用 subprocess.controlled-execute Organ 获取 diff。
 *   使用 filesystem.inspect Organ 读取受保护路径（需要时）。
 *   判断逻辑提取到 skill.change-safety 方法能力。
 *   不修改文件、不运行测试、不发布。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseDiff } from './lib/parse-diff.mjs';
import { analyzeScope, checkProtectedScope, detectUnexpectedChanges, assessRiskLevel } from './lib/scope-analyzer.mjs';

// ─── Organ adapter imports (dynamic, for standalone resilience) ───────────────

let _subprocessAdapter = null;
async function getSubprocessAdapter() {
  if (!_subprocessAdapter) {
    try {
      const mod = await import(
        '../../../packages/runtime/src/organ/adapters/subprocess-adapter.mjs'
      );
      _subprocessAdapter = mod.subprocessAdapter;
    } catch {
      // Organ Runtime 不可用，回退到 direct execSync
      const { execSync } = await import('child_process');
      _subprocessAdapter = {
        execute: async (_op, params, _constraints) => {
          const cmd = params.command;
          const args = params.args || [];
          const opts = params.options || {};
          try {
            const stdout = execSync([cmd, ...args].join(' '), {
              cwd: opts.cwd || process.cwd(),
              timeout: opts.timeout || 15000,
              maxBuffer: opts.max_output_chars || 1_048_576,
              encoding: 'utf-8',
              windowsHide: true,
            });
            return { data: { stdout, stderr: '', exit_code: 0 } };
          } catch (e) {
            return {
              data: {
                stdout: e.stdout || '',
                stderr: e.stderr || e.message,
                exit_code: e.status || 1,
              },
            };
          }
        },
      };
    }
  }
  return _subprocessAdapter;
}

// ─── Core handler ─────────────────────────────────────────────────────────────

export async function handle(input) {
  if (!input || typeof input !== 'object') {
    return buildResult('ERROR', 'Input must be a JSON object.', { files: [], scopes: [], scopeDetails: [], unexpectedChanges: [], protectedScopeViolations: [], riskLevel: 'unknown' });
  }

  const cwd = input.cwd || process.cwd();
  const baseRef = input.baseRef || 'HEAD';
  const headRef = input.headRef || '';
  const allowedScope = input.allowedScope || [];

  let files = [];

  // ── 1. 获取 diff ──
  if (input.diffText) {
    // 直接使用提供的 diff 文本
    const parsed = parseDiff(input.diffText);
    files = parsed.files;
  } else {
    // 通过 subprocess.controlled-execute Organ 获取 git diff
    try {
      const adapter = await getSubprocessAdapter();

      // Build git diff command
      let diffRef = baseRef;
      if (headRef) {
        diffRef = `${baseRef}..${headRef}`;
      }
      // If headRef is empty, use baseRef..HEAD (compare base to working tree)
      const gitCommand = headRef
        ? `git diff ${baseRef}..${headRef}`
        : `git diff ${baseRef}`;

      const parts = gitCommand.split(/\s+/);

      const result = await adapter.execute('controlled-execute', {
        command: parts[0], // git
        args: parts.slice(1),
        options: {
          cwd: path.resolve(cwd),
          timeout: 15000,
          timeout_ms: 15000,
          max_output_chars: 1_048_576, // 1MB max diff output
          shell: false,
        },
      }, {
        constraints: {
          allowed_commands: null,
          max_output_chars: 1_048_576,
          max_timeout: 15000,
          shell_allowed: false,
        },
      });

      const stdout = result.data?.stdout || '';
      const stderr = result.data?.stderr || '';
      const exitCode = result.data?.exit_code;

      if (exitCode !== 0) {
        return buildResult('ERROR', `Git diff command failed (exit ${exitCode}): ${stderr.slice(0, 300)}`, {
          files: [], scopes: [], scopeDetails: [], unexpectedChanges: [], protectedScopeViolations: [], riskLevel: 'unknown',
        });
      }

      const parsed = parseDiff(stdout);
      files = parsed.files;
    } catch (e) {
      return buildResult('ERROR', `Failed to obtain diff: ${e.message}`, {
        files: [], scopes: [], scopeDetails: [], unexpectedChanges: [], protectedScopeViolations: [], riskLevel: 'unknown',
      });
    }
  }

  if (files.length === 0) {
    return buildResult('PASS', 'No changes detected.', {
      files: [], scopes: [], scopeDetails: [], unexpectedChanges: [], protectedScopeViolations: [], riskLevel: 'none',
    });
  }

  // ── 2. 分析作用范围 ──
  const { scopes, scopeDetails } = analyzeScope(files);

  // ── 3. 检查 Protected Scope ──
  const protectedScopeViolations = checkProtectedScope(files);

  // ── 4. 检测意外变更 ──
  const unexpectedChanges = detectUnexpectedChanges(files, allowedScope);

  // ── 5. 风险等级 ──
  const riskLevel = assessRiskLevel(protectedScopeViolations, unexpectedChanges, files.length);

  // ── 6. 构建结果 ──
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  const hasViolations = protectedScopeViolations.filter(v => v.severity === 'error').length > 0;
  const hasWarnings = protectedScopeViolations.length > 0 || unexpectedChanges.length > 0;
  const result = hasViolations ? 'FAIL' : hasWarnings ? 'PASS' : 'PASS';

  const summaryParts = [];
  summaryParts.push(`${files.length} file(s) changed (+${totalAdditions}/-${totalDeletions}), scope: ${scopes.join(', ') || 'unknown'}`);
  if (protectedScopeViolations.length > 0) {
    summaryParts.push(`${protectedScopeViolations.length} protected scope violation(s)`);
  }
  if (unexpectedChanges.length > 0) {
    summaryParts.push(`${unexpectedChanges.length} unexpected change(s)`);
  }
  summaryParts.push(`risk level: ${riskLevel}`);

  const data = {
    files: files.map(f => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      hunks: f.hunks.map(h => ({
        header: h.header,
        additions: h.additions,
        deletions: h.deletions,
        lines: h.lines.slice(0, 50), // Cap per-hunk lines in output
      })),
    })),
    totalFiles: files.length,
    totalAdditions,
    totalDeletions,
    scopes,
    scopeDetails,
    unexpectedChanges,
    protectedScopeViolations,
    riskLevel,
  };

  return buildResult(result, summaryParts.join('; '), data);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildResult(result, summary, data) {
  return {
    result,
    summary,
    data,
    _evidence: [
      { type: 'diff_review', result, summary: summary.slice(0, 300) },
      ...data.protectedScopeViolations.map(v => ({
        type: 'protected_scope_violation',
        result: 'FAIL',
        path: v.path,
        summary: `[${v.severity}] ${v.rule}: ${v.path}`,
      })),
      ...data.unexpectedChanges.map(u => ({
        type: 'unexpected_change',
        result: 'WARNING',
        path: u.path,
        summary: u.reason,
      })),
    ],
  };
}

// ── CLI entry ──

async function cli() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
    catch (e) { console.error(JSON.stringify({ softill: 'diff-review', result: 'ERROR', summary: `Read: ${e.message}`, data: null })); process.exit(1); }
  } else {
    const chunks = [];
    await new Promise(resolve => { process.stdin.on('data', d => chunks.push(d)); process.stdin.on('end', resolve); });
    try { input = JSON.parse(Buffer.concat(chunks).toString()); }
    catch (e) { console.error(JSON.stringify({ softill: 'diff-review', result: 'ERROR', summary: `Parse: ${e.message}`, data: null })); process.exit(1); }
  }
  const out = await handle(input);
  const full = Object.assign({ softill: 'diff-review' }, out);
  const jsonOutput = { ...full };
  delete jsonOutput._evidence;
  console.log(JSON.stringify(jsonOutput, null, 2));
  process.exit(out.result === 'PASS' ? 0 : 1);
}

const cliPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (cliPath && cliPath === modulePath) cli();
