import test from 'node:test';
import assert from 'node:assert/strict';
import {isWaiting,kerbQueued,KERB_QUEUE_REACH} from '../src/life/stance.mjs';

// RUN 11.0. Live play at red lights: the queue behind the front row was blocked in `walking`,
// and the scramble cast between crossings stood in `exiting`/`recycle`. Both walked on the spot.

test('waiting is decided by simulation state, never by speed alone',()=>{
 assert.equal(isWaiting({state:'waiting',speed:0}),true);
 assert.equal(isWaiting({state:'walking',speed:0}),false,'a walker held up for a moment is not waiting');
 assert.equal(isWaiting({state:'walking',speed:0,stuck:3}),false,'being stuck is not the same as queueing');
 assert.equal(isWaiting({state:'walking',speed:0,kerbQueue:true}),true,'the queue behind the front row waits too');
 assert.equal(isWaiting({state:'exiting',choreographed:true,speed:0}),true);
 assert.equal(isWaiting({state:'recycle',choreographed:true,speed:0}),true);
 assert.equal(isWaiting({state:'exiting',choreographed:false,speed:0}),false);
 assert.equal(isWaiting({state:'crossing',speed:0}),false,'someone on the crossing is crossing');
 assert.equal(isWaiting({state:'milling',speed:0}),false);
});

test('a thrown or dead body is never waiting, whatever its state says',()=>{
 assert.equal(isWaiting({state:'waiting',struck:.4}),false);
 assert.equal(isWaiting({state:'waiting',combatDead:true}),false);
 assert.equal(isWaiting({state:'walking',kerbQueue:true,struck:0}),false);
});

test('only a blocked walker near a closed crossing counts as queued',()=>{
 const base={moved:false,nextIsCrossing:true,walk:false,toKerb:3};
 assert.equal(kerbQueued(base),true);
 assert.equal(kerbQueued({...base,moved:true}),false,'moving is not queueing');
 assert.equal(kerbQueued({...base,walk:true}),false,'held up during WALK is just a busy crossing');
 assert.equal(kerbQueued({...base,nextIsCrossing:false}),false,'blocked mid-pavement is not a kerb queue');
 assert.equal(kerbQueued({...base,toKerb:KERB_QUEUE_REACH+.1}),false);
});
