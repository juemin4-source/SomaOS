/**
 * run-command.mjs — test-runner command execution via child_process
 *
 * 安全执行白名单命令，支持超时和输出截断。
 * Organ Runtime 不可用时回退到直接 child_process 执行。
 * 不使用 filesystem.subprocess Organ（非受管环境独立可用）。
 */

import { spawn } from 'child_process';

export async function runCommand(command, cwd, timeoutMs, opts = {}) {
  const maxOutputChars = opts.maxOutputChars || 6000;
  const start = Date.now();
  const parts = splitCommand(command);
  const cmd = parts[0];
  const args = parts.slice(1);

  return new Promise(resolve => {
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let killed = false;

    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        shell: process.platform === 'win32', // Windows 需要 shell
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      return resolve({
        exitCode: null, stdout: '', stderr: e.message,
        durationMs: Date.now() - start,
        timedOut: false, environmentMissing: true, executionError: e.message,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill('SIGTERM');
      // 等 2s 后强杀
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > maxOutputChars) {
        stdout = stdout.slice(0, maxOutputChars);
        child.stdout.pause();
      }
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > maxOutputChars) {
        stderr = stderr.slice(0, maxOutputChars);
        child.stderr.pause();
      }
    });

    child.on('error', err => {
      clearTimeout(timer);
      const isMissing = err.code === 'ENOENT';
      resolve({
        exitCode: null, stdout, stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false, environmentMissing: isMissing, executionError: err.message,
      });
    });

    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        exitCode: timedOut ? null : code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        environmentMissing: false,
        executionError: killed && !timedOut ? 'Process killed' : null,
      });
    });
  });
}

function splitCommand(cmd) {
  // 简单的命令行分割（处理引号）
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const ch of cmd.trim()) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);

  // Windows: 如果第一个参数是 npm/node 等，保留
  if (args.length === 0) args.push(cmd.trim());
  return args;
}
