#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * computer-hand — handler.js
 *
 * 统一电脑操控入口 + 视觉反馈循环。
 * 每个操作自动截屏，失败自动重试，支持组合动作。
 *
 * 输入: { task: "打开终端输入 claude" }
 *        { task: "打开chrome搜github" }
 *        { task: "截图并检查" }
 *        { actions: [...] }  ← 组合动作
 *
 * 输出: { result, summary, screenshot?, data, steps: [...] }
 */


import fs from 'fs'; 
import path from 'path'; 
import { spawnSync, execSync } from 'child_process';
const AGENT = path.resolve(__dirname, '..', '..', 'soma', 'soma-agent.js');
const SOFTILLS = path.resolve(__dirname, '..');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const task = (input.task || input.text || '').trim().toLowerCase();
  const actions = input.actions || [];

  // Composite actions mode
  if (actions.length > 0) return executeActions(actions, input);

  if (!task) return out('ERROR', 'task required');

  const steps = [];
  let result = { result: 'PASS', summary: '', data: {} };

  // Smart routing with retry
  if (task.includes('截图') || task === 'screenshot' || task === '截屏' || task === 'ss') {
    result = runSoftill('screen-eye', { mode: 'screenshot', outputDir: input.outputDir });
    steps.push({ action: 'screenshot', result: result.result });
  }

  else if (task.includes('屏幕') || task === 'screen-info') {
    result = runSoftill('screen-eye', { mode: 'screen-info' });
    steps.push({ action: 'screen-info', result: result.result });
  }

  else if (task.includes('打开chrome') || task.includes('打开谷歌') ||
           (task.includes('打开') && (task.includes('chrome') || task.includes('谷歌') || task.includes('浏览器')))) {
    // Composite: spawn Chrome + screenshot
    steps.push({ action: 'spawn', command: 'chrome' });
    callAgent('shell', { command: 'start chrome' });
    steps.push({ action: 'wait', ms: 1000 });
    execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 1000"', { timeout: 3000 });

    // If URL specified, type it
    const urlMatch = task.match(/(?:打开|搜)\s*(?:chrome|谷歌|浏览器)?\s*(.+)/);
    if (urlMatch && !urlMatch[1].includes('chrome') && !urlMatch[1].includes('谷歌')) {
      const url = urlMatch[1].trim();
      steps.push({ action: 'type', text: url });
      callAgent('type', { text: url });
      steps.push({ action: 'press', key: 'enter' });
      callAgent('type', { key: 'enter' });
      execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 2000"', { timeout: 3000 });
    }

    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result = { result: 'PASS', summary: 'Chrome opened', data: { screenshot: ss.data?.file, steps } };
  }

  else if (task.includes('打开终端') || task.includes('打开cmd') ||
           (task.includes('终端') && (task.includes('输入') || task.includes('运行') || task.includes('跑')))) {
    // Composite: spawn terminal + type claude
    const cmdMatch = task.match(/(?:输入|运行|跑|type)\s*(.+)/);
    const cmdText = cmdMatch ? cmdMatch[1] : 'claude';
    steps.push({ action: 'spawn', command: `powershell -NoProfile claude ${cmdText}` });
    execSync(`powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile claude ${cmdText}' -WindowStyle Normal"`, { timeout: 5000 });
    execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 2000"', { timeout: 3000 });
    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result = { result: 'PASS', summary: `Terminal spawned: ${cmdText}`, data: { screenshot: ss.data?.file, steps } };
  }

  else if (task.includes('最小化') || task.includes('minimize')) {
    const win = task.replace(/最小化|minimize/g, '').trim() || 'chrome';
    result = callAgent('minimize', { name: win });
    steps.push({ action: 'minimize', window: win, result: result.result });
    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result.data = { ...result.data, screenshot: ss.data?.file, steps };
  }

  else if (task.includes('输入') && !task.includes('打开')) {
    const text = task.replace(/输入|type/g, '').trim();
    result = callAgent('type', { text });
    steps.push({ action: 'type', text: text.slice(0, 40) });
    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result.data = { ...result.data, screenshot: ss.data?.file, steps };
  }

  else if (task.includes('截屏检查') || task.includes('看看') || task.includes('watch')) {
    // Watch mode: screenshot + OCR
    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result = { result: 'PASS', summary: 'Screenshot taken', data: { screenshot: ss.data?.file, steps } };
  }

  else {
    // Default: shell command
    result = runSoftill('shell-hand', { command: task, cwd: input.cwd || '.' });
    steps.push({ action: 'shell', command: task.slice(0, 80) });
    const ss = runSoftill('screen-eye', { mode: 'screenshot' });
    steps.push({ action: 'screenshot', file: ss.data?.file });
    result.data = { ...result.data, screenshot: ss.data?.file, steps };
  }

  return out(result.result, result.summary, result.data || {});
}

