/**
 * redact-output.mjs — test-runner output redaction & preview
 *
 * 截断输出到安全长度，不修改原始内容（纯截断，不脱敏）。
 */

export function redact(text, maxChars) {
  if (!text) return { preview: '', truncated: false, originalLength: 0 };
  const originalLength = text.length;
  const limit = maxChars || 3000;

  if (text.length <= limit) {
    return { preview: text, truncated: false, originalLength };
  }

  // 保留头和尾
  const headLen = Math.floor(limit * 0.7);
  const tailLen = limit - headLen - 30;
  const preview = text.slice(0, headLen) +
    `\n... [${originalLength - headLen - tailLen} chars truncated] ...\n` +
    text.slice(originalLength - tailLen);

  return { preview, truncated: true, originalLength };
}

export function formatHuman(output) {
  if (!output) return '';
  const lines = [`[${output.result}] ${output.summary}`];
  if (output.data?.durationMs) {
    lines.push(`Duration: ${output.data.durationMs}ms`);
  }
  if (output.data?.exitCode !== undefined && output.data?.exitCode !== null) {
    lines.push(`Exit code: ${output.data.exitCode}`);
  }
  return lines.join('\n');
}
