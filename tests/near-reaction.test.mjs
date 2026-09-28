import test from 'node:test';
import assert from 'node:assert/strict';
import {nearReaction} from '../src/life/near-characters.mjs';
import {STATE} from '../src/life/hq-crowd.mjs';

// RUN 10 browser QA, driving at a near-held pedestrian: awareness (the rider in the car, seen as
// a standing player) held them at LOOK, and LOOK beat the car's own guard/startle. 8 of 32
// urgent frames showed a head turn with a car 2.8 m away at 5.8 m/s.
const at=(o={})=>({awareState:STATE.NORMAL,trafficReaction:null,reactionUntil:-Infinity,...o});

test('a car about to hit a near body outranks having noticed the player',()=>{
 for(const traffic of ['guard','startle','escape'])
  for(const aware of [STATE.LOOK,STATE.STARTLE,STATE.AVOID,STATE.FLEE])
   assert.equal(nearReaction(at({awareState:aware,trafficReaction:traffic,reactionUntil:10}),9.9),traffic,
    `awareness ${aware} overrode a live ${traffic}`);
});

test('without urgent car danger the order is what it was',()=>{
 // awareness beats a mere glance from the car
 assert.equal(nearReaction(at({awareState:STATE.STARTLE,trafficReaction:'look',reactionUntil:10}),9.9),'startle');
 assert.equal(nearReaction(at({awareState:STATE.AVOID}),0),'guard');
 assert.equal(nearReaction(at({awareState:STATE.LOOK}),0),'look');
 // the car's glance when awareness has nothing
 assert.equal(nearReaction(at({trafficReaction:'look',reactionUntil:10}),9.9),'look');
 // an expired car reaction: urgent no longer, the short recover tail, then nothing
 assert.equal(nearReaction(at({trafficReaction:'guard',reactionUntil:10}),10.2),'recover');
 assert.equal(nearReaction(at({awareState:STATE.LOOK,trafficReaction:'guard',reactionUntil:10}),10.2),'look');
 assert.equal(nearReaction(at({trafficReaction:'guard',reactionUntil:10}),11),null);
 assert.equal(nearReaction(at(),0),null);
});
