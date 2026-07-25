#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * error-contract-extractor — handler.js
 * 提取错误码、HTTP 状态映射、异常类
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
  const sd = input.sources || ['src','errors','exceptions','lib','shared'];
  const files = [];
  for (const d of sd) { const fp = path.join(cwd,d); if (fs.existsSync(fp)) files.push(...ff(fp,['.ts','.js'],['node_modules'])); }
  if (files.length === 0) files.push(...ff(cwd,['.ts','.js'],['node_modules']));

  const errors = []; const seen = new Set();

  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp,'utf-8'); const rel = path.relative(cwd,fp);
      // Custom error classes
      const errorClasses = c.matchAll(/class\s+(\w+Error)\s+extends/g);
      for (const ec of errorClasses) {
        const statusM = c.slice(ec.index, ec.index+200).match(/status(?:Code)?\s*[:=]\s*(\d+)/);
        const codeM = c.match(new RegExp(`['"]${ec[1].replace(/Error$/,'')}_?[A-Z_]*['"]`));
        const msgM = c.slice(ec.index, ec.index+200).match(/message\s*[:=]\s*['"]([^'"]+)['"]/);
        errors.push({code: codeM ? codeM[0].replace(/['"]/g,'') : ec[1].toUpperCase(), class: ec[1], httpStatus: statusM ? parseInt(statusM[1]) : 500, message: msgM ? msgM[1] : ec[1], thrownBy: [rel], file: rel});
      }
      // HTTP error patterns: res.status(4XX).json({ error: '...' })
      const httpErrors = c.matchAll(/res\.status\((\d{3})\)\.json\(\s*\{\s*error\s*:\s*['"]([^'"]+)['"]/g);
      for (const he of httpErrors) {
        const key = `${he[1]}:${he[2]}`;
        if (!seen.has(key)) { seen.add(key); errors.push({code: he[2].toUpperCase().replace(/\s+/g,'_'), httpStatus: parseInt(he[1]), message: he[2], thrownBy: [rel], file: rel}); }
      }
      // throw new Error / throw new HttpException
      const throwErrors = c.matchAll(/throw\s+new\s+(?:HttpException|BadRequest|Unauthorized|Forbidden|NotFound|Conflict)\(['"]([^'"]+)['"]/g);
      for (const te of throwErrors) {
        const key = `throw:${te[1]}`;
        if (!seen.has(key)) { seen.add(key); errors.push({code: te[1].toUpperCase().replace(/\s+/g,'_'), httpStatus: inferStatus(c, te.index), message: te[1], thrownBy: [rel], file: rel}); }
      }
    } catch {}
  }

  const groupedByStatus = {};
  for (const e of errors) { const s = e.httpStatus; if (!groupedByStatus[s]) groupedByStatus[s] = []; groupedByStatus[s].push(e.code); }

  return out('PASS', `${errors.length} errors (${Object.keys(groupedByStatus).length} HTTP statuses)`, {
    errors: errors.slice(0,100), errorCount: errors.length, groupedByStatus, filesScanned: files.length,
  });
}
function inferStatus(c, idx) { const s = c.slice(Math.max(0,idx-100), idx).match(/(\d{3})/); return s ? parseInt(s[1]) : 500; }
function ff(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...ff(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'error-contract-extractor',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();