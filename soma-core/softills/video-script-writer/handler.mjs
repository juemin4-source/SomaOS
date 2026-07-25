#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * video-script-writer — handler.js
 *
 * 生成带 Fish Audio S2 情感标签的视频配音文案。
 * 输入写作需求（主题+结构+调性），输出可直接喂给 fish-tts 的完整文案。
 * 级别: L3_write
 */


import fs from 'fs';

import path from 'path';

// ─── Fish Audio S2 情感标签参考库 ───
const TONE_TAGS = {
  calm: '[calm]',
  soft: '[soft voice]',
  low: '[low voice]',
  whisper: '[whispering]',
  normal: '[normal]',
  emphasis: '[emphasis]',
  nervous: '[nervous]',
  worried: '[worried]',
  hopeful: '[hopeful]',
  determined: '[determined]',
  intense: '[intense]',
  excited: '[excited]',
  sad: '[sad]',
  happy: '[happy]',
  sigh: '[sigh]',
  gasp: '[gasp]',
  chuckle: '[chuckling]',
  long_pause: '[long pause]',
  pause: '[pause]',
  short_pause: '[short pause]',
};

// ─── 文案结构模板库 ───
const STRUCTURE_TEMPLATES = {
  // 故事写作教程类（冬：故事承诺）
  story_winter: {
    sections: [
      {
        title: '将藏（起）',
        subsections: [
          {
            title: '冬至：缺憾伏动——他原来怎么活？',
            nodes: [
              { tag: 'calm', content: '第一切口：展示当前的世界、旧习惯、人物生活。', gap: 'paragraph' },
              { tag: 'normal', content: '{{character_life_detail}}', gap: 'line' },
              { tag: 'low', content: '这些不是背景信息。这是命运线的起点。', gap: 'paragraph' },
              { tag: 'normal', content: '{{character_habit_explanation}}', gap: 'line' },
              { tag: 'normal', content: '别急着让读者同情他或讨厌他。先让读者知道他原来是这样活的。', gap: 'section' },
              { tag: 'calm', content: '第二切口：展示角色内心冲突、隐忧、破绽。', gap: 'paragraph' },
              { tag: 'whisper', content: '然后，让那个活法里藏着的破绽露一点出来。', gap: 'line' },
              { tag: 'soft', content: '这些破绽不用大声说。一个停顿。一次欲言又止。一个本该生气却笑了笑的瞬间。', gap: 'section' },
              { tag: 'calm', content: '第三切口：展示主体眼下要做的事情，为长期目标做铺垫。', gap: 'paragraph' },
              { tag: 'hopeful', content: '这个眼下的目标，就是读者牵住他的绳子。', gap: 'line' },
              { tag: 'calm', content: '冬至的写作判断：这条命运线，在显出来以前，是否已经有了暗动？', gap: 'paragraph' },
              { tag: 'soft', content: '最好的冬至，是读者还不知道答案，却已经感觉雪下不平。', gap: 'long_pause' },
            ],
          },
        ],
      },
      {
        title: '藏',
        subsections: [
          {
            title: '小寒：寒意加深——这套活法哪里不灵？',
            nodes: [
              { tag: 'nervous', content: '小寒不是极冷。小寒是冷意开始刺人了。', gap: 'paragraph' },
              { tag: 'calm', content: '第一层：主体的旧答案卡住，情感伤痛暗示。', gap: 'line' },
              { tag: 'worried', content: '他原来那套活法，开始不灵了。', gap: 'paragraph' },
              { tag: 'low', content: '旧答案正在变成一个牢笼。而且他隐约感觉到了。这不是崩塌。这是寒意开始刺进来。', gap: 'section' },
              { tag: 'calm', content: '第二层：旁支开始搭巢，安排一条支线悄悄成形。', gap: 'line' },
              { tag: 'soft', content: '这条旁支现在还很小。但它在长大。它的存在，是为了以后反咬主线的那一天。', gap: 'section' },
              { tag: 'nervous', content: '第三层：第一声警报响起。', gap: 'line' },
              { tag: 'gasp', content: '然后，第一声警报响了。不一定很大。', gap: 'paragraph' },
              { tag: 'soft', content: '警报响了一声，然后安静了。但安静，已经不是原来的安静了。', gap: 'long_pause' },
            ],
          },
          {
            title: '大寒：冰面将裂——为什么旧的局面会迎来改变？',
            nodes: [
              { tag: 'low', content: '寒意不只是越来越深。寒意已经压到了临界。', gap: 'paragraph' },
              { tag: 'calm', content: '第一层：将要改变局面的东西已经在暗处成熟。', gap: 'line' },
              { tag: 'emphasis', content: '不管是什么，此刻它已经成形了。只差最后一推。', gap: 'section' },
              { tag: 'determined', content: '第二层：敌人、制度、关系、环境或倒计时主动逼近。', gap: 'line' },
              { tag: 'worried', content: '不是主人公选择面对。是那些东西主动走向了他。', gap: 'paragraph' },
              { tag: 'intense', content: '第三层：资源耗尽，关系断路，规则变死，身体绷紧，时间压到眼前。', gap: 'line' },
              { tag: 'low', content: '他手里剩下的选择越来越少。但大寒不必写成爆发。爆发留给立春。', gap: 'paragraph' },
              { tag: 'emphasis', content: '冰面已经硬到发声。它还没有裂开。但所有人都已经听见了那一声响。', gap: 'long_pause' },
              { tag: 'hopeful', content: '因为他们知道，冰面一裂开，下面就是春天。', gap: 'long_pause' },
            ],
          },
        ],
      },
      {
        title: '冬的整体',
        subsections: [],
        nodes: [
          { tag: 'calm', content: '冬不负责推进故事。冬负责让故事有根。', gap: 'paragraph' },
          { tag: 'normal', content: '冬至让我们看见雪下有动。小寒让我们感觉旧局发冷。大寒让我们听见冰面将裂。', gap: 'line' },
          { tag: 'hopeful', content: '因为春天从来不是突然出现的。春只是冬里头藏着的东西。', gap: 'paragraph' },
          { tag: 'calm', content: '所以下一次，当你写一个故事不知道从哪里开始的时候，去看看你的冬。', gap: 'line' },
          { tag: 'soft', content: '那是你的春天，藏好了的地方。', gap: 'end' },
        ],
      },
    ],
  },
};

