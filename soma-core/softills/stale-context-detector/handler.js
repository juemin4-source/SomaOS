#!/usr/bin/env node
/**
 * stale-context-detector — handler.js
 *
 * 检查 compiled context 是否过期。
 * 比对缓存指纹与当前文件指纹，不一致则标记 STALE。
 *
 * 输入: { cacheFile, sourceFile? }
 *   如果 sourceFile 未指定，从 compiled context 的 fingerprint 中提取。
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

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
  const cacheFile = input.cacheFile;
  const sourceFile = input.sourceFile;

  if (!cacheFile) {
    // Scan mode: check all context-compiler cache entries
    return scanAll();
  }

  const cachePath = path.resolve(cacheFile);
  if (!fs.existsSync(cachePath)) return out('ERROR', `Cache file not found: ${cacheFile}`);

  let cache;
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')); }
  catch (e) { return out('ERROR', `Cannot parse cache file: ${e.message}`); }

  // Extract source files from cache
  const sourceFiles = [];
  if (cache.fingerprint) {
    sourceFiles.push({ file: cache.file || cache.fingerprint.file, fingerprint: cache.fingerprint });
  }
  if (cache.slices) {
    for (const slice of cache.slices) {
      if (slice.file && !sourceFiles.some(s => s.file === slice.file)) {
        sourceFiles.push({ file: slice.file, fingerprint: slice.fingerprint });
      }
    }
  }
  if (sourceFiles.length === 0 && cache.file) {
    sourceFiles.push({ file: cache.file });
  }

  // Check each source file
  const results = [];
  let allFresh = true;

  for (const src of sourceFiles) {
    const srcPath = path.resolve(src.file);
    const fileResult = { file: src.file, exists: fs.existsSync(srcPath) };

    if (!fileResult.exists) {
      fileResult.status = 'SOURCE_MISSING';
      fileResult.stale = true;
      allFresh = false;
      results.push(fileResult);
      continue;
    }

    const currentStat = fs.statSync(srcPath);
    const currentFingerprint = simpleHash(fs.readFileSync(srcPath, 'utf-8'));

    fileResult.mtime = currentStat.mtime;
    fileResult.sizeBytes = currentStat.size;
    fileResult.currentFingerprint = currentFingerprint;

    if (src.fingerprint) {
      const cachedFp = typeof src.fingerprint === 'object'
        ? src.fingerprint.hash || src.fingerprint.fingerprint
        : src.fingerprint;
      const cachedHash = typeof cachedFp === 'string' ? cachedFp : '';

      fileResult.cachedFingerprint = cachedHash;
      fileResult.fingerprintMatch = currentFingerprint === cachedHash;
      fileResult.stale = currentFingerprint !== cachedHash;
      if (fileResult.stale) allFresh = false;
      fileResult.status = fileResult.stale ? 'STALE' : 'FRESH';
    } else {
      // No fingerprint in cache — compare mtime
      const cacheMtime = cache._mtime || (cache.completedAt ? new Date(cache.completedAt).getTime() : 0);
      fileResult.cacheTime = cacheMtime;
      fileResult.stale = currentStat.mtimeMs > cacheMtime;
      if (fileResult.stale) allFresh = false;
      fileResult.status = fileResult.stale ? 'STALE (mtime)' : 'FRESH (mtime)';
    }

    results.push(fileResult);
  }

  const staleCount = results.filter(r => r.stale).length;
  const missingCount = results.filter(r => r.status === 'SOURCE_MISSING').length;
  const verdict = allFresh ? 'FRESH' : staleCount > 0 ? 'STALE' : 'FRESH';
  const level = allFresh ? 'PASS' : 'WARN';

  return out(level, `Context ${verdict}: ${results.length} files checked, ${staleCount} stale, ${missingCount} missing`, {
    cacheFile,
    verdict,
    staleCount,
    missingCount,
    totalChecked: results.length,
    results,
    allFresh,
    recommendedNextAction: allFresh ? 'use_cache' : 'recompile_context',
  });
}

function scanAll() {
  const cacheDir = path.resolve(__dirname, '..', '..', 'soma', 'context-compiler', 'cache');
  if (!fs.existsSync(cacheDir)) return out('PASS', 'No cache directory', { action: 'scan', found: false, entries: [] });

  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  const entries = [];

  for (const file of files) {
    const filePath = path.join(cacheDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const srcFile = content.file || (content.slices?.[0]?.file) || 'unknown';
      const stat = fs.statSync(filePath);
      entries.push({
        cacheFile: `context-compiler/cache/${file}`,
        sourceFile: srcFile,
        sizeBytes: stat.size,
        ageMin: Math.round((Date.now() - stat.mtimeMs) / 60000),
      });
    } catch {}
  }

  entries.sort((a, b) => a.ageMin - b.ageMin);

  return out('PASS', `Found ${entries.length} cache entries`, {
    action: 'scan',
    found: entries.length > 0,
    entries,
  });
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
  console.log(JSON.stringify({ softill: 'stale-context-detector', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : result === 'WARN' ? 0 : 1);
}

if (require.main === module) main();
