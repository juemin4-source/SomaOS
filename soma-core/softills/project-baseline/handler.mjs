#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * project-baseline — handler.js
 * 读取/写入项目健康基线。
 * 支持快照、基线初始化、增量对比。
 */

import fs from "fs";

import path from "path";

import { execSync } from "child_process";

function main() { parseInput(handle); }
function parseInput(cb) {
  let i;
  if (process.argv[2] && process.argv[2] !== "--") { try { i = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf-8")); } catch (e) { return out("ERROR", "Read: " + e.message); } cb(i); }
  else { const c = []; process.stdin.on("data", d => c.push(d)); process.stdin.on("end", () => { try { i = JSON.parse(Buffer.concat(c).toString()); cb(i); } catch (e) { out("ERROR", "Parse: " + e.message); } }); }
}
function out(r, s, d) { console.log(JSON.stringify({ softill: "project-baseline", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }

function handle(input) {
  const mode = input.mode || "snapshot";
  const projectDir = input.projectDir || process.cwd();
  const baselinePath = path.join(projectDir, "PROJECT-HEALTH-BASELINE.json");

  switch (mode) {
    case "snapshot": return takeSnapshot(projectDir);
    case "init": return initBaseline(projectDir, baselinePath);
    case "diff": return diffBaseline(projectDir, baselinePath);
    default: return out("ERROR", "未知模式: " + mode);
  }
}

function takeSnapshot(dir) {
  let gitStatus = "", branch = "", commit = "", files = 0, lines = 0, packageJson = null;
  try { gitStatus = execSync("git status --short", { cwd: dir, encoding: "utf-8", timeout: 5000 }).trim(); } catch {}
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf-8", timeout: 3000 }).trim(); } catch {}
  try { commit = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf-8", timeout: 3000 }).trim(); } catch {}
  try { files = parseInt(execSync("find . -not -path '*/node_modules/*' -not -path '*/.git/*' -type f | wc -l", { cwd: dir, encoding: "utf-8", timeout: 10000 }).trim()); } catch {}
  try { lines = parseInt(execSync("find . -not -path '*/node_modules/*' -not -path '*/.git/*' -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.css' \\) -exec cat {} \\; 2>/dev/null | wc -l", { cwd: dir, encoding: "utf-8", timeout: 15000 }).trim()); } catch {}
  try { packageJson = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")); } catch {}

  const snapshot = {
    timestamp: new Date().toISOString(),
    branch, commit,
    gitStatus: gitStatus ? gitStatus.split("\n").length : 0,
    modifiedFiles: gitStatus ? gitStatus.split("\n").filter(l => l.startsWith(" M") || l.startsWith("M ") || l.startsWith("??")).length : 0,
    totalSourceFiles: files,
    totalSourceLines: lines,
    hasPackageJson: !!packageJson,
    scripts: packageJson?.scripts ? Object.keys(packageJson.scripts) : [],
    deps: packageJson?.dependencies ? Object.keys(packageJson.dependencies).length : 0,
    devDeps: packageJson?.devDependencies ? Object.keys(packageJson.devDependencies).length : 0,
  };

  out("PASS", `快照: ${branch} @ ${commit.slice(0, 8)}, ${lines} 行`, snapshot);
}

function initBaseline(dir, baselinePath) {
  const snapshot = takeSnapshotInternal(dir);
  const baseline = {
    version: "0.1.0",
    project: path.basename(dir),
    createdAt: new Date().toISOString(),
    lastInspection: new Date().toISOString(),
    snapshot,
    knownIssues: [],
    healthStage: "UNKNOWN",
    healthAxes: {},
  };
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  out("PASS", "基线已初始化", { baseline, path: baselinePath });
}

function diffBaseline(dir, baselinePath) {
  if (!fs.existsSync(baselinePath)) return out("ERROR", "基线不存在，先 init");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  const current = takeSnapshotInternal(dir);
  const changes = {};
  for (const key of Object.keys(current)) {
    if (JSON.stringify(baseline.snapshot[key]) !== JSON.stringify(current[key])) {
      changes[key] = { from: baseline.snapshot[key], to: current[key] };
    }
  }
  out(changes.modifiedFiles > 0 || Object.keys(changes).length > 0 ? "PASS" : "PASS",
    Object.keys(changes).length + " 项变化", { changes, baseline, current });
}

function takeSnapshotInternal(dir) { return JSON.parse(JSON.stringify(takeSnapshot(dir))).data ? takeSnapshot(dir).data : {}; }



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();