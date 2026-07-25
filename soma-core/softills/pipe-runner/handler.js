#!/usr/bin/env node
/**
 * pipe-runner — handler.js
 *
 * Softill 编排引擎。依赖解析 + DAG 调度 + 并行执行。
 *
 * 输入:
 * {
 *   pipe: ["git-tools", "change-impact-analyzer"],  ← 自动解析依赖
 *   input: { action: "diff" },                      ← 初始输入
 *   resolve: true,                                  ← 自动补全依赖链
 *   parallel: true,                                 ← 并行执行无依赖步骤
 *   stopOnFailure: true                             ← 失败停链
 * }
 *
 * 输出: { pipe: [{softill, status, duration}], dag, totalDuration }
 */

const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');

const SOFTILLS = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(SOFTILLS, 'softill-registry.json');

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); } catch { return { softills: {} }; }
}

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  let steps = (input.pipe || input.steps || []).map(s => typeof s === 'string' ? { name: s } : { name: s.softill || s.name, input: s.input });
  const initialInput = input.input || {};
  const resolve = input.resolve !== false;
  const doParallel = input.parallel !== false;
  const stopOnFailure = input.stopOnFailure !== false;
  const reg = loadRegistry();

  // 1. Resolve dependencies
  if (resolve) {
    const resolved = [];
    const seen = new Set();
    for (const step of steps) {
      resolveDeps(step.name, reg, seen, resolved);
      if (!seen.has(step.name)) { seen.add(step.name); resolved.push(step); }
    }
    steps = resolved;
  }

  // 2. Build DAG
  const dag = buildDAG(steps, reg);
  const levels = dag.levels; // array of arrays: [[独立步骤], [依赖他们的步骤], ...]

  // 3. Execute level by level (parallel within each level)
  const results = [];
  let failed = false;
  const dataCache = { _initial: initialInput };
  const startTime = Date.now();

  for (let li = 0; li < levels.length; li++) {
    if (failed && stopOnFailure) break;

    const level = levels[li];
    const levelResults = [];

    for (const stepName of level) {
      if (failed && stopOnFailure) break;
      const stepDef = steps.find(s => s.name === stepName) || { name: stepName };
      const stepInput = stepDef.input || {};
      const hp = path.join(SOFTILLS, stepName, 'handler.js');

      if (!fs.existsSync(hp)) {
        levelResults.push({ step: stepName, status: 'FAIL', error: 'handler.js not found' });
        if (stopOnFailure) { failed = true; break; }
        continue;
      }

      // Merge data from dependencies
      const depInput = {};
      const meta = reg.softills[stepName] || {};
      const deps = meta.depends || [];
      for (const dep of deps) {
        const depResult = results.find(r => r.softill === dep);
        if (depResult && depResult.data) {
          Object.assign(depInput, depResult.data);
        }
      }

      const mergedInput = { ...initialInput, ...dataCache._initial, ...depInput, ...stepInput };
      const stepStart = Date.now();

      try {
        const tmpFile = path.join(SOFTILLS, '..', 'soma', 'runtime', '.inputs', `dag_${stepName}_${Date.now()}.json`);
        if (!fs.existsSync(path.dirname(tmpFile))) fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, JSON.stringify(mergedInput), 'utf-8');

        const r = spawnSync('node', [hp, tmpFile], { encoding: 'utf-8', timeout: meta.defaultCost === 'medium' ? 60000 : 30000, maxBuffer: 10 * 1024 * 1024 });
        try { fs.unlinkSync(tmpFile); } catch {}

        let output = parseJsonOutput(r.stdout);
        const duration = Date.now() - stepStart;

        const stepResult = {
          softill: stepName, status: output?.result || 'PASS',
          summary: output?.summary || `executed (${duration}ms)`,
          duration: duration + 'ms', data: output?.data || null,
          level: li,
        };
        levelResults.push(stepResult);
        dataCache[stepName] = output?.data || {};

        if (output && (output.result === 'ERROR' || output.result === 'BLOCKED')) {
          if (stopOnFailure) failed = true;
        }
      } catch (e) {
        levelResults.push({ softill: stepName, status: 'ERROR', error: e.message, duration: Date.now() - stepStart + 'ms' });
        if (stopOnFailure) { failed = true; break; }
      }
    }

    results.push(...levelResults);
  }

  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'PASS' || r.status === 'FOUND').length;

  return out(failed ? 'PARTIAL' : 'PASS',
    `${results.length} steps in ${levels.length} levels: ${passed} pass${failed ? ', failed' : ', all passed'} (${totalDuration}ms)`,
    { pipe: results, dag: { levels: levels.map((l, i) => ({ level: i, steps: l })), levelCount: levels.length }, stepCount: results.length, passed, failed, totalDuration: totalDuration + 'ms' }
  );
}

function resolveDeps(name, reg, seen, resolved) {
  const meta = reg.softills[name] || {};
  const deps = meta.depends || [];
  for (const dep of deps) {
    if (!seen.has(dep)) {
      seen.add(dep);
      resolveDeps(dep, reg, seen, resolved);
      resolved.push({ name: dep, _auto: true });
    }
  }
}

function buildDAG(steps, reg) {
  const adjList = {}; // step → [dependents] (who depends on me)
  const inDegree = {}; // how many deps does each step have
  const nameSet = new Set(steps.map(s => s.name));
  const allNames = [...nameSet];

  // Add auto-resolved deps
  for (const step of steps) {
    const meta = reg.softills[step.name] || {};
    const deps = meta.depends || [];
    for (const dep of deps) {
      if (!adjList[dep]) adjList[dep] = [];
      adjList[dep].push(step.name);
      if (!nameSet.has(dep)) {
        // auto-dep not in explicit steps, add it
        allNames.push(dep);
        nameSet.add(dep);
      }
    }
  }

  for (const n of allNames) {
    if (!inDegree[n]) inDegree[n] = 0;
    if (!adjList[n]) adjList[n] = [];
  }

  for (const step of steps) {
    const meta = reg.softills[step.name] || {};
    const deps = meta.depends || [];
    for (const dep of deps) {
      if (!adjList[dep]) adjList[dep] = [];
      adjList[dep].push(step.name);
      if (inDegree[step.name] === undefined) inDegree[step.name] = 0;
      inDegree[step.name]++;
    }
  }

  // Topological sort with levels (Kahn's algorithm)
  const levels = [];
  let queue = allNames.filter(n => (inDegree[n] || 0) === 0);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue = [];
    for (const n of queue) {
      for (const dep of (adjList[n] || [])) {
        inDegree[dep]--;
        if (inDegree[dep] === 0) nextQueue.push(dep);
      }
    }
    queue = nextQueue;
  }

  return { levels, adjList };
}

function parseJsonOutput(stdout) {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('{')) {
      try { return JSON.parse(lines.slice(i).join('\n')); } catch {}
    }
  }
  return null;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'pipe-runner', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
