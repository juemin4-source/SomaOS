#!/usr/bin/env node
/**
 * image-eye — handler.js
 *
 * 图片瑞士军刀：主题转换/OCR/压缩/超分/格式互转/背景移除。
 * Go 写的 gowall CLI 封装。
 *
 * 输入: { file, action: "convert"|"compress"|"bgremove"|"info", format?, quality? }
 * 输出: { file, action, result }
 *
 * 依赖: go install github.com/Achno/gowall@latest
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
  const file = input.file || input.image;
  const action = input.action || 'info';
  if (!file && action !== 'batch') return out('ERROR', 'file required');
  const fp = file ? path.resolve(file) : null;
  if (fp && !fs.existsSync(fp)) return out('ERROR', 'File not found: ' + fp);

  let ready = false;
  try { execSync('gowall --version 2>&1', { stdio: 'pipe', timeout: 3000 }); ready = true; }
  catch { try { execSync('go install github.com/Achno/gowall@latest 2>&1', { stdio: 'pipe', timeout: 120000 }); ready = true; } catch {} }
  if (!ready) return out('ERROR', 'gowall not available');

  try {
    let result;
    switch (action) {
      case 'convert': {
        const fmt = input.format || (input.theme ? 'theme' : 'png');
        const cmd = `gowall convert "${fp}"${fmt.startsWith('.') ? fmt : '.' + fmt}`;
        const raw = execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
        result = { action: 'convert', format: fmt, output: raw };
        break;
      }
      case 'compress': {
        const quality = input.quality || 80;
        const raw = execSync(`gowall compress "${fp}" --quality ${quality}`, { encoding: 'utf-8', timeout: 30000 }).trim();
        result = { action: 'compress', quality, output: raw };
        break;
      }
      case 'bgremove': {
        const raw = execSync(`gowall bgremove "${fp}"`, { encoding: 'utf-8', timeout: 60000 }).trim();
        result = { action: 'bgremove', output: raw };
        break;
      }
      case 'info': {
        const raw = execSync(`gowall info "${fp}"`, { encoding: 'utf-8', timeout: 10000 }).trim();
        result = { action: 'info', info: raw };
        break;
      }
      case 'batch': {
        const dir = input.directory || '.';
        const pattern = input.pattern || '*.png';
        const raw = execSync(`gowall batch "${dir}" --pattern "${pattern}"`, { encoding: 'utf-8', timeout: 60000 }).trim();
        result = { action: 'batch', directory: dir, pattern, output: raw };
        break;
      }
      default:
        return out('ERROR', 'Unknown action: ' + action);
    }
    return out('PASS', `${action} done`, { file: input.file, action, ...result });
  } catch (e) {
    return out('ERROR', e.message.slice(0, 200));
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'image-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
