#!/usr/bin/env node
/**
 * connector.mjs — 零依赖 HTTP GET 封装
 *
 * 供所有 "eye" 类 softill 使用，基于 Node.js 原生 https/http。
 *
 * 用法：
 *   import { get } from '../_shared/connector.mjs';
 *   const data = await get('https://api.example.com/data');
 *   const data = await get('https://api.example.com/data', { 'Authorization': 'Bearer xxx' });
 *
 * 输出：解析后的 JSON 对象。网络错误或非 200 时抛异常。
 */

import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';

/**
 * 发起 HTTP GET 请求，返回解析后的 JSON
 * @param {string} url - 完整 URL
 * @param {object} [headers={}] - 自定义请求头
 * @returns {Promise<any>} 解析后的 JSON 响应
 */
export function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const getFn = isHttps ? httpsGet : httpGet;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'soma-softill/1.0',
        'Accept': 'application/json',
        ...headers,
      },
    };

    const req = getFn(options, (res) => {
      // 跟随重定向（301, 302, 303, 307, 308）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        // 递归跟随，最多 5 层避免循环
        return resolve(followRedirect(redirectUrl, headers, 5));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body); // 非 JSON 响应也返回字符串
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

/** 递归跟随重定向 */
function followRedirect(url, headers, maxRedirects) {
  if (maxRedirects <= 0) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const getFn = isHttps ? httpsGet : httpGet;
    const options = {
      hostname: urlObj.hostname, port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search, method: 'GET',
      headers: { 'User-Agent': 'soma-softill/1.0', 'Accept': 'application/json', ...headers },
    };
    const req = getFn(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(followRedirect(new URL(res.headers.location, url).href, headers, maxRedirects - 1));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

export default { get };
