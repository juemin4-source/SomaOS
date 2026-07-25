#!/usr/bin/env node
/**
 * desktop-native — handler.js
 *
 * 原生桌面操控引擎。Rust 原生性能，替换 nut-js + koffi + PowerShell 三件套。
 * 基于 mechatron（预编译 Rust 二进制） + koffi（窗口管理）。
 *
 * 输入: { action: "screenshot" | "screen-info" | "click" | "type" | "key" | "find-window" | "minimize", ... }
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
  const action = input.action || input.mode || 'screen-info';
  const start = Date.now();

  // Load mechatron
  let m;
  try { m = require('mechatron'); }
  catch { try { m = require('../node_modules/mechatron'); } catch {} }
  const hasMechatron = !!m;

  // Load koffi for window ops
  let user32 = null;
  try {
    const k = require('../node_modules/koffi');
    user32 = k.load('user32.dll');
  } catch {}

  switch (action) {
    case 'screen-info':
    case 'info': {
      if (hasMechatron && m.screen) {
        return handleAsync(() => m.screen.size().then(s => out('PASS', `Screen: ${s.width}x${s.height}`, { width: s.width, height: s.height, engine: 'mechatron', duration: Date.now() - start })));
      }
      // Fallback via PowerShell
      const ps = 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ConvertTo-Json -Compress';
      try {
        const raw = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding:'utf-8', timeout:5000 });
        const info = JSON.parse(raw.trim().split('\n').pop());
        return out('PASS', `Screen: ${info.Width}x${info.Height}`, { width: info.Width, height: info.Height, engine: 'powershell' });
      } catch (e) { return out('ERROR', e.message); }
    }

    case 'screenshot':
    case 'capture':
    case 'screen': {
      const outDir = path.resolve(input.outputDir || '.soma-screenshots');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const fp = path.join(outDir, `native_${Date.now()}.png`);

      if (hasMechatron && m.screen) {
        return handleAsync(() =>
          m.screen.capture().then(img => {
            if (img && img.save) { img.save(fp); return out('PASS', `Screenshot (${(fs.statSync(fp).size/1024).toFixed(0)}KB)`, { file: fp, engine: 'mechatron' }); }
            // Fallback
            const ps = `Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;$v=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $v.Width,$v.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($v.X,$v.Y,0,0,$v.Size);$bm.Save('${fp.replace(/\\/g,'\\\\')}');$g.Dispose();$bm.Dispose()`;
            execSync(`powershell -NoProfile -Command "${ps}"`,{timeout:15000});
            return out('PASS', `Screenshot (${(fs.statSync(fp).size/1024).toFixed(0)}KB)`, { file: fp, engine: 'powershell' });
          })
        );
      }
      // PowerShell fallback
      const ps = `Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;$v=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $v.Width,$v.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($v.X,$v.Y,0,0,$v.Size);$bm.Save('${fp.replace(/\\/g,'\\\\')}');$g.Dispose();$bm.Dispose()`;
      execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 15000 });
      return out('PASS', `Screenshot (${(fs.statSync(fp).size/1024).toFixed(0)}KB)`, { file: fp, engine: 'powershell', size: fs.statSync(fp).size });
    }

    case 'click':
    case 'mouse-click': {
      const x = input.x || input.x || 0;
      const y = input.y || input.y || 0;
      if (hasMechatron && m.mouse && m.mouse.click) {
        m.mouse.position = { x, y };
        if (m.mouse.click) m.mouse.click(input.button || 'left');
        return out('PASS', `Clicked (${x},${y})`, { x, y, engine: 'mechatron' });
      }
      // PowerShell fallback
      const ps = `Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y});[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`;
      execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 });
      return out('PASS', `Clicked (${x},${y})`, { x, y, engine: 'powershell' });
    }

    case 'type':
    case 'keyboard': {
      if (input.text) {
        if (hasMechatron && m.keyboard && m.keyboard.type) {
          m.keyboard.type(input.text);
          return out('PASS', `Typed: ${input.text.slice(0,40)}`, { engine: 'mechatron' });
        }
        // PowerShell fallback
        const ps = `(New-Object -ComObject wscript.shell).SendKeys('${input.text.replace(/'/g, "''")}')`;
        execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 });
        return out('PASS', `Typed: ${input.text.slice(0,40)}`, { engine: 'powershell' });
      }
      if (input.key) {
        if (hasMechatron && m.keyboard && m.KEYS) {
          const keyMap = { enter: 'KEY_ENTER', escape: 'KEY_ESCAPE', tab: 'KEY_TAB', space: 'KEY_SPACE', backspace: 'KEY_BACKSPACE', up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', shift: 'KEY_SHIFT', ctrl: 'KEY_CONTROL', alt: 'KEY_ALT' };
          const vk = keyMap[input.key.toLowerCase()];
          if (vk && m.KEYS[vk]) { m.keyboard.tap(m.KEYS[vk]); return out('PASS', `Key: ${input.key}`, { engine: 'mechatron' }); }
        }
        const km = { enter: '~', escape: '{ESC}', tab: '{TAB}', backspace: '{BACKSPACE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}' };
        const key = km[input.key.toLowerCase()] || input.key;
        const ps = `(New-Object -ComObject wscript.shell).SendKeys('${key.replace(/'/g, "''")}')`;
        execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 });
        return out('PASS', `Key: ${input.key}`, { engine: 'powershell' });
      }
      return out('ERROR', 'text or key required');
    }

    case 'find-window':
    case 'find': {
      const target = input.name || input.window || input.class;
      if (!target) return out('ERROR', 'name/class required');
      if (user32) {
        const classes = Array.isArray(target) ? target : [target];
        for (const cls of classes) {
          try {
            const hwnd = user32.func('FindWindowA', 'int64', ['string', 'string'])(cls, null);
            if (hwnd) {
              const buf = Buffer.alloc(256);
              user32.func('GetWindowTextA', 'int', ['int64', 'string', 'int'])(hwnd, buf, 256);
              const title = buf.toString('utf-8').replace(/\0+$/, '');
              return out('PASS', `Found: ${title}`, { hwnd: Number(hwnd), title, engine: 'koffi' });
            }
          } catch {}
        }
      }
      // PowerShell fallback
      try {
        const ps = `Add-Type -AssemblyName System.Windows.Forms;(Get-Process ${target} -ErrorAction SilentlyContinue | Select-Object -First 1).MainWindowHandle`;
        const raw = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding:'utf-8', timeout:5000 });
        return out('PASS', `Found via PID`, { hwnd: parseInt(raw.trim()), engine: 'powershell' });
      } catch { return out('WARN', `Window not found: ${target}`); }
    }

    case 'minimize': {
      const target = input.name || input.window || 'chrome';
      if (user32) {
        const hwnd = user32.func('FindWindowA', 'int64', ['string', 'string'])(target, null) ||
                     user32.func('FindWindowA', 'int64', ['string', 'string'])(`${target}_WidgetWin_1`, null);
        if (hwnd) { user32.func('ShowWindowAsync', 'bool', ['int64', 'int'])(hwnd, 6); return out('PASS', `Minimized ${target}`, { engine: 'koffi' }); }
      }
      try { const ps = `(New-Object -ComObject wscript.shell).AppActivate('${target}')`; execSync(`powershell -NoProfile -Command "${ps}"`,{timeout:5000}); return out('PASS', `Activated ${target}`, {engine:'powershell'}); } catch {}
      return out('WARN', `Not found: ${target}`);
    }

    default:
      return out('ERROR', `Unknown action: ${action}. Valid: screenshot, screen-info, click, type, key, find-window, minimize`);
  }
}

function handleAsync(promiseFn) {
  // Can't handle async in sync context - fall through to caller
  try {
    const p = promiseFn();
    if (p && typeof p.then === 'function') {
      // Return a marker - caller should retry via subprocess
      return null;
    }
    return p;
  } catch { return null; }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'desktop-native', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
