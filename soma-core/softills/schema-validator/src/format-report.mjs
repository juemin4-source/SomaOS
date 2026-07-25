/**
 * format-report.mjs — schema-validator human-readable report formatter
 *
 * 格式化校验结果为可读文本。
 * 纯逻辑，无 I/O。
 */

export function formatHuman(output) {
  if (!output) return '';

  const lines = [];

  if (output.result === 'PASS') {
    lines.push(`✅ [PASS] ${output.summary || 'Validation passed'}`);
  } else if (output.result === 'FAIL') {
    lines.push(`❌ [FAIL] ${output.summary || 'Validation failed'}`);
    if (output.errors && output.errors.length > 0) {
      for (const e of output.errors) {
        lines.push(`  - ${e.path}: ${e.message}`);
      }
    }
  } else {
    lines.push(`⚠️  [${output.result}] ${output.summary || ''}`);
  }

  if (output.targetFile) {
    lines.push(`  File: ${output.targetFile}`);
  }
  if (output.schema) {
    lines.push(`  Schema: ${output.schema}`);
  }

  return lines.join('\n');
}

export default { formatHuman };
