/**
 * normalize-errors.mjs — schema-validator error normalizer
 *
 * 将 validate-json 产生的原始错误标准化为输出格式。
 * 纯逻辑，无 I/O。
 */

export function normalize(errors) {
  if (!errors || !Array.isArray(errors)) return [];

  return errors.map(e => ({
    path: e.path || '$',
    message: e.message || 'Unknown validation error',
    actual: e.actual !== undefined ? String(e.actual).slice(0, 200) : null,
    expected: e.expected !== undefined ? String(e.expected).slice(0, 200) : null,
  }));
}

export default { normalize };
