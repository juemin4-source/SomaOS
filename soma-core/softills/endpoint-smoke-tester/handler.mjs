#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * endpoint-smoke-tester — handler.js
 * 根据 API 契约跑接口 smoke test
 */

import fs from 'fs'; 
import path from 'path'; 
import http from 'http'; 
import https from 'https';
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a),'utf-8')); } catch(e) { return out('ERROR','Read: '+e.message); } }
  else { const c = []; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}}); return; }
  h(i);
}
async function h(input) {
  const baseUrl = input.baseUrl || 'http://localhost:3721';
  const endpoints = input.endpoints || [{method:'GET', path:'/api/health'}];
  const timeout = input.timeout || 5000;
  const expectedStatus = input.expectedStatus || null;
  const results = []; let pass = 0, fail = 0;

  for (const ep of endpoints) {
    const method = (ep.method || 'GET').toUpperCase();
    const url = ep.path.startsWith('http') ? ep.path : `${baseUrl}${ep.path}`;
    const start = Date.now();
    try {
      const result = await httpRequest(method, url, timeout, ep.body || null, ep.headers || {});
      const duration = Date.now() - start;
      const expected = expectedStatus || ep.expectedStatus || (method === 'POST' ? 201 : 200);
      const ok = result.status === expected;
      results.push({method, url, status: result.status, expected, pass: ok, duration: `${duration}ms`, bodyPreview: result.body.slice(0,200)});
      if (ok) pass++; else fail++;
    } catch (e) {
      results.push({method, url, status: 0, expected: expectedStatus || 200, pass: false, error: e.message.slice(0,100), duration: `${Date.now()-start}ms`});
      fail++;
    }
  }

  const verdict = fail === 0 ? 'PASS' : 'WARN';
  return out(verdict, `${pass}/${endpoints.length} passed (${fail} failed)`, {
    results, passCount: pass, failCount: fail, totalCount: endpoints.length, baseUrl, duration: results.reduce((s,r) => s + parseInt(r.duration), 0) + 'ms',
  });
}
function httpRequest(method, url, timeout, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: {'User-Agent':'Soma-Smoke-Tester/1.0', ...headers}, timeout};
    if (body && method !== 'GET') { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; if (data.length > 10000) res.destroy(); });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: data.slice(0,5000)}));
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body && method !== 'GET') req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
function out(r, s, d) { console.log(JSON.stringify({softill:'endpoint-smoke-tester',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();