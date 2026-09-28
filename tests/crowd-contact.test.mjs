import {responseOf,RESPONSE} from '../src/life/temperament.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildPedestrianNetwork,inCrossing} from '../src/life/network.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
import {yieldToPlayer,YIELD} from '../src/player/crowd-interaction.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';
import {CONTACT,bodiesNear,bump} from '../src/player/crowd-contact.mjs';
import {createMeleeCombat} from '../src/player/combat.mjs';
import {createFeedbackBus} from '../src/app/feedback-bus.mjs';

// The player bumps into people instead of walking through them. Staged on the real pedestrian
// network, with the crowd's own simulation moving the people, on a clear 5 m patch of pavement.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core});
const ctx=network.ctx;
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const SPOT={x:-38,z:74};

/** A crowd with nobody in it but whoever the test puts there. */
function emptyCrowd(){
 const sim=new CrowdSimulation(network,{tier:'high'});
 for(const p of sim.pool)sim.despawn(p,'test');
 sim.setCamera(SPOT.x,SPOT.z);          // nobody is spawned within 12 m of the camera
 sim.refillClock=-1e9;                  // and nobody is refilled at all
 sim.rebuild();
 return sim;
}
/** Someone standing at x,z, the way an idle pedestrian stands. */
function person(sim,x,z,{fighter=false,slot=null,...extra}={}){
 // `fighter`: one of the few who fight (temperament, ~3%) -- the only ones a bump provokes.
 // `slot`: this pool slot (its id), rather than the first free one.
 const p=slot??sim.pool.find(q=>!q.active&&(!fighter||responseOf(q.id)===RESPONSE.FIGHT));
 Object.assign(p,{active:true,choreographed:false,controlled:false,flee:null,fleeOffX:0,fleeOffZ:0,
  x,z,renderX:x,renderZ:z,previousX:x,previousZ:z,height:ctx.height(x,z),heading:0,
  mode:'idle',state:'idle',speed:0,age:0,pause:0,crossing:null,queueKey:null,
  combatDead:false,combatTarget:null,combatHealth:100,combatUntil:0,archetype:'casual',
  lod:'near',elapsed:0,edge:-1,route:[],bumpUntil:undefined,struck:undefined,...extra});
 sim.insert(p);return p;
}
function walker(sim,{x=SPOT.x,z=SPOT.z,heading=0}={}){
 const player=createPlayer(ctx,{start:[x,z],heading,bodies:sim?()=>sim:null});
 Object.assign(player.state,{x,z,y:ctx.height(x,z),heading,bodyHeading:heading,course:heading});
 return player;
}
/** One frame of contact alone (Step A): the player, then the crowd. */
function frame(player,sim,dt=1/60){player.step(dt);sim?.update(dt);}
/** One frame as the scene runs it: the player, the crowd giving way (Step B), then the crowd. */
function sceneFrame(player,sim,dt=1/60){player.step(dt);if(sim)yieldToPlayer(sim,player.state);sim?.update(dt);}

test('the contact radii are the player\'s and a pedestrian\'s bodies',()=>{
 assert.equal(CONTACT.playerRadius,PLAYER.radius);
 assert.equal(CONTACT.gap,CONTACT.playerRadius+CONTACT.bodyRadius);
 assert.equal(CONTACT.knockDown,false);
 assert.equal(YIELD.body,CONTACT.gap);
});

test('1. walking into someone standing still: never closer than 0.55 m, and the player slides past',()=>{
 const sim=emptyCrowd();
 const other=person(sim,SPOT.x+.2,SPOT.z);
 const player=walker(sim,{z:SPOT.z-1.6,heading:0});
 player.setTouch({forward:1,strafe:0,running:false});
 let closest=Infinity;
 for(let i=0;i<180;i++){
  frame(player,sim);
  closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));
 }
 assert.ok(closest>=.55,`centres came within ${closest.toFixed(3)} m`);
 assert.ok(player.state.z>other.z+.5,`the player is stuck behind them at z ${(player.state.z-other.z).toFixed(2)} m`);
 assert.ok(player.contact.stats.bumps>=1,'nobody was bumped');
 assert.ok(player.contact.stats.trappedSeconds<.5,`shoved for ${player.contact.stats.trappedSeconds}s past one person`);
});

