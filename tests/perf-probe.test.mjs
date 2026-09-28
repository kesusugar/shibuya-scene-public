// PLAN-PERFORMANCE-AND-PAD P0: the device instrument -- per-section frame timing, the GPU timer's
// graceful absence, and the automatic A/B sweep.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerfProbe,frameStats,createGpuTimer} from '../src/quality/perf-probe.mjs';
import {createPerfSweep,sweepSteps,sweepCosts,SWEEP_FEATURES} from '../src/quality/perf-sweep.mjs';
import {ModuleSystem} from '../src/app/foundation.mjs';
import {PIPELINE_OFF} from '../src/fidelity/pipeline.mjs';

test('frame statistics: mean, percentiles and fps',()=>{
 const s=frameStats([10,20,30,40,1000/60,null]);
 assert.equal(s.frames,5);assert.equal(s.max,40);assert.ok(s.p50>=16&&s.p50<=20);
 assert.equal(frameStats([]).fps,null);
 assert.equal(frameStats([16.666]).fps,60);
});

test('the probe adds up each section per frame, and the interval between frames is the fps',()=>{
 let t=0;const probe=createPerfProbe({now:()=>t});
 for(let i=0;i<10;i++){
  probe.frameStart();
  probe.begin('module:life');t+=3;probe.end('module:life');
  probe.begin('render');t+=5;probe.end('render');
  probe.begin('module:life');t+=1;probe.end('module:life');   // a second visit in the same frame adds up
  probe.frameEnd({drawCalls:300,triangles:1e6});t+=11;          // idle until the next frame
 }
 const s=probe.summary();
 assert.equal(s.sections['module:life'],4);assert.equal(s.sections.render,5);
 assert.equal(s.cpu.mean,9);assert.equal(s.interval.mean,20);assert.equal(s.interval.fps,50);
 assert.equal(s.drawCalls,300);assert.equal(s.gpu,null,'no GPU timer in Node, and no error');
});

test('without the timer-query extension the GPU timer is a silent no-op',()=>{
 const g=createGpuTimer({getExtension:()=>null});
 g.begin();g.end();assert.equal(g.poll(),null);assert.equal(g.available,false);
 assert.equal(createGpuTimer(null).poll(),null);
});

test('the module system times each module when probed, and skips a paused one without disposing it',()=>{
 let t=0,disposed=0,ran=[];const probe=createPerfProbe({now:()=>t});
 const sys=new ModuleSystem({debug:false,only:null,skip:[]},{});
 sys.register('life',{build(){},update(){ran.push('life');t+=2;},dispose(){disposed++;}});
 sys.register('traffic',{build(){},update(){ran.push('traffic');t+=1;},dispose(){disposed++;}});
 sys.start();sys.probe=probe;
 probe.frameStart();sys.update(1/60);probe.frameEnd();
 assert.deepEqual(probe.summary().sections,{'module:life':2,'module:traffic':1});
 sys.paused=new Set(['life']);ran=[];sys.update(1/60);
 assert.deepEqual(ran,['traffic']);assert.equal(disposed,0,'pausing rebuilt the module');
});

test('the sweep: baseline, each feature off in turn, baseline again; costs against the baselines',()=>{
 const steps=sweepSteps();
 assert.equal(steps.length,SWEEP_FEATURES.length+2);
 assert.equal(steps[0].id,'baseline');assert.equal(steps.at(-1).id,'baseline-again');
 // A fake scene where 'shadow' costs 8 ms and everything else nothing.
 let t=0,off=new Set(),done=null;const applied=[];
 const probe=createPerfProbe({now:()=>t});
 const sweep=createPerfSweep({probe,apply:o=>{off=o;applied.push([...o]);},steps:sweepSteps(['shadow','gtao']),settle:.2,measure:.5,minFrames:5,onDone:r=>{done=r;}});
 sweep.begin();
 for(let i=0;i<2000&&!done;i++){const frame=off.has('shadow')?12:20;probe.frameStart();t+=frame*.5;probe.frameEnd();t+=frame*.5;sweep.update(frame/1000);}
 assert.ok(done,'the sweep never finished');
 assert.deepEqual(applied.at(-1),[],'features were left switched off');
 const costs=sweepCosts(done.results);
 assert.equal(costs[0].feature,'shadow');assert.ok(Math.abs(costs[0].savesMs-8)<.5,`shadow saves ${costs[0].savesMs}`);
 assert.ok(Math.abs(costs[1].savesMs)<.5);
});

test('single post passes can be switched off for the A/B',()=>{
 assert.deepEqual(Object.keys(PIPELINE_OFF).sort(),['ao','bloom','smaa']);
 assert.ok(Object.values(PIPELINE_OFF).every(v=>v===false),'a pass is off by default');
});
