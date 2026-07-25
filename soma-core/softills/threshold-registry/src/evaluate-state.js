/**
 * evaluate-state.js — 评估完整 body-state
 */

const { evaluateField, MODE_PRIORITY, ATTENTION_PRIORITY } = require('./evaluate-field');

const ALL_FIELDS = [
  'scope_pressure', 'context_freshness', 'execution_stability',
  'failure_pain', 'token_heat', 'trust_level', 'skill_health',
  'abstraction_pressure', 'delivery_readiness',
];

function evaluateState(state) {
  const evaluations = [];

  for (const field of ALL_FIELDS) {
    const value = state[field];
    if (value === undefined) continue;
    const result = evaluateField(field, value);
    if (result.ok) evaluations.push(result);
  }

  // Find highest severity
  let highestLevel = 'normal';
  let highestMode = 'normal';
  let allInhibit = [];
  let allExcite = [];
  let criticalFields = [];

  for (const ev of evaluations) {
    const levelPrio = ATTENTION_PRIORITY[ev.attention] ?? 99;
    const currentHighest = ATTENTION_PRIORITY[highestLevel] ?? 99;
    if (levelPrio < currentHighest) {
      highestLevel = ev.attention;
    }
    const modePrio = MODE_PRIORITY[ev.suggestedMode] ?? 99;
    const currentMode = MODE_PRIORITY[highestMode] ?? 99;
    if (modePrio < currentMode) {
      highestMode = ev.suggestedMode;
    }
    allInhibit.push(...(ev.inhibit || []));
    allExcite.push(...(ev.excite || []));
    if (ev.level === 'critical') criticalFields.push(ev.field);
  }

  return {
    evaluations,
    highestLevel,
    highestMode,
    criticalFields,
    allInhibit: [...new Set(allInhibit)],
    allExcite: [...new Set(allExcite)],
  };
}

module.exports = { evaluateState, ALL_FIELDS };
