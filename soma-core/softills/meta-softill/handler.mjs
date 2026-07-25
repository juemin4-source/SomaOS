#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * meta-softill — handler.js
 *
 * 元 softill：审查、生成、注册、升级 softill。
 * ─── 已拆分为模块 ───
 *   lib/audit.js        审查所有 softill 健康度
 *   lib/blueprint.js    根据描述生成新 softill（含完整骨架）
 *   lib/register.js     注册 / 更新 / 附加 manifest
 *   lib/upgrade.js      审查单个 softill 并给出改进建议
 *   lib/discover.js     扫描文件系统发现所有 softill
 *   lib/knowledge.js    管理 softill 的知识库
 *   lib/apiConnector.js 管理 softill 的 API 连接器
 *   lib/hook.js         管理事件钩子与定时任务
 *   lib/utils.js        共享工具（registry / 输出 / 路径）
 *
 * 输出格式: softill_result (through lib/utils out())
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */


import fs from 'fs';

import path from 'path';

// 加载模块

import { out } from './lib/utils.js';

import { audit } from './lib/audit.js';

import { blueprint } from './lib/blueprint.js';

import { register } from './lib/register.js';

import { upgrade } from './lib/upgrade.js';

import { discover } from './lib/discover.js';

// Combo 管理 — 直接内联，不依赖 lib 模块
const COMBO_BASE = path.resolve('G:/AI/Claude-Workspace/Foundry/.claude/combos');

function comboList() {
  if (!fs.existsSync(COMBO_BASE)) return out('PASS', 'No combos found', { combos: [] });
  const dirs = fs.readdirSync(COMBO_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
  const combos = dirs.map(name => {
    const yaml = path.join(COMBO_BASE, name, 'combo.yaml');
    const hasYaml = fs.existsSync(yaml);
    const skill = path.join(COMBO_BASE, name, 'SKILL.md');
    const hasSkill = fs.existsSync(skill);
    return { name, has_yaml: hasYaml, has_skill: hasSkill };
  });
  return out('PASS', `${combos.length} combo(s)`, { combos });
}

function comboScaffold(input) {
  const name = input.name || input.combo;
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
    return out('ERROR', 'name must be kebab-case (e.g. my-combo)', {});

  const steps = input.steps || [];
  const lang = input.language || 'zd'; // 'zd' 或 'yaml'
  const dir = path.join(COMBO_BASE, name);
  if (fs.existsSync(dir))
    return out('ERROR', `Combo already exists: ${name}`, {});

  fs.mkdirSync(dir, { recursive: true });
  const files = [];

  if (lang === 'zd') {
    // 生成 combo.zd（周道脚本）
    let zd = `# combo.zd — ${name}\n# ${input.description || ''}\n`;
    if (steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        zd += `\n设 步骤${i+1} 为 调用软技能（【${s.softill || ''}】，{ }）。\n`;
        zd += `显示 步骤${i+1}。\n`;
      }
    } else {
      zd += `\n# 在此编写你的 combo 逻辑\n设 结果 为 调用软技能（【】，{ }）。\n`;
    }
    fs.writeFileSync(path.join(dir, 'combo.zd'), zd, 'utf-8');
    files.push('combo.zd');
  } else {
    // 生成 combo.yaml（YAML 步骤定义）
    let yaml = `# combo.yaml — ${name}\nschema_version: "1.0"\ncombo_id: "${name}"\nversion: "1.0.0"\ndescription: "${input.description || ''}"\n\nsteps:\n`;
    if (steps.length === 0) {
      yaml += `  - id: step-1\n    softill: ""\n    description: ""\n    input: {}\n    map: {}\n`;
    } else {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        yaml += `  - id: ${s.id || `step-${i+1}`}\n    softill: ${s.softill || ''}\n    description: ${s.description || ''}\n`;
        if (s.input) yaml += `    input: ${JSON.stringify(s.input)}\n`;
        if (s.map) yaml += `    map: ${JSON.stringify(s.map)}\n`;
      }
    }
    fs.writeFileSync(path.join(dir, 'combo.yaml'), yaml, 'utf-8');
    files.push('combo.yaml');
  }

  // 生成 SKILL.md
  const skillMd = `---
name: ${name}
description: |
  Combo：${input.description || name}

Triggers on: "${name}", "${name.replace(/-/g, ' ')}"
archetype:
  primary: Workflow
  secondary: [Delivery]
thickness: medium
---

# ${name} Combo

${input.description || ''}

## 步骤

${steps.map((s, i) => `${i+1}. ${s.description || s.softill || ''}`).join('\n') || '1. 待定义'}
`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf-8');
  files.push('SKILL.md');

  return out('PASS', `Combo scaffold created: ${name} (${lang})`, { path: dir, files, steps: steps.length || 0 });
}

const MODES = {
  audit:         { fn: audit,          desc: '审查所有 softill 健康度' },
  blueprint:     { fn: blueprint,      desc: '生成新 softill 骨架' },
  register:      { fn: register,       desc: '注册 softill 到 registry' },
  upgrade:       { fn: upgrade,        desc: '审查单个 softill 给出改进建议' },
  discover:      { fn: discover,       desc: '扫描文件系统发现所有 softill' },
  'combo-list':    { fn: comboList,      desc: '列出所有 combo 定义' },
  'combo-scaffold': { fn: comboScaffold,  desc: '从模板生成新 combo 骨架（combo.yaml + SKILL.md）' },
};

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  const mode = input.mode || 'audit';
  const handler = MODES[mode];

  if (!handler) {
    const available = Object.keys(MODES).join(', ');
    return out('ERROR', `Unknown mode: ${mode}. Available: ${available}`);
  }

  handler.fn(input);
}

// 支持 --help / --modes
if (process.argv[2] === '--help' || process.argv[2] === '--modes') {
  console.log('meta-softill — 元 softill\n');
  for (const [name, m] of Object.entries(MODES)) {
    console.log(`  ${name.padEnd(12)} ${m.desc}`);
  }
  console.log('\n用法: node handler.js <input.json>  |  cat input.json | node handler.js');
  process.exit(0);
}



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();