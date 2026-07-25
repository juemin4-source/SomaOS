/**
 * load-state.js — 读取并校验 body-state.json
 */

const fs = require('fs');
const path = require('path');
const { ALL_FIELDS } = require('./classify-fields');

function load(targetFile) {
  const resolved = path.resolve(targetFile);

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `File not found: ${targetFile}` };
  }

  let data;
  try { data = JSON.parse(fs.readFileSync(resolved, 'utf-8')); }
  catch (e) { return { ok: false, error: `Invalid JSON: ${e.message}` }; }

  // 检查必填字段
  for (const field of ALL_FIELDS) {
    if (data[field] === undefined) {
      return { ok: false, error: `Missing required field: ${field}` };
    }
    if (typeof data[field] !== 'number') {
      return { ok: false, error: `Field "${field}" must be a number, got ${typeof data[field]}` };
    }
  }

  return { ok: true, data };
}

module.exports = { load };
