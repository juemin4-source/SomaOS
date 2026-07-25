/**
 * extract-context.js
 *
 * 核心逻辑：根据 anchor 位置和 radius 提取文件片段。
 * 重叠片段会合并。
 */

const { findAnchors } = require('./find-anchors');

function extract(fileLines, anchors, radius = 80) {
  const lineCount = fileLines.length;

  // 1. 找到所有 anchor 位置
  const { found, missing } = findAnchors(fileLines, anchors);

  // 2. 收集所有 line ranges
  const ranges = [];
  for (const [anchor, positions] of Object.entries(found)) {
    for (const pos of positions) {
      const start = Math.max(0, pos - radius);
      const end = Math.min(lineCount - 1, pos + radius);
      ranges.push({ anchor, start, end });
    }
  }

  // 3. 按 start 排序
  ranges.sort((a, b) => a.start - b.start);

  // 4. 合并重叠 ranges
  const merged = [];
  for (const r of ranges) {
    if (merged.length === 0) {
      merged.push({ ...r });
    } else {
      const last = merged[merged.length - 1];
      if (r.start <= last.end + 1) {
        // 重叠或相邻，合并
        last.end = Math.max(last.end, r.end);
        // 如果 anchor 不同，合并名称
        if (last.anchor !== r.anchor) {
          last.anchor = last.anchor + ', ' + r.anchor;
        }
      } else {
        merged.push({ ...r });
      }
    }
  }

  // 5. 生成 slices
  const slices = merged.map(({ anchor, start, end }) => {
    const contentLines = fileLines.slice(start, end + 1);
    const content = contentLines
      .map((line, idx) => `L${start + idx + 1}: ${line}`)
      .join('\n');
    return {
      anchor,
      startLine: start + 1,  // 1-indexed
      endLine: end + 1,
      content,
    };
  });

  return { slices, missing };
}

module.exports = { extract };
