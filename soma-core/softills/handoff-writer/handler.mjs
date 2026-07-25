#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * handoff-writer — handler.js
 *
 * 窗口结束时写 session handoff。
 * 解决"一个窗口不能长期持有项目"——新窗口通过 handoff 接续。
 *
 * 输入: { episodeId, taskId, contextLoaded, decisionsMade, softillsRun, handoffSummary }
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

const SESSIONS_DIR = path.resolve(__dirname, '..', '..', 'soma', 'sessions');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
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
  const episodeId = input.episodeId || `episode-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
  const taskId = input.taskId || null;

  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  const session = {
    episodeId,
    taskId,
    startedAt: input.startedAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
    contextLoaded: input.contextLoaded || [],
    decisionsMade: input.decisionsMade || [],
    softillsRun: input.softillsRun || [],
    handoffSummary: input.handoffSummary || '',
    _notes: input.notes || '',
  };

  const filePath = path.join(SESSIONS_DIR, `${episodeId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n', 'utf-8');

  return out('PASS', `Handoff written: ${episodeId}`, {
    episodeId,
    file: filePath,
    summary: session.handoffSummary.slice(0, 200),
    decisionsCount: session.decisionsMade.length,
    softillsCount: session.softillsRun.length,
  });
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'handoff-writer', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();