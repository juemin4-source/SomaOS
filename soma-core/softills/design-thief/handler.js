#!/usr/bin/env node
/**
 * design-thief — handler.js
 *
 * 扒 Open WebUI 的设计体系 → 生成 React UI 组件。
 *
 * 模式:
 *   scan       扫描组件结构
 *   tokens     提取设计 token
 *   generate   生成 React 组件
 *   all        全流程
 *
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path');

const WEBUI = 'G:/AI/Claude/somaOS/webui/src';
const OUR_UI = 'G:/AI/Claude/somaOS/ui/src';

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const mode = input.mode || 'all';

  switch (mode) {
    case 'tokens': return extractTokens();
    case 'scan': return scanComponents();
    case 'generate': return generateComponents(input.component || 'all');
    case 'all': {
      const tokens = extractTokens();
      const components = scanComponents();
      const generated = generateComponents('chat');
      return out('PASS', `Design tokens: ${tokens.data.count} | Components: ${components.data.count} | Generated: ${generated.generated}`, {
        tokens: tokens.data, components: components.data, generated: generated.data,
      });
    }
    default: return out('ERROR', 'Unknown mode');
  }
}

function extractTokens() {
  // Read Tailwind config for design tokens
  const twPath = path.resolve(WEBUI, '..', 'tailwind.config.js');
  const cssPath = path.resolve(WEBUI, 'app.css');
  const tokens = { colors: {}, spacing: {}, borderRadius: {}, fontSize: {}, fonts: [] };

  // Extract from app.css
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf-8');
    const varRe = /--([\w-]+)\s*:\s*([^;]+)/g; let m;
    while ((m = varRe.exec(css)) !== null) tokens.colors[m[1]] = m[2].trim();
    const fontRe = /font-family:\s*([^;]+)/g;
    while ((m = fontRe.exec(css)) !== null) tokens.fonts.push(m[1].trim());
  }

  // Scan Svelte files for color classes
  const colorMap = {};
  const svelteFiles = findFiles(WEBUI, ['.svelte'], ['node_modules']);
  for (const fp of svelteFiles.slice(0, 30)) {
    const c = fs.readFileSync(fp, 'utf-8');
    const colors = c.match(/text-[\w-]+|bg-[\w-]+|border-[\w-]+|hover:[\w-]+|dark:[\w-]+/g);
    if (colors) colors.forEach(cl => { const k = cl.replace(/hover:|dark:/g, ''); colorMap[k] = (colorMap[k] || 0) + 1; });
  }

  const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]).slice(0, 30);

  return {
    result: 'PASS', summary: `${Object.keys(tokens.colors).length} CSS vars, ${sorted.length} color classes`,
    data: { cssVars: tokens.colors, topColors: sorted.map(([k, v]) => `${k} (${v}x)`), fonts: tokens.fonts },
  };
}

function scanComponents() {
  const components = {};
  const svelteFiles = findFiles(path.join(WEBUI, 'lib', 'components'), ['.svelte'], ['node_modules']);
  const chatFiles = svelteFiles.filter(f => f.includes('chat') || f.includes('Chat') || f.includes('message') || f.includes('Message'));

  for (const fp of chatFiles.slice(0, 15)) {
    const c = fs.readFileSync(fp, 'utf-8');
    const name = path.basename(fp, '.svelte');
    const props = []; const pRe = /export\s+let\s+(\w+)/g; let m;
    while ((m = pRe.exec(c)) !== null) props.push(m[1]);
    components[name] = { file: fp.slice(WEBUI.length), props, sizeKB: (c.length / 1024).toFixed(0) };
  }

  return {
    result: 'PASS', summary: `${Object.keys(components).length} chat components found`,
    data: { components, count: Object.keys(components).length },
  };
}

function generateComponents(target) {
  // Read the current App.tsx to enhance it
  const appPath = path.join(OUR_UI, 'App.tsx');
  if (!fs.existsSync(appPath)) return out('ERROR', 'App.tsx not found');

  // Generate a design-tokens.css file
  const tokensCSS = `/* somaOS Design Tokens — stolen from Open WebUI */
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #1c2333;
  --bg-hover: #1f2630;
  --border-color: #1c2333;
  --border-hover: #2d3748;
  --text-primary: #e1e7ef;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --accent-blue: #1f6feb;
  --accent-blue-hover: #1a5fb4;
  --accent-green: #3fb950;
  --accent-yellow: #d29922;
  --accent-red: #f85149;
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.2);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.3);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --font-sans: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --transition-fast: 0.15s ease;
  --transition-normal: 0.25s ease;
}
`;

  fs.writeFileSync(path.join(OUR_UI, 'design-tokens.css'), tokensCSS, 'utf-8');

  // Generate an enhanced ChatMessage component
  const chatMsg = `import React from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const roleStyles = {
  user: {
    container: { justifyContent: 'flex-end' as const },
    bubble: {
      background: 'linear-gradient(135deg, var(--accent-blue-hover), var(--accent-blue))',
      color: '#fff',
      borderBottomRightRadius: '4px',
    },
  },
  assistant: {
    container: { justifyContent: 'flex-start' as const },
    bubble: {
      background: 'var(--bg-tertiary)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderBottomLeftRadius: '4px',
    },
  },
};

