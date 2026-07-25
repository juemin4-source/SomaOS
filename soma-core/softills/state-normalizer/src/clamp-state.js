/**
 * clamp-state.js — 把 body-state 所有数值 clamp 到 [0,1]
 */

function clamp(value) {
  if (typeof value !== 'number') return value;
  return Math.max(0, Math.min(1, value));
}

function clampState(state) {
  const changes = [];
  const clamped = {};

  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'number') {
      clamped[key] = value;
      continue;
    }
    const clampedVal = clamp(value);
    clamped[key] = clampedVal;
    if (clampedVal !== value) {
      changes.push({ field: key, before: value, after: clampedVal, reason: 'clamped to [0,1]' });
    }
  }

  return { clamped, changes };
}

module.exports = { clamp, clampState };
