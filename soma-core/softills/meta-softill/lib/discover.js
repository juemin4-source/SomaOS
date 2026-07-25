/**
 * discover.js — 扫描文件系统发现所有 softill
 *
 * 收集每个 softill 的 handler 状态、registry 状态、大小、依赖等。
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, loadRegistry, loadAdapterRegistry, out, getSoftillDirs } = require('./utils');

function discover(input) {
  const softills = [];

  for (const name of getSoftillDirs()) {
    const handlerPath = path.join(SOFTILLS_DIR, name, 'handler.js');
    if (!fs.existsSync(handlerPath)) continue;

    const stat = fs.statSync(handlerPath);
    const hasSkill = fs.existsSync(path.join(SOFTILLS_DIR, name, 'SKILL.md'));
    const hasRules = fs.existsSync(path.join(SOFTILLS_DIR, name, 'rules.md'));
    const hasTests = fs.existsSync(path.join(SOFTILLS_DIR, name, 'tests'));
    const hasLib = fs.existsSync(path.join(SOFTILLS_DIR, name, 'lib'));
    const hasManifest = fs.existsSync(path.join(SOFTILLS_DIR, name, 'manifest.yaml')) ||
                        fs.existsSync(path.join(SOFTILLS_DIR, name, 'manifest.json'));

    const registry = loadRegistry();
    const inRegistry = registry && registry.softills && registry.softills[name];

    let adapterInfo = null;
    try {
      const adapterReg = loadAdapterRegistry();
      if (adapterReg) {
        const found = adapterReg.adapters.find(a => a.name === name);
        if (found) adapterInfo = { type: found.type, source: found.source };
      }
    } catch {}

    softills.push({
      name,
      handlerSizeKB: (stat.size / 1024).toFixed(1),
      hasSkill,
      hasRules,
      hasTests,
      hasLib,
      hasManifest,
      inRegistry: !!inRegistry,
      registryLevel: inRegistry ? inRegistry.level : 'unknown',
      adapter: adapterInfo,
    });
  }

  softills.sort((a, b) => a.name.localeCompare(b.name));

  const withHandler = softills.length;
  const withDoc = softills.filter(s => s.hasSkill).length;
  const registered = softills.filter(s => s.inRegistry).length;
  const withTests = softills.filter(s => s.hasTests).length;
  const modular = softills.filter(s => s.hasLib).length;

  return out('PASS',
    `${withHandler} softills (${registered} reg, ${withDoc} doc, ${withTests} tests, ${modular} modular)`,
    {
      mode: 'discover',
      total: withHandler,
      withDocumentation: withDoc,
      registered,
      withTests,
      modular,
      softills,
    }
  );
}

module.exports = { discover };
