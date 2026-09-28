import test from 'node:test';
import assert from 'node:assert/strict';
import {finishStepsAsync,createBuildQueue} from '../src/quality/runtime.mjs';
import {createStartupTiming,STARTUP_TIMING_VERSION} from '../src/quality/startup-timing.mjs';

test('startup timing records strict stage identity, rebuilds, and additive time buckets',()=>{
 let clock=100;
 {
  const timing=createStartupTiming({initialTier:'high',buildIdentity:{gitCommit:'abc'},browser:{},metrics:()=>({triangles:12}),clock:()=>clock});
  timing.milestone('appLifecycleStartMs');clock=110;
  const first=timing.beginStage('ground','S2 Ground',{timing:{computeMs:4,cooperativeWaitMs:2,externalWaitMs:1}});clock=120;timing.endStage(first,{},true);
  assert.equal(first.wallDurationMs,10);assert.equal(first.unclassifiedMs,3);assert.equal(first.completedSuccessfully,true);assert.equal(first.sceneMetricsAtEnd.triangles,12);
  timing.setReason('ground','tier-change');clock=130;const second=timing.beginStage('ground','S2 Ground');clock=135;timing.endStage(second,{},true);
  assert.equal(second.occurrence,2);assert.equal(second.invocationReason,'tier-change');assert.equal(timing.trace.rebuilds.length,1);assert.equal(timing.trace.instrumentationVersion,STARTUP_TIMING_VERSION);
 }
});

test('generator timing separates compute from cooperative waits without changing yields',async()=>{
 function* steps(){yield;yield;return 42;}const timing={};const result=await finishStepsAsync(steps(),async()=>{},timing);assert.equal(result,42);assert.equal(timing.yieldCount,2);assert.ok(timing.computeMs>=0);assert.ok(timing.cooperativeWaitMs>=0);
});

test('build queue reports actual execution boundaries and remains serial',async()=>{
 const events=[],scheduled=[];const queue=createBuildQueue(run=>scheduled.push(run),event=>events.push(event));const order=[];const a=queue.enqueue(async()=>{order.push('a');},{name:'A'});const b=queue.enqueue(()=>{order.push('b');},{name:'B'});await scheduled.shift()();await a;await scheduled.shift()();await b;assert.deepEqual(order,['a','b']);assert.deepEqual(events.filter(event=>event.type==='job-start').map(event=>event.meta.name),['A','B']);assert.deepEqual(queue.snapshot(),{queueLength:0,activeBuildName:null,nextBuildName:null});queue.dispose();
});
