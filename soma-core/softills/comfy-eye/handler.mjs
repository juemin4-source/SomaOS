#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * comfy-eye — handler.js
 *
 * ComfyUI 图像生成引擎。本地 Stable Diffusion/FLUX/SDXL，原地出图。
 *
 * 模式:
 *   txt2img     文字→图片
 *   img2img     图→图（改色/重绘/扩图）
 *   workflow    自定义 workflow JSON
 *   models      列出可用模型
 *   upscale     放大图片
 *
 * 输入: { mode, prompt, model?, steps?, size?, batch?, workflow?, image?, ... }
 * 输出: { images: [{file, data}], workflow, duration }
 *
 * 用法: node handler.js <input-json>
 */


import fs from 'fs'; 
import path from 'path'; 
import http from 'http';

const require = createRequire(import.meta.url);
const COMFY_HOST = '127.0.0.1'; const COMFY_PORT = 8188;

// ─── Workflow 模板库 ─────────────────────────────────────────────
const TPL = {
  'sdxl-txt2img': (p, n, steps, w, h) => ({
    "3": { class_type: "KSampler", inputs: { seed: rng(), steps, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.model || 'sd_xl_base.safetensors' } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: w || 1024, height: h || 1024, batch_size: p.batch || 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: n || 'text, watermark, ugly, blurry', clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "comfy_", images: ["8", 0] } },
  }),

  'sdxl-img2img': (p, n, steps, imgB64) => ({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.model || 'sd_xl_base.safetensors' } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: n || 'text, watermark, ugly', clip: ["1", 1] } },
    "4": { class_type: "KSampler", inputs: { seed: rng(), steps: steps || 30, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: p.denoise || 0.7, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["5", 0] } },
    "5": { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["1", 2] } },
    "6": { class_type: "LoadImage", inputs: { image: imgB64 } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { filename_prefix: "comfy_i2i_", images: ["7", 0] } },
  }),

  'flux-txt2img': (p, n, steps, w, h) => ({
    "1": { class_type: "UNETLoader", inputs: { unet_name: p.model || 'flux1-dev.sft', weight_dtype: "fp8_e4m3fn" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["3", 0] } },
    "3": { class_type: "DualCLIPLoader", inputs: { clip_name1: "t5xxl_fp8_e4m3fn.sft", clip_name2: "clip_l.safetensors", type: "flux" } },
    "4": { class_type: "EmptySD3LatentImage", inputs: { width: w || 1024, height: h || 1024, batch_size: 1 } },
    "5": { class_type: "FluxGuidance", inputs: { guidance: p.guidance || 3.5, conditioning: ["2", 0] } },
    "6": { class_type: "KSampler", inputs: { seed: rng(), steps: steps || 20, cfg: 1, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["1", 0], positive: ["5", 0], negative: ["2", 0], latent_image: ["4", 0] } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["8", 0] } },
    "8": { class_type: "VAELoader", inputs: { vae_name: "ae.sft" } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "comfy_flux_", images: ["7", 0] } },
  }),

  'upscale': (imgB64) => ({
    "1": { class_type: "LoadImage", inputs: { image: imgB64 } },
    "2": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["3", 0], image: ["1", 0] } },
    "3": { class_type: "UpscaleModelLoader", inputs: { model_name: "4x-UltraSharp.pth" } },
    "4": { class_type: "SaveImage", inputs: { filename_prefix: "comfy_upscale_", images: ["2", 0] } },
  }),
};

function rng() { return Math.floor(Math.random() * 9999999999); }

// ─── 主入口 ──────────────────────────────────────────────────────
function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

