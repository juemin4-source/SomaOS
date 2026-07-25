#!/usr/bin/env node
/**
 * db-schema-map — handler.js
 * 读取 Prisma/Mongoose/TypeORM/Drizzle schema → 数据模型 + 关系
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
  const modelFiles = [
    { name: 'prisma/schema.prisma', type: 'prisma' },
    { name: 'schema.prisma', type: 'prisma' },
    { name: 'src/models', type: 'mongoose', dir: true },
    { name: 'models', type: 'mongoose', dir: true },
    { name: 'src/entity', type: 'typeorm', dir: true },
    { name: 'entity', type: 'typeorm', dir: true },
    { name: 'src/schema', type: 'drizzle', dir: true },
    { name: 'drizzle/schema', type: 'drizzle', dir: true },
    { name: 'src/migrations', type: 'migration', dir: true },
    { name: 'migrations', type: 'migration', dir: true },
  ];
  const models = []; const errors = [];
  for (const mf of modelFiles) {
    const fp = path.join(cwd, mf.name);
    if (mf.dir) { if (!fs.existsSync(fp)) continue;
      const files = ff(fp, ['.ts','.js','.prisma'], ['node_modules']);
      for (const f of files) { try { parseFile(f, models, mf.type); } catch(e) { errors.push({file: f.slice(-40), error: e.message.slice(0,60)}); } }
    } else { if (!fs.existsSync(fp)) continue;
      try { parseFile(fp, models, mf.type); } catch(e) { errors.push({file: mf.name, error: e.message.slice(0,60)}); }
    }
  }
  // Fallback: search whole project for model files
  if (models.length === 0) {
    const files = ff(cwd, ['.ts','.js'], ['node_modules','.git','dist','build']);
    const modelCandidates = files.filter(f => /model|schema|entity/.test(f));
    for (const f of modelCandidates.slice(0,20)) {
      try { const c = fs.readFileSync(f,'utf-8'); if (c.includes('@Entity') || c.includes('Schema(') || c.includes('model(')|| c.includes('prisma')) parseFile(f, models, 'auto'); } catch {}
    }
  }
  return out('PASS', `${models.length} models`, {models, modelCount: models.length, errors: errors.slice(0,10)});
}
function parseFile(fp, models, type) {
  const c = fs.readFileSync(fp,'utf-8'); const name = path.basename(fp).replace(/\.(ts|js|prisma)$/,'');
  if (type === 'prisma') {
    const modelRe = /model\s+(\w+)\s+\{([^}]+)\}/g; let m;
    while ((m = modelRe.exec(c)) !== null) {
      const fields = {}; const rels = [];
      m[2].split('\n').forEach(l => {
        const f = l.match(/^\s+(\w+)\s+(\w+)/); if (f) fields[f[1]] = f[2];
        const r = l.match(/(\w+)\s+(\w+)\[@relation/); if (r) rels.push(r[2]);
      });
      models.push({name: m[1], fields, relations: rels.length > 0 ? rels : undefined, source: fp.slice(-30)});
    }
  } else if (c.includes('@Entity') || c.includes('Schema(')) {
    const nameM = c.match(/@Entity\(['"]?(\w+)['"]?\)/); const nm = nameM ? nameM[1] : name;
    const fields = {}; const fieldRe = /@Column[^)]*\)\s*(\w+)\s*:\s*(\w+)/g; let f;
    while ((f = fieldRe.exec(c)) !== null) fields[f[1]] = f[2];
    const rels = []; const relRe = /@ManyToOne|@OneToMany|@OneToOne|@ManyToMany/g;
    while (relRe.exec(c)) { const t = c.slice(relRe.lastIndex, relRe.lastIndex+50).match(/=>\s*(\w+)/); if (t) rels.push(t[1]); }
    models.push({name: nm, fields, relations: rels.length > 0 ? rels : undefined, source: fp.slice(-30)});
  } else if (c.includes('Schema(') || c.includes('mongoose')) {
    const nameM = c.match(/export\s+(const|function)\s+(\w+)/); const nm = nameM ? nameM[2] : name;
    const fRe = /(\w+)\s*:\s*\{\s*type:\s*(String|Number|Boolean|Date|ObjectId|Buffer)/g; const fields = {}; let f;
    while ((f = fRe.exec(c)) !== null) fields[f[1]] = f[2];
    const rels = []; const rRe = /(?:ref|Ref)\s*:\s*['"](\w+)['"]/g; let r;
    while ((r = rRe.exec(c)) !== null) rels.push(r[1]);
    models.push({name: nm, fields, relations: rels.length > 0 ? rels : undefined, source: fp.slice(-30)});
  } else { models.push({name, fields: {}, source: fp.slice(-30), note: 'unable to parse schema' }); }
}
function ff(d, exts, ignore) { const r = []; const I = ['node_modules','.git','dist','build','target','.cache']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f = path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'db-schema-map',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
