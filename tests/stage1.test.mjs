// Roadmap stage 1: the hit marker's inputs, the automatic's zoom, the ammunition HUD's numbers, the
// weapon wheel, what a gunfight leaves behind (holes, casings, smoke, a dropped magazine, blood
// pools -- all bounded), the weapon change as a hand movement and the automatic's magazine change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createArsenal} from '../src/player/arsenal.mjs';
import {createInventory,WEAPONS,DRAW} from '../src/player/weapons.mjs';
import {PLAYER} from '../src/player/controller.mjs';
import {createWeaponWheel,wheelSlot,WHEEL} from '../src/player/weapon-wheel.mjs';
import {createImpactMarks,wallNormal,MARKS} from '../src/player/impact-marks.mjs';
import {drawPhase,reloadPhase,RELOAD} from '../src/player/hands.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

test('the automatic shoulders closer than the pistol (its own aim FOV)',()=>{
 assert.ok(WEAPONS.smg.aimFov<PLAYER.aimFov,`smg ${WEAPONS.smg.aimFov} vs pistol ${PLAYER.aimFov}`);
 assert.equal(WEAPONS.pistol.aimFov,undefined,'the pistol keeps the shared aim FOV');
});

test('the HUD gets the reload as a fraction, filling back up',()=>{
 const inv=createInventory();inv.select('smg');for(let i=0;i<5;i++){inv.fire();inv.update(.2);}
 assert.equal(inv.snapshot().reloadProgress,0);
 assert.ok(inv.reload());inv.update(WEAPONS.smg.reloadSeconds/2);
 assert.ok(Math.abs(inv.snapshot().reloadProgress-.5)<1e-6);
 inv.update(WEAPONS.smg.reloadSeconds);assert.equal(inv.snapshot().rounds,WEAPONS.smg.magazine);assert.equal(inv.snapshot().reloadProgress,0);
});

test('the wheel: clockwise from the top in key order, a deadzone, the mouse adds up, the current weapon stays picked',()=>{
 assert.deepEqual(WHEEL.order,['fists','pistol','katana','smg']);
 assert.equal(wheelSlot(0,-1),0);assert.equal(wheelSlot(1,0),1);assert.equal(wheelSlot(0,1),2);assert.equal(wheelSlot(-1,0),3);
 assert.equal(wheelSlot(.1,.1),null,'inside the deadzone nothing is picked');
 const w=createWeaponWheel();
 w.show('katana');assert.ok(w.open);
 assert.equal(w.close(),'katana','let go without moving: the weapon out stays out');
 w.show('fists');
 for(let i=0;i<10;i++)w.move(4,0);          // 40 px right: not yet far enough
 assert.equal(w.highlighted,'fists');
 for(let i=0;i<20;i++)w.move(6,0);
 assert.equal(w.highlighted,'pistol');
 for(let i=0;i<40;i++)w.move(-8,2);          // swing round to the left
 assert.equal(w.highlighted,'smg');
 assert.ok(Math.hypot(w.vector.x,w.vector.y)<=1+1e-9,'the travel is bounded to one full pick');
 w.point(0,.9);assert.equal(w.highlighted,'katana','a stick points straight at a slot');
 w.point(0,0);assert.equal(w.highlighted,'katana','a released stick keeps the pick');
 assert.equal(w.close(),'katana');assert.equal(w.open,false);
 assert.ok(WHEEL.slow<1&&WHEEL.slow>0);
});

test('a wall\'s normal is found from the open air around the hit',()=>{
 const solid=(x,z)=>x>5;                     // a wall face at x = 5, facing -x
 const n=wallNormal({x:5.01,y:1,z:0},{x:1,y:0,z:0},solid);
 assert.ok(n.x<-.9&&Math.abs(n.z)<.3,`normal ${n.x.toFixed(2)},${n.z.toFixed(2)}`);
 const corner=wallNormal({x:5.01,y:1,z:5.01},{x:.7,y:0,z:.7},(x,z)=>x>5&&z>5);
 assert.ok(corner.x<0&&corner.z<0,'a corner faces out of both walls');
});

