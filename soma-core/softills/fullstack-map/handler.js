#!/usr/bin/env node
/**
 * fullstack-map — handler.js
 * 聚合所有 Soma maps 为单一 fullstack-map.json
 * 单项目全栈真相源 → Chancellor 不再需要问"该读哪些文件"
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
  const outputDir = path.resolve(input.outputDir || path.join(cwd, '.claude', 'soma', 'maps'));
  const build = input.build !== false; // whether to run scanners or just load existing
  const errors = [];

  const map = { project: path.basename(cwd), builtAt: new Date().toISOString(), frontend: {routes: [], components: [], apiUsages: []}, backend: {routes: [], models: [], services: []}, contracts: {endpoints: [], diffs: []}, impact: {componentToRoutes: {}, endpointToFrontendUsage: {}, modelToEndpoints: {}} };

  // Try to load existing scanner outputs
  const scanOutputs = [
    { key: 'frontend.routes', file: path.join(cwd, '.claude', 'soma', 'maps', 'routes.json') },
    { key: 'backend.models', file: path.join(cwd, '.claude', 'soma', 'maps', 'models.json') },
    { key: 'contracts.endpoints', file: path.join(cwd, '.claude', 'soma', 'maps', 'endpoints.json') },
  ];

  for (const so of scanOutputs) {
    if (fs.existsSync(so.file)) {
      try { setNested(map, so.key, JSON.parse(fs.readFileSync(so.file, 'utf-8'))); } catch {}
    }
  }

  // Auto-scan if build mode
  if (build) {
    // Try frontend routes
    const fRouterFiles = ff(cwd, ['.tsx','.ts','.jsx','.js'], ['node_modules','.git','dist','build']).filter(f => /route|router|page/.test(f));
    for (const fp of fRouterFiles.slice(0,15)) {
      try {
        const c = fs.readFileSync(fp, 'utf-8'); const rel = path.relative(cwd, fp);
        const routes = c.matchAll(/path:\s*['"]([^'"]+)['"]/g);
        for (const r of routes) map.frontend.routes.push({path: r[1], file: rel});
        const comps = c.matchAll(/<(\w+)\s/g);
        for (const cp of comps) if (cp[1][0] === cp[1][0].toUpperCase() && cp[1] !== 'Route') map.frontend.components.push(cp[1]);
      } catch {}
    }
    map.frontend.routes = [...new Set(map.frontend.routes.map(r => r.path))].filter(Boolean).map(p => ({path: p}));

    // Try backend models/entities
    const modelFiles = ff(cwd, ['.ts','.js','.prisma'], ['node_modules','.git']).filter(f => /model|schema|entity/.test(f));
    for (const fp of modelFiles.slice(0,10)) {
      try {
        const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd, fp);
        const m = c.match(/(?:interface|type|class|model)\s+(\w+)/);
        if (m && m[1] !== 'default') map.backend.models.push({name: m[1], file: rel});
      } catch {}
    }

    // Try backend routes
    const bRouterFiles = ff(cwd, ['.ts','.js'], ['node_modules','.git','dist']).filter(f => /route|controller|handler/.test(f));
    for (const fp of bRouterFiles.slice(0,15)) {
      try {
        const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd, fp);
        const routes = c.matchAll(/['"](GET|POST|PUT|DELETE)\s+\/([^'"]+)['"]/g);
        for (const r of routes) map.backend.routes.push({method: r[1], path: '/'+r[2].replace(/^\/+/,''), file: rel});
      } catch {}
    }

    // Build impact map: component → routes
    for (const comp of [...new Set(map.frontend.components)]) {
      const usedIn = [];
      for (const r of map.frontend.routes) { if (r.path) usedIn.push(r.path); }
      map.impact.componentToRoutes[comp] = usedIn.slice(0,10);
    }
  }

  // Ensure output directory
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outFile = path.join(outputDir, 'fullstack-map.json');
  fs.writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n', 'utf-8');

  return out('PASS', `Fullstack map written: ${map.frontend.routes.length} routes, ${map.backend.models.length} models, ${map.backend.routes.length} backend routes`, {
    map, frontendRouteCount: map.frontend.routes.length, backendModelCount: map.backend.models.length, backendRouteCount: map.backend.routes.length, outputFile: outFile, errors: errors.slice(0,5),
  });
}
function setNested(obj, path, val) { const parts = path.split('.'); let cur = obj; for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; } cur[parts[parts.length - 1]] = val; }
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','.next','.cache','target']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'fullstack-map',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
