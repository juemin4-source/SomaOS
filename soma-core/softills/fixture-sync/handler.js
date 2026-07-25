#!/usr/bin/env node
/**
 * fixture-sync — handler.js
 * 检查 mock/fixture 是否和真实 schema 对齐
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
  const fixtureDirs = input.fixtureDirs || ['fixtures','mock','test/fixtures','src/fixtures','cypress/fixtures','__fixtures__'];
  const schemaDir = input.schemaDir || null;
  const errors = [];

  const fixtures = []; const schemaFields = {}; const findings = [];

  // 1. Find fixture files
  const fixtureFiles = [];
  for (const d of fixtureDirs) { const fp = path.join(cwd, d); if (fs.existsSync(fp)) fixtureFiles.push(...ff(fp, ['.json','.ts','.js'], ['node_modules'])); }
  if (fixtureFiles.length === 0) fixtureFiles.push(...ff(cwd, ['.json'], ['node_modules','.git']).filter(f => f.includes('fixture') || f.includes('mock') || f.includes('seed')));

  // 2. Load first record from each fixture
  for (const fp of fixtureFiles) {
    try {
      const c = fs.readFileSync(fp, 'utf-8'); const rel = path.relative(cwd, fp);
      let data;
      if (fp.endsWith('.json')) { data = JSON.parse(c); }
      else { const m = c.match(/export\s+(default\s+)?(\[{|{)/); if (m) data = eval('(' + c.slice(m.index + m[0].length - 1) + ')'); }
      if (!data) continue;
      const records = Array.isArray(data) ? data : [data];
      if (records.length === 0) continue;
      const fields = Object.keys(records[0]);
      fixtures.push({file: rel, fields, recordCount: records.length, sampleKeys: fields});
    } catch(e) { errors.push({file: fp.slice(-40), error: e.message.slice(0,60)}); }
  }

  // 3. Compare fixture fields against schema (if schema directory specified or auto-detected)
  const schemaCandidates = ['src/models','models','src/entity','entity','prisma/schema.prisma','src/schema'];
  const schemaFiles = [];
  for (const d of schemaCandidates) { const fp = path.join(cwd, d); if (fs.existsSync(fp)) schemaFiles.push(...ff(fp, ['.ts','.js','.prisma'], ['node_modules'])); }
  if (schemaDir) schemaFiles.push(...ff(path.resolve(cwd, schemaDir), ['.ts','.js','.prisma'], ['node_modules']));

  // Extract schema fields
  for (const fp of schemaFiles) {
    try {
      const c = fs.readFileSync(fp, 'utf-8');
      if (fp.endsWith('.prisma')) {
        const models = c.matchAll(/model\s+(\w+)\s+\{([^}]+)\}/g);
        for (const m of models) { const f = {}; m[2].split('\n').forEach(l => { const p = l.match(/^\s+(\w+)\s+(\w+)/); if (p) f[p[1]] = p[2]; }); schemaFields[m[1]] = f; }
      } else {
        const ifaces = c.matchAll(/(?:interface|type)\s+(\w+)\s*({[^}]+})/g);
        for (const m of ifaces) { const f = {}; m[2].replace(/[{}]/g,'').split(';').forEach(l => { const p = l.match(/(\w+)\??\s*:\s*(\w+)/); if (p) f[p[1]] = p[2]; }); schemaFields[m[1]] = f; }
      }
    } catch {}
  }

  // 4. Diff: fixture fields vs schema fields
  for (const fx of fixtures) {
    const fxName = path.basename(fx.file).replace(/\.(json|ts|js)$/,'');
    // Find matching schema by name
    const schemaName = Object.keys(schemaFields).find(k => k.toLowerCase() === fxName.toLowerCase() || k.toLowerCase().includes(fxName.toLowerCase()) || fxName.toLowerCase().includes(k.toLowerCase()));
    if (schemaName && schemaFields[schemaName]) {
      const schemaF = schemaFields[schemaName];
      const fxF = fx.sampleKeys;
      const inFixtureNotSchema = fxF.filter(f => !schemaF[f] && !schemaF[f.toLowerCase()]);
      const inSchemaNotFixture = Object.keys(schemaF).filter(f => !fxF.includes(f) && !fxF.includes(f.toLowerCase()));
      if (inFixtureNotSchema.length > 0) findings.push({type: 'FIXTURE_HAS_UNKNOWN_FIELD', fixture: fx.file, schema: schemaName, fields: inFixtureNotSchema, severity: 'warn'});
      if (inSchemaNotFixture.length > 0) findings.push({type: 'SCHEMA_HAS_UNMAPPED_FIELD', fixture: fx.file, schema: schemaName, fields: inSchemaNotFixture, severity: 'info'});
    }
  }

  const warnCount = findings.filter(f => f.severity === 'warn').length;
  const verdict = warnCount > 0 ? 'WARN' : 'PASS';

  return out(verdict, `${fixtures.length} fixtures checked, ${findings.length} drifts found`, {
    fixtures: fixtures.map(f => ({file: f.file, fields: f.fields, recordCount: f.recordCount})),
    findings, fixtureCount: fixtures.length, findingCount: findings.length, schemaCount: Object.keys(schemaFields).length, errors: errors.slice(0,10),
  });
}
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','.next','.cache']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'fixture-sync',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='WARN'?0:r==='PASS'?0:1); }
if (require.main === module) main();
