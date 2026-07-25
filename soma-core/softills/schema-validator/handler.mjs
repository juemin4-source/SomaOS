#!/usr/bin/env node
/**
 * schema-validator — handler.mjs (Reforged)
 *
 * Validate Soma/Softill JSON contracts with structured errors.
 * Uses filesystem.inspect Organ for target file reading.
 *
 * Identity: 独立 Softill（稳定任务能力）
 * Legacy Origin: src/softills/schema-validator/handler.js
 *
 * == Breaking Changes from Legacy ==
 * - ESM module (was CommonJS)
 * - Target file read via filesystemAdapter (was fs.readFileSync)
 * - Exported handle() function for programmatic use
 * - CLI entry preserved for backward compatibility
 *
 * == Input ==
 *   { targetFile, schema?, mode?, data? }
 *   - data: 直接提供数据，跳过文件读取
 *   - targetFile: 通过 filesystem.inspect Organ 读取
 *   - schema: 可选，指定 schema 文件名
 *   - mode: 'strict' | 'loose'（默认 strict）
 *
 * == Output ==
 *   {
 *     result: 'PASS' | 'FAIL' | 'ERROR',
 *     targetFile: string,
 *     schema: string,
 *     errors: [{ path, message, actual, expected }],
 *     summary: string
 *   }
 *
 * == Contract ==
 *   Schema Valid ≠ Behavior Verified.
 *   This softill produces STRUCTURAL EVIDENCE only.
 *   No execution, no subprocess, no side effects.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { validate } from './src/validate-json.mjs';
import { normalize } from './src/normalize-errors.mjs';
import { infer } from './src/infer-schema-type.mjs';
import { loadSchema } from './src/load-schema.mjs';
import { formatHuman } from './src/format-report.mjs';
import { readTargetFile, checkFileExists } from './lib/organ-reader.mjs';

// ─── Core handler ─────────────────────────────────────────────────────────────

/**
 * 执行 schema 校验。
 * 如果 input.data 提供，直接校验（跳过文件读取）。
 * 如果 input.targetFile 提供，通过 filesystem.inspect Organ 读取。
 *
 * @param {object} input
 * @param {string} [input.targetFile] - 目标文件路径
 * @param {object} [input.data] - 直接提供要校验的数据
 * @param {string} [input.schema] - schema 文件名（可选，auto-inferred）
 * @param {string} [input.mode='strict'] - 校验模式
 * @returns {Promise<object>} 校验结果
 */
