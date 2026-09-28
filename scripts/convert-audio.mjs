// Convert the verified upstream audio into the clips the scene ships (RUN 12.1).
//
//   npm run fetch:audio && npm run convert:audio
//
// Nobody on this project can be assumed to have listened to every source, so the conversion
// makes the mix sane by measurement instead of by ear:
//  - decoded at 44.1 kHz by a headless Chrome (the same decoder the game uses), so MP3 and the
//    Kenney OGG files arrive as the same PCM;
//  - cut to the lock's window, then trimmed to the sound (leading and trailing silence off);
//  - one-shots normalised on their loudest 50 ms, loops on their whole length, peaks capped;
//  - loops made seamless by crossfading the tail into the head;
//  - encoded to MP3 (every browser decodes it; Safari does not decode Ogg Vorbis everywhere);
//  - decoded AGAIN to measure the encoder's lead-in, so a punch starts on the frame it lands.
//
// Chrome is found by scripts/lib/headless-chrome.mjs (CHROME_PATH, then the usual places).
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {Mp3Encoder} from '@breezystack/lamejs';
import {openPage} from './lib/headless-chrome.mjs';
import {AUDIO_LOCK_PATH,upstreamFile} from './fetch-audio-upstream.mjs';

export const OUT='public/audio';
export const RATE=44100;
// Targets, dBFS. One-shots are measured on their loudest 50 ms window (what the ear hears as
// "how loud is that hit"); loops on their whole length (what a bed sounds like under play).
export const TARGET={oneShot:-12,ambience:-20,crossing:-16,peak:-1};
const KBPS={1:96,2:112};
const db=v=>20*Math.log10(Math.max(v,1e-9)),lin=d=>10**(d/20);

/** Everything in a zip, by name. Only stored and deflated members (what Kenney ships). */
export function unzip(buffer){
 const out=new Map();let end=buffer.length-22;
 while(end>=0&&buffer.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw new Error('not a zip');
 let at=buffer.readUInt32LE(end+16);const count=buffer.readUInt16LE(end+10);
 for(let n=0;n<count;n++){
  const method=buffer.readUInt16LE(at+10),size=buffer.readUInt32LE(at+20),nameLen=buffer.readUInt16LE(at+28);
  const extraLen=buffer.readUInt16LE(at+30),commentLen=buffer.readUInt16LE(at+32),local=buffer.readUInt32LE(at+42);
  const name=buffer.toString('utf8',at+46,at+46+nameLen);
  const dataAt=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
  const data=buffer.subarray(dataAt,dataAt+size);
  if(method===0||method===8)out.set(name,method===8?inflateRawSync(data):Buffer.from(data));
  at+=46+nameLen+extraLen+commentLen;
 }
 return out;
}

/** A headless Chrome page that decodes audio bytes to PCM with the Web Audio decoder. */
async function openDecoder(){
 const {evaluate,close}=await openPage();
 // The decoded window stays in the page and is pulled out in chunks: one message carrying a
 // whole stereo bed (~40 MB of float samples) stalls the DevTools socket.
 await evaluate(`window.__decode=async(b64,channels,start,end)=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const ctx=new OfflineAudioContext(channels,1,${RATE});const buf=await ctx.decodeAudioData(bytes.buffer);
  const a=Math.max(0,Math.round(start*buf.sampleRate)),b=end<0?buf.length:Math.min(buf.length,Math.round(end*buf.sampleRate));
  window.__pcm=[];for(let c=0;c<channels;c++)window.__pcm.push(buf.getChannelData(Math.min(c,buf.numberOfChannels-1)).slice(a,b));
  return {rate:buf.sampleRate,sourceChannels:buf.numberOfChannels,length:b-a};};
 window.__chunk=(c,at,count)=>{const d=window.__pcm[c],u=new Uint8Array(d.buffer,at*4,Math.min(count,d.length-at)*4);
  let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};`);
 const CHUNK=1<<19;
 return {
  async decode(bytes,channels,start=0,end=-1){
   const v=await evaluate(`__decode(${JSON.stringify(Buffer.from(bytes).toString('base64'))},${channels},${start},${end})`);
   if(v.rate!==RATE)throw new Error('unexpected decode rate '+v.rate);
   const out=[];
   for(let c=0;c<channels;c++){const pcm=new Float32Array(v.length);
    for(let at=0;at<v.length;at+=CHUNK){const buf=Buffer.from(await evaluate(`__chunk(${c},${at},${CHUNK})`),'base64');
     pcm.set(new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)),at);}
    out.push(pcm);}
   return out;
  },
  close
 };
}

