#!/usr/bin/env node
/**
 * mock-data-generator — handler.js
 * 根据 DB schema / API contract 生成 mock 数据
 */
const fs = require('fs'); const path = require('path');
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a),'utf-8')); } catch(e) { return out('ERROR','Read: '+e.message); } }
  else { const c = []; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}}); return; }
  h(i);
}
function h(input) {
  const schema = input.schema || input.model || input.endpoint || null;
  const count = input.count || 3;
  const outputDir = input.outputDir ? path.resolve(input.outputDir) : null;
  const errors = [];

  if (!schema) return out('ERROR', 'schema/model/endpoint required');

  const generated = [];

  // Generate mock data from field definitions
  if (schema.fields || schema.properties) {
    const fields = schema.fields || schema.properties;
    for (let i = 0; i < count; i++) {
      const record = {};
      for (const [name, type] of Object.entries(fields)) {
        record[name] = mockValue(name, type, i);
      }
      generated.push(record);
    }
  }
  // From API endpoint definition
  else if (schema.requestBody || schema.responseBody) {
    const body = schema.responseBody || schema.requestBody || {};
    for (let i = 0; i < count; i++) {
      const record = {};
      if (typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) {
          record[k] = mockValue(k, typeof v === 'string' ? v : 'string', i);
        }
      }
      generated.push(record);
    }
  }
  // From simple field list ['id', 'name', ...]
  else if (Array.isArray(schema)) {
    for (let i = 0; i < count; i++) {
      const record = {};
      for (const field of schema) {
        record[typeof field === 'string' ? field : field.name] = mockValue(field.name || 'field', field.type || 'string', i);
      }
      generated.push(record);
    }
  }
  // From raw type name (try to find type definition in project)
  else if (typeof schema === 'string') {
    // Try to find the type in source files
    const cwd = process.cwd();
    const files = findFiles(cwd, ['.ts','.tsx'], ['node_modules','.git']);
    for (const fp of files) {
      try {
        const c = fs.readFileSync(fp,'utf-8');
        const m = c.match(new RegExp(`(?:interface|type)\\s+${schema}\\s*({[^}]+})`));
        if (m) {
          const fields = {};
          m[1].replace(/[{}]/g,'').split(';').forEach(l => {
            const p = l.match(/(\w+)\??\s*:\s*(\w+)/);
            if (p) fields[p[1]] = p[2];
          });
          if (Object.keys(fields).length > 0) {
            for (let i = 0; i < count; i++) {
              const record = {};
              for (const [n, t] of Object.entries(fields)) record[n] = mockValue(n, t, i);
              generated.push(record);
            }
            break;
          }
        }
      } catch {}
    }
  }

  if (generated.length === 0) return out('ERROR', 'Could not generate mock data from input. Provide fields object, endpoint, or type name.');

  // Write to file if outputDir set
  let written = null;
  if (outputDir) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outFile = path.join(outputDir, 'mock-data.json');
    fs.writeFileSync(outFile, JSON.stringify(generated, null, 2) + '\n', 'utf-8');
    written = outFile;
  }

  return out('PASS', `Generated ${generated.length} mock record(s)`, { generated, recordCount: generated.length, written, errors: errors.slice(0,5) });
}
function mockValue(name, type, idx) {
  const t = (typeof type === 'string' ? type : 'string').toLowerCase();
  if (name === 'id' || name.endsWith('Id') || name === 'uuid') return `${name.startsWith('user')?'user':name.startsWith('proj')?'proj':name.slice(0,4)}_${String(idx+1).padStart(3,'0')}`;
  if (name === 'email' || t === 'email') return `user${idx+1}@example.com`;
  if (name === 'url') return `https://example.com/${idx+1}`;
  if (t.includes('int') || t === 'number') return Math.floor(Math.random() * 1000) + 1;
  if (t === 'boolean' || t === 'bool') return Math.random() > 0.5;
  if (t === 'date' || name.includes('At') || name.includes('Date') || t === 'datetime') return new Date(Date.now() - idx * 86400000).toISOString();
  if (t === 'objectid' || t === 'object_id') return `${String(idx+1).padStart(24,'0')}`;
  if (name === 'name') return `Example ${['Project','Task','User','Item','Record'][idx % 5]}`;
  if (name === 'title' || name === 'subject') return `Mock ${['Data','Entry','Record','Sample','Test'][idx % 5]} ${idx+1}`;
  if (name === 'description' || name === 'summary') return `Auto-generated mock data record #${idx+1} for testing purposes.`;
  if (name === 'status') return ['active','pending','completed','archived'][idx % 4];
  if (name === 'type' || name === 'kind') return ['standard','premium','basic'][idx % 3];
  if (name === 'role') return ['admin','user','viewer'][idx % 3];
  if (name === 'phone') return `+1-555-${String(1000+idx).slice(1)}`;
  return `${name}_${idx+1}`;
}
function findFiles(d, exts, ignore) { const r=[]; const I=['node_modules','.git','dist','build','.next','.cache']; try { for (const e of fs.readdirSync(d,{withFileTypes:true})) { if (I.some(i=>e.name.includes(i))) continue; const f=path.join(d,e.name); if (e.isDirectory()) r.push(...findFiles(f,exts,ignore)); else if (e.isFile() && exts.some(x=>e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r,s,d) { console.log(JSON.stringify({softill:'mock-data-generator',result:r,summary:s,data:d||{},evidence:[]},null,2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
