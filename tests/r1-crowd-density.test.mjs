import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {buildCrowd} from '../src/life/render.mjs';
import {QUALITY,POOL_SIZE,BODY_VARIANTS,HAIR_VARIANTS,ACCESSORY_TARGETS} from '../src/life/config.mjs';

const actors=Array.from({length:POOL_SIZE},(_,id)=>({active:true,id,archetype:'casual',color:0,heading:0,height:0,x:0,z:0,renderX:0,renderZ:0,speed:0,animationTime:0,phase:id*.01,lod:'near'}));
const sim={pool:actors,snapshot:()=>({total:actors.length,tier:'high'}),update(){},setCamera(){},setTier(){},dispose(){}};
const crowd=buildCrowd({}, {ground:{},generic:{},core:{},street:{tier:'high'},detail:{tier:'high'},network:{stats:{},edges:[]},sim});

test('R1 HIGH population and deterministic visual families match the target',()=>{
 assert.equal(QUALITY.high.total,1978);assert.equal(POOL_SIZE,1978);
 assert.deepEqual(crowd.stats.bodyCounts,Object.fromEntries(BODY_VARIANTS.map(v=>[v.key,v.count])));
 assert.deepEqual(crowd.stats.hairCounts,Object.fromEntries(HAIR_VARIANTS.map(v=>[v.key,v.count])));
 assert.equal(crowd.stats.instanceCounts.head,1978);assert.deepEqual(crowd.stats.accessories,ACCESSORY_TARGETS);
});

test('R1 limbs are integrated and all crowd parts remain non-skinned instancing',()=>{
 assert.equal(crowd.stats.geometries,13);assert.equal(crowd.stats.materials,3);
 assert.ok(!('arms' in crowd.meshes)&&!('legs' in crowd.meshes)&&!('torso' in crowd.meshes));
 for(const key of [...BODY_VARIANTS.map(v=>v.key),'head',...HAIR_VARIANTS.map(v=>v.key),...Object.keys(ACCESSORY_TARGETS)])assert.ok(crowd.meshes[key].isInstancedMesh&&!crowd.meshes[key].isSkinnedMesh,key);
 const source=readFileSync('src/life/render.mjs','utf8');for(const forbidden of ['AnimationMixer','Skeleton','SkinnedMesh'])assert.ok(!source.includes(forbidden));
 mkdirSync('evidence/r1',{recursive:true});writeFileSync('evidence/r1/crowd-render.json',JSON.stringify({population:QUALITY.high.total,body:crowd.stats.bodyCounts,head:crowd.stats.instanceCounts.head,hair:crowd.stats.hairCounts,accessories:crowd.stats.accessories,geometries:crowd.stats.geometries,materials:crowd.stats.materials,batches:crowd.stats.batches,triangles:crowd.stats.triangles},null,2));
});

test.after(()=>crowd.dispose());
