#!/usr/bin/env node
const path=require('path');
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
async function h(input){
  const api=require('./api/connector');const action=input.action||'random';const category=input.category||'inspirational';
  try{
    if(action==='random'||action==='zen'){
      const d=await api.get('https://zenquotes.io/api/random');
      const q=Array.isArray(d)?d[0]:null;
      if(q)return out('PASS',`"${q.q}" — ${q.a}`,{quote:q.q,author:q.a});
    }
    if(action==='daily'){
      const d=await api.get('https://zenquotes.io/api/today');
      const q=Array.isArray(d)?d[0]:null;
      if(q)return out('PASS',`"${q.q}" — ${q.a}`,{quote:q.q,author:q.a,source:'daily'});
    }
    if(action==='programming'||action==='dev'){
      const d=await api.get('https://programming-quotes-api.herokuapp.com/quotes/random');
      if(d)return out('PASS',`"${d.en}" — ${d.author}`,{quote:d.en,author:d.author,source:'programming'});
    }
    if(action==='joke'){
      const d=await api.get('https://v2.jokeapi.dev/joke/Any?type=single');
      if(d?.joke)return out('PASS',d.joke,{joke:d.joke,category:d.category});
      if(d?.setup)return out('PASS',`${d.setup} — ${d.delivery}`,{setup:d.setup,delivery:d.delivery});
    }
    return out('WARN','No quote found');
  }catch(e){return out('ERROR',e.message.slice(0,200))}
}
function out(r,s,d){console.log(JSON.stringify({softill:'quote-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
