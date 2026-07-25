#!/usr/bin/env node
const path=require('path');
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
async function h(input){
  const api=require('./api/connector');
  const coin=input.coin||input.currency||'bitcoin';
  const vs=input.vs||input.vsCurrency||'usd';
  try{
    const d=await api.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=${vs}&include_24hr_change=true&include_market_cap=true`);
    const data=d?.[coin];
    if(!data)return out('WARN',`${coin} not found`,{available:'Try: bitcoin,ethereum,cardano,solana,dogecoin,polkadot'});
    return out('PASS',`${coin}: ${data[vs]} (24h: ${data[`${vs}_24h_change`]?.toFixed(2)}%)`,{
      coin,price:data[vs],change24h:data[`${vs}_24h_change`],marketCap:data[`${vs}_market_cap`],vsCurrency:vs,
    });
  }catch(e){return out('ERROR',e.message.slice(0,200))}
}
function out(r,s,d){console.log(JSON.stringify({softill:'crypto-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
