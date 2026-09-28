import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure,STRIKE} from '../src/player/figure.mjs';
import {ATTACKS,attackOf} from '../src/player/attack-timing.mjs';
import {createMeleeCombat,COMBAT} from '../src/player/combat.mjs';
import {createPlayer} from '../src/player/controller.mjs';
import {responseOf,RESPONSE} from '../src/life/temperament.mjs';

// The punch as seen on real hardware: a sideways swing, the arms opening out to the sides
// instead of going at the person in front. Measured on the player's own figure, the jab's fist
// at its peak sat 0.6 m out to the side at chest height. Two causes: the swing was averaged
// 50/50 with the idle it was layered on, and an added torso twist ran the wrong way.

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
const humanoid=async()=>humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

/** The striking fist at the swing's peak, in the body's own frame (x left, z forward). */
function fistAtPeak(asset,name,speed){
 const figure=createPlayerFigure(asset),dt=1/60;
 const state={x:0,y:0,z:0,speed,heading:0,bodyHeading:0,alive:true,attackTime:0,attackDuration:0,attackName:name};
 for(let i=0;i<60;i++)figure.update(state,dt);
 const a=attackOf(name),hand=figure.root.getObjectByName(a.hand==='left'?'hand_l':'hand_r');
 state.attackDuration=state.attackTime=a.duration;
 const inverse=new Matrix4(),v=new Vector3();let best=null;
 while(state.attackTime>0){
  figure.update(state,dt);figure.root.updateMatrixWorld(true);
  inverse.copy(figure.root.matrixWorld).invert();hand.getWorldPosition(v).applyMatrix4(inverse);
  if(!best||v.z>best.z)best=v.clone();
  state.attackTime=Math.max(0,state.attackTime-dt);
 }
 const shoulder=new Vector3();figure.root.getObjectByName(a.hand==='left'?'upperarm_l':'upperarm_r').getWorldPosition(shoulder).applyMatrix4(inverse);
 figure.dispose?.();
 return {fist:best,shoulder};
}

test('both punches go straight out in front, standing and walking',async()=>{
 const asset=await humanoid();
 for(const a of ATTACKS)for(const speed of [0,1.4]){
  const {fist,shoulder}=fistAtPeak(asset,a.name,speed),label=`${a.name} at ${speed} m/s`;
  assert.ok(fist.z>.6,`${label}: the fist reaches only ${fist.z.toFixed(2)} m forward`);
  assert.ok(Math.abs(fist.x)<.2,`${label}: the fist is ${fist.x.toFixed(2)} m off the centre line`);
  // Forward, not out: a straight punch travels further forward than it strays sideways.
  assert.ok(fist.z>4*Math.abs(fist.x),`${label}: ${fist.x.toFixed(2)} sideways for ${fist.z.toFixed(2)} forward`);
  assert.ok(fist.y>shoulder.y-.3,`${label}: the fist at ${fist.y.toFixed(2)} m, far below the shoulder at ${shoulder.y.toFixed(2)} m`);
 }
 assert.ok(STRIKE.fadeIn<attackOf('Punch').windup,'the swing must own the body before the fist leaves');
});

test('the punch no longer twists the torso on top of the clip',()=>{
 const src=readFileSync('src/player/figure.mjs','utf8');
 assert.doesNotMatch(src,/spine\.rotateY\(|chest\?*\.rotateY\(/,'a twist swings an extended arm off its line');
});

// The same stand-in crowd as tests/combat.test.mjs.
function crowd(people=[]){
 const c={time:0,network:{ctx:{safe:()=>true,height:()=>0}},grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){p.crossing=null;},strike(p){c.leave(p);p.struck=0;return true;},say:()=>true,
  scatter:()=>true,vehicleOverlap:()=>false,blocked:()=>false};
 for(const p of people)c.insert(p);return c;
}
const FLEER=Array.from({length:64},(_,i)=>i).find(i=>responseOf(i)===RESPONSE.FLEE);
const npc=(id,x,z)=>({id,active:true,controlled:false,choreographed:false,archetype:'adult',state:'walking',
 x,z,renderX:x,renderZ:z,heading:Math.PI,speed:0,crossing:null,combatHealth:100,combatDead:false});
const player=(extra={})=>{const state={x:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,health:100,attackTime:0,hurtTime:0,...extra};
 return {state,startAttack(sec,name){state.attackTime=sec;state.attackDuration=sec;state.attackName=name;return true;}};};
const swingOnce=(melee,c,p)=>{melee.request();for(let t=0;t<1.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);}};

