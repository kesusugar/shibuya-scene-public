import test from 'node:test';
import assert from 'node:assert/strict';
import {predictContact,safeEscape,createPedestrianWarnings} from '../src/player/pedestrian-threat.mjs';
const def={width:1.8,length:4.6},car={active:true,x:0,y:0,z:0,heading:0,course:0,speed:8,yawRate:0};
const person={id:1,active:true,x:0,z:8,heading:0,speed:0,height:0};
const crowd=()=>({time:1,grid:new Map([['0,4',[{...person}]]]),network:{ctx:{safe:()=>true}},vehicleOverlap:()=>false,blocked:()=>false,scatter(){return true;}});
test('prediction distinguishes approaching, departing and reversing vehicles',()=>{
 assert.ok(predictContact(person,car,def)<1);assert.equal(predictContact({...person,z:-8},car,def),null);
 assert.ok(predictContact({...person,z:-8},{...car,speed:-8},def)<1);
 assert.equal(predictContact({...person,x:8},car,def),null);
});
test('prediction includes turning and pedestrian motion',()=>{
 assert.notEqual(predictContact({x:4,z:7,speed:0},{...car,yawRate:.8},def),null);
 assert.equal(predictContact({x:4,z:7,speed:0},car,def),null);
 assert.notEqual(predictContact({x:3,z:8,heading:-Math.PI/2,speed:3},car,def),null);
});
test('escape rejects unsafe paths and blocked destinations',()=>{
 const c=crowd();assert.ok(safeEscape(person,car,def,c));c.network.ctx.safe=()=>false;assert.equal(safeEscape(person,car,def,c),null);
 c.network.ctx.safe=()=>true;c.blocked=()=>true;assert.equal(safeEscape(person,car,def,c),null);
});
test('warnings throttle work and do not redirect crossing choreography',()=>{
 const c=crowd(),p=c.grid.get('0,4')[0],warn=createPedestrianWarnings();let calls=0;c.scatter=()=>{calls++;return true;};
 warn(c,car,def);assert.equal(p.trafficReaction,'escape');assert.equal(calls,1);warn(c,car,def);assert.equal(calls,1);
 c.time+=.2;warn(c,car,def);assert.equal(calls,1);
 c.time+=1;p.choreographed=true;warn(c,car,def);assert.notEqual(p.trafficReaction,'escape');assert.equal(calls,1);
});
