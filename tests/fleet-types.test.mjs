// PLAN-LOOKS-AND-FLEET Step C: the new street classes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3} from 'three';
import {VEHICLES} from '../src/traffic/config.mjs';
import {buildVehicleShape,SILHOUETTES,STYLES} from '../src/traffic/vehicle-shape.mjs';
import {fleetGeometry,paintOf,LIVERY} from '../src/traffic/fleet.mjs';
import {VEHICLE_MASS} from '../src/player/vehicle-impact.mjs';
import {PARKED_MIX} from '../src/traffic/simulation.mjs';
import {createPlayerVehicle} from '../src/player/vehicle.mjs';
import {createVehicleVisual} from '../src/player/vehicle-visual.mjs';
import {handling,resetDynamics} from '../src/player/vehicle-dynamics.mjs';
import vehiclePack from '../src/player/generated/vehicles.mjs';

const NEW=['longVan','minivan','tallKei','cityTaxi','truck2t','police','coupe'];
const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));

test('every new type has a silhouette, a mass, a spawn weight and all its anchors',()=>{
 for(const type of NEW){
  const def=VEHICLES[type];
  assert.ok(def,`${type} is not in VEHICLES`);
  assert.ok(SILHOUETTES.includes(STYLES[type]),`${type} has no silhouette`);
  assert.ok(VEHICLE_MASS[type]>0,`${type} has no mass`);
  assert.ok(def.weight>0,`${type} never spawns`);
  const shape=buildVehicleShape(type);
  for(const a of ['driverSeat','driverDoor','driverEntry','driverExit','frontLeftWheel','rearRightWheel'])
   assert.ok(shape.anchors[a]?.every(Number.isFinite),`${type} has no ${a}`);
  // The seat is inside the body, where a seated driver can be drawn.
  const [x,y,z]=shape.anchors.driverSeat;
  assert.ok(Math.abs(x)<def.width/2&&Math.abs(z)<def.length/2&&y>0&&y<def.height,`${type} seat outside the body`);
  const parts=fleetGeometry(type);
  for(const part of ['body','glass','dark','front','rear'])assert.ok(parts[part],`${type} has no ${part}`);
 }
});

test('the spawn mix is the plan\'s Scramble mix',()=>{
 const w=t=>VEHICLES[t].weight;
 const total=Object.keys(VEHICLES).reduce((n,t)=>n+w(t),0);
 assert.equal(total,100);
 assert.equal(w('taxi')+w('cityTaxi'),25);
 assert.equal(w('minivan'),14);
 assert.equal(w('kei')+w('tallKei'),12);
 assert.equal(w('van')+w('longVan'),10);
 assert.equal(w('truck2t')+w('keiTruck'),8);
 assert.equal(w('scooter'),5);assert.equal(w('coupe'),2);
 assert.ok(w('police')>=1&&w('police')<=2);
 assert.ok(VEHICLES.bus.majorOnly,'the bus stays on major roads');
});

test('every type can drive the baked lane graph, and the new bodies park',()=>{
 const allowed=new Set();for(const l of pack.traffic.high.lanes)for(const t of l.allowed)allowed.add(t);
 // Roadmap stage 4: a hand-driven service vehicle (the ambulance) is moved along a police lane by
 // life/aftermath.mjs, never by the traffic simulation, so it needs no lanes of its own.
 for(const type of Object.keys(VEHICLES))if(!VEHICLES[type].handDriven)assert.ok(allowed.has(type),`${type} is allowed on no lane: rebake the static pack`);
 for(const type of ['tallKei','minivan','longVan','truck2t'])assert.ok(PARKED_MIX.includes(type));
});

test('the player can take every new type, and it is drawn close up from the playable pack',()=>{
 for(const type of NEW){
  const sim={pool:[],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false};
  const car=createPlayerVehicle(sim,flat),slot={type,x:0,z:0,heading:0,locks:new Set(),passed:new Set(),yellowStops:new Set()};
  assert.equal(car.takeOver(slot),true,`${type} cannot be taken`);
  assert.equal(car.def,VEHICLES[type]);
  assert.ok(vehiclePack.models[type],`${type} is missing from the playable pack: npm run bake:playable`);
  const visual=createVehicleVisual();
  visual.update({...car.state,active:true,type,slot},0);
  assert.equal(visual.asset?.type,type);
  visual.dispose();car.release();
 }
});

test('a long van is heavy to turn and a coupe light',()=>{
 const yaw=type=>{
  const s={speed:10,heading:0,steering:0,damage:0};resetDynamics(s);
  let h=0;for(let i=0;i<60;i++){const r=handling(s,VEHICLES[type],{forward:0,strafe:1},1/60);h=r.heading;s.heading=h;}
  return Math.abs(h);
 };
 assert.ok(yaw('longVan')<yaw('sedan')&&yaw('sedan')<yaw('coupe'),`${yaw('longVan')} ${yaw('sedan')} ${yaw('coupe')}`);
});

test('the patrol car is black and white with a red roof bar, and nothing written on it',()=>{
 const p=paintOf(5,'police');
 assert.equal(p.livery,LIVERY.police.id);
 const shape=buildVehicleShape('police');
 assert.ok(shape.anchors.lightbar,'no light bar anchor for the siren');
 // Step P: the bar is its own part, not the tail lamp, so the siren can flash it independently.
 const box=new Box3().setFromBufferAttribute(shape.geometry.lightbar.attributes.position);
 assert.ok(box.max.y>VEHICLES.police.height,'the light bar is not on the roof');
 const tailBox=new Box3().setFromBufferAttribute(shape.geometry.tail.attributes.position);
 assert.ok(tailBox.max.y<VEHICLES.police.height,'the tail lamps should not reach the roof any more');
 assert.equal(buildVehicleShape('sedan').anchors.lightbar,undefined);
});

test('the 2-tonne truck carries a box as tall as its cargo height',()=>{
 const shape=buildVehicleShape('truck2t');
 const box=new Box3().setFromBufferAttribute(shape.geometry.paint.attributes.position);
 assert.ok(Math.abs(box.max.y-VEHICLES.truck2t.cargo.height)<.02,`${box.max.y}`);
});
