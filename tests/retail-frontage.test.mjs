import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCentralRetail,createCentralPolish} from '../src/heroes/polish.mjs';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {TimeState} from '../src/app/foundation.mjs';
import {Scene} from 'three';
import {RETAIL_LAYOUT,retailPoint} from '../src/heroes/retail-layout.mjs';

test('door artwork and physical frame coordinates share a bounded layout',()=>{
 for(const length of [4.1,12,38,75]){
  const left=retailPoint(length,0,0,.5),right=retailPoint(length,12,0,.5);
  assert.equal(left.along,.14);assert.ok(Math.abs(right.along-(length-.14))<1e-8);
  for(const bay of RETAIL_LAYOUT.doors)for(const u of [.1,.43,.49,.55,.88]){
   const p=retailPoint(length,bay,u,.735);
   assert.ok(p.along>0&&p.along<length&&p.y>.5&&p.y<3.5);
  }
 }
});

test('retail includes recessed entrances and bounded deterministic artwork',()=>{
 const calls=[],ctx=new Proxy({createLinearGradient(){return {addColorStop(){}};}},{get(t,k){return t[k]??=(...a)=>calls.push([k,...a]);}});
 paintCentralRetail(ctx,1536,768);
 assert.equal(calls.filter(c=>c[0]==='fillText'&&c[1]==='ENTRANCE').length,3);
 assert.ok(calls.filter(c=>c[0]==='fillRect').length>500);
 assert.ok(calls.every(c=>c.slice(1).filter(v=>typeof v==='number').every(Number.isFinite)));
});
test('retail retains day response and readable night emission',()=>{
 const hero={key:'magnet',footprint:{outer:[[0,0],[12,0],[12,12],[0,12]],holes:[]},primaryFacade:{direction:[0,1]}};
 const polish=createCentralPolish([hero]),scene=new Scene(),time=new TimeState(),env=new DayNightSystem(scene,null,time);
 scene.add(polish.root);env.enable();env.register(polish.root);
 const face=polish.root.getObjectByName('hero-polish-storefront');
 assert.equal(face.material.emissiveIntensity,.16);time.set('night');assert.equal(face.material.emissiveIntensity,.85);
 time.set('day');assert.equal(face.material.emissiveIntensity,.16);
 let disposed=0;face.material.map.addEventListener('dispose',()=>disposed++);
 env.dispose();polish.dispose();polish.dispose();assert.equal(disposed,1);
});
