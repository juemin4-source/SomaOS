/**
 * validate-json.mjs — schema-validator JSON Schema validation
 *
 * 对给定数据执行结构校验，返回错误路径列表。
 * 支持 JSON Schema 子集：type、required、properties、additionalProperties、enum、pattern、items。
 * 纯逻辑，无 I/O，无外部依赖。
 */

export function validate(data, schema, mode) {
  const errors = [];
  const strict = mode !== 'loose';

  _validate(data, schema, [], errors, strict);
  return errors;
}

function _validate(value, schema, path, errors, strict) {
  if (!schema || typeof schema !== 'object') return;

  // type check
  if (schema.type) {
    const typeOk = checkType(value, schema.type);
    if (!typeOk) {
      errors.push({
        path: formatPath(path),
        message: `Expected type '${schema.type}', got '${typeof value}'`,
        actual: typeof value,
        expected: schema.type,
      });
      // 类型错了不继续深入校验
      return;
    }
  }

  // enum check
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.some(e => e === value)) {
      errors.push({
        path: formatPath(path),
        message: `Value '${value}' not in enum [${schema.enum.join(', ')}]`,
        actual: value,
        expected: schema.enum,
      });
      return;
    }
  }

  // pattern check (string)
  if (schema.pattern && typeof value === 'string') {
    try {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push({
          path: formatPath(path),
          message: `String '${value.slice(0, 80)}' does not match pattern '${schema.pattern}'`,
          actual: value,
          expected: schema.pattern,
        });
      }
    } catch {}
  }

  // object properties
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    // required
    if (schema.required && Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value) || value[key] === undefined) {
          errors.push({
            path: formatPath([...path, key]),
            message: `Missing required property '${key}'`,
            actual: undefined,
            expected: 'present',
          });
        }
      }
    }

    // properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value && value[key] !== undefined) {
          _validate(value[key], propSchema, [...path, key], errors, strict);
        }
      }
    }

    // additionalProperties
    if (strict && schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          errors.push({
            path: formatPath([...path, key]),
            message: `Additional property '${key}' not allowed`,
            actual: key,
            expected: 'no additional properties',
          });
        }
      }
    }
  }

  // array items
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        // tuple validation
        for (let i = 0; i < schema.items.length && i < value.length; i++) {
          _validate(value[i], schema.items[i], [...path, i], errors, strict);
        }
      } else {
        // all items match schema
        for (let i = 0; i < value.length; i++) {
          _validate(value[i], schema.items, [...path, i], errors, strict);
        }
      }
    }
  }
}

function checkType(value, type) {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && !Number.isNaN(value);
    case 'integer': return Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    case 'any': return true;
    default: return true;
  }
}

function formatPath(segments) {
  if (segments.length === 0) return '$';
  return '$.' + segments.map(s =>
    typeof s === 'number' ? `[${s}]` : s
  ).join('.');
}

export default { validate };
