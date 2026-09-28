import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSoundBank,MIX} from '../src/audio/bank.mjs';
import {createSoundscape,SCAPE} from '../src/audio/soundscape.mjs';
import {createCrowdVoices,recordedKind} from '../src/player/voices.mjs';

const manifest=JSON.parse(readFileSync('public/audio/manifest.json','utf8'));
const lock=JSON.parse(readFileSync('assets/audio/upstream.lock.json','utf8'));

/** A Web Audio stand-in that records what was built and lets a test end sources. */
function fakeContext(){
 const log={sources:[],panners:0,loops:0,listener:null};
 const param=v=>({value:v,setTargetAtTime(x){this.value=x;},setValueAtTime(x){this.value=x;},linearRampToValueAtTime(x){this.value=x;},cancelScheduledValues(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},gain:param(1),pan:param(0)});
 const ctx={state:'running',currentTime:0,sampleRate:44100,destination:node(),
  listener:{positionX:param(0),positionY:param(0),positionZ:param(0),forwardX:param(0),forwardY:param(0),forwardZ:param(-1),upX:param(0),upY:param(1),upZ:param(0)},
  createGain:node,createStereoPanner:node,
  createDynamicsCompressor(){return {...node(),threshold:param(0),ratio:param(1),attack:param(0),release:param(0)};},
  createPanner(){log.panners++;return {...node(),positionX:param(0),positionY:param(0),positionZ:param(0)};},
  createBufferSource(){const s={...node(),playbackRate:param(1),loop:false,start(at,offset){s.started={at,offset};},stop(){},onended:null};log.sources.push(s);if(s.loop)log.loops++;return s;},
  decodeAudioData:async bytes=>({duration:1,byteLength:bytes.byteLength})};
 return {ctx,log};
}
const fetchFrom=dir=>async url=>{const path=dir+url.replace(/^audio\//,'');
 if(!existsSync(path))return {ok:false,status:404};const b=readFileSync(path);
 return {ok:true,status:200,json:async()=>JSON.parse(b.toString('utf8')),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};

test('every shipped clip is CC0, traced to a locked source, and on disk with its recorded size',()=>{
 const sources=new Map(lock.sources.map(s=>[s.id,s]));
 assert.equal(manifest.clips.length,lock.clips.length);
 for(const s of lock.sources){
  assert.equal(s.licence,'CC0-1.0',s.id);
  assert.match(s.licence_url,/creativecommons\.org\/publicdomain\/zero\/1\.0/);
  assert.match(s.transport.sha256,/^[0-9a-f]{64}$/);
 }
 for(const clip of manifest.clips){
  const source=sources.get(clip.source.id);
  assert.ok(source,`${clip.name} names an unlocked source`);
  assert.equal(clip.source.licence,'CC0-1.0');
  const file=`public/audio/${clip.file}`;
  assert.ok(existsSync(file),file);
  assert.equal(statSync(file).size,clip.bytes,`${clip.name} changed since conversion`);
  assert.ok(clip.peakDb<=manifest.targets.peak+.05,`${clip.name} peaks at ${clip.peakDb} dBFS`);
  if(clip.loop)assert.ok(clip.loopEnd>clip.loopStart,`${clip.name} loop points`);
 }
 const total=manifest.clips.reduce((s,c)=>s+c.bytes,0);
 assert.ok(total<2.5e6,`${(total/1e6).toFixed(2)} MB of audio; this loads after a gesture, but keep it bounded`);
});

test('one-shots are normalised to one loudness, so the mix is relative levels only',()=>{
 for(const clip of manifest.clips.filter(c=>!c.loop)){
  // Clips whose peak cap stopped them reaching the target sit below it, never above.
  assert.ok(clip.levelDb<=manifest.targets.oneShot+.3,`${clip.name} ${clip.levelDb} dBFS`);
  assert.ok(clip.levelDb>manifest.targets.oneShot-9,`${clip.name} is far too quiet (${clip.levelDb} dBFS)`);
 }
});

test('variants rotate, detune stays small, and the per-kind and total caps hold',async()=>{
 const {ctx,log}=fakeContext();
 const bank=createSoundBank(()=>ctx,{base:'audio/',fetchImpl:fetchFrom('public/audio/')});
 assert.equal(bank.play('punch',{x:0,z:0}),null,'not ready yet: the caller keeps its synthesis');
 assert.ok(await bank.load());
 const clips=[];
 for(let i=0;i<MIX.perKind;i++)clips.push(bank.play('punch',{x:i,z:0}).clip);
 for(let i=1;i<clips.length;i++)assert.notEqual(clips[i],clips[i-1],'the same clip twice running');
 assert.equal(bank.play('punch',{x:0,z:0}),null,'a fifth punch while four ring');
 for(const s of log.sources){const r=s.playbackRate.value;assert.ok(r>=1-MIX.detune-1e-9&&r<=1+MIX.detune+1e-9,`rate ${r}`);}
 // Ending the sources frees their slots and disconnects them.
 for(const s of log.sources)s.onended?.();
 assert.ok(bank.play('punch',{x:0,z:0}),'slots are released when a clip ends');
 let played=0;for(let i=0;i<200;i++)if(bank.play(['body','crash','screech','horn','scream','step'][i%6],{x:0,z:0}))played++;
 assert.ok(bank.stats.live<=MIX.total,`${bank.stats.live} ringing`);
 assert.ok(played<=MIX.total);
 // A one-shot starts past the encoder's lead-in, so the hit is on time.
 const punch=manifest.clips.find(c=>c.name===clips[0]);
 assert.equal(log.sources[0].started.offset,punch.lead);
});

test('a suspended context plays nothing and holds no slot',async()=>{
 const {ctx}=fakeContext();
 const bank=createSoundBank(()=>ctx,{base:'audio/',fetchImpl:fetchFrom('public/audio/')});
 await bank.load();ctx.state='suspended';
 for(let i=0;i<20;i++)assert.equal(bank.play('punch',{x:0,z:0}),null);
 assert.equal(bank.stats.live,0);
});

test('the soundscape: beds follow the crowd, footsteps follow distance, the chirp follows the signal',async()=>{
 const {ctx,log}=fakeContext();
 const bank=createSoundBank(()=>ctx,{base:'audio/',fetchImpl:fetchFrom('public/audio/')});await bank.load();
 const scape=createSoundscape(bank);
 const people=Array.from({length:120},(_,i)=>({active:true,x:(i%12)-6,z:Math.floor(i/12)-5}));
 const ear={x:0,y:1.6,z:0,fx:0,fz:-1};
 // Walk 7.4 m at 1.4 m/s: ten strides of 0.74 m.
 const player={x:0,z:0,alive:true};const dt=1/60;
 const settle=()=>{for(const s of log.sources)if(!s.loop&&!s.ended){s.ended=true;s.onended?.();}};  // a 0.1 s step ends long before the next
 for(let t=0;t<7.4/1.4;t+=dt){player.z-=1.4*dt;scape.update(dt,{ear,player,people,cars:[],pedestrianGreen:false});settle();}
 assert.ok(Math.abs(scape.stats.steps-10)<=1,`${scape.stats.steps} steps over ten strides`);
 assert.equal(scape.stats.people,120);assert.ok(scape.stats.playing);
 assert.equal(log.listener,null);assert.equal(ctx.listener.forwardZ.value,-1);
 scape.update(dt,{ear,people,pedestrianGreen:true});assert.ok(scape.stats.crossingOn);
 scape.update(dt,{ear,people,pedestrianGreen:false});assert.ok(!scape.stats.crossingOn);
 // Standing still: no steps. A teleport: no steps either.
 const before=scape.stats.steps;
 for(let i=0;i<120;i++)scape.update(dt,{ear,player,people});
 player.x+=40;scape.update(dt,{ear,player,people});
 assert.equal(scape.stats.steps,before);
});

test('tyres squeal on a real slide or a hard stop, not on ordinary driving',async()=>{
 const {ctx}=fakeContext();
 const bank=createSoundBank(()=>ctx,{base:'audio/',fetchImpl:fetchFrom('public/audio/')});await bank.load();
 const scape=createSoundscape(bank),dt=1/60,ear={x:0,z:0,fx:0,fz:-1};
 const car={x:0,z:0,speed:12,lateral:0};
 for(let i=0;i<120;i++)scape.update(dt,{ear,car});
 assert.equal(scape.stats.screeches,0,'straight driving');
 car.lateral=3;scape.update(dt,{ear,car});assert.equal(scape.stats.screeches,1,'a slide');
 for(let i=0;i<30;i++)scape.update(dt,{ear,car});assert.equal(scape.stats.screeches,1,'cooldown');
 car.lateral=0;for(let i=0;i<120;i++)scape.update(dt,{ear,car});
 car.speed=12-SCAPE.screech.decel*1.5*dt;scape.update(dt,{ear,car});assert.equal(scape.stats.screeches,2,'a hard stop');
});

test('screams, gasps and low grunts use recordings; words stay synthesised; the caps are unchanged',async()=>{
 const {ctx,log}=fakeContext();
 const bank=createSoundBank(()=>ctx,{base:'audio/',fetchImpl:fetchFrom('public/audio/')});await bank.load();
 assert.equal(recordedKind('alert',true),null);
 assert.equal(recordedKind('scream',false),'scream-low');
 assert.equal(recordedKind('pain',true),null,'no recording suits a high voice in pain');
 const voices=createCrowdVoices(()=>ctx,{samples:bank});
 const ear={x:0,z:0,fx:0,fz:-1};
 const recordedBefore=log.sources.length;
 for(let id=0;id<12;id++)voices.say('scream',id,1+id*.1,2,ear,1);
 assert.ok(voices.stats.recorded>0,'no scream came from a recording');
 assert.ok(voices.stats.active<=6,`${voices.stats.active} voices at once`);
 assert.ok(log.sources.length>recordedBefore);
 // A word is never a recording.
 const rec=voices.stats.recorded;
 ctx.currentTime=5;voices.say('alert',99,1,1,ear,.3);
 assert.equal(voices.stats.recorded,rec);
});

test('the lock names the clips the converter was given, and the upstream audio is not committed',()=>{
 const names=new Set(lock.clips.map(c=>c.name));
 for(const c of manifest.clips)assert.ok(names.has(c.name),c.name);
 const ignore=readFileSync('.gitignore','utf8');
 assert.match(ignore,/^\/assets\/audio\/upstream\/$/m);
 // Hashes are hex and unique per source.
 const seen=new Set();for(const s of lock.sources){assert.ok(!seen.has(s.transport.sha256),s.id);seen.add(s.transport.sha256);}
 assert.equal(createHash('sha256').update('').digest('hex').length,64);
});
