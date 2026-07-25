#!/usr/bin/env node

/**
 * threshold-registry — handler.js
 *
 * Evaluate Soma state values against unified threshold registry.
 *
 * 用法: node handler.js <input-json-path>
 */

const fs = require('fs');
const path = require('path');
const { evaluateField } = require('./src/evaluate-field');
const { evaluateState } = require('./src/evaluate-state');
const { formatHuman } = require('./src/format-report');

function main() {
  const p = process.argv[2];
  if (!p) { console.error('Usage: node handler.js <input-json>'); process.exit(1); }

  let input;
  try { input = JSON.parse(fs.readFileSync(path.resolve(p), 'utf-8')); }
  catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }

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
