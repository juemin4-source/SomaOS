#!/usr/bin/env node
const path=require('path');
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
async function h(input){
  const api=require('./api/connector');
  const action=input.action||'search';
  try{
    if(action==='search'){if(!input.query)return out('ERROR','query required');const d=await api.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(input.query)}`);const cs=(Array.isArray(d)?d:[]).map(c=>({name:c.name?.common,official:c.name?.official,capital:c.capital?.[0],region:c.region,population:c.population,languages:c.languages?Object.values(c.languages):[],currencies:c.currencies?Object.keys(c.currencies):[],flag:c.flag||c.flags?.png,area:c.area,borders:c.borders||[]}));return out('PASS',`${cs.length} countries matching "${input.query}"`,{countries:cs,count:cs.length});}
    if(action==='all'){const d=await api.get('https://restcountries.com/v3.1/all?fields=name,region,population,flag');const cs=Array.isArray(d)?d.map(c=>({name:c.name?.common,region:c.region,population:c.population,flag:c.flag})).sort((a,b)=>b.population-a.population):[];return out('PASS',`${cs.length} countries`,{countries:cs,count:cs.length});}
    if(action==='code'){if(!input.code)return out('ERROR','code required');const d=await api.get(`https://restcountries.com/v3.1/alpha/${input.code}`);const c=Array.isArray(d)?d[0]:d;return out('PASS',c?.name?.common||'Found',{country:{name:c?.name?.common,capital:c?.capital?.[0],region:c?.region,languages:c?.languages?Object.values(c?.languages):[],currency:c?.currencies?Object.keys(c?.currencies):[],population:c?.population,area:c?.area,flag:c?.flag,map:c?.maps?.googleMaps}});}
    return out('ERROR','Unknown action');
  }catch(e){return out('ERROR',e.message.slice(0,200))}
}
function out(r,s,d){console.log(JSON.stringify({softill:'country-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