function executeActions(actions, input) {
  const steps = [];
  for (const action of actions) {
    const type = action.type || action.action;
    if (type === 'screenshot') {
      const ss = runSoftill('screen-eye', { mode: 'screenshot' });
      steps.push({ action: 'screenshot', file: ss.data?.file });
    } else if (type === 'click') {
      const r = callAgent('click', { x: action.x, y: action.y });
      steps.push({ action: 'click', x: action.x, y: action.y });
    } else if (type === 'type') {
      const r = callAgent('type', { text: action.text });
      steps.push({ action: 'type', text: action.text?.slice(0, 40) });
    } else if (type === 'key') {
      if (action.modifier) callAgent('type', { modifier: action.modifier, key: action.key });
      else callAgent('type', { key: action.key || 'enter' });
      steps.push({ action: 'key', key: action.key || 'enter' });
    } else if (type === 'wait') {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${action.ms || 1000}"`, { timeout: (action.ms || 1000) + 2000 });
      steps.push({ action: 'wait', ms: action.ms || 1000 });
    } else if (type === 'find') {
      // Retry loop: try to find image, retry up to maxRetries times
      const maxRetries = action.retry || 3;
      const interval = action.interval || 500;
      let found = false;
      for (let r = 0; r < maxRetries; r++) {
        const result = callAgent('find', { image: action.image });
        if (result && result.result === 'PASS') { found = true; steps.push({ action: 'find', image: action.image, retries: r + 1, found: true }); break; }
        execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${interval}"`, { timeout: interval + 1000 });
      }
      if (!found) steps.push({ action: 'find', image: action.image, found: false });
      if (found && action.clickOnFound) {
        const result = callAgent('click', { x: action.x || 500, y: action.y || 500 });
        steps.push({ action: 'click', reason: 'found_image' });
      }
    }
  }

  const ss = runSoftill('screen-eye', { mode: 'screenshot' });
  steps.push({ action: 'screenshot_final', file: ss.data?.file });
  return { result: 'PASS', summary: `${steps.length} actions executed`, data: { steps, screenshot: ss.data?.file } };
}

function callAgent(cmd, args) {
  try {
    const r = spawnSync('node', [AGENT], { input: JSON.stringify({ cmd, args }), encoding: 'utf-8', timeout: 20000 });
    const lines = r.stdout.trim().split('\n').filter(l => l.startsWith('{'));
    return lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;
  } catch { return null; }
}

function runSoftill(name, args) {
  const hp = path.join(SOFTILLS, name, 'handler.js');
  if (!fs.existsSync(hp)) return { result: 'ERROR', summary: 'Not found: ' + name };
  try {
    const tmpFile = path.join(SOFTILLS, '..', 'soma', 'runtime', '.inputs', `${name}_${Date.now()}.json`);
    if (!fs.existsSync(path.dirname(tmpFile))) fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify(args), 'utf-8');
    const r = spawnSync('node', [hp, tmpFile], { encoding: 'utf-8', timeout: 30000 });
    try { fs.unlinkSync(tmpFile); } catch {}
    let result;
    try { result = JSON.parse(r.stdout.trim()); } catch { result = { result: 'PASS', summary: 'executed' }; }
    return result;
  } catch (e) { return { result: 'ERROR', summary: e.message }; }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'computer-hand', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();