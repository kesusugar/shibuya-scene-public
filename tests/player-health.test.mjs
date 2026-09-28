import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMeleeCombat,COMBAT} from '../src/player/combat.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';
import {responseOf,RESPONSE} from '../src/life/temperament.mjs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';

// Player crowd contact, Step E: 100 HP, four blows either way, and a car on foot is a quarter of
// the health rather than a death. Since the owner's rule after stage 6, only the few who fight
// (~3%, temperament `fighter`) hit back: these tests use one of them.
const FIGHTER=Array.from({length:4000},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.FIGHT);

/** The parts of the crowd simulation combat touches (as tests/combat.test.mjs). */
function crowd(people=[]){
 const log={left:[],struck:[]};
 const c={time:0,log,network:{ctx:{safe:()=>true,height:()=>0}},grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){log.left.push(p.id);p.crossing=null;p.queueKey=null;},
  strike(p){log.struck.push(p.id);c.leave(p);p.struck=0;return true;},
  say(){return true;},vehicleOverlap:()=>false,blocked:()=>false};
 for(const p of people)c.insert(p);
 return c;
}
const npc=(id,x,z,extra={})=>({id,active:true,controlled:false,choreographed:false,archetype:'adult',
 state:'walking',x,z,renderX:x,renderZ:z,heading:Math.PI,speed:1.2,crossing:null,queueKey:null,
 combatHealth:100,combatTarget:null,combatUntil:0,combatNext:0,combatAction:0,combatDead:false,...extra});
const flat={height:()=>0,solid:()=>false,safe:()=>true,onRoad:()=>false};
/** The real player on flat open ground at the origin, facing +z. */
function realPlayer(){const p=createPlayer(flat,{start:[0,0],heading:0});p.place(0,0,0);return p;}
function run(melee,c,p,seconds,dt=1/60){for(let t=0;t<seconds;t+=dt){c.time+=dt;melee.update(dt,c,p);}}
/** Throw one full punch and let it finish. */
function punch(melee,c,p){melee.request();run(melee,c,p,1.1);}

test('four player punches put a pedestrian down; three do not',()=>{
 assert.equal(COMBAT.playerDamage,25);
 // Someone who cannot swing back in time: their fists would end the test early otherwise.
 const target=npc(FIGHTER,0,1.0,{combatNext:1e9});
 const c=crowd([target]),p=realPlayer(),melee=createMeleeCombat();
 for(let i=0;i<3;i++){punch(melee,c,p);target.combatNext=1e9;}
 assert.equal(target.combatHealth,25,'three punches did not leave a quarter');
 assert.equal(target.combatDead,false,'three punches put them down');
 punch(melee,c,p);
 assert.equal(target.combatHealth,0);
 assert.equal(target.combatDead,true,'the fourth punch did not put them down');
 assert.deepEqual(c.log.struck,[target.id],'they did not go down through strike()');
});

test('four pedestrian punches end the game; three do not',()=>{
 assert.equal(COMBAT.npcDamage,25);
 const p=realPlayer();
 for(let i=0;i<3;i++){assert.equal(p.hurt(COMBAT.npcDamage,'fight'),true);p.state.hurtTime=0;}
 assert.equal(p.state.health,25);
 assert.equal(p.state.alive,true,'three blows ended the game');
 p.hurt(COMBAT.npcDamage,'fight');
 assert.equal(p.state.health,0);
 assert.equal(p.state.alive,false,'the fourth blow did not end the game');
 assert.equal(p.state.hitBy,'fight');
 // And through the fight itself: a hostile pedestrian lands exactly 25 per blow, on any id.
 for(const id of [0,1,2]){
  const q=realPlayer(),hostile=npc(id,0,1.0,{combatTarget:'player',combatUntil:1e9});
  const c=crowd([hostile]),melee=createMeleeCombat();
  run(melee,c,q,1.5);
  assert.equal(q.state.health,75,`id ${id} took the player to ${q.state.health}`);
 }
});

test('a punched off-rails fighter fights back',()=>{
 const target=npc(FIGHTER,0,1.0);
 const c=crowd([target]),p=realPlayer(),melee=createMeleeCombat();
 punch(melee,c,p);
 assert.equal(target.combatTarget,'player');
 assert.equal(target.state,'fighting');
 const before=p.state.health;
 run(melee,c,p,3);
 assert.ok(p.state.health<before,'they never swung back');
});

