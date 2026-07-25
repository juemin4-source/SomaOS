#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * project-profile-detector — handler.js
 *
 * 轻量读取项目配置，输出结构化项目类型。
 * 不扫描全仓库，只读关键配置文件的头几行。
 *
 * 输入: { cwd?: string }
 * 输出: { projectType, packageManager, testCommands, buildCommands, entryFiles, riskNotes }
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

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
  const cwd = path.resolve(input.cwd || process.cwd());
  const maxDepth = input.maxDepth || 1;
  const result = { cwd, projectType: 'unknown', packageManager: null, testCommands: [], buildCommands: [], devCommands: [], entryFiles: [], riskNotes: [], detectedFiles: [] };

  // ── Read key config files ───────────────────────────────────
  const candidates = [
    'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
    'vite.config.ts', 'vite.config.js',
    'tsconfig.json', 'tsconfig.node.json',
    'next.config.js', 'next.config.ts',
    'nuxt.config.ts', 'nuxt.config.js',
    'vitest.config.ts', 'vitest.config.js',
    'jest.config.js', 'jest.config.ts',
    'playwright.config.ts', 'playwright.config.js',
    'Cargo.toml', 'go.mod', 'Gemfile', 'requirements.txt',
    'README.md', 'index.html',
  ];

  for (const file of candidates) {
    const fp = path.join(cwd, file);
    if (fs.existsSync(fp)) {
      result.detectedFiles.push(file);
      const content = fs.readFileSync(fp, 'utf-8').slice(0, 2000);

      // package.json — project type, scripts, test commands
      if (file === 'package.json') {
        try {
          const pj = JSON.parse(content);
          result.packageManager = pj.packageManager || (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' : 'npm');
          result.testCommands = extractCommands(pj.scripts, ['test', 'qa', 'check', 'verify', 'test:e2e', 'test:unit']);
          result.buildCommands = extractCommands(pj.scripts, ['build', 'compile', 'dist']);
          result.devCommands = extractCommands(pj.scripts, ['dev', 'start', 'serve']);
          if (pj.scripts?.['test:e2e']) result.riskNotes.push('has e2e tests — may require longer test timeouts');
          if (pj.scripts?.lint) result.riskNotes.push('has lint script');
          const deps = { ...pj.dependencies, ...pj.devDependencies };
          if (deps) {
            const keys = Object.keys(deps);
            if (keys.some(k => k.includes('electron'))) result.riskNotes.push('electron project');
            if (keys.some(k => k.includes('react'))) result.riskNotes.push('react project');
            if (keys.some(k => k.includes('vue'))) result.riskNotes.push('vue project');
            if (keys.some(k => k.includes('tauri'))) result.riskNotes.push('tauri project');
            if (keys.some(k => k.includes('playwright'))) result.riskNotes.push('has playwright — test-runner must allow browser tests');
          }
        } catch {}
      }

      // vite.config — frontend framework
      if (file.startsWith('vite.config')) {
        result.riskNotes.push('vite project');
        if (content.includes('react')) result.riskNotes.push('react + vite');
        if (content.includes('vue')) result.riskNotes.push('vue + vite');
      }

      // tsconfig
      if (file === 'tsconfig.json' || file === 'tsconfig.node.json') {
        result.riskNotes.push('typescript project');
      }

      // index.html — entry point
      if (file === 'index.html') {
        result.entryFiles.push('index.html');
      }

      // Non-Node projects
      if (file === 'Cargo.toml') { result.projectType = 'rust-cargo'; result.buildCommands.push('cargo build'); result.testCommands.push('cargo test'); }
      if (file === 'go.mod') { result.projectType = 'go-mod'; result.buildCommands.push('go build'); result.testCommands.push('go test ./...'); }
    }
  }

  // ── Determine project type from evidence ─────────────────────
  if (result.projectType === 'unknown') {
    if (result.detectedFiles.includes('package.json')) {
      if (result.riskNotes.some(r => r.includes('electron'))) result.projectType = 'node-electron';
      else if (result.riskNotes.some(r => r.includes('react'))) result.projectType = 'node-react';
      else if (result.riskNotes.some(r => r.includes('vue'))) result.projectType = 'node-vue';
      else if (result.riskNotes.some(r => r.includes('tauri'))) result.projectType = 'node-tauri';
      else result.projectType = 'node-generic';
    }
  }

  // ── Build summary ——————————————————————————'
  const summaries = [];
  if (result.projectType) summaries.push(`type: ${result.projectType}`);
  if (result.testCommands.length > 0) summaries.push(`tests: ${result.testCommands.join(', ')}`);
  if (result.buildCommands.length > 0) summaries.push(`build: ${result.buildCommands.join(', ')}`);
  if (result.riskNotes.length > 0) summaries.push(`${result.riskNotes.length} risks noted`);

  return out('PASS', summaries.join(' | '), { ...result });
}

function extractCommands(scripts, keys) {
  if (!scripts) return [];
  const found = [];
  for (const key of keys) {
    if (scripts[key]) found.push(scripts[key]);
  }
  return found;
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'project-profile-detector', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();