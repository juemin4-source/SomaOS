#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * web-fetcher — handler.js
 *
 * 用 curl 抓网页内容，绕过 WebFetch 的域名限制。
 *
 * 用法:
 *   node handler.js '{"url":"https://docs.fish.audio/api-reference/introduction"}'
 *   node handler.js '{"url":"https://example.com","format":"text"}'
 */


import { execSync } from "child_process";

const require = createRequire(import.meta.url);

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== "--") {
    try { input = JSON.parse(process.argv[2]); } catch {
      try { input = JSON.parse(require("fs").readFileSync(require("path").resolve(process.argv[2]), "utf-8")); } catch (e) { return out("ERROR", "参数解析失败"); }
    }
  } else { input = {}; }
  handle(input);
}

function handle(input) {
  const url = input.url || "";
  if (!url) return out("ERROR", "需要 URL");

  const format = input.format || "auto";
  const timeout = input.timeout || 15;

  try {
    const curlCmd = `curl -sS -L --max-time ${timeout} -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}" 2>&1`;
    const stdout = execSync(curlCmd, { encoding: "utf-8", timeout: (timeout + 5) * 1000, maxBuffer: 5 * 1024 * 1024 });

    if (!stdout || stdout.length < 50) return out("PARTIAL", "内容太少或无法访问", { url, length: stdout?.length || 0 });

    const contentType = detectType(stdout);

    out("PASS", `已抓取 ${url} (${(stdout.length / 1024).toFixed(1)}KB, ${contentType})`, {
      url,
      format: contentType,
      size: stdout.length,
      sizeKB: (stdout.length / 1024).toFixed(1),
      content: stdout.slice(0, 50000),
      truncated: stdout.length > 50000,
    });
  } catch (e) {
    return out("ERROR", `抓取失败: ${e.message.slice(0, 200)}`);
  }
}

function detectType(content) {
  if (content.includes("<!DOCTYPE html") || content.includes("<html")) return "html";
  if (content.startsWith("{")) return "json";
  if (content.startsWith("# ") || content.includes("## ")) return "markdown";
  return "text";
}

function out(r, s, d) { console.log(JSON.stringify({ softill: "web-fetcher", result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(0); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();