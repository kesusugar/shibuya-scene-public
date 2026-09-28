import test from 'node:test';
import assert from 'node:assert/strict';
import {createQfrontCafe,paintCafe} from '../src/heroes/cafe.mjs';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {TimeState} from '../src/app/foundation.mjs';
import {Scene,Group} from 'three';
import {readFileSync} from 'node:fs';
import {prepareHero} from '../src/heroes/model.mjs';
import {HERO_DEFINITIONS,HERO_CONFIG} from '../src/heroes/config.mjs';
const hero={footprint:{outer:[[0,0],[12,0],[12,12],[0,12]],holes:[]},primaryFacade:{direction:[0,1]}};
test('cafe uses one finite facade batch and releases owned resources',()=>{
 const cafe=createQfrontCafe(hero);assert.equal(cafe.fronts.length,1);assert.equal(cafe.triangles,338);
 assert.equal(cafe.frames.root.children.length,1);
 assert.equal(cafe.frames.records.length,28);
 assert.ok(cafe.frames.records.every(r=>r.position.every(Number.isFinite)&&r.size[2]<=.2));
 assert.ok([...cafe.mesh.geometry.attributes.position.array].every(Number.isFinite));
 let disposed=0,framesDisposed=0;cafe.mesh.material.map.addEventListener('dispose',()=>disposed++);cafe.frames.root.children[0].geometry.addEventListener('dispose',()=>framesDisposed++);cafe.dispose();cafe.dispose();assert.equal(disposed,1);assert.equal(framesDisposed,1);
});
test('physical framing remains bounded on the mapped QFRONT facades',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data/shibuya-scene-data.json',import.meta.url)));
 const h=prepareHero(data,HERO_DEFINITIONS.find(d=>d.key==='qfront'));
 const before=JSON.stringify(h.footprint),cafe=createQfrontCafe(h);
 assert.equal(JSON.stringify(h.footprint),before);
 assert.equal(cafe.frames.records.length,cafe.fronts.length*28);
 assert.ok(cafe.frames.records.every(r=>r.position.every(Number.isFinite)&&r.position[1]>=HERO_CONFIG.base+.45&&r.position[1]<=HERO_CONFIG.base+7.15));
 assert.ok(cafe.triangles<2500);
 cafe.dispose();
});
test('shop texture contains branding, shelving and seating rather than a solid light panel',()=>{
 const calls=[],ctx=new Proxy({createLinearGradient(){return {addColorStop(){}};}},{get(t,k){return t[k]??=(...args)=>calls.push([k,...args]);}});
 paintCafe(ctx,2048,1024);assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]==='STARBUCKS'));assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]==='TSUTAYA'));assert.ok(calls.filter(c=>c[0]==='ellipse').length>=20);assert.ok(calls.filter(c=>c[0]==='fillRect').length>250);
});
test('cafe illumination follows existing day/night lifecycle',()=>{
 const scene=new Scene(),time=new TimeState(),env=new DayNightSystem(scene,null,time),root=new Group(),cafe=createQfrontCafe(hero);
 root.add(cafe.mesh);scene.add(root);env.enable();env.register(root);assert.equal(cafe.mesh.material.emissiveIntensity,.12);
 time.set('night');assert.equal(cafe.mesh.material.emissiveIntensity,.42);time.set('day');assert.equal(cafe.mesh.material.emissiveIntensity,.12);env.dispose();cafe.dispose();
});
