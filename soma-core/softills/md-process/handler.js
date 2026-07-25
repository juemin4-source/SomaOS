#!/usr/bin/env node
/**
 * md-process — handler.js
 *
 * Markdown 处理 softill。支持 md → text / md → json / md → tokens。
 * 基于 marked（已安装）。
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

function loadMarked() {
  try { return require('marked'); } catch { return null; }
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return out('ERROR', `Failed to read input: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const marked = loadMarked();
  if (!marked) return out('ERROR', 'marked not available (npm install marked)');

  const mode = input.mode || 'text';
  const content = input.content || (input.file ? fs.readFileSync(path.resolve(input.file), 'utf-8') : '');

  if (!content) return out('ERROR', 'content or file required');

  switch (mode) {
    case 'text': {
      const html = marked.parse(content, { async: false });
      const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return out('PASS', `Extracted ${plain.length} chars of plain text`, { plain, html, chars: plain.length, originalBytes: content.length });
    }
    case 'tokens': {
      const tokens = marked.lexer(content);
      const summary = tokens.map(t => `[${t.type}] ${t.text?.slice(0, 60) || ''}`).filter(Boolean);
      return out('PASS', `${tokens.length} tokens parsed`, { tokenCount: tokens.length, types: [...new Set(tokens.map(t => t.type))], summary: summary.slice(0, 20) });
    }
    case 'sections': {
      const tokens = marked.lexer(content);
      const headings = tokens.filter(t => t.type === 'heading').map(t => ({ depth: t.depth, text: t.text }));
      return out('PASS', `${headings.length} headings found`, { headings });
    }
    default:
      return out('ERROR', `Unknown mode: ${mode}`);
  }
}

function out(result, summary, data) {
  const output = { softill: 'md-process', result, summary, data: data || {}, evidence: [] };
  console.log(JSON.stringify(output, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
