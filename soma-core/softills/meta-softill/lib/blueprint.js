/**
 * blueprint.js — 根据描述生成新 softill 完整骨架
 *
 * 整合了原 meta-softill blueprint + softill-init 的全部功能。
 * 生成：handler.js + skill.json + SKILL.md + rules.md + tests/ + fixtures/
 *
 * 模式：
 *   handler-only  — 仅生成 handler.js（原 meta-softill 行为）
 *   full          — 生成完整骨架（原 softill-init 行为，默认）
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, LEVELS, out } = require('./utils');

const VALID_ARCHETYPES = ['Director', 'Workflow', 'Diagnostic', 'Knowledge', 'Delivery', 'Stance', 'Research'];

function blueprint(input) {
  const name = input.name;
  const description = input.description || '';
  const scaffold = input.scaffold || 'full';
  const archetype = input.archetype || 'Diagnostic';

  if (!name) return out('ERROR', 'name required (kebab-case)');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return out('ERROR', 'name must be kebab-case (e.g. my-detector)');

  const targetDir = path.join(SOFTILLS_DIR, name);
  if (fs.existsSync(targetDir)) return out('ERROR', `Softill already exists: ${name}`);

  const level = detectLevel(description, name);

  fs.mkdirSync(targetDir, { recursive: true });

  if (scaffold === 'handler-only') {
    return generateHandlerOnly(name, description, level, targetDir);
  }

  return generateFull(name, description, level, archetype, targetDir);
}

function generateHandlerOnly(name, description, level, targetDir) {
  const sideEffects = detectSideEffects(level);
  const stage = detectStages(level);
  const handlerCode = generateHandler(name, description, level, false);
  fs.writeFileSync(path.join(targetDir, 'handler.js'), handlerCode, 'utf-8');

  return out('PASS', `Softill generated: ${name} (${level}, handler-only)`, {
    mode: 'blueprint_handler',
    name, level,
    description: description.slice(0, 200),
    files: ['handler.js'],
    path: targetDir,
    suggestedRegistry: generateRegistrySuggestion(name, level, description, sideEffects, stage),
  });
}

function generateFull(name, description, level, archetype, targetDir) {
  // 创建目录结构
  fs.mkdirSync(path.join(targetDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'fixtures'), { recursive: true });

  const files = [];
  const w = (fileName, content) => {
    fs.writeFileSync(path.join(targetDir, fileName), content, 'utf-8');
    files.push(fileName);
  };

  // handler.js（完整模板）
  w('handler.js', generateHandler(name, description, level, true));

  // skill.json
  w('skill.json', generateSkillJson(name, archetype, description, level));

  // SKILL.md
  w('SKILL.md', generateSkillMd(name, description, level));

  // rules.md
  w('rules.md', generateRulesMd(name));

  // tests/softill.test.js
  w('tests/softill.test.js', generateTest(name));

  // fixtures/.gitkeep
  fs.writeFileSync(path.join(targetDir, 'fixtures', '.gitkeep'), '', 'utf-8');

  return out('PASS', `Softill created: ${name} (${level}, full scaffold)`, {
    mode: 'blueprint_full',
    name, level, archetype,
    files,
    path: targetDir,
    suggestedRegistry: generateRegistrySuggestion(name, level, description, detectSideEffects(level), detectStages(level)),
  });
}

// ─── 自动检测 ────────────────────────────────────────

function detectLevel(desc, name) {
  const d = (desc + ' ' + name).toLowerCase();
  if (d.includes('write') || d.includes('patch') || d.includes('edit') || d.includes('commit') || d.includes('create')) return 'L3_write';
  if (d.includes('state') || d.includes('project') || d.includes('task') || d.includes('report') || d.includes('handoff') || d.includes('registry') || d.includes('ledger')) return 'L4_state';
  if ((d.includes('generate') && (d.includes('scaffold') || d.includes('init') || d.includes('new') || d.includes('softill')))) return 'L5_generate';
  if (d.includes('validate') || d.includes('check') || d.includes('guard') || d.includes('detect') || d.includes('audit') || d.includes('review') || d.includes('test') || d.includes('schema')) return 'L2_validate';
  if (d.includes('transform') || d.includes('convert') || d.includes('render') || d.includes('format') || d.includes('slice') || d.includes('merge')) return 'L1_transform';
  return 'L0_read_probe';
}

function detectSideEffects(level) {
  const map = {
    L0_read_probe: ['read_file'],
    L1_transform: [],
    L2_validate: ['read_file'],
    L3_write: ['write_file_modify'],
    L4_state: ['write_soma_state'],
    L5_generate: ['write_file_create', 'create_directory'],
  };
  return map[level] || [];
}

function detectStages(level) {
  const map = {
    L0_read_probe: ['context_compile'],
    L1_transform: ['context_compile', 'report'],
    L2_validate: ['verification'],
    L3_write: ['execute'],
    L4_state: ['state_update'],
    L5_generate: ['setup'],
  };
  return map[level] || ['context_compile'];
}


function generateRegistrySuggestion(name, level, description, sideEffects, stage) {
  return {
    name, level,
    description: (description || "").slice(0, 200),
    capabilityContract: description || name,
    applicableBoundary: {
      allowedPaths: level === "L3_write" ? [".claude/softills/"] : [],
      requiredPermissions: [],
      excludedDomains: [],
    },
    writesSource: level === "L3_write" || level === "L5_generate",
    writesSomaState: level === "L4_state",
    requiresBeforeWrite: level === 'L3_write' || level === 'L5_generate',
    requiresAfterWrite: level === 'L5_generate',
    deterministic: level !== "L0_read_probe" && level !== "L1_transform",
    sideEffects,
    allowedRuntimeStages: stage,
    evidenceProtocol: {
      requiredEvidence: level === "L3_write" ? ["diff"] : level === "L2_validate" ? ["test", "schema"] : [],
      optionalEvidence: [],
      minEvidenceCount: 1,
    },
    costProfile: {
      defaultCost: level === "L5_generate" ? "medium" : "low",
      estimatedTokens: level === "L0_read_probe" ? "< 1k" : level === "L3_write" ? "< 3k" : "< 2k",
      averageMs: level === "L5_generate" ? "< 5000" : "< 1000",
      failureRate: "< 5%",
    },
    outputContract: "softill_result",
  };
}

// ─── 模板生成器 ──────────────────────────────────────

function generateHandler(name, description, level, fullExport = false) {
  const desc = description || `${name} — softill`;
  const exportPart = fullExport
    ? `module.exports = { handle };
`
    : '';

  return `#!/usr/bin/env node
/**
 * ${name} — handler.js
 *
 * ${desc}
 * 级别: ${level} | 生成: meta-softill blueprint
 */

