#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ui-screenshot-runner — handler.js
 *
 * 自动跑前端页面截图，生成可视化验证报告。
 * 基于 Playwright，支持 routes + viewport + auth。
 *
 * 输入: { baseUrl, routes: [{path, name}], viewports?: [{width, height}], outputDir?, auth?: {endpoint?, credentials?} }
 * 输出: { screenshots: [{ route, viewport, file }], reportFile, summary }
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */


import fs from 'fs';

const require = createRequire(import.meta.url);

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

async function handle(input) {
  const baseUrl = input.baseUrl || 'http://localhost:5173';
  const routes = input.routes || [{ path: '/', name: 'home' }];
  const viewports = input.viewports || [{ width: 1280, height: 800 }, { width: 375, height: 667 }];
  const outputDir = path.resolve(input.outputDir || '.soma-screenshots');
  const auth = input.auth || null;

  let playwright;
  try { playwright = require('playwright'); }
  catch (e) { return out('ERROR', 'playwright not installed. Run: npm install playwright in .claude/softills/'); }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const screenshots = [];
  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Auth if needed
    if (auth) {
      const authPage = await context.newPage();
      try {
        await authPage.goto(auth.endpoint || `${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 10000 });
        if (auth.credentials) {
          if (auth.credentials.username) await authPage.fill('input[name="username"], input[name="email"]', auth.credentials.username);
          if (auth.credentials.password) await authPage.fill('input[name="password"]', auth.credentials.password);
          await authPage.click('button[type="submit"], button:has-text("Login")');
          await authPage.waitForTimeout(2000);
        }
      } catch {} finally { await authPage.close(); }
    }

    for (const route of routes) {
      const url = route.path.startsWith('http') ? route.path : `${baseUrl}${route.path}`;
      for (const vp of viewports) {
        const page = await context.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const fileName = `${route.name}_${vp.width}x${vp.height}.png`;
        const filePath = path.join(outputDir, fileName);
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(500);
          await page.screenshot({ path: filePath, fullPage: true });
          screenshots.push({ route: route.name, path: route.path, viewport: `${vp.width}x${vp.height}`, file: fileName, ok: true });
        } catch (e) {
          screenshots.push({ route: route.name, path: route.path, viewport: `${vp.width}x${vp.height}`, error: e.message.slice(0, 100), ok: false });
          // Capture error state screenshot
          try { await page.screenshot({ path: path.join(outputDir, `ERROR_${fileName}`) }); } catch {}
        } finally { await page.close(); }
      }
    }

    // Generate HTML report
    const reportHtml = generateReport(screenshots, outputDir);
    const reportFile = path.join(outputDir, 'soma-visual-report.html');
    fs.writeFileSync(reportFile, reportHtml, 'utf-8');

    const successCount = screenshots.filter(s => s.ok).length;
    const failCount = screenshots.filter(s => !s.ok).length;

    await browser.close();
    return out('PASS', `${successCount}/${screenshots.length} screenshots (${failCount} failed)`, {
      screenshots, reportFile, successCount, failCount, outputDir, routesCount: routes.length, viewportCount: viewports.length,
    });
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    return out('ERROR', `Screenshot run failed: ${e.message}`);
  }
}

function generateReport(screenshots, outputDir) {
  const rows = screenshots.map(s => `
    <tr>
      <td>${s.route}</td>
      <td>${s.path}</td>
      <td>${s.viewport}</td>
      <td>${s.ok ? '<span style="color:green">✅</span>' : '<span style="color:red">❌ ' + (s.error || '') + '</span>'}</td>
      <td>${s.ok ? `<a href="${s.file}" target="_blank">view</a>` : '-'}</td>
    </tr>`).join('\n');

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Soma Visual Report</title>
<style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:24px}
table{border-collapse:collapse;width:100%}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #30363d}
th{color:#8b949e;font-size:12px;text-transform:uppercase}
img{max-width:100%;border:1px solid #30363d;border-radius:4px;margin-top:8px}</style></head>
<body><h1>Soma Visual Report</h1><p>${screenshots.filter(s=>s.ok).length}/${screenshots.length} screenshots</p>
<table><thead><tr><th>Route</th><th>Path</th><th>Viewport</th><th>Status</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'ui-screenshot-runner', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();