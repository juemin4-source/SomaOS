#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);

/**
 * creative-writing-combo — handler.js
 * 创意写作元阵 — 将写作需求映射到织梦机 craft skill 链
 *
 * 不包含写作知识。只负责编排流程。
 */

const CRAFT_SKILL_MAP = {
  "人物":    { chain: ["CS-09","CS-10","CS-11","CS-12","CS-13","CS-14","CS-15"], desc: "人物设计七步" },
  "世界观":  { chain: ["CS-25","CS-26","CS-27","CS-28","CS-29"], desc: "世界观五层" },
  "场景":    { chain: ["CS-01","CS-26","CS-27","CS-28","CS-04"], desc: "场景五步" },
  "章节":    { chain: ["CS-05","CS-06","CS-21","CS-22","CS-23","CS-24","CS-01","CS-02","CS-03","CS-04"], desc: "章节全程" },
  "审稿":    { chain: ["CS-38"], desc: "三重检验" },
};

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== "--") {
    try { input = JSON.parse(process.argv[2]); } catch { try { input = JSON.parse(require('fs').readFileSync(require('path').resolve(process.argv[2]), 'utf-8')); } catch (e) { return out("ERROR", "参数解析失败"); } }
  } else { input = { text: process.argv.slice(2).join(" ") || "" }; }
  handle(input);
}

function handle(input) {
  const text = input.text || input.command || "";
  if (!text) return out("ERROR", "需要写作需求");

  const lower = text.toLowerCase();
  let writingType = "人物";
  if (lower.includes("世界观") || lower.includes("世界")) writingType = "世界观";
  else if (lower.includes("场景")) writingType = "场景";
  else if (lower.includes("章节") || lower.includes("章") || lower.includes("叙事")) writingType = "章节";
  else if (lower.includes("审稿") || lower.includes("检查") || lower.includes("gate") || lower.includes("检验")) writingType = "审稿";
  else if (lower.includes("人物") || lower.includes("角色") || lower.includes("人设")) writingType = "人物";

  const skillChain = CRAFT_SKILL_MAP[writingType];
  if (!skillChain) return out("ERROR", `未知写作类型`);

  const plan = {
    id: `craft-${Date.now().toString(36)}`,
    version: "0.1.0",
    writingType,
    subject: text,
    skills: skillChain.chain.map((csId, i) => ({
      step: i + 1,
      craftSkill: csId,
      description: `第 ${i+1}/${skillChain.chain.length} 步: ${csId}`,
      status: "pending",
    })),
    totalSteps: skillChain.chain.length,
    generatedAt: new Date().toISOString(),
  };

  out("PASS", `${writingType}: ${skillChain.desc} (${skillChain.chain.length} 步)`, { plan, writingType, skillChain });
}

function out(r, s, d) { console.log(JSON.stringify({ softill: "creative-writing-combo", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();