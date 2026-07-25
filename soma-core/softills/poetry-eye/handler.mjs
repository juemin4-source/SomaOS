#!/usr/bin/env node
/**
 * poetry-eye — handler.mjs
 * 通过 PoetryDB API 浏览和检索诗歌
 */
import { get } from '../_shared/connector.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(readFileSync(resolve(a), 'utf-8')); }
    catch (e) { return out('ERROR', 'Read: ' + e.message); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); handle(input); }
      catch (e) { out('ERROR', 'Parse: ' + e.message); }
    });
    return;
  }
  handle(input);
}

async function handle(input) {
  const action = input.action || 'random';
  const BASE = 'https://poetrydb.org';
  try {
    if (action === 'random') {
      const d = await get(`${BASE}/random/${input.count || 1}`);
      const poems = Array.isArray(d) ? d.map(p => ({ title: p.title, author: p.author, lines: p.lines || [], lineCount: p.linecount })) : [];
      return out('PASS', `${poems[0]?.title || 'Poem'} by ${poems[0]?.author || 'unknown'}`, { poems: poems.slice(0, 3) });
    }
    if (action === 'author') {
      if (!input.author) return out('ERROR', 'author required');
      const d = await get(`${BASE}/author/${encodeURIComponent(input.author)}`);
      const titles = Array.isArray(d) ? d.map(p => p.title) : [];
      return out('PASS', `${titles.length} poems by ${input.author}`, { author: input.author, poems: titles, count: titles.length });
    }
    if (action === 'title') {
      if (!input.title) return out('ERROR', 'title required');
      const d = await get(`${BASE}/title/${encodeURIComponent(input.title)}`);
      const p = Array.isArray(d) ? d[0] : null;
      return out('PASS', p ? `${p.title} by ${p.author}` : 'Not found', { poem: p || null });
    }
    if (action === 'search') {
      const lines = input.text || input.lines;
      if (!lines) return out('ERROR', 'text/lines required');
      const d = await get(`${BASE}/lines/${encodeURIComponent(lines)}`);
      const results = Array.isArray(d) ? d.slice(0, 10) : [];
      return out('PASS', `${results.length} poems matching "${lines.slice(0, 40)}"`, { results, count: results.length });
    }
    return out('ERROR', 'Unknown action');
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'poetry-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
