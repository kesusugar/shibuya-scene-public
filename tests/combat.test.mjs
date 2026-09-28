import test from 'node:test';
import {responseOf,RESPONSE} from '../src/life/temperament.mjs';
import assert from 'node:assert/strict';
import {createMeleeCombat,COMBAT,PHASE} from '../src/player/combat.mjs';
import {ATTACKS,attackOf,activeWindow} from '../src/player/attack-timing.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';

/** The parts of the crowd simulation combat actually touches. */
// RUN 11.2: only some people fight back now -- by temperament, deterministic by id. The tests
// of the retaliation MECHANICS use someone who would; see the temperament tests below for the
// people who would not.
const FIGHTER=Array.from({length:4000},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.FIGHT);
const FLEER=Array.from({length:4000},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.FLEE);
const BACKER=Array.from({length:4000},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.BACK_OFF);

function crowd(people=[]){
 const log={left:[],struck:[],said:[]};
 const c={
  time:0,log,
  network:{ctx:{safe:()=>true,height:()=>0}},
  grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){log.left.push(p.id);p.crossing=null;p.queueKey=null;},
  strike(p,dx,dz,speed){log.struck.push({id:p.id,dx,dz,speed});c.leave(p);p.struck=0;return true;},
  say(p,kind,urgency){log.said.push({id:p.id,kind,urgency});return true;},
  vehicleOverlap:()=>false,blocked:()=>false
 };
 for(const p of people)c.insert(p);
 return c;
}
const npc=(id,x,z,extra={})=>({id,active:true,controlled:false,choreographed:false,
 archetype:'adult',state:'walking',x,z,renderX:x,renderZ:z,heading:0,speed:1.2,
 crossing:null,queueKey:null,combatHealth:100,combatTarget:null,combatUntil:0,
 combatNext:0,combatAction:0,combatDead:false,...extra});
/** A player facing +z at the origin. */
const player=()=>{
 const state={x:0,z:0,heading:0,bodyHeading:0,alive:true,health:100,attackTime:0,hurtTime:0};
 return {state,startAttack(sec){state.attackTime=Math.max(state.attackTime,sec);return true;},
  hurt(amount){if(!state.alive||state.hurtTime>0)return false;
   state.health=Math.max(0,state.health-amount);state.hurtTime=.34;
   if(state.health<=0)state.alive=false;return true;}};
};
/** Run the fight forward, advancing the crowd clock as the simulation does. */
function run(melee,c,p,seconds,dt=1/60){
 for(let t=0;t<seconds;t+=dt){c.time+=dt;melee.update(dt,c,p);}
}

test('the measured timings are a real window inside each clip',()=>{
 assert.ok(ATTACKS.length>=2,'a one-two needs two clips');
 for(const a of ATTACKS){
  assert.ok(a.windup>0,`${a.name} lands on frame zero`);
  assert.ok(a.activeEnd>a.windup,`${a.name} has no active window`);
  assert.ok(a.duration>a.activeEnd,`${a.name} has no recovery`);
  assert.ok(a.peak>=a.windup&&a.peak<=a.activeEnd,
   `${a.name}: the fist peaks at ${a.peak}s, outside its own active window`);
  const w=activeWindow(a);
  assert.ok(w.from>0.1&&w.to<0.95,`${a.name}: active window ${w.from}-${w.to} spans the clip`);
 }
 // The two clips must use different hands, or a one-two is the same arm twice.
 assert.notEqual(ATTACKS[0].hand,ATTACKS[1].hand);
});

test('DAMAGE DOES NOT HAPPEN ON THE INPUT TICK',()=>{
 // The bug this run exists for: `request()` used to subtract health in the same update.
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 melee.update(1/60,c,p);
 assert.equal(target.combatHealth,100,'health changed on the tick the button was pressed');
 assert.equal(melee.phase,PHASE.WINDUP,`expected WINDUP, got ${melee.phase}`);
 assert.equal(melee.snapshot().hits,0);
});