export async function handle(input) {
  if (!input || typeof input !== 'object') {
    return {
      result: 'ERROR',
      targetFile: null,
      schema: null,
      errors: [{ path: '$', message: 'Input must be a JSON object.', actual: typeof input, expected: 'object' }],
      summary: 'Validation could not run.',
      _evidence: [],
    };
  }

  const mode = input.mode || 'strict';
  let targetContent = null;
  let targetFilePath = input.targetFile || '(inline)';

  // ── 1. 获取目标数据 ──
  if (input.data !== undefined && input.data !== null) {
    // 直接提供的数据
    targetContent = input.data;
  } else if (input.targetFile) {
    // 通过 filesystem.inspect Organ 读取
    try {
      const resolved = path.resolve(input.targetFile);
      const existsResult = await checkFileExists(resolved);
      if (!existsResult.exists) {
        return {
          result: 'ERROR',
          targetFile: input.targetFile,
          schema: input.schema || 'auto',
          errors: [{ path: '$', message: 'Target file not found.', actual: input.targetFile, expected: 'existing file' }],
          summary: 'Validation could not run.',
          _evidence: [
            { type: 'file_read_error', result: 'ERROR', summary: `File not found: ${input.targetFile}` },
          ],
        };
      }

      const readResult = await readTargetFile(resolved, { encoding: 'utf-8' });
      try {
        targetContent = JSON.parse(readResult.content);
      } catch (e) {
        return {
          result: 'ERROR',
          targetFile: input.targetFile,
          schema: input.schema || 'auto',
          errors: [{ path: '$', message: 'Target file is not valid JSON.', actual: e.message, expected: 'valid JSON' }],
          summary: 'Validation could not run.',
          _evidence: [
            { type: 'parse_error', result: 'ERROR', summary: `JSON parse failed: ${e.message}` },
          ],
        };
      }
    } catch (e) {
      return {
        result: 'ERROR',
        targetFile: input.targetFile,
        schema: input.schema || 'auto',
        errors: [{ path: '$', message: `Failed to read target file: ${e.message}`, actual: e.message, expected: 'readable file' }],
        summary: 'Validation could not run.',
        _evidence: [
          { type: 'file_read_error', result: 'ERROR', summary: e.message },
        ],
      };
    }
  } else {
    return {
      result: 'ERROR',
      targetFile: null,
      schema: null,
      errors: [{ path: '$', message: 'Either "data" or "targetFile" is required.', actual: null, expected: 'data or targetFile' }],
      summary: 'Validation could not run.',
      _evidence: [],
    };
  }

  if (targetContent === null || targetContent === undefined) {
    return {
      result: 'ERROR',
      targetFile: targetFilePath,
      schema: null,
      errors: [{ path: '$', message: 'Target content is empty.', actual: 'null/undefined', expected: 'valid JSON data' }],
      summary: 'Validation could not run.',
      _evidence: [],
    };
  }

  // ── 2. 推断或使用指定 schema ──
  const schemaName = input.schema || infer(targetContent);
  if (!schemaName) {
    return {
      result: 'ERROR',
      targetFile: targetFilePath,
      schema: 'auto',
      errors: [{ path: '$', message: 'Could not infer schema type from content.', actual: Object.keys(targetContent).join(', '), expected: 'recognizable schema type' }],
      summary: 'Validation could not run.',
      _evidence: [
        { type: 'schema_inference_failed', result: 'ERROR', summary: 'No matching schema for target data' },
      ],
    };
  }

  const schema = loadSchema(schemaName);
  if (!schema) {
    return {
      result: 'ERROR',
      targetFile: targetFilePath,
      schema: schemaName,
      errors: [{ path: '$', message: `Schema not found: ${schemaName}.`, actual: schemaName, expected: 'one of available schemas' }],
      summary: 'Validation could not run.',
      _evidence: [
        { type: 'schema_not_found', result: 'ERROR', summary: `Schema definition missing: ${schemaName}` },
      ],
    };
  }

  // ── 3. 执行校验（纯逻辑，无 I/O）──
  const rawErrors = validate(targetContent, schema, mode);
  const errors = normalize(rawErrors);
  const result = errors.length === 0 ? 'PASS' : 'FAIL';

  const output = {
    result,
    targetFile: targetFilePath,
    schema: schemaName,
    errors,
    summary: errors.length === 0 ? 'Validation passed.' : `Validation failed with ${errors.length} error(s).`,
    _evidence: errors.length === 0
      ? [{ type: 'schema_validation', result: 'PASS', summary: `Structural validation passed against ${schemaName}` }]
      : [
          { type: 'schema_validation', result: 'FAIL', summary: `Structural validation failed (${errors.length} errors) against ${schemaName}` },
          ...errors.slice(0, 5).map(e => ({
            type: 'validation_error',
            result: 'FAIL',
            path: e.path,
            summary: e.message,
          })),
        ],
  };

  return output;
}

// ── CLI entry ──

async function cli() {
  let input;

  if (process.argv[2] && process.argv[2] !== '--') {
    try {
      input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8'));
    } catch (e) {
      const err = { softill: 'schema-validator', result: 'ERROR', summary: `Read input: ${e.message}`, errors: [], targetFile: null, schema: null };
      console.error(formatHuman(err));
      console.error(JSON.stringify(err, null, 2));
      process.exit(1);
    }
  } else {
    const chunks = [];
    await new Promise(resolve => { process.stdin.on('data', d => chunks.push(d)); process.stdin.on('end', resolve); });
    try {
      input = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      const err = { softill: 'schema-validator', result: 'ERROR', summary: `Parse stdin: ${e.message}`, errors: [], targetFile: null, schema: null };
      console.error(formatHuman(err));
      console.error(JSON.stringify(err, null, 2));
      process.exit(1);
    }
  }

  const output = await handle(input);
  const fullOutput = Object.assign({ softill: 'schema-validator' }, output);
  // Strip internal _evidence from JSON output; keep in returned object
  const jsonOutput = { ...fullOutput };
  delete jsonOutput._evidence;

  console.log(formatHuman(output));
  console.log(JSON.stringify(jsonOutput, null, 2));
  process.exit(output.result === 'PASS' ? 0 : 1);
}

const cliPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (cliPath && cliPath === modulePath) cli();
