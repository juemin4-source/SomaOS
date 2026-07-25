#!/usr/bin/env node
/**
 * frontend-api-usage-scanner — handler.js
 *
 * 扫描前端源码中 API 的调用位置、传参、使用字段。
 * 输入可接受 api-contract-extractor 的输出作为参考，也可以独立扫描。
 *
 * 输入: { cwd, sources?, knownEndpoints?: [{method, path}] }
 * 输出: { apiUsages: [{ endpoint, usedBy: [{file, lines}], requestFields, responseFieldsUsed }] }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
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
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const knownEndpoints = input.knownEndpoints || null;
  const apiUsages = [];
  const errors = [];

  // 1. Find all frontend source files
  const scanDirs = input.sources || ['src', 'app', 'pages', 'components', 'api', 'services', 'hooks'];
  const foundDirs = scanDirs.filter(d => fs.existsSync(path.join(cwd, d)));

  const files = [];
  if (foundDirs.length === 0) {
    files.push(...findFiles(cwd, ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'], ['node_modules', '.git', 'dist', 'build', '.next', '.cache']));
  } else {
    for (const dir of foundDirs) {
      files.push(...findFiles(path.join(cwd, dir), ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'], ['node_modules', '.git', 'dist', 'build', '.next', '.cache']));
    }
  }

  // 2. Search each file for API call patterns
  const callPatterns = [
    /['"](get|post|put|delete|patch)\s+\/(api\/[^'"]+)['"]/gi,        // "POST /api/tasks"
    /(fetch|axios|request)\(?\s*['"]([^'"]*\/api\/[^'"]*)['"]/gi,      // fetch('/api/...')
    /\/(api\/[^'"]+)['"]/g,                                             // '/api/...'
    /invoke\(?\s*['"]([^'"]+)['"]/g,                                    // invoke('command_name')
  ];

  const usageMap = {}; // endpoint → { files: [], requestFields: Set, responseFields: Set }

  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const relPath = path.relative(cwd, fp);
      const lines = content.split('\n');

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let match;

        for (const pattern of callPatterns) {
          pattern.lastIndex = 0;
          while ((match = pattern.exec(line)) !== null) {
            const endpoint = match[1] && match[1].toUpperCase ? `${match[1].toUpperCase()} /${match[2].replace(/^\/+/, '')}` : `GET /${(match[1] || match[0]).replace(/^\/+/, '')}`;
            if (!usageMap[endpoint]) usageMap[endpoint] = { endpoint, usedBy: [], requestFields: new Set(), responseFields: new Set() };
            if (!usageMap[endpoint].usedBy.some(u => u.file === relPath)) {
              usageMap[endpoint].usedBy.push({ file: relPath, line: li + 1, snippet: line.trim().slice(0, 120) });
            }

            // Extract fields from the same line
            const fieldRe = /\.(data|items|list|result|id|name|title|status|type|count)/g;
            let fm;
            while ((fm = fieldRe.exec(line)) !== null) {
              usageMap[endpoint].responseFields.add(fm[1]);
            }
          }
        }
      }
    } catch (e) { errors.push({ file: fp.slice(-50), error: e.message.slice(0, 60) }); }
  }

  // 3. If knownEndpoints provided, cross-reference
  let matchedCount = 0;
  let unmatchedCount = 0;
  if (knownEndpoints && knownEndpoints.length > 0) {
    for (const ep of knownEndpoints) {
      const key = `${ep.method} /${ep.path.replace(/^\/+/, '')}`;
      if (usageMap[key]) { matchedCount++; } else { unmatchedCount++; }
    }
  }

  const results = Object.values(usageMap).map(u => ({
    endpoint: u.endpoint,
    callCount: u.usedBy.length,
    usedBy: u.usedBy,
    requestFields: [...u.requestFields],
    responseFields: [...u.responseFields],
  })).sort((a, b) => b.callCount - a.callCount);

  return out('PASS', `${results.length} API usages across ${Object.values(usageMap).reduce((s, u) => s + u.usedBy.length, 0)} call sites${knownEndpoints ? ` (${matchedCount}/${knownEndpoints.length} endpoints matched)` : ''}`, {
    apiUsages: results,
    usageCount: results.length,
    totalCallSites: results.reduce((s, u) => s + u.callCount, 0),
    filesScanned: files.length,
    matchedEndpointCount: matchedCount,
    unmatchedEndpointCount: unmatchedCount,
    errors: errors.slice(0, 10),
  });
}

function findFiles(dir, exts, ignore) {
  const r = []; const IGNORE_DEFAULT = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__'];
  const ai = [...new Set([...IGNORE_DEFAULT, ...ignore])];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (ai.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'frontend-api-usage-scanner', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
