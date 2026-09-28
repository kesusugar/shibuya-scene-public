// PLAN-POLICE-VOICE-KAZE-DETAIL Step V1: the police lines in the crowd's own formant synthesiser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {VOWELS, ONSETS, LINES, POLICE_LINES, policeLine, policePersona, synthesizePoliceLine}
 from '../src/player/voices.mjs';

test('every police line is built only from defined vowels and onsets, and is its own kind',()=>{
 // Eight since PLAN-WEAPONS W3 added 「銃を捨てろ！」 and 「撃つぞ！」 (was six).
 assert.equal(POLICE_LINES.length, 8);
 for (const l of POLICE_LINES) {
  assert.equal(l.kind, 'police', l.tag);
  assert.ok(l.tag && l.segs.length, l.tag);
  assert.equal(l.bend.length, 3, l.tag);
  for (const seg of l.segs) {
   assert.ok(Object.hasOwn(VOWELS, seg.v), `${l.tag} vowel ${seg.v}`);
   if (seg.glide) assert.ok(Object.hasOwn(VOWELS, seg.glide), `${l.tag} glide ${seg.glide}`);
   if (seg.on) assert.ok(Object.hasOwn(ONSETS, seg.on), `${l.tag} onset ${seg.on}`);
  }
 }
});

test('the police kind is separate from the crowd\'s kinds',()=>{
 const crowdKinds = new Set(LINES.map(l => l.kind));
 assert.ok(!crowdKinds.has('police'));
 assert.ok(!POLICE_LINES.some(l => crowdKinds.has(l.kind)));
});

test('the six chosen lines exist, one per pursuit situation',()=>{
 const tags = ['止まれ！', '停車！停車！', '動くな！', '逃げるな！', '降りろ！', '確保！'];
 for (const tag of tags) assert.ok(POLICE_LINES.some(l => l.tag === tag), tag);
 for (const situation of ['stop', 'stopCar', 'freeze', 'chase', 'getOut', 'arrest'])
  assert.ok(policeLine(situation), situation);
 assert.equal(policeLine('not-a-situation'), null);
});

test('the new onsets have their intended shape',()=>{
 // m and n are nasal hums, not noise bursts.
 assert.equal(ONSETS.m.type, null); assert.ok(ONSETS.m.nasal);
 assert.equal(ONSETS.n.type, null); assert.ok(ONSETS.n.nasal);
 // sh is high-frequency band-passed noise.
 assert.equal(ONSETS.sh.type, 'bandpass');
 assert.ok(ONSETS.sh.hz >= 2500 && ONSETS.sh.hz <= 4500, `sh at ${ONSETS.sh.hz}`);
 assert.ok(ONSETS.sh.ms >= 70 && ONSETS.sh.ms <= 100, `sh burst ${ONSETS.sh.ms}ms`);
 // r is a very short flap, shorter than 30ms, with no burst of its own.
 assert.ok(ONSETS.r.gap < .03, `r gap ${ONSETS.r.gap}`);
 assert.equal(ONSETS.r.type, null);
});

test('the two police throats are lower and longer than any crowd persona',()=>{
 const seen = new Set();
 for (const id of [0, 1, 2, 3, 7, 400, 1977, 55555]) {
  const throat = policePersona(id);
  assert.deepEqual(policePersona(id), throat, 'deterministic by id');
  assert.ok(throat.f0 < 150, `f0 ${throat.f0}`);
  assert.ok(throat.formant < 1, `formant ${throat.formant}`);
  seen.add(throat.f0);
 }
 assert.ok(seen.size >= 2, 'only one throat ever came out');
});

test('a police line synthesises into an audio graph without throwing',()=>{
 const nodes = [];
 const node = () => {
  const n = {connect(){}, disconnect(){}, frequency: {value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, cancelScheduledValues(){}},
   gain: {value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, cancelScheduledValues(){}},
   Q: {value:0}, type: null, start(){}, stop(){}, buffer: null};
  nodes.push(n); return n;
 };
 const ctx = {
  sampleRate: 44100,
  createOscillator: node, createGain: node, createBiquadFilter: node,
  createBuffer: () => ({getChannelData: () => new Float32Array(1)}),
  createBufferSource: node
 };
 const line = policeLine('arrest'), throat = policePersona(5);
 const result = synthesizePoliceLine(ctx, line, throat, {at: 0, level: 1});
 assert.ok(result, 'synthesis refused');
 assert.ok(result.out);
 assert.ok(result.duration > 0);
 assert.equal(typeof result.stop, 'function');
});

test('synthesis never throws even when the context refuses',()=>{
 const broken = {createOscillator(){throw new Error('refused');}};
 assert.equal(synthesizePoliceLine(broken, policeLine('stop'), policePersona(1), {at: 0}), null);
});
