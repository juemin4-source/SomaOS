#!/usr/bin/env node
/**
 * file-to-md — handler.js — 任意文件转 Markdown
 */
const fs=require('fs');const path=require('path');
function main(){let i;const a=process.argv[2];
if(a&&a!=='--'){try{i=JSON.parse(fs.readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}
else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return;}
h(i);}
function h(input){
  const file=input.file;const content=input.content;const outputDir=input.outputDir?path.resolve(input.outputDir):null;
  if(!file&&!content)return out('ERROR','file or content required');
  let text='';let fileName='unknown';const conversions=[];
  const files=file?(Array.isArray(file)?file:[file]):[];
  for(const f of files){
    const fp=path.resolve(f);if(!fs.existsSync(fp))continue;
    const c=fs.readFileSync(fp,'utf-8');const name=path.basename(fp);const ext=path.extname(fp);
    const md=convertToMd(c,name,ext);fileName=name;
    conversions.push({file:f,name,size:c.length,mdLength:md.length,md});
    if(outputDir&&conversions.length===1){const outPath=path.join(outputDir,name+'.md');fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(outPath,md,'utf-8');}
  }
  if(content){const md=convertToMd(content,'input.txt','.txt');conversions.push({name:'input',size:content.length,mdLength:md.length,md});}
  return out('PASS',`${conversions.length} file(s) converted`,{conversions,conversionCount:conversions.length,outputDir});
}
function convertToMd(c,name,ext){
  const langMap={'js':'javascript','ts':'typescript','jsx':'jsx','tsx':'tsx','json':'json','yaml':'yaml','yml':'yaml','toml':'toml','css':'css','scss':'scss','html':'html','xml':'xml','md':'markdown','py':'python','rb':'ruby','rs':'rust','go':'go','java':'java','cs':'csharp','cpp':'cpp','c':'c','h':'c','sh':'bash','bash':'bash','ps1':'powershell','sql':'sql','graphql':'graphql','env':'ini','ini':'ini','cfg':'ini','conf':'ini','dockerfile':'dockerfile','gitignore':'gitignore','tsconfig':'json','prettierrc':'json','eslintrc':'json'};
  const lang=langMap[ext.replace(/^\./,'')]||'';
  if(ext==='.md'||ext==='.mdx')return c;
  if(ext==='.csv'){const lines=c.split('\n');let md='| '+lines[0].split(',').join(' | ')+' |\n|'+lines[0].split(',').map(()=>'---').join('|')+'|\n';for(let i=1;i<Math.min(lines.length,50);i++){md+='| '+lines[i].split(',').join(' | ')+' |\n';}return md;}
  if(ext==='.json'){try{const parsed=JSON.parse(c);return '```json\n'+JSON.stringify(parsed,null,2)+'\n```';}catch{}}
  return '```'+lang+'\n'+c+'\n```';
}
function out(r,s,d){console.log(JSON.stringify({softill:'file-to-md',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
