import test from 'node:test';
import assert from 'node:assert/strict';
import {afterPaint,finishStepsAsync} from '../src/quality/runtime.mjs';

test('suspended animation frames cannot block a build indefinitely',async()=>{
 const original=globalThis.requestAnimationFrame;
 let callback,calls=0;
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 123;};
 try{
  await new Promise(resolve=>afterPaint(()=>{calls++;resolve();}));
  callback();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls,1);
 }finally{if(original===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=original;}
});

test('default batching retains every generator step and its result',async()=>{
 let visited=0,closed=false;
 function* build(){try{for(let i=0;i<1000;i++){visited++;yield;}return 42;}finally{closed=true;}}
 assert.equal(await finishStepsAsync(build()),42);
 assert.equal(visited,1000);
 assert.equal(closed,true);
});
