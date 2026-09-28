// Roadmap ①: the rendered police lines (WAV, from generate.py or audition.py) to MP3.
//
//   node scripts/police-voice/convert.mjs <wav dir> <mp3 dir> [kbps]
//
// Mono, 44.1 kHz, the same encoder the rest of the game's audio went through
// (scripts/convert-audio.mjs). Reads 16-bit PCM or 32-bit float WAV.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import {Mp3Encoder} from '@breezystack/lamejs';

/** PCM samples (Float32Array, mono: the first channel) and the rate from a WAV file's bytes. */
export function readWav(buf){
 let at=12,fmt=null,data=null;
 while(at+8<=buf.length){const id=buf.toString('ascii',at,at+4),size=buf.readUInt32LE(at+4);
  if(id==='fmt ')fmt={format:buf.readUInt16LE(at+8),channels:buf.readUInt16LE(at+10),rate:buf.readUInt32LE(at+12),bits:buf.readUInt16LE(at+22)};
  if(id==='data')data=buf.subarray(at+8,at+8+size);
  at+=8+size+(size&1);}
 if(!fmt||!data)throw new Error('not a WAV file');
 const step=fmt.bits/8*fmt.channels,n=Math.floor(data.length/step),out=new Float32Array(n);
 for(let i=0;i<n;i++)out[i]=fmt.format===3?data.readFloatLE(i*step):data.readInt16LE(i*step)/32768;
 return {samples:out,rate:fmt.rate};
}

/** MP3 bytes for mono float samples. */
export function encodeMp3(samples,rate,kbps=96){
 const enc=new Mp3Encoder(1,rate,kbps),pcm=new Int16Array(samples.length),chunks=[];
 for(let i=0;i<samples.length;i++)pcm[i]=Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767)));
 for(let i=0;i<pcm.length;i+=1152){const b=enc.encodeBuffer(pcm.subarray(i,i+1152));if(b.length)chunks.push(Buffer.from(b));}
 const end=enc.flush();if(end.length)chunks.push(Buffer.from(end));
 return Buffer.concat(chunks);
}

if(import.meta.url===`file://${process.argv[1]}`){
 const [src,dst,kbps='96']=process.argv.slice(2);
 mkdirSync(dst,{recursive:true});
 for(const f of readdirSync(src).filter(f=>f.endsWith('.wav')).sort()){
  const {samples,rate}=readWav(readFileSync(join(src,f)));
  const mp3=encodeMp3(samples,rate,+kbps);
  writeFileSync(join(dst,basename(f,'.wav')+'.mp3'),mp3);
  console.log(f,`${(samples.length/rate).toFixed(2)}s`,`${(mp3.length/1024).toFixed(1)} KB`);
 }
}