const path = require('path');

function handle(input, context) {
  try {
    if (!input || typeof input !== 'object') {
      return { result: 'ERROR', summary: 'Input must be a JSON object', data: {}, evidence: [] };
    }
    // 核心逻辑（请替换为真实实现）
    return {
      result: 'PASS',
      summary: 'Execution complete',
      data: { received: Object.keys(input) },
      evidence: [{ type: 'execution', result: 'PASS', summary: 'Handler executed' }],
    };
  } catch (err) {
    return { result: 'ERROR', summary: err.message || 'Unhandled error', data: {}, evidence: [] };
  }
}

// ═════════════════════════════════════════════════════
// CLI 入口（stdin JSON → stdout JSON）
// ═════════════════════════════════════════════════════

function main() {
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const out = handle(input, {});
      console.log(JSON.stringify({ softill: '${name}', result: out.result, summary: out.summary, data: out.data, evidence: out.evidence }, null, 2));
      process.exit(out.result === 'ERROR' || out.result === 'FAIL' ? 1 : 0);
    } catch (e) {
      console.log(JSON.stringify({ softill: '${name}', result: 'ERROR', summary: e.message, data: {}, evidence: [] }));
      process.exit(1);
    }
  });
}

${exportPart}
if (require.main === module) main();
`;
}

function generateSkillJson(name, archetype, description, level) {
  const secondary = archetype === 'Director' ? 'Diagnostic' : 'Delivery';
  return JSON.stringify({
    name,
    version: '0.1.0',
    description: description || `${name} — softill`,
    level,
    type: 'tool',
    runtime: 'node',
    entry: 'handler.js',
    archetype: { primary: archetype, secondary: [secondary] },
    thickness: 'thin',
    input: {
      type: 'object',
      properties: {
        input: { type: 'string', description: '输入参数' },
      },
      required: ['input'],
    },
    output: {
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
      required: ['result'],
    },
    triggers: { keywords: [name, name.replace(/-/g, ' ')] },
  }, null, 2);
}

function generateSkillMd(name, description, level) {
  return `---
name: ${name}
description: |
  ${description || '待补充'}
level: ${level}
triggers:
  - ${name}
  - ${name.replace(/-/g, ' ')}
---

# ${name}

${description || '待补充'}

## 何时使用

- 待补充

## 何时不使用

- 待补充

## 流程

1. 待补充

## 输出

待补充

## 硬规则

1. 待补充
`;
}

function generateRulesMd(name) {
  return `# ${name} — Rules

> 何时使用、何时不使用

---

## 何时使用

- 待补充

## 何时不使用

- 待补充
`;
}

function generateTest(name) {
  return `#!/usr/bin/env node
const assert = require('assert');
const path = require('path');
const { handle } = require('../handler.js');

let passed = 0, failed = 0;
function test(msg, fn) {
  try { fn(); console.log('  ✅', msg); passed++; }
  catch (e) { console.log('  ❌', msg, '-', e.message); failed++; }
}

console.log('\\n📋 ${name} 测试\\n');

test('handle returns result', () => {
  const r = handle({ input: 'test' }, {});
  assert.ok(r, '应返回结果');
});

console.log(\`\\n\${passed} 通过, \${failed} 失败\`);
process.exit(failed > 0 ? 1 : 0);
`;
}

module.exports = { blueprint };