test('a punched cast member keeps walking their track, and fights at the kerb',()=>{
 const target=npc(FIGHTER,0,1.0,{choreographed:true,mode:'scramble',state:'crossing',crossing:{id:'scramble'},
  track:{distance:3,length:30,forward:true,finishing:false}});
 const c=crowd([target]),p=realPlayer(),melee=createMeleeCombat();
 punch(melee,c,p);
 assert.ok(target.combatHealth<100,'the punch missed');
 assert.equal(target.state,'crossing','a cast member was stopped mid-crossing');
 assert.equal(c.log.left.includes(target.id),false,'the crossing was released for a survivable blow');
 const x=target.x,z=target.z;run(melee,c,p,1);
 assert.equal(target.x,x,'dragged off the track while crossing');assert.equal(target.z,z);
 // They reach the far kerb: the choreography releases the crossing and they stand there.
 target.crossing=null;target.state='exiting';target.x=0;target.z=2.6;c.grid.clear();c.insert(target);
 const before=p.state.health;
 run(melee,c,p,4);
 assert.equal(target.state,'fighting','the cast member forgot about it at the kerb');
 assert.ok(p.state.health<before,'the cast member never swung');
 // What the fight moved them is kept, so their track brings them back.
 assert.ok(Math.hypot(target.fleeOffX??0,target.fleeOffZ??0)>.3,'the approach was not kept as a flee offset');
});

test('in the real choreography: a hostile cast member at the kerb holds, fights, and walks back after',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const ground=buildGroundModel(data),generic=buildBuildingModel(data);
 const core=buildStationModel(data,{ground,generic});
 const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const graph=buildTrafficGraph(data,{ground,generic,street,core});
 const traffic=new TrafficSimulation(graph,{tier:'high',street});
 const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true});
 for(let i=0;i<30;i++){traffic.update(1/30);sim.step(1/30);}
 // A cast member waiting at a kerb (NS green: the scramble is red) with open pavement beside.
 const ctx=network.ctx;
 // One of the few who fight (the owner's rule: only they are provoked).
 const p=sim.pool.find(q=>q.active&&q.choreographed&&!q.crossing&&q.state==='waiting'&&q.archetype!=='kid'&&responseOf(q.id,{archetype:q.archetype})===RESPONSE.FIGHT&&
  [0,1,2,3].some(k=>{const a=k*Math.PI/2;return ctx.safe(q.x+Math.sin(a)*2.2,q.z+Math.cos(a)*2.2,.35);}));
 assert.ok(p,'no cast member waiting at a kerb');
 const a=[0,1,2,3].map(k=>k*Math.PI/2).find(a=>ctx.safe(p.x+Math.sin(a)*2.2,p.z+Math.cos(a)*2.2,.35));
 const px=p.x+Math.sin(a)*2.2,pz=p.z+Math.cos(a)*2.2;
 const player=createPlayer(ctx,{start:[px,pz],heading:a+Math.PI});
 Object.assign(player.state,{x:px,z:pz,y:ctx.height(px,pz),bodyHeading:a+Math.PI});
 const melee=createMeleeCombat();
 const home={x:p.x,z:p.z};
 assert.equal(melee.provoke(sim,p,player),true);
 let began=false,moved=0;
 for(let f=0;f<60*6;f++){
  melee.update(1/60,sim,player);traffic.update(1/60);sim.update(1/60);player.state.hurtTime=1;   // keep the player standing
  if(p.crossing)began=true;
  moved=Math.max(moved,Math.hypot(p.x-home.x,p.z-home.z));
 }
 assert.equal(began,false,'a hostile cast member started a crossing');
 assert.ok(moved>.4,`they never came at the player (${moved.toFixed(2)} m)`);
 assert.equal(p.state,'fighting');
 // The fight is over (the window closes); they walk back to their slot.
 p.combatUntil=sim.time;
 for(let f=0;f<60*8;f++){traffic.update(1/60);sim.update(1/60);}
 assert.ok(Math.hypot(p.fleeOffX??0,p.fleeOffZ??0)<.05,`still ${Math.hypot(p.fleeOffX,p.fleeOffZ).toFixed(2)} m off their slot`);
 assert.ok(Math.hypot(p.x-home.x,p.z-home.z)<.1,'not back where they were standing');
});

