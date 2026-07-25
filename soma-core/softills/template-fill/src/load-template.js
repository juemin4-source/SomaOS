/**
 * load-template.js
 *
 * 从 templates/ 目录加载模板文件。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

function loadTemplate(templateName) {
  const tplPath = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(tplPath)) return null;
  return fs.readFileSync(tplPath, 'utf-8');
}

function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.tpl'));
}

module.exports = { loadTemplate, listTemplates };
