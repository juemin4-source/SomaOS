#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


import path from 'path';
import https from 'https';

const require = createRequire(import.meta.url);
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
function h(input){
  const key=input.apiKey||'sk-33d194fa0cfd4824bec308dbe1579d48';
  https.get('https://api.deepseek.com/user/balance',{headers:{'Authorization':'Bearer '+key,'Accept':'application/json'}},(res)=>{
    let d='';res.on('data',c=>d+=c);res.on('end',()=>{
      try{
        const j=JSON.parse(d);
        if(j.balance_infos&&j.balance_infos.length>0){
          const b=j.balance_infos[0];
          return out('PASS',`余额 ¥${b.total_balance} (已用 ¥${(parseFloat(b.total_balance)-parseFloat(b.topped_up_balance)).toFixed(2)})`,{
            available:j.is_available,totalBalance:parseFloat(b.total_balance),grantedBalance:parseFloat(b.granted_balance),toppedUp:parseFloat(b.topped_up_balance),currency:b.currency,
          });
        }
        return out('PASS','Balance info',j);
      }catch(e){return out('ERROR','Parse: '+e.message)}
    });
  }).on('error',e=>out('ERROR',e.message));
}
function out(r,s,d){console.log(JSON.stringify({softill:'balance-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();