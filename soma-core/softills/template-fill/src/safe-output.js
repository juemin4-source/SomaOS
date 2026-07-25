/**
 * safe-output.js
 *
 * 安全检查：outputPath 必须在项目内、不是目录、不越界。
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SOFTILLS_DIR = path.resolve(__dirname, '..', '..');

function check(outputPath, allowOverwrite) {
  const errors = [];

  if (!outputPath) {
    errors.push('outputPath is empty');
    return { safe: false, errors };
  }

  const resolved = path.resolve(outputPath);

  // 不能包含 ..
  if (outputPath.includes('..')) {
    errors.push('outputPath must not contain ".."');
    return { safe: false, errors };
  }

  // 必须在项目根目录内
  if (!resolved.startsWith(PROJECT_ROOT)) {
    errors.push('outputPath must be inside project root');
  }

  // 不能是目录
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    errors.push('outputPath is a directory');
  }

  // 已存在检查
  if (fs.existsSync(resolved) && !allowOverwrite) {
    errors.push(`file already exists: ${outputPath}. Set allowOverwrite=true to overwrite.`);
  }

  return { safe: errors.length === 0, errors };
}

module.exports = { check };