test('1b. head-on into someone standing still: the player goes round, not through',()=>{
 const sim=emptyCrowd();
 const other=person(sim,SPOT.x,SPOT.z);
 const player=walker(sim,{z:SPOT.z-1.6,heading:0});
 player.setTouch({forward:1,strafe:0,running:false});
 let closest=Infinity;
 for(let i=0;i<180;i++){frame(player,sim);closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));}
 assert.ok(closest>=.55,`centres came within ${closest.toFixed(3)} m`);
 assert.ok(player.state.z>other.z+.5,'never got past');
});

test('2. a full ring of people within 0.7 m does not trap the player',()=>{
 const sim=emptyCrowd();
 const ring=[];
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ring.push(person(sim,SPOT.x+Math.sin(a)*.66,SPOT.z+Math.cos(a)*.66));}
 const player=walker(sim,{heading:.2});
 player.setTouch({forward:1,strafe:0,running:false});
 let out=null,closest=Infinity;
 for(let i=0;i<180&&out===null;i++){
  frame(player,sim);
  for(const p of ring)closest=Math.min(closest,Math.hypot(player.state.x-p.x,player.state.z-p.z));
  const d=Math.hypot(player.state.x-SPOT.x,player.state.z-SPOT.z);
  if(d>.66+CONTACT.gap)out=(i+1)/60;
 }
 assert.ok(out!==null,'still inside the ring after 3 s');
 // Out by going through the gap the ring opened, not through a body.
 assert.ok(closest>=.5,`passed within ${closest.toFixed(3)} m of someone on the way out`);
 const pace=(.66+CONTACT.gap)/out;
 assert.ok(pace>=.3,`got out at ${pace.toFixed(2)} m/s`);
});

test('4. someone on another level does not block',()=>{
 const run=(lift)=>{
  const sim=emptyCrowd();
  const other=person(sim,SPOT.x,SPOT.z,{height:ctx.height(SPOT.x,SPOT.z)+lift});
  const player=walker(sim,{z:SPOT.z-1.2,heading:0});
  player.setTouch({forward:1,strafe:0,running:false});
  let closest=Infinity;
  for(let i=0;i<120;i++){frame(player,sim);closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));}
  return {closest,x:player.state.x,z:player.state.z};
 };
 const above=run(CONTACT.level+.3),below=run(-(CONTACT.level+.3)),same=run(0);
 assert.ok(above.closest<.1,`a person ${CONTACT.level+.3} m above pushed the player to ${above.closest.toFixed(2)} m`);
 assert.ok(below.closest<.1,'a person below blocked');
 assert.ok(same.closest>=.55,'the control case, on the same level, did not block');
});

test('7. with no crowd, movement is exactly what it was',()=>{
 const wall={height:()=>0,solid:(x,z)=>z>2.5||x<-1.8,safe:()=>true,onRoad:()=>false};
 const script=f=>f<50?{forward:1,strafe:0}:f<110?{forward:1,strafe:-1,running:true}:f<150?{forward:0,strafe:1}:{forward:0,strafe:0};
 const trace=player=>{const out=[];for(let f=0;f<200;f++){player.setTouch(script(f));player.step(1/60);out.push([player.state.x,player.state.z,player.state.speed,player.state.bodyHeading]);}return out;};
 const plain=createPlayer(wall,{start:[0,0],heading:0});plain.place(0,0,0);
 const hooked=createPlayer(wall,{start:[0,0],heading:0,bodies:()=>null});hooked.place(0,0,0);
 const nobody=emptyCrowd();
 const empty=createPlayer(wall,{start:[0,0],heading:0,bodies:()=>nobody});empty.place(0,0,0);
 const a=trace(plain),b=trace(hooked),c=trace(empty);
 assert.deepEqual(b,a,'a hook that returns no crowd changed the walk');
 assert.deepEqual(c,a,'a crowd with nobody near changed the walk');
});

