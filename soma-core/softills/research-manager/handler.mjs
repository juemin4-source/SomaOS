#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * research-manager — handler.js
 * 进入/退出产品研究模式。依赖 research-mode.js 子模块。
 *
 * 注意：research-mode.js 是独立子模块，不在 07-verified-softills/ 内。
 * 若未安装，会返回清晰提示而非静默崩溃。
 */

import { execSync } from 'child_process';

import fs from 'fs';

import path from 'path';

const RESEARCH_MODE_CANDIDATES = [
  path.resolve(__dirname, '..', '..', 'soma', 'research', 'src', 'research-mode.js'),
  path.resolve(__dirname, '..', '..', 'research', 'src', 'research-mode.js'),
  path.resolve(__dirname, '..', '..', 'somaos', 'research', 'research-mode.js'),
];

/** 查找 research-mode.js 的有效路径 */
function findResearchMode() {
  for (const p of RESEARCH_MODE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); }
  } else {
    const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(c).toString()); } catch (e) { return out('ERROR', 'Parse: ' + e.message); } h(input); }); return;
  }
  h(input);
}

function h(input) {
  const researchMode = findResearchMode();
  if (!researchMode) {
    return out('UNAVAILABLE', 'research-mode.js 模块未安装。需要独立的 research-mode 子模块。', {
      note: 'research-manager 需要 research-mode.js 子模块才能工作。' +
        '该模块不在 07-verified-softills 中，需要单独部署。检查 Soma Trinity Lab 安装完整性。',
    });
  }

  const mode = input.mode || input.action || 'enter';
  try {
    let cmd;
    if (mode === 'enter') {
      const goal = input.goal || input.description || '产品研究';
      cmd = `node "${researchMode}" --mode winter-research --goal "${goal}"`;
    } else if (mode === 'exit') {
      cmd = `node "${researchMode}" --exit`;
    } else if (mode === 'status') {
      cmd = `node "${researchMode}" --status`;
    } else {
      return out('ERROR', '未知模式: ' + mode);
    }
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    const result = JSON.parse(stdout);
    return out(result.ok ? 'PASS' : 'ERROR', result.label || '研究模式操作完成', result);
  } catch (e) { return out('ERROR', e.message); }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'research-manager', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();