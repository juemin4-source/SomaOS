#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * cache-manager — handler.js
 *
 * 管理 .claude/soma/ 下的缓存文件。
 * 检查过期、指纹匹配、统计、清理。
 *
 * 输入: { action, ... }
 * action:
 *   stats     统计所有缓存
 *   check     检查特定缓存条目
 *   clean     清理过期/无效缓存
 *   fingerprint 比对缓存指纹与当前文件
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

const SOMA_ROOT = path.resolve(__dirname, '..', '..', 'soma');
const CACHE_DIRS = [
  'context-compiler/cache',
  'runtime/.inputs',
  'logs',
];

const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

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

function handle(input) {
  const action = input.action || 'stats';
  const somaRoot = input.somaRoot || SOMA_ROOT;

  switch (action) {
    case 'stats':
      return stats(somaRoot);
    case 'check':
      return check(somaRoot, input.target);
    case 'clean':
      return clean(somaRoot);
    case 'fingerprint':
      return fingerprint(somaRoot, input.target);
    default:
      return out('ERROR', `Unknown action: ${action}`);
  }
}

function stats(somaRoot) {
  const categories = {};

  for (const dir of CACHE_DIRS) {
    const dirPath = path.join(somaRoot, dir);
    if (!fs.existsSync(dirPath)) { categories[dir] = { exists: false, files: 0, sizeBytes: 0, stale: 0 }; continue; }

    const files = [];
    walkDir(dirPath, files);
    const sizeBytes = files.reduce((s, f) => s + f.size, 0);
    const now = Date.now();
    const stale = files.filter(f => (now - f.mtimeMs) > MAX_CACHE_AGE_MS).length;

    categories[dir] = {
      exists: true,
      files: files.length,
      sizeBytes,
      sizeKB: Math.round(sizeBytes / 1024),
      stale,
      fresh: files.length - stale,
    };
  }

  const totalFiles = Object.values(categories).reduce((s, c) => s + (c.files || 0), 0);
  const totalSize = Object.values(categories).reduce((s, c) => s + (c.sizeBytes || 0), 0);

  return out('PASS', `Cache stats: ${totalFiles} files, ${Math.round(totalSize / 1024)}KB total`, {
    action: 'stats',
    somaRoot,
    categories,
    total: { files: totalFiles, sizeKB: Math.round(totalSize / 1024) },
  });
}

function check(somaRoot, target) {
  if (!target) return out('ERROR', 'target path required');

  const targetPath = path.resolve(somaRoot, target);
  if (!fs.existsSync(targetPath)) return out('PASS', 'Cache entry not found', { action: 'check', target, found: false });

  const stat = fs.statSync(targetPath);
  const ageMs = Date.now() - stat.mtimeMs;
  const stale = ageMs > MAX_CACHE_AGE_MS;

  return out(stale ? 'WARN' : 'PASS', `${target}: ${Math.round(ageMs / 1000 / 60)}min old, ${stale ? 'STALE' : 'FRESH'}`, {
    action: 'check',
    target,
    found: true,
    sizeBytes: stat.size,
    ageMs,
    ageMin: Math.round(ageMs / 1000 / 60),
    stale,
  });
}

function clean(somaRoot) {
  const cleaned = [];

  for (const dir of CACHE_DIRS) {
    const dirPath = path.join(somaRoot, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = [];
    walkDir(dirPath, files);
    const now = Date.now();

    for (const f of files) {
      if ((now - f.mtimeMs) > MAX_CACHE_AGE_MS) {
        try {
          fs.unlinkSync(f.path);
          cleaned.push(f.relativePath);
        } catch {}
      }
    }
  }

  const totalCleaned = cleaned.length;
  const summary = totalCleaned > 0 ? `Cleaned ${totalCleaned} stale cache entries` : 'No stale cache found';

  return out('PASS', summary, { action: 'clean', cleaned, totalCleaned });
}

function fingerprint(somaRoot, target) {
  if (!target) return out('ERROR', 'target cache path required');

  const targetPath = path.resolve(somaRoot, target);
  if (!fs.existsSync(targetPath)) return out('ERROR', `Cache entry not found: ${target}`);

  const content = fs.readFileSync(targetPath, 'utf-8');
  const lines = content.split('\n').filter(l => !l.startsWith('#')); // skip comments
  const hash = simpleHash(lines.join('\n'));

  return out('PASS', `Fingerprint: ${hash.slice(0, 12)}...`, {
    action: 'fingerprint',
    target,
    hash,
    sizeBytes: content.length,
    lineCount: lines.length,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

function walkDir(dir, results, prefix = '') {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath, results, relativePath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        results.push({ path: fullPath, relativePath, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  } catch {}
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'cache-manager', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : result === 'WARN' ? 0 : 1);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();