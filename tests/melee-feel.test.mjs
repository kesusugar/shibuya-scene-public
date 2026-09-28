import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {punchEmphasis,characterAction} from '../src/player/figure.mjs';
import {ATTACKS} from '../src/player/attack-timing.mjs';
import {createHQLayer} from '../src/life/hq-layer.mjs';
import {STATE} from '../src/life/hq-crowd.mjs';
import {blowOn} from '../src/life/temperament.mjs';

// RUN 11.2. The swing played `Punch` squeezed into the last 0.42 s of the attack -- double
// speed, and after the hit test had already run -- and the cross was never shown at all.

test('the swing plays the clip it is, at the length it is',()=>{
 assert.equal(characterAction({attackTime:.5,attackName:'PunchCross'}),'PunchCross');
 assert.equal(characterAction({attackTime:.5,attackName:'Punch'}),'Punch');
 assert.equal(characterAction({attackTime:.3}),'Punch','an NPC pulse still plays a punch');
 assert.equal(characterAction({attackTime:0,attackName:'PunchCross'}),null);
});

test('the weight behind the punch peaks exactly when the fist is out, inside the hit window',()=>{
 for(const a of ATTACKS){
  let best=-Infinity,at=0;
  for(let u=0;u<=1;u+=.002){const k=punchEmphasis(a.name,u);if(k>best){best=k;at=u;}}
  assert.ok(Math.abs(at-a.peak/a.duration)<.01,`${a.name} peaks at ${at.toFixed(3)}, the fist at ${(a.peak/a.duration).toFixed(3)}`);
  assert.ok(at>=a.windup/a.duration-1e-9&&at<=a.activeEnd/a.duration+1e-9,`${a.name} emphasis outside its hit window`);
  assert.ok(punchEmphasis(a.name,a.windup/a.duration*.9)<0,'no wind-up before the drive');
  assert.ok(Math.abs(punchEmphasis(a.name,1))<1e-9,'the body does not stay twisted');
  assert.ok(Math.abs(punchEmphasis(a.name,0))<1e-9);
 }
});

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const pool=n=>Array.from({length:n},(_,id)=>({id,active:true,controlled:false,archetype:'adult',state:'walking',
 x:id*1.5,z:0,renderX:id*1.5,renderZ:0,height:0,heading:0,speed:1.3,crossing:null,edge:3,route:[3]}));

test('an HQ victim flinches, stays owned by the simulation, then does what they chose',()=>{
 for(const [response,expect] of [['flee',STATE.FLEE],['backoff',STATE.AVOID],['fight',STATE.NORMAL]]){
  const people=pool(6),layer=createHQLayer(manifest,bin,{budget:6});
  layer.sync(people,{x:0,z:0},1/60,{time:0});
  const v=people[2],i=layer.crowd.indexOf(v.id);
  const blow=blowOn({x:v.x,z:-1,heading:0},v,{attack:'Punch'});
  assert.ok(layer.blow({victim:v.id,blow,response}));
  layer.sync(people,{x:0,z:0},1/60,{time:1/60});
  assert.equal(layer.crowd.state.behaviour[i],STATE.HIT);
  assert.equal(layer.disowned.has(v.id),false,'a flinch took the body away from its simulation');
  let t=0;while(t<blow.hold+.2){t+=1/60;layer.sync(people,{x:0,z:0},1/60,{time:t});}
  assert.equal(layer.crowd.state.behaviour[i],expect,`${response} became ${layer.crowd.state.behaviour[i]}`);
  layer.dispose();
 }
});

test('a fatal blow is left to the knockdown the simulation already runs',()=>{
 const people=pool(4),layer=createHQLayer(manifest,bin,{budget:4});
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 assert.equal(layer.blow({victim:1,blow:{...blowOn({x:0,z:-1},people[1]),fatal:true},response:'flee'}),false);
 layer.dispose();
});

test('a punch leans the spine and never slides the planted feet (no root translation)',async()=>{
 const {PUNCH_LEAN}=await import('../src/player/figure.mjs');
 const {readFileSync}=await import('node:fs');
 const src=readFileSync('src/player/figure.mjs','utf8');
 assert.ok(PUNCH_LEAN>.12&&PUNCH_LEAN<=.25,`lean ${PUNCH_LEAN}`);
 assert.doesNotMatch(src,/root\.position\.[xz]\+=[^;]*lean/,'the punch still slides the whole body');
});

test('the victim recoils: snaps in over the first fifth of the hold, then settles to nothing',async()=>{
 const {hitRecoil,RECOIL}=await import('../src/player/figure.mjs');
 assert.equal(hitRecoil(0),0);
 assert.ok(Math.abs(hitRecoil(.2)-1)<1e-9,'no peak at a fifth of the hold');
 assert.ok(hitRecoil(.1)>.6,'the snap is not sudden');
 assert.ok(Math.abs(hitRecoil(1))<1e-9,'the recoil never settles');
 let last=1;for(let u=.2;u<=1;u+=.05){const k=hitRecoil(u);assert.ok(k<=last+1e-9);last=k;}
 assert.ok(RECOIL.strong[0]>RECOIL.light[0],'a cross must bend further than a jab');
});
