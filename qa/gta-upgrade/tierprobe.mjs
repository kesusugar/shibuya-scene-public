import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createNearCharacters,NEAR_LIMITS,HUMANOID_LIMITS,NEAR_IK_LIMITS} from '../../src/life/near-characters.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const b=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((r,j)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
const asset=humanoidCitizen(gltf,report);
const people=[];
for(let id=0;id<300;id++)people.push({id,active:true,archetype:'adult',x:0,z:0,heading:0,speed:1.3,
 renderX:0,renderZ:0,height:0,reactionUntil:-1,ang:id*.41,rad:2+(id*7%26),drift:(id%2?1:-1)*(.2+(id%5)*.15)});
const churn=(pool,frames)=>{for(let f=0;f<frames;f++){
 for(const p of people){p.rad+=p.drift/60;if(p.rad>34)p.rad=1;if(p.rad<1)p.rad=34;p.ang+=.02;
  p.x=p.renderX=Math.cos(p.ang)*p.rad;p.z=p.renderZ=Math.sin(p.ang)*p.rad;}
 pool.update(people,{x:0,z:0},1/60,f/60);}};
for(const tier of ['high','medium','low']){
 const pool=createNearCharacters(tier);pool.setHumanAsset(asset);churn(pool,600);
 const s=pool.inspect();
 const ok=s.humanoidSlots<=HUMANOID_LIMITS[tier]&&s.capacity<=NEAR_LIMITS[tier]&&s.footIK<=NEAR_IK_LIMITS[tier];
 console.log(tier.padEnd(7),JSON.stringify({cap:s.capacity,limit:NEAR_LIMITS[tier],
  humanoid:s.humanoidSlots,humanoidLimit:HUMANOID_LIMITS[tier],ik:s.footIK,
  baked:s.bakedActive,tris:Math.round(s.triangles/1000)+'k',draw:s.drawCallsUpperBound}),ok?'OK':'OVER BUDGET');
 pool.dispose();
}
// Tier demotion must actually release humanoids, not just slots.
const pool=createNearCharacters('high');pool.setHumanAsset(asset);churn(pool,400);
const before=pool.inspect();
pool.setTier('low');churn(pool,120);
const after=pool.inspect();
console.log('high->low  ',JSON.stringify({wasHumanoid:before.humanoidSlots,wasCap:before.capacity,
 nowHumanoid:after.humanoidSlots,nowCap:after.capacity,nowIK:after.footIK}),
 after.humanoidSlots===0&&after.capacity<=NEAR_LIMITS.low?'OK':'LEAKED');
pool.dispose();
