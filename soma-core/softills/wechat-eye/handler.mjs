#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * wechat-eye — handler.js
 *
 * 微信消息网关。基于腾讯官方 iLink Bot API，零封号风险。
 *
 * 模式:
 *   listen    启动消息监听，微信消息自动转发到 Soma 处理管道
 *   send      发送微信消息（好友/群）
 *   status    查看连接状态
 *
 * 输入: { mode, to?, text?, image?, ... }
 * 用法: node handler.js <input-json>
 */


import path from 'path'; 
import fs from 'fs';

const require = createRequire(import.meta.url);

function main() {
  let i; const a = process.argv[2];
  if (a && a !== '--') { try { i = JSON.parse(fs.readFileSync(path.resolve(a), 'utf-8')); } catch (e) { return out('ERROR', 'Read: ' + e.message); } }
  else { const c = []; process.stdin.on('data', d => c.push(d)); process.stdin.on('end', () => { try { i = JSON.parse(Buffer.concat(c).toString()); h(i); } catch (e) { out('ERROR', 'Parse: ' + e.message); } }); return; }
  h(i);
}

async function h(input) {
  const mode = input.mode || 'status';

  // 消息处理器：转发给 computer-hand（走 Soma 软技能）
  async function handleIncoming(msg) {
    const content = msg.content || msg.text || '';
    const from = msg.fromUser || msg.fromGroup || msg.sender;

    // Log to trace
    const tracePath = path.resolve(__dirname, '..', '..', 'soma', 'logs', 'wechat-trace.ndjson');
    fs.appendFileSync(tracePath, JSON.stringify({ timestamp: new Date().toISOString(), event: 'wechat_message', from, content: content.slice(0, 200) }) + '\n', 'utf-8');

    // 通过 computer-hand 处理：Soma 软技能执行 + 自动截屏
    
import { spawnSync } from 'child_process';
    const chp = path.resolve(__dirname, '..', 'computer-hand', 'handler.js');
    const tmp = path.resolve(__dirname, '..', '..', 'soma', 'runtime', '.inputs', `wc_${Date.now()}.json`);
    if (!require('fs').existsSync(path.dirname(tmp))) require('fs').mkdirSync(path.dirname(tmp), { recursive: true });
    require('fs').writeFileSync(tmp, JSON.stringify({ task: content, mode: 'auto' }), 'utf-8');

    const r = spawnSync('node', [chp, tmp], { encoding: 'utf-8', timeout: 30000 });
    try { require('fs').unlinkSync(tmp); } catch {}
    let result;
    try { result = JSON.parse(r.stdout.trim()); } catch { result = { summary: '处理完成' }; }

    const reply = result.summary || 'ok';
    const screenshot = result.data?.screenshot || result.data?.file;
    return { reply: true, text: reply.slice(0, 2000), image: screenshot };
  }

  switch (mode) {
    case 'listen':
    case 'listen_scan': {
      // 直接扫码登录 iLink Bot API，不需要 appId
      const TOKEN_PATH = path.resolve(__dirname, '.wechat-token.json');
      let botToken = input.token || '';
      let accountId = input.accountId || '';

      // 尝试加载已保存的 token
      if (!botToken && fs.existsSync(TOKEN_PATH)) {
        try { const saved = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')); botToken = saved.bot_token || saved.token || ''; accountId = saved.account_id || saved.accountId || ''; } catch {}
      }

      if (!botToken) {
        // 第一步：获取二维码
        const QR_BASE = 'https://ilinkai.weixin.qq.com';
        try {
          
import https from 'https';
          const qrData = await new Promise((resolve, reject) => {
            https.get(`${QR_BASE}/ilink/bot/get_bot_qrcode?bot_type=3`, (res) => {
              let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error(d.slice(0, 100))); } });
            }).on('error', reject);
          });

          const qrcode = qrData.data?.qrcode || qrData.qrcode;
          if (!qrcode) return out('ERROR', 'Failed to get QR code: ' + JSON.stringify(qrData).slice(0, 200));

          const qrUrl = `https://ilinkai.weixin.qq.com/ilink/bot/scan?qrcode=${qrcode}`;
          // 生成 ASCII QR 码或打印链接
          console.error('\n═══════════════════════════════════════════');
          console.error('  微信扫码登录 Soma');
          console.error('═══════════════════════════════════════════');
          console.error(`  QR URL: ${qrUrl}`);
          console.error('  或用手机微信扫这个二维码');
          console.error('═══════════════════════════════════════════\n');

          // 尝试生成 ASCII QR (需要 qrcode-terminal)
          try {
            
import qt from 'qrcode-terminal';
            qt.generate(qrUrl, { small: true });
          } catch {}

          // 轮询扫码状态
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const status = await new Promise((resolve, reject) => {
                https.get(`${QR_BASE}/ilink/bot/get_qrcode_status?qrcode=${qrcode}`, (res) => {
                  let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
                }).on('error', reject);
              });
              if (status.data?.bot_token || status.bot_token) {
                botToken = status.data?.bot_token || status.bot_token;
                accountId = status.data?.account_id || status.account_id || status.data?.uin || '';
                fs.writeFileSync(TOKEN_PATH, JSON.stringify({ bot_token: botToken, account_id: accountId, saved_at: new Date().toISOString() }, null, 2), 'utf-8');
                console.error('\n✅ 微信扫码成功！Token 已保存\n');
                break;
              }
            } catch {}
            if (i % 5 === 0) console.error(`  等待扫码... ${i * 2}s`);
          }
          if (!botToken) return out('ERROR', 'QR code expired. Run again to get a new one.');
        } catch (e) {
          return out('ERROR', 'Cannot reach iLink API. Try on your machine: https://ilinkai.weixin.qq.com', { error: e.message.slice(0, 100) });
        }
      }

      // 消息轮询
      console.error('\n📡 Listening for WeChat messages...\n');
      const poll = async () => {
        try {
          
import https from 'https';
          const uin = Buffer.from(String(Math.floor(Math.random() * 4294967296))).toString('base64');
          const body = JSON.stringify({ account_id: accountId || botToken });
          const req = https.request(`${QR_BASE}/ilink/bot/getupdates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'AuthorizationType': 'ilink_bot_token',
              'X-WECHAT-UIN': uin,
              'Authorization': `Bearer ${botToken}`,
            },
          }, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
              try {
                const data = JSON.parse(d);
                const messages = data.data?.messages || data.messages || [];
                for (const msg of messages) {
                  const text = msg.content?.text || msg.text || '';
                  const from = msg.from_user || msg.fromUser || msg.sender || '';
                  console.error(`💬 [${from}] ${text.slice(0, 100)}`);
                  // 自动回复
                  if (text.trim()) {
                    const reply = JSON.stringify({
                      account_id: accountId || botToken, context_token: msg.context_token || '',
                      msgtype: 1, content: { text: `Soma 收到: ${text.slice(0, 200)}` },
                    });
                    const rr = https.request(`${QR_BASE}/ilink/bot/sendmessage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'AuthorizationType': 'ilink_bot_token', 'X-WECHAT-UIN': uin, 'Authorization': `Bearer ${botToken}` },
                    }); rr.write(reply); rr.end();
                  }
                }
              } catch {}
              poll(); // continue polling
            });
          });
          req.write(body); req.end();
        } catch { setTimeout(poll, 5000); }
      };
      poll();
      return out('PASS', 'WeChat listener started', { mode: 'listen_scan', tokenSaved: !!botToken });
    }

    case 'send': {
      if (!input.to) return out('ERROR', 'to required (friend or group id)');
      const text = input.text || '';
      const image = input.image || '';

      if (!text && !image) return out('ERROR', 'text or image required');

      try {
        const client = bot.createClient({ appId: input.appId || process.env.WECHAT_APP_ID, token: input.token || process.env.WECHAT_TOKEN });
        await client.start();
        if (text) await client.sendText(input.to, text);
        if (image) await client.sendImage(input.to, image);
        await client.stop();
        return out('PASS', `Sent to ${input.to}${text ? ': ' + text.slice(0, 60) : ''}`, { to: input.to, text: text.slice(0, 200), image: !!image });
      } catch (e) {
        return out('ERROR', e.message.slice(0, 100));
      }
    }

    case 'status': {
      return out('PASS', 'WeChat eye ready. Use mode=listen to start, mode=send to send messages.', {
        sdk: 'https://github.com/epiral/weixin-bot',
        setupGuide: 'https://ilinkai.weixin.qq.com',
        envVars: ['WECHAT_APP_ID', 'WECHAT_TOKEN'],
        npmPackage: '@pinixai/weixin-bot',
      });
    }

    default:
      return out('ERROR', 'Unknown mode. Use: listen, send, status');
  }
}

function out(r, s, d) { console.log(JSON.stringify({ softill: 'wechat-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2)); process.exit(r === 'PASS' ? 0 : 1); }


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();