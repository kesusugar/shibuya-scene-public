// PLAN-POLICE-VOICE-KAZE-DETAIL Step V2: the megaphone chain, its scheduling, and that
// speechSynthesis is no longer used in play by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMegaphone} from '../src/police/siren.mjs';
import {createCrowdVoices} from '../src/player/voices.mjs';
import {createPoliceDirector} from '../src/police/director.mjs';
import {createPoliceClips} from '../src/police/voice-clips.mjs';

/** Roadmap ①: recorded lines stand-ins, one per situation, so the director has something to say. */
function fakeClips() {
 const clips = createPoliceClips(() => null);
 for (const situation of ['stopCar', 'stopBike', 'stop', 'getOut', 'chase', 'freeze', 'dropGun', 'warn', 'arrest',
  'fleeingCar', 'fleeingFoot', 'backup', 'armed', 'air', 'lost'])
  clips.add({id: situation, situation, text: situation, buffer: {duration: 1.2}});
 return clips;
}

function fakeCtx() {
 let time = 0;
 const node = () => ({
  connect(){}, disconnect(){},
  frequency: {value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, cancelScheduledValues(){}, setTargetAtTime(){}},
  gain: {value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, cancelScheduledValues(){}, setTargetAtTime(){}},
  Q: {value: 0}, type: null, start(){}, stop(){}, buffer: null, curve: null,
  delayTime: {value: 0},
  positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0},
  panningModel: null, distanceModel: null, refDistance: 0, maxDistance: 0, rolloffFactor: 0
 });
 return {
  get currentTime() {return time;},
  advance(s) {time += s;},
  sampleRate: 44100, state: 'running',
  destination: node(),
  createOscillator: node, createGain: node, createBiquadFilter: node, createWaveShaper: node,
  createDelay: node, createPanner: node, createBufferSource: node,
  createBuffer: () => ({getChannelData: () => new Float32Array(1)})
 };
}

test('the megaphone chain (band-pass, saturation, echo) is built only for a police line',()=>{
 const ctx = fakeCtx();
 let waveShaper = 0, delay = 0, biquad = 0;
 const {createWaveShaper, createDelay, createBiquadFilter} = ctx;
 ctx.createWaveShaper = (...a) => {waveShaper++; return createWaveShaper(...a);};
 ctx.createDelay = (...a) => {delay++; return createDelay(...a);};
 ctx.createBiquadFilter = (...a) => {biquad++; return createBiquadFilter(...a);};
 const mega = createMegaphone(() => ctx, () => ({connect(){}}));
 const line = mega.speak(['stop'], 1, 0, 0, 0);
 assert.ok(line);
 assert.ok(waveShaper >= 1, 'no saturation stage was built');
 assert.ok(delay >= 1, 'no slapback echo was built');
 assert.ok(biquad >= 1, 'no band-pass was built');
});

test('the crowd\'s own voices never build a waveshaper or a delay -- that chain is the megaphone\'s alone',()=>{
 const ctx = fakeCtx();
 let waveShaper = 0, delay = 0;
 ctx.createWaveShaper = () => {waveShaper++; return {};};
 ctx.createDelay = () => {delay++; return {};};
 const crowd = createCrowdVoices(() => ctx);
 crowd.say('alert', 1, 0, 0, {x: 0, z: 0, fx: 0, fz: 1}, .5);
 assert.equal(waveShaper, 0); assert.equal(delay, 0);
});

test('the gap holds across every car, and the same line never plays twice running',()=>{
 const ctx = fakeCtx();
 const mega = createMegaphone(() => ctx, () => ({connect(){}}));
 const first = mega.speak(['stop', 'stopCar'], 1, 0, 0, 0);
 assert.ok(first);
 // Too soon, even from a different car -- the gap is global, not per car.
 assert.equal(mega.speak(['stop', 'stopCar'], 2, 40, 40, 1), null);
 // Past the gap, the first candidate would repeat the last line, so the second is used instead.
 const second = mega.speak(['stop', 'stopCar'], 1, 0, 0, 7);
 assert.ok(second);
 assert.notEqual(second.tag, first.tag);
 // Past the gap again, but the only candidate on offer IS the last line: refused, not repeated.
 assert.equal(mega.speak([second.situation], 1, 0, 0, 14), null);
});

