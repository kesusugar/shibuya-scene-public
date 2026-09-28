// §9ah: the submachine gun -- slot 4, automatic fire with spread and recoil, the CMU low ready and
// shouldered aim over the walk, and the street's and the police's reaction to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createArsenal,spreadDirection} from '../src/player/arsenal.mjs';
import {WEAPONS,GRIP,SHAPE,SLOTS} from '../src/player/weapons.mjs';
import {WEAPON_IDS} from '../src/police/director.mjs';
import {createInputMap,BUTTON} from '../src/player/input-map.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

test('slot 4 is the submachine gun, and its clips are in the character pack with their provenance',()=>{
 assert.equal(SLOTS[3],'smg');
 const names=new Set(REPORT.clips.map(c=>c.name));
 for(const n of ['SmgLow','SmgAim'])assert.ok(names.has(n),`${n} is missing from citizen.glb`);
 assert.match(REPORT.clips.find(c=>c.name==='SmgAim').upstream,/CMU 80_03/);
 assert.match(REPORT.cmuWeapons.acknowledgment,/mocap\.cs\.cmu\.edu/);
 // The clips were baked with the right hand on this grip frame; the mesh must use the same.
 assert.deepEqual(GRIP.smg,GRIP.pistol);
 assert.equal(SHAPE.smg.foreEnd,.28);
});

// The stand-in world of tests/pistol.test.mjs, with nobody in it.
function rig(){
 const crowd={time:0,grid:new Map(),flee:()=>true,say:()=>true};
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true},player={state},shots=[];
 const world={solid:()=>false,ground:()=>-50,cars:[],dimsOf:()=>null,people:()=>[],bodyOf:()=>({y:0,height:1.76}),
  skip:()=>false,clear:()=>true,crowd,wound:()=>null,bleed:()=>{},muzzle:()=>null};
 const arsenal=createArsenal({onShot:s=>shots.push(s)});
 const camera={position:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}};
 return {state,player,shots,world,arsenal,camera};
}

test('automatic: the trigger held fires at its rate, released it stops; the pistol held fires once',()=>{
 const {player,shots,world,arsenal,camera,state}=rig();
 arsenal.select(4);arsenal.aim(true);
 arsenal.trigger();arsenal.hold(true);
 for(let t=0;t<1;t+=1/60)arsenal.frame(1/60,{player,world,camera});
 const perSecond=shots.length;
 assert.ok(perSecond>=10&&perSecond<=12,`${perSecond} rounds in a second at a ${WEAPONS.smg.refire} s refire`);
 assert.equal(state.weapon,'smg');
 arsenal.hold(false);
 const after=shots.length;for(let t=0;t<.5;t+=1/60)arsenal.frame(1/60,{player,world,camera});
 assert.equal(shots.length,after,'kept firing after the trigger was let go');
 // The pistol: the same held trigger is one shot per press.
 const p=rig();p.arsenal.select(2);p.arsenal.aim(true);p.arsenal.trigger();p.arsenal.hold(true);
 for(let t=0;t<1;t+=1/60)p.arsenal.frame(1/60,{player:p.player,world:p.world,camera:p.camera});
 assert.equal(p.shots.length,1,'the pistol went automatic');
});

test('a burst climbs and opens up; let go, it settles and closes',()=>{
 const {player,shots,world,arsenal,camera}=rig();
 arsenal.select(4);arsenal.aim(true);arsenal.trigger();arsenal.hold(true);
 for(let t=0;t<.6;t+=1/60)arsenal.frame(1/60,{player,world,camera});
 assert.ok(arsenal.recoil>.02,`recoil ${arsenal.recoil.toFixed(3)} rad after a burst`);
 assert.ok(arsenal.spread>.02&&arsenal.spread<=WEAPONS.smg.spread.max+1e-9,`spread ${arsenal.spread.toFixed(3)}`);
 // Later rounds go higher than the first (the camera looks level ahead).
 const rise=s=>s.hit.dir.y;
 assert.ok(rise(shots[shots.length-1])>rise(shots[0])+.01,'the muzzle did not climb');
 arsenal.hold(false);
 for(let t=0;t<1;t+=1/60)arsenal.frame(1/60,{player,world,camera});
 assert.ok(arsenal.recoil<.002&&arsenal.spread<.001,'the recoil and spread did not settle');
});

