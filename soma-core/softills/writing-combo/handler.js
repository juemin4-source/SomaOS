#!/usr/bin/env node
/**
 * writing-combo — handler.js
 * 文案元阵 — 将口头写作需求转为 Writing Charter + 写作计划
 */
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
  const taskType = lower.includes("文案") || lower.includes("宣传") || lower.includes("介绍") ? "COPYWRITING" :
    lower.includes("文档") || lower.includes("说明") || lower.includes("手册") ? "DOCUMENTATION" :
    lower.includes("报告") || lower.includes("总结") || lower.includes("分析") ? "REPORT" :
    lower.includes("教程") || lower.includes("指南") || lower.includes("入门") ? "TUTORIAL" :
    lower.includes("改") || lower.includes("润色") || lower.includes("精简") ? "EDITING" :
    "CREATIVE";

  const charter = { goal: text, taskType, audience: "auto", tone: "auto", format: taskType, length: "auto", references: [], doneCriteria: [], constraints: [] };

  const plan = { id: `write-${Date.now().toString(36)}`, version: "0.1.0", charter, taskType, generatedAt: new Date().toISOString(), nodes: [
    { role: "需求理解", description: "确认文体、受众、调性、篇幅", humanCheckpoint: true },
    { role: "素材搜集", description: "参考材料、行业术语" },
    { role: "拟定提纲", description: "结构、论点、逻辑流", humanCheckpoint: true },
    { role: "初稿", description: "按提纲写作" },
    { role: "自审", description: "对照完成标准检查" },
    { role: "修改", description: "优化表达、修正问题" },
    { role: "终审", description: "格式、一致性、证据完整" },
    { role: "交付", description: "输出 + 写作证据" },
  ]};

  out("PASS", `已受理: ${taskType}`, { charter, plan, taskType });
}
function out(r, s, d) { console.log(JSON.stringify({ softill: "writing-combo", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }
if (require.main === module) main();
