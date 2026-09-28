import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildDetailModel} from '../src/station-detail/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {CrowdSimulation, VOICE_COOLDOWN, VOICE_REPRISE, VOICE_ESCALATION, VOICE_QUEUE_MAX}
 from '../src/life/simulation.mjs';
import {LINES, VOICE, chooseLine, persona, prioritise, createCrowdVoices} from '../src/player/voices.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const detail=buildDetailModel(data,{tier:'high',ground,generic,core});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core,detail});

const fresh=()=>{const t=new TrafficSimulation(graph,{tier:'low',street});
 return {t,s:new CrowdSimulation(network,{tier:'low',traffic:t})};};

test('a pedestrian shouts once, then stays quiet for the cooldown',()=>{
 const {t,s}=fresh();const p=s.pool.find(p=>p.active);
 assert.equal(s.say(p,'alert',.2),true);
 assert.equal(s.voices.length,1);
 assert.deepEqual(Object.keys(s.voices[0]).sort(),['id','kind','urgency','x','z']);
 s.voices.length=0;
 // Same alarm again, immediately and a moment later: neither is allowed through.
 assert.equal(s.say(p,'alert',.2),false);
 s.time+=VOICE_COOLDOWN*.9;
 assert.equal(s.say(p,'alert',.2),false);
 s.time+=VOICE_COOLDOWN*.2;
 assert.equal(s.say(p,'alert',.2),true);
 s.dispose();t.dispose();});

test('a warning escalates to a scream when the car actually closes in',()=>{
 const {t,s}=fresh();const p=s.pool.find(p=>p.active);
 assert.equal(s.say(p,'alert',.1),true);
 // Worse, but too soon: they are still drawing breath.
 s.time+=VOICE_REPRISE*.5;
 assert.equal(s.say(p,'alert',.1+VOICE_ESCALATION+.05),false);
 // Long enough now, but barely worse: not worth a second shout.
 s.time+=VOICE_REPRISE;
 assert.equal(s.say(p,'alert',.1+VOICE_ESCALATION*.5),false);
 // Long enough and much worse.
 assert.equal(s.say(p,'alert',.1+VOICE_ESCALATION+.05),true);
 s.dispose();t.dispose();});

test('being hit always screams, whatever the cooldown says',()=>{
 const {t,s}=fresh();const p=s.pool.find(p=>p.active);
 assert.equal(s.say(p,'alert',.9),true);
 s.voices.length=0;
 assert.equal(s.say(p,'alert',.9),false,'the cooldown is genuinely holding');
 assert.equal(s.say(p,'scream',1),true);
 assert.equal(s.voices[0].kind,'scream');
 // ...and strike() is what does it, not just a direct call.
 const q=s.pool.find(q=>q.active&&q!==p);
 s.voices.length=0;
 assert.equal(s.strike(q,1,0,9),true);
 assert.equal(s.voices.filter(v=>v.kind==='scream'&&v.id===q.id).length,1);
 s.dispose();t.dispose();});

test('the queue is bounded and cleared on dispose',()=>{
 const {t,s}=fresh();
 for(const p of s.pool)if(p.active)s.say(p,'alert',.5);
 assert.equal(s.voices.length,VOICE_QUEUE_MAX);
 s.dispose();
 assert.equal(s.voices.length,0);t.dispose();});

test('nobody speaks unless a player car is on the street',()=>{
 const {t,s}=fresh();
 for(let f=0;f<60*30;f++){t.update(1/30);s.update(1/30);}
 assert.equal(s.stats.voiced??0,0);
 assert.equal(s.voices.length,0);
 s.dispose();t.dispose();});

