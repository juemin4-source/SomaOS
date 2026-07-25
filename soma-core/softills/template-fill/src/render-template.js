/**
 * render-template.js
 *
 * 简单变量替换：{{variableName}} → value
 * 不引入复杂模板引擎。
 */

function render(templateContent, variables) {
  const missing = [];

  // 找到所有 {{...}} 占位符
  const placeholders = templateContent.match(/\{\{(\w+)\}\}/g) || [];

  // 去重
  const uniquePlaceholders = [...new Set(placeholders)];

  for (const ph of uniquePlaceholders) {
    const key = ph.slice(2, -2);  // {{key}} → key
    if (variables[key] === undefined || variables[key] === null) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return { rendered: null, missing };
  }

  let result = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    const re = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
    result = result.replace(re, String(value));
  }

  return { rendered: result, missing: [] };
}

module.exports = { render };
