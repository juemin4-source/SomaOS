#!/usr/bin/env node
/**
 * design-eye — handler.js
 *
 * 设计参考图分析器。用本地 Ollama 视觉模型看图，提取设计 token。
 * 不依赖任何云端 API，不花钱，不联网。
 *
 * 输入: { file, model?, prompt?, output? }
 * 输出: { palette, analysis, css?, suggestions }
 *
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path'); const http = require('http');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

async function h(input) {
  const file = input.file || input.image || input.path;
  if (!file) return out('ERROR', 'file required');
  const fp = path.resolve(file);
  if (!fs.existsSync(fp)) return out('ERROR', 'File not found: ' + fp);

  const model = input.model || 'llama3.2-vision';
  const ollamaHost = input.host || '127.0.0.1';
  const ollamaPort = input.port || 11434;
  const base64 = fs.readFileSync(fp).toString('base64');

  const prompt = input.prompt || `You are a UI design analyzer. Analyze this image and extract:
1. Primary colors (6 main colors with hex codes)
2. Overall style (minimal/flat/glass/neumorphic/etc)
3. Typography suggestions (font categories)
4. Design tokens as CSS :root variables

Output format: JSON only, no markdown. Use format:
{"colors":[{"name":"...","hex":"#...","role":"primary/background/accent/text"}],"style":"...","css":":root {...}"}`;

  try {
    // Try Ollama API
    const analysis = await callOllama(ollamaHost, ollamaPort, model, prompt, base64);

    // Also run img-view for local color extraction
    let palette = [];
    try {
      const colorthief = require('../node_modules/colorthief');
      const ctColors = await colorthief.getPalette(fp, 6);
      palette = ctColors.map(c => {
        const r = c._r || c[0], g = c._g || c[1], b = c._b || c[2];
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
      });
    } catch {}

    const result = typeof analysis === 'string' ? { rawResponse: analysis } : analysis;

    // If Ollama returned valid JSON, merge with local palette
    if (result.css && !result.colors && palette.length > 0) {
      result._localPalette = palette;
    }

    return out('PASS', `Design analyzed via ${model}`, {
      model, sourceFile: path.basename(fp),
      analysis: result,
      localPalette: palette,
    });
  } catch (e) {
    return out('ERROR', e.message.slice(0, 300));
  }
}

function callOllama(host, port, model, prompt, base64) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model,
      prompt,
      images: [base64],
      stream: false,
      options: { temperature: 0.1, num_predict: 2048 },
    });

    const req = http.request({
      hostname: host, port, path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const response = json.response || '';
          // Try to extract JSON from response
          const jm = response.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jm) { try { resolve(JSON.parse(jm[1].trim())); return; } catch {} }
          try { resolve(JSON.parse(response)); return; } catch {}
          resolve(response);
        } catch (e) { reject(new Error('Ollama parse error: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', e => reject(new Error('Ollama connection failed. Is it running?')));
    req.write(data);
    req.end();
  });
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'design-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
