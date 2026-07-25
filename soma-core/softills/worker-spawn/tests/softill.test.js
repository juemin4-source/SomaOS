#!/usr/bin/env node
const assert = require('assert');
const path = require('path');
const { handle } = require('../handler.js');

let passed = 0, failed = 0;
function test(msg, fn) {
  try { fn(); console.log('  ✅', msg); passed++; }
  catch (e) { console.log('  ❌', msg, '-', e.message); failed++; }
}

console.log('\n📋 worker-spawn 测试\n');

test('handle returns result', () => {
  const r = handle({ input: 'test' }, {});
  assert.ok(r, '应返回结果');
});

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