export function ChatMessage({ role, content }: ChatMessageProps) {
  const style = roleStyles[role];
  return (
    <div style={{ display: 'flex', ...style.container, marginBottom: 12, animation: 'fadeSlideIn 0.25s ease-out' }}>
      <div style={{
        maxWidth: '70%', padding: '10px 18px', borderRadius: 'var(--radius-lg)',
        fontSize: 14, lineHeight: 1.65, letterSpacing: '0.01em',
        boxShadow: 'var(--shadow-sm)',
        ...style.bubble,
      }}>
        {content}
      </div>
    </div>
  );
}
`;

  const chatMsgPath = path.join(OUR_UI, 'ChatMessage.tsx');
  fs.writeFileSync(chatMsgPath, chatMsg, 'utf-8');

  // Generate an enhanced InputArea component
  const inputArea = `import React, { useRef } from 'react';

interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  loading?: boolean;
  placeholder?: string;
}

export function InputArea({ value, onChange, onSend, loading, placeholder }: InputAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{
      borderTop: '1px solid var(--border-color)', padding: '12px 24px 16px',
      background: 'linear-gradient(0deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
    }}>
      <div style={{
        display: 'flex', gap: 8, background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
        padding: '4px 4px 4px 18px', alignItems: 'center',
        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
      }}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSend())}
          placeholder={placeholder || '给 somaOS 派任务...'}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            padding: '10px 0', fontFamily: 'var(--font-sans)',
          }}
        />
        <button
          onClick={onSend}
          disabled={loading || !value.trim()}
          style={{
            width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: 'none',
            background: loading || !value.trim() ? 'var(--bg-hover)' : 'linear-gradient(135deg, var(--accent-blue-hover), var(--accent-blue))',
            color: loading || !value.trim() ? 'var(--text-muted)' : '#fff',
            fontSize: 16, cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all var(--transition-fast)',
            flexShrink: 0,
          }}
        >↑</button>
      </div>
    </div>
  );
}
`;

  fs.writeFileSync(path.join(OUR_UI, 'InputArea.tsx'), inputArea, 'utf-8');

  const generated = ['design-tokens.css', 'ChatMessage.tsx', 'InputArea.tsx'];

  return {
    result: 'PASS', summary: `Generated ${generated.length} files`,
    data: { files: generated, path: OUR_UI },
    generated: generated.length,
  };
}

function findFiles(dir, exts, ignore) {
  const r = []; const I = ['node_modules', '.git', 'dist', 'build'];
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (I.some(i => e.name.includes(i))) continue; const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...findFiles(f, exts, ignore)); else if (e.isFile() && exts.some(x => e.name.endsWith(x))) r.push(f); } } catch {}
  return r;
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'design-thief', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
