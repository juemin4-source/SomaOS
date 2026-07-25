#!/usr/bin/env node
/**
 * capcut-draft — handler.js
 *
 * 从配音音频 + 字幕文案生成剪映草稿。
 * 依赖: npm install cutsdk
 * 输入: 音频文件路径 + 字幕时间轴 → 输出可被剪映打开的草稿文件夹
 *
 * 三种模式:
 *   voiceover  — 音频 + 字幕 → 配音轨 + 字幕轨
 *   slideshow  — 图片 + 音频 + 字幕 → 轮播视频
 *   spec       — 直接传 DraftSpec JSON → 完整草稿
 */

const fs = require('fs');
const path = require('path');

function handle(input) {
  const mode = input.mode || 'voiceover';
  const outputName = input.name || `draft-${Date.now().toString(36)}`;

  // 检查 cutsdk
  let cutsdk;
  try {
    cutsdk = require('cutsdk');
  } catch {
    return {
      result: 'BLOCKED',
      summary: '需要 cutsdk: cd 到项目根目录后执行 npm install cutsdk',
      data: { installHint: 'npm install cutsdk' },
    };
  }

  switch (mode) {
    case 'voiceover':
      return handleVoiceover(cutsdk, input, outputName);
    case 'slideshow':
      return handleSlideshow(cutsdk, input, outputName);
    case 'spec':
      return handleSpec(cutsdk, input, outputName);
    default:
      return { result: 'ERROR', summary: `Unknown mode: ${mode}` };
  }
}

// ─── voiceover 模式 ───
// 输入：音频文件 + 字幕列表（text + start + end），生成配音轨+字幕轨
async function handleVoiceover(cutsdk, input, outputName) {
  const audioPath = input.audio;
  const captions = input.captions || [];
  const bgImage = input.backgroundImage || input.bgImage;

  if (!audioPath) return { result: 'ERROR', summary: 'audio path required' };
  if (!fs.existsSync(audioPath)) return { result: 'ERROR', summary: `Audio file not found: ${audioPath}` };
  if (captions.length === 0) return { result: 'ERROR', summary: 'captions array required (at least 1)' };

  // 获取音频时长
  let audioDuration = input.audioDuration || 0;
  if (!audioDuration) {
    try {
      const dur = cutsdk.getAudioDuration && await cutsdk.getAudioDuration({ url: audioPath });
      audioDuration = dur?.duration || 0;
    } catch { /* fallback: 从最后一条字幕推算 */ }
  }

  const width = input.width || 1080;
  const height = input.height || 1920;
  const audioUrl = path.resolve(audioPath);
  const captionsDir = input.captionsDir || path.dirname(audioUrl);

  // 构建 DraftSpec
  const tracks = [];

  // 配音轨
  tracks.push({
    type: 'audio',
    clips: [{
      type: 'audio',
      src: audioUrl,
      start: 0,
      duration: audioDuration > 0 ? audioDuration : undefined,
      volume: 1,
    }],
  });

  // 字幕轨
  const captionClips = captions.map((c, i) => ({
    type: 'caption',
    text: c.text,
    start: c.start,
    end: c.end,
    fontSize: c.fontSize || input.fontSize || 8,
    position: c.position || 'bottom',
    style: c.style || input.captionStyle || 'default',
    keyword: c.keyword,
    keywordColor: c.keywordColor || '#FFD700',
    keywordFontSize: c.keywordFontSize || input.keywordFontSize || c.fontSize || input.fontSize || 8,
  }));

  tracks.push({
    type: 'text',
    clips: captionClips,
  });

  // 背景图片轨（可选）
  if (bgImage) {
    const bgPath = path.resolve(bgImage);
    if (!fs.existsSync(bgPath)) return { result: 'ERROR', summary: `Background image not found: ${bgPath}` };
    const totalDuration = audioDuration > 0 ? audioDuration : (captions.length > 0 ? Math.max(...captions.map(c => c.end)) : 10000);
    tracks.unshift({
      type: 'visual',
      clips: [{
        type: 'image',
        src: bgPath,
        start: 0,
        duration: totalDuration,
        fit: 'cover',
        animation: { loop: 'zoom-in', loopDuration: totalDuration },
      }],
    });
  }

  const spec = {
    version: '1.0',
    canvas: { width, height, fps: 30 },
    tracks,
  };

  return executeSpec(cutsdk, spec, outputName);
}

