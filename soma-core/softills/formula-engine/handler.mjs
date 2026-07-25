#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * formula-engine — handler.js
 *
 * 通用公式计算引擎 softill。
 * 基于 mathjs 15.x，支持任意数学表达式 + 变量代入。
 *
 * 输入: { formula: string, variables?: object }
 *   公式示例: "T/5 * A/5 * B/5 * η / sqrt(0.2+0.8*(R-1)/4) * exp((ξ-1)/4) * (0.3+0.7*cos((1-θ)*pi/2)) - max(S1,S2,S3) > 60 ? (max(S1,S2,S3)-60)*0.2 : 0"
 *   变量示例: { T:4, A:3, B:3, η:0.7, R:2, ξ:5, θ:0.8, S1:25, S2:30, S3:20 }
 *
 * 输出: { result: number, ... }
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

let math = null;
try {
  math = require('mathjs');
} catch (e) {
  // try relative from softills dir
  try { math = require('../node_modules/mathjs'); }
  catch (e2) { math = null; }
}

function main() {
  let input;

  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return error(`Failed to read input: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { error(`Parse error: ${e.message}`); }
    });
    return;
  }

  handle(input);
}

function handle(input) {
  if (!math) return error('mathjs not available');

  let formula = input.formula;
  const variables = input.variables || {};
  const expected = input.expected;
  const preset = input.preset;

  // Built-in presets
  const PRESETS = {
    'zaowu': "T/5 * A/5 * B/5 * η / sqrt(0.2 + 0.8 * (R - 1) / 4) * exp((ξ - 1) / 4) * (0.3 + 0.7 * cos((1 - θ) * pi / 2)) - (max(S1, S2, S3) > 60 ? (max(S1, S2, S3) - 60) * 0.2 : 0)",
    'zaowu-full': "(T/5 * A/5 * B/5 * η / sqrt(0.2 + 0.8 * (R - 1) / 4) * exp((ξ - 1) / 4) * (0.3 + 0.7 * cos((1 - θ) * pi / 2)) - (max(S1, S2, S3) > 60 ? (max(S1, S2, S3) - 60) * 0.2 : 0)) * 10",
    'bmi': 'weight / (height / 100) ^ 2',
    'roi': '(gain - cost) / cost * 100',
    'discount': 'price * (1 - discount / 100)',
  };

  if (preset) {
    if (!PRESETS[preset]) return error(`Unknown preset: ${preset}. Available: ${Object.keys(PRESETS).join(', ')}`);
    formula = PRESETS[preset];
  }

  if (!formula) return error('formula is required');

  try {
    const scope = { ...variables };
    // Add common constants
    scope.pi = Math.PI;
    scope.e = Math.E;

    const result = math.evaluate(formula, scope);

    const output = {
      softill: 'formula-engine',
      result: 'PASS',
      summary: `${formula} = ${result}`,
      data: {
        formula,
        variables,
        result,
        evaluated: math.parse(formula).toString(),
      },
      evidence: [],
    };

    // Optional: check against expected value
    if (expected !== undefined) {
      const pass = Math.abs(result - expected) < 1e-10;
      output.check = pass ? 'PASS' : 'FAIL';
      output.expected = expected;
      if (!pass) output.summary += ` (expected ${expected}, diff ${Math.abs(result - expected)})`;
    }

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (e) {
    error(`Evaluation error: ${e.message}`);
  }
}

function error(msg) {
  const output = {
    softill: 'formula-engine',
    result: 'ERROR',
    summary: msg,
    data: null,
    evidence: [],
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(1);
}

const require = createRequire(import.meta.url);

export default { evaluate: (formula, variables) => math.evaluate(formula, variables) };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();