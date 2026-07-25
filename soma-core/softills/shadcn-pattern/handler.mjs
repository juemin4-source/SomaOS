#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * shadcn-pattern — handler.js
 *
 * 根据 shadcn/ui 模式生成织梦机交互组件。
 * 输出适配 CSS 变量体系的组件代码。
 */


import fs from 'fs';

import path from 'path';

// ═════════════════════════════════════════════════════
// 组件生成器
// ═════════════════════════════════════════════════════

const GENERATORS = {
  skeleton: generateSkeleton,
  'alert-dialog': generateAlertDialog,
  dialog: generateDialog,
  toast: generateSonner,
  sonner: generateSonner,
  tooltip: generateTooltip,
  dropdown: generateDropdown,
};

function generateSkeleton(input) {
  const targetDir = input.targetDir || 'components/ui';
  const code = `/**
 * Skeleton — 骨架屏加载占位
 * 源自 shadcn/ui skeleton pattern
 */
interface SkeletonProps {
  className?: string;
  /** 'text' | 'circle' | 'card' */
  variant?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const baseStyle: React.CSSProperties = {
    background: 'var(--bg-raised)',
    borderRadius: 'var(--radius-sm)',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  };
  const variants: Record<string, React.CSSProperties> = {
    text: { height: '1em', width: width || '100%' },
    circle: { width: width || 40, height: height || 40, borderRadius: '50%' },
    card: { height: height || 120, width: width || '100%', borderRadius: 'var(--radius-md)' },
  };
  return <div className={className} style={{ ...baseStyle, ...variants[variant] || variants.text }} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      <Skeleton variant="circle" width={40} height={40} />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="40%" />
    </div>
  );
}
`;
  const filePath = path.join(targetDir, 'Skeleton.tsx');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(filePath, code);
  return { files: ['Skeleton.tsx'], summary: 'Skeleton + SkeletonCard generated' };
}

function generateAlertDialog(input) {
  const targetDir = input.targetDir || 'components/ui';
  const code = `/**
 * AlertDialog — 确认对话框
 * 源自 shadcn/ui AlertDialog + sonner toast
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function AlertDialog({
  open, onOpenChange, title, description, children,
  confirmLabel = '确认', cancelLabel = '取消',
  variant = 'default', onConfirm, onCancel, loading,
}: AlertDialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
      }}
      onClick={() => onOpenChange(false)}
    >
      <div ref={ref} onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)', maxWidth: 420, width: '90%',
          padding: 'var(--space-6)',
        }}
      >
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h2>
        {description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>{description}</p>}
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={() => { onCancel?.(); onOpenChange(false); }}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--text-sm)',
            }}
          >{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-md)', border: 'none',
              background: variant === 'destructive' ? '#e53e3e' : 'var(--accent)',
              color: variant === 'destructive' ? '#fff' : 'var(--text-inverse)',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
              fontSize: 'var(--text-sm)', fontWeight: 500,
            }}
          >{loading ? '处理中...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
`;
  const filePath = path.join(targetDir, 'AlertDialog.tsx');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(filePath, code);
  return { files: ['AlertDialog.tsx'], summary: 'AlertDialog with confirm/cancel + destructive variant' };
}

function generateDialog(input) {
  const targetDir = input.targetDir || 'components/ui';
  const code = `/**
 * Dialog — 通用弹窗
 * 源自 shadcn/ui Dialog
 */
import { useEffect, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={() => onOpenChange(false)}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto', padding: 'var(--space-6)' }}
      >
        {title && <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
`;
  fs.writeFileSync(path.join(targetDir, 'Dialog.tsx'), code);
  return { files: ['Dialog.tsx'], summary: 'Dialog with backdrop + escape to close' };
}

function generateSonner(input) {
  const targetDir = input.targetDir || 'components/ui';
  const code = `/**
 * Sonner — 轻量通知系统
 * 源自 shadcn/ui sonner
 */
import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id}
            style={{
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-raised)', border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)', maxWidth: 360,
              borderLeft: \`4px solid \${t.variant === 'success' ? '#38a169' : t.variant === 'error' ? '#e53e3e' : t.variant === 'warning' ? '#d69e2e' : 'var(--accent)'}\`,
              animation: 'slideIn 0.2s ease',
            }}
          >{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
`;
  fs.writeFileSync(path.join(targetDir, 'Sonner.tsx'), code);
  return { files: ['Sonner.tsx'], summary: 'Sonner toast system with context provider' };
}

// Stubs for remaining components
function generateTooltip(input) {
  const targetDir = input.targetDir || 'components/ui';
  fs.writeFileSync(path.join(targetDir, 'Tooltip.tsx'), `// Tooltip — shadcn/ui pattern (stub, implement when needed)\n`);
  return { files: ['Tooltip.tsx'], summary: 'Tooltip stub' };
}
function generateDropdown(input) {
  const targetDir = input.targetDir || 'components/ui';
  fs.writeFileSync(path.join(targetDir, 'DropdownMenu.tsx'), `// DropdownMenu — shadcn/ui pattern (stub, implement when needed)\n`);
  return { files: ['DropdownMenu.tsx'], summary: 'DropdownMenu stub' };
}

// ═════════════════════════════════════════════════════

function handle(input) {
  const component = input?.component || 'skeleton';
  const gen = GENERATORS[component];
  if (!gen) {
    return { error: true, message: `Unknown component: ${component}. Available: ${Object.keys(GENERATORS).join(', ')}` };
  }
  return gen(input);
}

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    try { input = JSON.parse(process.argv[2]); }
    catch { try { input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf-8')); } catch (e) { return fail(e.message); } }
  } else if (!process.stdin.isTTY) {
    const chunks = []; process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => { try { input = JSON.parse(Buffer.concat(chunks).toString()); run(input); } catch (e) { fail(e.message); } });
    return;
  }
  run(input || {});
}
function run(input) {
  const result = handle(input);
  if (result.error) { return fail(result.message); }
  console.log(JSON.stringify({ softill: 'shadcn-pattern', result: 'PASS', summary: result.summary, data: { files: result.files }, evidence: [] }, null, 2));
  process.exit(0);
}
function fail(msg) { console.log(JSON.stringify({ softill: 'shadcn-pattern', result: 'ERROR', summary: msg, data: {}, evidence: [] })); process.exit(1); }
export default { handle };


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();