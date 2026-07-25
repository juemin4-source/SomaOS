#!/usr/bin/env node
/**
 * html-parse — handler.js
 *
 * HTML 解析 softill。基于 cheerio（GitHub: cheeriojs/cheerio）。
 * Chancellor 负责抓取（WebFetch），本 softill 负责解析。
 *
 * 输入: { html: string, extract: string | string[] }
 *   extract 值:
 *     "text"      — 纯文本（去标签）
 *     "links"     — 所有链接 [{text, href}]
 *     "title"     — 页面标题
 *     "meta"      — meta 信息
 *     "headings"  — 标题结构 [{level, text}]
 *     "tables"    — 表格数据
 *     "images"    — 图片 [{alt, src}]
 *     "all"       — 以上全部
 *     也可以是数组: ["title", "links", "text"]
 *
 * 用法:
 *   node handler.js <input-json>
 *   cat input.json | node handler.js
 */

const fs = require('fs');
const path = require('path');

function main() {
  let input;
  if (process.argv[2] && process.argv[2] !== '--') {
    const p = path.resolve(process.argv[2]);
    try { input = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return out('ERROR', `Read fail: ${e.message}`); }
  } else {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(chunks).toString()); handle(input); }
      catch (e) { out('ERROR', `Parse error: ${e.message}`); }
    });
    return;
  }
  handle(input);
}

function handle(input) {
  let cheerio;
  try { cheerio = require('cheerio'); }
  catch (e) {
    try { cheerio = require('../node_modules/cheerio'); }
    catch (e2) { return out('ERROR', 'cheerio not installed'); }
  }

  const html = input.html || (input.file ? fs.readFileSync(path.resolve(input.file), 'utf-8') : null);
  const extract = input.extract || 'text';
  const maxTextLen = input.maxTextLen || 5000;

  if (!html) return out('ERROR', 'html or file required');

  try {
    const $ = cheerio.load(html);
    const extracts = Array.isArray(extract) ? extract : [extract];
    const result = {};

    for (const cmd of extracts) {
      switch (cmd) {
        case 'text': {
          // Remove script, style, then get text
          const clone = $('body').length ? $('body').clone() : $('*').clone();
          clone.find('script, style, svg, noscript').remove();
          const text = clone.text().replace(/\s+/g, ' ').trim();
          result.text = text.slice(0, maxTextLen);
          result.textTruncated = text.length > maxTextLen;
          result.textLength = text.length;
          break;
        }
        case 'title': {
          result.title = $('title').text().trim() || $('h1').first().text().trim() || '';
          break;
        }
        case 'links': {
          result.links = [];
          $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().slice(0, 100);
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              result.links.push({ text: text || href, href });
            }
          });
          result.linkCount = result.links.length;
          // Only keep first 100 links
          if (result.links.length > 100) result.links = result.links.slice(0, 100);
          break;
        }
        case 'meta': {
          result.meta = {};
          $('meta').each((i, el) => {
            const name = $(el).attr('name') || $(el).attr('property') || '';
            const content = $(el).attr('content') || '';
            if (name && content) result.meta[name] = content.slice(0, 500);
          });
          // Also get og tags
          $('meta[property]').each((i, el) => {
            const prop = $(el).attr('property');
            const content = $(el).attr('content') || '';
            if (prop && content) result.meta[prop] = content.slice(0, 500);
          });
          break;
        }
        case 'headings': {
          result.headings = [];
          $('h1, h2, h3, h4, h5, h6').each((i, el) => {
            const tag = el.tagName.toLowerCase();
            result.headings.push({ level: parseInt(tag[1]), text: $(el).text().trim().slice(0, 200) });
          });
          break;
        }
        case 'tables': {
          result.tables = [];
          $('table').each((ti, table) => {
            const rows = [];
            $(table).find('tr').each((ri, row) => {
              const cells = [];
              $(row).find('th, td').each((ci, cell) => {
                cells.push($(cell).text().trim().slice(0, 200));
              });
              if (cells.length > 0) rows.push(cells);
            });
            if (rows.length > 0) result.tables.push({ index: ti, rows: rows.slice(0, 50) });
          });
          result.tableCount = result.tables.length;
          break;
        }
        case 'images': {
          result.images = [];
          $('img[src]').each((i, el) => {
            const src = $(el).attr('src');
            const alt = $(el).attr('alt') || '';
            if (src) result.images.push({ src, alt: alt.slice(0, 100) });
          });
          result.imageCount = result.images.length;
          if (result.images.length > 50) result.images = result.images.slice(0, 50);
          break;
        }
        case 'code': {
          result.code = [];
          $('code, pre').each((i, el) => {
            const text = $(el).text().trim();
            if (text) result.code.push(text.slice(0, 500));
          });
          result.codeCount = result.code.length;
          if (result.code.length > 20) result.code = result.code.slice(0, 20);
          break;
        }
        case 'all': {
          // Recursively extract everything
          return handle({ ...input, extract: ['text', 'title', 'links', 'meta', 'headings', 'tables', 'images', 'code'] });
        }
        default:
          result._unknown = (result._unknown || []).concat(cmd);
      }
    }

    result._stats = {
      htmlBytes: html.length,
      elements: Object.keys($._root ? $._root.children : {}).length || 0,
    };

    return out('PASS', `Extracted ${Object.keys(result).length - 1} data types from HTML`, result);
  } catch (e) {
    return out('ERROR', `Parse error: ${e.message}`);
  }
}

function out(result, summary, data) {
  console.log(JSON.stringify({ softill: 'html-parse', result, summary, data: data || {}, evidence: [] }, null, 2));
  process.exit(result === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
