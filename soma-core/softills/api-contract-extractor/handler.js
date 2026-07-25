#!/usr/bin/env node
/**
 * api-contract-extractor — handler.js
 *
 * 从后端代码抽取 API 契约。参考 architect skill + Tauri 编程规则的契约定义原则。
 *
 * 输入: { cwd: string, sources?: string[] }
 * 输出: { endpoints: [{ method, path, requestBody, responseBody, authRequired, controller, handler }] }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const endpoints = [];
  const errors = [];

  // 1. Scan directories
  const scanDirs = input.sources || ['routes', 'controllers', 'src/routes', 'src/controllers', 'src/api', 'api', 'handlers'];
  const foundDirs = scanDirs.filter(d => fs.existsSync(path.join(cwd, d)));

  if (foundDirs.length === 0) {
    const files = findFiles(cwd, ['.js', '.ts', '.rs'], ['node_modules', '.git', 'dist', 'build', '.next', 'target', '.cache', 'electron', '__pycache__']);
    const routeFiles = files.filter(f => /route|controller|api|handler|endpoint/.test(f)).slice(0, 30);
    for (const rf of routeFiles) extractFromFile(rf, cwd, endpoints, errors);
  } else {
    for (const dir of foundDirs) {
      const fullPath = path.join(cwd, dir);
      const files = findFiles(fullPath, ['.js', '.ts', '.rs'], ['node_modules', '.git', 'dist', 'build', 'target', '.cache', 'electron', '__pycache__']);
      for (const f of files) extractFromFile(f, cwd, endpoints, errors);
    }
  }

  // 2. OpenAPI
  const openApiFiles = findFiles(cwd, ['.json', '.yaml', '.yml'], ['node_modules'])
    .filter(f => /openapi|swagger|api-spec/.test(f));
  for (const f of openApiFiles.slice(0, 5)) extractFromOpenApi(f, endpoints, errors);

  // 3. DTOs
  const dtoFiles = findFiles(cwd, ['.ts', '.js'], ['node_modules'])
    .filter(f => /dto|schema|zod|validator|contract|type/.test(f) && !f.includes('node_modules'));
  const dtoTypes = {};
  for (const f of dtoFiles.slice(0, 20)) {
    const dto = extractDto(f);
    if (dto) Object.assign(dtoTypes, dto);
  }

  // Dedup
  const seen = new Set();
  const unique = endpoints.filter(e => { const k = `${e.method}:${e.path}`; if (seen.has(k)) return false; seen.add(k); return true; });

  return out('PASS', `${unique.length} endpoints, ${Object.keys(dtoTypes).length} DTOs, ${errors.length} errors`, {
    endpoints: unique, dtoTypes: Object.keys(dtoTypes), endpointCount: unique.length, dtoCount: Object.keys(dtoTypes).length, errorCount: errors.length, errors: errors.slice(0, 10), sourcesUsed: foundDirs.length > 0 ? foundDirs : ['auto-scanned'],
  });
}

function extractFromFile(fp, cwd, endpoints, errors) {
  try {
    const content = fs.readFileSync(fp, 'utf-8');
    const rel = path.relative(cwd, fp);
    // Express
    let re = /(router|app|route)\.(get|post|put|delete|patch|options)\(\s*['"]([^'"]+)['"]\s*,/gi;
    let m; while ((m = re.exec(content)) !== null) { pushEp(m[2].toUpperCase(), m[3], content, m.index, rel, endpoints); }
    // Fastify
    re = /(fastify|server|app)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]\s*,/gi;
    while ((m = re.exec(content)) !== null) { pushEp(m[2].toUpperCase(), m[3], content, m.index, rel, endpoints); }
    // Decorators @Get @Post
    re = /@(Get|Post|Put|Delete|Patch)\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = re.exec(content)) !== null) { pushEp(m[1].toUpperCase(), m[2], content, m.index, rel, endpoints); }
    // Tauri #[tauri::command]
    if (content.includes('tauri::command')) {
      const fnRe = /fn\s+(\w+)/g;
      while ((m = fnRe.exec(content)) !== null) {
        endpoints.push({ method: 'INVOKE', path: m[1], requestBody: inferBody(content, m.index), responseBody: {}, authRequired: true, controller: rel, handler: m[1], source: 'tauri' });
      }
    }
  } catch (e) { errors.push({ file: fp, error: e.message }); }
}

function pushEp(method, p, content, idx, rel, endpoints) {
  endpoints.push({ method, path: '/' + p.replace(/^\/+/, ''), requestBody: inferBody(content, idx), responseBody: {}, authRequired: /auth|verifyToken|authenticate|preHandler|@Auth|@UseGuards/.test(content), controller: rel, handler: extractHandler(content, idx) });
}

function extractHandler(content, idx) {
  const before = content.slice(Math.max(0, idx - 120), idx);
  const a = before.match(/(\w+)\s*[:=]\s*\(/); if (a) return a[1];
  const f = before.match(/(?:async\s+)?function\s+(\w+)/); if (f) return f[1];
  const after = content.slice(idx, idx + 300);
  const imp = after.match(/import\s+\{?\s*(\w+)\s*\}?\s+from/); if (imp) return imp[1];
  return 'handler';
}

function inferBody(content, idx) {
  const slice = content.slice(Math.max(0, idx - 300), idx + 500);
  return /req\.body|request\.body|body|dto|DTO|input|payload/.test(slice) ? { inferred: true } : {};
}

function extractFromOpenApi(fp, endpoints, errors) {
  try {
    const content = fs.readFileSync(fp, 'utf-8');
    const spec = fp.endsWith('.json') ? JSON.parse(content) : null;
    if (!spec?.paths) return;
    for (const [p, methods] of Object.entries(spec.paths)) {
      for (const [method, detail] of Object.entries(methods)) {
        if (!/^get|post|put|delete|patch$/.test(method)) continue;
        endpoints.push({ method: method.toUpperCase(), path: p, requestBody: detail.requestBody || {}, responseBody: detail.responses?.['200'] || detail.responses?.['201'] || {}, authRequired: !!(detail.security?.length > 0), controller: 'openapi', handler: detail.operationId || '', summary: detail.summary || '', source: 'openapi' });
      }
    }
  } catch (e) { errors.push({ file: fp, error: e.message }); }
}

function extractDto(fp) {
  try {
    const c = fs.readFileSync(fp, 'utf-8'); const t = {};
    let re = /export\s+(interface|type)\s+(\w+)\s*({[^}]+})/g; let m;
    while ((m = re.exec(c)) !== null) t[m[2]] = { kind: m[1], body: m[3].slice(0, 500) };
    re = /export\s+(const|function)\s+(\w+)\s*[:=][^;]*z\.object\(/g;
    while ((m = re.exec(c)) !== null) t[m[2]] = { kind: 'zod', body: c.slice(m.index, m.index + 200) };
    return Object.keys(t).length > 0 ? t : null;
  } catch { return null; }
}

function findFiles(dir, exts, ignore) {
  const r = [];
  const IGNORE_DEFAULT = ['node_modules', '.git', 'dist', 'build', '.next', 'target', '.cache', 'electron', '__pycache__'];
  const allIgnore = [...new Set([...IGNORE_DEFAULT, ...ignore])];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (allIgnore.some(i => e.name.includes(i))) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) r.push(...findFiles(f, exts, ignore));
      else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); // push full path
    }
  } catch {}
  return r;
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'api-contract-extractor', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
