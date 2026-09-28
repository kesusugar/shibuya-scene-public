import test from 'node:test';
import assert from 'node:assert/strict';
import {NEAR_LIMITS,HUMANOID_LIMITS,NEAR_IK_LIMITS,createNearCharacters}
 from '../src/life/near-characters.mjs';
import {WARDROBE} from '../src/player/character-asset.mjs';
import {ARCHETYPES} from '../src/life/appearance.mjs';

const channels=hex=>[(hex>>16)&255,(hex>>8)&255,hex&255];
const distance=(a,b)=>{const x=channels(a),y=channels(b);
 return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};

test('the humanoid and foot IK budgets are bounded by the pool itself',()=>{
 for(const tier of Object.keys(NEAR_LIMITS)){
  assert.ok(HUMANOID_LIMITS[tier]<=NEAR_LIMITS[tier],
   `${tier}: more humanoids than near slots`);
  // Only a humanoid has the joints the solver needs, so IK can never exceed the humanoids.
  assert.ok(NEAR_IK_LIMITS[tier]<=HUMANOID_LIMITS[tier],
   `${tier}: more foot IK than humanoids`);
 }
 // LOW is the tier that must stay cheapest; it gets neither.
 assert.equal(HUMANOID_LIMITS.low,0);
 assert.equal(NEAR_IK_LIMITS.low,0);
});

test('the pool reports what it deployed, and stays within its own limits',async()=>{
 const pool=createNearCharacters('high');
 const before=pool.inspect();
 assert.equal(before.limit,NEAR_LIMITS.high);
 assert.equal(before.humanoidLimit,HUMANOID_LIMITS.high);
 assert.equal(before.ikLimit,NEAR_IK_LIMITS.high);
 assert.equal(before.humanAssetReady,false,'no humanoid until one is handed over');
 assert.equal(before.humanoidsActive,0);
 // Without a humanoid asset the pool must still work -- that is the fallback path a session
 // which never finishes loading the character takes.
 const people=[];
 for(let id=0;id<40;id++)
  people.push({id,active:true,archetype:'adult',x:id*.4,z:0,heading:0,speed:1,
   renderX:id*.4,renderZ:0,height:0,reactionUntil:-1});
 // Many frames, not one. The pool grows by a slot per frame and every slot is a skeleton and
 // a mixer, so an unbounded growth condition does not show up until it has been running for a
 // while -- which is exactly when it matters.
 let selected;
 for(let frame=0;frame<400;frame++)selected=pool.update(people,{x:0,z:0},1/60,frame/60);
 assert.ok(selected.size<=NEAR_LIMITS.high,'more bodies than the pool allows');
 const after=pool.inspect();
 assert.equal(after.humanoidsActive,0,'no humanoids should exist without the asset');
 assert.ok(after.capacity<=NEAR_LIMITS.high,
  `the pool grew to ${after.capacity} slots against a limit of ${NEAR_LIMITS.high}`);
 assert.equal(after.footIK,0);
 pool.dispose();
});

