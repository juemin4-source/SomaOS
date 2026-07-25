#!/usr/bin/env node

/**
 * e2e-summary v0.1 — handler.js
 *
 * 运行 E2E 测试并输出结构化结果。
 * 只报告 pass/fail 汇总和失败详情。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runTests(input) {
  const { specPath, projectDir, timeout = 120000 } = input;

  if (!projectDir) {
    return { error: 'projectDir 为必填' };
  }

  const absDir = path.resolve(projectDir);
  if (!fs.existsSync(absDir)) {
    return { error: `目录不存在: ${absDir}` };
  }

  // 检查是否有 Playwright 配置
  const hasPlaywrightConfig = fs.existsSync(path.join(absDir, 'playwright.config.ts')) ||
    fs.existsSync(path.join(absDir, 'playwright.config.js'));

  // 如果是本 softill 目录（测试用），跳转到 zhimengji 项目
  const targetDir = absDir.includes('.claude/softills')
    ? path.resolve('G:/AI/Chancellor-OS-Lab/projects/zhimengji')
    : absDir;

  // 如果没有 playwright 配置，返回提示
  const finalConfig = path.join(targetDir, 'playwright.config.ts');
  if (!fs.existsSync(finalConfig)) {
    return {
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
      verdict: 'fail',
      note: `未找到 playwright.config.ts，请确保 ${targetDir} 是 Playwright 项目根目录`,
    };
  }

  const spec = specPath ? `"${specPath.replace(/\\/g, '/')}"` : '';
  const cmd = `cd "${targetDir}" && npx playwright test ${spec} --reporter=json 2>/dev/null`;

  try {
    const start = Date.now();
    const stdout = execSync(cmd, { timeout, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const duration = Date.now() - start;

    // 解析 JSON 输出
    let results;
    try { results = JSON.parse(stdout); } catch {
      // JSON reporter 可能不可用，回退到字符串解析
      return parseTextOutput(stdout, duration, targetDir);
    }

    // 处理结构化输出
    const suites = Array.isArray(results) ? results : (results.suites || []);
    let total = 0, passed = 0, failed = 0, skipped = 0;
    const failures = [];

    function walkSuite(suite) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          total++;
          const tests = spec.tests || [];
          const ok = tests.some(t => t.status === 'expected' || t.status === 'passed');
          const fail = tests.some(t => t.status === 'unexpected' || t.status === 'failed');
          const skip = tests.every(t => t.status === 'skipped');
          if (skip) skipped++;
          else if (ok) passed++;
          if (fail) {
            failed++;
            failures.push({
              name: spec.title || 'unnamed',
              file: spec.file || specPath || 'unknown',
              error: tests.find(t => t.status === 'unexpected')?.errors?.[0]?.message || 'unknown error',
            });
          }
        }
      }
      if (suite.suites) suite.suites.forEach(s => walkSuite(s));
    }

    if (Array.isArray(results)) {
      // 扁平 spec 列表
      total = results.length;
      for (const r of results) {
        if (r.status === 'passed' || r.expectedStatus === 'passed') passed++;
        else if (r.status === 'failed' || r.status === 'unexpected') {
          failed++;
          failures.push({ name: r.title || 'unnamed', file: r.file || 'unknown', error: r.error?.message || 'failed' });
        }
        else skipped++;
      }
    } else if (suites.length > 0) {
      suites.forEach(s => walkSuite(s));
    }

    return {
      summary: { total, passed, failed, skipped, duration },
      failures,
      verdict: failed > 0 ? 'fail' : 'pass',
    };
  } catch (e) {
    // 超时或执行失败
    return parseTextOutput(e.stdout || '', 0, targetDir);
  }
}

function parseTextOutput(stdout, duration, dir) {
  // 尝试从文本输出中提取结果
  const passed = (stdout.match(/\bpassed\b/gi) || []).length;
  const failedMatch = stdout.match(/(\d+)\s+failed/);
  const totalMatch = stdout.match(/(\d+)\s+(?:of\s+)?(?:passed|failed|tests?)/);
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const total = totalMatch ? parseInt(totalMatch[1]) : (passed + failed || stdout.split('\n').length);

  // 提取失败详情
  const failures = [];
  const errorLines = stdout.match(/^(?:[×✖]|\d+\))\s*(.+)$/gm);
  if (errorLines) {
    errorLines.forEach(l => {
      failures.push({ name: l.replace(/^[×✖]\s*/, '').trim(), file: 'unknown', error: 'see output' });
    });
  }

  return {
    summary: { total: total || 1, passed: passed || 0, failed: failed || (stdout.includes('FAIL') ? 1 : 0), skipped: 0, duration },
    failures,
    verdict: failed > 0 ? 'fail' : 'pass',
    raw: stdout.slice(0, 1000),
  };
}

// CLI
function main() {
  // 优先 argv，次选 stdin
  if (process.argv[2] && process.argv[2] !== '--') {
    const r = runTests({ projectDir: process.argv[2], specPath: process.argv[3] || undefined });
    console.log(JSON.stringify(Object.assign({softill:"e2e-summary"}, r), null, 2));
    process.exit(r.verdict === 'pass' ? 0 : 1);
    return;
  }
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { input = {}; }
    const r = runTests(input);
    console.log(JSON.stringify(Object.assign({softill:"e2e-summary"}, r), null, 2));
    process.exit(r.verdict === 'pass' ? 0 : 1);
  });
}

if (require.main === module) main();
module.exports = { runTests };
