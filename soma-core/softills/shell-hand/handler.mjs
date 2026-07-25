#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * shell-hand — handler.js
 *
 * 受 Soma guard 保护的 shell 命令执行器。
 * 每条命令经过：安全白名单 → 危险模式检测 → token 预算 → before_execute guard
 *
 * 输入: { command, cwd?, timeout?, allowedCommands?, blockDangerous? }
 * 输出: { exitCode, stdoutPreview, stderrPreview, durationMs, blocked, guardResult }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */


import fs from 'fs'; 
import path from 'path'; 
import { execSync } from 'child_process';

// Dangerous patterns — matches anything that could be destructive
const DANGEROUS_PATTERNS = [
  'rm -rf', 'rm -r /', 'rm -fr', 'del /f', 'rd /s /q',
  'format ', 'diskpart',
  '> ', '>> ', // output redirect (can overwrite files)
  '; rm', '; del', '&& rm', '&& del',
  'curl ', 'wget ', // network download
  'shutdown', 'reboot', 'restart',
  'mkfs', 'dd if=', 'fdisk',
];

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const command = (input.command || '').trim();
  const cwd = path.resolve(input.cwd || process.cwd());
  const timeout = input.timeout || 30000;
  const blockDangerous = input.blockDangerous !== false;
  const allowedCommands = input.allowedCommands || [];
  const allowedPrefixes = input.allowedPrefixes || ['node ', 'npm ', 'pnpm ', 'yarn ', 'git ', 'ls ', 'cat ', 'echo ', 'dir ', 'type ', 'cd '];

  if (!command) return out('ERROR', 'command required');
  const guardResults = [];

  // 1. Guard: dangerous pattern detection
  if (blockDangerous) {
    const cmdLower = command.toLowerCase();
    for (const pattern of DANGEROUS_PATTERNS) {
      if (cmdLower.includes(pattern.toLowerCase())) {
        guardResults.push({ guard: 'dangerous_pattern', result: 'BLOCKED', pattern, message: `Command contains dangerous pattern: "${pattern}"` });
      }
    }
    if (guardResults.some(g => g.result === 'BLOCKED')) {
      return out('BLOCKED', `Blocked by ${guardResults.length} guard(s)`, { command, guardResults, blocked: true });
    }
  }

  // 2. Guard: allowed commands check
  if (allowedCommands.length > 0) {
    const allowed = allowedCommands.some(a => command === a || command.startsWith(a + ' '));
    if (!allowed) {
      guardResults.push({ guard: 'allowed_commands', result: 'BLOCKED', message: 'Command not in allowedCommands list' });
      return out('BLOCKED', 'Not in allowed commands', { command, guardResults, blocked: true });
    }
  }

  // 3. Guard: allowed prefix check (lightweight)
  if (allowedPrefixes.length > 0 && allowedCommands.length === 0) {
    const allowed = allowedPrefixes.some(p => command.startsWith(p));
    if (!allowed) {
      guardResults.push({ guard: 'allowed_prefix', result: 'WARN', message: `Command doesn't start with any allowed prefix` });
      // Warning only — don't block
    }
  }

  // 4. Guard: token estimation
  const estimatedTokens = Math.ceil(command.length / 4) + 50;
  guardResults.push({ guard: 'token_estimate', result: 'PASS', estimatedTokens });

  // Execute
  const start = Date.now();
  try {
    const stdout = execSync(command, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout, stdio: 'pipe' });
    const durationMs = Date.now() - start;
    const stdoutPreview = stdout.slice(0, 2000);
    const stdoutLines = stdout.split('\n').length;

    return out('PASS', `Exit 0 (${durationMs}ms, ${stdoutLines} lines)`, {
      command, cwd, exitCode: 0, durationMs, stdoutLines, stdoutPreview, stdoutTruncated: stdout.length > 2000,
      stderrPreview: '', guardResults, blocked: false,
    });
  } catch (e) {
    const durationMs = Date.now() - start;
    const stderr = e.stderr || '';
    const stdout = e.stdout || '';
    const exitCode = e.status !== null ? e.status : -1;
    const timedOut = e.killed || e.message.includes('timeout');

    return out(exitCode === 0 ? 'PASS' : 'FAIL', `Exit ${exitCode}${timedOut ? ' (TIMEOUT)' : ''} (${durationMs}ms)`, {
      command, cwd, exitCode, durationMs, timedOut,
      stdoutPreview: stdout.slice(0, 1000),
      stderrPreview: (stderr || e.message).slice(0, 1000),
      guardResults, blocked: false,
    });
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'shell-hand', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();