test('the pool stays bounded, and aims, under a crowd dense enough to churn',async()=>{
 // Density is the whole point of this test. An earlier version used 40 people and passed
 // against a pool that was in fact building 27 humanoids against a budget of 8: below about
 // a hundred, slots are never recycled fast enough for the fault to appear. The scramble
 // crossing carries ~1978 people and the scene reproduced the 28. 300 is the smallest count
 // measured (qa/gta-upgrade/poolprobe.mjs) that reproduces it reliably.
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);

 const pool=createNearCharacters('high');
 pool.setHumanAsset(asset);
 const people=[];
 for(let id=0;id<300;id++)people.push({id,active:true,archetype:'adult',
  x:0,z:0,heading:0,speed:1.3,renderX:0,renderZ:0,height:0,reactionUntil:-1,
  ang:id*.41,rad:2+(id*7%26),drift:(id%2?1:-1)*(.2+(id%5)*.15)});

 let peakHumanoids=0,peakCapacity=0,peakIK=0,aimed=0,samples=0;
 for(let frame=0;frame<900;frame++){
  for(const p of people){
   p.rad+=p.drift*(1/60);if(p.rad>34)p.rad=1;if(p.rad<1)p.rad=34;p.ang+=.02;
   p.x=p.renderX=Math.cos(p.ang)*p.rad;p.z=p.renderZ=Math.sin(p.ang)*p.rad;
  }
  const selected=pool.update(people,{x:0,z:0},1/60,frame/60);
  const now=pool.inspect();
  peakHumanoids=Math.max(peakHumanoids,now.humanoidSlots,now.humanoidsActive);
  peakCapacity=Math.max(peakCapacity,now.capacity);
  peakIK=Math.max(peakIK,now.footIK);
  // Does the fidelity land on the people the camera is looking at? Rank the held citizens by
  // distance and count how many of the nearest few are wearing a humanoid.
  if(frame>120&&frame%10===0){
   const nearest=[...selected].map(id=>people.find(q=>q.id===id))
    .sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,HUMANOID_LIMITS.high);
   if(nearest.length){
    let hit=0;for(const q of nearest)if(pool.bodyOf(q.id)==='humanoid')hit++;
    aimed+=hit/nearest.length;samples++;
   }
  }
 }
 assert.ok(peakCapacity<=NEAR_LIMITS.high,
  `the pool grew to ${peakCapacity} slots against a limit of ${NEAR_LIMITS.high}`);
 assert.ok(peakHumanoids>0,'the humanoid asset was never used');
 assert.ok(peakHumanoids<=HUMANOID_LIMITS.high,
  `${peakHumanoids} humanoids against a budget of ${HUMANOID_LIMITS.high}`);
 // Without a ground context no slot may take foot IK at all.
 assert.equal(peakIK,0,'foot IK without a ground query');

 // RUN 6.8: the run is judged on how many different people are on screen, so that is what
 // gets pinned. Eight humanoids that are all the same silhouette satisfied every assertion
 // above and was exactly the problem.
 const now=pool.inspect();
 assert.equal(now.archetypes,ARCHETYPES.length,
  `only ${now.archetypes} of ${ARCHETYPES.length} silhouettes on screen`);
 const spread=Object.values(now.archetypeSlots);
 assert.ok(Math.max(...spread)-Math.min(...spread)<=1,
  `the humanoid slots are not evenly spread across archetypes: ${JSON.stringify(now.archetypeSlots)}`);
 // A fixed spread needs no rebuilds. A climbing count means the mix is chasing the crowd,
 // which is the oscillation the round-robin replaced.
 assert.equal(now.rebuilds,0,`${now.rebuilds} slot rebuilds`);

 // The budget holding is not enough on its own: eight humanoids spent on the eight people
 // furthest away would satisfy every assertion above and miss the entire point of the run.
 // Measured at 84-85%; the shortfall is the swap hysteresis and one swap per frame, both
 // deliberate. 70% is a floor with room, not the measurement.
 const aim=aimed/samples;
 assert.ok(aim>=.7,
  `only ${(aim*100).toFixed(0)}% of the nearest citizens wear a humanoid`);
 pool.dispose();
});

test('a pool with no focus releases everything',()=>{
 const pool=createNearCharacters('high');
 const people=[{id:1,active:true,archetype:'adult',x:0,z:0,heading:0,speed:0,
  renderX:0,renderZ:0,height:0,reactionUntil:-1}];
 pool.update(people,{x:0,z:0},1/60,0);
 const released=pool.update(people,null,1/60,0);
 assert.equal(released.size,0,'a pool without a focus must hold nothing');
 pool.dispose();
});

// The player-versus-crowd colour check moved to tests/appearance.test.mjs with the wardrobe
// itself, when RUN 6.8 replaced the eight shirt colours in near-characters.mjs with the
// appearance recipe.
