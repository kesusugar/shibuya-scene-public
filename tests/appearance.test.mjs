import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHETYPES,APPEARANCE,PALETTE,appearanceOf,paletteOf,deduplicate}
 from '../src/life/appearance.mjs';
import {WARDROBE} from '../src/player/character-asset.mjs';

const channels=hex=>[(hex>>16)&255,(hex>>8)&255,hex&255];
const distance=(a,b)=>{const x=channels(a),y=channels(b);
 return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};

test('the archetypes are distinct silhouettes, not just recolours',()=>{
 assert.ok(ARCHETYPES.length>=3,`${ARCHETYPES.length} archetypes is not a crowd`);
 // The thing RUN 6.8 exists for: the outlines must differ. Two archetypes that share a rig
 // AND a hairstyle are the same silhouette whatever else is set on them.
 const shapes=new Set(ARCHETYPES.map(a=>`${a.rig}|${a.hair}`));
 assert.equal(shapes.size,ARCHETYPES.length,'two archetypes have the same body and hair');
 assert.ok(new Set(ARCHETYPES.map(a=>a.hair)).size>=3,'fewer than three hair silhouettes');
 assert.ok(new Set(ARCHETYPES.map(a=>a.rig)).size>=2,'only one body');
});

test('an appearance is a pure function of the pedestrian id',()=>{
 // This is the promise that stops people changing clothes as the camera moves. The pool
 // recycles slots constantly and reorders every frame; nothing about an appearance may come
 // from there.
 for(const id of [0,1,7,42,1977,-3]){
  assert.deepEqual(appearanceOf(id),appearanceOf(id),`id ${id} is not stable`);
 }
 // Different base heights must not change anything but the height.
 const a=appearanceOf(9,1.76),b=appearanceOf(9,1.5);
 assert.equal(a.archetype.id,b.archetype.id);
 assert.equal(a.top,b.top);assert.equal(a.skin,b.skin);assert.equal(a.hairColour,b.hairColour);
 assert.ok(b.height<a.height,'a shorter base did not make a shorter person');
});

test('the crowd is spread across every archetype and every palette entry',()=>{
 const looks=Array.from({length:600},(_,i)=>appearanceOf(i));
 const counts=new Map();
 for(const look of looks)counts.set(look.archetype.id,(counts.get(look.archetype.id)??0)+1);
 assert.equal(counts.size,ARCHETYPES.length,'an archetype never appears');
 // Even-ish: nothing may be rarer than half its fair share, or the crowd looks like one
 // archetype with occasional visitors.
 const fair=looks.length/ARCHETYPES.length;
 for(const [id,n] of counts)
  assert.ok(n>fair*.5,`archetype ${id} appears ${n} times against a fair share of ${fair}`);
 for(const key of ['tops','bottoms','skins','hairs']){
  const used=new Set(looks.map(l=>key==='tops'?l.top:key==='bottoms'?l.bottom
   :key==='skins'?l.skin:l.hairColour));
  assert.equal(used.size,PALETTE[key].length,`${key}: only ${used.size} of ${PALETTE[key].length} used`);
 }
});

test('choices are not correlated with each other',()=>{
 // Reading several choices off one id badly gives repeating runs down a pavement: every
 // citizen with this shirt also has that hair. Check no pair is locked together.
 const looks=Array.from({length:600},(_,i)=>appearanceOf(i));
 const pairs=new Set(looks.map(l=>`${l.archetype.id}|${l.top}`));
 assert.ok(pairs.size>ARCHETYPES.length*4,
  `only ${pairs.size} archetype/top combinations across 600 citizens`);
 const withHair=new Set(looks.map(l=>`${l.top}|${l.hairColour}`));
 assert.ok(withHair.size>PALETTE.tops.length*2,'shirt and hair colour move together');
});

test('scale stays inside what the animation and foot IK can absorb',()=>{
 for(let id=0;id<2000;id++){
  const look=appearanceOf(id);
  assert.ok(Number.isFinite(look.height)&&Number.isFinite(look.width),`id ${id} produced NaN`);
  assert.ok(look.height>=APPEARANCE.minHeight&&look.height<=APPEARANCE.maxHeight,
   `id ${id} is ${look.height.toFixed(2)} m`);
  // RUN 5's solver adapts a correct animation to the ground. A body scaled far from the one
  // the clips were authored for is no longer a correct animation, so the build stays close.
  assert.ok(look.width>=.88&&look.width<=1.12,`id ${id} has a build of ${look.width.toFixed(3)}`);
 }
});