test('a traffic car takes 25 and throws the player; four hits end the game; revive restores 100',()=>{
 assert.equal(PLAYER.carDamage,25);
 const p=realPlayer();
 const car={type:'sedan',x:0,z:-1.5,heading:0,speed:8};
 assert.equal(p.knockDown(car),true);
 assert.equal(p.state.health,75);
 assert.equal(p.state.alive,true,'one car hit killed the player');
 assert.equal(p.state.hitBy,'sedan');
 // Thrown, then control comes back after about a second.
 p.setTouch({forward:1,strafe:0,running:false});
 const start={x:p.state.x,z:p.state.z};let still=0;
 for(let f=0;f<60;f++){p.step(1/60);if(p.state.stunTime>0)still=f+1;}
 const thrown=Math.hypot(p.state.x-start.x,p.state.z-start.z);
 assert.ok(thrown>=PLAYER.thrown[0]-.05&&thrown<=PLAYER.thrown[1]+.05,`thrown ${thrown.toFixed(2)} m`);
 assert.ok(still>=50&&still<=62,`stunned for ${still} frames`);
 const after=p.state.z;for(let f=0;f<30;f++)p.step(1/60);
 assert.ok(p.state.z>after+.1,'control never came back');
 // The grace period: the same car overlapping again at once does nothing.
 assert.equal(p.knockDown(car),false,'hit twice inside the grace period');
 assert.equal(p.state.health,75);
 for(let i=0;i<3;i++){p.state.carGrace=0;p.state.stunTime=0;p.knockDown(car);}
 assert.equal(p.state.health,0);
 assert.equal(p.state.alive,false,'four car hits did not end the game');
 assert.equal(p.revive(),true);
 assert.equal(p.state.health,100);assert.equal(p.state.alive,true);
 assert.equal(p.state.stunTime,0);assert.equal(p.state.carGrace,0);
});

test('the throw goes through advance(): never into a wall',()=>{
 const wall={height:()=>0,solid:(x,z)=>z>.8,safe:()=>true,onRoad:()=>false};
 const p=createPlayer(wall,{start:[0,0],heading:0});p.place(0,0,0);
 p.knockDown({type:'sedan',x:0,z:-1.2,heading:0,speed:12});
 for(let f=0;f<60;f++)p.step(1/60);
 assert.ok(p.state.z<=.8,`thrown into the wall to z ${p.state.z.toFixed(2)}`);
});

// Found while checking the device: `simulation.move` stopped anyone with a live combatTarget where
// they stood, crossing or not. Combat never stops an on-rails victim itself, but an ordinary
// walker admitted to a crossing and still on its pavement end can be punched or provoked, and
// was then frozen for the 14 s hostility window, holding the signal group.
test('an ordinary walker admitted to a crossing is not frozen there by a fight',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const ground=buildGroundModel(data),generic=buildBuildingModel(data);
 const core=buildStationModel(data,{ground,generic});
 const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const graph=buildTrafficGraph(data,{ground,generic,street,core});
 const traffic=new TrafficSimulation(graph,{tier:'high',street});
 traffic.signals.time=88.5;
 const sim=new CrowdSimulation(network,{traffic,tier:'high'});
 let p=null;
 for(let i=0;i<30*20&&!p;i++){traffic.update(1/30);sim.step(1/30);
  p=sim.pool.find(q=>q.active&&!q.choreographed&&q.crossing&&q.progress<1.5&&q.state==='crossing')??null;}
 assert.ok(p,'nobody was admitted to a crossing');
 p.combatTarget='player';p.combatUntil=sim.time+14;
 const start=p.progress,edge=p.edge;
 for(let i=0;i<30*3;i++){traffic.update(1/30);sim.step(1/30);}
 assert.ok(p.edge!==edge||p.progress>start+1,`frozen on the crossing (progress ${start.toFixed(2)} -> ${p.progress.toFixed(2)})`);
 assert.notEqual(p.state,'fighting');
});

// Found on the device check: a van stopped on the player and took 25 every 1.5 s.
test("a stopped car does not hit, and a hit throws the player out of the car's path",()=>{
 const p=realPlayer();
 assert.equal(p.knockDown({type:'van',x:0,z:-1.5,heading:0,speed:0}),false,'a stopped van hit the player');
 assert.equal(p.knockDown({type:'van',x:0,z:-1.5,heading:0,speed:1}),false,'a van creeping at 1 m/s hit the player');
 assert.equal(p.state.health,100);
 // Hit dead centre by a car driving +z, and a little to its right (-x is the car's right).
 for(const [x0,expectSide] of [[0,null],[-.3,-1],[.3,1]]){
  const q=realPlayer();Object.assign(q.state,{x:x0});
  assert.equal(q.knockDown({type:'sedan',x:0,z:-1.5,heading:0,speed:9}),true);
  for(let f=0;f<60;f++)q.step(1/60);
  const out=Math.abs(q.state.x);
  assert.ok(out>=1-.05,`still in the car's path: ${q.state.x.toFixed(2)} m across`);
  if(expectSide)assert.equal(Math.sign(q.state.x),expectSide,'thrown across the car to the other side');
 }
});