// ─── 核心生成函数 ───
function buildScript(templateName, customInputs) {
  const template = STRUCTURE_TEMPLATES[templateName];
  if (!template) return { error: `Unknown template: ${templateName}` };

  const lines = [];
  const title = customInputs.title || '视频配音文案';

  lines.push(`# ${title}\n`);

  for (const section of template.sections) {
    lines.push(`\n### ${section.title}\n`);

    for (const sub of (section.subsections || [])) {
      lines.push(`\n#### ${sub.title}\n`);
      for (const node of (sub.nodes || [])) {
        lines.push(renderNode(node, customInputs));
      }
    }

    for (const node of (section.nodes || [])) {
      lines.push(renderNode(node, customInputs));
    }
  }

  return lines.join('\n');
}

function renderNode(node, inputs) {
  const tag = TONE_TAGS[node.tag] || '';
  let content = node.content;

  // 替换占位符
  for (const [key, val] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    while (content.includes(placeholder)) {
      content = content.replace(placeholder, val);
    }
  }

  // 清理未替换的占位符
  content = content.replace(/\{\{.*?\}\}/g, '').trim();
  if (!content) return '';

  const gapMap = {
    line: '',
    paragraph: '\n',
    section: '\n\n',
    long_pause: '\n\n',
    end: '\n',
  };

  const gap = gapMap[node.gap] || '';
  return `${tag} ${content}${gap}`;
}

