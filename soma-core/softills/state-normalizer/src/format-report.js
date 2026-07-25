/**
 * format-report.js — 人类可读报告
 */

function formatHuman(result) {
  let out = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  out += '  Soma State Normalizer\n';
  out += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const icon = result.result === 'PREVIEW' ? '👁️' : result.result === 'WRITTEN' ? '✅' : '⚠️';
  out += `  Result: ${result.result}\n\n`;
  out += `  Target:\n  - ${result.targetFile}\n\n`;

  if (result.changes && result.changes.length > 0) {
    out += '  Changes:\n';
    result.changes.forEach(c => {
      const before = typeof c.before === 'number' ? c.before.toFixed(3) : c.before;
      const after = typeof c.after === 'number' ? c.after.toFixed(3) : c.after;
      out += `  - ${c.field}: ${before} → ${after}\n`;
    });
    out += '\n';
  } else {
    out += '  No changes needed.\n\n';
  }

  out += `  Summary:\n  - ${result.summary}\n`;
  out += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  return out;
}

module.exports = { formatHuman };
