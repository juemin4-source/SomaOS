#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { resolve } from 'path';


/**
 * threshold-registry — handler.js
 *
 * Evaluate Soma state values against unified threshold registry.
 *
 * 用法: node handler.js <input-json-path>
 */


import fs from 'fs';

import path from 'path';

import { evaluateField } from './src/evaluate-field.js';

import { evaluateState } from './src/evaluate-state.js';

import { formatHuman } from './src/format-report.js';

function main() {
  let input;
  const p = process.argv[2];
  if (p && p !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(p), 'utf-8')); }
    catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }
  } else {
    const c = []; process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(c).toString().trim();
      if (!raw) { console.error('No input received'); process.exit(1); return; }
      try { input = JSON.parse(raw); } catch (e) { console.error('Invalid JSON on stdin'); process.exit(1); return; }
      processInput(input);
    }); return;
  }
  processInput(input);
}

function processInput(input) {

  const mode = input.mode || 'single';

  if (mode === 'single') {
    const result = evaluateField(input.field, input.value);
    if (!result.ok) {
      const r = { result: 'ERROR', evaluations: [{ field: input.field, error: result.error }], summary: result.error };
      console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2)); process.exit(1); return;
    }
    const r = {
      result: 'PASS',
      evaluations: [result],
      summary: `${input.field}=${input.value} classified as ${result.level}.`,
    };
    console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2));
    return;
  }

  if (mode === 'full-state') {
    const targetFile = path.resolve(input.targetFile);
    if (!fs.existsSync(targetFile)) {
      const r = { result: 'ERROR', evaluations: [], summary: `File not found: ${input.targetFile}` };
      console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2)); process.exit(1); return;
    }
    let state;
    try { state = JSON.parse(fs.readFileSync(targetFile, 'utf-8')); }
    catch (e) {
      const r = { result: 'ERROR', evaluations: [], summary: `Invalid JSON: ${e.message}` };
      console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2)); process.exit(1); return;
    }

    const full = evaluateState(state);
    const r = {
      result: 'PASS',
      evaluations: full.evaluations,
      highestLevel: full.highestLevel,
      highestMode: full.highestMode,
      criticalFields: full.criticalFields,
      allInhibit: full.allInhibit,
      allExcite: full.allExcite,
      summary: `Evaluated ${full.evaluations.length} body-state fields. Highest level: ${full.highestLevel}.`,
    };
    console.log(formatHuman(r)); console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2));
    return;
  }

  const r = { result: 'ERROR', evaluations: [], summary: `Invalid mode: ${mode}` };
  console.log(JSON.stringify(Object.assign({softill:"threshold-registry"}, r), null, 2)); process.exit(1);
}

main();