test('bodiesNear reads only the 3x3 cells round the player and skips who it should',()=>{
 const sim=emptyCrowd();
 const near=person(sim,SPOT.x+.5,SPOT.z);
 person(sim,SPOT.x+.5,SPOT.z+.3,{struck:0});
 person(sim,SPOT.x-.5,SPOT.z,{combatDead:true});
 person(sim,SPOT.x,SPOT.z+.5,{controlled:true});
 person(sim,SPOT.x+7,SPOT.z);
 sim.rebuild();
 const out=[];
 bodiesNear(sim,SPOT.x,SPOT.z,ctx.height(SPOT.x,SPOT.z),1.4,out);
 assert.deepEqual(out.map(p=>p.id),[near.id]);
 const again=out;bodiesNear(sim,SPOT.x,SPOT.z,0,1.4,out);
 assert.equal(out,again,'the buffer was reallocated');
});

test('anyone close enough to touch the player is on the every-frame (near) update',()=>{
 const sim=emptyCrowd();
 const p=person(sim,SPOT.x+.6,SPOT.z,{lod:'far'});
 sim.setCamera(SPOT.x,SPOT.z);
 for(let i=0;i<40;i++)sim.step(1/30);
 assert.equal(p.lod,'near');
});

test('B. a walking player: people ahead step aside before they are touched',()=>{
 const sim=emptyCrowd();
 const ahead=person(sim,SPOT.x+.15,SPOT.z+1.4);
 const player=walker(sim,{z:SPOT.z-.6,heading:0});
 player.setTouch({forward:1,strafe:0,running:false});
 let yieldedAt=null,closest=Infinity;
 for(let i=0;i<150;i++){
  sceneFrame(player,sim);
  if(yieldedAt===null&&(ahead.flee||Math.hypot(ahead.x-SPOT.x-.15,ahead.z-SPOT.z-1.4)>.05))
   yieldedAt=Math.hypot(ahead.x-player.state.x,ahead.z-player.state.z);
  closest=Math.min(closest,Math.hypot(ahead.x-player.state.x,ahead.z-player.state.z));
 }
 assert.ok(yieldedAt!==null,'they never moved');
 assert.ok(yieldedAt>CONTACT.gap+.3,`they only moved once the player was ${yieldedAt.toFixed(2)} m away`);
 assert.equal(player.contact.stats.bumps,0,'they stepped aside and were still bumped');
 assert.ok(closest>=CONTACT.gap-.02,`came within ${closest.toFixed(2)} m`);
 // Aside, not ahead: the step is off the player's line.
 assert.ok(Math.abs(ahead.x-SPOT.x)>.3,`only ${Math.abs(ahead.x-SPOT.x).toFixed(2)} m aside`);
});

test('B. someone walking at the player gives way outside the cone; nobody moves for a standing player',()=>{
 const sim=emptyCrowd();
 // 1.2 m to the side of the line, 1.4 m ahead: outside the 0.7 m lane, facing the player.
 const toward=Math.atan2(-1.2,-1.4);
 const oncoming=person(sim,SPOT.x+1.2,SPOT.z+1.4,{heading:toward,speed:1.3});
 const player=walker(sim,{heading:0});
 player.state.speed=1.4;
 assert.equal(yieldToPlayer(sim,player.state),1);
 assert.ok(oncoming.flee?.dodge,'no dodge');
 const idle=emptyCrowd();
 const there=person(idle,SPOT.x,SPOT.z+1);
 const still=walker(idle,{heading:0});still.state.speed=.2;
 assert.equal(yieldToPlayer(idle,still.state),0);
 assert.equal(there.flee,null);
});

test('B. the oncoming side is by id, so a pair never mirror each other',()=>{
 const sides=new Set();
 for(const id of [10,11]){
  const sim=emptyCrowd();
  const p=person(sim,SPOT.x,SPOT.z+1.2,{heading:Math.PI,speed:1.3});
  const q=sim.pool.find(x=>x.id===id&&!x.active);
  // Re-seat the person on the id under test.
  if(q&&q!==p){Object.assign(q,{...p,id});p.active=false;sim.rebuild();}
  const who=q??p;
  const player=walker(sim,{heading:0});player.state.speed=1.4;
  yieldToPlayer(sim,player.state);
  sides.add(Math.sign(who.flee.x));
 }
 assert.equal(sides.size,2,'two ids stepped the same way');
});

