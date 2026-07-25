#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * json-query — handler.js
 *
 * JSON 查询 softill。纯 Node.js，零依赖。
 * 支持点路径访问、数组索引、管道过滤。
 *
 * 路径语法:
 *   .field                  → 取字段
 *   .field.subfield         → 嵌套字段
 *   .array.0.field          → 数组索引
 *   .array[]                → 展开数组
 *   .array[] | pick(.a,.b)  → 选取字段
 *   .array[] | filter(.v>1) → 过滤
 *   .array[] | map(.name)   → 映射
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

// ─── Path resolution ────────────────────────────────────────────────

function getPath(obj, pathStr) {
  if (!pathStr || pathStr === '.') return obj;
  const parts = pathStr.replace(/^\./, '').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    // Array index access: "0", "1", etc
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part)];
    } else if (typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// ─── Simple pipeline evaluator ──────────────────────────────────────

function evaluate(obj, pipeline) {
  let current = obj;

  for (const step of pipeline) {
    if (!step || step === '') continue;

    // Expand array: .items[]
    if (step.endsWith('[]')) {
      const arr = getPath(current, step.slice(0, -2));
      if (Array.isArray(arr)) { current = arr; continue; }
      return { error: `Not an array: ${step.slice(0, -2)}` };
    }

    // pick(.a, .b) — select fields
    const pickMatch = step.match(/^pick\(\s*([^)]+)\s*\)$/);
    if (pickMatch) {
      const fields = pickMatch[1].split(',').map(f => f.trim().replace(/^\./, ''));
      if (Array.isArray(current)) {
        current = current.map(item => {
          const picked = {};
          for (const f of fields) picked[f.replace(/^\./, '')] = getPath(item, f);
          return picked;
        });
        continue;
      }
      const picked = {};
      for (const f of fields) picked[f.replace(/^\./, '')] = getPath(current, f);
      current = picked;
      continue;
    }

    // filter(.field > N) — simple numeric comparison
    const filterMatch = step.match(/^filter\(\s*\.([a-zA-Z0-9_]+)\s*([><=!]+)\s*([^)]+)\s*\)$/);
    if (filterMatch) {
      const [, field, op, valStr] = filterMatch;
      const val = isNaN(Number(valStr)) ? valStr.replace(/['"]/g, '') : Number(valStr);
      if (!Array.isArray(current)) return { error: 'filter requires array input' };
      current = current.filter(item => {
        const itemVal = getPath(item, field);
        switch (op) {
          case '>': return itemVal > val;
          case '<': return itemVal < val;
          case '>=': return itemVal >= val;
          case '<=': return itemVal <= val;
          case '==': return itemVal == val;
          case '!=': return itemVal != val;
          default: return true;
        }
      });
      continue;
    }

    // map(.field) — project field
    const mapMatch = step.match(/^map\(\s*\.([a-zA-Z0-9_]+)\s*\)$/);
    if (mapMatch) {
      if (!Array.isArray(current)) return { error: 'map requires array input' };
      current = current.map(item => getPath(item, mapMatch[1]));
      continue;
    }

    // count
    if (step === 'count') {
      if (Array.isArray(current)) { current = current.length; continue; }
      return { error: 'count requires array input' };
    }

    // keys
    if (step === 'keys') {
      if (typeof current === 'object' && !Array.isArray(current)) { current = Object.keys(current); continue; }
      return { error: 'keys requires object input' };
    }

    // Plain path access (fallback)
    if (step.startsWith('.')) {
      current = getPath(current, step);
    } else if (/^\d+$/.test(step)) {
      // bare index for array
      if (Array.isArray(current)) current = current[parseInt(step)];
    }
  }

  return current;
}

function handle(input) {
  const query = input.query;
  const data = input.data || (input.file ? JSON.parse(fs.readFileSync(path.resolve(input.file), 'utf-8')) : null);
  const mode = input.mode || 'query';

  if (!query) return out('ERROR', 'query required');
  if (!data) return out('ERROR', 'data or file required');

  try {
    if (mode === 'validate') {
      return out('PASS', 'Query input valid', { query, dataKeys: typeof data === 'object' ? Object.keys(data).slice(0, 20) : typeof data });
    }

    // Simple dot-path: ".result" or ".pipelineResults.0.step"
    // Also handle "[]" expansion in simple paths
    if (!query.includes('|') && !query.includes('()')) {
      if (query.includes('[]')) {
        // Redirect to pipeline for [] expansion
        const pipeline = query.replace(/\[\]/g, ' | expand').split('|').map(s => s.trim()).filter(Boolean);
        const finalPipeline = pipeline.map(s => s === 'expand' ? '' : s);
        const result = evaluate(data, finalPipeline);
        if (result && result.error) return out('ERROR', result.error);
        return formatResult(query, result);
      }
      const result = getPath(data, query);
      return formatResult(query, result);
    }

    // Pipeline: split by |
    const pipeline = query.split('|').map(s => s.trim()).filter(Boolean);
    const result = evaluate(data, pipeline);

    if (result && result.error) {
      return out('ERROR', result.error);
    }

    return formatResult(query, result);
  } catch (e) {
    return out('ERROR', `Query error: ${e.message}`);
  }
}

function formatResult(query, result) {
  const resultStr = JSON.stringify(result);
  const truncated = resultStr.length > 5000;
  const display = truncated ? resultStr.slice(0, 5000) + '...' : resultStr;

  return out('PASS', `→ ${typeof result === 'object' ? JSON.stringify(result).slice(0, 120) : result}`, {
    query,
    resultType: Array.isArray(result) ? 'array' : typeof result,
    count: Array.isArray(result) ? result.length : null,
    resultPreview: truncated ? JSON.parse(resultStr.slice(0, 3000)) : result,
    truncated,
  });
}

function out(result, summary, data) {
  const output = { softill: 'json-query', result, summary, data: data || {}, evidence: [] };
  console.log(JSON.stringify(output, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();