test('casings fly to the gun\'s right, bounce, lie on their side and go; everything is bounded',()=>{
 const marks=createImpactMarks(),landed=[];
 // A gun at 1.4 m pointing +Z: its right is -X.
 marks.casing({x:0,y:1.4,z:0},{x:0,y:0,z:1});
 let t=0;for(;t<3;t+=1/60)marks.update(1/60,{ground:()=>0,onLand:(x,y,z,kind)=>landed.push({x,y,z,kind})});
 assert.ok(landed.length>=1,'the casing struck the ground');
 assert.ok(landed[0].x<-.3,`it went to the right of the gun (x ${landed[0].x.toFixed(2)})`);
 assert.ok(landed[0].y<.02);
 assert.equal(marks.live.casings,1);
 for(;t<MARKS.casingLife+.5;t+=.1)marks.update(.1,{ground:()=>0});
 assert.equal(marks.live.casings,0,'a casing goes after its time');
 for(let i=0;i<200;i++){marks.casing({x:0,y:1.4,z:0},{x:0,y:0,z:1});marks.hole({x:0,y:1,z:5},{x:0,y:0,z:-1});marks.smoke({x:0,y:1.4,z:.3},{x:0,y:0,z:1});}
 for(let i=0;i<30;i++)marks.pool(i,0,0);
 marks.update(1/60,{ground:()=>0});
 const live=marks.live;
 assert.ok(live.casings<=MARKS.casings&&live.holes<=MARKS.holes&&live.smoke<=MARKS.smoke&&live.pools<=MARKS.pools,JSON.stringify(live));
 marks.dispose();
});

test('a magazine falls and lies flat; smoke rises and thins; a pool waits for the body then spreads',()=>{
 const marks=createImpactMarks(),landed=[];
 marks.magazine({x:1,y:1,z:1});
 for(let t=0;t<1;t+=1/60)marks.update(1/60,{ground:()=>.1,onLand:(x,y,z,kind)=>landed.push(kind)});
 assert.deepEqual(landed,['magazine']);
 marks.smoke({x:0,y:1.5,z:0},{x:0,y:0,z:1},3);
 marks.update(.3,{ground:()=>0});assert.equal(marks.live.smoke,3);
 for(let t=0;t<1.5;t+=.05)marks.update(.05,{ground:()=>0});assert.equal(marks.live.smoke,0,'the smoke is gone in about a second');
 marks.pool(0,0,0);
 const pools=marks.root.getObjectByName('blood-pools'),m=new (pools.instanceMatrix.array.constructor)(16);
 const size=()=>{pools.getMatrixAt(0,{fromArray(a){m.set(a.slice?a.slice(0,16):a);return this;},elements:m});return Math.hypot(m[0],m[1],m[2]);};
 const run=s=>{for(let t=0;t<s-1e-9;t+=.05)marks.update(.05);};
 run(MARKS.poolDelay*.5);assert.ok(size()<1e-6,'no blood before the body is down');
 run(MARKS.poolDelay*.5+1);const early=size();
 run(8);const later=size();
 assert.ok(early>0&&later>early,`spreads: ${early.toFixed(2)} then ${later.toFixed(2)}`);
 assert.ok(later<=MARKS.poolRadius[1]+1e-6);
 marks.dispose();
});

test('a shot leaves a casing and smoke; a round into a wall leaves a hole facing out of it',()=>{
 const arsenal=createArsenal();
 const s={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,pitch:0};
 const player={state:s};
 const world={solid:(x,z)=>z>10,ground:()=>0,cars:[],dimsOf:()=>null,people:()=>[],clear:()=>true,crowd:null};
 arsenal.select('pistol');arsenal.aim(true);
 for(let i=0;i<5;i++)arsenal.frame(1/30,{player,world,camera:{position:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}}});
 arsenal.trigger();
 for(let i=0;i<5;i++)arsenal.frame(1/30,{player,world,camera:{position:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}}});
 const snap=arsenal.snapshot();
 assert.equal(snap.shots,1);assert.equal(snap.marks.casings,1);assert.equal(snap.marks.smoke,3);assert.equal(snap.marks.holes,1);
 const holes=arsenal.marks.root.getObjectByName('bullet-holes'),e=holes.instanceMatrix.array;
 assert.ok(e[14]<10&&e[14]>9.9,`the hole sits on the wall's face (z ${e[14].toFixed(3)})`);
 arsenal.dispose();
});

