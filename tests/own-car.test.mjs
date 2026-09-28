// PLAN-POLICE-AND-OWN-CAR Step H: the player's own drift fastback, "Kaze FR".
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Vector3} from 'three';
import {VEHICLES} from '../src/traffic/config.mjs';
import {buildVehicleShape} from '../src/traffic/vehicle-shape.mjs';
import {fleetGeometry,paintOf} from '../src/traffic/fleet.mjs';
import {createVehicleAsset,popupTarget,POPUP} from '../src/player/vehicle-asset.mjs';
import {createPlayerVehicle,CAR,OWN} from '../src/player/vehicle.mjs';
import {handling,resetDynamics} from '../src/player/vehicle-dynamics.mjs';
import {engineVoice,AUDIO} from '../src/player/audio.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import vehiclePack from '../src/player/generated/vehicles.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 return new TrafficSimulation(graph,{tier:'high',street:pack.street.high});
}

test('the player starts with the own car, and it is a fictional, owned type',()=>{
 assert.equal(CAR.type,'ownCar');
 const def=VEHICLES.ownCar;
 assert.equal(def.name,'Kaze FR');assert.equal(def.owned,true);assert.equal(def.weight,0);
 const shape=buildVehicleShape('ownCar');
 for(const a of ['driverSeat','driverDoor','driverEntry','driverExit','frontLeftWheel','frontRightWheel','rearLeftWheel','rearRightWheel'])
  assert.ok(shape.anchors[a]?.every(Number.isFinite),`no ${a}`);
 assert.equal(shape.doors.length,2);assert.equal(shape.popups.length,2);
 const parts=fleetGeometry('ownCar');
 for(const part of ['body','glass','dark','front','rear'])assert.ok(parts[part],`no ${part}`);
 assert.equal(paintOf(3,'ownCar').hex,def.color,'the own car is always its own orange');
 assert.ok(vehiclePack.models.ownCar,'the close-range pack has no own car: npm run bake:playable');
});

test('pop-up lamps are up at night and down by day',()=>{
 assert.equal(popupTarget(.14),0,'day lamp level');
 assert.equal(popupTarget(.84),1,'night lamp level');
 const asset=createVehicleAsset('ownCar');
 const pivot=asset.root.getObjectByName('player-vehicle-popup-1');
 const lamp=pivot.children.find(m=>m.name==='traffic-player-front');
 const facing=()=>{asset.root.updateMatrixWorld(true);const n=new Vector3(0,-1,0).transformDirection(lamp.matrixWorld);return n;};
 asset.setPopups(0);
 const top0=new Box3().setFromObject(pivot).max.y;
 assert.ok(facing().y<-.9,'shut, the lamp faces down into the nose');
 asset.setPopups(1);
 const top1=new Box3().setFromObject(pivot).max.y;
 assert.ok(top1>top0+.1,`the pod does not rise (${top0} -> ${top1})`);
 assert.ok(facing().z>.9,'open, the lamp does not face forward');
 assert.equal(pivot.rotation.x,-POPUP.open);
 // The sedan has none.
 assert.equal(createVehicleAsset('sedan').popups,null);
 asset.dispose();
});

test('the drift tune slides further than the sedan under the same handbrake turn',()=>{
 const slide=type=>{
  const s={speed:12,heading:0,steering:0,damage:0};resetDynamics(s);let peak=0;
  for(let i=0;i<90;i++){const r=handling(s,VEHICLES[type],{forward:0,strafe:1,handbrake:i<45},1/60);s.heading=r.heading;peak=Math.max(peak,Math.abs(s.lateral));}
  return peak;
 };
 assert.ok(slide('ownCar')>slide('sedan')*1.15,`own ${slide('ownCar')} vs sedan ${slide('sedan')}`);
});

test('traffic never spawns or despawns the own car',()=>{
 const sim=traffic();
 sim.refill(true);for(let i=0;i<120;i++)sim.update(1/30);
 assert.equal(sim.pool.filter(v=>v.active&&v.type==='ownCar').length,0);
 const car=createPlayerVehicle(sim,flat);
 assert.ok(car.spawn(0,40),'no room to park the own car');
 const own=car.own;assert.equal(own.type,'ownCar');assert.equal(own.owned,true);
 car.reserve(sim.pool.find(v=>v.active&&v.parked&&v!==own));   // take another car
 assert.equal(own.controlled,false);
 sim.setTier('low');
 assert.equal(own.active,true,'a tier change despawned the own car');
 sim.dispose();
});

test('a lost own car comes back near the player after a short time',()=>{
 const sim=traffic();sim.refill(true);
 const car=createPlayerVehicle(sim,flat);
 assert.ok(car.spawn(0,40));
 const own=car.own;
 // Walked far away: nothing until the delay has passed, then it is parked near the player.
 const far={x:own.x+OWN.lostDistance+40,z:own.z};
 let back=false,t=0;
 for(;t<OWN.returnDelay+1&&!back;t+=.1)back=car.keepOwn(.1,far.x,far.z);
 assert.ok(back,'the car never came back');
 assert.ok(t>=OWN.returnDelay-.05,'it came back before the delay');
 assert.ok(Math.hypot(car.own.x-far.x,car.own.z-far.z)<45,'it came back somewhere else');
 // Gone from the pool entirely (despawned): it is rebuilt in a free slot.
 car.own.active=false;
 back=false;for(t=0;t<OWN.returnDelay+1&&!back;t+=.1)back=car.keepOwn(.1,far.x,far.z);
 assert.ok(back&&car.own.active&&car.own.type==='ownCar');
 // Nearby and whole: never moved.
 const x=car.own.x;assert.equal(car.keepOwn(10,car.own.x+3,car.own.z),false);assert.equal(car.own.x,x);
 sim.dispose();
});

test('the own car has a higher, buzzier synthesised engine',()=>{
 const own=engineVoice(VEHICLES.ownCar.engine),base=engineVoice(null);
 assert.ok(own.idleHz>base.idleHz&&own.revHz>base.revHz);
 assert.notEqual(own.wave,base.wave);
 assert.equal(base.idleHz,AUDIO.idleHz);
});
