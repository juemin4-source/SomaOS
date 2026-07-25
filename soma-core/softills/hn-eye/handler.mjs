#!/usr/bin/env node
/**
 * hn-eye — handler.mjs
 * 浏览 Hacker News 故事和评论
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
  const action = input.action || 'top';
  const limit = input.limit || 10;
  try {
    if (action === 'top') {
      const ids = await get('https://hacker-news.firebaseio.com/v0/topstories.json');
      const stories = [];
      const items = Array.isArray(ids) ? ids.slice(0, limit) : [];
      for (const id of items) {
        try {
          const s = await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          stories.push({ id: s.id, title: s.title?.slice(0, 200), by: s.by, score: s.score, comments: s.descendants, url: s.url || `https://news.ycombinator.com/item?id=${s.id}` });
        } catch { /* skip individual story errors */ }
      }
      return out('PASS', `Top ${stories.length} HN stories`, { stories, count: stories.length });
    }
    if (action === 'new') {
      const ids = await get('https://hacker-news.firebaseio.com/v0/newstories.json');
      const items = Array.isArray(ids) ? ids.slice(0, limit) : [];
      return out('PASS', `${items.length} new story IDs`, { ids: items });
    }
    if (action === 'item' || action === 'story') {
      if (!input.id) return out('ERROR', 'id required');
      const s = await get(`https://hacker-news.firebaseio.com/v0/item/${input.id}.json`);
      return out('PASS', s.title?.slice(0, 100) || 'Story', { story: s });
    }
    if (action === 'user') {
      if (!input.name) return out('ERROR', 'name required');
      const u = await get(`https://hacker-news.firebaseio.com/v0/user/${input.name}.json`);
      return out('PASS', `${u.id}: ${u.karma} karma`, { user: u });
    }
    return out('ERROR', `Unknown action: ${action}`);
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'hn-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