test('3. a cast member bumped mid-crossing dodges, returns to the track, holds no signal',()=>{
 // Into the pedestrian phase, so the hero cast starts part-way across (heroStart). That start
 // puts ~1,300 people on the crossings and the controller holds its clock ~55 s while they
 // clear, player or not, so the signal check below is against the same run without a player.
 const world=()=>{const traffic=new TrafficSimulation(graph,{tier:'high',street});traffic.signals.time=90;
  const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true,heroStart:true});
  for(let i=0;i<30;i++){traffic.update(1/30);sim.step(1/30);}return {traffic,sim};};
 const {traffic,sim}=world();
 // A cast member well inside a crossing, with nobody else close ahead of them.
 const cast=sim.pool.filter(p=>p.active&&p.choreographed&&p.crossing&&p.track&&!p.flee&&
  p.track.distance>p.track.length*.15&&p.track.distance<p.track.length*.4);
 const lonely=cast.find(p=>{const ax=p.x+Math.sin(p.heading)*2.2,az=p.z+Math.cos(p.heading)*2.2;
  return !ctx.solid(ax,az,.4)&&!sim.pool.some(q=>q!==p&&q.active&&Math.hypot(q.x-ax,q.z-az)<1.2);});
 assert.ok(lonely,'no cast member mid-crossing to test with');
 const p=lonely,e=p.track.e??network.edges[p.edge];
 // The player stands in their path, facing them, and walks at them.
 const px=p.x+Math.sin(p.heading)*2.2,pz=p.z+Math.cos(p.heading)*2.2;
 const player=createPlayer(ctx,{start:[px,pz],heading:p.heading+Math.PI,bodies:()=>sim});
 Object.assign(player.state,{x:px,z:pz,y:ctx.height(px,pz),bodyHeading:p.heading+Math.PI,course:p.heading+Math.PI});
 sim.setCamera(px,pz);
 // Whoever calls leave() from the player's side of the frame would release their group.
 let inPlayer=false,leftByPlayer=0;
 const leave=sim.leave.bind(sim);sim.leave=q=>{if(inPlayer)leftByPlayer++;return leave(q);};
 player.setTouch({forward:1,strafe:0,running:false});
 let peak=0,closest=Infinity,offCrossing=0;
 const t0=traffic.signals.time;
 for(let f=0;f<60*2;f++){
  inPlayer=true;player.step(1/60);yieldToPlayer(sim,player.state);inPlayer=false;
  traffic.update(1/60);sim.update(1/60);
  peak=Math.max(peak,Math.hypot(p.fleeOffX??0,p.fleeOffZ??0));
  closest=Math.min(closest,Math.hypot(p.x-player.state.x,p.z-player.state.z));
  // The dodge must not carry them anywhere their own track position is not: off the crossing
  // into a traffic lane. (The cast's tracks are spread across the crossing's width, so the
  // track point itself is the reference, not the crossing's centre polygon.)
  const ox=p.fleeOffX??0,oz=p.fleeOffZ??0,on=(x,z)=>ctx.safe(x,z,.27)||inCrossing(x,z,e,.29);
  if(Math.hypot(ox,oz)>.01&&on(p.x-ox,p.z-oz)&&!on(p.x,p.z))offCrossing++;
 }
 player.setTouch({forward:0,strafe:0,running:false});
 let settled=null;
 for(let f=0;f<60*12;f++){
  inPlayer=true;player.step(1/60);inPlayer=false;traffic.update(1/60);sim.update(1/60);
  if(settled===null&&peak>0&&Math.hypot(p.fleeOffX??0,p.fleeOffZ??0)<.01)settled=f/60;
 }
 assert.ok(peak>.1,`the cast member never stepped aside (offset ${peak.toFixed(3)} m)`);
 assert.ok(closest>=.5,`the player went within ${closest.toFixed(2)} m of them`);
 assert.equal(offCrossing,0,'stepped off the crossing into the road');
 assert.ok(settled!==null,`still ${Math.hypot(p.fleeOffX,p.fleeOffZ).toFixed(2)} m off their track 12 s later`);
 assert.equal(leftByPlayer,0,'leave() was called from the player side');
 for(let f=0;f<30*80;f++){traffic.update(1/30);sim.step(1/30);}
 const base=world(),b0=base.traffic.signals.time;
 for(let f=0;f<60*14;f++){base.traffic.update(1/60);base.sim.update(1/60);}
 for(let f=0;f<30*80;f++){base.traffic.update(1/30);base.sim.step(1/30);}
 const advanced=traffic.signals.time-t0,baseline=base.traffic.signals.time-b0;
 assert.ok(advanced>=baseline-2,`the signals advanced ${advanced.toFixed(1)} s against ${baseline.toFixed(1)} s without the player`);
 assert.ok(advanced>40,`the signals advanced only ${advanced.toFixed(1)} s in 94 s`);
 assert.equal(sim.audit().signalViolations,0);
});

