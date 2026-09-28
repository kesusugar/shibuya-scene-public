// Fetch the upstream humanoid source named in assets/character/upstream.lock.json.
//
// Nothing downloaded here is committed. The lock file is the licence record; this script is
// the part that proves the record describes the bytes we actually got. Every file is hashed
// and compared before it is written, so a mirror that changes underneath us fails loudly
// instead of quietly feeding different geometry into the converter.
//
// Text files are compared after normalising line endings, because GitHub mirrors routinely
// rewrite CRLF and the licence wording is what matters, not the newline convention. The lock
// file carries both hashes so the as-shipped CRLF form stays checkable.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';

const LOCK=JSON.parse(readFileSync('assets/character/upstream.lock.json','utf8'));
const OUT='assets/character/upstream';
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=(t,f)=>`https://raw.githubusercontent.com/${t.repo}/${t.commit}/${t.prefix}/${f}`
 .split('/').map((s,i)=>i<5?s:encodeURIComponent(s)).join('/');

let failures=0,fetched=0,cached=0,bytes=0;
for(const pack of LOCK.packs){
 for(const entry of pack.files){
  const target=join(OUT,pack.id,entry.file);
  let body=existsSync(target)?readFileSync(target):null;
  if(body)cached++;
  else{
   const url=raw(pack.transport,entry.file);
   const response=await fetch(url);
   if(!response.ok){console.error(`FAIL ${pack.id}/${entry.file}: HTTP ${response.status} ${url}`);failures++;continue;}
   body=Buffer.from(await response.arrayBuffer());fetched++;
  }
  // Text: accept either newline convention, but only if it maps onto a recorded hash.
  const lf=entry.text?Buffer.from(body.toString('utf8').replace(/\r\n/g,'\n')):body;
  const crlf=entry.text?Buffer.from(lf.toString('utf8').replace(/\n/g,'\r\n')):null;
  const want=[entry.sha256,entry.sha256_lf,entry.sha256_crlf].filter(Boolean);
  const got=[sha(body),entry.text?sha(lf):null,crlf?sha(crlf):null].filter(Boolean);
  if(!want.some(w=>got.includes(w))){
   console.error(`FAIL ${pack.id}/${entry.file}: sha256 ${got.join(' / ')} matches none of ${want.join(' / ')}`);
   failures++;continue;
  }
  if(entry.bytes&&body.length!==entry.bytes&&!entry.text){
   console.error(`FAIL ${pack.id}/${entry.file}: ${body.length} bytes, expected ${entry.bytes}`);failures++;continue;
  }
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body);
  bytes+=body.length;
  console.log(`ok   ${pack.id}/${entry.file}  ${body.length} bytes`);
 }
}
console.log(`\n${fetched} fetched, ${cached} already present, ${(bytes/1048576).toFixed(2)} MiB verified, ${failures} failed`);
if(failures)process.exit(1);
