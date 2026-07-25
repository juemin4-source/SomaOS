#!/usr/bin/env node
/**
 * quote-eye — handler.mjs
 * 获取名言、每日语录、编程箴言和笑话
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
  try {
    if (action === 'random' || action === 'zen') {
      const d = await get('https://zenquotes.io/api/random');
      const q = Array.isArray(d) ? d[0] : null;
      if (q) return out('PASS', `"${q.q}" — ${q.a}`, { quote: q.q, author: q.a });
    }
    if (action === 'daily') {
      const d = await get('https://zenquotes.io/api/today');
      const q = Array.isArray(d) ? d[0] : null;
      if (q) return out('PASS', `"${q.q}" — ${q.a}`, { quote: q.q, author: q.a, source: 'daily' });
    }
    if (action === 'programming' || action === 'dev') {
      const d = await get('https://programming-quotes-api.herokuapp.com/quotes/random');
      if (d) return out('PASS', `"${d.en}" — ${d.author}`, { quote: d.en, author: d.author, source: 'programming' });
    }
    if (action === 'joke') {
      const d = await get('https://v2.jokeapi.dev/joke/Any?type=single');
      if (d?.joke) return out('PASS', d.joke, { joke: d.joke, category: d.category });
      if (d?.setup) return out('PASS', `${d.setup} — ${d.delivery}`, { setup: d.setup, delivery: d.delivery });
    }
    return out('WARN', 'No quote found');
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'quote-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
