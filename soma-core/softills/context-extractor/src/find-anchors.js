/**
 * find-anchors.js
 *
 * 在文件行数组中查找 anchor 位置。
 * 第一版：简单 includes 匹配，大小写敏感。
 * 一个 anchor 命中多个位置时全部返回。
 */

function findAnchors(lines, anchors) {
  const found = {};  // anchor → [lineIndex, ...]
  const missing = [];

  for (const anchor of anchors) {
    const positions = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor)) {
        positions.push(i);
      }
    }
    if (positions.length > 0) {
      found[anchor] = positions;
    } else {
      missing.push(anchor);
    }
  }

  return { found, missing };
}

module.exports = { findAnchors };
