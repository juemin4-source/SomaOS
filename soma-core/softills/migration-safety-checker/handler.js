#!/usr/bin/env node
/**
 * migration-safety-checker — handler.js
 * 分析 migration 文件中的风险操作
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
  const dirs = ['migrations','src/migrations','prisma/migrations','db/migrations'];
  const migrationFiles = [];
  for (const d of dirs) { const fp = path.join(cwd,d); if (fs.existsSync(fp)) migrationFiles.push(...ff(fp,['.sql','.ts','.js'],['node_modules'])); }
  if (migrationFiles.length === 0) { const all = ff(cwd,['.sql','.ts','.js'],['node_modules','.git']); migrationFiles.push(...all.filter(f => /migration|alter|create_table|drop/.test(f)).slice(0,30)); }

  const findings = []; let blockers = 0, warnings = 0;
  for (const fp of migrationFiles) {
    try {
      const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd, fp);
      const lc = c.toLowerCase();
      // Drop table
      const drops = lc.match(/drop\s+table\s+(\w+)/g);
      if (drops) { drops.forEach(d => { findings.push({file: rel, type: 'DROP_TABLE', detail: d, severity: 'blocker'}); blockers++; }); }
      // Drop column
      const dropCols = lc.match(/alter\s+table[\s\S]*?drop\s+(column\s+)?(\w+)/g);
      if (dropCols) { dropCols.forEach(d => { findings.push({file: rel, type: 'DROP_COLUMN', detail: d.slice(0,80), severity: 'warn'}); warnings++; }); }
      // Change column type
      const typeChanges = lc.match(/alter\s+table[\s\S]*?alter\s+(column\s+)?(\w+)\s+type/g);
      if (typeChanges) { typeChanges.forEach(t => { findings.push({file: rel, type: 'TYPE_CHANGE', detail: t.slice(0,80), severity: 'warn'}); warnings++; }); }
      // Add NOT NULL without default
      if (lc.includes('not null') && !lc.includes('default')) { findings.push({file: rel, type: 'NOT_NULL_NO_DEFAULT', detail: 'Adding NOT NULL without DEFAULT may fail on existing rows', severity: 'warn'}); warnings++; }
      // Rename column
      const renames = lc.match(/rename\s+(column\s+)?(\w+)\s+to\s+(\w+)/g);
      if (renames) { renames.forEach(r => { findings.push({file: rel, type: 'RENAME_COLUMN', detail: r.slice(0,80), severity: 'warn'}); warnings++; }); }
    } catch {}
  }
  const result = blockers > 0 ? 'FAIL' : warnings > 0 ? 'WARN' : 'PASS';
  return out(result, `${result}: ${findings.length} findings (${blockers} blockers, ${warnings} warnings)`, {
    findings, findingCount: findings.length, blockerCount: blockers, warningCount: warnings, migrationFileCount: migrationFiles.length, pass: blockers === 0,
  });
}
function ff(d, exts, ignore) { const r = []; const I = ['node_modules','.git','dist','build']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f = path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'migration-safety-checker',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:r==='WARN'?0:1); }
if (require.main === module) main();
