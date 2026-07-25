/**
 * classify-failure.mjs — test-runner failure line classifier
 *
 * 从 stdout/stderr 中提取测试失败的标识行。
 * 支持常见测试框架的输出格式。
 */

const FAILURE_PATTERNS = [
  /FAIL(ED|S|URE)?\s/i,
  /✗|×|✘|✕|☓/,
  /\d+\)\s+(Error|AssertionError|TypeError|ReferenceError)/,
  /Error:\s/,
  /AssertionError:\s/,
  /at\s+(Object\.|Test\.|it\.|describe\.)/,
  /expected\s+.*\s+to\s+equal/,
  /expected\s+.*\s+to\s+be/,
  /Cannot find module/,
  /SyntaxError:/,
  /TypeError:/,
  /ReferenceError:/,
  /RangeError:/,
  /\.test\.(js|ts|mjs|jsx|tsx):\d+/,
  /Tests:\s+\d+\s+failed/,
  /\d+\s+failing/,
  /\d+\s+failed/,
  /test\s+failed/,
  /tests\s+failed/,
  /not\s+ok\s+\d+/,
  /#\s+FAIL/,
  /FAIL\s+/,
];

export function classify(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const failures = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (seen.has(trimmed)) continue;

    for (const p of FAILURE_PATTERNS) {
      if (p.test(trimmed)) {
        failures.push({ message: trimmed.slice(0, 300) });
        seen.add(trimmed);
        break;
      }
    }

    // 最多收集 50 条
    if (failures.length >= 50) break;
  }

  return failures;
}
