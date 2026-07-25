#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * frontend-route-map — handler.js
 *
 * 扫描前端路由配置，生成页面/布局/守卫映射。
 * 支持 react-router, Next.js, Vue Router, TanStack Router。
 *
 * 输入: { cwd, sources? }
 * 输出: { routes: [{ path, page, layout, guards, children }] }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); } });
    return;
  }
  handle(input);
}

function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const routes = [];
  const errors = [];
  const scanDirs = input.sources || ['src', 'app', 'pages'];

  const files = [];
  for (const d of scanDirs) {
    const fp = path.join(cwd, d);
    if (fs.existsSync(fp)) files.push(...findFiles(fp, ['.ts', '.tsx', '.js', '.jsx'], ['node_modules']));
  }
  if (files.length === 0) files.push(...findFiles(cwd, ['.ts', '.tsx', '.js', '.jsx'], ['node_modules']));

  // Route patterns
  const patterns = [
    // react-router: <Route path="/foo" element={<Page />} />
    /<Route\s+(?:path=['"]([^'"]+)['"]\s+)?element=\{?<\s*(\w+)/g,
    // react-router createBrowserRouter
    /path:\s*['"]([^'"]+)['"][^}]*element:\s*<\s*(\w+)/g,
    // Next.js App Router: export default function Page
    // (detected via file-based routing)
    // Vue Router: { path: '/foo', component: Foo }
    /\{\s*path:\s*['"]([^'"]+)['"][^}]*component:\s*(\w+)/g,
    // TanStack Router: { path: '/foo', component: Foo }
    /\{\s*path:\s*['"]([^'"]+)['"][^}]*component:\s*(\w+)/g,
    // Layout detection
    /layout:\s*<\s*(\w+)/g,
  ];

  const layouts = new Set();

  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const relPath = path.relative(cwd, fp);

      // Check if this is a layout file
      if (relPath.includes('layout') || relPath.includes('Layout')) {
        const layoutMatch = content.match(/export\s+default\s+function\s+(\w+)/) || content.match(/const\s+(\w+Layout)\s*[:=]/);
        if (layoutMatch) layouts.add(layoutMatch[1]);
      }

      // Check for guards/middleware
      const guards = [];
      if (content.includes('requireAuth') || content.includes('ProtectedRoute') || content.includes('AuthGuard')) guards.push('requireAuth');
      if (content.includes('requireAdmin') || content.includes('AdminGuard')) guards.push('requireAdmin');
      if (content.includes('requireGuest')) guards.push('requireGuest');

      for (const pattern of patterns) {
        let m; pattern.lastIndex = 0;
        while ((m = pattern.exec(content)) !== null) {
          const existing = routes.find(r => r.path === m[1] && r.page === m[2]);
          if (!existing) {
            routes.push({ path: m[1], page: `${m[2]}.tsx`, file: relPath, guards: [...guards], layout: findLayout(content) });
          }
        }
      }

      // Next.js App Router: detect by filename
      if (relPath.endsWith('page.tsx') || relPath.endsWith('page.js') || relPath.endsWith('page.jsx')) {
        const pageDir = path.dirname(relPath);
        const pageNameMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
        const pathFromDir = pageDir.replace(/^src\//, '').replace(/^app\//, '/').replace(/\/page$/, '') || '/';
        if (!routes.find(r => r.path === pathFromDir)) {
          routes.push({ path: pathFromDir, page: relPath, file: relPath, guards: detectGuards(content), layout: null, source: 'next-file-based' });
        }
      }
    } catch (e) { errors.push({ file: relPath?.slice(-40), error: e.message.slice(0, 60) }); }
  }

  // Dedup
  const seen = new Set();
  const unique = routes.filter(r => { const k = r.path + r.page; if (seen.has(k)) return false; seen.add(k); return true; });

  return out('PASS', `${unique.length} routes, ${layouts.size} layouts`, { routes: unique, routeCount: unique.length, layoutCount: layouts.size, layouts: [...layouts], errors: errors.slice(0, 10) });
}

function findLayout(content) {
  const m = content.match(/layout:\s*<\s*(\w+)/) || content.match(/useLayout\(['"]?(\w+)['"]?\)/);
  return m ? m[1] : null;
}

function detectGuards(content) {
  const g = [];
  if (/requireAuth|ProtectedRoute|AuthGuard/.test(content)) g.push('requireAuth');
  if (/requireAdmin|AdminGuard/.test(content)) g.push('requireAdmin');
  return g;
}

function findFiles(dir, exts, ignore) {
  const r = []; const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (IGNORE.some(i => e.name.includes(i)) || ignore.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'frontend-route-map', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();