test('no citizen is dressed as the player',()=>{
 // The player has to stay findable in a crowd that now shares their body.
 for(const top of PALETTE.tops)
  assert.ok(distance(top,WARDROBE.top)>60,
   `citizen top #${top.toString(16)} is too close to the player's #${WARDROBE.top.toString(16)}`);
 for(let id=0;id<500;id++){
  const look=appearanceOf(id);
  assert.notEqual(look.top,WARDROBE.top);
 }
});

test('deduplication separates twins, and touches nothing but the shirt',()=>{
 // Force a clash: two ids whose archetype and top agree.
 const looks=[];
 for(let id=0;id<4000&&looks.length<2;id++){
  const look=appearanceOf(id);
  if(looks.length===0){looks.push(look);continue;}
  if(look.archetype.id===looks[0].archetype.id&&look.top===looks[0].top)looks.push(look);
 }
 assert.equal(looks.length,2,'could not construct a clash to test against');
 const fixed=deduplicate(looks);
 assert.notEqual(fixed.get(looks[0].id).top,fixed.get(looks[1].id).top,'twins kept the same shirt');
 // The lower id keeps what the recipe gave them, and silhouette is never negotiated.
 const [low,high]=looks[0].id<looks[1].id?looks:[looks[1],looks[0]];
 assert.equal(fixed.get(low.id).top,low.top,'the lower id lost its own colour');
 for(const look of looks){
  const after=fixed.get(look.id);
  assert.equal(after.archetype.id,look.archetype.id,'deduplication changed a body');
  assert.equal(after.height,look.height,'deduplication changed a height');
  assert.equal(after.width,look.width,'deduplication changed a build');
  assert.equal(after.skin,look.skin);
  assert.equal(after.hairColour,look.hairColour,'deduplication changed hair');
 }
});

test('deduplication does not depend on the order it is given people',()=>{
 const looks=Array.from({length:8},(_,i)=>appearanceOf(i*13+5));
 const forward=deduplicate(looks);
 const backward=deduplicate([...looks].reverse());
 for(const look of looks)
  assert.equal(forward.get(look.id).top,backward.get(look.id).top,
   `citizen ${look.id} got a different shirt depending on pool order`);
});

test('paletteOf hands the renderer every surface it dresses',()=>{
 const look=appearanceOf(3);
 const palette=paletteOf(look);
 for(const key of ['skin','top','bottom','hair','shoe'])
  assert.ok(Number.isInteger(palette[key]),`paletteOf lost ${key}`);
});

test('every archetype is one body on one skeleton, driven by the same clips',async()=>{
 // The payload argument for RUN 6.8 rests on this: four archetypes cost four bodies' worth of
 // geometry and ONE animation library. If an archetype ever carried its own clips, or arrived
 // with more than one skeleton, that argument is gone -- so it is asserted rather than
 // described. The bone names matter too: the clips address bones by name, and glTF renames
 // duplicates across rigs, which silently animates nothing if it is not put back.
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);

 assert.ok(asset.variants?.length>=ARCHETYPES.length,
  `the asset offers ${asset.variants?.length??0} variants for ${ARCHETYPES.length} archetypes`);

 const required=['Idle','Walk','Run'];
 let shared=null;
 for(const archetype of ARCHETYPES){
  const built=asset.instance(undefined,archetype);
  const bones=[],skeletons=new Set();let meshes=0;
  built.root.traverse(o=>{
   if(o.isBone)bones.push(o.name);
   if(o.isSkinnedMesh)skeletons.add(o.skeleton);
   if(o.isMesh)meshes++;
  });
  assert.equal(skeletons.size,1,`${archetype.name} instanced ${skeletons.size} skeletons`);
  assert.equal(meshes,4,`${archetype.name} draws ${meshes} meshes, not a body, eyes, brows and hair`);
  for(const bone of ['pelvis','Head','thigh_l','calf_r','foot_l','ball_r'])
   assert.ok(bones.includes(bone),`${archetype.name} has no bone called ${bone}`);
  // The clips must be the very same objects, not copies.
  if(shared===null)shared=built.clips;
  else assert.equal(built.clips,shared,`${archetype.name} carries its own animation library`);
  for(const name of required)
   assert.ok(built.clips.some(c=>c.name===name),`${archetype.name} cannot play ${name}`);
  built.dispose();
 }
 asset.dispose();
});
