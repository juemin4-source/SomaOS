#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a),'utf-8')); } catch(e) { return out('ERROR','Read fail: '+e.message); } }
  else { const c = []; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}}); return; }
  h(i);
}
function h(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const sd = input.sources || ['services','src/services','lib','src/lib','handlers','src/handlers'];
  const files = [];
  for (const d of sd) { const fp = path.join(cwd,d); if (fs.existsSync(fp)) files.push(...ff(fp,['.ts','.js'],['node_modules'])); }
  if (files.length === 0) files.push(...ff(cwd,['.ts','.js'],['node_modules']));
  const services = []; const errors = [];
  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd,fp);
      const m = c.match(/export\s+(default\s+)?(class|function|const)\s+(\w+Service)/) || c.match(/^const\s+(\w+Service)\s*=/m);
      if (!m) continue;
      const name = m[3] || m[1];
      const deps = [];
      const imports = c.matchAll(/import\s+\{?\s*(\w+Service)\s*\}?\s+from/g);
      for (const imp of imports) if (imp[1] !== name) deps.push(imp[1]);
      const ctors = c.match(/constructor\s*\(\s*([^)]+)/);
      if (ctors) { ctors[1].split(',').forEach(s => { const t = s.match(/(\w+Service)/); if (t) deps.push(t[1]); }); }
      const calledBy = [];
      services.push({name, file: rel, dependsOn: [...new Set(deps)], calledBy});
    } catch(e) { errors.push(e.message.slice(0,60)); }
  }
  // Find who calls each service
  for (const svc of services) {
    for (const other of files) {
      try { const c = fs.readFileSync(other,'utf-8'); if (c.includes(svc.name) && !other.includes(svc.file)) svc.calledBy.push(path.relative(cwd,other)); } catch {}
    }
    svc.calledBy = [...new Set(svc.calledBy)];
  }
  return out('PASS', `${services.length} services`, {services, serviceCount: services.length, errors: errors.slice(0,10)});
}
function ff(d, exts, ignore) { const r = []; const I = ['node_modules','.git','dist','build']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f = path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'service-dependency-map',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
