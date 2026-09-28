// Fetch the upstream audio named in assets/audio/upstream.lock.json (RUN 12.1).
//
// Nothing downloaded here is committed. The lock file is the licence record and this script
// proves it describes the bytes we actually got: every file is hashed before it is written, so
// a source that changes underneath us fails loudly instead of feeding different sound into the
// converter. The converted clips in public/audio/ are what the repository ships.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';

export const AUDIO_LOCK_PATH='assets/audio/upstream.lock.json';
export const AUDIO_UPSTREAM='assets/audio/upstream';
// Freesound's CDN refuses requests without a browser-like agent.
const HEADERS={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export const upstreamFile=source=>join(AUDIO_UPSTREAM,source.id+(source.transport.url.endsWith('.zip')?'.zip':'.mp3'));

async function main(){
 const lock=JSON.parse(readFileSync(AUDIO_LOCK_PATH,'utf8'));
 mkdirSync(AUDIO_UPSTREAM,{recursive:true});
 let failures=0,fetched=0,cached=0,bytes=0;
 for(const source of lock.sources){
  if(source.licence!=='CC0-1.0'){console.error(`FAIL ${source.id}: licence ${source.licence} is not CC0-1.0`);failures++;continue;}
  const target=upstreamFile(source);
  let body=existsSync(target)?readFileSync(target):null;
  if(body&&sha(body)!==source.transport.sha256)body=null;      // a stale cache is refetched
  if(body)cached++;
  else{
   const response=await fetch(source.transport.url,{headers:HEADERS});
   if(!response.ok){console.error(`FAIL ${source.id}: HTTP ${response.status} ${source.transport.url}`);failures++;continue;}
   body=Buffer.from(await response.arrayBuffer());fetched++;
   if(sha(body)!==source.transport.sha256){
    console.error(`FAIL ${source.id}: sha256 ${sha(body)} != ${source.transport.sha256}`);failures++;continue;}
   writeFileSync(target,body);
  }
  bytes+=body.length;
 }
 console.log(`audio upstream: ${fetched} fetched, ${cached} cached, ${(bytes/1e6).toFixed(1)} MB, ${failures} failures`);
 if(failures)process.exit(1);
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
