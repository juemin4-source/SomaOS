#!/usr/bin/env node
/**
 * flue-eye — handler.mjs
 *
 * 通过 Flue 桥接层操控桌面软件。
 * 直接调用各软件 adapter 的 bridge 脚本（COM / AppleScript / CEP HTTP）。
 *
 * == 输入 ==
 *   {
 *     action: "software" | "context" | "run" | "modal" | "test" | "install" | "version",
 *     app: "audition" | "excel" | "photoshop" | ...,   // 目标软件
 *     script: "...",          // 要执行的代码（run 模式）
 *     timeout: 60,            // 超时秒数
 *     allow_launch: false,    // 是否自动启动软件
 *     modal_action: "list" | "dismiss",
 *   }
 *
 * == 输出 ==
 *   { result, summary, data, evidence }
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync } from 'child_process';

// ─── Flue 安装根目录探测 ───

function findFlueRoot() {
  try {
    const r = spawnSync('python', ['-c', 'import flue, os; print(os.path.dirname(os.path.dirname(flue.__file__)))'], {
      timeout: 5000, encoding: 'utf-8',
    });
    if (r.status === 0) return r.stdout.trim();
  } catch {}
  // Fallback: common install paths
  const candidates = [
    join(process.env.APPDATA || 'C:/Users/default', '..', 'Local', 'Programs', 'Python', 'Python312', 'Lib', 'site-packages'),
    '/usr/local/lib/python3.12/site-packages',
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'flue'))) return p;
  }
  return null;
}

function findPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    try {
      const r = spawnSync(cmd, ['--version'], { timeout: 3000, encoding: 'utf-8' });
      if (r.status === 0) return cmd;
    } catch {}
  }
  return 'python';
}

const FLUE_ROOT = findFlueRoot();
const PYTHON = findPython();

function adapterDir(app) {
  return join(FLUE_ROOT, 'adapters', `${app}_adapter`);
}

function bridgeScript(app) {
  return join(adapterDir(app), `${app}_bridge.py`);
}

function contextScript(app) {
  const examplesDir = join(adapterDir(app), 'examples');
  if (!existsSync(examplesDir)) return null;
  const files = readdirSync(examplesDir);
  const contextFile = files.find(f => f.startsWith('context.'));
  return contextFile ? join(examplesDir, contextFile) : null;
}

// ─── 执行 Bridge ───

function runBridge(app, script, timeout = 30, allowLaunch = false) {
  const bridge = bridgeScript(app);
  if (!existsSync(bridge)) {
    return { error: `未找到 ${app} 的 bridge 脚本: ${bridge}` };
  }

  const args = [bridge, '--stdin'];
  if (allowLaunch) args.push('--allow-launch');

  const result = spawnSync(PYTHON, args, {
    input: script,
    timeout: timeout * 1000,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    return { error: `Bridge 执行失败: ${result.error.message}` };
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function runFlueCli(args, timeout = 30) {
  const result = spawnSync(PYTHON, ['-m', 'flue.cli', ...args], {
    timeout: timeout * 1000,
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

// ─── Actions ───

function actionVersion() {
  const r = runFlueCli(['version'], 10);
  if (r.exitCode !== 0) {
    return { result: 'ERROR', summary: 'Flue 未安装', data: {} };
  }
  return {
    result: 'PASS',
    summary: `Flue ${r.stdout.trim()} (根目录: ${FLUE_ROOT})`,
    data: { version: r.stdout.trim(), root: FLUE_ROOT, python: PYTHON },
  };
}

function actionSoftware() {
  const r = runFlueCli(['software'], 15);
  if (r.exitCode !== 0) {
    return { result: 'ERROR', summary: '获取软件列表失败', data: {} };
  }
  const lines = r.stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
  // Check which ones have adapters actually installed
  const available = lines.filter(app => existsSync(bridgeScript(app)));
  return {
    result: 'PASS',
    summary: `Flue 支持 ${lines.length} 款软件，本机适配器就绪 ${available.length}`,
    data: { all: lines, ready: available },
    evidence: [{ type: 'software_list', result: 'PASS', summary: `${available.length} 适配器就绪` }],
  };
}

function actionContext(input) {
  const app = (input.app || '').toLowerCase();
  if (!app) return { result: 'ERROR', summary: '需要 app 参数', data: {} };

  const cs = contextScript(app);
  if (!cs) {
    return { result: 'ERROR', summary: `${app} 没有预置 context 脚本`, data: {} };
  }

  const script = readFileSync(cs, 'utf-8');
  const timeout = parseInt(input.timeout) || 30;
  const r = runBridge(app, script, timeout, input.allow_launch);

  if (r.error) return { result: 'ERROR', summary: r.error, data: { app } };
  if (r.exitCode !== 0) {
    return {
      result: 'ERROR',
      summary: `${app} context 获取失败`,
      data: { app, stderr: r.stderr.slice(0, 500) },
    };
  }
  return parseBridgeOutput(r, app, 'context');
}

function actionRun(input) {
  const app = (input.app || '').toLowerCase();
  if (!app) return { result: 'ERROR', summary: '需要 app 参数', data: {} };

  let script = input.script || '';
  if (!script) return { result: 'ERROR', summary: '需要 script 参数（要执行的代码）', data: {} };

  const timeout = parseInt(input.timeout) || 30;
  const allowLaunch = input.allow_launch === true;
  const r = runBridge(app, script, timeout, allowLaunch);

  if (r.error) return { result: 'ERROR', summary: r.error, data: { app } };
  return parseBridgeOutput(r, app, 'run');
}

function actionModal(input) {
  const app = (input.app || '').toLowerCase();
  if (!app) return { result: 'ERROR', summary: '需要 app 参数', data: {} };

  const action = input.modal_action || 'list';
  const args = ['modal', app];
  if (action === 'dismiss') args.push('--dismiss');

  const r = runFlueCli(args, 15);
  if (r.exitCode !== 0) {
    return { result: 'ERROR', summary: `${app} 模态框检测失败`, data: { stderr: r.stderr.slice(0, 500) } };
  }
  return {
    result: 'PASS',
    summary: `${app} 模态框: ${r.stdout.trim() || '无'}`,
    data: { output: r.stdout.trim() },
  };
}

function actionTest(input) {
  const app = (input.app || '').toLowerCase();
  if (!app) return { result: 'ERROR', summary: '需要 app 参数', data: {} };

  const r = runFlueCli(['test', app], 30);
  if (r.exitCode !== 0) {
    return { result: 'ERROR', summary: `${app} 测试失败`, data: { output: r.stderr.slice(0, 500) } };
  }
  return {
    result: 'PASS',
    summary: `${app} 测试通过`,
    data: { output: r.stdout.trim() },
  };
}

function actionInstall(input) {
  const app = (input.app || '').toLowerCase();
  if (!app) return { result: 'ERROR', summary: '需要 app 参数', data: {} };

  const r = runFlueCli(['install', app], 60);
  if (r.exitCode !== 0) {
    return { result: 'ERROR', summary: `${app} 安装失败`, data: { stderr: r.stderr.slice(0, 500) } };
  }
  return {
    result: 'PASS',
    summary: `${app} 适配器安装完成`,
    data: { output: r.stdout.trim() },
  };
}

// ─── 输出解析 ───

function parseBridgeOutput(r, app, actionName) {
  // Flue bridge returns JSON on stdout for success, JSON on stderr for errors
  // Try stdout first
  let parsed = null;
  if (r.stdout.trim()) {
    try { parsed = JSON.parse(r.stdout.trim()); } catch {}
  }
  if (!parsed && r.stderr.trim()) {
    try { parsed = JSON.parse(r.stderr.trim()); } catch {}
  }

  if (parsed) {
    if (parsed.ok === true) {
      return {
        result: 'PASS',
        summary: `${app} ${actionName} 成功`,
        data: { app, result: parsed.result ?? null, stdout: parsed.stdout ?? null },
        evidence: [{ type: `flue_${actionName}`, result: 'PASS', summary: `${app} ${actionName}` }],
      };
    }
    return {
      result: 'ERROR',
      summary: `${app} ${actionName}: ${(parsed.error || '').slice(0, 300)}`,
      data: { app, error: parsed.error, traceback: parsed.traceback },
    };
  }

  // Non-JSON output
  if (r.exitCode === 0 || r.exitCode === undefined) {
    return {
      result: 'PASS',
      summary: `${app} ${actionName} 完成`,
      data: { app, output: (r.stdout || r.stderr || '').slice(0, 2000) },
    };
  }

  return {
    result: 'ERROR',
    summary: `${app} ${actionName} 失败`,
    data: { app, stdout: r.stdout.slice(0, 500), stderr: r.stderr.slice(0, 500) },
  };
}

// ─── Handler ───

export function handle(input = {}) {
  try {
    return handleImpl(input);
  } catch (err) {
    return {
      result: 'ERROR',
      summary: err.message || '未处理的错误',
      data: {},
      evidence: [{ type: 'error', result: 'ERROR', summary: err.message?.slice(0, 200) }],
    };
  }
}

function handleImpl(input) {
  if (!input || typeof input !== 'object') {
    return { result: 'ERROR', summary: '输入必须是 JSON 对象', data: {} };
  }

  if (!FLUE_ROOT) {
    return { result: 'ERROR', summary: 'Flue 未安装。请运行: pip install flue', data: {} };
  }

  const action = input.action || 'version';

  switch (action) {
    case 'version': return actionVersion();
    case 'software': return actionSoftware();
    case 'context': return actionContext(input);
    case 'run': return actionRun(input);
    case 'modal': return actionModal(input);
    case 'test': return actionTest(input);
    case 'install': return actionInstall(input);
    default:
      return {
        result: 'ERROR',
        summary: `未知 action: "${action}"`,
        data: { supported_actions: ['version', 'software', 'context', 'run', 'modal', 'test', 'install'] },
      };
  }
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
      console.log(JSON.stringify({ result: 'ERROR', summary: e.message, data: {}, evidence: [] }));
      process.exit(1);
    }
  });
}

const __filename = resolve(process.argv[1] || '');
if (__filename === resolve(fileURLToPath(import.meta.url).replace(/^file:\/\//, ''))) {
  cli();
}

export default handle;
