#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);

/**
 * social-content-converter — handler.js
 *
 * 社交传播转换元器。
 * 输入一篇源内容 + 目标平台 + 调性，输出各平台适配版本。
 *
 * 平台: twitter, linkedin, instagram, tiktok, video_script
 *
 * 用法:
 *   node handler.js '{"content":"源文本","platforms":["twitter","linkedin"],"tone":"casual"}'
 */

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== "--") {
    try { input = JSON.parse(process.argv[2]); } catch { try { input = JSON.parse(require('fs').readFileSync(require('path').resolve(process.argv[2]), 'utf-8')); } catch (e) { return out("ERROR", "参数解析失败"); } }
  } else { input = {}; }
  handle(input);
}

function handle(input) {
  const content = input.content || input.text || "";
  if (!content || content.length < 50) return out("ERROR", "源内容太短，至少 50 字");

  const platforms = input.platforms || ["twitter", "linkedin", "instagram"];
  const tone = input.tone || "casual";
  const sourceType = input.sourceType || detectSource(content);

  const results = {};
  for (const p of platforms) {
    results[p] = generateForPlatform(p, content, tone, sourceType);
  }

  out("PASS", `已转换 ${platforms.length} 个平台`, {
    sourceLength: content.length,
    sourceType,
    tone,
    platforms: results,
    summary: Object.fromEntries(platforms.map(p => [p, { chars: results[p].length, lines: results[p].split('\n').length }])),
  });
}

function detectSource(content) {
  if (content.length > 3000) return "long_form";
  if (content.includes("##") || content.includes("###")) return "structured";
  if (content.includes("1.") || content.includes("- ")) return "list";
  return "short_form";
}

function generateForPlatform(platform, content, tone, sourceType) {
  const summary = extractSummary(content);
  const hook = generateHook(summary, tone);

  switch (platform) {
    case "twitter": return generateTwitter(hook, summary, tone);
    case "linkedin": return generateLinkedIn(hook, summary, tone);
    case "instagram": return generateInstagram(hook, summary, tone);
    case "tiktok": return generateTikTok(hook, summary, tone);
    case "video_script": return generateVideoScript(hook, summary, tone);
    default: return `不支持的平台: ${platform}`;
  }
}

function extractSummary(content) {
  const lines = content.split('\n').filter(Boolean);
  const firstLine = lines[0] || "";
  const keyPoints = lines.filter(l => l.length > 20 && l.length < 200).slice(0, 5);
  return { firstLine, keyPoints, totalLength: content.length };
}

function generateHook(summary, tone) {
  const hooks = {
    casual: `"${summary.firstLine.slice(0, 60)}..."`,
    professional: `${summary.firstLine.slice(0, 80)}`,
    bold: `💥 ${summary.firstLine.slice(0, 50).toUpperCase()}`,
  };
  return hooks[tone] || hooks.casual;
}

function generateTwitter(hook, summary, tone) {
  const thread = [];
  thread.push(`${hook}\n\n🧵 1/${summary.keyPoints.length + 2}`);
  summary.keyPoints.forEach((p, i) => {
    thread.push(`${p.slice(0, 240)}\n\n${i + 2}/${summary.keyPoints.length + 2}`);
  });
  thread.push(`你也有类似的经历吗？留言告诉我 👇\n\n${summary.keyPoints.length + 3}/${summary.keyPoints.length + 2}`);
  return thread.join('\n\n');
}

function generateLinkedIn(hook, summary, tone) {
  const body = summary.keyPoints.map(p => `${p}\n`).join('\n');
  const hashtags = tone === "professional" ? "\n\n#思考 #成长 #认知" : "\n\n#日常 #感悟 #想法";
  return `${hook}\n\n${body}\n\n你觉得呢？欢迎讨论 👇${hashtags}`;
}

function generateInstagram(hook, summary, tone) {
  const body = summary.keyPoints.slice(0, 3).join('\n');
  const hashtags = "\n\n.\n.\n.\n#日常记录 #思考碎片 #认知升级 #生活感悟 #成长";
  return `${hook.slice(0, 120)}\n\n${body}\n\n你有什么想法？评论区聊 💬${hashtags}`;
}

function generateTikTok(hook, summary, tone) {
  return `【脚本 - ${tone}调】\n\n🎬 前3秒: ${hook.slice(0, 80)}\n\n📝 正文: ${summary.keyPoints.slice(0, 3).map(p => `• ${p.slice(0, 100)}`).join('\n')}\n\n👋 CTA: 你觉得呢？评论区见\n\n⏱ 时长: ~45秒\n#日常 #思考 #分享`;
}

function generateVideoScript(hook, summary, tone) {
  return `# 视频脚本\n\n## 开头 (0-5s)\n${hook.slice(0, 100)}\n\n## 主体 (5-45s)\n${summary.keyPoints.slice(0, 4).map((p, i) => `[场景${i + 1}] ${p.slice(0, 150)}`).join('\n\n')}\n\n## 结尾 (45-60s)\n你觉得呢？关注我，下期见 👋\n\n⏱ 总时长: ~60s\n📹 建议画面: 口播 + 配图`;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: "social-content-converter", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();