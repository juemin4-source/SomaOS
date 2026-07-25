/**
 * audit.js — 审查所有 softill 健康度
 *
 * 检查项：
 * - handler.js 存在且有基本结构
 * - registry 条目存在且 level 合法
 * - outputContract 统一
 * - cost 合法
 * - guard 与 level 对齐
 * - 自身也可以被审查（self-audit）
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, LEVELS, loadRegistry, out, getSoftillDirs } = require('./utils');

const VALID_OUTPUT = 'softill_result';
const VALID_COSTS = ['low', 'medium', 'high'];

function audit(input) {
  const registry = loadRegistry();
  const results = [];
  let passed = 0, failed = 0, warnings = 0;

  for (const name of getSoftillDirs()) {
    const softillDir = path.join(SOFTILLS_DIR, name);
    const audit = { name, checks: [], score: 0, maxScore: 0 };

    // 1. handler.js 存在
    const hasHandler = fs.existsSync(path.join(softillDir, 'handler.js'));
    audit.checks.push({ check: 'handler.js exists', pass: hasHandler });
    if (hasHandler) {
      const content = fs.readFileSync(path.join(softillDir, 'handler.js'), 'utf-8');
      const hasMain = content.includes('function main') ||
                      content.includes('if (require.main') ||
                      content.includes('module.exports');
      const hasOut = content.includes('softill:') ||
                     content.includes('softill_result') ||
                     content.includes('"result"');
      audit.checks.push({ check: 'has entry point', pass: hasMain });
      audit.checks.push({ check: 'has structured output', pass: hasOut });
    }

    // 2. registry 条目
    const inRegistry = registry && registry.softills && registry.softills[name];
    audit.checks.push({ check: 'registry entry exists', pass: !!inRegistry });

    if (inRegistry) {
      const reg = registry.softills[name];

      // 3. level 合法
      const levelValid = validateEntry(reg.level);
      audit.checks.push({ check: `level: ${reg.level}`, pass: levelValid });
      if (!levelValid) audit.checks[audit.checks.length - 1].note = '未在 LEVELS 定义中';

      // 4. outputContract
      const contractOk = !reg.outputContract || reg.outputContract === VALID_OUTPUT;
      audit.checks.push({ check: `outputContract: ${reg.outputContract || 'missing'}`, pass: contractOk });

      // 5. cost 合法
      const costOk = VALID_COSTS.includes(reg.defaultCost);
      audit.checks.push({ check: `cost: ${reg.defaultCost}`, pass: costOk });

      // 6. guard 与 level 对齐
      const levelDef = LEVELS[reg.level];
      if (levelDef) {
        const guardOk = reg.requiresBeforeWrite === levelDef.needsGuard ||
                        reg._guardOverride === true;
        audit.checks.push({
          check: `guard: ${levelDef.needsGuard}`,
          pass: guardOk,
          note: guardOk ? '' : `期望 requiresBeforeWrite=${levelDef.needsGuard} (${reg.level})`
        });
      }

      // 7. SKILL.md 存在
      const hasSkill = fs.existsSync(path.join(softillDir, 'SKILL.md'));
      audit.checks.push({ check: 'SKILL.md exists', pass: hasSkill });
    }

    // 分数
    audit.maxScore = audit.checks.length;
    audit.score = audit.checks.filter(c => c.pass).length;
    audit.verdict = audit.score === audit.maxScore ? 'PASS'
      : audit.score >= audit.maxScore - 2 ? 'WARN'
      : 'FAIL';

    if (audit.verdict === 'PASS') passed++;
    else if (audit.verdict === 'WARN') warnings++;
    else failed++;

    results.push(audit);
  }

  results.sort((a, b) => a.score - b.score);

  const total = results.length;
  return out(
    failed > 0 ? 'WARN' : 'PASS',
    `${total} softills: ${passed} pass, ${warnings} warn, ${failed} fail`,
    { mode: 'audit', results, summary: { total, passed, warnings, failed } }
  );
}

function validateEntry(level) {
  return !!LEVELS[level];
}

module.exports = { audit };
