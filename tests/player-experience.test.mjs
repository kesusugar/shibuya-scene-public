import {responseOf,RESPONSE} from '../src/life/temperament.mjs';
import test from 'node:test';
import {radial,INPUT} from '../src/player/input-map.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SpatialIndex} from '../src/geo/core.mjs';
import {clipCameraArm,createFollowCamera} from '../src/player/camera.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';
import {createPlayerVehicle,vehicleCamera} from '../src/player/vehicle.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createVehicleVisual} from '../src/player/vehicle-visual.mjs';
import {createVehicleEffects} from '../src/player/effects.mjs';
import {createDelivery,planDelivery,DELIVERY} from '../src/player/objective.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {buildCrowd} from '../src/life/render.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {reactToRunner,settleNearbyWaiters} from '../src/player/crowd-interaction.mjs';
import {createMeleeCombat,COMBAT} from '../src/player/combat.mjs';
import {createVehicleTransition} from '../src/player/vehicle-transition.mjs';
import {ShaderLib,Box3,Vector3} from 'three';

const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
test('near character replaces instanced body once and observer mode restores it',()=>{
 const person={id:1,active:true,archetype:'casual',heading:0,height:0,x:0,z:2,renderX:0,renderZ:2,speed:1,travelled:1,animationTime:1,phase:0,lod:'near'};
 const sim={pool:[person],time:0,snapshot:()=>({total:1}),update(){},setCamera(){},setTier(){},dispose(){}};
 const crowd=buildCrowd({}, {ground:{},generic:{},core:{},street:{tier:'high'},detail:{tier:'high'},network:{stats:{},edges:[]},sim});
 assert.equal(crowd.meshes.head.count,1);crowd.setPlayerFocus({x:0,z:0});crowd.update(.016);
 assert.equal(crowd.stats.nearCharacters.active,1);assert.equal(crowd.meshes.head.count,0);
 crowd.setPlayerFocus(null);crowd.update(.016);assert.equal(crowd.meshes.head.count,1);assert.equal(crowd.stats.nearCharacters.active,0);crowd.dispose();
});
test('camera arm stops before a thin wall even if the endpoint is clear',()=>{
 const solids=new SpatialIndex(2),polygon={outer:[[-2,2], [2,2], [2,2.1], [-2,2.1]],holes:[]};
 solids.insert('wall',{minX:-2,maxX:2,minZ:2,maxZ:2.1},{polygon,bottom:0,top:8});
 const ctx={...flat,solids},origin={x:0,y:1.5,z:0},wanted={x:0,y:3,z:10,tx:0,ty:1,tz:0};
 const hit=clipCameraArm(origin,wanted,ctx);assert.ok(hit.z<2&&hit.z>1);assert.equal(hit.tx,0);
 const follow=createFollowCamera();for(let i=0;i<60;i++){const p=follow.update(wanted,origin,ctx,1/60,'drive');assert.ok(p.z<2);}
});
test('follow damping is frame-rate independent and mode switches reset the arm',()=>{
 const run=hz=>{const follow=createFollowCamera();follow.update({x:0,y:3,z:-8,tx:0,ty:1,tz:0},{x:0,y:1,z:0},flat,0,'walk');let p;for(let i=0;i<hz;i++)p=follow.update({x:4,y:3,z:-8,tx:4,ty:1,tz:0},{x:4,y:1,z:0},flat,1/hz,'walk');return p;};
 assert.ok(Math.abs(run(30).x-run(120).x)<1e-6);
 const p=vehicleCamera({x:0,y:0,z:0,heading:0,speed:10});assert.ok(p.z<-9&&p.tz<5);
});
test('pad look advances once per elapsed time; diagnostic input reads have no side effects',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 globalThis.window=new EventTarget();globalThis.document={pointerLockElement:null};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[{connected:true,axes:[0,0,.5,0],buttons:[]}]}});
 try{
  const run=hz=>{const p=createPlayer(flat,{heading:0});p.attach(new EventTarget());for(let i=0;i<hz;i++){p.updateInput(1/hz);p.input();p.input();p.input();}p.detach();return p.state.heading;};
  // PLAN-PERFORMANCE-AND-PAD C3: the stick now goes through a radial deadzone and a response curve
  // (input-map.mjs), so half a throw turns slower than half speed; still once per elapsed time.
  assert.ok(Math.abs(run(30)-run(120))<1e-9);assert.ok(Math.abs(run(60)+PLAYER.padLook*radial(.5,0,{curve:INPUT.lookCurve}).x)<1e-9);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
test('walking respects analogue input and does not animate running through walls',()=>{
 const p=createPlayer(flat);p.setTouch({forward:.2});for(let i=0;i<120;i++)p.step(1/60);assert.ok(p.state.speed<.31);
 const blocked=createPlayer({...flat,solid:()=>true});blocked.setTouch({forward:1});blocked.step(.1);assert.equal(blocked.state.speed,0);
});
test('vehicle dimensions follow takeover and play bounds stop driving into the void',()=>{
 const sim={pool:[],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false};
 const car=createPlayerVehicle(sim,flat),slot={type:'van',x:0,z:0,heading:0};assert.equal(car.takeOver(slot),true);assert.equal(car.def,VEHICLES.van);
 car.state.x=241.9;car.state.heading=Math.PI/2;car.state.course=Math.PI/2;car.state.speed=9;car.step(.1,{forward:1});assert.ok(car.state.x<=242);
 car.release();assert.equal(slot.controlled,false);assert.equal(slot.playerVisual,false);
});
test('stopped traffic can be stolen without retaining signal locks and enter/exit does not snap',()=>{
 const slot={active:true,parked:false,controlled:false,service:false,type:'sedan',x:0,z:2,heading:0,speed:0,locks:new Set(),passed:new Set(),yellowStops:new Set()};
 let released=false;const sim={pool:[slot],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false,releasePermits(v){released=v===slot;v.locks.clear();}},car=createPlayerVehicle(sim,flat),entry=car.nearestEntry(0,0);
 assert.equal(entry.kind,'steal');assert.equal(entry.inRange,true);assert.ok(car.doorPose(slot,0,0));
 const other={type:'sedan',x:0,z:0,heading:0,locks:new Set(),passed:new Set(),yellowStops:new Set()};assert.equal(car.takeOver(other),true);assert.equal(car.takeOver(slot),true);assert.equal(released,true);
 // RUN 9: a transition is a list of stages with real waypoints, not two poses and a
 // smoothstep, so `begin` takes named points. The claim under test -- that entry moves the
 // body rather than snapping it, and reports the slot at the end -- is unchanged.
 const motion=createVehicleTransition();
 assert.equal(motion.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:1,z:1,heading:Math.PI/2},
  seat:{x:1.4,z:1.2,heading:0}},slot),true);
 const mid=motion.update(.2);assert.ok(mid.x>0&&mid.x<1.4&&!mid.done);
 let end=null;for(let i=0;i<60&&motion.active;i++)end=motion.update(.05);
 assert.equal(end.done,true);assert.equal(end.slot,slot);assert.equal(motion.active,false);
});
const FIGHTER_ID=Array.from({length:4000},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.FIGHT);
test('melee selects a facing adult, provokes counterattacks, and either side can die',()=>{
 // One of the few who fight (the owner's rule after stage 6: ~3%, temperament `fighter`).
 const p={id:FIGHTER_ID,active:true,controlled:false,choreographed:false,struck:undefined,combatDead:false,archetype:'casual',crossing:null,x:0,z:1,heading:Math.PI,state:'walking',speed:0};
 const grid=new Map([['0,0',[p]]]),crowd={grid,time:0,network:{ctx:flat},cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),insert(q){const k=this.cell(q.x,q.z);if(!this.grid.has(k))this.grid.set(k,[]);this.grid.get(k).push(q);},leave(){},say(){},vehicleOverlap:()=>false,strike(q){q.struck=0;return true;}};
 const player=createPlayer(flat,{start:[0,0],heading:0}),fight=createMeleeCombat();
 // RUN 8: damage lands inside the clip's active window, not on the tick of the input. This
 // assertion used to read `update(.1)` and expect health already gone, which was the
 // instant-damage behaviour that run removed. Advancing past the wind-up is the fix; the
 // claim being tested -- that a facing adult is selected and damaged -- is unchanged.
 fight.request();fight.update(.1,crowd,player);
 assert.equal(p.combatHealth,undefined,'damage landed during the wind-up');
 fight.update(.3,crowd,player);
 assert.equal(p.combatHealth,100-COMBAT.playerDamage);assert.equal(p.combatTarget,'player');
 crowd.time=.7;fight.update(.4,crowd,player);assert.ok(player.state.health<100);
 // Each swing has to finish before the next one starts: a press during recovery is dropped
 // rather than queued, so landing two more hits means waiting for the arm to come back twice
 // rather than pressing twice.
 // Step E (player crowd contact): four blows put someone down, so three more after the first
 // (this loop was two while a punch did 34).
 player.state.hurtTime=0;
 for(let i=0;i<3;i++){
  while(fight.phase!=='idle')fight.update(.1,crowd,player);
  fight.request();
  for(let k=0;k<14;k++){fight.update(.1,crowd,player);player.state.hurtTime=0;}
 }
 assert.equal(p.combatDead,true);assert.equal(p.fatal,true);assert.equal(fight.snapshot().npcDeaths,1);
 const killer={...p,id:8,z:1,active:true,struck:undefined,combatDead:false,combatHealth:100,combatTarget:'player',combatUntil:99,combatNext:0};crowd.grid.set('0,0',[killer]);player.place(0,0,0);
 // An NPC punch now costs a wind-up too, so beating the player down takes more simulated
 // time than it did when their damage landed on the frame they decided to throw it. The loop
 // still exits the moment the player dies; it just has room to get there.
 for(let i=0;i<32&&player.state.alive;i++){player.state.hurtTime=0;crowd.time+=2;fight.update(.5,crowd,player);}
 assert.equal(player.state.alive,false);assert.equal(player.state.hitBy,'fight');
 fight.dispose();
});
const simpleNetwork=()=>{const nodes=[[0,0],[-40,-35],[-75,-55],[15,25]].map(([x,z],id)=>({id,x,z,edges:[],component:0})),edges=[];for(const a of nodes)for(const b of nodes){if(a===b)continue;const e={id:edges.length,from:a.id,to:b.id,length:Math.hypot(a.x-b.x,a.z-b.z)};edges.push(e);a.edges.push(e.id);}return {nodes,edges,eligible:nodes,ctx:flat};};
test('delivery requires dismount and dwell, counts contacts, completes and restarts',()=>{
 const mission=createDelivery(simpleNetwork());assert.ok(mission.start({x:0,z:0}));
 let target=mission.snapshot().target;mission.tick(2,{...target,speed:0},{driving:true});assert.equal(mission.snapshot().index,0);
 mission.tick(.7,{...target,speed:0});mission.tick(.1,{x:100,z:100,speed:0});assert.equal(mission.snapshot().progress,0);
 for(let i=0;i<3;i++){target=mission.snapshot().target;mission.tick(1.3,{...target,speed:0},{hits:i===0?1:0});}
 assert.equal(mission.snapshot().status,'complete');assert.equal(mission.snapshot().contacts,1);assert.ok(mission.snapshot().score>0);
 mission.start({x:0,z:0});assert.equal(mission.snapshot().elapsed,0);assert.equal(mission.snapshot().contacts,0);
 mission.tick(DELIVERY.seconds,{x:0,z:0,speed:0});assert.equal(mission.snapshot().status,'failed');mission.cancel();assert.equal(mission.snapshot().status,'idle');
 mission.start({x:0,z:0});mission.tick(.1,{x:0,z:0},{alive:false});assert.equal(mission.snapshot().reason,'転倒しました');
});
test('the shipped HIGH network has a deterministic reachable delivery circuit',()=>{
 const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8')),ground=restoreGroundModel(pack.ground);
 for(const tier of ['high']){const network=restorePedestrianNetwork(pack.life[tier],ground),stops=planDelivery(network,{x:12,z:24});assert.equal(stops.length,3,tier);assert.deepEqual(stops.map(n=>n.id),planDelivery(network,{x:12,z:24}).map(n=>n.id));assert.ok(stops.every(s=>s.path.length&&network.ctx.safe(s.x,s.z,.4)));}
});
test('hero, every car type and bounded particles have finite geometry and release their slot',()=>{
 const figure=createPlayerFigure();figure.update({x:0,y:0,z:0,heading:0,speed:0,alive:true},.1);const size=new Box3().setFromObject(figure.root).getSize(new Vector3());assert.ok(size.y>1.7&&size.y<1.9);
 const visual=createVehicleVisual(),fx=createVehicleEffects();
 for(const type of Object.keys(VEHICLES)){const slot={},state={active:true,x:0,y:0,z:0,heading:0,speed:4,steering:.4,damage:.8,type,doorSide:-1,doorPhase:type==='taxi'?.8:0,slot};visual.update(state,.1);if(type!=='scooter')assert.equal(slot.playerVisual,true);if(type==='taxi')assert.ok(Math.abs(visual.root.getObjectByName('player-vehicle-door--1').rotation.y)>.5);fx.impact(state);for(let i=0;i<20;i++)fx.update(.1,state);assert.ok(fx.root.children[0].count<=72);visual.hide();assert.equal(slot.playerVisual,false);}
 figure.dispose();figure.dispose();visual.dispose();visual.dispose();fx.dispose();fx.dispose();assert.equal(figure.root.children.length,0);
});
test('crowd gait preserves the 13 geometry / 3 material budget and observer pose',()=>{
 const p={id:0,active:true,archetype:'casual',heading:0,height:0,x:0,z:0,renderX:0,renderZ:0,speed:1,travelled:1,animationTime:1,phase:0,lod:'near'};
 const sim={pool:[p],time:0,snapshot:()=>({total:1}),update(){},setCamera(){},dispose(){}};
 const crowd=buildCrowd({}, {nearRigs:false,ground:{},generic:{},core:{},street:{tier:'high'},detail:{tier:'high'},network:{stats:{},edges:[]},sim});
 assert.equal(crowd.stats.geometries,13);assert.equal(crowd.stats.materials,3);
 const mesh=Object.values(crowd.meshes).find(m=>m.geometry.attributes.limbJoint.array.some(v=>v!==0)&&m.count);
 assert.equal(mesh.geometry.attributes.gait.getX(0),0);crowd.setPlayerFocus({x:0,z:0});crowd.update(.1);assert.notEqual(mesh.geometry.attributes.gait.getX(0),0);
 const shader={vertexShader:ShaderLib.standard.vertexShader};mesh.material.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('attribute vec2 limbJoint'));assert.ok(shader.vertexShader.includes('objectNormal.yz=gaitRotation'));
 assert.ok(mesh.geometry.attributes.action);assert.ok(shader.vertexShader.includes('attribute float action'));
 crowd.setPlayerFocus(null);crowd.update(.1);assert.equal(mesh.geometry.attributes.gait.getX(0),0);crowd.dispose();
});
test('local reactions are bounded and never shuffle occupied crossings or unsafe ground',()=>{
 const p={id:1,active:true,x:0,z:1,heading:0,state:'waiting',crossing:null},grid=new Map([['0,0',[p]]]);let alerts=0;
 const crowd={grid,time:0,scatter(){alerts++;return true;},network:{ctx:{...flat,safe:()=>false}},vehicleOverlap:()=>false,cell:()=> '0,0',insert(){}};
 const state={x:0,z:0,heading:0,speed:4,alive:true};assert.equal(reactToRunner(crowd,state),1);assert.equal(reactToRunner(crowd,state),0);assert.equal(alerts,1);
 assert.equal(settleNearbyWaiters(crowd,state,.1),0);assert.equal(p.z,1);p.crossing='scramble';assert.equal(settleNearbyWaiters(crowd,state,.1),0);assert.equal(p.crossing,'scramble');
});