test('nothing is damaged during the wind-up',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 // Stop one frame short of the active window.
 run(melee,c,p,timing.windup-1/60);
 assert.equal(melee.phase,PHASE.WINDUP);
 assert.equal(target.combatHealth,100,`health fell during wind-up`);
});

test('damage lands inside the active window',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.activeEnd);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  `expected ${100-COMBAT.playerDamage} health, got ${target.combatHealth}`);
 assert.equal(melee.snapshot().hits,1);
});

test('one swing damages at most once, however long the window is',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,3);                                  // well past the whole clip
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'a single swing applied damage more than once');
 assert.equal(melee.snapshot().hits,1);
});

test('a press during recovery does not start a second swing',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 const timing=attackOf(ATTACKS[0].name);
 run(melee,c,p,timing.activeEnd+1/60);
 assert.equal(melee.phase,PHASE.RECOVERY);
 const swingId=melee.swing.id;
 melee.request();
 melee.update(1/60,c,p);
 assert.equal(melee.swing.id,swingId,'a new swing started during recovery');
 assert.equal(melee.snapshot().swings,1);
});

test('a punch at nobody misses',()=>{
 const c=crowd([]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 const s=melee.snapshot();
 assert.equal(s.hits,0);
 assert.equal(s.misses,1,'an air punch was not recorded as a miss');
 assert.equal(melee.phase,PHASE.IDLE);
});

test('someone out of range misses',()=>{
 const target=npc(1,0,COMBAT.range+1.5);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100);
 assert.equal(melee.snapshot().misses,1);
});

test('someone behind the player misses',()=>{
 // Directly behind, well inside range. A punch is an arc, not a radius.
 const target=npc(1,0,-1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100,'a punch connected with somebody behind the player');
 assert.equal(melee.snapshot().misses,1);
});

test('a target who walks away during the wind-up is missed',()=>{
 // This is the case the old code could not express at all: in range at the press, gone by
 // the time the fist arrives.
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.windup*.5);
 assert.equal(target.combatHealth,100,'hit before the fist was out');
 // They leave while the arm is still coming back.
 const bucket=c.grid.get(c.cell(target.x,target.z));
 bucket.splice(bucket.indexOf(target),1);
 target.z=COMBAT.range+4;c.insert(target);
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100,'a target who walked away was still hit');
 assert.equal(melee.snapshot().misses,1);
});

test('a target who walks IN during the wind-up is hit',()=>{
 const target=npc(1,0,COMBAT.range+4);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.windup*.5);
 const bucket=c.grid.get(c.cell(target.x,target.z));
 bucket.splice(bucket.indexOf(target),1);
 target.z=1.0;c.insert(target);
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'somebody who stepped into a swing was not hit');
});

test('swings alternate between the two clips',()=>{
 const c=crowd([]),p=player(),melee=createMeleeCombat();
 const seen=[];
 for(let k=0;k<4;k++){
  melee.request();
  melee.update(1/60,c,p);
  seen.push(melee.swing.name);
  run(melee,c,p,1.5);                               // let it finish
 }
 assert.deepEqual(seen,[ATTACKS[0].name,ATTACKS[1].name,ATTACKS[0].name,ATTACKS[1].name],
  `the same arm was thrown every time: ${seen.join(',')}`);
});

test('a fatal hit goes through the simulation, not around it',()=>{
 const target=npc(1,0,1.0,{combatHealth:COMBAT.playerDamage});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatDead,true);
 assert.equal(c.log.struck.length,1,'a kill did not go through crowd.strike');
 assert.equal(c.log.struck[0].id,target.id);
 // Thrown away from the player, not in an arbitrary direction.
 assert.ok(c.log.struck[0].dz>0,'the body was not thrown away from the punch');
 assert.notEqual(target.struck,undefined,'the simulation was not told the body is down');
});

test('a pedestrian on a crossing CAN be hit',()=>{
 // Excluding them made the middle of a scramble crossing a place where combat did nothing.
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k'});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'a pedestrian on a crossing could not be punched');
});

