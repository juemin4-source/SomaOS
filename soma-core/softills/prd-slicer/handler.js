#!/usr/bin/env node

/**
 * prd-slicer v0.1 — handler.js
 *
 * 从 PRD 中按版本提取指定章节。
 * 不丢失内容，只切范围。AI 读原文，不读格式。
 */

const fs = require('fs');
const path = require('path');

function slice(input) {
  const { prdPath, version, includeMetadata = true } = input;

  if (!prdPath || !version) {
    return { error: 'prdPath 和 version 为必填' };
  }

  const absPath = path.resolve(prdPath);
  if (!fs.existsSync(absPath)) {
    return { error: `文件不存在: ${absPath}` };
  }

  const content = fs.readFileSync(absPath, 'utf-8');

  // 找到版本章节：按行扫描找 "## N. vX.X.X"
  const lines = content.split('\n');
  let startIdx = -1;
  const versionPattern = version.replace(/\./g, '\\.');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^##\s+\d*\.?\s*🔧?\s*/, '## '); // 归一化
    if (line.startsWith('## ') && line.includes(version)) {
      const m = line.match(new RegExp(versionPattern));
      if (m) {
        // 确认不是被其他版本包含（如 v2.0 包含 v2.0.1）
        const afterVersion = line.slice(line.indexOf(m[0]) + m[0].length);
        if (afterVersion.startsWith(':') || afterVersion.startsWith(' ') || afterVersion === '') {
          // 计算这一行在全文中的位置
          startIdx = lines.slice(0, i).join('\n').length;
          if (i > 0) startIdx += 1; // 加回被 join 吃掉的换行
          break;
        }
      }
    }
  }

  if (startIdx === -1) {
    return { error: `未找到版本 ${version} 的章节` };
  }

  // 找下一个同级别章节（下一个 ##）
  const nextSection = content.slice(startIdx + 1).match(/^## (?!#)/m);
  const endIdx = nextSection ? startIdx + 1 + nextSection.index : content.length;

  const extracted = content.slice(startIdx, endIdx).trim();
  const sizeBytes = Buffer.byteLength(extracted, 'utf-8');
  const fullSize = Buffer.byteLength(content, 'utf-8');
  const reduction = `${((1 - sizeBytes / fullSize) * 100).toFixed(0)}%`;

  const result = {
    version,
    sectionTitle: extracted.split('\n')[0].replace(/^##\s*/, ''),
    content: extracted,
    sizeBytes,
    fullSizeBytes: fullSize,
    reduction,
  };

  // 可选：提取版本依赖元数据
  if (includeMetadata) {
    const depSection = content.match(/### 4\.2 版本依赖关系图[\s\S]*?(?=^## |\z)/m);
    if (depSection) {
      // 找相关版本
      const related = new Set();
      const lines = depSection[0].split('\n');
      for (const line of lines) {
        if (line.includes(version)) {
          const versions = line.match(/v\d+\.\d+(?:\.\d+)?(?:-[A-Z]+)?/g);
          if (versions) versions.forEach(v => related.add(v));
        }
      }
      related.delete(version);
      result.relatedVersions = [...related];
    }
  }

  return result;
}

// CLI
function main() {
  // 优先 argv，次选 stdin
  if (process.argv[2] && process.argv[2] !== '--') {
    const r = slice({ prdPath: process.argv[2], version: process.argv[3] });
    console.log(JSON.stringify(Object.assign({softill:"prd-slicer"}, r), null, 2));
    process.exit(r.error ? 1 : 0);
    return;
  }
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { input = {}; }
    const r = slice(input);
    console.log(JSON.stringify(Object.assign({softill:"prd-slicer"}, r), null, 2));
    process.exit(r.error ? 1 : 0);
  });
}

if (require.main === module) main();
module.exports = { slice };
