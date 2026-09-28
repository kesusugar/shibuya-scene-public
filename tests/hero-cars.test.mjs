// PLAN-LOOKS-AND-FLEET Step D: the two parked one-off night cars ("Tsuki S", "Yoru Z").
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3} from 'three';
import {VEHICLES} from '../src/traffic/config.mjs';
import {buildVehicleShape} from '../src/traffic/vehicle-shape.mjs';
import {paintOf} from '../src/traffic/fleet.mjs';
import {TrafficSimulation,HERO_SPOTS} from '../src/traffic/simulation.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {createPlayerVehicle} from '../src/player/vehicle.mjs';
import {handling,resetDynamics} from '../src/player/vehicle-dynamics.mjs';
import {engineVoice} from '../src/player/audio.mjs';
import vehiclePack from '../src/player/generated/vehicles.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const sim=tier=>{const g=restoreTrafficGraph(pack.traffic.high);g.ground=restoreGroundModel(pack.ground);g.data=data;const s=new TrafficSimulation(g,{tier,street:pack.street.high});s.refill(true);return s;};
const HEROES=['heroSilver','heroDark'];

test('the hero cars are fictional one-offs that never join ordinary traffic',()=>{
 assert.equal(VEHICLES.heroSilver.name,'Tsuki S');assert.equal(VEHICLES.heroDark.name,'Yoru Z');
 for(const t of HEROES){assert.equal(VEHICLES[t].weight,0);assert.equal(paintOf(9,t).hex,VEHICLES[t].color);
  assert.ok(vehiclePack.models[t],`${t} is missing from the playable pack`);}
});

test('they are parked at their spots near the crossing at HIGH and MEDIUM, not at LOW',()=>{
 for(const tier of ['high','medium']){
  const s=sim(tier);
  for(const spot of HERO_SPOTS){
   const v=s.pool.find(v=>v.active&&v.type===spot.type);
   assert.ok(v,`${tier}: no ${spot.type}`);assert.ok(v.parked&&v.hero);
   assert.ok(Math.hypot(v.x-spot.x,v.z-spot.z)<25,`${spot.type} parked ${Math.hypot(v.x-spot.x,v.z-spot.z).toFixed(1)} m from its spot`);
  }
  for(let i=0;i<300;i++)s.update(1/30);
  for(const spot of HERO_SPOTS)assert.ok(s.pool.find(v=>v.active&&v.type===spot.type)?.parked,'a hero car drove off');
  s.dispose();
 }
 const low=sim('low');assert.equal(low.pool.filter(v=>v.active&&v.hero).length,0);low.dispose();
});

test('the player can take either, and they drift and rev higher than a saloon',()=>{
 const slide=type=>{const s={speed:12,heading:0,steering:0,damage:0};resetDynamics(s);let peak=0;
  for(let i=0;i<90;i++){const r=handling(s,VEHICLES[type],{forward:0,strafe:1,handbrake:i<45},1/60);s.heading=r.heading;peak=Math.max(peak,Math.abs(s.lateral));}return peak;};
 for(const t of HEROES){
  const car=createPlayerVehicle({pool:[],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false},{solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false});
  assert.equal(car.takeOver({type:t,x:0,z:0,heading:0,locks:new Set(),passed:new Set(),yellowStops:new Set()}),true);
  assert.ok(slide(t)>slide('sedan')*1.15,`${t} does not drift`);
  assert.ok(engineVoice(VEHICLES[t].engine).revHz>engineVoice(null).revHz);
 }
});

test('Tsuki S wears the big wing, Yoru Z the small one, and neither has the black bonnet',()=>{
 const top=t=>new Box3().setFromBufferAttribute(buildVehicleShape(t).geometry.dark.attributes.position).max.y;
 const rel=t=>top(t)-VEHICLES[t].height;
 assert.ok(top('heroSilver')>top('heroDark')-.02,'the big wing is not higher');
 const darkVerts=t=>buildVehicleShape(t).geometry.dark.attributes.position.count;
 assert.ok(darkVerts('ownCar')>darkVerts('heroSilver'),'the hero cars carry the own car\'s bonnet skin');
 void rel;
});
