// Found on the device (2026-09-25): rammed by a patrol car, the player's car stopped and could not
// drive on. A chasing patrol car stopped 4.5 m centre to centre -- inside two car half-lengths --
// and the player's move test then refused every move, away from it included.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerVehicle} from '../src/player/vehicle.mjs';
import {createPoliceUnits,UNITS} from '../src/police/units.mjs';
import {boxOverlap} from '../src/traffic/path.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';

const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
const traffic=pool=>({pool,graph:{ctx:{solid:{query:()=>[]}}},
 blocked(p,type,exclude,pad=.3){return pool.some(o=>o!==exclude&&o.active&&boxOverlap(p,VEHICLES[type],o,VEHICLES[o.type],pad));},
 despawn(){},releasePermits(){}});
const slot=(type,x,z,heading=0,extra={})=>({active:true,type,x,z,heading,speed:0,parked:false,controlled:false,locks:new Set(),passed:new Set(),yellowStops:new Set(),...extra});

test('a car with a patrol car rammed into it drives out of the hit',()=>{
 const mine=slot('sedan',0,0,0),police=slot('police',0,-3.2,0,{controlled:true,siren:true});   // pressed into its rear
 const sim=traffic([mine,police]);
 assert.ok(boxOverlap(mine,VEHICLES.sedan,police,VEHICLES.police,.3),'the set-up is not an overlap');
 const car=createPlayerVehicle(sim,flat);assert.ok(car.takeOver(mine));
 for(let i=0;i<60;i++)car.step(1/30,{forward:1,strafe:0,handbrake:false});
 assert.ok(car.state.z>1.5,`the car moved only ${car.state.z.toFixed(2)} m away from the patrol car`);
 assert.ok(Math.abs(car.state.speed)>1,'the car is still stalled');
});

test('...but it still cannot drive INTO a car, rammed or not',()=>{
 const mine=slot('sedan',0,0,0),police=slot('police',0,4.2,0,{controlled:true});                 // pressed into its nose
 const sim=traffic([mine,police]);const car=createPlayerVehicle(sim,flat);car.takeOver(mine);
 const start=Math.hypot(car.state.x-police.x,car.state.z-police.z);
 for(let i=0;i<30;i++)car.step(1/30,{forward:1,strafe:0,handbrake:false});
 assert.ok(Math.hypot(car.state.x-police.x,car.state.z-police.z)>=start-1e-6,'drove further into the patrol car');
});

test('a chasing patrol car stops with a real gap, bumper to bumper, and never overlaps the player\'s car',()=>{
 const units=createPoliceUnits();
 const me={x:0,z:0,heading:0,type:'ownCar',speed:0};
 const v=slot('police',0,-25,0,{controlled:true,siren:true,pursuit:{leaving:false}});
 const sim={pool:[v],graph:null,despawn(){}};
 units.cars.add(v);
 let overlapped=false;
 for(let i=0;i<30*20;i++){units.update(1/30,{stars:2,traffic:sim,me,driving:true,carSpeed:0});
  if(boxOverlap(v,VEHICLES.police,me,VEHICLES.ownCar,0))overlapped=true;}
 assert.ok(!overlapped,'the patrol car drove into the player\'s car');
 const gap=Math.hypot(v.x,v.z)-(VEHICLES.police.length+VEHICLES.ownCar.length)/2;
 assert.ok(gap>=UNITS.carGap-.05&&gap<UNITS.carGap+1,`bumper gap ${gap.toFixed(2)} m`);
 // Owner's plan: standing still next to it is no longer an arrest (only being shot dead is).
 let result=null;for(let t=0;t<3.5&&!result;t+=1/30)result=units.update(1/30,{stars:2,traffic:sim,me,driving:true,carSpeed:0}).result;
 assert.equal(result,null);
});