test('a light hit does not take a pedestrian off their crossing',()=>{
 // The signal group is the thing that must survive. A pedestrian stopped mid-crossing holds
 // their group, and the controller stops the clock for the whole map while any group is held.
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k'});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.crossing,'scramble','a survivable punch cleared a crossing');
 assert.equal(target.queueKey,'k','a survivable punch cleared a queue key');
 assert.equal(c.log.left.length,0,'leave() was called for a hit nobody went down from');
 assert.notEqual(target.state,'fighting','a crossing pedestrian was stopped to fight');
});

test('a fatal hit on a crossing DOES use the formal leave path',()=>{
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k',combatHealth:COMBAT.playerDamage});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(c.log.struck.length,1);
 assert.equal(target.crossing,null,'a downed body kept its crossing');
 assert.ok(c.log.left.includes(target.id),'the signal group was never released');
});

test('a witness event is reported once per swing, with a bounded radius',()=>{
 const target=npc(1,0,1.0);
 const events=[];
 const c=crowd([target]),p=player();
 const melee=createMeleeCombat({onWitness:e=>{events.push(e);return 7;}});
 melee.request();
 run(melee,c,p,2);
 assert.equal(events.length,1,`expected one witness event, got ${events.length}`);
 assert.ok(events[0].radius>0&&events[0].radius<=25,
  `a punch was broadcast ${events[0].radius} m`);
 assert.equal(events[0].victim,target.id);
 assert.equal(melee.snapshot().witnesses,7);
});

test('even a miss is witnessed, but more weakly',()=>{
 const hit=[],miss=[];
 {const target=npc(1,0,1.0),c=crowd([target]),p=player();
  const m=createMeleeCombat({onWitness:e=>{hit.push(e);return 0;}});
  m.request();run(m,c,p,2);}
 {const c=crowd([]),p=player();
  const m=createMeleeCombat({onWitness:e=>{miss.push(e);return 0;}});
  m.request();run(m,c,p,2);}
 assert.equal(hit.length,1);assert.equal(miss.length,1);
 assert.ok(miss[0].severity<hit[0].severity,
  'throwing a punch at nothing alarmed the street as much as connecting');
});

test('the NPC swings on the same model the player does',()=>{
 // A player who must respect a hit window while the crowd lands instantly is not fighting.
 const attacker=npc(FIGHTER,0,1.0);
 const c=crowd([attacker]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);                                   // provoke them
 assert.equal(attacker.combatTarget,'player');
 const before=p.state.health;
 // One frame after they decide to swing, nothing has landed yet.
 c.time+=COMBAT.npcWindup;melee.update(1/60,c,p);
 assert.equal(p.state.health,before,'an NPC punch landed on the frame it started');
 run(melee,c,p,3);
 assert.ok(p.state.health<before,'the NPC never actually landed a punch');
});

test('a dead player cannot swing',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 p.state.alive=false;
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100);
 assert.equal(melee.snapshot().swings,0);
});

test('nothing produces NaN or a stuck phase',()=>{
 const people=[];
 for(let i=0;i<20;i++)people.push(npc(i,Math.cos(i)*1.2,Math.sin(i)*1.2,
  {crossing:i%3?null:'scramble'}));
 const c=crowd(people),p=player(),melee=createMeleeCombat({onWitness:()=>3});
 for(let k=0;k<40;k++){melee.request();run(melee,c,p,.7);}
 run(melee,c,p,4);
 for(const q of people){
  for(const key of ['x','z','combatHealth','combatAction'])
   assert.ok(Number.isFinite(q[key]),`pedestrian ${q.id} has a non-finite ${key}`);
 }
 assert.ok(Number.isFinite(p.state.health));
 assert.equal(melee.phase,PHASE.IDLE,`combat ended stuck in ${melee.phase}`);
});