/** The scene's bump handler, minus drawing: a fight for the ones who take it badly. */
function wired(sim,{witness=()=>0}={}){
 const melee=createMeleeCombat({onWitness:witness});
 let player=null;
 const make=opts=>{player=createPlayer(ctx,{...opts,bodies:()=>sim,onBump:(p,b)=>{if(b.fight)melee.provoke(sim,p,player);}});return player;};
 return {melee,make};
}

test('5. a bump is not a blow: no damage, no witness, no combat stats',()=>{
 const sim=emptyCrowd();
 let witnessed=0;
 const {melee,make}=wired(sim,{witness:()=>{witnessed++;return 0;}});
 const other=person(sim,SPOT.x+.15,SPOT.z);
 const player=make({start:[SPOT.x,SPOT.z-1.4],heading:0});
 Object.assign(player.state,{x:SPOT.x,z:SPOT.z-1.4,y:ctx.height(SPOT.x,SPOT.z),heading:0,bodyHeading:0,course:0});
 player.setTouch({forward:1,strafe:0,running:false});
 // Up to the bump and a moment after it: short of an angry pedestrian's first wind-up.
 let f=0;for(;f<120&&!player.contact.stats.bumps;f++){player.step(1/60);melee.update(1/60,sim,player);sim.update(1/60);}
 for(let i=0;i<12;i++){player.step(1/60);melee.update(1/60,sim,player);sim.update(1/60);}
 assert.equal(player.contact.stats.bumps,1,'no bump');
 assert.equal(player.state.health,100);
 assert.equal(other.combatHealth,100);
 assert.equal(witnessed,0,'a bump was witnessed as a punch');
 const m=melee.snapshot();
 assert.equal(m.swings+m.hits+m.misses+m.witnessEvents,0,`combat counted it: ${JSON.stringify(m)}`);
 assert.ok(other.hurtUntil>0&&other.hurtStrong===false,'no light flinch');
 assert.ok(Math.hypot(other.hurtX,other.hurtZ-1)<.3,'the flinch is not away from the player');
});

test('5. over 1,000 people bumped, about 3% start a fight (the few who fight), and the rest never do',()=>{
 const sim=emptyCrowd();
 const {melee,make}=wired(sim);
 const player=make({start:[SPOT.x,SPOT.z],heading:0});
 Object.assign(player.state,{x:SPOT.x,z:SPOT.z,y:ctx.height(SPOT.x,SPOT.z),speed:1.4});
 let fights=0,calm=0,calmHostile=0,n=0;
 for(const q of sim.pool.filter(q=>!q.active).slice(0,1000)){
  const p=person(sim,SPOT.x,SPOT.z+.55,{slot:q});
  sim.time+=1;
  const b=bump(sim,p,player.state);
  assert.ok(b,'the bump did not happen');n++;
  if(b.fight){fights++;assert.equal(b.fight,responseOf(p.id)===RESPONSE.FIGHT);melee.provoke(sim,p,player);
   // One at a time: end this fight before the next person is bumped.
   p.combatTarget=null;p.combatUntil=0;}
  else{calm++;if(p.combatTarget)calmHostile++;}
  p.active=false;
 }
 assert.ok(fights/n>.012&&fights/n<.05,`${fights} of ${n} bumps started a fight`);
 assert.equal(calmHostile,0,`${calmHostile} of ${calm} calm bumps set combatTarget anyway`);
});

