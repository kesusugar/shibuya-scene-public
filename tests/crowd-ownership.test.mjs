import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NEAR_LIMITS,HUMANOID_LIMITS,createNearCharacters} from '../src/life/near-characters.mjs';

// RUN 10 browser QA found "old-style characters mixed into the HQ crowd". Measured live, the
// procedural legacy renderer was drawing nobody at all; every old-looking body was a BAKED
// near-pool slot -- the eleven-bone offline original -- occupying the 5-20 m ring around the
// player, where the HQ crowd would otherwise have drawn the same person with a better body.

async function humanoid(){
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 return humanoidCitizen(gltf,report);
}
const crowd=n=>{const people=[];
 for(let id=0;id<n;id++)people.push({id,active:true,archetype:'adult',x:(id%10)*.8,z:Math.floor(id/10)*.8,
  heading:0,speed:1.2,renderX:(id%10)*.8,renderZ:Math.floor(id/10)*.8,height:0,reactionUntil:-1});
 return people;};
const run=(pool,people,frames=80)=>{for(let f=0;f<frames;f++)pool.update(people,{x:0,z:0},1/30,f/30);};

test('with the HQ crowd drawing everyone else, the near pool never builds a baked figure',async()=>{
 const pool=createNearCharacters('high');
 pool.setHumanAsset(await humanoid());
 pool.setHQCovered(true);
 const people=crowd(120);
 run(pool,people);
 const seen=pool.inspect();
 assert.equal(seen.bakedActive,0,`${seen.bakedActive} baked figures drawn while HQ covered them`);
 assert.ok(seen.humanoidsActive>0,'the nearest people lost their humanoid bodies too');
 assert.ok(pool.selected.size<=HUMANOID_LIMITS.high,
  `the pool took ${pool.selected.size} people; with HQ covering the rest it may take only its humanoids`);
 pool.dispose?.();
});

test('before the humanoid arrives, an HQ-covered pool takes nobody and leaves them all to HQ',()=>{
 const pool=createNearCharacters('high');
 pool.setHQCovered(true);
 run(pool,crowd(60));
 assert.equal(pool.selected.size,0,'the pool fell back to baked figures although HQ draws a better body');
 assert.equal(pool.inspect().bakedActive,0);
 pool.dispose?.();
});

test('turning HQ coverage on drops baked slots that already exist',()=>{
 // A session starts on baked (HQ loads after the city); the switch has to take effect at
 // once, not whenever those people happen to walk away.
 const pool=createNearCharacters('high');
 const people=crowd(60);
 run(pool,people);
 assert.ok(pool.inspect().bakedActive>0,'precondition: the uncovered pool uses baked figures');
 pool.setHQCovered(true);
 run(pool,people,2);
 assert.equal(pool.inspect().bakedActive,0,'baked figures outlived the switch to HQ coverage');
 pool.dispose?.();
});

test('without the HQ crowd the baked fallback is untouched',()=>{
 // A tier or session with no HQ crowd: there, baked is still better than the procedural body.
 const pool=createNearCharacters('high');
 run(pool,crowd(60));
 assert.ok(pool.inspect().bakedActive>0,'baked fallback lost when HQ is absent');
 assert.ok(pool.selected.size<=NEAR_LIMITS.high);
 pool.dispose?.();
});
