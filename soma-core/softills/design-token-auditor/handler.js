#!/usr/bin/env node
/**
 * design-token-auditor — handler.js
 *
 * 扫描硬编码颜色、字号、间距、圆角、阴影 vs 设计 token。
 *
 * 输入: { cwd, sources?, tokens?: { colors?, fontSizes?, spacing?, radii?, shadows? } }
 * 输出: { hardcoded: { colors, fontSizes, spacing, radii, shadows }, recommendations }
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
    process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); } });
    return;
  }
  handle(input);
}

function handle(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const scanDirs = input.sources || ['src', 'app'];
  const tokenFile = input.tokenFile || null;
  const knownTokens = input.tokens || { colors: [], fontSizes: [], spacing: [], radii: [], shadows: [] };

  const files = [];
  for (const d of scanDirs) {
    const fp = path.join(cwd, d);
    if (fs.existsSync(fp)) files.push(...findFiles(fp, ['.css', '.scss', '.less', '.tsx', '.jsx', '.ts', '.js', '.vue'], ['node_modules']));
  }
  if (files.length === 0) files.push(...findFiles(cwd, ['.css', '.tsx', '.ts'], ['node_modules']));

  // If token file specified, load it
  if (tokenFile) {
    const tfp = path.resolve(cwd, tokenFile);
    if (fs.existsSync(tfp)) {
      try {
        const tc = fs.readFileSync(tfp, 'utf-8');
        const hexTokens = tc.match(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]+)/g);
        if (hexTokens) knownTokens.colors = hexTokens.map(h => h.split(':')[1]?.trim()).filter(Boolean);
      } catch {}
    }
  }

  // Patterns to detect
  const hardcoded = { colors: {}, fontSizes: {}, spacing: {}, radii: {}, shadows: {} };

  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const relPath = path.relative(cwd, fp);
      const lines = content.split('\n');

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        // Hex colors: #ff0033, #abc, #aabbcc
        const hexColors = line.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g);
        if (hexColors) {
          for (const c of hexColors) {
            if (!knownTokens.colors.includes(c)) {
              if (!hardcoded.colors[c]) hardcoded.colors[c] = [];
              if (!hardcoded.colors[c].some(h => h.file === relPath)) hardcoded.colors[c].push({ file: relPath, line: li + 1 });
            }
          }
        }

        // RGB/RGBA colors
        const rgbColors = line.match(/rgb[a]?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g);
        if (rgbColors) {
          for (const c of rgbColors) {
            if (!hardcoded.colors[c]) hardcoded.colors[c] = [];
            if (!hardcoded.colors[c].some(h => h.file === relPath)) hardcoded.colors[c].push({ file: relPath, line: li + 1 });
          }
        }

        // Non-standard font sizes (not multiples of 2, not matching common tokens)
        const fontSizes = line.match(/font-size:\s*(\d+)px/g);
        if (fontSizes) {
          for (const fs of fontSizes) {
            const val = parseInt(fs.match(/\d+/)[0]);
            if (val % 2 !== 0 || ![12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72].includes(val)) {
              if (!hardcoded.fontSizes[val]) hardcoded.fontSizes[val] = [];
              if (!hardcoded.fontSizes[val].some(h => h.file === relPath)) hardcoded.fontSizes[val].push({ file: relPath, line: li + 1 });
            }
          }
        }

        // Non-standard spacing (not multiples of 4)
        const spacing = line.match(/(?:margin|padding)[-\w]*:\s*(\d+)px/g);
        if (spacing) {
          for (const s of spacing) {
            const val = parseInt(s.match(/\d+/)[0]);
            if (val > 0 && val % 4 !== 0 && val !== 2 && val !== 6) {
              if (!hardcoded.spacing[val]) hardcoded.spacing[val] = [];
              if (!hardcoded.spacing[val].some(h => h.file === relPath)) hardcoded.spacing[val].push({ file: relPath, line: li + 1 });
            }
          }
        }

        // Non-standard radius
        const radii = line.match(/border-radius:\s*(\d+)px/g);
        if (radii) {
          for (const r of radii) {
            const val = parseInt(r.match(/\d+/)[0]);
            if (![0, 2, 4, 6, 8, 12, 16, 24].includes(val)) {
              if (!hardcoded.radii[val]) hardcoded.radii[val] = [];
              if (!hardcoded.radii[val].some(h => h.file === relPath)) hardcoded.radii[val].push({ file: relPath, line: li + 1 });
            }
          }
        }

        // Shadows
        const shadowCheck = line.includes('box-shadow:') && !line.includes('var(');
        if (shadowCheck) {
          if (!hardcoded.shadows._count) hardcoded.shadows._count = [];
          hardcoded.shadows._count.push({ file: relPath, line: li + 1, snippet: line.trim().slice(0, 60) });
        }
      }
    } catch {}
  }

  // Stats
  const totalHardcoded = Object.values(hardcoded.colors).length + Object.values(hardcoded.fontSizes).length +
    Object.values(hardcoded.spacing).length + Object.values(hardcoded.radii).length + (hardcoded.shadows._count?.length || 0);

  const recommendations = [];
  if (Object.keys(hardcoded.colors).length > 0) recommendations.push(`${Object.keys(hardcoded.colors).length} unique hardcoded colors — use CSS variables`);
  if (Object.keys(hardcoded.fontSizes).length > 0) recommendations.push(`${Object.keys(hardcoded.fontSizes).length} non-standard font sizes — use type scale tokens`);
  if (Object.keys(hardcoded.spacing).length > 0) recommendations.push(`${Object.keys(hardcoded.spacing).join(', ')}px spacing not in 4px grid — use spacing tokens`);
  if (Object.keys(hardcoded.radii).length > 0) recommendations.push(`${Object.keys(hardcoded.radii).join(', ')}px non-standard radii — use radius tokens`);
  if (hardcoded.shadows._count?.length > 0) recommendations.push(`${hardcoded.shadows._count.length} hardcoded box-shadows — use shadow tokens`);

  return out(totalHardcoded > 0 ? 'WARN' : 'PASS',
    `${totalHardcoded} hardcoded values (${Object.keys(hardcoded.colors).length} colors, ${Object.keys(hardcoded.fontSizes).length} font sizes, ${Object.keys(hardcoded.spacing).length} spacing, ${Object.keys(hardcoded.radii).length} radii)`,
    { hardcodedValues: hardcoded, totalHardcoded, recommendations, filesScanned: files.length }
  );
}

function findFiles(dir, exts, ignore) {
  const r = []; const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (IGNORE.some(i => e.name.includes(i)) || ignore.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'design-token-auditor', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : r === 'WARN' ? 0 : 1); }
if (require.main === module) main();