test('every line is speakable: known vowels, known onsets, a contour that starts and lands',()=>{
 const VOWELS=new Set(['a','i','u','e','o','n']),ONSETS=new Set(['k','t','b','g','h','n']);
 assert.ok(LINES.some(l=>l.kind==='scream')&&LINES.some(l=>l.kind==='alert'));
 for(const l of LINES){
  assert.ok(l.tag&&l.segs.length,l.tag);
  assert.equal(l.bend.length,3,l.tag);
  for(const b of l.bend)assert.ok(b>.4&&b<2.2,l.tag+' '+b);
  for(const seg of l.segs){
   assert.ok(VOWELS.has(seg.v),l.tag+' vowel '+seg.v);
   if(seg.glide)assert.ok(VOWELS.has(seg.glide),l.tag+' glide '+seg.glide);
   if(seg.on)assert.ok(ONSETS.has(seg.on),l.tag+' onset '+seg.on);
   assert.ok(seg.ms>=20&&seg.ms<=900,l.tag+' '+seg.ms);}
  const ms=l.segs.reduce((a,s)=>a+s.ms,0);
  assert.ok(ms>=150&&ms<=800,l.tag+' total '+ms);}});

test('urgency picks the register: calm bands never scream, and every band says something',()=>{
 for(const u of [0,.2,.4,.6,.8,1]){
  const spoken=new Set();
  for(let i=0;i<200;i++)spoken.add(chooseLine('alert',u,i/200).tag);
  assert.ok(spoken.size>0,'nothing to say at '+u);
  for(const tag of spoken){
   const line=LINES.find(l=>l.tag===tag);
   assert.equal(line.kind,'alert');
   assert.ok(u>=line.urgency[0]&&u<=line.urgency[1],tag+' at '+u);}}
 // 「きゃーー！」 is for a car about to arrive, not one at the far end of the corridor.
 const calm=new Set();for(let i=0;i<200;i++)calm.add(chooseLine('alert',.05,i/200).tag);
 assert.ok(!calm.has('きゃーー！'));
 for(let i=0;i<50;i++)assert.equal(chooseLine('scream',i/50,i/50).kind,'scream');});

test('the same pedestrian always has the same voice, and the crowd has more than one',()=>{
 for(const id of [0,1,7,400,1977])assert.deepEqual(persona(id),persona(id));
 const registers=new Set(),pitches=new Set();
 for(let id=0;id<300;id++){const p=persona(id);registers.add(p.high);pitches.add(Math.round(p.f0));
  assert.ok(p.f0>100&&p.f0<500,String(p.f0));
  assert.ok(p.formant>.9&&p.formant<1.3,String(p.formant));}
 assert.equal(registers.size,2,'the whole crowd sounds the same');
 // The two registers between them offer about 234 whole-Hz pitches, so 300 people cannot
 // have 300 distinct ones; what matters is that they are spread, not that a hash collapsed.
 assert.ok(pitches.size>150,'only '+pitches.size+' distinct pitches in 300 people');
 assert.ok(Math.max(...pitches)-Math.min(...pitches)>250,'the crowd is all one register');});

test('a burst spends its budget on screams and on whoever is closest',()=>{
 const ear={x:0,z:0,fx:0,fz:1};
 const batch=[
  {kind:'alert',id:1,x:0,z:25,urgency:.9},
  {kind:'alert',id:2,x:0,z:2,urgency:.2},
  {kind:'scream',id:3,x:0,z:28,urgency:1},
  {kind:'alert',id:4,x:0,z:3,urgency:.9}];
 const order=prioritise(batch,ear).map(v=>v.id);
 assert.equal(order[0],3,'a scream at 28 m still comes before any warning');
 assert.ok(order.indexOf(4)<order.indexOf(1),'near and urgent beats far and urgent');
 assert.ok(order.indexOf(4)<order.indexOf(2),'urgent beats calm at the same range');});

test('no audio context means no sound and no exception',()=>{
 const silent=createCrowdVoices(()=>null);
 assert.equal(silent.say('scream',1,0,0,{x:0,z:0,fx:0,fz:1},1),null);
 assert.equal(silent.stats.played,0);
 silent.dispose();
 const broken=createCrowdVoices(()=>{throw new Error('refused');});
 assert.throws(()=>broken.say('alert',1,0,0,{x:0,z:0,fx:0,fz:1},.5));   // the getter, not us
 // Out of earshot is culled before anything is built, so a dead context is never touched.
 const far=createCrowdVoices(()=>null);
 assert.equal(far.say('alert',1,VOICE.range+1,0,{x:0,z:0,fx:0,fz:1},.5),null);});
