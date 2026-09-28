// Fetch the upstream ground textures named in assets/textures/upstream.lock.json (RUN 12.3).
//
// As with the audio: nothing downloaded here is committed, every file is hashed against the
// lock before it is kept, and a licence other than CC0-1.0 stops the run.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';

export const TEXTURE_LOCK_PATH='assets/textures/upstream.lock.json';
export const TEXTURE_UPSTREAM='assets/textures/upstream';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const upstreamTexture=(source,file)=>join(TEXTURE_UPSTREAM,`${source.id}_${file.role}.jpg`);

async function main(){
 const lock=JSON.parse(readFileSync(TEXTURE_LOCK_PATH,'utf8'));
 mkdirSync(TEXTURE_UPSTREAM,{recursive:true});
 let failures=0,fetched=0,cached=0,bytes=0;
 for(const source of lock.sources){
  if(source.licence!=='CC0-1.0'){console.error(`FAIL ${source.id}: licence ${source.licence}`);failures++;continue;}
  for(const file of source.files){
   const target=upstreamTexture(source,file);
   let body=existsSync(target)?readFileSync(target):null;
   if(body&&sha(body)!==file.sha256)body=null;
   if(body)cached++;
   else{
    const response=await fetch(file.url);
    if(!response.ok){console.error(`FAIL ${source.id}/${file.role}: HTTP ${response.status}`);failures++;continue;}
    body=Buffer.from(await response.arrayBuffer());fetched++;
    if(sha(body)!==file.sha256){console.error(`FAIL ${source.id}/${file.role}: sha256 ${sha(body)} != ${file.sha256}`);failures++;continue;}
    writeFileSync(target,body);
   }
   bytes+=body.length;
  }
 }
 console.log(`texture upstream: ${fetched} fetched, ${cached} cached, ${(bytes/1e6).toFixed(1)} MB, ${failures} failures`);
 if(failures)process.exit(1);
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