test('5. a bump fight is the ordinary fight: an off-rails person stands and swings, a cast member keeps walking',()=>{
 const sim=emptyCrowd();
 const {melee,make}=wired(sim);
 const player=make({start:[SPOT.x,SPOT.z],heading:0});
 Object.assign(player.state,{x:SPOT.x,z:SPOT.z,y:ctx.height(SPOT.x,SPOT.z)});
 const off=person(sim,SPOT.x,SPOT.z+.8,{fighter:true});
 assert.equal(melee.provoke(sim,off,player),true);
 assert.equal(off.state,'fighting');
 for(let i=0;i<120;i++){melee.update(1/60,sim,player);sim.time+=1/60;}
 assert.ok(player.state.health<100,'the provoked person never swung');
 // The first fight over (one at a time), a cast member who fights is provoked in turn.
 off.combatTarget=null;off.combatUntil=0;
 const cast=person(sim,SPOT.x+1,SPOT.z+.5,{fighter:true,choreographed:true,state:'crossing'});
 let left=0;const leave=sim.leave.bind(sim);sim.leave=q=>{if(q===cast)left++;return leave(q);};
 assert.equal(melee.provoke(sim,cast,player),true);
 assert.equal(cast.combatTarget,'player');
 assert.notEqual(cast.state,'fighting','a cast member was stopped to fight');
 assert.equal(left,0,'the cast member was taken off their crossing');
});

test('6. a sprint bump staggers harder than a walking one, and knocks nobody down',()=>{
 const run=(running)=>{
  const sim=emptyCrowd();
  const melee=createMeleeCombat();
  const other=person(sim,SPOT.x+.12,SPOT.z+.6);
  const player=createPlayer(ctx,{start:[SPOT.x,SPOT.z-2],heading:0,bodies:()=>sim});
  Object.assign(player.state,{x:SPOT.x,z:SPOT.z-2,y:ctx.height(SPOT.x,SPOT.z),heading:0,bodyHeading:0,course:0});
  player.setTouch({forward:1,strafe:0,running});
  let moved=0;
  const start={x:other.x,z:other.z};
  let bumpedAt=null;
  for(let f=0;f<120;f++){
   player.step(1/60);melee.update(1/60,sim,player);sim.update(1/60);
   if(bumpedAt===null&&player.contact.stats.bumps)bumpedAt={x:other.x,z:other.z,strong:other.hurtStrong,speed:player.state.speed};
   moved=Math.max(moved,Math.hypot(other.x-start.x,other.z-start.z));
  }
  return {moved,other,bumpedAt,stats:player.contact.stats};
 };
 const walk=run(false),sprint=run(true);
 assert.ok(walk.bumpedAt&&sprint.bumpedAt,'somebody was not bumped');
 assert.equal(walk.bumpedAt.strong,false);
 assert.equal(sprint.bumpedAt.strong,true);
 assert.ok(sprint.moved>walk.moved+.1,`sprint moved them ${sprint.moved.toFixed(2)} m, walking ${walk.moved.toFixed(2)} m`);
 assert.equal(sprint.other.struck,undefined,'a sprint bump knocked someone down');
 assert.equal(walk.other.struck,undefined);
});

test('C. the player loses pace on the frame of a bump, and the bus carries it',()=>{
 const sim=emptyCrowd();
 person(sim,SPOT.x,SPOT.z+.62);
 const player=createPlayer(ctx,{start:[SPOT.x,SPOT.z],heading:0,bodies:()=>sim});
 Object.assign(player.state,{x:SPOT.x,z:SPOT.z,y:ctx.height(SPOT.x,SPOT.z),heading:0,bodyHeading:0,course:0,speed:1.5});
 player.setTouch({forward:1,strafe:0,running:false});
 player.step(1/60);
 assert.equal(player.contact.stats.bumps,1);
 assert.ok(player.state.speed<=1.5*CONTACT.slow+1e-6,`still at ${player.state.speed.toFixed(2)} m/s`);
 const bus=createFeedbackBus();
 assert.equal(bus.emit('player_bump',0,{x:0,z:0,intensity:.35}),true,'the bus does not know player_bump');
});

