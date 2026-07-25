#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * format-code — handler.js — 代码格式化（基于 prettier）
 */

import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
function main(){let i;const a=process.argv[2];
if(a&&a!=='--'){try{i=JSON.parse(fs.readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}
else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return;}
h(i);}
function h(input){
  const file=input.file;const content=input.content;const lang=input.lang||'json';const write=input.write===true;
  let prettier;try{prettier=require('prettier')}catch(e){return out('ERROR','prettier not installed (npm install prettier)')}
  const parserMap={'json':'json','js':'babel','ts':'typescript','jsx':'babel','tsx':'typescript','css':'css','scss':'scss','html':'html','yaml':'yaml','yml':'yaml','md':'markdown','markdown':'markdown','graphql':'graphql'};
  const parser=parserMap[lang]||lang;
  const results=[];let formattedCount=0;
  if(content){
    try{const f=prettier.format(content,{parser,printWidth:input.printWidth||120,singleQuote:input.singleQuote!==false,trailingComma:'all'});results.push({input:content.length,output:f.length,diff:f.length-content.length,formatted:f,lang});formattedCount++;}
    catch(e){return out('ERROR','Format error: '+e.message)}
  }
  if(file){
    const files=Array.isArray(file)?file:[file];
    for(const f of files){
      const fp=path.resolve(f);if(!fs.existsSync(fp))continue;
      const c=fs.readFileSync(fp,'utf-8');const ext=path.extname(fp).replace(/^\./,'');
      const p=parserMap[ext]||ext;
      try{
        const formatted=prettier.format(c,{parser:p,printWidth:120,singleQuote:true,trailingComma:'all'});
        results.push({file:f,inputBytes:c.length,outputBytes:formatted.length,diff:formatted.length-c.length,changed:c!==formatted,formatted});
        if(write&&c!==formatted){fs.writeFileSync(fp,formatted,'utf-8');}
        formattedCount++;
      }catch(e){results.push({file:f,error:e.message.slice(0,100)});}
    }
  }
  return out('PASS',`${formattedCount} file(s) formatted`,{results,formatCount:formattedCount,writeMode:write});
}
function out(r,s,d){console.log(JSON.stringify({softill:'format-code',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();