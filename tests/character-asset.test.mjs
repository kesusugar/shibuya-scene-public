import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {bakedCitizen,humanoidCitizen,dressCitizen,WARDROBE} from '../src/player/character-asset.mjs';
import {createDeferredCharacter} from '../src/player/deferred-character.mjs';
import {createPlayerFigure,characterAction} from '../src/player/figure.mjs';
import pack from '../src/player/generated/character.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
const ACTIONS=['Idle','Walk','Run','Sprint','Punch','Hit','Startle','Guard','Enter','Exit','Fall','Death'];

const humanoid=async()=>{
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej));
 return humanoidCitizen(gltf,REPORT);
};

test('the committed humanoid is the file its report describes',()=>{
 assert.equal(BYTES.length,REPORT.output.bytes);
 assert.equal(createHash('sha256').update(BYTES).digest('hex'),REPORT.output.sha256);
});

test('every state the player can be in has a clip on both assets',async()=>{
 const assets=[bakedCitizen(pack),await humanoid()];
 for(const asset of assets){
  const instance=asset.instance();
  const names=new Set(instance.clips.map(c=>c.name));
  for(const action of ACTIONS)assert.ok(names.has(action),`${asset.id} is missing ${action}`);
  instance.dispose();
 }
});

test('both assets present the same CharacterAsset shape', async()=>{
 for(const asset of [bakedCitizen(pack),await humanoid()]){
  assert.equal(typeof asset.id,'string');
  assert.ok(asset.height>1.5&&asset.height<2,`${asset.id} height ${asset.height}`);
  assert.ok(asset.scale>0);
  assert.equal(typeof asset.bones.head,'string');
  const instance=asset.instance();
  assert.ok(instance.root.getObjectByName(asset.bones.head),`${asset.id} has no head bone`);
  for(const key of ['recolour','setHeight','dispose'])assert.equal(typeof instance[key],'function');
  instance.dispose();
 }
});

test('the humanoid stands at the height the rest of the game assumes',async()=>{
 const asset=await humanoid();
 // Scale is derived from the measured bounding box, so the two have to agree to the millimetre.
 assert.ok(Math.abs(asset.height-1.76)<.001,`height ${asset.height}`);
});

test('locomotion clips carry the ground speed they were authored at',async()=>{
 const asset=await humanoid();
 for(const name of ['Walk','Run','Sprint'])assert.ok(asset.gait[name]>.5,`${name} has no gait`);
 assert.ok(asset.gait.Walk<asset.gait.Run&&asset.gait.Run<asset.gait.Sprint,'gait is not ordered');
 // Without this the figure would play every cycle at one speed, which is foot sliding.
 assert.ok(!('Idle' in asset.gait),'a standing clip must not claim a ground speed');
});

test('a citizen is dressed by uniforms, so one mesh can be a crowd',async()=>{
 const asset=await humanoid();
 const a=asset.instance({top:0x112233}),b=asset.instance({top:0x445566});
 const collect=(o,key)=>{const set=new Set();o.traverse(x=>{if(x.isMesh)set.add(x[key]);});return set;};
 // Geometry is the expensive thing and is shared: a pool of citizens uploads one body.
 const geometry=collect(b.root,'geometry');
 assert.ok([...collect(a.root,'geometry')].every(g=>geometry.has(g)),'instances must share geometry');
 // The garment material is not, because its uniforms are who this citizen is. The flat eye
 // and eyebrow materials carry nothing per-citizen, so they stay shared and stay cheap.
 const wardrobe=o=>{const set=new Set();o.traverse(x=>{if(x.isMesh&&x.geometry.attributes.color)set.add(x.material);});return set;};
 const flat=o=>{const set=new Set();o.traverse(x=>{if(x.isMesh&&!x.geometry.attributes.color)set.add(x.material);});return set;};
 assert.ok(wardrobe(a.root).size>0,'nothing was dressed');
 for(const m of wardrobe(a.root))assert.ok(!wardrobe(b.root).has(m),'a garment material must not be shared');
 for(const m of flat(a.root))assert.ok(flat(b.root).has(m),'an unmasked material should stay shared');
 a.dispose();b.dispose();
});

