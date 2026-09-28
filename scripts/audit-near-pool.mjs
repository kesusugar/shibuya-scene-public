// RUN 6 STEP 0 -- what one near-character rig costs, for each asset the pool could use.
//
// The pool currently builds every slot from the offline-baked figure. Putting the humanoid in
// its place is the whole of RUN 6, and the first question is what that costs per body, because
// 32 of anything is 32 times whatever this says.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen,bakedCitizen} from '../src/player/character-asset.mjs';
import pack from '../src/player/generated/character.mjs';
import {NEAR_LIMITS} from '../src/life/near-characters.mjs';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

function cost(asset,label){
 const instance=asset.instance();
 let meshes=0,triangles=0,vertices=0,bones=0;
 const materials=new Set(),geometries=new Set();
 instance.root.traverse(o=>{
  if(o.isBone)bones++;
  if(!o.isMesh)return;
  meshes++;
  geometries.add(o.geometry.uuid);
  for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m.uuid);
  const g=o.geometry;
  vertices+=g.attributes.position.count;
  triangles+=(g.index?.count??g.attributes.position.count)/3;
 });
 const tracks=instance.clips.reduce((n,c)=>n+c.tracks.length,0);
 instance.dispose?.();
 return {label,meshes,triangles,vertices,bones,
  materials:materials.size,geometries:geometries.size,
  clips:instance.clips.length,tracks};
}

const baked=cost(bakedCitizen(pack),'baked figure (current pool)');
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const human=cost(humanoidCitizen(gltf,report),'humanoid (player today)');

console.log('per-rig cost\n');
console.log('asset                        meshes  triangles  vertices  bones  mats  clips  tracks');
for(const c of [baked,human])
 console.log(c.label.padEnd(28),String(c.meshes).padStart(6),String(Math.round(c.triangles)).padStart(10),
  String(c.vertices).padStart(9),String(c.bones).padStart(6),String(c.materials).padStart(5),
  String(c.clips).padStart(6),String(c.tracks).padStart(7));

console.log(`\nthe pool, if every slot used each asset\n`);
console.log('tier    limit |  baked: draws  triangles  skeletons |  humanoid: draws  triangles  skeletons');
for(const [tier,limit] of Object.entries(NEAR_LIMITS))
 console.log(tier.padEnd(7),String(limit).padStart(5),'|',
  String(limit*baked.meshes).padStart(12),String(Math.round(limit*baked.triangles)).padStart(10),
  String(limit).padStart(10),'|',
  String(limit*human.meshes).padStart(14),String(Math.round(limit*human.triangles)).padStart(10),
  String(limit).padStart(10));

// RUN 6 STEP 1 -- the deployment ladder, measured rather than jumped.
//
// The brief says not to go straight to 32. This is what each rung costs, against the HIGH
// pool's all-baked baseline, so the stopping point is chosen from numbers instead of nerve.
console.log(`\ngradual deployment at HIGH (32 near slots), humanoid count varying\n`);
console.log('humanoids  baked  draw calls  triangles   vs baseline  skeletons  bone matrices');
const HIGH=NEAR_LIMITS.high;
const baseDraw=HIGH*baked.meshes, baseTri=HIGH*baked.triangles;
for(const n of [0,1,4,8,12,16,32]){
 const rest=HIGH-n;
 const draws=n*human.meshes+rest*baked.meshes;
 const tri=n*human.triangles+rest*baked.triangles;
 const bones=n*human.bones+rest*baked.bones;
 console.log(String(n).padStart(9),String(rest).padStart(6),String(draws).padStart(12),
  String(Math.round(tri)).padStart(10),
  ((tri/baseTri-1)*100>=0?'+':'')+((tri/baseTri-1)*100).toFixed(0)+'%',
  String(HIGH).padStart(10),String(bones).padStart(14));
}
console.log(`
Draw calls FALL as humanoids are added -- three meshes each against the baked figure's six --
so the batch count is not what bounds this. Triangles and bone matrices are.`);

console.log(`
A humanoid is ${(human.triangles/baked.triangles).toFixed(1)}x the triangles and `+
 `${(human.meshes/baked.meshes).toFixed(1)}x the draw calls of a baked figure, on `+
 `${human.bones} bones against ${baked.bones}.
Both share one geometry and one material set across the pool -- the cost that scales with the
slot count is the skinning, the skeleton and the mixer, not the upload.`);
