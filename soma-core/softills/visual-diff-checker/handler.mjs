#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * visual-diff-checker — handler.js
 *
 * 对比改动前后截图，检测视觉回归。
 * 基于 pixelmatch + pngjs，像素级精确比较。
 *
 * 输入: { before: string|string[], after: string|string[], threshold?: number, outputDir?: string }
 *   单文件: { before: "before.png", after: "after.png" }
 *   批量: { before: ["r1-before.png","r2-before.png"], after: ["r1-after.png","r2-after.png"] }
 *
 * 输出: { comparisons: [{ name, diffPercent, diffPixels, status }], overall }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */


import fs from 'fs';

const require = createRequire(import.meta.url);

import path from 'path';

import { execSync } from 'child_process';

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); } });
    return;
  }
  handle(input);
}

function handle(input) {
  const threshold = input.threshold ?? 0.1; // 0.1% diff threshold before WARN
  const outputDir = input.outputDir ? path.resolve(input.outputDir) : null;

  let pixelmatch, PNG;
  try { pixelmatch = require('pixelmatch'); PNG = require('pngjs').PNG; }
  catch (e) { return out('ERROR', 'pixelmatch/pngjs not installed. Run: npm install pixelmatch pngjs'); }

  // Normalize inputs to arrays
  const beforeFiles = Array.isArray(input.before) ? input.before : [input.before];
  const afterFiles = Array.isArray(input.after) ? input.after : [input.after];

  if (beforeFiles.length !== afterFiles.length) return out('ERROR', `Mismatch: ${beforeFiles.length} before vs ${afterFiles.length} after files`);

  const comparisons = [];
  let totalDiffPixels = 0;
  let totalPixels = 0;

  for (let i = 0; i < beforeFiles.length; i++) {
    const beforePath = path.resolve(beforeFiles[i]);
    const afterPath = path.resolve(afterFiles[i]);
    const name = path.basename(beforeFiles[i]).replace(/before/i, '').replace(/\.png$/, '') || path.basename(beforeFiles[i]);

    if (!fs.existsSync(beforePath)) { comparisons.push({ name, before: beforeFiles[i], status: 'ERROR', error: 'Before file not found' }); continue; }
    if (!fs.existsSync(afterPath)) { comparisons.push({ name, after: afterFiles[i], status: 'ERROR', error: 'After file not found' }); continue; }

    try {
      const beforeImg = PNG.sync.read(fs.readFileSync(beforePath));
      const afterImg = PNG.sync.read(fs.readFileSync(afterPath));

      if (beforeImg.width !== afterImg.width || beforeImg.height !== afterImg.height) {
        comparisons.push({ name, status: 'ERROR', error: `Size mismatch: ${beforeImg.width}x${beforeImg.height} vs ${afterImg.width}x${afterImg.height}` });
        continue;
      }

      const diff = new PNG({ width: beforeImg.width, height: beforeImg.height });
      const diffPixels = pixelmatch(beforeImg.data, afterImg.data, diff.data, beforeImg.width, beforeImg.height, { threshold: 0.1 });
      const totalPx = beforeImg.width * beforeImg.height;
      const diffPercent = (diffPixels / totalPx) * 100;

      // Write diff image if outputDir set
      let diffFile = null;
      if (outputDir) {
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        diffFile = path.join(outputDir, `diff_${name}.png`);
        fs.writeFileSync(diffFile, PNG.sync.write(diff));
      }

      const status = diffPercent < threshold ? 'PASS' : diffPercent < threshold * 5 ? 'WARN' : 'FAIL';

      comparisons.push({
        name, before: beforeFiles[i], after: afterFiles[i],
        diffPercent: Math.round(diffPercent * 100) / 100,
        diffPixels,
        totalPixels: totalPx,
        width: beforeImg.width,
        height: beforeImg.height,
        status,
        diffFile,
      });

      totalDiffPixels += diffPixels;
      totalPixels += totalPx;
    } catch (e) {
      comparisons.push({ name, before: beforeFiles[i], after: afterFiles[i], status: 'ERROR', error: e.message.slice(0, 100) });
    }
  }

  const overallPercent = totalPixels > 0 ? Math.round((totalDiffPixels / totalPixels) * 10000) / 100 : 0;
  const failCount = comparisons.filter(c => c.status === 'FAIL').length;
  const warnCount = comparisons.filter(c => c.status === 'WARN').length;
  const errorCount = comparisons.filter(c => c.status === 'ERROR').length;

  const overall = failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS';

  return out(overall, `${overall}: ${comparisons.length} comparisons, ${failCount} failures, ${warnCount} warnings, ${overallPercent}% total diff`, {
    comparisons,
    overallVerdict: overall,
    totalComparisons: comparisons.length,
    failCount,
    warnCount,
    errorCount,
    totalDiffPercent: overallPercent,
    threshold,
  });
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'visual-diff-checker', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();