test('the garment mask covers the body and leaves nothing unassigned',()=>{
 // Four channels for five garments: the shoe is what the other four leave over, so a vertex
 // whose channels sum above one would be wearing a negative shoe.
 const loader=new GLTFLoader();
 return new Promise((resolve,reject)=>loader.parse(
  BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',gltf=>{
   let checked=0;
   gltf.scene.traverse(o=>{
    const colour=o.isMesh&&o.geometry.attributes.color;
    if(!colour)return;
    assert.equal(colour.itemSize,4,'the mask needs four channels');
    for(let i=0;i<colour.count;i++){
     let sum=0;for(let k=0;k<4;k++)sum+=colour.getComponent(i,k);
     assert.ok(sum<=1.004,`vertex ${i} sums to ${sum}`);
     assert.ok(sum>=.996||sum>=0,`vertex ${i} sums to ${sum}`);
     checked++;
    }
   });
   assert.equal(checked,REPORT.body.garmentMaskVertices);
   resolve();
  },reject));
});

test('dressing only touches meshes that carry a mask',async()=>{
 const asset=await humanoid();
 const instance=asset.instance();
 const worn=[];instance.root.traverse(o=>{if(o.isMesh)worn.push([o.name,!!o.geometry.attributes.color,o.material.vertexColors]);});
 for(const [name,masked,vertexColors] of worn)
  assert.equal(masked,vertexColors,`${name} disagrees about whether it is masked`);
 instance.dispose();
});

test('releasing a citizen releases its skeleton, not the asset it was cloned from',async()=>{
 for(const asset of [bakedCitizen(pack),await humanoid()]){
  const skeletons=o=>{const set=new Set();o.traverse(x=>{if(x.isSkinnedMesh)set.add(x.skeleton);});return set;};
  const template=skeletons(asset.template);
  const instance=asset.instance();
  const mine=skeletons(instance.root);
  assert.ok(mine.size>0,`${asset.id} instance has no skeleton`);
  for(const s of mine)assert.ok(!template.has(s),`${asset.id} shares the template skeleton`);
  // A Skeleton owns a bone texture; a pool that swaps citizens must not accumulate one each.
  instance.dispose();
  for(const s of mine)assert.equal(s.boneTexture,null,`${asset.id} kept a bone texture`);
 }
});

test('a figure falls back to Idle rather than throwing on a clip the asset lacks',()=>{
 const asset=bakedCitizen(pack);
 const figure=createPlayerFigure(asset);
 // 'Drive' exists only on the humanoid.
 figure.update({x:0,y:0,z:0,heading:0,speed:0,alive:true,vehiclePhase:0,trafficReaction:'drive'},1/60);
 assert.equal(figure.action,'Idle');
 figure.dispose();
});

test('characterAction answers only for what covers the legs',()=>{
 assert.equal(characterAction({alive:false,runOver:0}),'Fall');
 assert.equal(characterAction({alive:false,runOver:2}),'Death');
 assert.equal(characterAction({vehiclePhase:.5,vehicleKind:'exit'}),'Exit');
 assert.equal(characterAction({hurtTime:.2}),'Hit');
 assert.equal(characterAction({attackTime:.2}),'Punch');
 // Walking is not an action any more. It is a blend, and nothing overrides it, so the state
 // machine hands the body back rather than naming a clip.
 for(const speed of [0,1.4,3,5])assert.equal(characterAction({speed}),null,`speed ${speed}`);
});

test('the deferred character never blocks and never retries in a tight loop',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('offline');};
 try{
  const deferred=createDeferredCharacter({model:'m',report:'r',retrySeconds:8});
  assert.equal(deferred.inspect().status,'idle');
  deferred.request();
  await deferred.whenSettled();
  assert.equal(deferred.inspect().status,'failed');
  for(let i=0;i<50;i++)deferred.request();
  assert.equal(deferred.inspect().requests,1);
  // A figure asked for before the humanoid lands is simply never told about it.
  let told=0;deferred.onReady(()=>told++);
  deferred.dispose();
  assert.equal(told,0);
  assert.equal(calls,2);   // one report, one model, then nothing
 }finally{globalThis.fetch=original;}
});

test('dressing a body with no mask is a no-op rather than an error',()=>{
 const asset=bakedCitizen(pack);
 const instance=asset.instance();
 const worn=dressCitizen(instance.root,WARDROBE);
 assert.equal(worn.materials.length,0);
 worn.recolour({top:0x112233});
 instance.dispose();
});