const peakOf=ch=>{let p=0;for(const d of ch)for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));return p;};
const rmsOf=(ch,a=0,b=ch[0].length)=>{let s=0,n=0;for(const d of ch){for(let i=a;i<b;i++)s+=d[i]*d[i];n+=b-a;}return Math.sqrt(s/Math.max(1,n));};
/** Loudest short-term RMS: the level of the hit itself, not of the silence around it. */
export function shortTermMax(ch,win=Math.round(RATE*.05)){
 let best=0;const hop=Math.max(1,win>>2);
 for(let a=0;a+win<=ch[0].length;a+=hop)best=Math.max(best,rmsOf(ch,a,a+win));
 return best||rmsOf(ch);
}
/** Trim to the sound: leading and trailing silence relative to the clip's own peak. */
export function trimSilence(ch,{pre=.003,floor=.03,tail=.012}={}){
 const peak=peakOf(ch),on=Math.max(.004,peak*floor),off=Math.max(.002,peak*tail),n=ch[0].length;
 let first=0,last=n-1;const loud=(i,t)=>ch.some(d=>Math.abs(d[i])>t);
 while(first<n&&!loud(first,on))first++;
 while(last>first&&!loud(last,off))last--;
 const a=Math.max(0,first-Math.round(pre*RATE)),b=Math.min(n,last+1);
 return ch.map(d=>d.slice(a,b));
}
function fade(ch,inS,outS){
 const n=ch[0].length,fi=Math.min(n,Math.round(inS*RATE)),fo=Math.min(n,Math.round(outS*RATE));
 for(const d of ch){for(let i=0;i<fi;i++)d[i]*=i/fi;for(let i=0;i<fo;i++)d[n-1-i]*=i/fo;}
}
/** Seamless loop: the last `seconds` crossfade (equal power) into the first. */
export function loopCrossfade(ch,seconds){
 const n=ch[0].length,f=Math.min(Math.floor(n/3),Math.round(seconds*RATE));
 return ch.map(d=>{const out=d.slice(0,n-f);
  for(let i=0;i<f;i++){const u=i/f;out[i]=d[i]*Math.sin(u*Math.PI/2)+d[n-f+i]*Math.cos(u*Math.PI/2);}
  return out;});
}
function encode(ch){
 const enc=new Mp3Encoder(ch.length,RATE,KBPS[ch.length]),parts=[];
 const toI16=d=>{const o=new Int16Array(d.length);for(let i=0;i<d.length;i++)o[i]=Math.max(-32768,Math.min(32767,Math.round(d[i]*32767)));return o;};
 const pcm=ch.map(toI16);
 for(let i=0;i<pcm[0].length;i+=1152){
  const l=pcm[0].subarray(i,i+1152),r=pcm[1]?.subarray(i,i+1152);
  const b=r?enc.encodeBuffer(l,r):enc.encodeBuffer(l);if(b.length)parts.push(Buffer.from(b));
 }
 const f=enc.flush();if(f.length)parts.push(Buffer.from(f));
 return Buffer.concat(parts);
}
/** Where the encoded clip really starts: encoder priming shifts it by ~25 ms. */
function leadOf(decoded,reference){
 const target=Math.max(.004,peakOf(reference)*.03);
 const firstOf=ch=>{for(let i=0;i<ch[0].length;i++)if(ch.some(d=>Math.abs(d[i])>target))return i;return 0;};
 return Math.max(0,firstOf(decoded)-firstOf(reference))/RATE;
}

