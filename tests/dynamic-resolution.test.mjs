import test from 'node:test';
import assert from 'node:assert/strict';
import {createDynamicResolution,DYNRES} from '../src/quality/dynamic-resolution.mjs';

const run=(d,frames,interval,cpu)=>{let changed=0;for(let i=0;i<frames;i++)if(d.sample(interval,cpu,interval/1000))changed++;return changed;};

test('GPU-bound and over budget: the scale steps down, spaced out, to its floor',()=>{
 const d=createDynamicResolution({budgetMs:1000/60});
 run(d,60,40,8);                                   // 25 fps, CPU 8 ms of 40: the GPU is behind
 assert.ok(d.scale<1,'did not come down');
 run(d,2000,40,8);
 assert.equal(d.scale,DYNRES.min,'did not stop at its floor');
 // Changes are spaced: 2.4 s of 40 ms frames allows at most two.
 const e=createDynamicResolution({budgetMs:1000/60});assert.ok(run(e,60,40,8)<=2);
});

test('CPU-bound: fewer pixels would not help, so it stays',()=>{
 const d=createDynamicResolution({budgetMs:1000/60});
 run(d,600,40,36);                                 // 36 of 40 ms on the CPU
 assert.equal(d.scale,1);
});

test('back inside the budget it climbs back, half a step at a time; off, it is always 1',()=>{
 const d=createDynamicResolution({budgetMs:1000/60});
 run(d,400,40,8);const low=d.scale;
 run(d,400,10,4);
 assert.ok(d.scale>low,'did not recover');
 run(d,4000,10,4);assert.equal(d.scale,1);
 const off=createDynamicResolution({enabled:false});run(off,600,40,8);assert.equal(off.scale,1);
});