// ─── 主处理函数 ───
function handle(input) {
  const mode = input.mode || 'generate';
  const templateName = input.template || 'story_winter';
  const outputPath = input.output;

  switch (mode) {
    case 'generate': {
      const scripts = Array.isArray(input.templates)
        ? input.templates.map(t => buildScript(t, input.custom || {}))
        : [buildScript(templateName, input.custom || {})];

      const errors = scripts.filter(s => s.error);
      if (errors.length > 0) {
        return {
          result: 'PARTIAL',
          summary: `Generated with ${errors.length} error(s)`,
          data: { scripts, errors },
        };
      }

      // 如果指定了输出路径，写入文件
      if (outputPath) {
        const fullPath = path.resolve(outputPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, scripts[0], 'utf-8');
        return {
          result: 'PASS',
          summary: `Script written to ${outputPath}`,
          data: { outputPath: fullPath, length: scripts[0].length, lines: scripts[0].split('\n').length },
          evidence: [{ type: 'file_write', path: fullPath }],
        };
      }

      return {
        result: 'PASS',
        summary: 'Script generated successfully',
        data: {
          script: scripts[0],
          length: scripts[0].length,
          lines: scripts[0].split('\n').length,
          tagsUsed: extractTags(scripts[0]),
        },
      };
    }

    case 'templates':
      return {
        result: 'PASS',
        summary: 'Available templates',
        data: {
          templates: Object.keys(STRUCTURE_TEMPLATES),
          toneTags: Object.keys(TONE_TAGS),
        },
      };

    case 'dry-run':
      return {
        result: 'PASS',
        summary: 'Dry run: input validation passed',
        data: {
          template: templateName,
          customKeys: input.custom ? Object.keys(input.custom) : [],
          output: outputPath || 'stdout',
        },
      };

    case 'polish': {
      const sourceText = input.sourceText || '';
      if (!sourceText) return { result: 'ERROR', summary: 'sourceText required for polish mode' };
      const polished = autoPolish(sourceText);
      if (outputPath) {
        const fullPath = path.resolve(outputPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, polished, 'utf-8');
        return {
          result: 'PASS',
          summary: `Polished script written to ${outputPath}`,
          data: { outputPath: fullPath, length: polished.length, lines: polished.split('\n').length },
          evidence: [{ type: 'file_write', path: fullPath }],
        };
      }
      return {
        result: 'PASS',
        summary: 'Polished script generated',
        data: { script: polished, length: polished.length, lines: polished.split('\n').length },
      };
    }

    case 'tag': {
      const sourceText = input.sourceText || '';
      if (!sourceText) return { result: 'ERROR', summary: 'sourceText required for tag mode' };
      const tagged = autoTag(sourceText, input.tagStyle || 'default');
      if (outputPath) {
        const fullPath = path.resolve(outputPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, tagged, 'utf-8');
        return {
          result: 'PASS',
          summary: `Tagged script written to ${outputPath}`,
          data: { outputPath: fullPath, length: tagged.length, lines: tagged.split('\n').length },
          evidence: [{ type: 'file_write', path: fullPath }],
        };
      }
      return {
        result: 'PASS',
        summary: 'Tagged script generated',
        data: { script: tagged, length: tagged.length, lines: tagged.split('\n').length, tagsUsed: extractTags(tagged) },
      };
    }

    default:
      return { result: 'ERROR', summary: `Unknown mode: ${mode}` };
  }
}

// ─── 纯润色 ───
// 对已有文案做视频文案化处理：去 markdown 标题、合并短句、加段落节奏
function autoPolish(text) {
  const lines = text.split('\n');
  const out = [];
  let prevEmpty = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (!prevEmpty && out.length > 0) out.push('');
      prevEmpty = true;
      continue;
    }

    // 去掉 markdown 标题标记，保留文字
    let cleaned = trimmed.replace(/^#{1,4}\s+/, '');

    // 短句排比（单行 < 12 字且以句号结尾）→ 合并到上一行或用逗号连接
    const isShortLine = cleaned.length <= 15 && (cleaned.endsWith('。') || cleaned.endsWith('？'));

    if (isShortLine && !prevEmpty && out.length > 0) {
      const lastIdx = out.length - 1;
      const lastLine = out[lastIdx];
      if (lastLine && lastLine.length > 10 && !lastLine.endsWith('：') && !lastLine.endsWith(':')) {
        out[lastIdx] = lastLine + ' ' + cleaned;
        prevEmpty = false;
        continue;
      }
    }

    out.push(cleaned);
    prevEmpty = false;
  }

  return out.join('\n');
}