// Found on the device check (HIGH, day, player walking into the Scramble): the minimum gap fell to
// 0.14 m. The cast walks its track without looking at the player, and a flee offset closes back
// onto the track line, so a player standing on it was walked through at 1.3 m/s while the
// player's own depenetration moved at most 0.27 m/s.
test('a cast member walking into a player who stands on their crossing goes round, not through',()=>{
 const traffic=new TrafficSimulation(graph,{tier:'high',street});
 traffic.signals.time=90;
 const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true,heroStart:true});
 for(let i=0;i<30;i++){traffic.update(1/30);sim.step(1/30);}
 const cast=sim.pool.filter(p=>p.active&&p.choreographed&&p.crossing&&p.track&&!p.flee&&
  p.track.distance>p.track.length*.15&&p.track.distance<p.track.length*.5);
 const tested=[];
 for(const p of cast){
  const ax=p.x+Math.sin(p.heading)*1.6,az=p.z+Math.cos(p.heading)*1.6;
  if(ctx.solid(ax,az,.4)||sim.pool.some(q=>q!==p&&q.active&&Math.hypot(q.x-ax,q.z-az)<.9))continue;
  tested.push({p,ax,az});if(tested.length>=3)break;
 }
 assert.ok(tested.length,'no cast member to test with');
 for(const {p,ax,az} of tested){
  const player=createPlayer(ctx,{start:[ax,az],heading:p.heading+Math.PI,bodies:()=>sim});
  Object.assign(player.state,{x:ax,z:az,y:ctx.height(ax,az),bodyHeading:p.heading+Math.PI});
  sim.postUpdate=d=>player.settleCrowd(d);   // as the scene wires it
  let closest=Infinity;
  for(let f=0;f<60*4;f++){player.step(1/60);traffic.update(1/60);sim.update(1/60);
   closest=Math.min(closest,Math.hypot(p.x-player.state.x,p.z-player.state.z));}
  assert.ok(closest>=.5,`cast member ${p.id} came within ${closest.toFixed(2)} m of a standing player`);
 }
});

test('at a low frame rate (clamped 0.1 s frames) the crowd still never ends a frame inside the player',()=>{
 const traffic=new TrafficSimulation(graph,{tier:'high',street});
 traffic.signals.time=90;
 const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true,heroStart:true});
 for(let i=0;i<30;i++){traffic.update(1/30);sim.step(1/30);}
 const cells=new Map();
 for(const p of sim.pool){if(!p.active)continue;const k=Math.floor(p.x/4)+','+Math.floor(p.z/4);cells.set(k,(cells.get(k)??0)+1);}
 let plan=null;
 for(const [k] of [...cells].sort((a,b)=>b[1]-a[1]).slice(0,30)){
  const [i,j]=k.split(',').map(Number),tx=i*4+2,tz=j*4+2;
  for(let a=0;a<32&&!plan;a++){const h=a/32*Math.PI*2,sx=tx-Math.sin(h)*5,sz=tz-Math.cos(h)*5;let ok=true;
   for(let d=0;d<=10&&ok;d+=.5)if(ctx.solid(sx+Math.sin(h)*d,sz+Math.cos(h)*d,.5))ok=false;
   if(ok)plan={sx,sz,h};}
  if(plan)break;
 }
 const player=createPlayer(ctx,{start:[plan.sx,plan.sz],heading:plan.h,bodies:()=>sim});
 Object.assign(player.state,{x:plan.sx,z:plan.sz,y:ctx.height(plan.sx,plan.sz),bodyHeading:plan.h,course:plan.h});
 sim.postUpdate=d=>player.settleCrowd(d);
 player.setTouch({forward:1,strafe:0,running:false});
 let closest=Infinity;
 for(let f=0;f<80;f++){
  player.step(.1);yieldToPlayer(sim,player.state,player.contact.nearby);traffic.update(.1);sim.update(.1);
  player.state.health=100;player.state.hurtTime=0;
  // What would be drawn: everyone's position at the end of the frame.
  for(const p of player.contact.nearby)if(p.active&&p.struck===undefined&&!p.combatDead)
   closest=Math.min(closest,Math.hypot(p.x-player.state.x,p.z-player.state.z));
 }
 assert.ok(closest>=.5,`someone ended a frame ${closest.toFixed(2)} m from the player`);
});
