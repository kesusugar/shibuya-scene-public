// PLAN-POLICE-AND-OWN-CAR W2: patrol cars chase, traffic gives way, officers, the arrest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPoliceUnits,routeLanes,UNITS} from '../src/police/units.mjs';
import {appearanceOf,deduplicate,OFFICER_BASE,UNIFORM} from '../src/life/appearance.mjs';
import {COMBAT} from '../src/player/combat.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});sim.refill(true);return sim;
}
/** A crowd with just what the units touch. */
function crowd(people){
 const grid=new Map(),cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
 const c={time:0,pool:people,grid,cell,insert(p){const k=cell(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);},
  despawn(p){p.active=false;},network:{ctx:{safe:()=>true}}};
 people.forEach(p=>c.insert(p));return c;
}
const person=(id,x,z)=>({id,active:true,x,z,archetype:'office',heading:0,speed:1});

test('a patrol car route follows the lane graph',()=>{
 const sim=traffic(),g=sim.graph;
 const from=g.lanes.find(l=>l.allowed.includes('police')&&l.next.length).id;
 const to=g.transitions[g.lanes[from].next[0]].to;
 const r=routeLanes(g,from,to);
 assert.deepEqual(r,[{lane:from},{transition:g.lanes[from].next[0]},{lane:to}]);
 sim.dispose();
});

test('patrol cars never appear in view or nearer than 80 m, and follow the caps per star',()=>{
 const sim=traffic(),units=createPoliceUnits();
 const me={x:0,z:20},visible=(x,z)=>x>me.x;          // everything east of the player is "on screen"
 for(let star=1;star<=5;star++){
  for(let i=0;i<60*30;i++){
   const before=new Set(units.cars);
   units.update(1/30,{stars:star,traffic:sim,me,visible,driving:true});
   for(const v of units.cars)if(!before.has(v)){
    assert.ok(!visible(v.x,v.z),`spawned in view at ${v.x.toFixed(1)},${v.z.toFixed(1)}`);
    assert.ok(Math.hypot(v.x-me.x,v.z-me.z)>=UNITS.spawnNear-1e-6,'spawned too close');
   }
   assert.ok(units.cars.size<=UNITS.cars[star],`☆${star}: ${units.cars.size} cars`);
  }
  assert.equal(units.cars.size,UNITS.cars[star],`☆${star} never reached its cap`);
 }
 sim.dispose();
});

test('a chasing car closes on the player and stops short; units leave only out of sight',()=>{
 const sim=traffic(),units=createPoliceUnits();
 const me={x:0,z:20};let seeAll=true;
 // In a car: the chase (on foot a car stops at 25 m and its crew gets out: tested below).
 for(let i=0;i<5*30;i++)units.update(1/30,{stars:1,traffic:sim,me,visible:()=>false,driving:true});
 const car=[...units.cars][0];assert.ok(car);
 const d0=Math.hypot(car.x-me.x,car.z-me.z);
 for(let i=0;i<40*30;i++)units.update(1/30,{stars:1,traffic:sim,me,visible:()=>false,driving:true});
 const d1=Math.hypot(car.x-me.x,car.z-me.z);
 assert.ok(d1<d0-20,`did not close in: ${d0.toFixed(0)} -> ${d1.toFixed(0)} m`);
 assert.ok(d1>=UNITS.stopShort-.01,'drove into the player');
 // Escaped while the car is in view: it may not vanish.
 for(let i=0;i<10*30;i++)units.update(1/30,{stars:0,traffic:sim,me:{x:500,z:500},visible:()=>seeAll});
 assert.ok(car.active,'a patrol car vanished in view');
 seeAll=false;
 for(let i=0;i<10*30;i++)units.update(1/30,{stars:0,traffic:sim,me:{x:500,z:500},visible:()=>seeAll});
 assert.equal(units.cars.size,0);assert.equal(car.active,false,'the slot was not freed');
 sim.dispose();
});

test('traffic ahead of a siren slows down and gives way',()=>{
 const units=createPoliceUnits();
 const siren={id:0,active:true,type:'police',siren:true,controlled:true,x:0,z:0,heading:0,speed:12};
 const ahead={id:1,active:true,type:'sedan',x:0,z:20,heading:0,speed:10};
 const beside={id:2,active:true,type:'sedan',x:20,z:0,heading:0,speed:10};
 const oncoming={id:3,active:true,type:'sedan',x:0,z:30,heading:Math.PI,speed:10};
 const sim={pool:[siren,ahead,beside,oncoming],graph:null,despawn(){}};
 for(let i=0;i<30;i++)units.update(1/30,{stars:1,traffic:sim,me:{x:500,z:0}});
 assert.ok(ahead.speed<5&&ahead.brake,'the car ahead did not slow');
 assert.equal(beside.speed,10);assert.equal(oncoming.speed,10);
});

