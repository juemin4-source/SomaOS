#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * contract-compare — handler.js
 *
 * 结构化比较两个正式 Contract。
 * 读取两分 Contract → 解析结构化字段 → 逐字段比较 → 兼容性分类
 *
 * 世界读取委托给 filesystem.inspect Organ。
 * 兼容性判断方法存放于 skill.integration-design。
 *
 * 输入: {
 *   contractA: { name: string, content?: string, path?: string },
 *   contractB: { name: string, content?: string, path?: string },
 *   strict?: boolean,
 *   options?: { skipFields?: string[] }
 * }
 *
 * 输出: {
 *   result: 'PASS' | 'WARN' | 'FAIL',
 *   summary: string,
 *   data: {
 *     contractA: { name, version, status, fields, rules },
 *     contractB: { name, version, status, fields, rules },
 *     differences: [{
 *       field: string,
 *       category: 'breaking' | 'non-breaking' | 'unknown',
 *       type: 'added' | 'removed' | 'changed' | 'type_changed' | 'requiredness_changed',
 *       path: string[],
 *       before: any,
 *       after: any,
 *       rationale: string
 *     }],
 *     stats: { total, breaking, nonBreaking, unknown }
 *   }
 * }
 *
 * 用法: node handler.js <input-json>
 */


import fs from 'fs';

import path from 'path';

// ─── Main Entry ───────────────────────────────────────────────────────────────

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); } catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

// ─── Contract Parsing ──────────────────────────────────────────────────────────

/**
 * Parse a SomaOS contract markdown file into structured fields.
 * @param {string} content - Raw markdown content
 * @param {string} [sourceName] - Optional name for error messages
 * @returns {object} Parsed contract structure
 */
