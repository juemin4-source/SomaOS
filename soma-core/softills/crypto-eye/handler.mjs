#!/usr/bin/env node
/**
 * crypto-eye — handler.mjs
 * 通过 CoinGecko API 查询加密货币价格
 */
import { get } from '../_shared/connector.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(readFileSync(resolve(a), 'utf-8')); }
    catch (e) { return out('ERROR', 'Read: ' + e.message); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); handle(input); }
      catch (e) { out('ERROR', 'Parse: ' + e.message); }
    });
    return;
  }
  handle(input);
}

async function handle(input) {
  const coin = input.coin || input.currency || 'bitcoin';
  const vs = input.vs || input.vsCurrency || 'usd';
  try {
    const d = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=${vs}&include_24hr_change=true&include_market_cap=true`);
    const data = d?.[coin];
    if (!data) return out('WARN', `${coin} not found`, { available: 'Try: bitcoin,ethereum,cardano,solana,dogecoin,polkadot' });
    return out('PASS', `${coin}: ${data[vs]} (24h: ${data[`${vs}_24h_change`]?.toFixed(2)}%)`, {
      coin, price: data[vs], change24h: data[`${vs}_24h_change`], marketCap: data[`${vs}_market_cap`], vsCurrency: vs,
    });
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'crypto-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
