#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * combo-init.js v0.1 — 元经验生成器
 *
 * 元阵编成元器。根据目标、可用元器和过往经验，生成元阵计划 JSON。
 *
 * 对应 meta-softill / softill-init 在元阵体系中的位置：
 *   softill-init     → 生成新的元器 scaffold
 *   combo-init       → 从目标和经验生成新的元阵计划
 *   meta-softill     → 管理、审计、注册元器
 *   trace-collector  → 收集元阵轨迹，为凝结做准备
 *
 * 三种模式：
 *   plan    — 从目标编成新元阵（引用已有经验和可用元器）
 *   recall  — 从已有经验中召回相似元阵
 *   scaffold — 生成空白元阵计划模板
 *
 * Usage:
 *   node handler.js plan '{"goal":"诊断元器","skills":["combo-design"],"available":["file-eye","code-search",...]}'
 *   node handler.js scaffold '{"name":"my-combo"}'
 *   node handler.js recall '{"goal":"修复元器"}'
 *
 * Output: combo plan JSON 到 stdout
 */


import fs from 'fs';

import path from 'path';

const SOFTILLS_DIR = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(SOFTILLS_DIR, 'softills', 'softill-registry.json');
const TRACES_DIR = path.resolve(__dirname, '..', '..', '..', 'soma', 'research', 'experiments', 'combo-to-softill', 'results', 'traces');

/**
 * 软技能职责分类（用于自动编成）
 */
const SOFTILL_ROLES = {
  // 感知类 — 了解当前状态
  'file-eye': 'inspect',
  'code-search': 'inspect',
  'schema-validator': 'inspect',
  'img-view': 'inspect',
  'html-parse': 'inspect',
  'md-process': 'inspect',
  'json-query': 'inspect',
  'db-schema-map': 'inspect',
  'service-dependency-map': 'inspect',

  // 诊断类 — 分析问题
  'diff-review': 'diagnose',
  'contract-diff': 'diagnose',
  'error-contract-extractor': 'diagnose',
  'change-impact-analyzer': 'diagnose',
  'stale-context-detector': 'diagnose',
  'props-contract-extractor': 'diagnose',
  'fixture-sync': 'diagnose',

  // 操作类 — 执行修改
  'file-patch': 'modify',
  'template-fill': 'modify',
  'format-code': 'modify',
  'git-tools': 'modify',
  'api-client-generator': 'modify',

  // 验证类 — 确认结果
  'test-runner': 'verify',
  'test-selector': 'verify',
  'endpoint-smoke-tester': 'verify',
  'migration-safety-checker': 'verify',

  // 留痕类 — 记录证据
  'evidence-collector': 'trace',
  'task-ledger': 'trace',
  'runtime-report-writer': 'trace',
  'handoff-writer': 'trace',
  'report-stitch': 'trace',
};

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
}

