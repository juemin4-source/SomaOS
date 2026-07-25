/**
 * load-registry.js — 加载阈值注册表
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, '..', 'registry', 'thresholds.json');

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
}

module.exports = { loadRegistry };