// RUN 8, STEP 15. The minimum death loop, against the REAL controller rather than the stub the
// rest of this file uses -- the stub's `hurt` is a copy of the controller's, so testing the copy
// would prove nothing about the game. What has to hold is that a fight can end the player, that
// it says the fight ended it, that a corpse cannot keep punching, and that restarting is whole.
test('an NPC fight can kill the player, and restarting puts them back',()=>{
 const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
 const p=createPlayer(flat);
 p.place(0,0,0);
 assert.equal(p.state.alive,true);

 // Punches land through the same 0.34 s hurt lock the crowd has to wait out, so the player
 // cannot be deleted by one frame of overlap.
 let punches=0;
 for(let i=0;i<200&&p.state.alive;i++){
  if(p.hurt(COMBAT.npcDamage,'fight'))punches++;
  p.state.hurtTime=0;                       // the lock expiring, without simulating 0.34 s
 }
 assert.equal(p.state.alive,false,'the player survived an unlimited beating');
 assert.equal(p.state.health,0);
 assert.equal(p.state.hitBy,'fight','death blamed the wrong thing');
 assert.ok(punches>=Math.ceil(100/COMBAT.npcDamage),
  `died in ${punches} punches, which is fewer than ${COMBAT.npcDamage} damage each allows`);

 // A dead player is inert: no further damage, no attack.
 assert.equal(p.hurt(COMBAT.npcDamage,'fight'),false,'a corpse took damage');
 assert.equal(p.startAttack(.5),false,'a corpse threw a punch');
 const melee=createMeleeCombat();
 const target=npc(1,0,1.0),c=crowd([target]);
 melee.request();run(melee,c,p,1.2);
 assert.equal(target.combatHealth,100,'a dead player landed a punch');

 // Restart. `revive` is what the on-screen やり直す button calls.
 assert.equal(p.revive(),true);
 assert.equal(p.state.alive,true);
 assert.equal(p.state.health,100);
 assert.equal(p.state.hitBy,null);
 assert.equal(p.state.hurtTime,0);
 assert.equal(p.state.attackTime,0);
 assert.equal(p.state.speed,0);

 // Restarting also returns the player to the start point rather than reviving them where
 // they fell, which is why the fight below has to re-place them next to the target.
 assert.deepEqual([Math.round(p.state.x),Math.round(p.state.z)],
  [Math.round(PLAYER.start[0]),Math.round(PLAYER.start[1])]);

 // And the revived player fights again: the point of restarting.
 p.place(0,0,0);
 const melee2=createMeleeCombat();
 melee2.request();run(melee2,c,p,1.2);
 assert.ok(target.combatHealth<100,'the revived player could not punch');
});

// The other half of the crossing rule, and the part that makes it read as a fight rather than
// as impunity: a pedestrian punched mid-crossing is not stopped, but they do not forgive it
// either. `combatUntil` is set when they are hit, and the moment they are off the crossing --
// still inside the 14 s window -- the retaliation loop picks them up.
test('a pedestrian punched on a crossing fights back once they are off it',()=>{
 const target=npc(FIGHTER,0,1.0,{crossing:{id:'north'},queueKey:'north'});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();run(melee,c,p,1.2);

 assert.ok(target.combatHealth<100,'the crossing pedestrian was not hit at all');
 assert.deepEqual(target.crossing,{id:'north'},'they were pulled off the crossing');
 assert.equal(target.state,'walking','they were stopped to fight mid-crossing');
 assert.equal(target.combatTarget,'player','being hit did not make them hostile');
 assert.ok(target.combatUntil>c.time,'the hostility window was never opened');
 assert.equal(c.log.left.includes(target.id),false,'the signal group was released for a non-fatal hit');

 // They reach the far kerb. Nothing else changes.
 target.crossing=null;target.queueKey=null;
 run(melee,c,p,.5);
 assert.equal(target.state,'fighting','they walked off the crossing and forgot about it');
 assert.equal(target.speed,0);

 // And they swing, on the same phased model the player uses.
 const before=p.state.health;
 run(melee,c,p,3);
 assert.ok(p.state.health<before,'the retaliating pedestrian never landed a punch');
});

// The bug the live scene found and every test here missed: `eligible` excluded
// `p.choreographed`, and the choreographed Scramble cast is 74-85% of the population. Six
// punches at a crowd 8 cm away all missed, because every body within reach was cast. Every
// test in this file builds its NPCs with `choreographed` falsy, so none of them could see it.
//
// Being hit is safe for a cast member: `simulation.step` tests `struck` BEFORE it hands a
// choreographed pedestrian to `choreography.move`, so a falling body is carried by the
// knock-down path, not by its track. A car has always been able to do this through `strike`.
const cast=(id,x,z,extra={})=>npc(id,x,z,{choreographed:true,mode:'scramble',state:'crossing',
 track:{distance:1,length:20,forward:true},...extra});

