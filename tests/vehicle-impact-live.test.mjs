import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
import {createPlayerVehicle,CAR} from '../src/player/vehicle.mjs';

// RUN 11.1, end to end: the real player vehicle's contact pass throwing bodies through the
// real simulation flight. Direction, strength, weight, and what a crowd does to the car.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const flat={height:()=>0,safe:()=>true,solid:()=>false,onRoad:()=>true};

function rig(){
 const sim=new TrafficSimulation(graph,{tier:'low',street});
 for(const v of sim.pool)if(v.active)sim.despawn(v,'test');sim.refill=()=>{};
 const car=createPlayerVehicle(sim,flat);
 const slot=sim.pool[0];Object.assign(slot,{active:true,type:'sedan',x:0,z:0,heading:0,speed:0,parked:true});
 car.reserve(slot);car.state.active=true;
 // The crowd side: the simulation's own strike and flight on a flat, open ground.
 const crowd={grid:new Map(),time:0,splashes:[],stats:{},network:{ctx:{height:()=>0,solid:()=>false}},
  say(){},leave(){},strike:CrowdSimulation.prototype.strike,fly:CrowdSimulation.prototype.fly,
  scatter(p,dx,dz){p.shoved=[dx,dz];return true;}};
 const people=[];
 const add=(x,z,o={})=>{const p={id:people.length,active:true,x,z,heading:0,speed:0,height:0,...o};people.push(p);return p;};
 const regrid=()=>{crowd.grid.clear();for(const p of people){const k=Math.floor(p.x/2)+','+Math.floor(p.z/2);if(!crowd.grid.has(k))crowd.grid.set(k,[]);crowd.grid.get(k).push(p);}};
 // Drive straight along +z at the car's own speed (no throttle: what it loses, it keeps lost).
 const drive=(seconds,dt=1/60)=>{for(let t=0;t<seconds;t+=dt){
  const s=car.state;s.x+=Math.sin(s.heading)*s.speed*dt;s.z+=Math.cos(s.heading)*s.speed*dt;
  regrid();car.strikePedestrians(crowd);crowd.time+=dt;
  for(const p of people)if(p.struck!==undefined){p.struck+=dt;crowd.fly(p,dt);}}};
 const go=(speed,o={})=>Object.assign(car.state,{x:0,z:0,heading:0,course:0,speed,lateral:0,yawRate:0,...o});
 return {sim,car,crowd,people,add,drive,go};
}

test('the body goes the way the car hit it, and a corner deflects it',()=>{
 const r=rig();r.go(10);const p=r.add(0,4),q=r.add(.75,12);
 r.drive(3);
 const dx=p.x-0,dz=p.z-4;
 assert.ok(p.struck!==undefined,'the car never hit the person in front of it');
 assert.ok(dz>0&&Math.abs(dx)<.15*dz,`thrown to (${dx.toFixed(2)}, ${dz.toFixed(2)}) by a car going +z`);
 assert.ok(q.struck!==undefined);
 assert.ok(q.x-.75>.3,`the corner-caught body went ${(q.x-.75).toFixed(2)} m right`);
 r.sim.dispose();
});

test('faster is further, and even fast is a heavy body, not a cartoon',t=>{
 const travel=v=>{const r=rig();r.go(v);const p=r.add(0,4);r.drive(4);const d=Math.hypot(p.x,p.z-4);r.sim.dispose();return d;};
 const slow=travel(4),mid=travel(10),fast=travel(18);
 t.diagnostic(`travel after the hit: 4 m/s ${slow.toFixed(2)} m, 10 m/s ${mid.toFixed(2)} m, 18 m/s ${fast.toFixed(2)} m`);
 assert.ok(slow<mid&&mid<fast,`travel ${slow.toFixed(1)} / ${mid.toFixed(1)} / ${fast.toFixed(1)} m`);
 assert.ok(slow<3.5,`a 4 m/s hit carried the body ${slow.toFixed(1)} m`);
 // Forward-projection reconstruction bands (claude/crowd-realism): not a cartoon, not a thud.
 assert.ok(mid>6&&mid<9.5,`a 10 m/s hit carried the body ${mid.toFixed(1)} m`);
 assert.ok(fast>15&&fast<25,`an 18 m/s hit carried the body ${fast.toFixed(1)} m`);
});

test('one person costs a little speed, a line of them a lot, a dense block nearly all of it',t=>{
 const after=(place,t=2.5)=>{const r=rig();r.go(10);place(r);r.drive(t);const v=r.car.state.speed;r.sim.dispose();return v;};
 // The contact itself, and then the same car carrying on over the body it has just thrown.
 const one=after(r=>r.add(0,4),.4),onePlusRunOver=after(r=>r.add(0,4));
 assert.ok(onePlusRunOver>8,`one person and running over them left the car at ${onePlusRunOver.toFixed(2)} m/s`);
 const line=after(r=>{for(let i=0;i<10;i++)r.add((i%2-.5)*.4,4+i*.9);});
 const block=after(r=>{for(let row=0;row<6;row++)for(let c=0;c<5;c++)r.add(-.8+c*.4,4+row*.7);});
 t.diagnostic(`10 m/s sedan: one contact ${one.toFixed(2)}, plus running over them ${onePlusRunOver.toFixed(2)}, ten in a line ${line.toFixed(2)}, dense block of 30 ${block.toFixed(2)} m/s`);
 assert.ok(one>9&&one<10,`one person left the car at ${one.toFixed(2)} m/s`);
 assert.ok(line<6.5,`ten people left it at ${line.toFixed(2)} m/s`);
 assert.ok(block<2.5,`a dense block left it at ${block.toFixed(2)} m/s`);
 assert.ok(one>line&&line>block);
});

test('a downed body is shoved for a moment, never carried for good',()=>{
 const r=rig();r.go(3);const p=r.add(0,4,{});
 r.crowd.strike(p,0,1,0,{x:0,z:0,y:0});                // already lying there
 r.drive(6);
 assert.ok((p.runOverCount??0)<=CAR.runOverHits,`shoved ${p.runOverCount} times`);
 assert.ok((p.runOverCount??0)>=1,'the car never touched the body in its path');
 assert.ok(r.car.state.speed<3,'the car felt nothing going over a body');
 for(const v of [p.x,p.z,p.flyX,p.flyZ,r.car.state.speed])assert.ok(Number.isFinite(v));
 r.sim.dispose();
});
