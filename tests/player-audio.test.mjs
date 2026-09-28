import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerAudio,AUDIO} from '../src/player/audio.mjs';

// RUN 11.4: a crowd pass must not allocate a sound per body, or ring a hundred at once.
function fakeContext(){
 const log={buffers:0,sources:0,oscillators:0};
 const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},frequency:param(),gain:param(),detune:param(),Q:param(),type:''});
 class Ctx{
  constructor(){this.sampleRate=8000;this.currentTime=0;this.destination=node();this.state='running';}
  createGain(){return node();}createBiquadFilter(){return node();}
  createOscillator(){log.oscillators++;const o=node();o.start=()=>{};o.stop=()=>{};return o;}
  createBuffer(c,frames){log.buffers++;return {getChannelData:()=>new Float32Array(frames)};}
  createBufferSource(){log.sources++;const s=node();s.start=()=>{};return s;}
  resume(){return Promise.resolve();}close(){}
 }
 return {Ctx,log};
}

test('one noise buffer per length, however many hits; and a hard cap on what rings',()=>{
 const {Ctx,log}=fakeContext();const saved=globalThis.AudioContext;globalThis.AudioContext=Ctx;
 try{
  const audio=createPlayerAudio();audio.resume();
  for(let i=0;i<200;i++){audio.bodyImpact(.8);audio.punchHit(.7);audio.swing(.6);}
  assert.ok(log.buffers<=4,`${log.buffers} buffers for 600 sounds`);
  assert.ok(audio.ringing<=AUDIO.maxVoices,`${audio.ringing} one-shots ringing at once`);
  assert.ok(log.sources+log.oscillators<=AUDIO.maxVoices+2,'the cap did not stop new voices being built');
 }finally{globalThis.AudioContext=saved;}
});

test('no audio context is simply silence',()=>{
 const saved=globalThis.AudioContext;globalThis.AudioContext=undefined;
 try{const audio=createPlayerAudio();audio.resume();
  assert.doesNotThrow(()=>{audio.swing();audio.punchHit();audio.bodyImpact();audio.runover();});}
 finally{globalThis.AudioContext=saved;}
});

test('a suspended context makes no sound and does not fill the voice budget',()=>{
 const {Ctx,log}=fakeContext();class Suspended extends Ctx{constructor(){super();this.state='suspended';}}
 const saved=globalThis.AudioContext;globalThis.AudioContext=Suspended;
 try{const audio=createPlayerAudio();audio.resume();
  for(let i=0;i<50;i++)audio.bodyImpact(1);
  assert.equal(audio.ringing,0,'suspended sounds were counted as ringing and never released');
  assert.equal(log.sources,0);}
 finally{globalThis.AudioContext=saved;}
});
