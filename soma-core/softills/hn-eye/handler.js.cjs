#!/usr/bin/env node
const path=require('path');
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
async function h(input){
  const api=require('./api/connector');
  const action=input.action||'top';
  const limit=input.limit||10;
  try{
    if(action==='top'){
      const ids=await api.get('https://hacker-news.firebaseio.com/v0/topstories.json');
      const stories=[];const items=Array.isArray(ids)?ids.slice(0,limit):[];
      for(const id of items){try{const s=await api.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);stories.push({id:s.id,title:s.title?.slice(0,200),by:s.by,score:s.score,comments:s.descendants,url:s.url||`https://news.ycombinator.com/item?id=${s.id}`})}catch{}}
      return out('PASS',`Top ${stories.length} HN stories`,{stories,count:stories.length});
    }
    if(action==='new'){const ids=await api.get('https://hacker-news.firebaseio.com/v0/newstories.json');const items=Array.isArray(ids)?ids.slice(0,limit):[];return out('PASS',`${items.length} new story IDs`,{ids:items});}
    if(action==='item'||action==='story'){if(!input.id)return out('ERROR','id required');const s=await api.get(`https://hacker-news.firebaseio.com/v0/item/${input.id}.json`);return out('PASS',s.title?.slice(0,100)||'Story',{story:s});}
    if(action==='user'){if(!input.name)return out('ERROR','name required');const u=await api.get(`https://hacker-news.firebaseio.com/v0/user/${input.name}.json`);return out('PASS',`${u.id}: ${u.karma} karma`,{user:u});}
    return out('ERROR',`Unknown action: ${action}`);
  }catch(e){return out('ERROR',e.message.slice(0,200))}
}
function out(r,s,d){console.log(JSON.stringify({softill:'hn-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
