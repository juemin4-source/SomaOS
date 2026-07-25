#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * test-selector — handler.js
 * 根据改动的文件和 impact 分析，推荐该跑哪些测试
 */

import fs from 'fs'; 
import path from 'path';
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a),'utf-8')); } catch(e) { return out('ERROR','Read: '+e.message); } }
  else { const c = []; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}}); return; }
  h(i);
}
function h(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const changedFiles = input.changedFiles || [];
  const impactMap = input.impactMap || null;
  const testPatterns = input.testPatterns || ['test','spec','e2e','qa'];
  const errors = [];

  if (changedFiles.length === 0) return out('ERROR', 'changedFiles[] required');

  // 1. Read package.json for test scripts
  const pjPath = path.join(cwd, 'package.json');
  let testScripts = {};
  try { const pj = JSON.parse(fs.readFileSync(pjPath,'utf-8')); testScripts = pj.scripts || {}; } catch {}

  // 2. Find test files related to changed files
  const allFiles = ff(cwd, ['.ts','.tsx','.js','.jsx'], ['node_modules','.git','dist','build']);
  const relatedTests = new Set();
  const allTests = allFiles.filter(f => testPatterns.some(p => f.includes(p) || f.includes('.'+p+'.')));

  for (const cf of changedFiles) {
    const baseName = path.basename(cf).replace(/\.(tsx?|jsx?)$/,'');
    const dirName = path.dirname(cf);

    // Same-named test files
    const directTests = allTests.filter(t => path.basename(t).startsWith(baseName) || t.includes('/' + baseName + '.test.') || t.includes('/' + baseName + '.spec.'));
    for (const t of directTests) relatedTests.add(t);

    // Tests in same directory
    const siblingTests = allTests.filter(t => path.dirname(t) === dirName || path.dirname(t).startsWith(dirName));
    for (const t of siblingTests) relatedTests.add(t);

    // Impact-based: if impact map provided, find tests for impacted files
    if (impactMap && impactMap[cf]) {
      for (const impacted of impactMap[cf]) {
        const impName = path.basename(impacted).replace(/\.(tsx?|jsx?)$/,'');
        const impTests = allTests.filter(t => path.basename(t).startsWith(impName));
        for (const t of impTests) relatedTests.add(t);
      }
    }
  }

  // 3. Generate commands
  const recommended = [];
  const pm = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' : 'npm';

  // Direct test files
  for (const t of relatedTests) {
    const rel = path.relative(cwd, t);
    const runner = rel.endsWith('.test.ts') || rel.endsWith('.test.tsx') ? `${pm} test -- ${rel}` : `${pm} test -- ${rel}`;
    recommended.push(runner);
  }

  // Script-based tests from package.json
  if (testScripts.test) recommended.unshift(`${pm} test`);
  if (testScripts['test:type']) recommended.push(`${pm} run test:type`);

  // Detect if build needed
  const needsBuild = changedFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.css') || f.endsWith('.scss'));
  if (needsBuild && testScripts.build) recommended.push(`${pm} run build`);

  const uniqueCommands = [...new Set(recommended)].slice(0, 10);

  return out('PASS', `${uniqueCommands.length} test commands, ${relatedTests.size} test files`, {
    changedFiles, recommendedTests: uniqueCommands, testFileCount: relatedTests.size, relatedTests: [...relatedTests].slice(0, 30).map(t => path.relative(cwd, t)), packageManager: pm, note: needsBuild ? 'build suggested before tests' : undefined, errors: errors.slice(0,5),
  });
}
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','.next','.cache']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'test-selector',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();