async function main(){
 const lock=JSON.parse(readFileSync(AUDIO_LOCK_PATH,'utf8'));
 const sources=new Map(lock.sources.map(s=>[s.id,s]));
 const zips=new Map();
 mkdirSync(OUT,{recursive:true});
 // A filtered run (AUDIO_ONLY, for debugging one clip) writes to a scratch folder instead:
 // it must never delete or re-list the clips it was not asked about.
 const out=process.env.AUDIO_ONLY?join(process.env.TMPDIR??'/tmp','shibuya-audio-only'):OUT;
 mkdirSync(out,{recursive:true});
 if(!process.env.AUDIO_ONLY)for(const f of readdirSync(OUT))if(f.endsWith('.mp3'))rmSync(join(OUT,f));
 const decoder=await openDecoder();
 const clips=[];
 try{
  const only=process.env.AUDIO_ONLY?new RegExp(process.env.AUDIO_ONLY):null;
  for(const clip of lock.clips){
   if(only&&!only.test(clip.name))continue;
   if(process.env.AUDIO_VERBOSE)console.log('..',clip.name);
   const source=sources.get(clip.source);if(!source)throw new Error(`${clip.name}: unknown source ${clip.source}`);
   let bytes=readFileSync(upstreamFile(source));
   if(clip.member){if(!zips.has(source.id))zips.set(source.id,unzip(bytes));bytes=zips.get(source.id).get(clip.member);
    if(!bytes)throw new Error(`${clip.name}: ${clip.member} not in ${source.id}`);}
   const channels=clip.channels??1,loop=!!clip.loop;
   let ch=await decoder.decode(bytes,channels,clip.start??0,clip.end??-1);
   if(!loop){ch=trimSilence(ch);fade(ch,.002,.02);}
   else ch=loopCrossfade(ch,clip.kind==='ambience'?1.2:.06);
   const target=loop?(clip.kind==='ambience'?TARGET.ambience:TARGET.crossing):TARGET.oneShot;
   const measured=loop?rmsOf(ch):shortTermMax(ch);
   let gain=lin(target)/Math.max(measured,1e-6);
   const peak=peakOf(ch)*gain;if(peak>lin(TARGET.peak))gain*=lin(TARGET.peak)/peak;
   for(const d of ch)for(let i=0;i<d.length;i++)d[i]*=gain;
   const mp3=encode(ch),file=`${clip.name}.mp3`;writeFileSync(join(out,file),mp3);
   const back=await decoder.decode(mp3,channels);
   const lead=loop?0:leadOf(back,ch);
   const duration=ch[0].length/RATE;
   clips.push({name:clip.name,kind:clip.kind,file,loop,channels,duration:+duration.toFixed(4),lead:+lead.toFixed(4),
    gainDb:+db(gain).toFixed(2),levelDb:+db(loop?rmsOf(ch):shortTermMax(ch)).toFixed(2),peakDb:+db(peakOf(ch)).toFixed(2),bytes:mp3.length,
    source:{id:source.id,title:source.title,author:source.author,page:source.source_page,licence:source.licence}});
   console.log(`${clip.name.padEnd(18)} ${duration.toFixed(2).padStart(6)} s  gain ${db(gain).toFixed(1).padStart(6)} dB  lead ${(lead*1000).toFixed(0).padStart(3)} ms  ${(mp3.length/1024).toFixed(0).padStart(4)} KB`);
  }
 }finally{decoder.close();}
 // The encoder's priming delay is a constant of the encoder, not of the sound: measure it on
 // the one-shots (a clear onset) and give every loop the same start, so its loop points skip it.
 const leads=clips.filter(c=>!c.loop).map(c=>c.lead).sort((a,b)=>a-b);
 const encoderDelay=leads.length?leads[leads.length>>1]:0;
 for(const c of clips)if(c.loop){c.lead=encoderDelay;c.loopStart=encoderDelay;c.loopEnd=+(encoderDelay+c.duration).toFixed(4);}
 const manifest={version:1,rate:RATE,targets:TARGET,encoderDelay,generator:'scripts/convert-audio.mjs',clips};
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
 const total=clips.reduce((s,c)=>s+c.bytes,0);
 console.log(`${clips.length} clips, ${(total/1e6).toFixed(2)} MB`);
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
