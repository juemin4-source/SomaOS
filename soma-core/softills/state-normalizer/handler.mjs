#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { resolve } from 'path';


/**
 * state-normalizer — handler.js
 *
 * Normalize body-state to [0,1] and apply baseline drift.
 *
 * 用法: node handler.js <input-json-path>
 */


import fs from 'fs';

import path from 'path';

import { load } from './src/load-state.js';

import { clampState } from './src/clamp-state.js';

import { applyDrift } from './src/drift-state.js';

import { formatHuman } from './src/format-report.js';

function main() {
  let input;
  const p = process.argv[2];
  if (p && p !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(p), 'utf-8')); }
    catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(c).toString().trim();
      if (!raw) { console.error('No input received'); process.exit(1); return; }
      try { input = JSON.parse(raw); processInput(input); }
      catch (e) { console.error('Invalid JSON on stdin'); process.exit(1); }
    });
    return;
  }
  processInput(input);
}

function processInput(input) {

  const targetFile = input.targetFile;
  const mode = input.mode || 'preview';
  const applyDriftFlag = input.applyDrift !== false;
  const driftStep = input.driftStep || 0.05;

  // 1. Load
  const loaded = load(targetFile);
  if (!loaded.ok) {
    const r = { result: 'ERROR', targetFile, before: null, after: null, changes: [{ field: '$', before: null, after: null, reason: loaded.error }], summary: loaded.error };
    console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"state-normalizer"}, r), null, 2)); process.exit(1); return;
  }

  let state = { ...loaded.data };
  let allChanges = [];

  // 2. Clamp
  const { clamped, changes: clampChanges } = clampState(state);
  state = clamped;
  allChanges.push(...clampChanges);

  // 3. Drift
  if (applyDriftFlag) {
    const { drifted, changes: driftChanges } = applyDrift(state, driftStep);
    state = drifted;
    allChanges.push(...driftChanges);
  }

  // 4. Preview mode — don't write
  if (mode === 'preview') {
    const r = { result: 'PREVIEW', targetFile, before: loaded.data, after: state, changes: allChanges, summary: `Normalized ${Object.keys(state).length} fields${applyDriftFlag ? ` with driftStep=${driftStep}` : ''}.` };
    console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"state-normalizer"}, r), null, 2)); return;
  }

  // 5. Write mode
  if (mode === 'write') {
    fs.writeFileSync(path.resolve(targetFile), JSON.stringify(state, null, 2) + '\n', 'utf-8');
    const r = { result: 'WRITTEN', targetFile, before: loaded.data, after: state, changes: allChanges, summary: `Body-state normalized and written.` };
    console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"state-normalizer"}, r), null, 2)); return;
  }

  const r = { result: 'ERROR', targetFile, before: null, after: null, changes: [], summary: `Invalid mode: ${mode}` };
  console.log(JSON.stringify(Object.assign({softill:"state-normalizer"}, r), null, 2)); process.exit(1);
}

main();
