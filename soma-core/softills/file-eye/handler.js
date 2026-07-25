#!/usr/bin/env node
/**
 * file-eye — handler.js — 快速文件系统搜索
 */
const fs = require('fs'); const path = require('path');
function main() {
  let i; const a=process.argv[2];
  if(a&&a!=='--'){try{i=JSON.parse(fs.readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}
  else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return;}
  h(i);
}
function h(i){
  const cwd=path.resolve(i.cwd||process.cwd());const name=i.name||i.pattern;i?.name;const ext=i.ext;const type=i.type;const max=i.max||200;const minSize=i.minSize;const maxSize=i.maxSize;const sortBy=i.sortBy||'name';
  const results=[];let skipped=0;
  const dirs=i.dirs||[cwd];
  for(const d of dirs){const fp=path.resolve(d);if(fs.existsSync(fp))walk(fp,results,name,ext,type,cwd,max);}
  // Sort
  if(sortBy==='size')results.sort((a,b)=>b.size-a.size);
  else if(sortBy==='date'||sortBy==='mtime')results.sort((a,b)=>b.mtimeMs-a.mtimeMs);
  else results.sort((a,b)=>a.path.localeCompare(b.path));
  const truncated=results.length>max;const final=results.slice(0,max);
  return out('PASS',`${results.length} files${truncated?' (showing first '+max+')':''}`,{files:final,totalFound:results.length,truncated,searchParams:{name,ext,type,dirs}});
}
function walk(dir,results,name,ext,type,cwd,max){
  try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='dist'||e.name==='build'||e.name==='.git'||e.name==='target')continue;
    const fp=path.join(dir,e.name);
    if(e.isDirectory()){walk(fp,results,name,ext,type,cwd,max);}
    else if(e.isFile()){
      if(ext&&!e.name.endsWith('.'+ext.replace(/^\./,'')))continue;
      if(name&&!e.name.toLowerCase().includes(name.toLowerCase()))continue;
      if(type==='code'&&!/\.(ts|js|jsx|tsx|rs|go|py|rb|java|cs|cpp|c|h|swift|kt)$/.test(e.name))continue;
      if(type==='doc'&&!/\.(md|mdx|txt|json|yaml|yml|toml|ini|cfg|conf)$/.test(e.name))continue;
      const stat=fs.statSync(fp);
      if(minSize!==undefined&&stat.size<minSize)continue;
      if(maxSize!==undefined&&stat.size>maxSize)continue;
      if(results.length>=max)return;
      results.push({name:e.name,path:path.relative(cwd,fp),dir:path.relative(cwd,dir),size:stat.size,ext:path.extname(e.name),mtime:stat.mtime});
    }
  }}catch{}
}
function out(r,s,d){console.log(JSON.stringify({softill:'file-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