function parseContract(content, sourceName) {
  const contract = {
    name: sourceName || 'unknown',
    title: null,
    status: null,
    appliesTo: null,
    supersedes: null,
    sections: [],
    fields: [],
    rules: [],
    prohibitions: [],
    rawFrontmatter: {},
  };

  // Normalize line endings: CRLF → LF, and strip trailing \r
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '');
  const lines = content.split('\n');

  // 1. Extract title from H1
  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) {
      contract.title = titleMatch[1].trim();
      break;
    }
  }

  // 2. Extract frontmatter-like blockquote metadata (> Status: ..., > Applies to: ...)
  for (const line of lines) {
    const bqMatch = line.match(/^>\s*(\w[\w\s]+?):\s*(.+)$/);
    if (bqMatch) {
      const key = bqMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = bqMatch[2].trim();
      contract.rawFrontmatter[key] = value;

      if (key === 'status') contract.status = value;
      else if (key === 'applies_to') contract.appliesTo = value;
      else if (key === 'supersedes') contract.supersedes = value;
    }
  }

  // 3. Extract sections (## headings) and their content
  let currentSection = null;
  let currentSubsection = null;
  let currentBuffer = [];

  function flushSection() {
    if (currentSection && currentBuffer.length > 0) {
      const section = {
        title: currentSection,
        subsection: currentSubsection,
        content: currentBuffer.join('\n').trim(),
        rules: [],
        fields: [],
        prohibitions: [],
      };

      // Extract rules from this section (MUST / SHOULD / MAY statements)
      const ruleRegex = /[-*]\s*(.+?)\s*(MUST|SHOULD|MAY|REQUIRED|MUST NOT|SHOULD NOT)\b(.+?)(?=\n[-*]|\n##|\n$)/gs;
      let ruleMatch;
      while ((ruleMatch = ruleRegex.exec(section.content)) !== null) {
        section.rules.push({
          statement: (ruleMatch[1] + ruleMatch[3]).trim(),
          strength: ruleMatch[2],
        });
      }

      // Extract prohibited patterns
      if (/prohibited|❌|not allowed|must not/i.test(section.content)) {
        const prohibitionLines = section.content.split('\n')
          .filter(l => /❌|prohibited|not allowed|must not/i.test(l))
          .map(l => l.replace(/^[-*]\s*|###\s*/g, '').trim());
        section.prohibitions.push(...prohibitionLines);
      }

      // Extract interface/type fields from TypeScript blocks
      const tsBlocks = section.content.match(/```typescript\n([\s\S]*?)```/g);
      if (tsBlocks) {
        for (const block of tsBlocks) {
          const tsBody = block.replace(/```typescript\n?|\n?```/g, '');
          const interfaceFields = parseTypeScriptInterface(tsBody);
          section.fields.push(...interfaceFields);
        }
      }

      // Also extract JSON schema blocks
      const jsonBlocks = section.content.match(/```json\n([\s\S]*?)```/g);
      if (jsonBlocks) {
        for (const block of jsonBlocks) {
          const jsonBody = block.replace(/```json\n?|\n?```/g, '');
          try {
            const parsed = JSON.parse(jsonBody);
            const jsonFields = extractJsonFields(parsed, []);
            section.fields.push(...jsonFields);
          } catch {
            // Not valid JSON schema — skip
          }
        }
      }

      contract.sections.push(section);
      contract.fields.push(...section.fields);
      contract.rules.push(...section.rules);
      if (section.prohibitions.length > 0) {
        contract.prohibitions.push(...section.prohibitions);
      }
    }
    currentBuffer = [];
  }

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      flushSection();
      currentSection = sectionMatch[1].trim();
      currentSubsection = null;
      continue;
    }

    const subsectionMatch = line.match(/^###\s+(.+)$/);
    if (subsectionMatch) {
      flushSection();
      currentSubsection = subsectionMatch[1].trim();
      currentBuffer = [];
      continue;
    }

    if (currentSection) {
      currentBuffer.push(line);
    }
  }
  flushSection(); // last section

  // 4. Extract schema name from title (e.g. "Handler ABI v1" → name "Handler ABI", version "v1")
  if (contract.title) {
    const versionMatch = contract.title.match(/(.+?)\s+(v\d[\w.]*)$/);
    if (versionMatch) {
      contract.schemaName = versionMatch[1].trim();
      contract.version = versionMatch[2];
    }
  }

  return contract;
}

/**
 * Parse TypeScript interface definition into field descriptors.
 * @param {string} tsBody - TypeScript interface body
 * @returns {Array} Fields with name, type, required, description
 */
function parseTypeScriptInterface(tsBody) {
  const fields = [];
  const fieldRegex = /^\s+(\w[\w?]*)\??:\s*(.+?)(?=;|$)/gm;
  let match;

  // Remove interface wrapper
  const body = tsBody.replace(/^(interface|type)\s+\w+[\s\S]*?{/, '').replace(/}\s*$/, '');

  while ((match = fieldRegex.exec(body)) !== null) {
    const fieldName = match[1].replace('?', '');
    const rawType = match[2].trim().replace(/\/\/.*$/, '').trim();
    const isOptional = match[1].includes('?');

    // Extract JSDoc/comment above the field
    const linesBefore = body.slice(0, match.index).split('\n');
    let description = '';
    for (let i = linesBefore.length - 1; i >= 0; i--) {
      const commentMatch = linesBefore[i].match(/\/\/\s*(.+)$/);
      if (commentMatch) {
        description = commentMatch[1].trim();
        break;
      }
      if (!linesBefore[i].trim().startsWith('//') && linesBefore[i].trim() !== '') break;
    }

    // Parse union types
    const unionTypes = rawType.includes('|')
      ? rawType.split('|').map(t => t.trim()).filter(Boolean)
      : null;

    fields.push({
      name: fieldName,
      type: rawType,
      isOptional,
      isRequired: !isOptional,
      unionTypes,
      description,
    });
  }

  return fields;
}

/**
 * Extract field paths from a JSON schema object.
 * @param {object} obj - Parsed JSON
 * @param {string[]} pathPrefix - Current path prefix
 * @returns {Array} Fields with name, type, path
 */
function extractJsonFields(obj, pathPrefix) {
  const fields = [];
  if (!obj || typeof obj !== 'object') return fields;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...pathPrefix, key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      fields.push({ name: key, path: currentPath, type: 'object', isOptional: false });
      fields.push(...extractJsonFields(value, currentPath));
    } else if (Array.isArray(value)) {
      fields.push({ name: key, path: currentPath, type: 'array', isOptional: false });
      if (value.length > 0 && typeof value[0] === 'object') {
        fields.push(...extractJsonFields(value[0], [...currentPath, '[]']));
      }
    } else {
      fields.push({ name: key, path: currentPath, type: typeof value, isOptional: false });
    }
  }

  return fields;
}

