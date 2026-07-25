/**
 * drift-state.js — 对 body-state 应用自然衰减/恢复
 *
 * 压力类 → 朝 0 衰减
 * 健康类 → 朝 1 恢复（半速）
 * 时效类 → 朝 0 下降（半速）
 * 准备度 → 不自动变化
 */

const { classify } = require('./classify-fields');

const DRIFT_FACTOR = {
  pressure: 1.0,    // 全速朝 0
  health: 0.5,      // 半速朝 1
  decay: 0.5,       // 半速朝 0
  readiness: 0,     // 不自动变化
};

function applyDrift(state, driftStep) {
  const step = driftStep || 0.05;
  const drifted = {};
  const changes = [];

  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'number') {
      drifted[key] = value;
      continue;
    }

    const category = classify(key);
    const factor = DRIFT_FACTOR[category] || 0;
    const delta = step * factor;

    let newVal;
    switch (category) {
      case 'pressure':
        newVal = Math.max(0, value - delta);
        break;
      case 'health':
        newVal = Math.min(1, value + delta);
        break;
      case 'decay':
        newVal = Math.max(0, value - delta);
        break;
      case 'readiness':
        newVal = value; // 不自动变化
        break;
      default:
        newVal = value;
    }

    drifted[key] = newVal;
    if (newVal !== value) {
      const direction = category === 'health' ? 'toward baseline 1' : 'toward baseline 0';
      changes.push({ field: key, before: value, after: newVal, reason: `${category} field drifted ${direction}` });
    }
  }

  return { drifted, changes };
}

module.exports = { applyDrift };
