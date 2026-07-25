/**
 * classify-severity.js — 根据 field 定义和值判断 severity level
 */

function classifySeverity(fieldDef, value) {
  if (typeof value !== 'number') return null;
  if (value < 0 || value > 1) return null;

  const levels = fieldDef.levels;
  const healthyDirection = fieldDef.healthyDirection || 'low';

  // The levels object has keys ordered from healthy to unhealthy
  // For "low" direction: normal=lowest range, critical=highest range
  // For "high" direction: normal=highest range, critical=lowest range

  // Find which level the value falls in
  for (const [level, [lo, hi]] of Object.entries(levels)) {
    if (value >= lo && value <= hi) {
      // Check if this range actually contains the value
      return level;
    }
  }

  // Fallback: value is exactly at a boundary
  for (const [level, [lo, hi]] of Object.entries(levels)) {
    if (value >= lo && value <= hi) {
      return level;
    }
  }

  return 'unknown';
}

module.exports = { classifySeverity };
