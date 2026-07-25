#!/usr/bin/env node
/**
 * memory-eye — handler.js
 *
 * 统一记忆系统。取代碎片化的 trace/episode/handoff 存储。
 * JSONL 后端 + 关键词索引 + 每日聚合。
 *
 * 动作:
 *   store    存一条记忆
 *   search   搜索记忆
 *   recent   最近 N 条
 *   daily    查看每日活动
 *   stats    记忆统计
 *   forget   删除记忆
 *   migrate  从旧系统导入 episodes.jsonl
 *
 * 用法: node handler.js <input-json>
 */

const fs = require('fs'); const path = require('path');

const STORE = path.resolve(__dirname, '..', '..', 'soma', 'memory', 'store');
const MEMORY_FILE = path.join(STORE, 'memories.jsonl');
const INDEX_FILE = path.join(STORE, 'index.json');

function ensureStore() { if (!fs.existsSync(STORE)) fs.mkdirSync(STORE, { recursive: true }); }

function loadMemories() {
  ensureStore();
  if (!fs.existsSync(MEMORY_FILE)) return [];
  return fs.readFileSync(MEMORY_FILE, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function appendMemory(entry) {
  ensureStore();
  fs.appendFileSync(MEMORY_FILE, JSON.stringify(entry) + '\n', 'utf-8');
}

function saveMemories(memories) {
  ensureStore();
  fs.writeFileSync(MEMORY_FILE, memories.map(m => JSON.stringify(m)).join('\n') + '\n', 'utf-8');
}

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

function h(input) {
  const action = input.action || 'recent';
  const memories = loadMemories();

  switch (action) {
    case 'store': {
      const entry = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: input.type || 'note',
        timestamp: new Date().toISOString(),
        content: input.content || input.text || '',
        tags: input.tags || [],
        source: input.source || 'manual',
        session: input.session || '',
        importance: input.importance || 0,
      };
      if (!entry.content) return out('ERROR', 'content required');
      appendMemory(entry);
      return out('PASS', `Stored: ${entry.content.slice(0, 60)}`, { memory: entry, totalMemories: memories.length + 1 });
    }

    case 'search': {
      const query = (input.query || input.q || '').toLowerCase();
      const type = input.type || '';
      const tag = input.tag || '';
      const limit = input.limit || 20;
      if (!query && !type && !tag) return out('ERROR', 'query, type, or tag required');

      let results = memories;
      if (query) results = results.filter(m => (m.content || '').toLowerCase().includes(query) || (m.tags || []).some(t => t.toLowerCase().includes(query)));
      if (type) results = results.filter(m => m.type === type);
      if (tag) results = results.filter(m => (m.tags || []).includes(tag));
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return out('PASS', `${results.length} results for "${query || type || tag}"`, {
        query: query || type || tag, results: results.slice(0, limit), totalCount: results.length,
      });
    }

    case 'recent': {
      const limit = input.limit || 20;
      const type = input.type || '';
      let results = [...memories];
      if (type) results = results.filter(m => m.type === type);
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return out('PASS', `${Math.min(limit, results.length)} recent memories`, {
        results: results.slice(0, limit), totalCount: results.length, type,
      });
    }

    case 'daily': {
      const date = input.date || new Date().toISOString().slice(0, 10);
      const dayMemories = memories.filter(m => (m.timestamp || '').startsWith(date));
      const byType = {};
      for (const m of dayMemories) { byType[m.type] = (byType[m.type] || 0) + 1; }
      return out('PASS', `${dayMemories.length} memories on ${date}`, {
        date, totalCount: dayMemories.length, byType,
        timeline: dayMemories.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(0, 50),
      });
    }

    case 'stats': {
      const byType = {}; const bySource = {}; const byTag = {};
      for (const m of memories) {
        byType[m.type] = (byType[m.type] || 0) + 1;
        bySource[m.source] = (bySource[m.source] || 0) + 1;
        (m.tags || []).forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
      }
      const firstDate = memories.length > 0 ? memories.reduce((a, b) => a.timestamp < b.timestamp ? a : b).timestamp.slice(0, 10) : 'N/A';
      return out('PASS', `${memories.length} memories since ${firstDate}`, {
        totalCount: memories.length, byType, bySource, topTags: Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 10), firstDate,
      });
    }

    case 'forget': {
      const id = input.id;
      const olderThan = input.olderThan || '';
      if (id) {
        const idx = memories.findIndex(m => m.id === id);
        if (idx === -1) return out('WARN', `Memory not found: ${id}`);
        memories.splice(idx, 1);
        saveMemories(memories);
        return out('PASS', `Forgot: ${id}`);
      }
      if (olderThan) {
        const cutoff = new Date(olderThan).getTime();
        const before = memories.length;
        const kept = memories.filter(m => new Date(m.timestamp).getTime() >= cutoff);
        saveMemories(kept);
        return out('PASS', `Forgot ${before - kept.length} memories older than ${olderThan}`, { removed: before - kept.length, remaining: kept.length });
      }
      return out('ERROR', 'id or olderThan required');
    }

    case 'migrate': {
      // 从旧系统的 episodes.jsonl 导入
      let imported = 0;
      const oldFiles = ['episodes.jsonl', 'risks.jsonl', 'procedures.jsonl', 'owner-decisions.jsonl'];
      const typeMap = { 'episodes.jsonl': 'episode', 'risks.jsonl': 'risk', 'procedures.jsonl': 'procedure', 'owner-decisions.jsonl': 'decision' };
      for (const file of oldFiles) {
        const fp = path.join(STORE, file);
        if (fs.existsSync(fp)) {
          const lines = fs.readFileSync(fp, 'utf-8').trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const old = JSON.parse(line);
              appendMemory({
                id: `mem_${Date.now()}_${imported}`,
                type: typeMap[file] || 'unknown',
                timestamp: old.timestamp || old.t || new Date().toISOString(),
                content: old.summary || old.content || old.risk || JSON.stringify(old).slice(0, 500),
                tags: [typeMap[file] || 'unknown', old.trigger || ''].filter(Boolean),
                source: 'migrate:' + file.replace('.jsonl', ''),
                importance: old.severity === 'critical' ? 3 : old.severity === 'important' ? 2 : 1,
              });
              imported++;
            } catch {}
          }
        }
      }
      return out('PASS', `Imported ${imported} memories from old system`, { imported, files: oldFiles.filter(f => fs.existsSync(path.join(STORE, f))) });
    }

    default:
      return out('ERROR', `Unknown action: ${action}`);
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'memory-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }
if (require.main === module) main();
