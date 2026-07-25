#!/usr/bin/env node
/**
 * env-requirements-checker — handler.js
 * 扫描项目需要哪些环境变量，对比 .env.example 覆盖度
 */
const fs = require('fs'); const path = require('path');
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a),'utf-8')); } catch(e) { return out('ERROR','Read: '+e.message); } }
  else { const c = []; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}}); return; }
  h(i);
}
function h(input) {
  const cwd = path.resolve(input.cwd || process.cwd());

  // 1. Read .env.example if exists
  const envExample = readEnvFile(path.join(cwd, '.env.example')) || readEnvFile(path.join(cwd, '.env.sample')) || [];
  // 2. Read actual .env if exists
  const envActual = readEnvFile(path.join(cwd, '.env')) || [];
  // 3. Scan source for process.env usage
  const files = ff(cwd, ['.ts','.js','.tsx','.jsx','.rs'], ['node_modules','.git','dist','build','.next']);
  const usedEnv = new Set(); const unusedInExample = [];

  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp,'utf-8');
      const refs = c.matchAll(/process\.env\.(\w+)/g);
      for (const ref of refs) usedEnv.add(ref[1]);
    } catch {}
  }

  // 4. Check config files for env references
  const configFiles = ['config.ts','config.js','src/config.ts','src/config.js','app.config.ts','src/settings.ts','src/env.ts'];
  for (const cf of configFiles) {
    const fp = path.join(cwd, cf);
    if (fs.existsSync(fp)) {
      try {
        const c = fs.readFileSync(fp,'utf-8');
        const refs = c.matchAll(/process\.env\.(\w+)/g);
        for (const ref of refs) usedEnv.add(ref[1]);
      } catch {}
    }
  }

  // 5. Compare
  const required = [...usedEnv].sort();
  const documented = new Set(envExample);
  const missingInExample = required.filter(v => !documented.has(v));
  const unusedInDoc = envExample.filter(v => !usedEnv.has(v));

  const issues = [];
  if (missingInExample.length > 0) issues.push(`${missingInExample.length} vars used in code but missing from .env.example`);
  if (unusedInDoc.length > 0) issues.push(`${unusedInDoc.length} vars in .env.example but never used in code`);

  return out(issues.length > 0 ? 'WARN' : 'PASS',
    `${required.length} env vars (${missingInExample.length} undocumented)`,
    {requiredEnv: required, documentedInExample: envExample, missingInExample, unusedInExample: unusedInDoc, totalFound: required.length, documented: envExample.length, issues, filesScanned: files.length}
  );
}
function readEnvFile(fp) { try { return fs.readFileSync(fp,'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=')[0].trim()).filter(Boolean); } catch { return null; } }
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','target','.next','.cache']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'env-requirements-checker',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
