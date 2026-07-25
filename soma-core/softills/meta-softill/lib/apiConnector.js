/**
 * apiConnector.js — Softill API 连接器管理
 *
 * 为 softill 创建外部 API 的连接器（connector.js），
 * 管理认证、请求、缓存、限流。
 */

const fs = require('fs');
const path = require('path');
const { SOFTILLS_DIR, out, getSoftillDirs } = require('./utils');

function handleApi(input) {
  const action = input.action || 'create';

  switch (action) {
    case 'create': return createConnector(input);
    case 'status': return apiStatus();
    default: return out('ERROR', `Unknown api action: ${action}. Use: create, status`);
  }
}

function createConnector(input) {
  const name = input.name;
  if (!name) return out('ERROR', 'name required');

  const ad = path.join(SOFTILLS_DIR, name, 'api');
  if (fs.existsSync(ad)) return out('WARN', 'api dir already exists', { path: ad });

  fs.mkdirSync(ad, { recursive: true });

  const connectorCode = `/**
 * connector.js — ${name} API 连接器
 *
 * 管理外部 API 的认证、请求、缓存、限流。
 * handler.js 通过 require('./api/connector') 调用。
 */

const https = require('https');
const http = require('http');

const CACHE = {};

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = { method, headers: { 'User-Agent': 'Soma-Softill/1.0', ...(headers || {}) } };
    const req = mod.request(url, opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function get(url, headers) { return request('GET', url, headers); }
async function post(url, body, headers) { return request('POST', url, { 'Content-Type': 'application/json', ...headers }, body); }

module.exports = { get, post, request };
`;

  fs.writeFileSync(path.join(ad, 'connector.js'), connectorCode, 'utf-8');
  fs.writeFileSync(path.join(ad, '.gitkeep'), '', 'utf-8');

  return out('PASS', `API connector created for ${name}`, {
    path: ad,
    files: ['connector.js', '.gitkeep'],
  });
}

function apiStatus() {
  const entries = [];
  for (const name of getSoftillDirs()) {
    const ad = path.join(SOFTILLS_DIR, name, 'api');
    if (fs.existsSync(ad)) {
      const files = fs.readdirSync(ad).filter(f => f !== '.gitkeep');
      entries.push({ name, files });
    }
  }

  const total = getSoftillDirs().length;
  return out('PASS', `${entries.length}/${total} softills have API connectors`, { entries });
}

module.exports = { handleApi };
