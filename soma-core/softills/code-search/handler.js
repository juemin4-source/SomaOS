#!/usr/bin/env node
/**
 * code-search — handler.js — 源码搜索（比 grep -r 快）
 */
const fs = require('fs'); const path = require('path');
function main() {
  let i; const a=process.argv[2];
  if(a&&a!=='--'){try{i=JSON.parse(fs.readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}
  else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return;}
  h(i);
}
function h(i){
  const cwd=path.resolve(i.cwd||process.cwd());const pattern=i.pattern||i.query;const ext=i.ext||['.ts','.tsx','.js','.jsx','.rs','.go','.py','.rb','.java','.cs','.md','.json','.yaml','.css','.scss'];const context=i.context||0;const max=i.max||100;const ignoreCase=i.ignoreCase!==false;
  if(!pattern)return out('ERROR','pattern required');
  const regex=new RegExp(pattern,ignoreCase?'gi':'g');const results=[];let totalMatches=0;let filesScanned=0;
  const dirs=i.dirs||[cwd];
  for(const d of dirs){const fp=path.resolve(d);if(fs.existsSync(fp))walk(fp,results,regex,ext,cwd,max);}
  const truncated=results.length>max;const final=results.slice(0,max);
  totalMatches=final.reduce((s,r)=>s+r.matches.length,0);filesScanned=results.length;
  return out('PASS',`${totalMatches} matches in ${final.length} files${truncated?' (showing first '+max+')':''}`,{results:final,totalMatches,filesScanned,truncated,pattern});
}
function walk(dir,results,regex,exts,cwd,max){
  try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='dist'||e.name==='build'||e.name==='.git'||e.name==='target'||e.name==='.next'||e.name==='.cache')continue;
    const fp=path.join(dir,e.name);
    if(e.isDirectory()){walk(fp,results,regex,exts,cwd,max);}
    else if(e.isFile()){
      const found=exts.some(ex=>e.name.endsWith(ex.startsWith('.')?ex:'.'+ex));
      if(!found)continue;
      try{
        const c=fs.readFileSync(fp,'utf-8');const rel=path.relative(cwd,fp);
        const lines=c.split('\n');const matches=[];
        for(let li=0;li<lines.length;li++){
          regex.lastIndex=0;
          if(regex.test(lines[li])){
            const start=Math.max(0,li-0);const end=Math.min(lines.length,li+1);
            matches.push({line:li+1,content:lines[li].trim().slice(0,200),context:i=>{
              const s=Math.max(0,li-(context||0));const e=Math.min(lines.length,li+1+(context||0));
              return lines.slice(s,e).map((l,j)=>`${s+j+1}: ${l}`).join('\n');
            }});
            if(results.length>=max)return;
          }
        }
        if(matches.length>0)results.push({file:rel,matches:matches.slice(0,20),matchCount:matches.length});
      }catch{}
    }
  }}catch{}
}
function out(r,s,d){console.log(JSON.stringify({softill:'code-search',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