test('the arrest line bypasses the gap; other lines still do not',()=>{
 const ctx = fakeCtx();
 const mega = createMegaphone(() => ctx, () => ({connect(){}}));
 mega.speak(['stop'], 1, 0, 0, 0);
 const arrest = mega.speak(['arrest'], 1, 0, 0, .3, {force: true});
 assert.ok(arrest, 'the arrest line must not wait for the gap');
 assert.equal(arrest.situation, 'arrest');
});

test('with no context, no bus, or an unknown situation, the megaphone is silent, never throws',()=>{
 const mega = createMegaphone(() => null, () => null);
 assert.equal(mega.speak(['stop'], 1, 0, 0, 0), null);
 const ctx = fakeCtx();
 const noBus = createMegaphone(() => ctx, () => null);
 assert.equal(noBus.speak(['stop'], 1, 0, 0, 0), null);
 const mega2 = createMegaphone(() => ctx, () => ({connect(){}}));
 assert.equal(mega2.speak(['not-a-situation'], 1, 0, 0, 0), null);
 assert.equal(mega2.speak([], 1, 0, 0, 0), null);
});

test('by default the director speaks through the megaphone, never speechSynthesis',()=>{
 const ctx = fakeCtx();
 const bus = {connect(){}};
 let spoken = 0;
 const speech = {getVoices: () => [{lang: 'ja-JP'}], speak() {spoken++;}};
 function Utterance(t) {this.text = t;}
 const patrol = {id: 9, active: true, type: 'police', x: 10, z: 0, heading: 0, speed: 0};
 const traffic = {pool: [patrol]};
 const crowd = {pool: Array.from({length: 6}, (_, i) => ({id: i, active: true, x: i, z: 2}))};
 const police = createPoliceDirector({getAudioContext: () => ctx, getAudioBus: () => bus, speech, Utterance, clips: fakeClips()});
 const player = {x: 0, z: 0, alive: true};
 const frame = (melee, extra = {}) => police.frame(1 / 30, {player, melee, traffic, crowd, ...extra});
 frame({npcDeaths: 1}); frame({npcDeaths: 2});
 let s; for (let i = 0; i < 9 * 30; i++) s = frame({npcDeaths: 2});
 assert.equal(s.stars, 1);
 assert.equal(patrol.siren, true);
 assert.ok(police.megaphone.stats.played >= 1, 'no line was ever spoken while wanted');
 assert.equal(spoken, 0, 'speechSynthesis must not be used by default');
});

test('?voice=tts falls back to speechSynthesis and the megaphone stays silent',()=>{
 globalThis.location = {search: '?voice=tts'};
 try {
  const ctx = fakeCtx();
  const bus = {connect(){}};
  let spoken = 0;
  const speech = {getVoices: () => [{lang: 'ja-JP'}], speak() {spoken++;}};
  function Utterance(t) {this.text = t;}
  const patrol = {id: 9, active: true, type: 'police', x: 10, z: 0, heading: 0, speed: 0};
  const traffic = {pool: [patrol]};
  const crowd = {pool: Array.from({length: 6}, (_, i) => ({id: i, active: true, x: i, z: 2}))};
  const police = createPoliceDirector({getAudioContext: () => ctx, getAudioBus: () => bus, speech, Utterance});
  const player = {x: 0, z: 0, alive: true};
  const frame = (melee) => police.frame(1 / 30, {player, melee, traffic, crowd});
  frame({npcDeaths: 1}); frame({npcDeaths: 2});
  let s; for (let i = 0; i < 9 * 30; i++) s = frame({npcDeaths: 2});
  assert.equal(s.stars, 1);
  assert.ok(spoken >= 1, 'the ?voice=tts comparison mode never spoke');
  assert.equal(police.megaphone.stats.played, 0, 'the megaphone must not run in tts mode');
 } finally {
  delete globalThis.location;
 }
});
