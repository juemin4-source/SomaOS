/**
 * baseline.js — 每个字段的默认基线
 */

const BASELINE = {
  scope_pressure: 0,
  context_freshness: 1,
  execution_stability: 1,
  failure_pain: 0,
  token_heat: 0,
  trust_level: 1,
  skill_health: 1,
  abstraction_pressure: 0,
  delivery_readiness: 0,
};

function getBaseline(fieldName) {
  return BASELINE[fieldName] !== undefined ? BASELINE[fieldName] : 0;
}

module.exports = { BASELINE, getBaseline };
