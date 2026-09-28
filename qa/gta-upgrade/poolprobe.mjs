import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createNearCharacters,NEAR_LIMITS,HUMANOID_LIMITS} from '../../src/life/near-characters.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const asset=humanoidCitizen(gltf,report);

// A crowd like the scene's: many people, walking past, entering and leaving the radius.
function run(label,seedCount,mode){
 const pool=createNearCharacters('high');
 pool.setHumanAsset(asset);
 const people=[];
 for(let id=0;id<seedCount;id++)people.push({id,active:true,archetype:'adult',
  x:0,z:0,heading:0,speed:1.3,renderX:0,renderZ:0,height:0,reactionUntil:-1,
  ang:id*0.41,rad:2+(id*7%26),drift:(id%2?1:-1)*(0.2+(id%5)*0.15)});
 let worst=0,worstCap=0;const aim=[];
 for(let frame=0;frame<900;frame++){
  for(const p of people){
   if(mode==='orbit'){p.ang+=p.drift*(1/60);}
   else {p.rad+=p.drift*(1/60);if(p.rad>34)p.rad=1;if(p.rad<1)p.rad=34;p.ang+=0.02;}
   p.x=p.renderX=Math.cos(p.ang)*p.rad;p.z=p.renderZ=Math.sin(p.ang)*p.rad;
  }
  const sel=pool.update(people,{x:0,z:0},1/60,frame/60);
  const s=pool.inspect();
  if(s.humanoidsActive>worst)worst=s.humanoidsActive;
  if(s.humanoidSlots>worstCap)worstCap=s.humanoidSlots;
  // Does the fidelity actually land on the people the camera is looking at? Rank the
  // selected citizens by distance and ask how many of the nearest N wear a humanoid.
  if(frame>120&&frame%10===0){
   const near=[...sel].map(id=>people.find(q=>q.id===id))
    .sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,HUMANOID_LIMITS.high);
   let hit=0;for(const q of near)if(pool.bodyOf(q.id)==='humanoid')hit++;
   aim.push(near.length?hit/near.length:1);
  }
 }
 const s=pool.inspect();
 console.log(label.padEnd(26),JSON.stringify({cap:s.capacity,humanSlots:s.humanoidSlots,
  peakHumanSlots:worstCap,active:s.humanoidsActive,peakActive:worst,baked:s.bakedActive,
  limit:HUMANOID_LIMITS.high,tris:Math.round(s.triangles/1000)+'k',draw:s.drawCallsUpperBound,
  archetypes:s.archetypes,matched:s.matched,rebuilds:s.rebuilds,slots:s.archetypeSlots,
  nearestOnHumanoid:aim.length?(100*aim.reduce((a,b)=>a+b,0)/aim.length).toFixed(0)+'%':'n/a'}));
 pool.dispose();
}
run('orbit, 40 people',40,'orbit');
run('radial churn, 120 people',120,'radial');
run('radial churn, 300 people',300,'radial');
