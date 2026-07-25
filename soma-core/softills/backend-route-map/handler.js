#!/usr/bin/env node
/**
 * backend-route-map — handler.js
 */

const fs = require('fs'); const path = require('path');
function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') { const p = path.resolve(process.argv[2]); try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(c).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); } }); return; }
  handle(input);
}
function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd()); const routes = []; const errors = [];
  const sd = input.sources || ['routes','controllers','src/routes','src/controllers','src/api','api','handlers'];
  const files = [];
  for (const d of sd) { const fp = path.join(cwd, d); if (fs.existsSync(fp)) files.push(...findFiles(fp, ['.js','.ts','.rs'], ['node_modules'])); }
  if (files.length === 0) files.push(...findFiles(cwd, ['.js','.ts','.rs'], ['node_modules']));
  for (const fp of files) {
    try {
      const c = fs.readFileSync(fp, 'utf-8'); const rel = path.relative(cwd, fp);
      let re = /(router|app|route)\.(get|post|put|delete|patch|options)\(\s*['"]([^'"]+)['"]\s*,/gi; let m;
      while ((m = re.exec(c)) !== null) routes.push({ method: m[2].toUpperCase(), path: '/' + m[3].replace(/^\/+/, ''), handler: eh(c, m.index), controller: rel, service: null, auth: /auth|verify|protect/.test(c), file: rel });
      re = /@(Get|Post|Put|Delete|Patch)\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = re.exec(c)) !== null) routes.push({ method: m[1].toUpperCase(), path: '/' + m[2].replace(/^\/+/, ''), handler: ed(c, m.index), controller: rel, service: null, auth: /@UseGuards|@Auth/.test(c), file: rel });
    } catch (e) { errors.push(e.message.slice(0,60)); }
  }
  const seen = new Set(); const unique = routes.filter(r => { const k = r.method + r.path; if (seen.has(k)) return false; seen.add(k); return true; });
  return out('PASS', `${unique.length} routes`, {routes: unique, routeCount: unique.length, errors: errors.slice(0,10)});
}
function eh(c, i) { const b = c.slice(Math.max(0,i-120),i); const a = b.match(/(\w+)\s*[:=]\s*\(/); if (a) return a[1]; const f = b.match(/(?:async\s+)?function\s+(\w+)/); return f ? f[1] : 'handler'; }
function ed(c, i) { const a = c.slice(i, i+300).match(/(?:async\s+)?(\w+)\s*\(/); return a ? a[1] : 'handler'; }
function findFiles(d, exts, ignore) { const r = []; const IGN = ['node_modules','.git','dist','build','target','.cache']; try { for (const e of fs.readdirSync(d, {withFileTypes:true})) { if (IGN.some(i => e.name.includes(i))) continue; const f = path.join(d, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {} return r; }
function out(r, s, d) { console.log(JSON.stringify({softill:'backend-route-map',result:r,summary:s,data:d||{},evidence:[]}, null, 2)); process.exit(r==='PASS'?0:1); }
if (require.main === module) main();
