#!/usr/bin/env node

/**
 * softill-init — handler.js
 *
 * ⚠️ 委托模式（v0.2）
 * 现在委托给 meta-softill blueprint 模式。
 * 保持向后兼容，所有功能不变。
 *
 * 之前：独立生成骨架
 * 现在：softill-init name=xx archetype=xx → meta-softill mode=blueprint mode=full
 *
 * 用法（不变）：
 *   node handler.js --name my-thing --archetype Diagnostic
 *   cat input.json | node handler.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const META_SOFTILL_HANDLER = path.resolve(__dirname, '..', 'meta-softill', 'handler.js');

function main() {
  let input;

  // 支持 --name --archetype 参数
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    const parsed = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      parsed[key] = args[i + 1] || '';
    }
    input = parsed;
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { input = {}; }
      delegate(input);
    });
    return;
  } else {
    console.error('用法: node handler.js --name my-thing --archetype Diagnostic');
    process.exit(1);
  }

  delegate(input);
}

function delegate(input) {
  // 构造 meta-softill blueprint 的输入
  const delegateInput = {
    mode: 'blueprint',
    name: input.name,
    description: input.description || '',
    archetype: input.archetype || 'Diagnostic',
    scaffold: 'full',  // 生成完整骨架
  };

  if (!input.name) {
    console.log(JSON.stringify({
      path: '', files: [], verdict: 'error',
      error: 'name 必须是 kebab-case（如 my-detector）'
    }));
    process.exit(1);
  }

  const result = spawnSync('node', [META_SOFTILL_HANDLER], {
    input: JSON.stringify(delegateInput),
    encoding: 'utf-8',
    timeout: 15000,
  });

  if (result.status === 0) {
    // 转换输出格式以保持向后兼容
    try {
      const metaOut = JSON.parse(result.stdout);
      const files = metaOut.data?.files || ['handler.js'];
      console.log(JSON.stringify({
        path: metaOut.data?.path || '',
        files,
        verdict: 'created',
      }));
      process.exit(0);
    } catch {
      console.log(result.stdout);
      process.exit(0);
    }
  } else {
    // 错误输出
    console.log(result.stdout);
    process.exit(1);
  }
}

if (require.main === module) main();
