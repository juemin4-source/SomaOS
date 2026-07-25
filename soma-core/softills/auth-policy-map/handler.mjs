#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * auth-policy-map — handler.js
 * 扫描鉴权和权限规则，映射 endpoint → required role
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
  const sd = input.sources || ['src','routes','controllers','middleware','handlers'];
  const files = [];
  for (const d of sd) { const fp = path.join(cwd,d); if (fs.existsSync(fp)) files.push(...ff(fp,['.ts','.js'],['node_modules'])); }
  if (files.length === 0) files.push(...ff(cwd,['.ts','.js'],['node_modules']));

  const policies = []; const errors = [];

  // 1. Extract auth middleware definitions
  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd,fp);
      if (!c.includes('auth') && !c.includes('Auth') && !c.includes('role') && !c.includes('Role') && !c.includes('permission') && !c.includes('guard') && !c.includes('Guard')) continue;
      // Middleware functions
      const mws = c.matchAll(/(?:export\s+)?(?:const|function)\s+(requireAuth|requireRole|requireAdmin|authorize|authenticate|protect)\s*[:=(]/g);
      for (const m of mws) { policies.push({name: m[1], type: 'middleware', file: rel, requiredRole: m[1].includes('Admin') ? 'admin' : m[1].includes('Role') ? extractRole(c) : 'authenticated', source: 'definition'}); }
      // Guard classes
      const guards = c.matchAll(/@Injectable[\s\S]*?class\s+(\w+Guard)/g);
      for (const g of guards) { policies.push({name: g[1], type: 'guard', file: rel, requiredRole: inferGuardRole(c), source: 'definition'}); }
    } catch(e) { errors.push(e.message.slice(0,60)); }
  }

  // 2. Map auth to endpoints (from route files)
  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd,fp);
      if (!rel.includes('route') && !rel.includes('Route')) continue;
      const routes = c.matchAll(/router\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]\s*,/gi);
      for (const r of routes) {
        const after = c.slice(r.index, r.index+300);
        const hasAuth = after.includes('requireAuth') || after.includes('authenticate') || after.includes('protect') || after.includes('AuthGuard') || after.includes('@UseGuards');
        const role = after.match(/requireRole\(\s*['"](\w+)['"]\)/);
        policies.push({endpoint: `${r[1].toUpperCase()} ${'/'+r[2].replace(/^\/+/,'')}`, auth: hasAuth, requiredRole: role ? role[1] : hasAuth ? 'authenticated' : 'public', file: rel, source: 'route-usage'});
      }
    } catch {}
  }

  return out('PASS', `${policies.length} auth policies`, {policies, policyCount: policies.length, middlewareCount: policies.filter(p=>p.type==='middleware').length, endpointMappings: policies.filter(p=>p.endpoint).length, errors: errors.slice(0,10)});
}
function extractRole(c) { const m = c.match(/['"](\w+)['"]\s*[,)]/); return m ? m[1] : 'authenticated'; }
function inferGuardRole(c) { if (c.includes('admin')) return 'admin'; if (c.includes('owner')) return 'owner'; return 'authenticated'; }
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'auth-policy-map',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();