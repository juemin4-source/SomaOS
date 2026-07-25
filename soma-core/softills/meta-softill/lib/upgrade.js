/**
 * upgrade.js — 审查单个 softill 给出改进建议
 *
 * 支持 self-upgrade：可以审查 meta-softill 自身。
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, LEVELS, loadRegistry, out, softillExists } = require('./utils');

const VALID_OUTPUT = 'softill_result';

function upgrade(input) {
  const name = input.name || 'meta-softill';  // 默认审查自身
  const fix = input.fix === true;             // 是否自动修复

  const softillDir = path.join(SOFTILLS_DIR, name);
  if (!fs.existsSync(softillDir)) {
    return out('ERROR', `Softill not found: ${name}`);
  }

  const registry = loadRegistry();
  const regEntry = registry?.softills?.[name];
  const hasHandler = fs.existsSync(path.join(softillDir, 'handler.js'));

  const issues = [];
  const suggestions = [];

  // handler 检查
  if (!hasHandler) {
    issues.push('missing handler.js');
  } else {
    const content = fs.readFileSync(path.join(softillDir, 'handler.js'), 'utf-8');
    if (content.length < 50) issues.push('handler.js appears to be a stub (< 50 chars)');
    if (!content.includes('softill_result') && !content.includes('softill:')) {
      suggestions.push('use standard output format (softill_result)');
    }
    // 检查是否 monolith（单文件 > 300 行）
    const lines = content.split('\n').length;
    if (lines > 300 && name === 'meta-softill') {
      suggestions.push('monolithic handler.js detected — consider splitting into lib/ modules');
    }
  }

  // registry 检查
  if (!regEntry) {
    suggestions.push('register in softill-registry.json');
  } else {
    const levelDef = LEVELS[regEntry.level];
    if (levelDef && regEntry.requiresBeforeWrite !== levelDef.needsGuard) {
      if (!regEntry._guardOverride) {
        suggestions.push(`adjust requiresBeforeWrite to ${levelDef.needsGuard} for ${regEntry.level}`);
      }
    }
    if (regEntry.outputContract && regEntry.outputContract !== VALID_OUTPUT) {
      suggestions.push(`use standard output contract: ${VALID_OUTPUT}`);
    }
    if (!regEntry.sideEffects || regEntry.sideEffects.length === 0) {
      if (regEntry.level !== 'L1_transform') {
        suggestions.push('define sideEffects');
      }
    }
    // 建议添加 manifest
    if (!regEntry.manifest) {
      suggestions.push('consider adding manifest (input/output schema + validators)');
    }
  }

  // SKILL.md 检查
  const hasSkill = fs.existsSync(path.join(softillDir, 'SKILL.md'));
  if (!hasSkill) suggestions.push('add SKILL.md with archetype, triggers, description');

  // 依赖检查
  if (regEntry && (!regEntry.depends || regEntry.depends.length === 0)) {
    if (regEntry.level !== 'L0_read_probe' && regEntry.level !== 'L1_transform') {
      suggestions.push('consider declaring dependencies in registry');
    }
  }

  const verdict = issues.length === 0 ? 'PASS' : 'WARN';

  const result = {
    mode: 'upgrade',
    name, hasHandler, hasSkill,
    inRegistry: !!regEntry,
    issues,
    suggestions,
    registryEntry: regEntry,
  };

  // 修复模式
  if (fix && issues.length === 0 && suggestions.length > 0 && name !== 'meta-softill') {
    // 自动修复：registry 对齐
    const fixed = [];
    // 目前只做 registry 级自动修复
    result.fixes = fixed;
    result.fixApplied = fixed.length > 0;
  }

  return out(verdict,
    `${name}: ${issues.length} issues, ${suggestions.length} suggestions`,
    result
  );
}

module.exports = { upgrade };
