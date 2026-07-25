#!/usr/bin/env node
/**
 * combo-runner — handler.mjs
 *
 * 读取 combo.yaml/zd/py 定义，按步骤依次执行 softill handler。
 * 支持 YAML / 周道脚本 / Python combo 三种定义。
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOFTILLS_DIR = resolve(__dirname, '..');
const COMBO_BASE = resolve('G:/AI/Claude-Workspace/Foundry/.claude/combos');

function handle(input) {
  try {
    return handleImpl(input);
  } catch (err) {
    return { result: 'ERROR', summary: err.message, data: {}, evidence: [] };
  }
}

function handleImpl(input) {
  if (!input || typeof input !== 'object') {
    return { result: 'ERROR', summary: 'Input must be a JSON object', data: {} };
  }

  const comboId = input.combo;
  if (!comboId) {
    return { result: 'ERROR', summary: 'combo id required (e.g. "code-quality-score")', data: {} };
  }

  const comboDir = resolve(COMBO_BASE, comboId);
  const vars = input.vars || {};

  // 按优先级加载 combo 定义：.py > .zd > .yaml
  const pyPath = resolve(comboDir, 'combo.py');
  const zdPath = resolve(comboDir, 'combo.zd');
  const yamlPath = resolve(comboDir, 'combo.yaml');

  if (existsSync(pyPath)) {
    return runPythonCombo(pyPath, vars, comboId);
  }
  if (existsSync(zdPath)) {
    return runZdCombo(zdPath, vars, comboId);
  }
  if (existsSync(yamlPath)) {
    return runYamlCombo(yamlPath, vars, comboId);
  }

  return { result: 'ERROR', summary: `Combo '${comboId}' not found (checked .py/.zd/.yaml)`, data: { comboDir } };
}

function runPythonCombo(pyPath, vars, comboId) {
  try {
    const pyCode = readFileSync(pyPath, 'utf-8');
    const varsJson = JSON.stringify(vars);
    // 通过 softill_bridge 调用 Python combo
    const script = `
import sys, json
sys.path.insert(0, r"${resolve(COMBO_BASE).replace(/\\/g, '\\\\')}")
from softill_bridge import run
vars = json.loads('${varsJson.replace(/'/g, "\\'")}')
result = run("${comboId}", None, vars)
print(json.dumps(result, ensure_ascii=False))
`;
    const stdout = execSync(`python -c "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
    });
    const result = JSON.parse(stdout);
    return {
      result: result.status === 'PASS' ? 'PASS' : 'ERROR',
      summary: result.summary || `Combo '${comboId}' executed`,
      data: result,
      evidence: [{ type: 'combo_executed', combo: comboId, result: result.status }],
    };
  } catch (e) {
    return { result: 'ERROR', summary: `Python combo failed: ${e.message.slice(0, 200)}`, data: {} };
  }
}

function runZdCombo(zdPath, vars, comboId) {
  try {
    const varsArg = Object.entries(vars).map(([k, v]) => `【${k}】为 ${JSON.stringify(v)}`).join('，');
    const stdout = execSync(`node "${resolve(SOFTILLS_DIR, '..', 'combo-runner', 'zhoudao-runner.js')}" "${zdPath}" ${varsArg ? '"' + varsArg + '"' : ''}`, {
      encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
    });
    const result = JSON.parse(stdout.split('\n').filter(l => l.trim().startsWith('{')).pop() || '{}');
    return { result: result.status === 'PASS' ? 'PASS' : 'ERROR', summary: result.summary || `Zd combo '${comboId}' done`, data: result, evidence: [] };
  } catch (e) {
    return { result: 'ERROR', summary: `Zd combo failed: ${e.message.slice(0, 200)}`, data: {} };
  }
}

function runYamlCombo(yamlPath, vars, comboId) {
  try {
    const content = readFileSync(yamlPath, 'utf-8');
    // 简单 YAML 解析（仅支持 steps 列表，不支持复杂结构）
    const steps = [];
    const stepRegex = /^\s*-\s+softill:\s*(\S+)\s*$/gm;
    let match;
    while ((match = stepRegex.exec(content)) !== null) {
      const softillName = match[1];
      steps.push({ softill: softillName, vars: { ...vars } });
    }

    const results = [];
    for (const step of steps) {
      try {
        const inputJson = JSON.stringify({ ...step.vars });
        const handlerPath = resolve(SOFTILLS_DIR, step.softill, 'handler.mjs');
        const altHandler = resolve(SOFTILLS_DIR, step.softill, 'handler.js');
        const handler = existsSync(handlerPath) ? handlerPath : (existsSync(altHandler) ? altHandler : null);
        if (!handler) {
          results.push({ softill: step.softill, result: 'ERROR', summary: 'Handler not found' });
          continue;
        }
        const stdout = execSync(`node "${handler}" --`, {
          input: inputJson, encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
        });
        const jsonStart = stdout.indexOf('{');
        const output = jsonStart >= 0 ? JSON.parse(stdout.slice(jsonStart)) : { result: 'ERROR', summary: 'No JSON output' };
        results.push({ softill: step.softill, result: output.result, summary: output.summary });
      } catch (e) {
        results.push({ softill: step.softill, result: 'ERROR', summary: e.message.slice(0, 200) });
      }
    }

    const failed = results.filter(r => r.result === 'ERROR');
    return {
      result: failed.length === 0 ? 'PASS' : 'FAIL',
      summary: `Combo '${comboId}': ${results.length} steps, ${failed.length} failed`,
      data: { step_results: results, final_output: results.map(r => r.result) },
      evidence: results.map(s => ({ type: 'combo_step', result: s.result, summary: `${s.softill}: ${s.summary}` })),
    };
  } catch (e) {
    return { result: 'ERROR', summary: `YAML combo failed: ${e.message.slice(0, 200)}`, data: {} };
  }
}

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(readFileSync(resolve(a), 'utf-8')); }
    catch (e) { console.error(JSON.stringify({ result: 'ERROR', summary: 'Read: ' + e.message, data: {} })); process.exit(1); return; }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(c).toString().trim();
      if (!raw) { console.error(JSON.stringify({ result: 'ERROR', summary: 'No input', data: {} })); process.exit(1); return; }
      try { input = JSON.parse(raw); } catch (e) { console.error(JSON.stringify({ result: 'ERROR', summary: 'Parse: ' + e.message, data: {} })); process.exit(1); return; }
      const result = handle(input);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.result === 'PASS' ? 0 : 1);
    });
    return;
  }
  const result = handle(input);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
