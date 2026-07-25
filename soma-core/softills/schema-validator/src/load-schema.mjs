/**
 * load-schema.mjs — schema-validator schema loader
 *
 * 加载内置 schema 定义。当前支持软技能和 Soma 相关 schema。
 * 纯内存操作，无 I/O。
 */

const BUILTIN_SCHEMAS = {
  'softill-contract': {
    type: 'object',
    required: ['identity', 'contract'],
    properties: {
      identity: {
        type: 'object',
        required: ['name', 'version', 'kind'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          kind: { type: 'string', enum: ['softill', 'composite', 'meta'] },
          trustState: { type: 'string' },
        },
      },
      contract: {
        type: 'object',
        required: ['capability'],
        properties: {
          capability: { type: 'string' },
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effects: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },

  'softill-registry': {
    type: 'object',
    required: ['softills'],
    properties: {
      softills: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['name', 'level'],
          properties: {
            name: { type: 'string' },
            level: { type: 'string' },
            writesSource: { type: 'boolean' },
            writesSomaState: { type: 'boolean' },
            sideEffects: { type: 'array', items: { type: 'string' } },
            defaultCost: { type: 'string' },
            outputContract: { type: 'string' },
          },
        },
      },
    },
  },

  'sir-record': {
    type: 'object',
    required: ['opcode', 'actor'],
    properties: {
      opcode: { type: 'string' },
      actor: { type: 'string', enum: ['claude', 'soma', 'worker', 'system'] },
      target: { type: 'string' },
      status: { type: 'string', enum: ['started', 'running', 'completed', 'failed', 'blocked'] },
      evidence: { type: 'array', items: { type: 'object' } },
    },
  },

  'generic-object': {
    type: 'object',
    properties: {},
    additionalProperties: true,
  },
};

export function loadSchema(name) {
  if (!name) return null;
  return BUILTIN_SCHEMAS[name] || null;
}

export function listSchemas() {
  return Object.keys(BUILTIN_SCHEMAS);
}

export default { loadSchema, listSchemas };
