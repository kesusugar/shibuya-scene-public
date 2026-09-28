import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackBus,FEEDBACK} from '../src/app/feedback-bus.mjs';

// RUN 11.3/11.4: a crowd through the scramble is 100+ contacts a second. None of that may
// become a hundred sounds in one frame.

test('a flood of one kind in one frame becomes one event, carrying the strongest hit',()=>{
 const bus=createFeedbackBus(),got=[];bus.on(e=>got.push(e));
 for(let i=0;i<300;i++)bus.emit('vehicle_impact',1,{intensity:i/300,id:i});
 assert.equal(bus.drain(),1);
 assert.equal(got[0].kind,'vehicle_impact');assert.ok(got[0].intensity>.99);
 assert.equal(got[0].count,300);
});

test('a frame never delivers more than the cap, however many kinds fire',()=>{
 const bus=createFeedbackBus(),got=[];bus.on(e=>got.push(e));
 for(const k of Object.keys(FEEDBACK.kinds))for(let i=0;i<50;i++)bus.emit(k,5,{intensity:Math.random()});
 assert.ok(bus.drain()<=FEEDBACK.perFrame);
 assert.ok(got.length<=FEEDBACK.perFrame);
 assert.equal(bus.pending,0,'nothing is carried over into the next frame');
});

test('cooldown spaces repeats of one kind across frames',()=>{
 const bus=createFeedbackBus();let n=0;bus.on(()=>n++);
 for(let f=0;f<60;f++){bus.emit('punch_hit',f/60);bus.drain();}   // one second at 60 fps
 const expected=Math.ceil(1/FEEDBACK.kinds.punch_hit.cooldown);
 assert.ok(n<=expected+1,`${n} punch hits in one second`);
 assert.ok(n>=expected-2);
});

test('an unknown kind is ignored, and a throwing listener cannot break the frame',()=>{
 const bus=createFeedbackBus();bus.on(()=>{throw new Error('listener bug');});
 assert.equal(bus.emit('nonsense',0),false);
 bus.emit('punch_swing',0);
 assert.doesNotThrow(()=>bus.drain());
});