async function h(input) {
  const mode = input.mode || 'txt2img';
  const prompt = input.prompt || input.text || '';

  // ── models 模式 ────────────────────────────────────────────────
  if (mode === 'models') {
    try {
      const obj = await comfyFetch('/object_info/CheckpointLoaderSimple', 'GET');
      const models = obj?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      return out('PASS', `${models.length} models available`, { models: models.slice(0, 50), total: models.length });
    } catch (e) {
      return out('ERROR', `ComfyUI not reachable at ${COMFY_HOST}:${COMFY_PORT}`);
    }
  }

  // ── 构建 workflow ──────────────────────────────────────────────
  let workflow;
  if (input.workflow) { workflow = input.workflow; }
  else {
    const neg = input.negative || 'text, watermark, ugly, blurry, distorted';
    const steps = input.steps || 25;
    const w = input.width || (prompt.includes('壁纸') || prompt.includes('wallpaper') ? 1920 : 1024);
    const h = input.height || (prompt.includes('壁纸') || prompt.includes('wallpaper') ? 1080 : 1024);
    const modelType = input.modelType || (input.model?.includes('flux') ? 'flux' : 'sdxl');

    if (mode === 'txt2img') {
      const tplName = modelType === 'flux' ? 'flux-txt2img' : 'sdxl-txt2img';
      workflow = TPL[tplName]({ ...input, prompt, model: input.model }, neg, steps, w, h);
    } else if (mode === 'img2img') {
      if (!input.image) return out('ERROR', 'image required for img2img');
      const imgB64 = fs.readFileSync(path.resolve(input.image)).toString('base64');
      workflow = TPL['sdxl-img2img']({ ...input, prompt, model: input.model }, neg, steps, imgB64);
    } else if (mode === 'upscale') {
      if (!input.image) return out('ERROR', 'image required for upscale');
      const imgB64 = fs.readFileSync(path.resolve(input.image)).toString('base64');
      workflow = TPL['upscale'](imgB64);
    } else if (mode === 'workflow') {
      if (!input.workflow_json) return out('ERROR', 'workflow_json required');
      workflow = typeof input.workflow_json === 'string' ? JSON.parse(input.workflow_json) : input.workflow_json;
    } else {
      return out('ERROR', `Unknown mode: ${mode}`);
    }
  }

  // ── 发送到 ComfyUI ────────────────────────────────────────────
  let promptId;
  try { promptId = await comfyFetch('/prompt', 'POST', { prompt: workflow }); }
  catch (e) { return out('ERROR', `ComfyUI not reachable at ${COMFY_HOST}:${COMFY_PORT}. Is it running?`); }

  if (!promptId?.prompt_id) return out('ERROR', 'ComfyUI did not return a prompt_id');

  // ── 轮询结果 ──────────────────────────────────────────────────
  const outputDir = path.resolve(input.outputDir || '.soma-screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  let result;
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    const history = await comfyFetch(`/history/${promptId.prompt_id}`, 'GET');
    if (history?.[promptId.prompt_id]) { result = history[promptId.prompt_id]; break; }
  }

  if (!result) return out('ERROR', 'ComfyUI generation timed out (3min)');

  // ── 收集图片 ──────────────────────────────────────────────────
  const images = [];
  const comfyOut = path.join(process.env.COMFYUI_OUTPUT || path.join(require('os').homedir(), 'ComfyUI', 'output'));
  const outputs = result.outputs || {};

  for (const nodeOutput of Object.values(outputs)) {
    for (const img of (nodeOutput.images || [])) {
      const src = path.join(comfyOut, img.subfolder || '', img.filename || '');
      const dst = path.join(outputDir, `${img.filename || 'comfy_' + Date.now()}.png`);
      try {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          const b64 = fs.readFileSync(dst).toString('base64');
          images.push({ file: img.filename, path: dst, sizeKB: Math.round(fs.statSync(dst).size / 1024), data: `data:image/png;base64,${b64}` });
        }
      } catch {}
    }
  }

  const duration = Date.now() - result?.timestamp || 0;

  return out('PASS', `✨ ${images.length} image(s) in ${(duration / 1000).toFixed(0)}s`, {
    mode: mode || 'workflow',
    images,
    count: images.length,
    duration: (duration / 1000).toFixed(1) + 's',
    prompt: prompt.slice(0, 200),
    model: input.model || 'default',
    prompt_id: promptId.prompt_id,
  });
}

// ─── HTTP 客户端 ──────────────────────────────────────────────────
function comfyFetch(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const opts = { hostname: COMFY_HOST, port: COMFY_PORT, path: endpoint, method: method || 'POST', headers: {} };
    if (b) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(b); }
    const req = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', e => reject(new Error(`${COMFY_HOST}:${COMFY_PORT} - ${e.message}`)));
    if (b) req.write(b);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function out(r, s, d) { console.log(JSON.stringify({ softill: 'comfy-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();