import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHQLayer,selectNearest} from '../src/life/hq-layer.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

function pool(count){
 const out=[];let seed=7;const r=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
 for(let id=0;id<count;id++){const x=(r()-.5)*120,z=(r()-.5)*120;
  out.push({id,active:true,controlled:false,archetype:'adult',state:'walking',x,z,renderX:x,renderZ:z,
   height:0,heading:0,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});}
 return out;
}

test('selectNearest puts exactly the k smallest distances first, ties and duplicates included',()=>{
 let seed=3;const r=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
 for(const [n,k] of [[1,1],[2,1],[10,3],[500,128],[1978,512],[64,63]]){
  const list=Array.from({length:n},()=>({d:Math.floor(r()*40)}));   // many equal distances
  const sorted=list.map(e=>e.d).sort((a,b)=>a-b);
  selectNearest(list,n,k);
  const head=list.slice(0,k).map(e=>e.d).sort((a,b)=>a-b);
  assert.deepEqual(head,sorted.slice(0,k),`n=${n} k=${k}`);
  assert.ok(Math.max(...list.slice(0,k).map(e=>e.d))<=Math.min(...list.slice(k).map(e=>e.d),Infinity));
 }
});

test('a smaller budget still draws the nearest citizens, and releases no pedestrian object',()=>{
 const people=pool(900),camera={x:5,z:-3},layer=createHQLayer(manifest,bin,{budget:200});
 const drawn=layer.sync(people,camera,0,{time:0});
 const want=people.map(p=>({id:p.id,d:Math.hypot(p.x-camera.x,p.z-camera.z)})).sort((a,b)=>a.d-b.d).slice(0,200).map(e=>e.id);
 assert.equal(drawn.size,200);
 for(const id of want)assert.ok(drawn.has(id),`nearest ${id} drawn`);
 assert.equal(layer.stats.legacy,700);
});

test('every query in one synced frame shares a single grid build',()=>{
 const people=pool(600),layer=createHQLayer(manifest,bin,{budget:600});
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const before=layer.stats.gridBuilds;
 const car={x:-30,z:0,heading:Math.PI/2,course:Math.PI/2,speed:8,active:true};
 layer.vehicle(car,1/60);
 for(let k=0;k<5;k++)layer.witness({x:0,z:0,severity:.8,kind:'accident'});
 assert.equal(layer.stats.gridBuilds-before,1,'vehicle + five witness events = one build');
 layer.sync(people,{x:0,z:0},1/60,{time:1/60});
 layer.witness({x:0,z:0,severity:.8});
 assert.equal(layer.stats.gridBuilds-before,2,'a new frame rebuilds once more');
});
