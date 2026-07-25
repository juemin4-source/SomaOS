#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * token-counter — handler.js
 *
 * 离线 Token 计数。调用本地 DeepSeek V3 tokenizer（Python）。
 * 不联网，不计费，精准计算 tokens。
 *
 * 输入: { text, file?, mode: "count" | "encode" }
 * 输出: { tokens, chars, breakdown? }
 *
 * 用法: node handler.js <input-json>
 */


import path from 'path';
import {execSync} from 'child_process';

const require = createRequire(import.meta.url);
const TOKENIZER_DIR='F:/04_临时/deepseek_v3_tokenizer/deepseek_v3_tokenizer';

function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
function h(input){
  const text=input.text||(input.file?require('fs').readFileSync(path.resolve(input.file),'utf-8'):'');
  const mode=input.mode||'count';
  if(!text)return out('ERROR','text or file required');
  try{
    // Write text to temp file for Python to read
    const tmp=path.resolve(__dirname,'..','..','soma','runtime','.inputs',`tok_${Date.now()}.txt`);
    require('fs').writeFileSync(tmp,text,'utf-8');
    const pyScript=`
import sys;sys.path.insert(0,'${TOKENIZER_DIR.replace(/\\/g,'\\\\')}')
import transformers
tok=transformers.AutoTokenizer.from_pretrained('${TOKENIZER_DIR.replace(/\\/g,'\\\\')}',trust_remote_code=True)
with open('${tmp.replace(/\\/g,'\\\\')}','r',encoding='utf-8') as f:t=f.read()
ids=tok.encode(t)
print(len(ids))
`;
    const result=execSync(`python -c "${pyScript.replace(/\n/g,';')}"`,{encoding:'utf-8',timeout:15000}).trim();
    try{require('fs').unlinkSync(tmp);}catch{}
    const tokens=parseInt(result);
    if(isNaN(tokens))return out('ERROR','Tokenizer failed: '+result.slice(0,100));
    const chars=text.length;
    return out('PASS',`${tokens} tokens, ${chars} chars (ratio ${(tokens/chars).toFixed(2)})`,{tokens,chars,ratio:tokens/chars,mode:'offline'});
  }catch(e){
    // Fallback: estimate from char count
    const chars=text.length;
    const estimated=Math.ceil(chars*0.35); // ~0.35 tokens/char for Chinese
    return out('WARN',`${estimated} tokens (estimated, tokenizer unavailable)`,{tokens:estimated,chars,ratio:(estimated/chars),mode:'estimated',error:e.message.slice(0,100)});
  }
}
function out(r,s,d){console.log(JSON.stringify({softill:'token-counter',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}


// ESM CLI entry point
const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();