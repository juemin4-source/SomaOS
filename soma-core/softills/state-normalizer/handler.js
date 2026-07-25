#!/usr/bin/env node

/**
 * state-normalizer — handler.js
 *
 * Normalize body-state to [0,1] and apply baseline drift.
 *
 * 用法: node handler.js <input-json-path>
 */

const fs = require('fs');
const path = require('path');
const { load } = require('./src/load-state');
const { clampState } = require('./src/clamp-state');
const { applyDrift } = require('./src/drift-state');
const { formatHuman } = require('./src/format-report');

function main() {
  const p = process.argv[2];
  if (!p) { console.error('Usage: node handler.js <input-json>'); process.exit(1); }

  let input;
  try { input = JSON.parse(fs.readFileSync(path.resolve(p), 'utf-8')); }
  catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }

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