// ─── Compatibility Classification ──────────────────────────────────────────────

/**
 * Compatibility judgement — this logic is documented in skill.integration-design.
 *
 * Classifies a single field-level difference between two contract versions.
 *
 * @param {object} before - Field in contract A (null if added)
 * @param {object} after - Field in contract B (null if removed)
 * @param {string} fieldPath - Dot-joined path to the field
 * @param {boolean} strict - If true, more changes are classified as breaking
 * @returns {object} { category: 'breaking' | 'non-breaking' | 'unknown', rationale: string }
 */
function classifyDifference(before, after, fieldPath, strict) {
  // Field removed from contract → Breaking (consumers may depend on it)
  if (before && !after) {
    return {
      category: 'breaking',
      type: 'removed',
      rationale: `Field '${fieldPath}' exists in contract A but not in B. Consumers depending on this field will break.`,
    };
  }

  // Field added to contract
  if (!before && after) {
    // Optional field added → Non-breaking
    if (after.isOptional) {
      return {
        category: 'non-breaking',
        type: 'added',
        rationale: `Optional field '${fieldPath}' added in contract B. Backward compatible.`,
      };
    }
    // Required field added → Breaking (existing consumers don't provide it)
    return {
      category: strict ? 'breaking' : 'non-breaking',
      type: 'added',
      rationale: strict
        ? `Required field '${fieldPath}' added in contract B. Existing consumers will not provide this field.`
        : `Required field '${fieldPath}' added in contract B. May break consumers that don't provide it.`,
    };
  }

  // Both exist — check for changes
  const changes = [];

  // Type changed
  if (before.type && after.type && before.type !== after.type) {
    // Type widening (adding union members) is non-breaking
    const isWidening = isTypeWidening(before.type, after.type);
    if (isWidening) {
      changes.push({
        category: 'non-breaking',
        type: 'type_widened',
        detail: `Type widened from '${before.type}' to '${after.type}'`,
      });
    } else {
      changes.push({
        category: 'breaking',
        type: 'type_changed',
        detail: `Type changed from '${before.type}' to '${after.type}'`,
      });
    }
  }

  // Requiredness changed (optional → required is breaking)
  if (before.isOptional !== after.isOptional) {
    if (before.isOptional && !after.isOptional) {
      changes.push({
        category: 'breaking',
        type: 'requiredness_changed',
        detail: `Field '${fieldPath}' changed from optional to required. Consumers not providing it will break.`,
      });
    } else if (!before.isOptional && after.isOptional) {
      changes.push({
        category: 'non-breaking',
        type: 'requiredness_changed',
        detail: `Field '${fieldPath}' changed from required to optional. Backward compatible.`,
      });
    }
  }

  // Description changed
  if (before.description !== after.description && before.description && after.description) {
    // Description changes are generally non-breaking unless they contradict the original
    changes.push({
      category: 'non-breaking',
      type: 'description_changed',
      detail: `Description for '${fieldPath}' changed.`,
    });
  }

  // Union types narrowed
  if (before.unionTypes && after.unionTypes) {
    const removedTypes = before.unionTypes.filter(t => !after.unionTypes.includes(t));
    if (removedTypes.length > 0) {
      changes.push({
        category: 'breaking',
        type: 'union_narrowed',
        detail: `Union type '${fieldPath}' narrowed: removed [${removedTypes.join(', ')}].`,
      });
    }
  }

  // No specific changes detected but before ≠ after
  if (changes.length === 0 && JSON.stringify(before) !== JSON.stringify(after)) {
    changes.push({
      category: 'unknown',
      type: 'changed',
      detail: `Field '${fieldPath}' changed but classification is unclear from structure alone.`,
    });
  }

  if (changes.length === 0) {
    return null; // No difference
  }

  // Aggregate: most severe category wins
  const hasBreaking = changes.some(c => c.category === 'breaking');
  const hasUnknown = changes.some(c => c.category === 'unknown');

  return {
    category: hasBreaking ? 'breaking' : hasUnknown ? 'unknown' : 'non-breaking',
    type: changes[0].type,
    changes,
    rationale: changes.map(c => c.detail).join(' '),
  };
}