test('spread and climb are about the aim: up is up whichever way it points, and the cone holds',()=>{
 for(const d of [{x:0,y:0,z:1},{x:1,y:0,z:0},{x:-.6,y:-.3,z:.7}]){
  const v=spreadDirection(d,{climb:.1});
  const n=Math.hypot(d.x,d.y,d.z);assert.ok(v.y>d.y/n+.05,`climb went down for ${JSON.stringify(d)}`);
 }
 for(let i=0;i<60;i++){const v=spreadDirection({x:0,y:0,z:1},{spread:.05,index:i});assert.ok(Math.acos(v.z)<=.0501);}
});

test('the pad: ZR held on foot is the held trigger',()=>{
 const map=createInputMap(),buttons=Array.from({length:18},()=>({pressed:false,value:0}));
 const pad={id:'Pro Controller (057e)',mapping:'standard',connected:true,axes:[0,0,0,0],buttons};
 buttons[BUTTON.ZR]={pressed:true,value:1};
 assert.equal(map.poll(pad,1/60,'foot').fire,true);
 assert.equal(map.poll(pad,1/60,'car').fire,false,'in a car ZR is the throttle');
});

test('the police count it as a weapon out, and a kill with it as a weapon kill',()=>{
 assert.ok(WEAPON_IDS.has('smg')&&WEAPON_IDS.has('pistol')&&WEAPON_IDS.has('katana')&&!WEAPON_IDS.has('fists'));
 assert.ok(WEAPONS.smg.witnessRadius>=WEAPONS.pistol.witnessRadius,'an automatic is heard at least as far');
});

// The figure ------------------------------------------------------------------------------------
async function smgFigure(){return createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana','smg']});}

test('drawn, the upper body holds the low ready over the walk; aimed, it shoulders and hits the target while walking',async()=>{
 const figure=await smgFigure(),dt=1/60;
 const hand=figure.root.getObjectByName('hand_r'),handL=figure.root.getObjectByName('hand_l');
 const state={x:0,y:0,z:0,speed:1.4,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'smg'};
 for(let i=0;i<40;i++){state.z+=1.4*dt;figure.update(state,dt);}
 assert.ok(figure.aim.weight===0&&figure.weapons.current==='smg','drawn and not aimed');
 // Both hands on the gun at the low ready: the left hand within reach of the fore-end.
 const fore=new Vector3(0,0,SHAPE.smg.foreEnd),m=figure.root.getObjectByName('weapon-smg');
 m.updateWorldMatrix(true,false);fore.applyMatrix4(m.matrixWorld);
 const l=new Vector3();handL.getWorldPosition(l);
 assert.ok(l.distanceTo(fore)<.16,`the left hand is ${(l.distanceTo(fore)*100).toFixed(0)} cm from the fore-end at the low ready`);
 // Aimed while walking, 45° off the walk: within 0.25 m at 10 m, like the pistol (R1).
 const a=Math.PI/4;state.aim=1;state.aimHeading=a;state.aimTarget={x:10*Math.sin(a),y:1.4,z:state.z+10*Math.cos(a)};
 let worst=0;
 for(let i=0;i<120;i++){state.z+=1.4*dt;state.aimTarget.z+=1.4*dt;figure.update(state,dt);if(i>40)worst=Math.max(worst,figure.aim.error);}
 assert.ok(worst<=.25,`the muzzle ray misses by ${worst.toFixed(3)} m`);
 void hand;figure.dispose();
});

test('a round\'s recoil lifts the muzzle on the figure',async()=>{
 const figure=await smgFigure(),dt=1/60;
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'smg',aim:1,aimHeading:0,aimTarget:{x:0,y:1.4,z:10}};
 for(let i=0;i<40;i++)figure.update(state,dt);
 const p=new Vector3(),d0=new Vector3(),d1=new Vector3();
 figure.weapons.muzzle(p,d0);
 state.recoil=.1;state.shotLeft=.12;figure.update(state,0);figure.weapons.muzzle(p,d1);
 assert.ok(d1.y>d0.y+.05,`the muzzle rose ${(d1.y-d0.y).toFixed(3)} for 0.1 rad of recoil`);
 figure.dispose();
});