test('the draw\'s timeline: the old weapon until the hand is at its carry, then the new one coming up',()=>{
 const swap={from:'pistol',to:'smg',fromSpot:'pistol',toSpot:'smg',t:0,holster:DRAW.holster,draw:DRAW.draw};
 let p=drawPhase(swap);assert.equal(p.shown,'pistol');assert.equal(p.weight,0);
 swap.t=DRAW.holster*.999;p=drawPhase(swap);assert.equal(p.shown,'pistol');assert.ok(p.weight>.99,'at the holster');
 swap.t=DRAW.holster+1e-6;p=drawPhase(swap);assert.equal(p.shown,'smg');assert.equal(p.spot,'smg');assert.ok(p.weight>.99,'at the sling');
 swap.t=DRAW.holster+DRAW.draw;p=drawPhase(swap);assert.ok(p.done&&p.weight<1e-6);
});

test('the reload\'s key points: grab, pull, drop, a fresh one from the hip, seat, back to the fore-end',()=>{
 const mags=[];for(let u=0;u<=1;u+=.01){const m=reloadPhase(u).mag;if(mags.at(-1)!==m)mags.push(m);}
 assert.deepEqual(mags,['gun','hand','none','hand','gun']);
 assert.equal(reloadPhase(0).from,'grip');assert.equal(reloadPhase(.999).to,'grip');
 assert.ok(RELOAD.keys.some(k=>k[1]==='pouch'),'the fresh magazine comes from the hip');
});

test('changing weapons on the body: the hand fetches the gun from its carry, and a shot waits for it',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana','smg']});
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'pistol'};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 const root=figure.root,hand=root.getObjectByName('hand_r'),a=new Vector3(),b=new Vector3();
 const holster=root.getObjectByName('weapon-holstered'),slung=root.getObjectByName('weapon-smg')&&[...root.getObjectsByProperty('name','weapon-smg')];
 assert.ok(!holster.visible,'the pistol is in the hand, not in the holster');
 state.weapon='smg';
 const hands=figure.hands;
 figure.update(state,1/30);assert.ok(hands.busy);
 assert.equal(hands.shown,'pistol','the pistol stays in the hand until it is put away');
 let closest=Infinity;
 for(let t=0;t<DRAW.holster-.04;t+=1/30){figure.update(state,1/30);root.updateMatrixWorld(true);hand.getWorldPosition(a);holster.getWorldPosition(b);closest=Math.min(closest,a.distanceTo(b));}
 assert.ok(closest<.2,`the hand went to the holster (closest ${closest.toFixed(2)} m)`);
 for(let t=0;t<DRAW.draw+.1;t+=1/30)figure.update(state,1/30);
 assert.equal(hands.busy,false);assert.equal(hands.shown,'smg');
 assert.ok(holster.visible,'the pistol is back in its holster');
 const sling=slung.find(m=>m.parent.name==='spine_03');
 assert.ok(sling&&!sling.visible,'the slung gun is hidden while it is in the hand');
 assert.equal(hands.stats.draws,1);
 figure.dispose();
});

test('the automatic\'s reload on the body: the left hand takes the magazine down, drops it and seats a fresh one',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana','smg']});
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'smg',aim:0,reloadLeft:0};
 for(let i=0;i<30;i++)figure.update(state,1/30);
 const drops=[];figure.hands.onDrop=at=>drops.push(at);
 const mag=figure.root.getObjectsByProperty('name','weapon-smgMag').find(m=>m.parent.name==='weapon-smg'&&m.parent.parent?.name==='hand_r');
 const seat=mag.position.clone(),hand=figure.root.getObjectByName('hand_l'),a=new Vector3(),m=new Vector3();
 let away=0,hidden=false,follow=Infinity;
 const total=WEAPONS.smg.reloadSeconds;
 for(let t=0;t<total;t+=1/30){
  state.reloadLeft=Math.max(0,total-t);figure.update(state,1/30);figure.root.updateMatrixWorld(true);
  away=Math.max(away,mag.position.distanceTo(seat));if(!mag.visible)hidden=true;
  const u=t/total;
  if(u>.2&&u<.3){hand.getWorldPosition(a);mag.getWorldPosition(m);follow=Math.min(follow,a.distanceTo(m));}
 }
 assert.ok(away>.08,`the magazine left the gun (${away.toFixed(2)} in the gun's frame)`);
 assert.ok(hidden,'between the drop and the fresh one there is no magazine in the gun');
 assert.ok(follow<.25,`the magazine is in the left hand (${follow.toFixed(2)} m)`);
 assert.equal(drops.length,1,'the old magazine is dropped once');
 state.reloadLeft=0;for(let i=0;i<10;i++)figure.update(state,1/30);
 assert.ok(mag.visible&&mag.position.distanceTo(seat)<1e-6,'seated again after the reload');
 figure.dispose();
});
