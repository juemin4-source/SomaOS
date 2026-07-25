/**
 * format-report.js
 *
 * 人类可读的模板填充报告。
 */

function formatHuman(result) {
  let out = '\n';
  out += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  out += '  Soma Template Fill\n';
  out += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  out += `  Result: ${result.result}\n\n`;
  out += `  Template:\n  - ${result.template}\n\n`;
  out += `  Output Path:\n  - ${result.outputPath}\n\n`;

  if (result.result === 'BLOCKED') {
    out += `  Reason:\n  - ${result.reason}\n\n`;
    if (result.missingVariables && result.missingVariables.length > 0) {
      out += '  Missing Variables:\n';
      result.missingVariables.forEach(v => { out += `  - ${v}\n`; });
      out += '\n';
    }
  }

  if (result.result === 'WRITTEN') {
    out += `  Overwritten: ${result.overwritten}\n\n`;
  }

  out += `  Summary: ${result.summary}\n`;
  out += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  return out;
}

module.exports = { formatHuman };
