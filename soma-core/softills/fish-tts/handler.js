#!/usr/bin/env node
/**
 * fish-tts — handler.js
 *
 * Fish Audio TTS 元器。把文字转成语音。
 * 由 audio-production-combo 元阵驱动。
 * 需要 FISH_API_KEY 环境变量或本地实例。
 *
 * 用法:
 *   export FISH_API_KEY=your_key_here
 *   node handler.js '{"text":"你好世界","voice":"54ed4e095b6e4a419a0a0a8d5b7cfbb7"}'
 *   node handler.js '{"text":"你好","voice":"design:温暖自信的叙述者"}'
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.FISH_API_KEY || input.apiKey || "";
const PROXY = process.env.HTTP_PROXY || process.env.http_proxy || input.proxy || "";
const API_URL = "https://api.fish.audio/v1/tts";

function main() {
  if (!API_KEY) return out("ERROR", "需要 FISH_API_KEY 环境变量");
  let input;
  if (process.argv[2] && process.argv[2] !== "--") {
    try { input = JSON.parse(process.argv[2]); } catch { try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf-8")); } catch (e) { return out("ERROR", "参数解析失败"); } }
  } else { input = {}; }
  handle(input);
}

function handle(input) {
  const text = input.text || "";
  if (!text || text.length < 2) return out("ERROR", "文字太短");

  const voice = input.voice || "54ed4e095b6e4a419a0a0a8d5b7cfbb7"; // 默认音色
  const speed = input.speed || 1.0;
  const format = input.format || "mp3";
  const emotions = input.emotions || [];

  // 注入情绪标签
  let processedText = text;
  for (const [tag, label] of Object.entries(emotions)) {
    if (typeof tag === "string" && typeof label === "string") {
      processedText = processedText.replaceAll(`[${label}]`, `<|${tag}|>`);
    }
  }

  const payload = JSON.stringify({
    text: processedText,
    reference_id: voice.startsWith("design:") ? undefined : voice,
    voice_design: voice.startsWith("design:") ? { instruction: voice.replace("design:", "") } : undefined,
    speed,
    format,
    latency: "balanced",
  });

  const tmpFile = path.join(__dirname, "..", "..", "soma", "forge-furnace", "dispatches", `tts-${Date.now().toString(36)}.${format}`);
  const payloadFile = tmpFile.replace(`.${format}`, ".json");
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(payloadFile, payload);

  const proxyFlag = PROXY ? `-x "${PROXY}"` : "";
  const curlCmd = `curl -sS -X POST "${API_URL}" \
    ${proxyFlag} \
    --ssl-no-revoke \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d @${payloadFile} \
    --max-time 60 -o "${tmpFile}" 2>&1`;
  try { fs.unlinkSync(payloadFile); } catch {}

  try {
    execSync(curlCmd, { encoding: "utf-8", timeout: 65000, shell: "bash" });

    if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size < 100) {
      const err = fs.readFileSync(tmpFile, "utf-8");
      fs.unlinkSync(tmpFile);
      return out("ERROR", `TTS 失败: ${err.slice(0, 200)}`);
    }

    const sizeKB = (fs.statSync(tmpFile).size / 1024).toFixed(1);
    out("PASS", `语音已生成 (${sizeKB}KB)`, {
      text: text.slice(0, 100),
      voice,
      speed,
      format,
      file: tmpFile,
      sizeKB,
      duration: estimateDuration(text, speed),
      note: `文件: ${tmpFile}`,
    });
  } catch (e) {
    if (fs.existsSync(tmpFile)) try { fs.unlinkSync(tmpFile); } catch {}
    return out("ERROR", `请求失败: ${e.message.slice(0, 200)}`);
  }
}

function estimateDuration(text, speed) {
  const chars = text.length;
  const seconds = Math.ceil((chars / 4) / speed); // ~4字/秒 中文语速
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: "fish-tts", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }
if (require.main === module) main();
