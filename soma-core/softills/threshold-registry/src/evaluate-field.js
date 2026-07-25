/**
 * evaluate-field.js — 评估单个字段
 */

const { loadRegistry } = require('./load-registry');
const { classifySeverity } = require('./classify-severity');

const MODE_PRIORITY = { emergency: 0, grounding: 1, debug: 2, economy: 3, normal: 4 };
const ATTENTION_PRIORITY = { critical: 0, important: 1, notice: 2, silent: 3 };

function evaluateField(fieldName, value) {
  const registry = loadRegistry();
  const fieldDef = registry.fields[fieldName];

  if (!fieldDef) {
    return { ok: false, error: `Unknown field: ${fieldName}` };
  }

  if (typeof value !== 'number') {
    return { ok: false, error: `Value must be a number, got ${typeof value}` };
  }

  if (value < 0 || value > 1) {
    return { ok: false, error: `Value ${value} out of [0,1] range` };
  }

  const level = classifySeverity(fieldDef, value);
  if (!level) {
    return { ok: false, error: `Could not classify value ${value}` };
  }

  // Find matching recommendation for this level
  let attention = level;
  let suggestedMode = resolveDefaultMode(level);
  let inhibit = [];
  let excite = [];

  if (fieldDef.recommended && fieldDef.recommended[level]) {
    const rec = fieldDef.recommended[level];
    attention = rec.attention || level;
    suggestedMode = rec.suggestedMode || suggestedMode;
    inhibit = rec.inhibit || [];
    excite = rec.excite || [];
  }

  return {
    ok: true,
    field: fieldName,
    value,
    level,
    attention,
    suggestedMode,
    inhibit,
    excite,
  };
}

function resolveDefaultMode(level) {
  switch (level) {
    case 'critical': return 'emergency';
    case 'important': return 'debug';
    case 'notice': return 'normal';
    default: return 'normal';
  }
}

module.exports = { evaluateField, MODE_PRIORITY, ATTENTION_PRIORITY };
