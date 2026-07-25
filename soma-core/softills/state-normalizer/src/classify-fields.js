/**
 * classify-fields.js — 字段分类
 *
 * 压力类 → 朝 0 衰减
 * 健康类 → 朝 1 恢复（慢速）
 * 时效类 → 朝 0 下降
 * 准备度 → 不自动变化
 */

const FIELD_CLASSIFICATION = {
  // 压力类：朝 0 衰减
  pressure: ['scope_pressure', 'failure_pain', 'token_heat', 'abstraction_pressure'],
  // 健康类：朝 1 恢复（慢速）
  health: ['execution_stability', 'trust_level', 'skill_health'],
  // 时效类：朝 0 下降
  decay: ['context_freshness'],
  // 准备度：不自动变化
  readiness: ['delivery_readiness'],
};

// 所有 body-state 字段列表
const ALL_FIELDS = [
  'scope_pressure', 'context_freshness', 'execution_stability',
  'failure_pain', 'token_heat', 'trust_level', 'skill_health',
  'abstraction_pressure', 'delivery_readiness',
];

function classify(fieldName) {
  for (const [category, fields] of Object.entries(FIELD_CLASSIFICATION)) {
    if (fields.includes(fieldName)) return category;
  }
  return 'unknown';
}

module.exports = { FIELD_CLASSIFICATION, ALL_FIELDS, classify };