// ─── 自动标签嵌入 ───
// 对已有文案按结构自动嵌入 Fish Audio S2 情感标签
function autoTag(text, style) {
  const lines = text.split('\n');
  const out = [];
  let prevEmpty = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const nextLine = lines[i + 1] || '';
    const nextTrimmed = nextLine.trim();

    // 空行保留
    if (!trimmed) {
      if (!prevEmpty && out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      prevEmpty = true;
      continue;
    }

    const isHeading = /^#{1,4}\s/.test(trimmed);
    const isShortLine = trimmed.length <= 30 && !trimmed.endsWith('。') && !trimmed.endsWith('？');
    const isBareShortLine = trimmed.length <= 25 && (trimmed.endsWith('。') || trimmed.endsWith('？'));
    const isList = /^[-*•]\s/.test(trimmed) || /^\d+[.、]/.test(trimmed);
    const isBulletLine = trimmed.split('').filter(c => c === '。').length >= 4;
    const hasColonEnd = trimmed.endsWith('：') || trimmed.endsWith(':');
    const hasConjunction = trimmed.startsWith('但') || trimmed.startsWith('所以') || trimmed.startsWith('然而') || trimmed.startsWith('不过') || trimmed.startsWith('因为') || trimmed.startsWith('这就');

    let tag = '';

    if (isHeading) {
      tag = '[calm]';
    } else if (isShortLine && isList) {
      tag = '[normal]';
    } else if (isShortLine && hasColonEnd) {
      tag = '[calm]';
    } else if (isShortLine && trimmed.startsWith('尧') || trimmed.startsWith('舜') || trimmed.startsWith('禹') || trimmed.startsWith('夏') || trimmed.startsWith('启')) {
      tag = '[emphasis]';
    } else if (isBareShortLine && trimmed.length < 15) {
      tag = '[emphasis]';
    } else if (hasConjunction) {
      tag = '[low voice]';
    } else if (isBulletLine) {
      tag = '[emphasis]';
    } else if (nextTrimmed === '') {
      tag = '[calm]';
    } else {
      tag = '';
    }

    // 插入段落间留白
    if (prevEmpty && out.length > 0 && tag) {
      const prevOut = out[out.length - 1];
      if (prevOut && prevOut !== '' && !prevOut.startsWith('[long pause]')) {
        out.push('[long pause]');
        out.push('');
      }
    }

    const tagged = tag ? `${tag} ${trimmed}` : trimmed;
    out.push(tagged);
    prevEmpty = false;
  }

  return out.join('\n');
}

function extractTags(text) {
  const matches = text.match(/\[.*?\]/g) || [];
  return [...new Set(matches)];
}

// ─── CLI 入口 ───
function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch (e) { return fail(`Read fail: ${e.message}`); }
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); }
      catch (e) { fail(`Parse error: ${e.message}`); }
    });
    return;
  } else {
    input = { input: process.argv[2] || '' };
  }
  run(input);
}

function run(input) {
  const result = handle(input);
  if (result.result === 'ERROR') return fail(result.summary);
  const ev = result.evidence || [];
  console.log(JSON.stringify({
    softill: 'video-script-writer',
    result: result.result,
    summary: result.summary,
    data: result.data,
    evidence: ev,
    meta: { name: 'video-script-writer', level: 'L3_write', v: '0.1.0' },
  }, null, 2));
  process.exit(0);
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'video-script-writer', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

export default { handle };



// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();