test('the choreographed Scramble cast CAN be punched',()=>{
 const target=cast(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();run(melee,c,p,1.2);
 assert.equal(melee.snapshot().hits,1,'the punch missed a cast member standing 1 m in front');
 assert.equal(target.combatHealth,100-COMBAT.playerDamage);
});

test('a cast member is not taken off their track to fight',()=>{
 const target=cast(FIGHTER,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();run(melee,c,p,1.2);
 // `choreography.move` owns state and speed every tick; stopping them here would have the
 // two writing over each other, and would hold their signal group besides.
 assert.equal(target.state,'crossing','the cast member was stopped where they stood');
 assert.equal(c.log.left.includes(target.id),false,'a survivable hit released the signal group');
 assert.ok(target.track,'the track was discarded');
 // ...but they remember it.
 assert.equal(target.combatTarget,'player');
 assert.ok(target.combatUntil>c.time);
 // And they never start walking at the player while they are still cast.
 const x=target.x,z=target.z;
 run(melee,c,p,2);
 assert.equal(target.x,x,'the retaliation loop dragged a cast member off their track');
 assert.equal(target.z,z);
});

test('a fatal hit on a cast member goes through strike, not around it',()=>{
 const target=cast(1,0,1.0,{combatHealth:COMBAT.playerDamage});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();run(melee,c,p,1.2);
 assert.equal(target.combatDead,true,'the cast member survived a fatal punch');
 assert.equal(c.log.struck.length,1,'the body was knocked down outside the simulation');
 assert.equal(c.log.struck[0].id,target.id);
 // `strike` calls `leave` itself, which is what releases the signal group.
 assert.ok(c.log.left.includes(target.id),'a fatal hit did not release the group');
});

test('a cast member fights back once they are no longer cast',()=>{
 const target=cast(FIGHTER,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();run(melee,c,p,1.2);
 assert.ok(target.combatHealth<100);
 // They finish the crossing and are recycled onto a sidewalk route.
 target.choreographed=false;target.crossing=null;target.track=null;
 run(melee,c,p,.5);
 assert.equal(target.state,'fighting','leaving the cast did not release them to fight');
 const before=p.state.health;
 run(melee,c,p,3);
 assert.ok(p.state.health<before,'the ex-cast pedestrian never landed a punch');
});

// Player crowd contact, Step E: whoever is punched hits back, whatever their temperament. This
// test used to require the FLEER and BACKER temperaments to run or step away instead; the user
// changed the rule on 2026-09-24. Temperament still decides what WITNESSES do (hq-awareness).
test('owner\'s rule: only the few who fight hit back; the rest run (the fleeing ones screaming)',()=>{
 for(const [id,fights] of [[FIGHTER,true],[FLEER,false],[BACKER,false]]){
  const target=npc(id,0,1.0);
  const c=crowd([target]);const fled=[];c.flee=(q,dx,dz,o)=>{fled.push({id:q.id,dx,dz,...o});return true;};c.pool=[target];
  const p=player(),melee=createMeleeCombat();
  melee.request();run(melee,c,p,1.2);
  if(fights){assert.equal(target.combatTarget,'player');assert.equal(fled.length,0);
   const before=p.state.health;run(melee,c,p,3);assert.ok(p.state.health<before,'the fighter never swung back');}
  else{assert.notEqual(target.combatTarget,'player',`id ${id} (${responseOf(id)}) squared up`);
   assert.equal(fled.length,1,'sent away');assert.ok(fled[0].dz>0,'away from the player');
   if(responseOf(id)===RESPONSE.FLEE)assert.ok(c.log.said.some(e=>e.id===id&&e.kind==='scream'),'a runner screams');}
 }
});

test('owner\'s rule: about 3% of adults fight, never a child or an elderly person',()=>{
 const ids=Array.from({length:20000},(_,i)=>i),n=ids.filter(id=>responseOf(id)===RESPONSE.FIGHT).length/ids.length;
 assert.ok(n>.024&&n<.036,`${(n*100).toFixed(1)}% fight`);
 assert.ok(ids.every(id=>responseOf(id,{archetype:'kid'})!==RESPONSE.FIGHT&&responseOf(id,{archetype:'elderly'})!==RESPONSE.FIGHT));
});

test('owner\'s rule: one at a time -- a second fighter backs off while the first is squaring up',()=>{
 const other=Array.from({length:4000},(_,i)=>i).filter(i=>responseOf(i)===RESPONSE.FIGHT)[1];
 const a=npc(FIGHTER,0,1.0),b=npc(other,.3,1.0);
 const c=crowd([a,b]);c.pool=[a,b];c.flee=()=>true;
 const p=player(),melee=createMeleeCombat();
 assert.ok(melee.provoke(c,a,p),'the first fights');
 assert.equal(melee.provoke(c,b,p),false,'the second waits');
 assert.notEqual(b.combatTarget,'player');
});

test('owner\'s rule: a weapon out breaks every fist fight -- they scream and run; the katana starts none',()=>{
 let held='fists';
 const a=npc(FIGHTER,0,1.0,{combatTarget:'player',combatUntil:1e9});
 const c=crowd([a]);c.pool=[a];const fled=[];c.flee=(q)=>{fled.push(q.id);return true;};
 const p=player(),melee=createMeleeCombat({weapon:()=>held});
 run(melee,c,p,.2);assert.equal(a.combatTarget,'player','still fighting bare-handed');
 held='pistol';run(melee,c,p,.1);
 assert.notEqual(a.combatTarget,'player');assert.deepEqual(fled,[a.id]);
 assert.ok(c.log.said.some(e=>e.id===a.id&&e.kind==='scream'));
 // Armed, a bump into a fighter starts nothing.
 const b=npc(FIGHTER,0,1.0);const c2=crowd([b]);c2.pool=[b];
 assert.equal(createMeleeCombat({weapon:()=>'katana'}).provoke(c2,b,player()),false);
});

test('a blow shows on the victim as a hit, with the hold of that blow, and never as a punch',()=>{
 const target=npc(BACKER,0,1.0);const c=crowd([target]),p=player();
 const blows=[];const melee=createMeleeCombat({onBlow:e=>blows.push(e)});
 melee.request();run(melee,c,p,.5);
 assert.equal(blows.length,1);
 assert.ok(target.hurtUntil>0&&target.hurtDuration>0);
 assert.ok(!(target.combatAction>0),'the victim was given a punch to play on being hit');
 assert.equal(blows[0].blow.strength,'light');
 // the second swing is the cross: a stronger blow
 run(melee,c,p,1.5);melee.request();run(melee,c,p,1.2);
 assert.equal(blows.at(-1).blow.strength,'strong');
 assert.ok(blows.at(-1).blow.hold>blows[0].blow.hold);
});

test('events are announced for audio and camera: swing, hit, pain',()=>{
 const target=npc(BACKER,0,1.0);const c=crowd([target]),p=player();
 const kinds=[];const melee=createMeleeCombat({onEvent:k=>kinds.push(k)});
 melee.request();run(melee,c,p,1.2);
 for(const k of ['punch_swing','punch_hit','pain_voice'])assert.ok(kinds.includes(k),`no ${k}`);
});

test('a stagger covers the same ground at 7 fps as at 60 fps (seconds, exact integral)',async()=>{
 const {staggerStep}=await import('../src/player/combat.mjs');
 for(const hold of [.34,.55]){
  const run=dt=>{let left=hold,d=0;while(left>0){d+=staggerStep(left,hold,dt);left=Math.max(0,left-dt);}return d;};
  const want=hold/2;                       // per m/s of push: a cross at 1.7 m/s is 0.47 m
  for(const fps of [7,15,30,60,144])
   assert.ok(Math.abs(run(1/fps)-want)<1e-9,`${fps} fps: ${run(1/fps)} vs ${want}`);
 }
});
