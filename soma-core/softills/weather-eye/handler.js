#!/usr/bin/env node
// handler.js — CJS wrapper → delegates to ESM handler.mjs
// MCP bridge runs: node handler.js --  (stdin piped)
const { spawnSync } = require('child_process');
const path = require('path');
const mjs = path.join(__dirname, 'handler.mjs');

const result = spawnSync('node', [mjs, '--'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  encoding: 'utf-8',
  timeout: 30000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