function loadTraces() {
  try {
    if (!fs.existsSync(TRACES_DIR)) return [];
    return fs.readdirSync(TRACES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(TRACES_DIR, f), 'utf-8')); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

/**
 * 从目标描述中猜测需要的角色
 */
function guessRolesFromGoal(goal) {
  const roles = new Set();
  const g = (goal || '').toLowerCase();

  if (g.includes('检查') || g.includes('审计') || g.includes('读') || g.includes('查看') || g.includes('inspect')) {
    roles.add('inspect');
  }
  if (g.includes('诊断') || g.includes('分析') || g.includes('对比') || g.includes('drift') || g.includes('diff')) {
    roles.add('diagnose');
  }
  if (g.includes('修') || g.includes('改') || g.includes('写') || g.includes('创建') || g.includes('patch') || g.includes('fix')) {
    roles.add('modify');
    roles.add('verify'); // 改完要验证
  }
  if (g.includes('验证') || g.includes('测试') || g.includes('validate') || g.includes('test')) {
    roles.add('verify');
  }
  if (g.includes('报告') || g.includes('记录') || g.includes('evidence') || g.includes('report') || g.includes('trace')) {
    roles.add('trace');
  }

  // 默认需要 inspect + verify + trace
  if (roles.size === 0) {
    roles.add('inspect');
    roles.add('verify');
  }
  roles.add('trace'); // 总是留痕

  return [...roles];
}

/**
 * 按角色选择可用元器
 */
function selectSoftillsByRole(roles, available, registry) {
  const selected = {};

  for (const role of roles) {
    const candidates = [];
    for (const name of available) {
      if (SOFTILL_ROLES[name] === role) {
        const entry = registry.softills?.[name];
        candidates.push({
          name,
          level: entry?.level || 'unknown',
          sideEffects: entry?.sideEffects || [],
          deterministic: entry?.deterministic !== false,
        });
      }
    }

    // 优先选择 level 低、无副作用、确定性的元器
    candidates.sort((a, b) => {
      const levelOrder = { 'L0_read_probe': 0, 'L1_transform': 1, 'L2_validate': 2, 'L3_write': 3, 'L4_state': 4, 'L5_generate': 5 };
      const aL = levelOrder[a.level] || 99;
      const bL = levelOrder[b.level] || 99;
      if (aL !== bL) return aL - bL;
      if (a.sideEffects.length !== b.sideEffects.length) return a.sideEffects.length - b.sideEffects.length;
      return a.deterministic === b.deterministic ? 0 : a.deterministic ? -1 : 1;
    });

    selected[role] = candidates;
  }

  return selected;
}

/**
 * 生成节点序列（按角色流水线顺序）
 */
function buildNodes(selected, context) {
  const pipelineOrder = ['inspect', 'diagnose', 'modify', 'verify', 'trace'];
  const nodes = [];
  let prevNodeId = null;

  for (const role of pipelineOrder) {
    const candidates = selected[role];
    if (!candidates || candidates.length === 0) continue;

    const chosen = candidates[0];
    const nodeId = `step-${role}`;

    const node = {
      id: nodeId,
      softill: chosen.name,
      input: context?.input?.[chosen.name] || {},
      description: roleLabels[role] || `执行 ${chosen.name}`,
      when: {},
      humanCheckpoint: role === 'modify',
      evidenceRequired: [],
    };

    if (prevNodeId) {
      node.when[prevNodeId] = 'PASS';
    } else {
      node.when = { always: true };
    }

    // only the first modify needs checkpoint
    const hasModifyNode = nodes.some(n => n.humanCheckpoint && n.id !== nodeId);
    if (role === 'modify' && hasModifyNode) {
      node.humanCheckpoint = false;
    }

    nodes.push(node);
    prevNodeId = nodeId;
  }

  // 修复第一个节点的 when
  if (nodes.length > 0) {
    nodes[0].when = { always: true };
  }

  return nodes;
}

const roleLabels = {
  inspect: '探查当前状态',
  diagnose: '诊断发现问题',
  modify: '执行修改操作',
  verify: '验证修改结果',
  trace: '留存执行证据',
};

/**
 * 生成恢复策略
 */
function buildRecovery(nodes) {
  const recovery = {
    maxRetries: 2,
    onMaxRetries: 'human',
    fallbackActions: [],
  };

  // 修改 → 验证 之间加回退
  const modifyIdx = nodes.findIndex(n => n.id === 'step-modify');
  const verifyIdx = nodes.findIndex(n => n.id === 'step-verify');
  const diagnoseIdx = nodes.findIndex(n => n.id === 'step-diagnose');

  if (modifyIdx !== -1 && verifyIdx !== -1 && diagnoseIdx !== -1) {
    recovery.fallbackActions.push({
      on: 'step-verify:FAIL',
      action: 'goto',
      target: 'step-diagnose',
    });
  }

  return recovery;
}

/**
 * 根据约束过滤元器选择
 * 添加时间: 2026-07-10 (v0.2 复利改进 #1)
 */
function filterByConstraints(selected, context) {
  if (!context?.constraints || context.constraints.length === 0) return selected;

  const filtered = { ...selected };
  const constraints = context.constraints.map(c => typeof c === 'string' ? c : c.description || '');

  for (const constraint of constraints) {
    const c = constraint.toLowerCase();

    if (c.includes('registry 只读') || c.includes('禁止修改 registry') || c.includes('no_modify_registry')) {
      // 移除可能修改 Registry 的元器
      for (const role of ['modify']) {
        filtered[role] = (filtered[role] || []).filter(s => s.name !== 'file-patch' && s.name !== 'meta-softill');
      }
    }

    if (c.includes('handler.js 只读') || c.includes('禁止修改 handler') || c.includes('read_only_handler')) {
      // 移除可能修改 handler 的元器
      for (const role of ['modify']) {
        filtered[role] = (filtered[role] || []).filter(s => s.name !== 'file-patch');
      }
    }

    if (c.includes('禁止创建新的元器') || c.includes('no_new_softills')) {
      for (const role of ['modify']) {
        filtered[role] = (filtered[role] || []).filter(s => s.name !== 'softill-init' && s.name !== 'meta-softill');
      }
    }
  }

  return filtered;
}

/**
 * 模式 1：从目标编成新元阵
 */
function plan(goal, skills, available, context) {
  const registry = loadRegistry();
  const traces = loadTraces();

  // 从目标猜角色
  const roles = guessRolesFromGoal(goal);

  // 如果没有指定可用元器，从 Registry 全部取
  if (!available || available.length === 0) {
    available = Object.keys(registry.softills || {});
  }

  // 按角色选元器
  let selected = selectSoftillsByRole(roles, available, registry);

  // 按约束过滤（v0.2 新增）
  selected = filterByConstraints(selected, context);

  // 生成节点
  const nodes = buildNodes(selected, context);

  // 生成恢复策略
  const recovery = buildRecovery(nodes);

  // 验证条件
  const verification = {
    requiredEvidences: ['trace'],
    minEvidenceCount: 1,
  };

  const plan = {
    id: `combo-${Date.now().toString(36)}`,
    version: '0.1.0',
    goal: {
      description: goal,
      skillRefs: skills || ['combo-design'],
    },
    context: {
      allowedRead: context?.allowedRead || ['.claude/'],
      allowedWrite: context?.allowedWrite || ['.claude/'],
      constraints: context?.constraints || [],
    },
    plan: {
      nodes,
      validation: verification,
      recovery,
    },
    generatedBy: 'combo-init',
    generatedAt: new Date().toISOString(),
    rolesUsed: roles,
    experienceRefs: traces.length > 0 ? `${traces.length} 条历史轨迹可用` : '无历史经验',
  };

  return plan;
}

/**
 * 模式 2：从已有经验中召回相似元阵
 */
function recall(goal) {
  const traces = loadTraces();

  if (traces.length === 0) {
    return { result: 'no_experience', message: '没有历史元阵经验', traces: [] };
  }

  // 简单关键词匹配召回
  const keywords = (goal || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = traces.map(t => {
    const desc = (t.goal?.description || t.description || '').toLowerCase();
    const matchCount = keywords.filter(k => desc.includes(k)).length;
    const nodes = t.nodes || t.plan?.nodes || [];
    return { trace: t, score: matchCount / Math.max(keywords.length, 1), nodeCount: nodes.length };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    result: 'recalled',
    count: scored.length,
    topMatches: scored.filter(s => s.score > 0).slice(0, 3),
    all: scored.slice(0, 5),
  };
}

/**
 * 模式 3：生成空白元阵计划模板（类似 softill-init 的 scaffold）
 */
function scaffold(name) {
  const plan = {
    id: `combo-${name || 'new-plan'}`,
    version: '0.1.0',
    goal: {
      description: '__目标描述__',
      skillRefs: ['__引用技法__'],
    },
    context: {
      allowedRead: ['.claude/softills/'],
      allowedWrite: ['.claude/softills/'],
      constraints: [],
    },
    plan: {
      nodes: [
        {
          id: 'step-1-inspect',
          softill: '__感知元器__',
          input: {},
          when: { always: true },
          humanCheckpoint: false,
          evidenceRequired: [],
          description: '探查当前状态',
        },
        {
          id: 'step-2-diagnose',
          softill: '__诊断元器__',
          input: {},
          when: { 'step-1-inspect': 'PASS' },
          humanCheckpoint: false,
          evidenceRequired: [],
          description: '诊断发现问题',
        },
        {
          id: 'step-3-modify',
          softill: '__操作元器__',
          input: {},
          when: { 'step-2-diagnose': 'PASS' },
          humanCheckpoint: true,
          evidenceRequired: [],
          description: '执行修改',
        },
        {
          id: 'step-4-verify',
          softill: '__验证元器__',
          input: {},
          when: { 'step-3-modify': 'PASS' },
          humanCheckpoint: false,
          evidenceRequired: [],
          description: '验证修改结果',
        },
        {
          id: 'step-5-trace',
          softill: '__留痕元器__',
          input: {},
          when: { 'step-4-verify': 'PASS' },
          humanCheckpoint: false,
          evidenceRequired: [],
          description: '留存证据',
        },
      ],
      validation: {
        requiredEvidences: ['trace'],
        minEvidenceCount: 1,
      },
      recovery: {
        maxRetries: 2,
        onMaxRetries: 'human',
        fallbackActions: [
          { on: 'step-4-verify:FAIL', action: 'goto', target: 'step-2-diagnose' },
        ],
      },
    },
    generatedBy: 'combo-init scaffold',
    generatedAt: new Date().toISOString(),
  };

  return plan;
}

// CLI
function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'plan';
  const inputArg = args.slice(1).join(' ') || '{}';

  let input;
  try { input = JSON.parse(inputArg); }
  catch { input = { goal: inputArg }; }

  let result;

  switch (mode) {
    case 'plan':
      result = plan(
        input.goal || input.description || '未指定目标',
        input.skills || [],
        input.available || [],
        input.context || {}
      );
      break;

    case 'recall':
      result = recall(input.goal || input.description || '');
      break;

    case 'scaffold':
      result = scaffold(input.name || 'custom-combo');
      break;

    default:
      result = { error: true, message: `未知模式: ${mode}。可用: plan, recall, scaffold` };
  }

  console.log(JSON.stringify(result, null, 2));
}

export default { plan, recall, scaffold };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();