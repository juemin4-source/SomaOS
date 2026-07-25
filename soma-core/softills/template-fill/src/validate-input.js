/**
 * validate-input.js
 *
 * 校验输入参数、提取变量、检查模板。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

function validate(input) {
  const errors = [];

  // template 存在
  if (!input.template) {
    errors.push('template is required');
  } else {
    const tplPath = path.join(TEMPLATES_DIR, input.template);
    if (!fs.existsSync(tplPath)) {
      errors.push(`template not found: ${input.template}`);
    }
  }

  // outputPath
  if (!input.outputPath) {
    errors.push('outputPath is required');
  } else {
    const resolved = path.resolve(input.outputPath);
    // 不能包含 ..
    if (input.outputPath.includes('..')) {
      errors.push('outputPath must not contain ".."');
    }
    // 不能是目录
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      errors.push('outputPath is a directory, not a file');
    }
  }

  // variables
  if (!input.variables || typeof input.variables !== 'object') {
    errors.push('variables must be an object');
  }

  // mode
  const validModes = ['preview', 'write'];
  if (!input.mode || !validModes.includes(input.mode)) {
    errors.push(`mode must be one of: ${validModes.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validate };
