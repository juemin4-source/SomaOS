#!/usr/bin/env node
/**
 * receipt-utils.js — 共享的 Receipt 与 Hash 工具
 *
 * 所有 meta-softill 共用此库以保持 Receipt 格式一致。
 * 使用方式: const { createReceipt, sha256, loadJSON } = require('./receipt-utils.js');
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RECEIPTS_DIR = path.resolve(__dirname, '..', '..', 'receipts');

/**
 * 计算文件或字符串的 SHA256
 * @param {string} data - 文件路径或字符串
 * @param {boolean} isFile - 如果为 true，则读取文件计算 hash
 * @returns {string} hex hash
 */
function sha256(data, isFile) {
  if (isFile) {
    if (!fs.existsSync(data)) return null;
    const content = fs.readFileSync(data);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return crypto.createHash('sha256').update(String(data), 'utf-8').digest('hex');
}

/**
 * 加载 JSON 文件，失败返回 null
 */
/**
 * 去除 BOM 并解析 JSON
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    let content = fs.readFileSync(filePath, 'utf-8');
    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * 创建操作 Receipt
 *
 * @param {object} params
 * @param {string} params.softill - Softill 名称
 * @param {string} params.operation - 操作类型 (inspect|scaffold|forge|verify|register)
 * @param {string} params.status - pass|fail|error
 * @param {object} params.input - 原始输入
 * @param {object} params.output - 输出数据（不含 evidence 路径）
 * @param {string[]} params.evidence - 证据文件路径列表
 * @param {string} params.inputHash - 输入的 hash（用于链接上一个 receipt）
 * @returns {object} receipt 对象（同时写入 receipts/ 目录）
 */
function createReceipt(params) {
  const { softill, operation, status, input, output, evidence, inputHash } = params;

  const receipt = {
    receipt: {
      meta: {
        softill,
        operation,
        status,
        timestamp: new Date().toISOString(),
        schema: 'meta-softill-receipt-v0.1',
      },
      links: {
        inputHash: inputHash || null,
      },
      input: sanitize(input),
      output: output || {},
      evidence: evidence || [],
    },
  };

  // 给 receipt 自身计算 hash
  // 注意: 不能使用 replacer array (它会递归过滤所有层级的key)。
  // 用自定义排序 replacer 函数保证 key 顺序稳定。
  const receiptStr = JSON.stringify(receipt, function(_, v) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((acc, k) => { acc[k] = v[k]; return acc; }, {});
    }
    return v;
  }, 2);
  receipt.receipt.meta.receiptHash = sha256(receiptStr);

  // 写入文件
  const ts = new Date().toISOString().replace(/[T:]/g, '-').replace(/\.\d+Z$/, '');
  const safeName = operation;
  const filename = `${ts}-${safeName}-receipt.json`;
  const receiptPath = path.join(RECEIPTS_DIR, filename);

  // 确保 receipts 目录存在
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }

  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  // 返回时附上路径
  receipt.receipt.meta.receiptPath = receiptPath;

  return receipt;
}

/**
 * 读取文件内容并去除 UTF-8 BOM
 */
function readFileStripBOM(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

/**
 * 从文件读取 JSON，自动处理 BOM
 */
function readJSONFromFile(filePath) {
  const content = readFileStripBOM(filePath);
  return JSON.parse(content);
}

/**
 * 截断敏感或过大的输入用于 receipt
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const str = JSON.stringify(obj);
  if (str.length > 2000) {
    return JSON.parse(str.substring(0, 2000) + '...');
  }
  return obj;
}

/**
 * 标准输出格式（与 SOFTILL_MODEL.md 一致）
 */
function softillResult(softill, status, summary, data, evidence) {
  return JSON.stringify({
    type: 'softill_result',
    softill,
    status,
    summary,
    data: data || {},
    evidence: evidence || [],
    recommendedObservations: [],
  }, null, 2);
}

module.exports = { createReceipt, sha256, loadJSON, readFileStripBOM, readJSONFromFile, softillResult };
