#!/usr/bin/env node
/**
 * test-runner — Softill: 安全执行白名单测试命令 (Reforged Wave 2)
 *
 * 核心变化：
 *   1. Organ Runtime 是唯一执行路径（移除直连 child_process.spawn）
 *   2. 结果分类扩展为六类：
 *      tests-passed / test-failure / execution-error / timeout / permission-blocked / environment-missing
 *   3. 会话级 Organ 不可用时返回 BLOCKED（不回退到非受管执行）
 *
 * Identity: 独立 Softill（稳定任务能力）
 * Legacy Origin: legacy-snapshot-2026-07-11/softills/test-runner/handler.js
 *
 * 输入: { command, cwd?, timeoutMs?, maxOutputChars?, allowedCommands? }
 * 输出: {
 *   result: 'tests-passed' | 'test-failure' | 'execution-error' | 'timeout' | 'permission-blocked' | 'environment-missing',
 *   summary: string,
 *   data: { exitCode, durationMs, failures, stdoutPreview, stderrPreview },
 *   evidence: []
 * }
 *
 * 用法:
 *   echo '{"command":"node --version","allowedCommands":["node --version"]}' | node handler.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCommand } from './lib/run-command.mjs';
import { isAllowed, isDangerous } from './lib/security.mjs';
import { classify } from './lib/classify-failure.mjs';
import { redact, formatHuman } from './lib/redact-output.mjs';

// ─── Result classification mapping ────────────────────────────────────────────

const RESULT = Object.freeze({
  TESTS_PASSED:        'tests-passed',
  TEST_FAILURE:        'test-failure',
  EXECUTION_ERROR:     'execution-error',
  TIMEOUT:             'timeout',
  PERMISSION_BLOCKED:  'permission-blocked',
  ENVIRONMENT_MISSING: 'environment-missing',
});

// ─── Core handler ─────────────────────────────────────────────────────────────

export async function handle(input) {
  // ── Validate ──
  if (!input || typeof input !== 'object') {
    return {
      result: RESULT.EXECUTION_ERROR,
      summary: 'Input must be a JSON object.',
      data: null,
      evidence: [{ type: 'input_error', result: RESULT.EXECUTION_ERROR, summary: 'Invalid input type' }],
    };
  }

  const command = (input.command || '').trim();
  const cwd = input.cwd || process.cwd();
  const timeoutMs = input.timeoutMs || 30000;
  const maxOutputChars = input.maxOutputChars || 6000;
  const allowedCommands = input.allowedCommands || [];

  // ── Security checks ──
  if (!command) {
    return {
      result: RESULT.PERMISSION_BLOCKED,
      summary: 'Command is empty.',
      data: null,
      evidence: [{ type: 'security', result: RESULT.PERMISSION_BLOCKED, summary: 'Empty command rejected' }],
    };
  }

  if (isDangerous(command)) {
    return {
      result: RESULT.PERMISSION_BLOCKED,
      summary: 'Command contains dangerous pattern.',
      data: null,
      evidence: [{ type: 'security', result: RESULT.PERMISSION_BLOCKED, summary: `Dangerous command rejected: ${command.slice(0, 100)}` }],
    };
  }

  if (!isAllowed(command, allowedCommands)) {
    return {
      result: RESULT.PERMISSION_BLOCKED,
      summary: 'Command is not in allowedCommands whitelist.',
      data: null,
      evidence: [{ type: 'security', result: RESULT.PERMISSION_BLOCKED, summary: `Command not whitelisted: ${command.slice(0, 100)}` }],
    };
  }

  // ── Execute via Organ (sole execution path) ──
  const result = await runCommand(command, cwd, timeoutMs, {
    maxOutputChars,
    allowedCommands,
  });

  const { exitCode, stdout, stderr, durationMs, timedOut, environmentMissing, executionError } = result;

  // ── Classify result ──

  // 1. Timeout
  if (timedOut) {
    return {
      result: RESULT.TIMEOUT,
      summary: `Command timed out after ${timeoutMs}ms.`,
      data: { exitCode: null, durationMs, failures: [{ type: 'timeout', message: `Exceeded ${timeoutMs}ms` }], stdoutPreview: redact(stdout, maxOutputChars / 2).preview, stderrPreview: redact(stderr, maxOutputChars / 2).preview },
      evidence: [{ type: 'timeout', result: RESULT.TIMEOUT, summary: `Command timed out: ${command.slice(0, 100)}` }],
    };
  }

  // 2. Environment missing (binary/tool not found)
  if (environmentMissing) {
    return {
      result: RESULT.ENVIRONMENT_MISSING,
      summary: `Required command/tool not found in environment: ${command.slice(0, 100)}`,
      data: { exitCode: null, durationMs, failures: [{ type: 'environment', message: stderr.slice(0, 300) }], stdoutPreview: '', stderrPreview: redact(stderr, maxOutputChars / 2).preview },
      evidence: [{ type: 'environment', result: RESULT.ENVIRONMENT_MISSING, summary: `Tool not found: ${command.slice(0, 100)}` }],
    };
  }

  // 3. Execution error (crashed, adapter error, signal)
  if (executionError) {
    return {
      result: RESULT.EXECUTION_ERROR,
      summary: `Command execution failed: ${executionError.slice(0, 200)}`,
      data: { exitCode, durationMs, failures: [{ type: 'execution', message: executionError.slice(0, 300) }], stdoutPreview: redact(stdout, maxOutputChars / 2).preview, stderrPreview: redact(stderr, maxOutputChars / 2).preview },
      evidence: [{ type: 'execution_error', result: RESULT.EXECUTION_ERROR, summary: executionError.slice(0, 200) }],
    };
  }

  // 4. Exit code 0 — tests passed
  if (exitCode === 0) {
    return {
      result: RESULT.TESTS_PASSED,
      summary: 'All tests passed.',
      data: { exitCode, durationMs, failures: [], stdoutPreview: redact(stdout, maxOutputChars / 2).preview, stderrPreview: redact(stderr, maxOutputChars / 2).preview },
      evidence: [{ type: 'test_result', result: RESULT.TESTS_PASSED, summary: `Tests passed (exit 0, ${durationMs}ms)` }],
    };
  }

  // 5. Exit code non-zero — test failure
  const failures = classify(stderr + '\n' + stdout).slice(0, 10);
  return {
    result: RESULT.TEST_FAILURE,
    summary: `Test command failed (exit ${exitCode}) with ${failures.length} failure lines.`,
    data: { exitCode, durationMs, failures, stdoutPreview: redact(stdout, maxOutputChars / 2).preview, stderrPreview: redact(stderr, maxOutputChars / 2).preview },
    evidence: [
      { type: 'test_result', result: RESULT.TEST_FAILURE, summary: `Tests failed (exit ${exitCode}, ${durationMs}ms)` },
      ...failures.map(f => ({ type: 'test_failure', result: RESULT.TEST_FAILURE, summary: f.message.slice(0, 200) })),
    ],
  };
}

// ── CLI entry ──

async function cli() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); }
    catch (e) { console.error(JSON.stringify({ softill: 'test-runner', result: RESULT.EXECUTION_ERROR, summary: `Read: ${e.message}`, data: null, evidence: [] })); process.exit(1); }
  } else {
    const chunks = [];
    await new Promise(resolve => { process.stdin.on('data', d => chunks.push(d)); process.stdin.on('end', resolve); });
    try { input = JSON.parse(Buffer.concat(chunks).toString()); }
    catch (e) { console.error(JSON.stringify({ softill: 'test-runner', result: RESULT.EXECUTION_ERROR, summary: `Parse: ${e.message}`, data: null, evidence: [] })); process.exit(1); }
  }
  const out = await handle(input);
  const full = Object.assign({ softill: 'test-runner' }, out);
  console.log(formatHuman(out));
  console.log(JSON.stringify(full, null, 2));
  process.exit(out.result === RESULT.TESTS_PASSED ? 0 : 1);
}

const cliPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (cliPath && cliPath === modulePath) cli();
