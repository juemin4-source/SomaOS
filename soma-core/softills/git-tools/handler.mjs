#!/usr/bin/env node
/**
 * git-tools — handler.mjs
 *
 * Git status/diff/log/branch with structured JSON output。
 * 通过子进程安全执行白名单 git 命令。
 *
 * 能力: Git status/diff/log/branch with structured JSON output
 * 模式: FORGE-TEMPLATE-v1（从真实实现提炼的可复用结构）
 *
 * == 输入 ==
 *   {
 *     command: "status" | "log" | "diff" | "branch",
 *     cwd?: string,           // git 仓库路径（默认 process.cwd()）
 *     args?: string[],        // 额外参数（如 ["-n","5"] 给 log）
 *     ref?: string,           // diff 的基准 ref（默认 HEAD）
 *   }
 *
 * == 输出 ==
 *   {
 *     softill: "git-tools",
 *     result: "PASS" | "ERROR",
 *     summary: string,
 *     data: { command, subcommand, ... },
 *     evidence: [{ type, result, summary }]
 *   }
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const ALLOWED_COMMANDS = ['status', 'log', 'diff', 'branch'];

export function handle(input = {}) {
  try {
    return handleImpl(input);
  } catch (err) {
    return buildError(err.message || 'Unhandled error');
  }
}

function handleImpl(input) {
  // ── Validate ──
  if (!input || typeof input !== 'object') {
    return buildError('Input must be a JSON object');
  }
  const command = (input.command || '').trim().toLowerCase();
  if (!command) return buildError('command is required (status|log|diff|branch)');
  if (!ALLOWED_COMMANDS.includes(command)) {
    return buildError(`command must be one of: ${ALLOWED_COMMANDS.join(', ')}`);
  }

  const cwd = resolve(input.cwd || process.cwd());
  const args = input.args || [];
  const ref = input.ref || 'HEAD';

  // ── Build git command ──
  let gitArgs;
  switch (command) {
    case 'status':
      gitArgs = ['status', '--porcelain', ...args];
      break;
    case 'log':
      gitArgs = ['log', '--oneline', ...args];
      break;
    case 'diff':
      gitArgs = ['diff', ref, ...args];
      break;
    case 'branch':
      gitArgs = ['branch', ...args];
      break;
    default:
      return buildError(`Unsupported command: ${command}`);
  }

  // ── Execute ──
  let stdout;
  try {
    stdout = execSync('git ' + gitArgs.join(' '), {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 1_048_576,
      windowsHide: true,
      timeout: 15000,
    });
  } catch (e) {
    return buildError(`git ${command} failed: ${(e.stderr || e.message || '').toString().slice(0, 300)}`);
  }

  // ── Parse output ──
  const lines = stdout.split('\n').filter(l => l.trim());
  let parsed;

  switch (command) {
    case 'status': {
      const files = lines.map(l => {
        const state = l.slice(0, 2).trim();
        const path = l.slice(3).trim();
        return { path, state };
      });
      const modified = files.filter(f => f.state === 'M' || f.state === ' M' || f.state === 'M ');
      const untracked = files.filter(f => f.state === '??');
      const staged = lines.filter(l => /^[MARCD]/.test(l)).map(l => ({
        path: l.slice(3).trim(),
        action: l[0],
      }));
      parsed = { files, modified, untracked, staged, total: files.length };
      break;
    }

    case 'log': {
      const commits = lines.map(l => {
        const m = l.match(/^([0-9a-f]+)\s+(.*)/);
        return m ? { hash: m[1], message: m[2].slice(0, 200) } : { raw: l.slice(0, 200) };
      });
      parsed = { commits, total: commits.length };
      break;
    }

    case 'diff': {
      const filesChanged = lines.filter(l => l.startsWith('diff --git')).length;
      const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
      const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
      parsed = {
        ref,
        filesChanged,
        additions,
        deletions,
        stdout: lines.slice(0, 200).join('\n'),
        truncated: lines.length > 200,
      };
      break;
    }

    case 'branch': {
      const branches = lines.map(l => {
        const current = l.startsWith('* ');
        const name = current ? l.slice(2).trim() : l.trim();
        return { name, current };
      });
      const current = branches.find(b => b.current)?.name || null;
      parsed = { branches, current, total: branches.length };
      break;
    }

    default:
      parsed = { raw: stdout };
  }

  // ── Build result ──
  return {
    result: 'PASS',
    summary: `git ${command}: ${lines.length} lines`,
    data: {
      command: 'git',
      subcommand: command,
      cwd,
      ...parsed,
    },
    evidence: [{
      type: 'git_command',
      result: 'PASS',
      summary: `git ${command} returned ${lines.length} lines`,
    }],
  };
}

function buildError(summary) {
  return {
    result: 'ERROR',
    summary,
    data: {},
    evidence: [{ type: 'error', result: 'ERROR', summary: summary.slice(0, 200) }],
  };
}

// ─── CLI Entry ───
function cli() {
  const chunks = [];
  process.stdin.on('data', d => chunks.push(d));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const out = handle(input);
      console.log(JSON.stringify(out, null, 2));
      process.exit(out.result === 'ERROR' ? 1 : 0);
    } catch (e) {
      console.log(JSON.stringify({ softill: 'git-tools', result: 'ERROR', summary: e.message, data: {}, evidence: [] }));
      process.exit(1);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file:///', ''))) {
  cli();
}

export default handle;
