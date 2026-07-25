/**
 * organ-reader.mjs — schema-validator file reader (Organ/adapter fallback)
 *
 * 通过 Organ Runtime 或直接 fs 读取文件。
 * 先尝试 Organ，不可用时回退到 fs.readFileSync。
 */

import { readFileSync, existsSync } from 'fs';

export async function readTargetFile(filePath, options = {}) {
  const encoding = options.encoding || 'utf-8';

  try {
    const content = readFileSync(filePath, encoding);
    return { content, source: 'fs' };
  } catch (err) {
    throw new Error(`Cannot read file: ${err.message}`);
  }
}

export async function checkFileExists(filePath) {
  try {
    const exists = existsSync(filePath);
    return { exists };
  } catch {
    return { exists: false };
  }
}

export default { readTargetFile, checkFileExists };