// ─── slideshow 模式 ───
// 输入：多张图片 + 音频 + 字幕，每张图片依次出现
async function handleSlideshow(cutsdk, input, outputName) {
  const images = input.images || [];
  const audioPath = input.audio;
  const captions = input.captions || [];

  if (images.length === 0) return { result: 'ERROR', summary: 'images array required' };
  if (!audioPath) return { result: 'ERROR', summary: 'audio path required' };
  if (!fs.existsSync(audioPath)) return { result: 'ERROR', summary: `Audio file not found: ${audioPath}` };
  if (captions.length === 0) return { result: 'ERROR', summary: 'captions array required' };

  const width = input.width || 1080;
  const height = input.height || 1920;
  const audioUrl = path.resolve(audioPath);

  // 将字幕平均分配到图片上
  const clipsPerImage = Math.ceil(captions.length / images.length);
  const imageDuration = input.imageDuration || 4000000; // 4s per image default (microseconds)

  const imageClips = images.map((imgUrl, i) => ({
    type: 'image',
    src: path.resolve(imgUrl),
    start: i * imageDuration,
    duration: imageDuration,
    fit: 'cover',
    transition: i > 0 ? { name: 'fade', duration: 500000 } : undefined,
  }));

  const tracks = [
    {
      type: 'visual',
      clips: imageClips,
    },
    {
      type: 'audio',
      clips: [{
        type: 'audio',
        src: audioUrl,
        start: 0,
        volume: 1,
      }],
    },
    {
      type: 'text',
      clips: captions.map(c => ({
        type: 'caption',
        text: c.text,
        start: c.start,
        end: c.end,
        fontSize: c.fontSize || input.fontSize || 8,
        position: c.position || 'bottom',
      })),
    },
  ];

  const spec = {
    version: '1.0',
    canvas: { width, height, fps: 30 },
    tracks,
  };

  return executeSpec(cutsdk, spec, outputName);
}

// ─── spec 模式 ───
// 直接传入 DraftSpec JSON
async function handleSpec(cutsdk, input, outputName) {
  const spec = input.spec;
  if (!spec) return { result: 'ERROR', summary: 'spec (DraftSpec JSON) required' };
  return executeSpec(cutsdk, spec, outputName);
}

// ─── 执行 DraftSpec → 生成剪映草稿 ───
async function executeSpec(cutsdk, spec, outputName) {
  try {
    const draftsDir = path.resolve(process.cwd(), 'output', 'capcut-drafts');
    if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

    const result = await cutsdk.createAndRenderDraft({
      draft: spec,
      output: {
        draftsDir,
        name: outputName,
      },
      render: false,
    });

    const draftPath = result?.draft?.filePath || result?.draft?.actualPath || '';
    const draftId = result?.draft?.draftId || '';

    return {
      result: 'PASS',
      summary: `Draft created: ${draftId}`,
      data: {
        draftId,
        filePath: draftPath,
        displayName: result?.draft?.displayName || outputName,
        clips: result?.draft?.clips || [],
        warnings: result?.draft?.warnings || [],
        trackCount: spec.tracks?.length || 0,
        openHint: `在剪映中打开: 将 "${draftPath}" 文件夹复制到剪映草稿目录`,
      },
      evidence: [
        { type: 'draft_created', path: draftPath, draftId },
      ],
    };
  } catch (err) {
    return {
      result: 'ERROR',
      summary: `Draft creation failed: ${err.message}`,
      data: { error: err.message, stack: err.stack },
    };
  }
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
  // 支持 async handle
  if (result && typeof result.then === 'function') {
    result.then(r => {
      const ev = r.evidence || [];
      console.log(JSON.stringify({
        softill: 'capcut-draft', result: r.result, summary: r.summary,
        data: r.data, evidence: ev,
        meta: { name: 'capcut-draft', level: 'L0_read_probe', v: '0.1.0' },
      }, null, 2));
      process.exit(r.result === 'ERROR' ? 1 : 0);
    }).catch(err => fail(err.message));
  } else {
    const ev = result.evidence || [];
    console.log(JSON.stringify({
      softill: 'capcut-draft', result: result.result, summary: result.summary,
      data: result.data, evidence: ev,
      meta: { name: 'capcut-draft', level: 'L0_read_probe', v: '0.1.0' },
    }, null, 2));
    process.exit(result.result === 'ERROR' ? 1 : 0);
  }
}

function fail(msg) {
  console.log(JSON.stringify({ softill: 'capcut-draft', result: 'ERROR', summary: msg, data: {}, evidence: [] }));
  process.exit(1);
}

module.exports = { handle };

if (require.main === module) main();
