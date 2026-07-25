#!/usr/bin/env node
/**
 * state-flow-scanner — handler.js
 *
 * 扫描前端状态管理：useState, Context, Zustand, Redux, TanStack Query, 自定义 hooks。
 *
 * 输入: { cwd, sources? }
 * 输出: { stateUnits: [{ name, file, type, fields, usedBy }] }
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
    process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); } });
    return;
  }
  handle(input);
}

function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const scanDirs = input.sources || ['src', 'app', 'stores', 'state', 'hooks'];
  const stateUnits = [];
  const errors = [];

  const files = [];
  for (const d of scanDirs) {
    const fp = path.join(cwd, d);
    if (fs.existsSync(fp)) files.push(...findFiles(fp, ['.ts', '.tsx', '.js', '.jsx'], ['node_modules']));
  }
  if (files.length === 0) files.push(...findFiles(cwd, ['.ts', '.tsx'], ['node_modules']));

  const allContent = [];

  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const relPath = path.relative(cwd, fp);
      allContent.push({ fp, relPath, content, lines: content.split('\n') });

      // Zustand store: create((set, get) => ({ ... }))
      const zustandMatch = content.match(/(?:const|export\s+const|export\s+default)\s+(\w+)\s*=\s*create\s*\(/);
      if (zustandMatch) {
        const fields = extractStateFields(content);
        stateUnits.push({ name: zustandMatch[1], file: relPath, type: 'zustand', fields, usedBy: [] });
      }

      // Redux: createSlice({ name, initialState, reducers })
      const reduxMatch = content.match(/createSlice\(\s*\{\s*name:\s*['"](\w+)['"]/);
      if (reduxMatch) {
        const fields = extractStateFields(content);
        stateUnits.push({ name: reduxMatch[1], file: relPath, type: 'redux', fields, usedBy: [] });
      }

      // Context: createContext / useContext
      const ctxMatch = content.match(/createContext\s*<(\w+)>/);
      if (ctxMatch) {
        const ctxName = ctxMatch[1];
        const providerMatch = content.match(/(\w+Provider)\s*\(/);
        stateUnits.push({ name: providerMatch ? providerMatch[1] : `${ctxName}Context`, file: relPath, type: 'context', fields: [ctxName], usedBy: [] });
      }

      // TanStack Query: useQuery / useMutation
      const queryMatches = content.matchAll(/use(Query|Mutation)\(\s*\{\s*(?:queryKey|mutationKey):\s*\[['"](\w+)['"]/g);
      for (const qm of queryMatches) {
        if (!stateUnits.find(s => s.name === qm[2] && s.type === 'tanstack-query')) {
          stateUnits.push({ name: qm[2], file: relPath, type: 'tanstack-query', fields: ['data', 'loading', 'error'], usedBy: [] });
        }
      }

      // Custom hooks: useXxx
      if (relPath.includes('hooks') || relPath.includes('use')) {
        const hookMatch = content.match(/export\s+(const|function)\s+(use\w+)/);
        if (hookMatch) {
          const hookName = hookMatch[2];
          const fields = extractStateFields(content);
          if (!stateUnits.find(s => s.name === hookName)) {
            stateUnits.push({ name: hookName, file: relPath, type: 'custom-hook', fields, usedBy: [] });
          }
        }
      }
    } catch (e) { errors.push({ file: fp.slice(-40), error: e.message.slice(0, 60) }); }
  }

  // 2. Find usage of each state unit across files
  for (const su of stateUnits) {
    const usage = [];
    for (const { fp, relPath, content } of allContent) {
      if (relPath === su.file) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        // Check for import or direct usage
        if (l.includes(su.name) || l.includes(`use${su.name}`) || (su.type === 'zustand' && l.includes(su.name))) {
          if (usage.length === 0 || usage[usage.length - 1].file !== relPath) {
            usage.push({ file: relPath, line: i + 1 });
          }
        }
      }
    }
    su.usedBy = usage.slice(0, 20);
    su.usageCount = usage.length;
  }

  const byType = {};
  for (const su of stateUnits) { byType[su.type] = (byType[su.type] || 0) + 1; }

  return out('PASS', `${stateUnits.length} state units (${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(', ')})`, {
    stateUnits, unitCount: stateUnits.length, byType, errors: errors.slice(0, 10),
  });
}

function extractStateFields(content) {
  const fields = [];
  // Find object literal fields in initial state or store body
  const objMatch = content.match(/\{\s*(\w+)\s*:/);
  if (objMatch) {
    const lines = content.split('\n');
    let depth = 0;
    let collecting = false;
    for (const line of lines) {
      if (line.includes('initialState') || line.includes('(') || line.includes('=>')) collecting = true;
      if (!collecting) continue;
      for (const ch of line) { if (ch === '{') depth++; if (ch === '}') depth--; }
      if (depth === 0 && collecting) break;
      const fieldMatch = line.match(/^\s*(\w+)\s*:/);
      if (fieldMatch && !fieldMatch[1].startsWith('set') && !fieldMatch[1].startsWith('get')) {
        if (!fields.includes(fieldMatch[1])) fields.push(fieldMatch[1]);
      }
    }
  }
  return fields.slice(0, 15);
}

function findFiles(dir, exts, ignore) {
  const r = []; const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (IGNORE.some(i => e.name.includes(i)) || ignore.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'state-flow-scanner', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
