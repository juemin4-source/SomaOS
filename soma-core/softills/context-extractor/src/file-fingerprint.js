/**
 * file-fingerprint.js
 *
 * 计算文件 SHA256 指纹，用于检测文件是否变化。
 */

const crypto = require('crypto');
const fs = require('fs');

function fingerprint(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve('sha256:' + hash.digest('hex')));
    stream.on('error', reject);
  });
}

function fingerprintSync(filePath) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return 'sha256:' + hash;
}

module.exports = { fingerprint, fingerprintSync };
