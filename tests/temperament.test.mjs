import test from 'node:test';
import assert from 'node:assert/strict';
import {responseOf,responseMix,blowOn,RESPONSE,BLOW} from '../src/life/temperament.mjs';
import {traitsOf} from '../src/life/hq-awareness.mjs';

// RUN 11.2. Everyone punched used to turn and fight for 14 s.
const ids=Array.from({length:1978},(_,i)=>i);

test('the same person always answers the same way, and a crowd answers several ways',()=>{
 for(const id of [0,17,503,1977])assert.equal(responseOf(id),responseOf(id));
 const mix=responseMix(ids);
 for(const k of ['flee','backoff'])assert.ok(mix[k]>ids.length*.2,`only ${mix[k]} of ${ids.length} would ${k}`);
 // The owner's rule after stage 6: about 3% square up.
 assert.ok(mix.fight>ids.length*.015&&mix.fight<ids.length*.05,`${mix.fight} of ${ids.length} fight`);
});

test('temperament follows the nerve awareness already uses (for those who do not fight)',()=>{
 for(const id of ids.slice(0,300)){
  const n=traitsOf(id).nerve,r=responseOf(id);
  if(r===RESPONSE.FLEE)assert.ok(n<.5);
  if(r===RESPONSE.BACK_OFF)assert.ok(n>=.5);
 }
});

test('kids and the elderly never fight back',()=>{
 for(const id of ids.slice(0,400)){
  assert.equal(responseOf(id,{archetype:'kid'}),RESPONSE.FLEE);
  assert.notEqual(responseOf(id,{gray:true}),RESPONSE.FIGHT);
 }
});

test('a blow pushes the victim away from the attacker, harder for a cross',()=>{
 const me={x:0,z:0,heading:0};
 const front=blowOn(me,{x:0,z:1,heading:Math.PI});         // facing me
 assert.equal(front.quarter,'front');assert.ok(front.impulse.z>0&&Math.abs(front.impulse.x)<1e-9);
 const side=blowOn(me,{x:1,z:0,heading:0});                 // I am at their left
 assert.equal(side.quarter,'left');assert.ok(side.impulse.x>0);
 const back=blowOn(me,{x:0,z:1,heading:0});                 // they face away
 assert.equal(back.quarter,'back');
 const cross=blowOn(me,{x:0,z:1,heading:Math.PI},{attack:'PunchCross'});
 assert.equal(cross.strength,'strong');assert.ok(cross.push>front.push&&cross.hold>front.hold);
 assert.equal(front.strength,'light');
 const same=blowOn(me,{x:0,z:0,heading:0});
 assert.ok(Number.isFinite(same.impulse.x)&&Number.isFinite(same.impulse.z));
 assert.ok(BLOW.strong.push<3,'a punch staggers; it does not throw anyone across the road');
});