/**
 * Check if a type change is a widening (safe) transformation.
 * @param {string} beforeType
 * @param {string} afterType
 * @returns {boolean}
 */
function isTypeWidening(beforeType, afterType) {
  // Normalize
  const b = beforeType.replace(/\s+/g, '');
  const a = afterType.replace(/\s+/g, '');

  // Literal → broader type
  const wideningPatterns = [
    [/^'[^']*'$/, 'string'],
    [/^\d+$/, 'number'],
    [/^true$|^false$/, 'boolean'],
  ];

  for (const [pattern, broader] of wideningPatterns) {
    if (pattern.test(b) && a === broader) return true;
  }

  // string → string | something is widening
  if (!a.includes('|') && b.includes('|')) return false; // narrowing
  if (a.includes('|') && !b.includes('|')) return true;  // widening

  // any → specific type is narrowing
  if (b === 'any' && a !== 'any') return false;

  return false;
}

/**
 * Compare two parsed contracts and produce a structured diff.
 * This function's judgement logic is extracted into skill.integration-design.
 *
 * @param {object} contractA - Parsed contract A
 * @param {object} contractB - Parsed contract B
 * @param {boolean} strict - Strict comparison mode
 * @returns {object} Structured comparison result
 */
function compareContracts(contractA, contractB, strict) {
  const differences = [];

  // 1. Compare top-level metadata
  const metaFields = ['title', 'status', 'version', 'appliesTo', 'supersedes'];
  for (const field of metaFields) {
    if (contractA[field] !== contractB[field]) {
      const diff = classifyDifference(
        { type: 'string', value: contractA[field] },
        { type: 'string', value: contractB[field] },
        field,
        strict
      );
      if (diff) {
        differences.push({
          field,
          category: diff.category,
          type: diff.type,
          path: [field],
          before: contractA[field],
          after: contractB[field],
          rationale: diff.rationale,
        });
      }
    }
  }

  // 2. Compare field definitions (by name)
  const fieldMapA = {};
  const fieldMapB = {};

  for (const f of contractA.fields) {
    const key = f.name;
    if (!fieldMapA[key]) fieldMapA[key] = [];
    fieldMapA[key].push(f);
  }
  for (const f of contractB.fields) {
    const key = f.name;
    if (!fieldMapB[key]) fieldMapB[key] = [];
    fieldMapB[key].push(f);
  }

  const allFieldNames = new Set([...Object.keys(fieldMapA), ...Object.keys(fieldMapB)]);

  for (const name of allFieldNames) {
    const fieldsA = fieldMapA[name] || [];
    const fieldsB = fieldMapB[name] || [];

    if (fieldsA.length === 0 && fieldsB.length > 0) {
      // Field only in B — added
      for (const fb of fieldsB) {
        const diff = classifyDifference(null, fb, name, strict);
        if (diff) {
          differences.push({
            field: name,
            category: diff.category,
            type: 'added',
            path: [name],
            before: null,
            after: { type: fb.type, isOptional: fb.isOptional, description: fb.description },
            rationale: diff.rationale,
          });
        }
      }
    } else if (fieldsA.length > 0 && fieldsB.length === 0) {
      // Field only in A — removed
      for (const fa of fieldsA) {
        const diff = classifyDifference(fa, null, name, strict);
        if (diff) {
          differences.push({
            field: name,
            category: diff.category,
            type: 'removed',
            path: [name],
            before: { type: fa.type, isOptional: fa.isOptional, description: fa.description },
            after: null,
            rationale: diff.rationale,
          });
        }
      }
    } else {
      // Field in both — pairwise compare
      const maxLen = Math.max(fieldsA.length, fieldsB.length);
      for (let i = 0; i < maxLen; i++) {
        if (!fieldsA[i]) {
          const diff = classifyDifference(null, fieldsB[i], `${name}[${i}]`, strict);
          if (diff) differences.push({ field: `${name}[${i}]`, category: diff.category, type: 'added', path: [name, `${i}`], before: null, after: { type: fieldsB[i].type, isOptional: fieldsB[i].isOptional, description: fieldsB[i].description }, rationale: diff.rationale });
        } else if (!fieldsB[i]) {
          const diff = classifyDifference(fieldsA[i], null, `${name}[${i}]`, strict);
          if (diff) differences.push({ field: `${name}[${i}]`, category: diff.category, type: 'removed', path: [name, `${i}`], before: { type: fieldsA[i].type, isOptional: fieldsA[i].isOptional, description: fieldsA[i].description }, after: null, rationale: diff.rationale });
        } else {
          const diff = classifyDifference(fieldsA[i], fieldsB[i], name, strict);
          if (diff) {
            differences.push({
              field: name,
              category: diff.category,
              type: diff.type,
              path: [name],
              before: { type: fieldsA[i].type, isOptional: fieldsA[i].isOptional, description: fieldsA[i].description },
              after: { type: fieldsB[i].type, isOptional: fieldsB[i].isOptional, description: fieldsB[i].description },
              rationale: diff.rationale,
              changes: diff.changes,
            });
          }
        }
      }
    }
  }

  // 3. Compare rules
  const ruleTextsA = new Set(contractA.rules.map(r => r.statement));
  const ruleTextsB = new Set(contractB.rules.map(r => r.statement));

  // Rules removed from A (present in A, absent in B)
  for (const ruleA of contractA.rules) {
    if (!ruleTextsB.has(ruleA.statement)) {
      differences.push({
        field: `rule: ${ruleA.statement.slice(0, 60)}`,
        category: ruleA.strength === 'MUST' || ruleA.strength === 'REQUIRED' || ruleA.strength === 'MUST NOT'
          ? 'breaking' : 'non-breaking',
        type: 'rule_removed',
        path: ['rules'],
        before: ruleA,
        after: null,
        rationale: `Rule "${ruleA.strength}: ${ruleA.statement.slice(0, 60)}" removed in contract B.`,
      });
    }
  }

  // Rules added in B (absent in A, present in B)
  for (const ruleB of contractB.rules) {
    if (!ruleTextsA.has(ruleB.statement)) {
      differences.push({
        field: `rule: ${ruleB.statement.slice(0, 60)}`,
        category: ruleB.strength === 'MUST' || ruleB.strength === 'REQUIRED' || ruleB.strength === 'MUST NOT'
          ? (strict ? 'breaking' : 'non-breaking')
          : 'non-breaking',
        type: 'rule_added',
        path: ['rules'],
        before: null,
        after: ruleB,
        rationale: `Rule "${ruleB.strength}: ${ruleB.statement.slice(0, 60)}" added in contract B.`,
      });
    }
  }

  // 4. Compare prohibitions
  const prohibA = new Set(contractA.prohibitions);
  const prohibB = new Set(contractB.prohibitions);

  for (const p of contractA.prohibitions) {
    if (!prohibB.has(p)) {
      differences.push({
        field: `prohibition: ${p.slice(0, 60)}`,
        category: 'non-breaking',
        type: 'prohibition_removed',
        path: ['prohibitions'],
        before: p,
        after: null,
        rationale: `Prohibition removed in contract B: "${p.slice(0, 60)}"`,
      });
    }
  }
  for (const p of contractB.prohibitions) {
    if (!prohibA.has(p)) {
      differences.push({
        field: `prohibition: ${p.slice(0, 60)}`,
        category: 'non-breaking',
        type: 'prohibition_added',
        path: ['prohibitions'],
        before: null,
        after: p,
        rationale: `Prohibition added in contract B: "${p.slice(0, 60)}"`,
      });
    }
  }

  return differences;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

function handle(input) {
  if (!input || !input.contractA || !input.contractB) {
    return out('ERROR', 'Need contractA and contractB (each with name, and content or path)');
  }

  const strict = input.strict !== false;
  const options = input.options || {};

  // Read contract content
  let contentA, contentB;

  // Use filesystem.inspect-style read via the Organ when content not provided inline
  // (The Organ passes pre-read content; standalone mode reads from disk)
  if (input.contractA.content) {
    contentA = input.contractA.content;
  } else if (input.contractA.path) {
    const resolvedPath = path.resolve(input.contractA.path);
    try {
      if (!fs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);
      const stat = fs.statSync(resolvedPath);
      if (stat.size > 10 * 1024 * 1024) throw new Error(`File too large (${stat.size} bytes) — exceeds 10MB limit`);
      contentA = fs.readFileSync(resolvedPath, 'utf-8');
    } catch (e) {
      return out('ERROR', `Failed to read contract A${input.contractA.name ? ` (${input.contractA.name})` : ''}: ${e.message}`);
    }
  } else {
    return out('ERROR', `contractA must provide 'content' or 'path'`);
  }

  if (input.contractB.content) {
    contentB = input.contractB.content;
  } else if (input.contractB.path) {
    const resolvedPath = path.resolve(input.contractB.path);
    try {
      if (!fs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);
      const stat = fs.statSync(resolvedPath);
      if (stat.size > 10 * 1024 * 1024) throw new Error(`File too large (${stat.size} bytes) — exceeds 10MB limit`);
      contentB = fs.readFileSync(resolvedPath, 'utf-8');
    } catch (e) {
      return out('ERROR', `Failed to read contract B${input.contractB.name ? ` (${input.contractB.name})` : ''}: ${e.message}`);
    }
  } else {
    return out('ERROR', `contractB must provide 'content' or 'path'`);
  }

  // Parse both contracts
  const contractA = parseContract(contentA, input.contractA.name || 'contractA');
  const contractB = parseContract(contentB, input.contractB.name || 'contractB');

  // Compare
  const differences = compareContracts(contractA, contractB, strict);

  // Filter skipped fields
  const skipFields = options.skipFields || [];
  const filtered = differences.filter(d => !skipFields.some(sf => d.field.startsWith(sf) || d.path.join('.').startsWith(sf)));

  // Aggregate stats
  const breaking = filtered.filter(d => d.category === 'breaking').length;
  const nonBreaking = filtered.filter(d => d.category === 'non-breaking').length;
  const unknown = filtered.filter(d => d.category === 'unknown').length;

  // Determine overall result
  let result = 'PASS';
  let summary = '';
  if (breaking > 0) {
    result = 'FAIL';
    summary = `FAIL: ${breaking} breaking change(s) detected (${nonBreaking} non-breaking, ${unknown} unknown)`;
  } else if (unknown > 0) {
    result = 'WARN';
    summary = `WARN: ${unknown} change(s) with unclear compatibility (${nonBreaking} non-breaking)`;
  } else if (nonBreaking > 0) {
    result = 'WARN';
    summary = `WARN: ${nonBreaking} non-breaking change(s) detected`;
  } else {
    summary = 'PASS: No differences detected';
  }

  return out(result, summary, {
    comparison: {
      contractA: {
        name: contractA.name,
        title: contractA.title,
        version: contractA.version,
        status: contractA.status,
        fieldCount: contractA.fields.length,
        ruleCount: contractA.rules.length,
        sectionCount: contractA.sections.length,
      },
      contractB: {
        name: contractB.name,
        title: contractB.title,
        version: contractB.version,
        status: contractB.status,
        fieldCount: contractB.fields.length,
        ruleCount: contractB.rules.length,
        sectionCount: contractB.sections.length,
      },
      changes: filtered,
      stats: {
        total: filtered.length,
        breaking,
        nonBreaking,
        unknown,
      },
      strict,
    },
  });
}

// ─── Output ────────────────────────────────────────────────────────────────────

function out(result, summary, data) {
  console.log(JSON.stringify({
    softill: 'contract-compare',
    result,
    summary,
    data: data || {},
    evidence: [
      {
        type: 'contract-comparison',
        timestamp: new Date().toISOString(),
        stats: data?.comparison?.stats || null,
      },
    ],
  }, null, 2));
  process.exit(result === 'ERROR' ? 1 : 0);
}

// ─── Exports (Handler ABI v1 compliant) ─────────────────────────────────────────

export default { handle, parseContract, compareContracts, classifyDifference, isTypeWidening };

// ─── Entry ─────────────────────────────────────────────────────────────────────



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();