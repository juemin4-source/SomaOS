#!/usr/bin/env node
/**
 * component-inventory — handler.mjs
 *
 * Scan and catalog project structure: components, files, directories。
 * 遍历目录树，按类型/扩展名统计文件，识别项目组件。
 *
 * 能力: Scan and catalog UI components from source
 * 模式: FORGE-TEMPLATE-v1
 *
 * == 输入 ==
 *   {
 *     root: string,               // 扫描根路径
 *     depth?: number,             // 最大深度（默认 5）
 *     patterns?: string[],        // 只匹配指定 glob 模式
 *     exclude?: string[],         // 排除目录（默认 node_modules,.git,dist,target）
 *     groupBy?: "type"|"dir",     // 分组方式（默认 "type"）
 *   }
 *
 * == 输出 ==
 *   {
 *     result: "PASS" | "ERROR",
 *     summary: string,
 *     data: { root, totalFiles, totalDirs, groups, ... },
 *     evidence: [{ type, result, summary }]
 *   }
 */

import { readdirSync, statSync } from 'fs';
import { resolve, relative, extname, basename, join } from 'path';

const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'target', 'build', '.next', '.cache', '__pycache__', '.soma-screenshots'];

// 文件类型分类
const TYPE_MAP = [
  { exts: ['.js', '.mjs', '.cjs'],         type: 'javascript' },
  { exts: ['.ts', '.mts', '.cts'],          type: 'typescript' },
  { exts: ['.tsx', '.jsx'],                 type: 'react' },
  { exts: ['.rs'],                          type: 'rust' },
  { exts: ['.py'],                          type: 'python' },
  { exts: ['.go'],                          type: 'golang' },
  { exts: ['.json', '.yaml', '.yml', '.toml'], type: 'config' },
  { exts: ['.md', '.txt', '.rst'],          type: 'documentation' },
  { exts: ['.css', '.scss', '.less', '.sass'], type: 'stylesheet' },
  { exts: ['.html', '.htm', '.ejs', '.hbs'],   type: 'markup' },
  { exts: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'], type: 'image' },
  { exts: ['.woff', '.woff2', '.ttf', '.eot'], type: 'font' },
  { exts: ['.ps1', '.sh', '.bat', '.cmd'],  type: 'script' },
];

export function handle(input = {}) {
  try {
    return handleImpl(input);
  } catch (err) {
    return { result: 'ERROR', summary: err.message || 'Unhandled error', data: {}, evidence: [] };
  }
}

function handleImpl(input) {
  if (!input || typeof input !== 'object') {
    return { result: 'ERROR', summary: 'Input must be a JSON object', data: {}, evidence: [] };
  }
  if (!input.root) {
    return { result: 'ERROR', summary: 'root is required', data: {}, evidence: [] };
  }

  const root = resolve(input.root);
  const maxDepth = input.depth || 5;
  const exclude = input.exclude || DEFAULT_EXCLUDE;
  const groupBy = input.groupBy || 'type';

  const stats = { totalFiles: 0, totalDirs: 0, totalSize: 0, errors: [] };
  const byType = {};
  const byDir = {};
  const largeFiles = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      stats.errors.push({ path: relative(root, dir), error: e.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath);

      // 跳过排除目录
      if (entry.isDirectory()) {
        if (exclude.some(p => entry.name === p || entry.name.startsWith(p))) continue;
        stats.totalDirs++;
        walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      stats.totalFiles++;

      let size = 0;
      try {
        size = statSync(fullPath).size;
        stats.totalSize += size;
      } catch {}

      // 大文件记录
      if (size > 1_048_576) {
        largeFiles.push({ path: relPath, size });
      }

      // 按类型分组
      const ext = extname(entry.name).toLowerCase();
      const typeEntry = TYPE_MAP.find(t => t.exts.includes(ext));
      const type = typeEntry ? typeEntry.type : 'other';
      if (!byType[type]) byType[type] = { count: 0, size: 0, files: [] };
      byType[type].count++;
      byType[type].size += size;
      if (byType[type].files.length < 10) {
        byType[type].files.push(relPath);
      }

      // 按目录分组
      const dirKey = relative(root, dir) || '.';
      if (!byDir[dirKey]) byDir[dirKey] = { count: 0, size: 0 };
      byDir[dirKey].count++;
      byDir[dirKey].size += size;
    }
  }

  walk(root, 0);

  const groups = groupBy === 'dir'
    ? Object.entries(byDir).map(([dir, info]) => ({
        name: dir,
        files: info.count,
        size: info.size,
      })).sort((a, b) => b.files - a.files)
    : Object.entries(byType).map(([type, info]) => ({
        name: type,
        files: info.count,
        size: info.size,
        examples: info.files,
      })).sort((a, b) => b.files - a.files);

  return {
    result: 'PASS',
    summary: `${stats.totalFiles} files, ${stats.totalDirs} dirs, ${stats.groups || 0} groups in ${relative(process.cwd(), root) || root}`,
    data: {
      root,
      ...stats,
      groups,
      largeFiles: largeFiles.sort((a, b) => b.size - a.size).slice(0, 20),
      groupsCount: groups.length,
      groupBy,
    },
    evidence: [{
      type: 'scan_complete',
      result: 'PASS',
      summary: `Scanned ${stats.totalFiles} files in ${root}`,
    }],
  };
}

// ─── CLI Entry ───
function cli() {
  const chunks = [];
  process.stdin.on('data', d => chunks.push(d));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const out = handle(input);
      console.log(JSON.stringify(out, null, 2));
      process.exit(out.result === 'ERROR' ? 1 : 0);
    } catch (e) {
      console.log(JSON.stringify({ result: 'ERROR', summary: e.message, data: {}, evidence: [] }));
      process.exit(1);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file:///', ''))) {
  cli();
}

export default handle;
