#!/usr/bin/env node

/**
 * template-fill — handler.js
 *
 * 根据模板和变量生成固定结构文件，减少 AI 在重复样板代码上的 token。
 *
 * 用法：
 *   node handler.js <input-json-path>
 */

const fs = require('fs');
const path = require('path');
const { validate } = require('./src/validate-input');
const { loadTemplate } = require('./src/load-template');
const { render } = require('./src/render-template');
const { check } = require('./src/safe-output');
const { formatHuman } = require('./src/format-report');

function main() {
  let input;
  const p = process.argv[2];
  if (p && p !== '--') {
    try { input = JSON.parse(fs.readFileSync(path.resolve(p), 'utf-8')); }
    catch (e) { console.error('Failed to read input:', e.message); process.exit(1); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); processInput(input); }
      catch (e) { console.error('Invalid JSON on stdin'); process.exit(1); }
    });
    return;
  }
  processInput(input);
}

function processInput(input) {

  // 1. Validate input
  const validation = validate(input);
  if (!validation.valid) {
    const result = { result: 'BLOCKED', reason: validation.errors.join('; '), template: input.template || '', outputPath: input.outputPath || '', missingVariables: [], renderedContent: '', summary: 'Validation failed.' };
    console.log(formatHuman(result));
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  // 2. Load template
  const templateContent = loadTemplate(input.template);
  if (!templateContent) {
    const result = { result: 'BLOCKED', reason: `Template not found: ${input.template}`, template: input.template, outputPath: input.outputPath, missingVariables: [], renderedContent: '', summary: 'Template not found.' };
    console.log(formatHuman(result));
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  // 3. Render
  const { rendered, missing } = render(templateContent, input.variables);
  if (rendered === null) {
    const result = { result: 'BLOCKED', reason: 'Missing template variables.', template: input.template, outputPath: input.outputPath, missingVariables: missing, renderedContent: '', summary: 'Template rendering failed due to missing variables.' };
    console.log(formatHuman(result));
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  // 4. Preview mode
  if (input.mode === 'preview') {
    const result = { result: 'PREVIEW', template: input.template, outputPath: input.outputPath, missingVariables: [], renderedContent: rendered, summary: 'Preview generated successfully.' };
    console.log(formatHuman(result));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 5. Write mode — safety check
  const allowOverwrite = input.allowOverwrite === true;
  const safety = check(input.outputPath, allowOverwrite);
  if (!safety.safe) {
    const result = { result: 'BLOCKED', reason: safety.errors.join('; '), template: input.template, outputPath: input.outputPath, missingVariables: [], renderedContent: rendered, summary: 'Safety check failed.' };
    console.log(formatHuman(result));
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  // 6. Write file
  const resolvedPath = path.resolve(input.outputPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existed = fs.existsSync(resolvedPath);
  fs.writeFileSync(resolvedPath, rendered, 'utf-8');

  const result = { result: 'WRITTEN', template: input.template, outputPath: input.outputPath, overwritten: existed, missingVariables: [], renderedContent: rendered.slice(0, 200), summary: `Rendered ${input.template} to ${input.outputPath}.` };
  console.log(formatHuman(result));
  console.log(JSON.stringify(result, null, 2));
}

main();
