#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * scoring-engine — handler.js
 *
 * 造物公式评分引擎 softill。
 * 纯确定性计算，不调 AI，不调 agent。
 *
 * 输入: 8 变量 (T, A, B, η, R, S1, S2, S3, ξ, θ) + 可选 phase
 * 输出: W 值 + 区间分类 + 杠杆分析
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import path from 'path';

import fs from 'fs';

// ── Load scoring engine ──────────────────────────────────────────
const ENGINE_PATH = path.resolve(__dirname, '..', '..', 'skills', 'opportunity-mapping', 'scripts', 'scoring-engine.js');
let engine = null;
try {
  engine = require(ENGINE_PATH);
} catch (e) {
  // Fallback: inline minimal version
  engine = null;
}

// ── Minimal inline engine if main engine unavailable ─────────────
function fallbackScore(vars) {
  const T = Math.max(0, Math.min(5, vars.T || 1));
  const A = Math.max(0, Math.min(5, vars.A || 1));
  const B = Math.max(0, Math.min(5, vars.B || 1));
  const η = Math.max(0, Math.min(1, vars.η || 0.5));
  const R = Math.max(1, Math.min(5, vars.R || 3));
  const S1 = Math.max(0, vars.S1 || 0);
  const S2 = Math.max(0, vars.S2 || 0);
  const S3 = Math.max(0, vars.S3 || 0);
  const ξ = Math.max(1, Math.min(5, vars.ξ || 3));
  const θ = Math.max(0, Math.min(1, vars.θ || 0.5));

  const T_n = T / 5;
  const A_n = A / 5;
  const B_n = B / 5;
  const R_sqrt = Math.sqrt(0.2 + 0.8 * (R - 1) / 4);
  const xi_factor = Math.exp((ξ - 1) / 4);
  const theta_deg = (1 - θ) * 90;
  const theta_cos = Math.cos(theta_deg * Math.PI / 180);
  const cos_factor = 0.3 + 0.7 * theta_cos;
  const S_max = Math.max(S1, S2, S3);
  const S_penalty = S_max > 60 ? (S_max - 60) * 0.2 : 0;

  let W = T_n * A_n * B_n * η / R_sqrt * xi_factor * cos_factor - S_penalty;
  W = W * 10;
  W = Math.max(-8, Math.min(40, W));

  return {
    W: Math.round(W * 100) / 100,
    variables: { T, A, B, η, R, S1, S2, S3, ξ, θ },
    normalized: { T_n, A_n, B_n, R_sqrt, xi_factor, cos_factor, S_penalty },
  };
}

const scoreFn = engine ? engine.score : fallbackScore;

// ── CLI ──────────────────────────────────────────────────────────
function main() {
  let input;

  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { console.error(JSON.stringify({ result: 'ERROR', summary: `Failed to read input: ${e.message}` })); process.exit(1); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { console.error(JSON.stringify({ result: 'ERROR', summary: `Parse error: ${e.message}` })); process.exit(1); }
    });
    return;
  }

  handle(input);
}

function handle(input) {
  const vars = {
    T: input.T,
    A: input.A,
    B: input.B,
    η: input.η,
    R: input.R,
    S1: input.S1,
    S2: input.S2,
    S3: input.S3,
    ξ: input.ξ,
    θ: input.θ,
    phase: input.phase,
  };

  const result = scoreFn(vars);

  const output = {
    softill: 'scoring-engine',
    result: 'PASS',
    summary: `W = ${result.W} (${result.range || 'N/A'})`,
    data: result,
    evidence: [],
    nextRecommendedAction: result.W >= 8
      ? 'proceed'
      : result.W >= 0
        ? 'review-risks'
        : 'avoid-or-reconsider',
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

const require = createRequire(import.meta.url);

export default { score: scoreFn };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();