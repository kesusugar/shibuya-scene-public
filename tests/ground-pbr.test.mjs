import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import * as THREE from 'three';
import {upgradeGroundTextures,albedoTint,meanOfData,GROUND_PBR} from '../src/ground/pbr.mjs';
import {createAsphaltMaterial,texture} from '../src/ground/render.mjs';

const manifest=JSON.parse(readFileSync('public/textures/ground/manifest.json','utf8'));
const lock=JSON.parse(readFileSync('assets/textures/upstream.lock.json','utf8'));
const toLinear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};

function ground(){
 const root=new THREE.Group();
 const road=new THREE.Mesh(new THREE.PlaneGeometry(),createAsphaltMaterial());road.name='ground-asphalt';
 const map=texture('sidewalk');
 const walk=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.055,roughness:.9}));walk.name='ground-sidewalk';
 root.add(road,walk);return {root,road,walk};
}
const loader=()=>{const made=[];return {made,load:async url=>{const t=new THREE.Texture();t.name=url;made.push(t);return t;}};};
const fetchJson=async url=>{assert.match(url,/manifest\.json$/);return manifest;};

test('every shipped ground texture is CC0, locked by hash, on disk, and sized for the page',()=>{
 for(const s of lock.sources){assert.equal(s.licence,'CC0-1.0');for(const f of s.files)assert.match(f.sha256,/^[0-9a-f]{64}$/);}
 let total=0;
 for(const set of manifest.sets){
  assert.ok(lock.sources.some(s=>s.id===set.id),set.id);
  assert.equal(set.metres.length,2);assert.ok(set.metres[0]>.5&&set.metres[0]<10);
  assert.equal(set.meanSrgb.length,3);
  for(const role of ['diff','normal','rough']){const m=set.maps[role],file=`public/textures/ground/${m.file}`;
   assert.ok(existsSync(file),file);assert.equal(statSync(file).size,m.bytes);total+=m.bytes;}
 }
 assert.ok(total<2e6,`${(total/1e6).toFixed(2)} MB of ground texture`);
 assert.match(readFileSync('.gitignore','utf8'),/^\/assets\/textures\/upstream\/$/m);
});

test('the tint keeps the calibrated albedo: the photograph averages what the procedural texture did',()=>{
 const from=[33.87,29.35,27.94],to=[54,55,56];
 const tint=albedoTint(from,to);
 for(let i=0;i<3;i++)assert.ok(Math.abs(toLinear(from[i])*tint[i]-toLinear(to[i]))<1e-6);
 assert.ok(albedoTint([1,1,1],[255,255,255]).every(v=>v===GROUND_PBR.maxTint),'a runaway tint is capped');
 const mean=meanOfData(texture('asphalt'));assert.ok(mean[0]>40&&mean[0]<70,`procedural asphalt mean ${mean}`);
});

test('the upgrade swaps maps in place at real scale, drops the bump, and keeps the same materials',async()=>{
 const {root,road,walk}=ground(),{made,load}=loader();
 const roadMaterial=road.material,before=meanOfData(road.material.map);
 const r=await upgradeGroundTextures(root,{tier:'high',base:'textures/ground/',load,fetchJson,THREE});
 assert.deepEqual(r.applied.map(a=>a.use).sort(),['road','sidewalk']);
 assert.equal(road.material,roadMaterial,'the same material: its night patches stay attached');
 assert.equal(road.material.bumpMap,null);
 assert.ok(road.material.normalMap&&road.material.roughnessMap&&road.material.map);
 assert.equal(road.material.map.colorSpace,THREE.SRGBColorSpace);
 assert.equal(road.material.normalMap.colorSpace,THREE.NoColorSpace);
 const roadSet=manifest.sets.find(s=>s.use==='road');
 assert.equal(road.material.map.repeat.x,GROUND_PBR.uvMetres/roadSet.metres[0]);
 // The colour multiplier times the photograph's mean lands on the procedural mean.
 for(let i=0;i<3;i++){const c=[road.material.color.r,road.material.color.g,road.material.color.b][i];
  assert.ok(Math.abs(toLinear(roadSet.meanSrgb[i])*c-toLinear(before[i]))<1e-3,`channel ${i}`);}
 assert.equal(made.length,6);
 // Idempotent: a second call does nothing.
 const again=await upgradeGroundTextures(root,{tier:'high',load,fetchJson,THREE});
 assert.equal(again.applied.length,0);assert.equal(made.length,6);
 assert.ok(walk.material.userData.s123Pbr);
});

test('LOW keeps the procedural ground and loads nothing',async()=>{
 const {root,road}=ground(),{made,load}=loader(),map=road.material.map;
 const r=await upgradeGroundTextures(root,{tier:'low',load,fetchJson,THREE});
 assert.equal(r.skipped,'tier');assert.equal(made.length,0);assert.equal(road.material.map,map);
});
