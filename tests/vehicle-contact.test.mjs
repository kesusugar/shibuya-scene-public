import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeContact,respondToContact} from '../src/player/vehicle-contact.mjs';
import {createPlayerVehicle} from '../src/player/vehicle.mjs';
const def={width:2,length:4};
const state=(speed=10)=>({x:0,z:0,heading:0,speed,lateral:0,yawRate:0});
test('head-on removes closing velocity; separating reverse is unchanged',()=>{
 const a=state();assert.equal(respondToContact(a,def,{x:0,z:2,nx:0,nz:-1}),10);assert.equal(a.speed,0);
 const b=state(-3);assert.equal(respondToContact(b,def,{x:0,z:2,nx:0,nz:-1}),0);assert.equal(b.speed,-3);
});
test('glancing corner preserves slide and creates bounded rotation without energy gain',()=>{
 const a=state();const n=Math.SQRT1_2;
 respondToContact(a,def,{x:1,z:2,nx:-n,nz:-n});
 assert.ok(a.speed>0&&a.lateral<0);assert.ok(Math.abs(a.yawRate)>0);
 assert.ok(a.speed**2+a.lateral**2+(20/12)*a.yawRate**2<=100+1e-8);
});
test('rotated polygon edge gives outward unit normal',()=>{
 const hit=edgeContact([[0,0],[4,4],[5,3],[1,-1]],{x:0,z:2});
 assert.ok(Math.abs(hit.nx+Math.SQRT1_2)<1e-8);assert.ok(Math.abs(hit.nz-Math.SQRT1_2)<1e-8);
});
test('sustained wall contact stays outside and reverse releases',()=>{
 const wall={outer:[[-20,3],[20,3],[20,5],[-20,5]]};
 const sim={pool:[],graph:{ctx:{solid:{query:()=>[{value:wall}]}}},blocked:()=>false};
 const car=createPlayerVehicle(sim,{height:()=>0});car.takeOver({type:'sedan',x:0,z:0,heading:0});car.state.speed=10;
 for(let i=0;i<240;i++)car.step(1/120,{forward:true});
 assert.ok(car.state.z<1);const damage=car.state.damage;assert.ok(damage<.4);
 const before=car.state.z;for(let i=0;i<120;i++)car.step(1/120,{forward:-1});
 assert.ok(car.state.z<before);assert.equal(car.state.damage,damage);
});
test('reverse and lateral-only travel follow the actual momentum vector',async()=>{
 const {handling}=await import('../src/player/vehicle-dynamics.mjs');
 for(const speed of [0,-3]){
  const a={...state(speed),lateral:2,damage:0,steering:0,acceleration:0};
  const result=handling(a,{...def,speed:15},{},1/120);
  assert.ok(Math.sin(result.course)*result.travel>0);
 }
});
test('traffic contact rejects overlap without moving traffic out of its lane',async()=>{
 const {boxOverlap}=await import('../src/traffic/path.mjs');
 const {VEHICLES}=await import('../src/traffic/config.mjs');
 const obstacle={active:true,type:'sedan',x:0,z:6,heading:0};
 const sim={pool:[obstacle],graph:{ctx:{solid:{query:()=>[]}}},blocked:(p,type)=>boxOverlap(p,VEHICLES[type],obstacle,VEHICLES.sedan,.05)};
 const car=createPlayerVehicle(sim,{height:()=>0});car.takeOver({type:'sedan',x:0,z:0,heading:0});car.state.speed=10;
 for(let i=0;i<120;i++)car.step(1/120,{forward:1});
 assert.equal(boxOverlap(car.state,VEHICLES.sedan,obstacle,VEHICLES.sedan,0),false);
 assert.equal(obstacle.z,6);assert.ok(car.state.damage>0);
});
