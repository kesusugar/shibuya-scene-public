import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {createDeferredVehicleVisual} from '../src/player/deferred-vehicle-visual.mjs';
function harness(){let resolve,calls=0,constructed=0,updates=[],released=0;const load=()=>{calls++;return new Promise(r=>{resolve=r;});};const visual=createDeferredVehicleVisual(load);return {visual,get calls(){return calls;},get constructed(){return constructed;},updates,get released(){return released;},resolve(){resolve({createVehicleVisual(){constructed++;return {root:new Group(),update(s){updates.push(s);},hide(){},dispose(){released++;}};}});}};}
const car=type=>({active:true,type,slot:{}});
test('observer, inactive and scooter do not request vehicle assets',()=>{
 const h=harness();h.visual.update(null);h.visual.update({active:false});h.visual.update(car('scooter'));assert.equal(h.visual.inspect().requests,0);h.visual.dispose();
});
test('concurrent updates load once and use newest vehicle; fallback slot stays visible',async()=>{
 const h=harness(),a=car('taxi'),b=car('van');h.visual.update(a);h.visual.update(b);await Promise.resolve();assert.equal(h.calls,1);assert.equal(b.slot.playerVisual,undefined);h.resolve();await h.visual.whenSettled();assert.equal(h.constructed,1);assert.equal(h.updates[0],b);assert.equal(h.visual.inspect().status,'ready');h.visual.dispose();h.visual.dispose();assert.equal(h.released,1);
});
test('dispose during loading cannot resurrect scene resources',async()=>{
 const h=harness();h.visual.update(car('taxi'));await Promise.resolve();h.visual.dispose();h.resolve();await h.visual.whenSettled();assert.equal(h.constructed,0);assert.equal(h.visual.root.children.length,0);
});
test('hide during loading avoids allocation and permits later retry',async()=>{
 const h=harness();h.visual.update(car('taxi'));await Promise.resolve();h.visual.hide();h.resolve();await h.visual.whenSettled();assert.equal(h.constructed,0);h.visual.update(car('van'));await Promise.resolve();h.resolve();await h.visual.whenSettled();assert.equal(h.constructed,1);h.visual.dispose();
});
test('load failure keeps fallback and rate-limits retries',async()=>{
 let calls=0;const v=createDeferredVehicleVisual(()=>{calls++;throw new Error('offline');});v.update(car('taxi'));await v.whenSettled();assert.equal(v.inspect().status,'failed');for(let i=0;i<100;i++)v.update(car('taxi'));assert.equal(calls,1);v.dispose();
});
