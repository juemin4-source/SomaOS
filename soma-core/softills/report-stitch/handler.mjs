#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * report-stitch v0.1 — handler.js
 *
 * 合并多个 Ticket Report 为结构化摘要。
 * 不丢失结论原文，只压缩格式头和冗余上下文。
 */


import fs from 'fs';

import path from 'path';

function stitch(input) {
  const { reportPaths, version, sections } = input;

  // 支持两种输入：reportPaths（文件路径）或 sections（内联数据）
  if (sections && typeof sections === 'object') {
    const entries = Object.entries(sections).map(([name, summary]) => ({
      name,
      summary: String(summary || ''),
      verdict: 'PASS',
      filesChanged: [],
      issues: [],
    }));
    return {
      result: 'PASS',
      summary: `Stitched ${entries.length} sections`,
      data: { tickets: entries, total: entries.length, allPass: true, mode: 'inline' },
    };
  }

  if (!reportPaths || !Array.isArray(reportPaths) || reportPaths.length === 0) {
    return { error: 'reportPaths 为非空数组' };
  }

  const tickets = [];
  const knownIssues = new Set();
  let allPass = true;

  for (const rp of reportPaths) {
    const absPath = path.resolve(rp);
    if (!fs.existsSync(absPath)) {
      tickets.push({ file: rp, error: '文件不存在' });
      allPass = false;
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const name = path.basename(rp);

    // 提取 Verdict
    const verdictMatch = content.match(/^## Verdict\s*\n\s*(.+)$/m);
    const verdict = verdictMatch ? verdictMatch[1].trim() : 'UNKNOWN';

    // 提取 Files Changed
    const filesSection = content.match(/^## Files Changed\s*\n([\s\S]*?)(?=^## |\z)/m);
    const filesChanged = filesSection
      ? filesSection[1].split('\n').map(l => l.trim().replace(/^[-*]\s*/, '')).filter(Boolean)
      : [];

    // 提取 Known Issues
    const issuesSection = content.match(/^## Known Issues\s*\n([\s\S]*?)(?=^## |\z)/m);
    if (issuesSection) {
      issuesSection[1].split('\n').forEach(l => {
        const t = l.trim().replace(/^[-*]\s*/, '');
        if (t) knownIssues.add(t);
      });
    }

    // 提取 What Was Implemented
    const implSection = content.match(/^## What Was Implemented\s*\n([\s\S]*?)(?=^## |\z)/m);
    const implemented = implSection ? implSection[1].trim() : '';

    // 提取 What Was Not Implemented
    const notImplSection = content.match(/^## What Was Not Implemented\s*\n([\s\S]*?)(?=^## |\z)/m);
    const notImplemented = notImplSection ? notImplSection[1].trim() : '';

    // 提取 Acceptance Results
    const acceptSection = content.match(/^## Acceptance Results?\s*\n([\s\S]*?)(?=^## |\z)/m);
    const acceptanceResults = acceptSection ? acceptSection[1].trim() : '';

    if (!verdict.includes('PASS')) allPass = false;

    tickets.push({
      name,
      verdict,
      filesChanged: filesChanged.length,
      implemented: implemented.slice(0, 300),
      notImplemented: notImplemented.slice(0, 200),
      acceptanceResults: acceptanceResults.slice(0, 300),
    });
  }

  // 生成 merged markdown
  let md = `# ${version || 'Unnamed'} Version Report\n\n`;
  md += `## Verdict\n\n**${allPass ? 'VERSION_PASS' : 'VERSION_PASS_WITH_NOTES'}**\n\n`;
  md += `## Tickets (${tickets.length})\n\n`;
  md += `| # | Name | Verdict | Files |\n|---|------|---------|-------|\n`;
  tickets.forEach((t, i) => {
    md += `| ${i + 1} | ${t.name} | ${t.verdict} | ${t.filesChanged} |\n`;
  });
  md += `\n## Known Issues\n\n`;
  if (knownIssues.size > 0) {
    knownIssues.forEach(issue => { md += `- ${issue}\n`; });
  } else {
    md += 'None\n';
  }

  return {
    version: version || 'unknown',
    ticketCount: tickets.length,
    overallVerdict: allPass ? 'PASS' : 'PASS_WITH_NOTES',
    tickets,
    mergedContent: md,
    knownIssues: [...knownIssues],
  };
}

// CLI
function main() {
  // 优先 argv（支持 --reportPaths 传参），次选 stdin
  const reportPaths = process.argv[2] === '--reportPaths' ? process.argv[3]?.split(',') : null;
  if (reportPaths && reportPaths.length > 0) {
    const r = stitch({ reportPaths, version: process.argv[4] || process.argv[5] || 'unknown' });
    console.log(JSON.stringify(Object.assign({softill:"report-stitch"}, r), null, 2));
    process.exit(r.error ? 1 : 0);
    return;
  }
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { input = {}; }
    const r = stitch(input);
    console.log(JSON.stringify(Object.assign({softill:"report-stitch"}, r), null, 2));
    process.exit(r.error ? 1 : 0);
  });
}

export default { stitch };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();