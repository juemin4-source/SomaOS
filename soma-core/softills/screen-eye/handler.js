#!/usr/bin/env node
/**
 * screen-eye — handler.js
 *
 * 屏幕感知桌面自动化。基于 nut-js（Node.js 原生 SikuliX）。
 * 能看屏幕、找图、点击、输入——不需要坐标硬编码。
 *
 * 模式:
 *   screenshot      截屏 → 保存文件
 *   find            在屏幕上找图 → 返回坐标
 *   click-image     找图并点击
 *   click           x/y 坐标点击
 *   type            输入文字
 *   press           按键
 *   capture-region  截取指定区域
 *   screen-info     屏幕分辨率/颜色信息
 *
 * 用法: node handler.js <input-json> | cat input.json | node handler.js
 */

const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');

// ── Win32 API via koffi (fast, no PowerShell) ─────────────────────
let user32 = null;
try {
  const koffi = require('@nut-tree/nut-js/node_modules/koffi') || require('koffi');
  user32 = koffi.load('user32.dll');
} catch { try { user32 = require('../node_modules/koffi').load('user32.dll'); } catch {} }
const win32 = user32 ? {
  findWindow: user32.func('FindWindowA', 'int64', ['string', 'string']),
  showWindowAsync: user32.func('ShowWindowAsync', 'bool', ['int64', 'int']),
  isIconic: user32.func('IsIconic', 'bool', ['int64']),
  setForeground: user32.func('SetForegroundWindow', 'bool', ['int64']),
} : null;

async function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  await h(i);
}

