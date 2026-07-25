#!/usr/bin/env node
/**
 * dict-eye — handler.mjs
 * 通过 FreeDictionary API 查英语单词定义
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
  const word = input.word || input.query;
  if (!word) return out('ERROR', 'word required');
  try {
    const d = await get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const entry = Array.isArray(d) ? d[0] : null;
    if (!entry) return out('WARN', `"${word}" not found`);
    const meanings = entry.meanings || [];
    const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
    const defs = meanings.slice(0, 3).map(m => ({
      partOfSpeech: m.partOfSpeech, definition: m.definitions?.[0]?.definition,
      example: m.definitions?.[0]?.example, synonyms: (m.definitions?.[0]?.synonyms || []).slice(0, 5),
      antonyms: (m.definitions?.[0]?.antonyms || []).slice(0, 3),
    }));
    const allSynonyms = [...new Set(meanings.flatMap(m => m.definitions?.flatMap(d => d.synonyms || []) || []))].slice(0, 10);
    return out('PASS', `${word}${phonetic ? ' [' + phonetic + ']' : ''} — ${defs[0]?.definition?.slice(0, 100) || 'defined'}`, {
      word, phonetic, meanings: defs, synonyms: allSynonyms, sourceUrl: entry.sourceUrls?.[0],
    });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('404') || msg.includes('Not Found')) return out('WARN', `"${word}" not found`);
    return out('ERROR', msg.slice(0, 200));
  }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'dict-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