test('officers are pedestrians re-drawn in uniform, out of view, and go back to being people',()=>{
 const people=[];for(let i=0;i<40;i++)people.push(person(i,60+i,0));
 const c=crowd(people),units=createPoliceUnits({koban:{x:500,z:500}});
 const me={x:0,z:0};
 for(let i=0;i<30*30;i++){c.time+=1/30;units.update(1/30,{stars:2,crowd:c,me,visible:(x)=>x<50});}
 const officers=people.filter(p=>p.officer);
 assert.equal(officers.length,UNITS.officers[2]);
 for(const p of officers){
  assert.equal(p.appearanceId,OFFICER_BASE+p.id);
  const look=appearanceOf(p.appearanceId);
  assert.equal(look.top,UNIFORM.top);assert.equal(look.bottom,UNIFORM.bottom);assert.equal(look.topPattern,0);
  assert.equal(look.archetype.id,appearanceOf(p.id).archetype.id,'an officer keeps the body they had');
  assert.ok(Math.hypot(p.x-me.x,p.z-me.z)<60,'the officers did not come for the player');
 }
 // The level clears: once out of sight and far, they are ordinary people again.
 for(let i=0;i<60*30;i++){c.time+=1/30;units.update(1/30,{stars:0,crowd:c,me:{x:-900,z:0},visible:()=>false});}
 assert.equal(people.filter(p=>p.officer).length,0);
 assert.equal(people.filter(p=>p.appearanceId!==undefined).length,0);
});

test('uniforms are pure by id and deduplicate never recolours them',()=>{
 const a=appearanceOf(OFFICER_BASE+5),b=appearanceOf(OFFICER_BASE+5);assert.deepEqual(a,b);
 const same=[OFFICER_BASE+1,OFFICER_BASE+1+4*8,OFFICER_BASE+1+4*16].map(id=>appearanceOf(id));
 const out=deduplicate(same);
 for(const l of same)assert.equal(out.get(l.id).top,UNIFORM.top);
 assert.ok(COMBAT.officerDamage===15,'the baton does 15');
});

test('owner\'s plan: no arrest by an officer\'s hands, nor by a patrol car pinning the player\'s car',()=>{
 const cop={...person(1,0.8,0),officer:true};
 const c=crowd([cop]),units=createPoliceUnits();units.officers.add(cop);
 let r=null;
 for(let t=0;t<6;t+=1/30)r=r??units.update(1/30,{stars:1,crowd:c,me:{x:0,z:0},attacking:false}).result;
 assert.equal(r,null,'arrested by hands');
 const u2=createPoliceUnits();
 const pin={id:0,active:true,type:'police',x:0,z:4,heading:Math.PI,speed:0,pursuit:{route:[],step:0,progress:0,reroute:9,leaving:false}};
 u2.cars.add(pin);
 const sim={pool:[pin],graph:null,despawn(){}};
 for(let t=0;t<8;t+=1/30)r=r??u2.update(1/30,{stars:2,traffic:sim,me:{x:0,z:0},driving:true,carSpeed:0}).result;
 assert.equal(r,null,'arrested pinned in a car');
});

test('owner\'s plan: a patrol car reaching a player on foot stops, its crew gets out beside it, and the car is left to be taken',()=>{
 const sim=traffic(),units=createPoliceUnits();
 const people=[];for(let i=0;i<40;i++)people.push(person(i,200+i,200));
 const c=crowd(people);
 const me={x:0,z:20};
 for(let i=0;i<5*30;i++)units.update(1/30,{stars:1,traffic:sim,crowd:c,me,visible:()=>false,driving:true});
 const car=[...units.cars][0];assert.ok(car,'a patrol car');
 // The player gets out; the car comes on and stops within reach, then the crew gets out.
 let t=0;for(;t<60&&units.cars.has(car);t+=1/30)units.update(1/30,{stars:1,traffic:sim,crowd:c,me,visible:()=>false,driving:false});
 assert.ok(!units.cars.has(car),'the crew never got out');
 const d=Math.hypot(car.x-me.x,car.z-me.z);
 assert.ok(d<=UNITS.dismountAt+.5,`stopped ${d.toFixed(1)} m away`);
 assert.ok(car.parked&&!car.controlled&&!car.service&&!car.siren,'the car is not left free');
 for(let i=0;i<10;i++){c.time+=1/30;units.update(1/30,{stars:1,traffic:sim,crowd:c,me,visible:()=>false,driving:false});}
 const crew=[...units.officers].filter(p=>p.active&&p.officer&&Math.hypot(p.x-car.x,p.z-car.z)<4);
 assert.equal(crew.length,UNITS.crew,'the crew at the doors');
 sim.dispose();
});

test('officers close to arm\'s reach, and a player who fights back is hit with the baton',()=>{
 const cop={...person(1,6,0),officer:true};
 const c=crowd([cop]),units=createPoliceUnits();units.officers.add(cop);
 let hurt=0;
 for(let t=0;t<4;t+=1/30){c.time+=1/30;units.update(1/30,{stars:1,crowd:c,me:{x:0,z:0},attacking:true,hurt:n=>{hurt+=n;}});}
 assert.ok(Math.hypot(cop.x,cop.z)<=UNITS.closeTo+.05,'the officer stopped short');
 assert.ok(hurt>=COMBAT.officerDamage&&hurt%COMBAT.officerDamage===0,`baton damage ${hurt}`);
 assert.ok(hurt<=COMBAT.officerDamage*4,'hit far too often');
});
