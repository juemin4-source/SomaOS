/**
 * scope-analyzer.mjs — diff-review scope analysis
 *
 * 从 diff 文件列表分析变更范围、保护路径违规、意外变更和风险等级。
 * 纯逻辑，无 I/O。
 */

const PROTECTED_RULES = [
  { pattern: /(^|\/)\.claude\//, rule: 'Soma config', severity: 'error' },
  { pattern: /(^|\/)CLAUDE\.md$/, rule: 'Project rules', severity: 'error' },
  { pattern: /(^|\/)\.env/, rule: 'Environment config', severity: 'error' },
  { pattern: /(^|\/)package-lock\.json$/, rule: 'Lockfile', severity: 'warning' },
  { pattern: /(^|\/)yarn\.lock$/, rule: 'Lockfile', severity: 'warning' },
  { pattern: /(^|\/)pnpm-lock\.yaml$/, rule: 'Lockfile', severity: 'warning' },
  { pattern: /(^|\/)Cargo\.lock$/, rule: 'Lockfile', severity: 'warning' },
  { pattern: /(^|\/)\.mcp\.json$/, rule: 'MCP config', severity: 'error' },
  { pattern: /(^|\/)\.claude\/settings\.json$/, rule: 'Claude settings', severity: 'error' },
  { pattern: /(^|\/)\.claude\/settings\.local\.json$/, rule: 'Claude local settings', severity: 'warning' },
  { pattern: /(^|\/)target\//, rule: 'Build output', severity: 'warning' },
  { pattern: /(^|\/)node_modules\//, rule: 'Dependencies', severity: 'info' },
  { pattern: /(^|\/)dist\//, rule: 'Build output', severity: 'info' },
];

// Scope 映射：路径前缀 → 范围标签
const SCOPE_MAP = [
  { prefix: '.claude/', scope: 'soma', detail: 'Soma 系统配置' },
  { prefix: 'src/', scope: 'source', detail: '源代码' },
  { prefix: 'crates/', scope: 'source', detail: 'Rust crate 源' },
  { prefix: 'packages/', scope: 'source', detail: '包源码' },
  { prefix: 'tests/', scope: 'test', detail: '测试' },
  { prefix: 'docs/', scope: 'docs', detail: '文档' },
  { prefix: 'scripts/', scope: 'tooling', detail: '脚本' },
  { prefix: 'config/', scope: 'config', detail: '配置' },
  { prefix: '.github/', scope: 'ci', detail: 'CI/CD' },
  { prefix: 'experiments/', scope: 'experiment', detail: '实验' },
  { prefix: '_legacy-vault/', scope: 'archive', detail: '归档' },
  { prefix: 'soma/', scope: 'soma', detail: 'Soma 系统' },
];

export function analyzeScope(files) {
  const scopes = new Set();
  const scopeDetails = [];

  for (const f of files) {
    for (const entry of SCOPE_MAP) {
      if (f.path.startsWith(entry.prefix)) {
        scopes.add(entry.scope);
        if (!scopeDetails.some(d => d.scope === entry.scope)) {
          scopeDetails.push({ scope: entry.scope, detail: entry.detail });
        }
        break;
      }
    }
  }

  return {
    scopes: [...scopes],
    scopeDetails,
  };
}

export function checkProtectedScope(files) {
  const violations = [];

  for (const f of files) {
    for (const rule of PROTECTED_RULES) {
      if (rule.pattern.test(f.path)) {
        violations.push({
          path: f.path,
          rule: rule.rule,
          severity: rule.severity,
        });
      }
    }
  }

  return violations;
}

export function detectUnexpectedChanges(files, allowedScope) {
  const unexpected = [];

  if (!allowedScope || allowedScope.length === 0) return unexpected;

  for (const f of files) {
    let matched = false;
    for (const a of allowedScope) {
      if (f.path.startsWith(a) || a === '*') {
        matched = true;
        break;
      }
    }
    if (!matched) {
      unexpected.push({
        path: f.path,
        reason: `Change outside allowed scope (${allowedScope.join(', ')})`,
      });
    }
  }

  return unexpected;
}

export function assessRiskLevel(protectedViolations, unexpectedChanges, fileCount) {
  const errors = protectedViolations.filter(v => v.severity === 'error').length;
  const warnings = protectedViolations.filter(v => v.severity === 'warning').length;

  if (errors > 0 || fileCount > 50) return 'high';
  if (warnings > 0 || unexpectedChanges.length > 0 || fileCount > 20) return 'medium';
  if (fileCount === 0) return 'none';
  return 'low';
}

export default { analyzeScope, checkProtectedScope, detectUnexpectedChanges, assessRiskLevel };
