import test from 'node:test';
import assert from 'node:assert/strict';
import {PACE,paceStep,cadence} from '../src/life/pace.mjs';
import {clipFor,STATE} from '../src/life/hq-crowd.mjs';

const run=(s,n,dx,dz,dt=1/60)=>{for(let f=0;f<n;f++)s=paceStep(s.vx,s.vz,s.moving,typeof dx==='function'?dx(f):dx,dz,dt);return s;};
test('pace is measured from displacement, smoothed, and a teleport is clamped', () => {
 let s=run({vx:0,vz:0,moving:false},60,1.2/60,0);
 assert.ok(Math.abs(s.speed-1.2)<.05,`${s.speed}`);assert.equal(s.moving,true);
 const jump=paceStep(0,0,false,50,0,1/60);
 assert.ok(jump.speed<=PACE.maxMeasured);
 assert.deepEqual(paceStep(.5,0,true,1,0,0),{vx:.5,vz:0,speed:.5,moving:true},'dt 0 changes nothing');
});

test('hysteresis: start above moveAbove, stop below stopBelow', () => {
 const mid=(PACE.stopBelow+PACE.moveAbove)/2;
 let s=run({vx:mid,vz:0,moving:false},120,mid/60,0);
 assert.equal(s.moving,false,'a standing body started walking inside the band');
 s=run({vx:mid,vz:0,moving:true},120,mid/60,0);
 assert.equal(s.moving,true,'a walking body stopped inside the band');
});

test('a body dithering sideways in a jam is not walking (the vector cancels)', () => {
 // Live: 0.4 m/s of path, 0.05 m/s of progress -- the right-side passing rule alternating.
 const s=run({vx:1.2,vz:0,moving:true},60,f=>(f%2?1:-1)*.4/30,.05/60);
 assert.equal(s.moving,false,'sidestep dither read as walking');
 assert.ok(s.speed<PACE.stopBelow,String(s.speed));
});

test('cadence is stride / speed, bounded, and only for ground-covering clips', () => {
 assert.ok(Math.abs(cadence('Walk',1.3333,1.3)-1)<1e-9);
 assert.ok(Math.abs(cadence('Run',.7083,3.79)-3.79/2.687)<1e-9);
 assert.ok(Math.abs(cadence('Walk',1.3333,0)-PACE.minScale/1.3333)<1e-9);
 assert.ok(Math.abs(cadence('Walk',1.3333,20)-PACE.maxScale/1.3333)<1e-9);
 assert.equal(cadence('Idle',2.5,1),null);
 assert.equal(cadence('Guard',2.9,1),null);
});

test('clipFor: standing never walks, a stopped reaction never runs on the spot', () => {
 assert.equal(clipFor(STATE.NORMAL,false,false),'Idle');
 assert.equal(clipFor(STATE.LOOK,false,false),'Idle');
 assert.equal(clipFor(STATE.NORMAL,false,true,false),'Walk');
 assert.equal(clipFor(STATE.NORMAL,false,true,true),'Run');
 assert.equal(clipFor(STATE.FLEE,false,false),'Guard');
 assert.equal(clipFor(STATE.AVOID,false,true,true),'Run');
 assert.equal(clipFor(STATE.AVOID,false,true,false),'Walk');
 assert.equal(clipFor(STATE.NORMAL,true,true),'Idle','waiting at the kerb stays Idle');
 assert.equal(clipFor(STATE.STARTLE,false,false),'Startle');
 assert.equal(clipFor(STATE.DOWNED,false,false),'Fall');
 // Old two-argument callers keep their meaning when the body is moving.
 assert.equal(clipFor(STATE.NORMAL,false),'Walk');
 assert.equal(clipFor(STATE.FLEE,false),'Run');
});
