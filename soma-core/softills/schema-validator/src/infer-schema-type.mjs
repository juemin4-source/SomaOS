/**
 * infer-schema-type.mjs — schema-validator schema type inference
 *
 * 根据数据内容推断最合适的 schema 类型名称。
 * 纯逻辑，无 I/O。
 */

export function infer(data) {
  if (!data || typeof data !== 'object') return null;

  // Soma Softill contract pattern
  if (data.identity?.name && data.contract?.inputSchema) return 'softill-contract';
  if (data.name && data.handler && data.type === 'softill') return 'softill-registry';

  // Standard patterns
  if (data.openapi || data.swagger || data.paths) return 'openapi';
  if (data.components?.schemas) return 'openapi';
  if (data.$schema) return 'json-schema';

  // SIR (Soma Intelligence Record)
  if (data.opcode && data.actor) return 'sir-record';
  if (data.schema?.fields) return 'avro-schema';

  // Package configs
  if (data.name && data.version && (data.dependencies || data.devDependencies)) return 'package';
  if (data.compilerOptions && data.include) return 'tsconfig';
  if (data.scripts && data.devDependencies) return 'package';

  // Docker
  if (data.services && (data.volumes || data.networks)) return 'docker-compose';
  if (data.steps && data.runs) return 'github-actions';

  // Softill registry
  if (data.softills && typeof data.softills === 'object') return 'softill-registry';

  // Generic fallback
  return 'generic-object';
}

export default { infer };
