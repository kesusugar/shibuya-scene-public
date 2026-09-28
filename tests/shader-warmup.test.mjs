import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial} from 'three';
import {createShaderWarmup} from '../src/quality/warmup.mjs';

const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));

/**
 * A renderer stub that reproduces the two behaviours this module exists for: `properties.get`
 * hands back a fresh empty object for anything it does not know (so a removed material reads
 * as `currentProgram: undefined`, exactly as WebGLProperties does), and disposing a material
 * removes it from the store, which is what deallocateMaterial does.
 */
function fakeRenderer(){
 const store=new WeakMap();
 const properties={get(o){let m=store.get(o);if(!m){m={};store.set(o,m);}return m;},
  remove(o){store.delete(o);}};
 const compiled=[];
 return {
  properties,compiled,
  wipe(){for(const m of compiled)store.delete(m);},
  compile(root){
   const set=new Set(root.materials);
   for(const material of set){
    properties.get(material).currentProgram={isReady:()=>material.userData.ready===true};
    compiled.push(material);
    material.addEventListener('dispose',()=>properties.remove(material));
   }
   return set;
  }
 };
}
const subtree=n=>({materials:Array.from({length:n},()=>new MeshStandardMaterial())});

test('a warm-up finishes when its programs report ready',async()=>{
 const renderer=fakeRenderer(),warmup=createShaderWarmup(renderer);
 const root=subtree(3);
 warmup.warm(root,null);
 assert.equal(warmup.pending,1,'the warm-up should still be waiting');
 for(const m of root.materials)m.userData.ready=true;
 await tick();
 assert.equal(warmup.pending,0,'a finished warm-up must stop polling');
 warmup.dispose();
});

test('disposing a material mid warm-up does not throw, and ends the wait',async()=>{
 // This is the regression. three.js reads properties.get(material).currentProgram on every
 // tick; once the material is disposed that object is a fresh {} and `.isReady()` throws
 // `Cannot read properties of undefined` from inside a setTimeout, where the try/catch around
 // compileAsync and the promise's .catch both miss it. Reproduced in the real scene by tearing
 // the page down 4 s into the build, while shaders were still compiling.
 const renderer=fakeRenderer(),warmup=createShaderWarmup(renderer);
 const root=subtree(3);
 const thrown=[];
 const onError=e=>{thrown.push(e);};
 process.on('uncaughtException',onError);
 try{
  warmup.warm(root,null);
  for(const m of root.materials)m.dispose();   // the stage is torn down mid-compile
  await tick(60);
  assert.deepEqual(thrown,[],`the poll threw: ${thrown.map(String)}`);
  assert.equal(warmup.pending,0,'a warm-up with nothing left to wait for must stop');
 }finally{process.off('uncaughtException',onError);}
 warmup.dispose();
});

test('disposing the owner stops every warm-up it started',async()=>{
 const renderer=fakeRenderer(),warmup=createShaderWarmup(renderer);
 warmup.warm(subtree(2),null);
 warmup.warm(subtree(2),null);
 assert.equal(warmup.pending,2);
 warmup.dispose();
 assert.equal(warmup.pending,0,'dispose must cancel in-flight polls');
 // And it must refuse to start new ones, so a build landing after teardown cannot revive it.
 warmup.warm(subtree(2),null);
 assert.equal(warmup.pending,0,'a disposed owner must not start a warm-up');
});

test('a renderer that loses its property store ends the wait rather than throwing',async()=>{
 // renderer.dispose() replaces the whole WeakMap, so every currentProgram reads undefined at
 // once -- the same shape as a disposed material, reached by a different route.
 const renderer=fakeRenderer(),warmup=createShaderWarmup(renderer);
 warmup.warm(subtree(4),null);
 renderer.wipe();
 await tick(60);
 assert.equal(warmup.pending,0);
 warmup.dispose();
});

test('a program that never reports ready does not poll for the session',async()=>{
 // Warm-up is an optimisation; the scene renders either way. A driver that never answers must
 // not leave a 10 ms timer running forever.
 let clock=0;
 const renderer=fakeRenderer();
 const warmup=createShaderWarmup(renderer,{timeoutMs:100,now:()=>clock});
 warmup.warm(subtree(2),null);      // nothing is ever marked ready
 await tick(40);
 assert.equal(warmup.pending,1,'it should still be trying while inside the deadline');
 clock=101;
 await tick(40);
 assert.equal(warmup.pending,0,'the warm-up must give up at its deadline');
 warmup.dispose();
});

test('an empty subtree needs no warm-up at all',()=>{
 const renderer=fakeRenderer(),warmup=createShaderWarmup(renderer);
 warmup.warm({materials:[]},null);
 assert.equal(warmup.pending,0);
 warmup.dispose();
});
