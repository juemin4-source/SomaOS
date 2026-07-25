/**
 * format-report.js — 人类可读报告
 */

function formatHuman(result) {
  let out = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  out += '  Soma Threshold Registry\n';
  out += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  if (result.result === 'FAIL' || result.result === 'ERROR') {
    out += `  Result: ${result.result}\n\n`;
    if (result.evaluations) {
      result.evaluations.forEach(e => {
        if (!e.ok) out += `  Error: ${e.error}\n`;
      });
    }
    out += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    return out;
  }

  out += '  Result: PASS\n\n';

  if (result.highestLevel) {
    out += `  Highest Level:\n  - ${result.highestLevel}\n\n`;
    out += `  Recommended Mode:\n  - ${result.highestMode}\n\n`;
  }

  if (result.criticalFields && result.criticalFields.length > 0) {
    out += '  Critical Fields:\n';
    result.criticalFields.forEach(f => { out += `  - ${f}\n`; });
    out += '\n';
  }

  if (result.evaluations && result.evaluations.length > 0) {
    out += '  Evaluations:\n';
    result.evaluations.forEach(e => {
      out += `  - ${e.field}: ${e.value?.toFixed(3)} → ${e.level}`;
      if (e.attention && e.attention !== e.level) out += ` (attention: ${e.attention})`;
      out += '\n';
    });
    out += '\n';
  }

  if (result.allInhibit && result.allInhibit.length > 0) {
    out += '  Inhibit:\n';
    result.allInhibit.forEach(i => { out += `  - ${i}\n`; });
    out += '\n';
  }
  if (result.allExcite && result.allExcite.length > 0) {
    out += '  Excite:\n';
    result.allExcite.forEach(e => { out += `  - ${e}\n`; });
    out += '\n';
  }

  out += `  Summary: ${result.summary}\n`;
  out += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  return out;
}

module.exports = { formatHuman };