async function h(input) {
  let nut;
  try { nut = require('@nut-tree/nut-js'); }
  catch (e) { return out('ERROR', 'nut-js not installed. Run: npm install @nut-tree/nut-js'); }

  const mode = input.mode || 'screenshot';
  const outputDir = path.resolve(input.outputDir || '.soma-screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    switch (mode) {
      case 'screenshot': {
        const filePath = path.join(outputDir, `screenshot_${Date.now()}.png`);
        const ps = `Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;$v=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $v.Width,$v.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($v.X,$v.Y,0,0,$v.Size);$bm.Save('${filePath.replace(/\\/g,'\\\\')}');$g.Dispose();$bm.Dispose()`;
        require('child_process').execSync('powershell -NoProfile -Command "'+ps+'"',{timeout:15000});
        return out('PASS', `Screenshot saved (${(fs.statSync(filePath).size/1024).toFixed(0)}KB)`, { file: filePath, size: fs.statSync(filePath).size, allMonitors: true });
      }

      case 'find': {
        if (!input.image) return out('ERROR', 'image path required');
        const img = path.resolve(input.image);
        if (!fs.existsSync(img)) return out('ERROR', `Image not found: ${img}`);
        const region = await nut.screen.find(nut.imageResource(img));
        return out('PASS', `Image found`, { x: region.x, y: region.y, width: region.width, height: region.height, center: { x: region.x + region.width / 2, y: region.y + region.height / 2 }, confidence: region.confidence });
      }

      case 'click-image': {
        if (!input.image) return out('ERROR', 'image path required');
        const imgPath = path.resolve(input.image);
        if (!fs.existsSync(imgPath)) return out('ERROR', `Image not found: ${imgPath}`);
        const region = await nut.screen.find(nut.imageResource(imgPath));
        await nut.mouse.move(nut.straightTo(nut.centerOf(region)));
        const btn = input.button === 'right' ? nut.Button.RIGHT : input.button === 'middle' ? nut.Button.MIDDLE : nut.Button.LEFT;
        await nut.mouse.click(btn);
        return out('PASS', `Clicked image`, { image: input.image, region, button: input.button || 'left' });
      }

      case 'click': {
        if (input.x === undefined) return out('ERROR', 'x required');
        if (input.y === undefined) return out('ERROR', 'y required');
        await nut.mouse.move(nut.straightTo(new nut.Point(input.x, input.y)));
        const btn = input.button === 'right' ? nut.Button.RIGHT : input.button === 'middle' ? nut.Button.MIDDLE : nut.Button.LEFT;
        await nut.mouse.click(btn);
        return out('PASS', `Clicked (${input.x}, ${input.y})`, { x: input.x, y: input.y, button: input.button || 'left' });
      }

      case 'type': {
        if (!input.text) return out('ERROR', 'text required');
        await nut.keyboard.type(input.text);
        return out('PASS', `Typed text`, { textLength: input.text.length, preview: input.text.slice(0, 100) });
      }

      case 'press': {
        if (!input.key) return out('ERROR', 'key required');
        const keyMap = { 'enter': nut.Key.Enter, 'tab': nut.Key.Tab, 'escape': nut.Key.Escape, 'space': nut.Key.Space, 'backspace': nut.Key.Backspace, 'delete': nut.Key.Delete, 'up': nut.Key.Up, 'down': nut.Key.Down, 'left': nut.Key.Left, 'right': nut.Key.Right, 'home': nut.Key.Home, 'end': nut.Key.End, 'f1': nut.Key.F1, 'f2': nut.Key.F2, 'f3': nut.Key.F3, 'f5': nut.Key.F5, 'ctrl': nut.Key.LeftControl, 'alt': nut.Key.LeftAlt, 'shift': nut.Key.LeftShift, 'win': nut.Key.LeftSuper, 'cmd': nut.Key.LeftSuper, 'a': nut.Key.A, 'c': nut.Key.C, 'v': nut.Key.V, 'x': nut.Key.X, 'z': nut.Key.Z, 's': nut.Key.S, 'l': nut.Key.L, 'n': nut.Key.N, 't': nut.Key.T, 'w': nut.Key.W, 'r': nut.Key.R, 'p': nut.Key.P, '1': nut.Key.Num1, '2': nut.Key.Num2, '3': nut.Key.Num3, '4': nut.Key.Num4, '5': nut.Key.Num5 };
        const k = keyMap[input.key.toLowerCase()] || input.key;
        if (input.modifier) {
          const modKey = keyMap[input.modifier.toLowerCase()];
          if (modKey) { await nut.keyboard.pressKey(modKey); await nut.keyboard.pressKey(k); await nut.keyboard.releaseKey(k); await nut.keyboard.releaseKey(modKey); }
        } else {
          await nut.keyboard.pressKey(k); await nut.keyboard.releaseKey(k);
        }
        return out('PASS', `Pressed: ${input.key}${input.modifier ? ' (modifier: ' + input.modifier + ')' : ''}`, { key: input.key, modifier: input.modifier });
      }

      case 'capture-region': {
        if (input.x === undefined || input.y === undefined || input.width === undefined || input.height === undefined) return out('ERROR', 'x, y, width, height required');
        const region = new nut.Region(input.x, input.y, input.width, input.height);
        const screenshot = await nut.screen.capture(region);
        const filePath = path.join(outputDir, `region_${Date.now()}.png`);
        await screenshot.save(filePath);
        return out('PASS', `Region captured`, { file: filePath, region: { x: input.x, y: input.y, width: input.width, height: input.height } });
      }

      case 'screen-info': {
        if (win32) {
          // koffi-based (~0ms, no PowerShell)
          try {
            const GetSystemMetrics = user32.func('GetSystemMetrics', 'int', ['int']);
            const count = GetSystemMetrics(80); // SM_CMONITORS
            const virtualW = GetSystemMetrics(78); // SM_VIRTUALSCREEN_WIDTH
            const virtualH = GetSystemMetrics(79); // SM_VIRTUALSCREEN_HEIGHT
            const primaryW = GetSystemMetrics(0); // SM_CXSCREEN
            const primaryH = GetSystemMetrics(1); // SM_CYSCREEN
            return out('PASS', `${count} monitors, virtual ${virtualW}x${virtualH}`, { monitorCount: count, virtualWidth: virtualW, virtualHeight: virtualH, primaryWidth: primaryW, primaryHeight: primaryH });
          } catch {
            // Fallback to PowerShell
          }
        }
        const scriptPath = path.resolve(__dirname, '..', '..', '..', '.soma-screenshots', 'screen-info.ps1');
        const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {encoding:'utf-8',timeout:5000});
        const screens = JSON.parse(raw.trim());
        const summary = screens.map(s => `${s.primary?'★':''}${s.width}x${s.height}@(${s.x},${s.y})`).join(' | ');
        return out('PASS', `${screens.length} monitors: ${summary}`, { monitors: screens, totalWidth: screens.reduce((t,s)=>Math.max(t,s.x+s.width),0), totalHeight: screens.reduce((t,s)=>Math.max(t,s.y+s.height),0) });
      }

      default:
        return out('ERROR', `Unknown mode: ${mode}`);
    }
  } catch (e) {
    return out('ERROR', `${mode} failed: ${e.message}`);
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'screen-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