test('a swing turns onto the person it is thrown at, and lands on them',()=>{
 // 62 degrees off the body: outside the hit arc from where the body faced, inside the lock.
 const off=62*Math.PI/180,d=1.4,victim=npc(FLEER,d*Math.sin(off),d*Math.cos(off));
 assert.ok(off>COMBAT.arc&&off<COMBAT.lockArc);
 const c=crowd([victim]),p=player(),melee=createMeleeCombat();
 melee.request();melee.update(1/60,c,p);
 assert.equal(melee.swing.aim,victim.id);
 assert.ok(Math.abs(p.state.attackHeading-off)<1e-6,`aimed at ${p.state.attackHeading}`);
 assert.ok(Math.abs(p.state.bodyHeading-off)<1e-6,'the hit arc must measure from the aim');
 for(let t=0;t<1.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);}
 assert.equal(melee.update(0,c,p).hits,1,'the punch missed the person it turned onto');
});

test('standing, the swing goes where the camera looks; nobody there, straight ahead',()=>{
 const victim=npc(FLEER,1.2,0),c=crowd([victim]);
 const p=player({heading:Math.PI/2,bodyHeading:0}),melee=createMeleeCombat();
 swingOnce(melee,c,p);
 assert.ok(Math.abs(p.state.bodyHeading-Math.PI/2)<1e-6);
 assert.equal(melee.update(0,c,p).hits,1);
 const lone=player({heading:.4,bodyHeading:0}),empty=crowd([]),m2=createMeleeCombat();
 m2.request();m2.update(1/60,empty,lone);
 assert.equal(m2.swing.aim,null);
 assert.ok(Math.abs(lone.state.attackHeading-.4)<1e-6,'an empty swing still goes where the player looks');
});

test('the aim follows its person through the wind-up, then holds its line',()=>{
 const victim=npc(FLEER,0,1.3),c=crowd([victim]),p=player(),melee=createMeleeCombat();
 melee.request();melee.update(1/60,c,p);
 victim.x=.5;melee.update(1/60,c,p);
 assert.ok(Math.abs(p.state.attackHeading-Math.atan2(.5,1.3))<1e-6,'the wind-up lost its person');
 const windup=attackOf(melee.swing.name).windup;
 for(let t=2/60;t<windup+.05;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);}
 const fixed=p.state.attackHeading;victim.x=-.5;melee.update(1/60,c,p);
 assert.equal(p.state.attackHeading,fixed,'the fist changed line mid-flight');
});

test('a swing plants the feet: the player stops and holds the aim',()=>{
 const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
 const p=createPlayer(flat,{start:[0,0],heading:0});p.place(0,0,0);p.setTouch({forward:1});
 for(let i=0;i<60;i++)p.step(1/60);
 assert.ok(p.state.speed>1,'the stand-in never got going');
 p.startAttack(.8,'Punch');p.state.bodyHeading=.7;
 for(let i=0;i<20;i++){p.step(1/60);p.state.attackTime-=1/60;}
 assert.equal(p.state.speed,0,'the body is still carried along under the punch');
 assert.equal(p.state.bodyHeading,.7,'input turned the body off its aim mid-swing');
});

test('a reset mid-swing hands the whole body back to the gait',async()=>{
 const figure=createPlayerFigure(await humanoid()),a=attackOf('Punch');
 const state={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:a.duration,attackDuration:a.duration,attackName:'Punch'};
 for(let i=0;i<10;i++){figure.update(state,1/60);state.attackTime-=1/60;}
 figure.reset();
 const idle={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0};figure.update(idle,1/60);
 const hand=figure.root.getObjectByName('hand_l'),v=new Vector3();figure.root.updateMatrixWorld(true);hand.getWorldPosition(v);
 // Idle hangs the left hand at the hip; a gait scaled down with nothing to fill it drifts to the bind pose.
 assert.ok(v.y<1.05&&v.y>.7,`left hand at ${v.y.toFixed(2)} m after a reset`);
});
