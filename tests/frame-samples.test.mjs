import test from 'node:test';import assert from 'node:assert/strict';
import {createFrameSamples,waitForRenderedFrames} from '../src/qa/frame-samples.mjs';
test('bounded pacing sample includes slow frames and reports CPU separately',()=>{
 const p=createFrameSamples();p.begin(3);p.record(0,1);p.record(10,2);p.record(20,3);p.record(100,4);p.record(999,999);
 const s=p.snapshot();assert.equal(s.samples,3);assert.equal(s.frameP95Ms,80);assert.equal(s.cpuP95Ms,4);assert.equal(s.fps,30);assert.equal(s.over50Ms,1);assert.equal(s.complete,true);
});
test('hidden intervals are excluded and invalid counts rejected',()=>{
 const p=createFrameSamples();assert.throws(()=>p.begin(601));p.begin(2);p.record(0,1);p.record(10000,1,false);p.record(20000,1);p.record(20010,1);p.record(20020,1);assert.equal(p.snapshot().fps,100);
});
test('render wait completes, fails on disposal and times out without leaking callbacks',async()=>{
 let frame=0;await waitForRenderedFrames({count:2,getFrame:()=>frame,isDisposed:()=>false,raf:fn=>{frame++;queueMicrotask(fn);return 1;},cancel:()=>{}});
 await assert.rejects(waitForRenderedFrames({count:2,getFrame:()=>0,isDisposed:()=>true,raf:()=>1,cancel:()=>{}}),/disposed/);
 let cancelled=false;await assert.rejects(waitForRenderedFrames({count:2,getFrame:()=>0,isDisposed:()=>false,timeoutMs:10,raf:()=>42,cancel:id=>{cancelled=id===42;}}),/timed out/);assert.equal(cancelled,true);
});
