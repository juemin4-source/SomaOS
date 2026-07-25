#!/usr/bin/env node
/**
 * props-contract-extractor — handler.js
 *
 * 提取 TypeScript/React 组件 props 接口。
 * 与 component-inventory 配合使用，提供类型级精确度。
 *
 * 输入: { cwd, components?: [{name, file}], sources? }
 * 输出: { props: [{ component, props: [{ name, type, required, defaultValue }] }] }
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
  const scanDirs = input.sources || ['src', 'app', 'components'];
  const results = [];
  const errors = [];

  // If components specified, only scan those files
  if (input.components && input.components.length > 0) {
    for (const comp of input.components) {
      const fp = path.resolve(cwd, comp.file);
      if (!fs.existsSync(fp)) { errors.push({ component: comp.name, error: 'File not found' }); continue; }
      const props = extractPropsFromFile(fp, comp.name);
      results.push({ component: comp.name, file: comp.file, props, propCount: props.length });
    }
  } else {
    // Auto-scan: find component files and extract
    const files = [];
    for (const d of scanDirs) {
      const fp = path.join(cwd, d);
      if (fs.existsSync(fp)) files.push(...findFiles(fp, ['.tsx', '.ts'], ['node_modules']));
    }
    if (files.length === 0) files.push(...findFiles(cwd, ['.tsx', '.ts'], ['node_modules']));

    for (const fp of files) {
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        const defs = [
          ...content.matchAll(/export\s+(default\s+)?function\s+(\w+)\s*\(/g),
          ...content.matchAll(/export\s+(const|function)\s+(\w+)\s*(:\s*React\.(FC|FunctionComponent))?/g),
        ];
        const seen = new Set();
        for (const m of defs) {
          const name = m[2] || m[1];
          if (!name || name.startsWith('_') || seen.has(name)) continue;
          seen.add(name);
          const props = extractPropsFromContent(content, name);
          if (props.length > 0 || content.includes(`<${name}`)) {
            results.push({ component: name, file: path.relative(cwd, fp), props, propCount: props.length });
          }
        }
      } catch (e) { errors.push({ file: fp.slice(-40), error: e.message.slice(0, 60) }); }
    }
  }

  return out('PASS', `${results.length} components, ${results.reduce((s, r) => s + r.propCount, 0)} props extracted`, {
    contracts: results, componentCount: results.length, totalProps: results.reduce((s, r) => s + r.propCount, 0), errors: errors.slice(0, 10),
  });
}

function extractPropsFromFile(fp, compName) {
  try { return extractPropsFromContent(fs.readFileSync(fp, 'utf-8'), compName); }
  catch { return []; }
}

function extractPropsFromContent(content, compName) {
  const props = [];

  // 1. Interface matching: interface CompNameProps { ... } or type CompNameProps = { ... }
  const propTypeName = `${compName}Props`;
  const ifaceMatch = content.match(new RegExp(`(?:interface|type)\\s+${propTypeName}\\s*(?:extends\\s+\\w+\\s*)?({[\\s\\S]*?})\\s*(?:extends|implements|$)`));
  if (ifaceMatch) {
    const body = ifaceMatch[1].replace(/^\{|\}$/g, '');
    const lines = body.split(';').map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const p = line.match(/^\s*(readonly\s+)?(\w+)\??\s*:\s*([^;=]+?)(?:\s*=\s*([^;]+))?$/);
      if (p) {
        props.push({ name: p[2], type: p[3].trim().slice(0, 80), required: !line.includes('?'), defaultValue: p[4]?.trim().slice(0, 40) || null });
      }
    }
    return props;
  }

  // 2. Destructured props in function params: function Comp({ a, b }: { a: string, b: number })
  const destructured = content.match(new RegExp(`${compName}\\s*\\(\\s*\\{\\s*([^}]+)\\s*\\}\\s*(?::\\s*({[^}]+}))?`));
  if (destructured) {
    const typeBody = destructured[2];
    if (typeBody) {
      const fields = typeBody.replace(/[{}]/g, '').split(';').map(s => s.trim()).filter(Boolean);
      for (const f of fields) {
        const p = f.match(/(\w+)\??\s*:\s*(.+)/);
        if (p) props.push({ name: p[1], type: p[2].trim().slice(0, 80), required: !f.includes('?') });
      }
    } else {
      // Just prop names without types
      destructured[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean).forEach(n => {
        if (!props.find(p => p.name === n)) props.push({ name: n, type: 'unknown', required: true });
      });
    }
    return props;
  }

  return props;
}

function findFiles(dir, exts, ignore) {
  const r = []; const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (IGNORE.some(i => e.name.includes(i)) || ignore.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'props-contract-extractor', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
