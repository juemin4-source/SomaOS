#!/usr/bin/env node
/**
 * ocr-adapter — handler.js
 *
 * 屏幕文字识别。给 screen-eye 加上"读"的能力。
 * 支持 ddddocr（轻量）/ Tesseract / PaddleOCR。
 *
 * 输入: { image: "path.png", mode: "screen" | "file", lang: "chi_sim+en" }
 *   不传 image 时自动截屏识别
 * 输出: { text: "识别的文字", blocks: [{ text, x, y, confidence }] }
 *
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const lang = input.lang || 'chi_sim+en';

  // 1. Get image path
  let imagePath = input.image;
  if (!imagePath || input.mode === 'screen') {
    // Auto screenshot
    const ssDir = path.resolve(input.outputDir || '.soma-screenshots');
    if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
    imagePath = path.join(ssDir, `ocr_${Date.now()}.png`);
    const ps = `Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;$v=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $v.Width,$v.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($v.X,$v.Y,0,0,$v.Size);$bm.Save('${imagePath.replace(/\\/g, '\\\\')}');$g.Dispose();$bm.Dispose()`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 15000 });
  } else {
    imagePath = path.resolve(imagePath);
  }

  if (!fs.existsSync(imagePath)) return out('ERROR', `Image not found: ${imagePath}`);

  // 2. Try OCR engines
  const engines = [
    { name: 'ddddocr', check: 'python -c "import ddddocr; print(1)" 2>&1', cmd: (img) => `python -c "import ddddocr,sys,json;ocr=ddddocr.DdddOcr();with open('${img.replace(/\\/g, '\\\\')}','rb') as f:r=ocr.classification(f.read());print(json.dumps({'text':r}))"` },
    { name: 'tesseract', check: 'tesseract --version 2>&1', cmd: (img) => `tesseract "${img}" stdout -l ${lang} 2>&1` },
    { name: 'paddleocr', check: 'python -c "from paddleocr import PaddleOCR;print(1)" 2>&1', cmd: (img) => `python -c "from paddleocr import PaddleOCR;ocr=PaddleOCR(use_angle_cls=True,lang='${lang.split('+')[0]}');r=ocr.ocr('${img.replace(/\\/g, '\\\\')}');print(r)"` },
  ];

  for (const engine of engines) {
    try {
      execSync(engine.check, { stdio: 'pipe', timeout: 5000 });
      const raw = execSync(engine.cmd(imagePath), { encoding: 'utf-8', timeout: 60000 }).trim();
      let text = raw;
      // Try to parse JSON if from ddddocr/paddleocr
      try {
        const json = JSON.parse(raw);
        text = json.text || json.map?.(b => b[1]?.[0]?.[0])?.join('\n') || raw;
      } catch {}

      return out('PASS', `${engine.name}: ${text.slice(0, 100)}`, { engine: engine.name, text: text.slice(0, 5000), textLength: text.length, image: imagePath, lang });
    } catch {}
  }

  return out('ERROR', 'No OCR engine available. Install: pip install ddddocr, or install Tesseract');
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'ocr-adapter', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
