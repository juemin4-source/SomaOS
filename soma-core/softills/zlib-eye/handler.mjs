#!/usr/bin/env node
/**
 * zlib-eye — handler.mjs
 *
 * 离线 Z-Library 种子档案中搜索和定位书籍。
 * 配合 Book Searcher 使用：搜索获得 book ID → 用本工具定位 → 在 BitTorrent 客户端中下载。
 *
 * == 输入 ==
 *   {
 *     action: "locate" | "stats" | "search",
 *     book_id?: number,        // locate 查询的书籍 ID
 *     query?: string,          // search 搜索关键词
 *     author?: string,         // search 按作者筛选
 *     language?: string,       // search 按语言筛选（english/chinese/russian/...）
 *     extension?: string,      // search 按文件类型筛选（pdf/epub/mobi/...）
 *     year_from?: number,      // search 起始年份
 *     year_to?: number,        // search 结束年份
 *     limit?: number,          // search 结果数（默认 20，最大 100）
 *     offset?: number,         // search 分页偏移
 *     data_dir?: string,       // 种子文件目录，默认 F 盘路径
 *   }
 *
 * == 输出 ==
 *   { result, summary, data, evidence }
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// ─── 默认数据目录 ───
const DEFAULT_DATA_DIR = 'F:/01_资料/三维/资产/杂项/ZLibrary离线种子（约1800万册共10TB）';

// ─── Bencode 解析器（轻量，只解析我们需要的信息） ───
function bencode(data, offset = 0) {
  if (data[offset] === 0x64) { // d
    offset++;
    const dict = {};
    while (data[offset] !== 0x65) { // e
      const [key, off1] = bencode(data, offset);
      const [val, off2] = bencode(data, off1);
      dict[key] = val;
      offset = off2;
    }
    return [dict, offset + 1];
  }
  if (data[offset] === 0x6C) { // l
    offset++;
    const list = [];
    while (data[offset] !== 0x65) { // e
      const [val, off] = bencode(data, offset);
      list.push(val);
      offset = off;
    }
    return [list, offset + 1];
  }
  if (data[offset] === 0x69) { // i
    const end = data.indexOf(0x65, offset);
    return [parseInt(data.slice(offset + 1, end).toString()), end + 1];
  }
  if (data[offset] >= 0x30 && data[offset] <= 0x39) { // string
    const colon = data.indexOf(0x3A, offset);
    const len = parseInt(data.slice(offset, colon).toString());
    const start = colon + 1;
    return [data.slice(start, start + len), start + len];
  }
  throw new Error(`Unexpected byte 0x${data[offset].toString(16)} at offset ${offset}`);
}

function parseTorrent(filepath) {
  const raw = readFileSync(filepath);
  const [torrent] = bencode(raw);
  return torrent;
}

function computeInfoHash(torrent) {
  // Re-bencode the info dict to compute SHA1
  const raw = readFileSync(torrent._filepath);
  const infoStart = raw.indexOf(0x64, 1); // second 'd' in the file
  const infoEnd = raw.lastIndexOf(0x65) + 1;
  const infoBencode = raw.slice(infoStart, infoEnd);
  return createHash('sha1').update(infoBencode).digest('hex');
}

// ─── ID 范围 → 种子文件映射 ───
const ID_RANGE_RE = /pilimi-zlib2?-(\d+)-(\d+)(?:-extra)?\.torrent$/;

function buildTorrentMap(dataDir) {
  const map = []; // { start, end, filepath }
  const parts = ['第一部分', '第二部分'];

  for (const part of parts) {
    const dir = join(dataDir, part);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir);
    for (const f of files) {
      const m = f.match(ID_RANGE_RE);
      if (m && !f.includes('index')) {
        map.push({
          start: parseInt(m[1]),
          end: parseInt(m[2]),
          filepath: join(dir, f),
          filename: f,
          part,
        });
      }
    }
  }

  map.sort((a, b) => a.start - b.start);
  return map;
}

function findTorrent(map, bookId) {
  // Binary search
  let lo = 0, hi = map.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = map[mid];
    if (bookId < entry.start) {
      hi = mid - 1;
    } else if (bookId > entry.end) {
      lo = mid + 1;
    } else {
      return entry;
    }
  }
  return null;
}

// ─── Actions ───

function actionStats(map) {
  let totalTorrents = map.length;
  let totalFiles = 0;
  const errors = [];
  const seenTorrents = new Set();

  for (const entry of map) {
    try {
      if (!existsSync(entry.filepath)) {
        errors.push(`${entry.filename}: 文件不存在`);
        continue;
      }
      const torrent = parseTorrent(entry.filepath);
      const info = torrent.info || {};
      const files = info.files || [];
      totalFiles += files.length;
      seenTorrents.add(entry.filepath);
    } catch (e) {
      errors.push(`${entry.filename}: ${e.message}`);
    }
  }

  const firstId = map.length > 0 ? map[0].start : 'N/A';
  const lastId = map.length > 0 ? map[map.length - 1].end : 'N/A';

  return {
    result: 'PASS',
    summary: `Z-Library 离线种子档案：${seenTorrents.size}/${totalTorrents} 个种子文件，涵盖 ~${totalFiles} 本书，ID 范围 ${firstId} - ${lastId}`,
    data: {
      total_torrents: totalTorrents,
      torrents_on_disk: seenTorrents.size,
      total_files_approx: totalFiles,
      id_range: { start: firstId, end: lastId },
      errors: errors.length > 0 ? errors.slice(0, 5) : [],
    },
    evidence: [{
      type: 'scan_torrents',
      result: 'PASS',
      summary: `扫描 ${seenTorrents.size} 个种子文件，发现约 ${totalFiles} 本书`,
    }],
  };
}

function actionLocate(map, bookId, dataDir) {
  if (bookId === undefined || bookId === null || isNaN(bookId)) {
    return {
      result: 'ERROR',
      summary: 'book_id 是必填参数',
      data: {},
      evidence: [{ type: 'validate', result: 'ERROR', summary: '缺少 book_id' }],
    };
  }

  const id = parseInt(bookId);
  const entry = findTorrent(map, id);

  if (!entry) {
    return {
      result: 'ERROR',
      summary: `未找到 ID ${id} 对应的种子文件（ID 范围: ${map.length > 0 ? map[0].start + ' - ' + map[map.length - 1].end : '空'})`,
      data: { book_id: id },
      evidence: [{ type: 'locate', result: 'ERROR', summary: `ID ${id} 超出范围` }],
    };
  }

  // Parse torrent to find the specific file
  let torrent;
  try {
    torrent = parseTorrent(entry.filepath);
  } catch (e) {
    return {
      result: 'ERROR',
      summary: `解析种子文件失败: ${e.message}`,
      data: { book_id: id, torrent_file: entry.filepath },
      evidence: [{ type: 'parse_torrent', result: 'ERROR', summary: e.message }],
    };
  }

  const info = torrent.info || {};
  const infoHash = computeInfoHash({ _filepath: entry.filepath, info });
  const files = info.files || [];

  // Find the specific book file
  const bookStr = String(id);
  let bookFile = null;
  for (let i = 0; i < files.length; i++) {
    if (files[i].name === bookStr || (Array.isArray(files[i].path) && files[i].path.join('/') === bookStr)) {
      bookFile = { index: i, size: files[i].length };
      break;
    }
  }

  if (!bookFile && files.length > 0) {
    // Try matching the name as the last element of path
    for (let i = 0; i < files.length; i++) {
      const paths = files[i].path || [files[i].name];
      const lastName = Array.isArray(paths) ? paths[paths.length - 1] : paths;
      if (lastName === bookStr || String(lastName) === bookStr) {
        bookFile = { index: i, size: files[i].length };
        break;
      }
    }
  }

  // Build tracker list for magnet
  const announce = torrent['announce'] || '';
  const announceList = torrent['announce-list'] || [];
  const trackers = [announce];
  if (Array.isArray(announceList)) {
    for (const tier of announceList) {
      if (Array.isArray(tier)) trackers.push(...tier);
      else trackers.push(tier);
    }
  }
  const uniqueTrackers = [...new Set(trackers.filter(Boolean))];

  // Magnet URI
  const name = info.name || entry.filename.replace('.torrent', '');
  let magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}`;
  for (const tr of uniqueTrackers.slice(0, 5)) {
    magnet += `&tr=${encodeURIComponent(tr)}`;
  }

  const result = {
    book_id: id,
    torrent_file: entry.filepath,
    torrent_filename: entry.filename,
    part: entry.part,
    info_hash: infoHash,
    magnet_uri: magnet,
    file_found: bookFile !== null,
  };

  if (bookFile) {
    result.file_index = bookFile.index;
    result.file_size_bytes = bookFile.size;
    result.file_size_hr = formatSize(bookFile.size);
  }

  // Also list a few files around the target to show it's in good company
  let sampleFiles = [];
  if (files.length > 0) {
    const startIdx = Math.max(0, bookFile ? bookFile.index - 2 : 0);
    const endIdx = Math.min(files.length, bookFile ? bookFile.index + 3 : 5);
    for (let i = startIdx; i < endIdx && i < files.length; i++) {
      const fpath = Array.isArray(files[i].path) ? files[i].path.join('/') : (files[i].name || '');
      sampleFiles.push({ index: i, name: fpath, size: files[i].length });
    }
    result.sample_files = sampleFiles;
  }

  return {
    result: 'PASS',
    summary: `Book #${id} 位于 ${entry.filename}，文件 ${bookFile ? bookFile.size + ' bytes' : '状态未知'}`,
    data: result,
    evidence: [
      {
        type: 'locate_torrent',
        result: 'PASS',
        summary: `ID ${id} → ${entry.filename} (范围 ${entry.start}-${entry.end})`,
      },
      {
        type: 'parse_torrent',
        result: 'PASS',
        summary: `解析 ${entry.filename} 中的 ${files.length} 个文件`,
      },
    ],
  };
}

function actionSearch(input) {
  try {
    const searchPy = join(dirname(fileURLToPath(import.meta.url)), 'search.py');
    if (!existsSync(searchPy)) {
      return {
        result: 'ERROR',
        summary: '搜索模块 search.py 未找到',
        data: {},
        evidence: [{ type: 'search', result: 'ERROR', summary: 'search.py 未找到' }],
      };
    }

    // Build search parameters
    const searchParams = {
      query: input.query || '',
      author: input.author || '',
      language: input.language || '',
      extension: input.extension || '',
      year_from: input.year_from,
      year_to: input.year_to,
      limit: Math.min(parseInt(input.limit) || 20, 100),
      offset: parseInt(input.offset) || 0,
    };

    const result = spawnSync('python', [searchPy, JSON.stringify(searchParams)], {
      timeout: 30000,
      encoding: 'utf-8',
    });

    if (result.error) {
      return {
        result: 'ERROR',
        summary: `搜索进程失败: ${result.error.message}`,
        data: {},
        evidence: [{ type: 'search', result: 'ERROR', summary: result.error.message }],
      };
    }

    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      return {
        result: 'ERROR',
        summary: `搜索返回无效 JSON: ${e.message}`,
        data: { raw: result.stdout?.slice(0, 500) },
        evidence: [{ type: 'search', result: 'ERROR', summary: e.message }],
      };
    }
  } catch (e) {
    return {
      result: 'ERROR',
      summary: `搜索异常: ${e.message}`,
      data: {},
      evidence: [{ type: 'search', result: 'ERROR', summary: e.message }],
    };
  }
}

function actionDownload(input) {
  const bookId = input.book_id;
  if (bookId === undefined || bookId === null || isNaN(bookId)) {
    return { result: 'ERROR', summary: 'download 需要 book_id 参数', data: {}, evidence: [] };
  }
  try {
    const searchPy = join(dirname(fileURLToPath(import.meta.url)), 'search.py');
    const dlTimeout = Math.min(parseInt(input.timeout) || 180, 600);
    const params = JSON.stringify({
      mode: 'download',
      id: parseInt(bookId),
      output_dir: input.output_dir || '',
      timeout: dlTimeout,
    });
    const result = spawnSync('python', [searchPy, params], { timeout: (dlTimeout + 30) * 1000, encoding: 'utf-8' });
    if (result.error) {
      return { result: 'ERROR', summary: `下载失败: ${result.error.message}`, data: {}, evidence: [] };
    }
    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      return {
        result: 'ERROR',
        summary: `下载返回无效 JSON: ${e.message}`,
        data: { raw: result.stdout?.slice(0, 500) },
        evidence: [{ type: 'download', result: 'ERROR', summary: e.message }],
      };
    }
  } catch (e) {
    return { result: 'ERROR', summary: `下载异常: ${e.message}`, data: {}, evidence: [] };
  }
}

function actionDownloadHttp(input) {
  const title = input.title || '';
  const author = input.author || '';
  const bookId = input.book_id;
  if (!title && !bookId) {
    return { result: 'ERROR', summary: 'download_http 需要 title（书名）或 book_id 参数', data: {}, evidence: [] };
  }
  try {
    const searchPy = join(dirname(fileURLToPath(import.meta.url)), 'search.py');
    const dlTimeout = Math.min(parseInt(input.timeout) || 120, 300);
    const params = JSON.stringify({
      mode: 'download_http',
      title: title,
      author: author || '',
      md5: input.md5 || '',
      id: bookId ? parseInt(bookId) : null,
      output_dir: input.output_dir || '',
      timeout: dlTimeout,
    });
    const result = spawnSync('python', [searchPy, params], { timeout: (dlTimeout + 60) * 1000, encoding: 'utf-8' });
    if (result.error) {
      return { result: 'ERROR', summary: `HTTP 下载失败: ${result.error.message}`, data: {}, evidence: [] };
    }
    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      return {
        result: 'ERROR',
        summary: `HTTP 下载返回无效 JSON: ${e.message}`,
        data: { raw: result.stdout?.slice(0, 500) },
        evidence: [{ type: 'download_http', result: 'ERROR', summary: e.message }],
      };
    }
  } catch (e) {
    return { result: 'ERROR', summary: `HTTP 下载异常: ${e.message}`, data: {}, evidence: [] };
  }
}

function formatSize(bytes) {
  if (!bytes) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

// ─── Handler ───

export function handle(input = {}) {
  try {
    return handleImpl(input);
  } catch (err) {
    return {
      result: 'ERROR',
      summary: err.message || '未处理的错误',
      data: {},
      evidence: [{ type: 'error', result: 'ERROR', summary: err.message?.slice(0, 200) }],
    };
  }
}

function handleImpl(input) {
  // ── 输入验证 ──
  if (!input || typeof input !== 'object') {
    return { result: 'ERROR', summary: '输入必须是 JSON 对象', data: {}, evidence: [] };
  }

  const action = input.action || 'stats';
  const dataDir = input.data_dir || DEFAULT_DATA_DIR;
  const bookId = input.book_id !== undefined ? parseInt(input.book_id) : undefined;

  // ── 验证数据目录 ──
  if (!existsSync(dataDir)) {
    return {
      result: 'ERROR',
      summary: `数据目录不存在: ${dataDir}`,
      data: { data_dir: dataDir },
      evidence: [{ type: 'check_datadir', result: 'ERROR', summary: `目录不存在: ${dataDir}` }],
    };
  }

  // ── 构建种子映射 ──
  let map;
  try {
    map = buildTorrentMap(dataDir);
  } catch (e) {
    return {
      result: 'ERROR',
      summary: `扫描种子文件失败: ${e.message}`,
      data: { data_dir: dataDir },
      evidence: [{ type: 'scan_datadir', result: 'ERROR', summary: e.message }],
    };
  }

  if (map.length === 0) {
    return {
      result: 'ERROR',
      summary: `在 ${dataDir} 下未找到任何种子文件`,
      data: { data_dir: dataDir },
      evidence: [{ type: 'scan_datadir', result: 'ERROR', summary: '未匹配到种子文件' }],
    };
  }

  // ── 路由 Action ──
  switch (action) {
    case 'locate':
      return actionLocate(map, bookId, dataDir);
    case 'stats':
      return actionStats(map);
    case 'search':
      return actionSearch(input);
    case 'download':
      return actionDownload(input);
    case 'download_http':
      return actionDownloadHttp(input);
    default:
      return {
        result: 'ERROR',
        summary: `未知 action: "${action}"，支持的动作: locate, stats, search, download, download_http`,
        data: { supported_actions: ['locate', 'stats', 'search', 'download', 'download_http'] },
        evidence: [{ type: 'validate', result: 'ERROR', summary: `未知 action: ${action}` }],
      };
  }
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

const __filename = resolve(process.argv[1] || '');
if (__filename === resolve(fileURLToPath(import.meta.url).replace(/^file:\/\//, ''))) {
  cli();
}

export default handle;
