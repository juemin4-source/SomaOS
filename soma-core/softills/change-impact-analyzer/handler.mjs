#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * change-impact-analyzer — handler.js
 * 给定文件/API/component/DB model → 影响面分析
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
  const target = input.target || input.file || input.endpoint || input.component || input.model;
  const targetType = input.type || guessType(target);
  const fullstackMap = input.fullstackMap || null; // optional pre-loaded map

  if (!target) return out('ERROR', 'target (file/endpoint/component/model) required');

  const impacts = {routes: [], components: [], api: [], models: [], tests: [], files: []};
  const errors = [];

  // 1. Search for target name references across the codebase
  const searchTerm = path.basename(target).replace(/\.(tsx?|jsx?|vue|css|scss)$/,'');
  const files = ff(cwd, ['.ts','.tsx','.js','.jsx','.vue','.css','.scss','.json'], ['node_modules','.git','dist','build','.next','.cache']);

  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp, 'utf-8');
      const rel = path.relative(cwd, fp);
      if (rel === target || rel.endsWith('/' + target)) { impacts.files.push(rel); continue; }
      if (!c.includes(searchTerm) && !c.includes(target)) continue;

      // Categorize by file type
      if (rel.includes('page') || rel.includes('route') || rel.includes('router')) impacts.routes.push(rel);
      else if ((rel.includes('component') || rel.includes('Component')) && (c.includes(`import`))) impacts.components.push(rel);
      else if (rel.includes('api') || rel.includes('controller') || rel.includes('handler')) impacts.api.push(rel);
      else if (rel.includes('model') || rel.includes('schema') || rel.includes('entity')) impacts.models.push(rel);
      else if (rel.includes('test') || rel.includes('spec') || rel.includes('.test.') || rel.includes('.spec.')) impacts.tests.push(rel);
      else impacts.files.push(rel);
    } catch {}
  }

  // Deduplicate
  for (const k of Object.keys(impacts)) impacts[k] = [...new Set(impacts[k])];

  // Risk level
  const totalImpact = impacts.routes.length + impacts.components.length + impacts.api.length + impacts.models.length;
  const riskLevel = totalImpact > 10 ? 'high' : totalImpact > 4 ? 'medium' : totalImpact > 0 ? 'low' : 'unknown';

  // If it's a component, try to find routes that use it
  if (targetType === 'component' || target.endsWith('.tsx') || target.endsWith('.jsx')) {
    // Map component to pages/routes
  }

  return out('PASS', `${totalImpact} impacts across ${Object.values(impacts).reduce((s,arr) => s+arr.length, 0)} references (risk: ${riskLevel})`, {
    target, targetType, impacts, riskLevel, totalImpact, filesScanned: files.length, errors: errors.slice(0,5),
  });
}
function guessType(t) { if (!t) return 'unknown'; if (t.includes('/')) return 'file'; if (t.includes('api') || t.includes('/')) return 'endpoint'; if (t.match(/^[A-Z]/)) return 'component'; return 'file'; }
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','.next','.cache','target']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'change-impact-analyzer',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();