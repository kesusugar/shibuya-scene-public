// PLAN-WEAPONS W4: the dodge roll (brief invulnerability to bullets) and the crouch (the police
// see a sneaking player from shorter range).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';
import {createPoliceGuns} from '../src/police/guns.mjs';
import {sightRange,POLICE} from '../src/police/director.mjs';
import {WANTED} from '../src/police/wanted.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
const humanoid=async()=>humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);
const flat=(solid=()=>false)=>({solid,safe:()=>true,height:()=>0,onRoad:()=>false});

test('the roll covers the ground its clip was authored for, the same at 30 and 60 Hz',()=>{
 assert.ok(Math.abs(PLAYER.roll.seconds-REPORT.clips.find(c=>c.name==='Roll').seconds)<.01);
 assert.ok(Math.abs(PLAYER.roll.distance-REPORT.gaitDetail.clips.Roll.stride)<.05,'the distance is not the clip\'s measured travel');
 const travel=hz=>{const p=createPlayer(flat(),{start:[0,0],heading:0});p.place(0,0,0);
  assert.ok(p.roll());for(let i=0;i<hz*2;i++)p.step(1/hz);return Math.hypot(p.state.x,p.state.z);};
 const a=travel(30),b=travel(60);
 assert.ok(Math.abs(a-PLAYER.roll.distance)<.01&&Math.abs(b-a)<.01,`${a.toFixed(3)} / ${b.toFixed(3)} m`);
});

test('the roll goes the way the player is going, stops at a wall, and cannot be chained',()=>{
 const p=createPlayer(flat((x,z)=>z>2),{start:[0,0],heading:0});p.place(0,0,0);
 p.setTouch({strafe:1});
 assert.ok(p.roll());
 assert.ok(Math.abs(p.state.rollHeading+Math.PI/2)<1e-6,'a roll to the right went elsewhere');
 assert.ok(!p.roll(),'a second roll started mid-roll');
 const q=createPlayer(flat((x,z)=>z>2),{start:[0,0],heading:0});q.place(0,0,0);q.roll();
 while(q.state.rollTime>0)q.step(1/30);
 assert.ok(q.state.z<2,'rolled through a wall');
 assert.ok(!q.roll(),'rolled again with no recovery');
 for(let i=0;i<10;i++)q.step(1/30);
 assert.ok(q.roll(),'the recovery never ended');
});

test('a roll is a brief invulnerability to bullets, and only while it lasts',()=>{
 const p=createPlayer(flat(),{start:[0,0],heading:0});p.place(0,0,0);p.roll();
 const dodge=[];for(let t=0;t<PLAYER.roll.seconds+.2;t+=1/60){p.step(1/60);dodge.push(p.state.dodging);}
 assert.ok(dodge.some(Boolean)&&!dodge[dodge.length-1],'never dodging, or dodging after the roll');
 // Officers firing at a dodging player never hit; the same frames standing, they do.
 const shoot=dodging=>{const g=createPoliceGuns(),o={id:1,x:0,z:5,active:true,heading:Math.PI};let hits=0,shots=0;
  for(let t=0;t<30;t+=1/30)for(const e of g.update(1/30,{officers:[o],me:{x:0,z:0,dodging},stars:3,threat:{armed:true}}))if(e.kind==='shot'){shots++;if(e.hit)hits++;}
  return {hits,shots};};
 const d=shoot(true),s=shoot(false);
 assert.ok(d.shots>0&&d.hits===0,`${d.hits} of ${d.shots} hit a rolling player`);
 assert.ok(s.hits>0);
});

test('crouched: no running, a creep, and the police see from a little over half as far',()=>{
 const p=createPlayer(flat(),{start:[0,0],heading:0});p.place(0,0,0);
 p.crouch(true);p.setTouch({forward:1,running:true});
 for(let i=0;i<90;i++)p.step(1/30);
 assert.ok(!p.state.running&&p.state.speed<=PLAYER.crouchSpeed+1e-6,`crouched at ${p.state.speed.toFixed(2)} m/s`);
 assert.equal(sightRange({crouching:false}),WANTED.sightRange);
 assert.equal(sightRange({crouching:true}),WANTED.sightRange*POLICE.crouchSight);
 assert.equal(sightRange({crouching:true},true),WANTED.sightRange,'crouched in a car seat is not sneaking');
});

test('the figure: the roll owns the body (it goes low), and a crouch lowers the hips',async()=>{
 const asset=await humanoid(),dt=1/60;
 const pelvisY=(figure,state,frames)=>{const b=figure.root.getObjectByName('pelvis'),v=new Vector3();let lo=Infinity;
  for(let i=0;i<frames;i++){figure.update(state,dt);if(state.rollTime>0)state.rollTime=Math.max(0,state.rollTime-dt);figure.root.updateMatrixWorld(true);b.getWorldPosition(v);lo=Math.min(lo,v.y);}return {lo,now:v.y};};
 const stand=createPlayerFigure(asset);
 const up=pelvisY(stand,{x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0},40).now;
 const roll=createPlayerFigure(asset);
 const r=pelvisY(roll,{x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0,rollTime:PLAYER.roll.seconds,rollDuration:PLAYER.roll.seconds},60);
 assert.ok(r.lo<up-.35,`the roll only dropped the hips to ${r.lo.toFixed(2)} from ${up.toFixed(2)}: averaged with the idle?`);
 const crouch=createPlayerFigure(asset);
 const c=pelvisY(crouch,{x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0,crouching:true},40).now;
 assert.ok(c<up-.15,`crouched hips at ${c.toFixed(2)} against ${up.toFixed(2)} standing`);
});
