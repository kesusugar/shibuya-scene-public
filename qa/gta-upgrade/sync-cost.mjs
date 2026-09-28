// RUN 12.0: what the HQ layer's per-frame sync costs at the real population, and how much of
// it is choosing who to draw. CPU only, offline and deterministic; no frame rate is reported.
//   node qa/gta-upgrade/sync-cost.mjs
import {readFileSync} from 'node:fs';
import {createHQLayer} from '../../src/life/hq-layer.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

let seed=12345;const rand=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
function population(n){
 const people=[];
 for(let id=0;id<n;id++){
  const x=(rand()-.5)*260,z=(rand()-.5)*260;
  people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',x,z,renderX:x,renderZ:z,
   height:0,heading:rand()*6.28,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});
 }
 return people;
}
function run(budget,frames=600){
 seed=12345;const people=population(1978),layer=createHQLayer(manifest,bin,{budget});
 const camera={x:0,z:0},dt=1/60,times=[];
 for(let f=0;f<frames;f++){
  for(const p of people){p.x+=Math.sin(p.heading)*p.speed*dt;p.z+=Math.cos(p.heading)*p.speed*dt;p.renderX=p.x;p.renderZ=p.z;}
  camera.x=Math.sin(f*.01)*20;
  const t0=performance.now();layer.sync(people,camera,dt,{time:f*dt});times.push(performance.now()-t0);
 }
 const warm=times.slice(120).sort((a,b)=>a-b);
 const mean=warm.reduce((s,v)=>s+v,0)/warm.length;
 return {budget,drawn:layer.stats.hq,meanMs:+mean.toFixed(3),p95Ms:+warm[Math.floor(warm.length*.95)].toFixed(3)};
}
console.log(JSON.stringify([run(1978),run(512)],null,1));
