/**
 * knowledge.js — Softill 知识库管理
 *
 * 每个 softill 可以有一个 knowledge/ 目录，存放领域知识、参考文档、示例等。
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, out, getSoftillDirs } = require('./utils');

function handleKnowledge(input) {
  const action = input.action || 'status';

  switch (action) {
    case 'init':   return initKnowledge(input);
    case 'steal':  return stealKnowledge(input);
    case 'status': return knowledgeStatus();
    case 'list':   return listKnowledge(input);
    default: return out('ERROR', `Unknown knowledge action: ${action}. Use: status, init, steal, list`);
  }
}

function initKnowledge(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');

  const kd = path.join(SOFTILLS_DIR, name, 'knowledge');
  if (fs.existsSync(kd)) return out('WARN', 'Knowledge dir already exists', { path: kd });

  fs.mkdirSync(kd, { recursive: true });
  fs.writeFileSync(path.join(kd, '.gitkeep'), '', 'utf-8');

  return out('PASS', `Knowledge dir created for ${name}`, { path: kd });
}

function stealKnowledge(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required (softill name)');
  const url = input.url;
  if (!url) return out('ERROR', 'url required');

  const target = input.as || 'data';
  const targetDir = path.join(SOFTILLS_DIR, name, 'knowledge');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const fp = path.join(targetDir, target.endsWith('.json') ? target : target + '.json');

  try {
    const https = require('https');
    const http = require('http');
    return new Promise((resolve) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { JSON.parse(d); } catch {
            resolve(out('WARN', 'Downloaded but not valid JSON', {
              file: fp, sizeBytes: d.length, warning: 'not valid JSON'
            }));
            return;
          }
          fs.writeFileSync(fp, d, 'utf-8');
          const sizeKB = (d.length / 1024).toFixed(0);
          resolve(out('PASS', `Stolen: ${url.split('/').pop()} (${sizeKB}KB)`, {
            name, url, file: fp, sizeKB
          }));
        });
      }).on('error', (e) => resolve(out('ERROR', e.message)));
    });
  } catch (e) {
    return out('ERROR', e.message);
  }
}

function knowledgeStatus() {
  const entries = [];
  for (const name of getSoftillDirs()) {
    const kd = path.join(SOFTILLS_DIR, name, 'knowledge');
    if (fs.existsSync(kd)) {
      const files = fs.readdirSync(kd).filter(f => f !== '.gitkeep' && !f.startsWith('.'));
      if (files.length > 0) {
        const totalSizeKB = files.reduce((s, f) =>
          s + (fs.statSync(path.join(kd, f)).size / 1024), 0
        ).toFixed(0);
        entries.push({ name, fileCount: files.length, files, totalSizeKB });
      }
    }
  }

  entries.sort((a, b) => b.fileCount - a.fileCount);
  const withKB = entries.length;
  const total = getSoftillDirs().filter(d => fs.existsSync(path.join(SOFTILLS_DIR, d, 'handler.js'))).length;

  return out('PASS', `${withKB}/${total} softills have knowledge bases`, {
    hasKnowledge: entries,
    totalSoftills: total,
    withKnowledge: withKB,
  });
}

function listKnowledge(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');

  const kd = path.join(SOFTILLS_DIR, name, 'knowledge');
  if (!fs.existsSync(kd)) return out('PASS', `No knowledge dir for ${name}`);

  const files = fs.readdirSync(kd).filter(f => !f.startsWith('.'));
  const totalSizeKB = files.reduce((s, f) =>
    s + (fs.statSync(path.join(kd, f)).size / 1024), 0
  ).toFixed(0);

  return out('PASS', `${name}: ${files.length} knowledge files (${totalSizeKB}KB)`, {
    name, files, totalSizeKB, path: kd,
  });
}

module.exports = { handleKnowledge };
