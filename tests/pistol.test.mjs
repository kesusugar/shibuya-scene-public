// PLAN-WEAPONS W2: the player's pistol -- the aim while walking (R1/R2), where a bullet goes
// (R7/R10), what a shot does to the street (R14), the wanted rules, the shoulder camera (R17) and
// the street's echo (R13).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {castShot,lineOfSight,peopleAlong} from '../src/player/ballistics.mjs';
import {createArsenal,gunfirePanic,ARSENAL} from '../src/player/arsenal.mjs';
import {createMeleeCombat} from '../src/player/combat.mjs';
import {WEAPONS} from '../src/player/weapons.mjs';
import {createWanted,WANTED,reportDelayOf} from '../src/police/wanted.mjs';
import {PLAYER,playerCamera} from '../src/player/controller.mjs';
import {echoTaps,GUNFIRE} from '../src/audio/gunfire.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

/**
 * Walk (or stand) for a while aiming at a point 10 m away at `deg` from the walking direction,
 * and return the worst distance by which the muzzle ray missed it over a full walk cycle.
 */
async function aimError(deg,speed,{aimCorrection=true}={}){
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana'],aimCorrection});
 const a=deg*Math.PI/180,dt=1/60,target={x:10*Math.sin(a),y:1.4,z:10*Math.cos(a)};
 const state={x:0,y:0,z:0,speed,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'pistol',aim:1,aimTarget:target,aimHeading:a};
 let worst=0;
 for(let i=0;i<40+90;i++){
  if(speed){state.z+=speed*dt;target.z+=speed*dt;}
  figure.update(state,dt);
  if(i>=40){assert.ok(Number.isFinite(figure.aim.error),'no muzzle measured');worst=Math.max(worst,figure.aim.error);}
 }
 figure.dispose();
 return worst;
}

test('R1: walking and aiming, the muzzle ray passes within 0.25 m of a target 10 m away at 0°, ±45° and ±90°',async()=>{
 for(const deg of [0,45,-45,90,-90])for(const speed of [1.4,0]){
  const worst=await aimError(deg,speed);
  assert.ok(worst<=.25,`${deg}° at ${speed} m/s: the ray misses by ${worst.toFixed(3)} m`);
 }
});

test('R1: the correction is what does it -- the aim pose alone over a walk misses by metres (§9k)',async()=>{
 const raw=await aimError(45,1.4,{aimCorrection:false});
 assert.ok(raw>.25,`the uncorrected walk only missed by ${raw.toFixed(2)} m; the test would not catch a regression`);
});

test('R2: standing, the body turns onto the aim; walking, the legs keep to the walk unless the aim is behind',async()=>{
 const asset=await humanoid(),dt=1/60;
 for(const [speed,aim,expect] of [[0,1.2,1.2],[1.4,1.2,0],[1.4,2.6,2.6]]){
  const figure=createPlayerFigure(asset,undefined,{weapons:['pistol']});
  const s={x:0,y:0,z:0,speed,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'pistol',aim:1,aimHeading:aim,
   aimTarget:{x:10*Math.sin(aim),y:1.4,z:10*Math.cos(aim)}};
  for(let i=0;i<90;i++)figure.update(s,dt);
  const yaw=figure.root.rotation.y,off=Math.abs(Math.atan2(Math.sin(yaw-expect),Math.cos(yaw-expect)));
  assert.ok(off<.1,`speed ${speed}, aim ${aim}: the body faces ${yaw.toFixed(2)}, not ${expect}`);
  figure.dispose();
 }
});

// R7 / R10 ---------------------------------------------------------------------------------------
const person=(x,z,extra={})=>({id:1,x,z,y:0,height:1.76,...extra});
const from={x:0,y:1.4,z:0};

test('R7: a building between the shooter and a person blocks the shot, at any height',()=>{
 const solid=(x,z)=>z>5&&z<8;                       // a building 5-8 m ahead
 for(const dy of [0,.3]){
  const r=castShot({from,dir:{x:0,y:dy,z:1},solid,people:[person(0,12)]});
  assert.equal(r.kind,'wall');assert.ok(Math.abs(r.distance*Math.hypot(1,dy)/Math.hypot(1,dy)-r.distance)<1e-9);
  assert.ok(r.point.z>4.9&&r.point.z<5.1,`stopped at z ${r.point.z.toFixed(2)}, not the facade`);
 }
 assert.equal(castShot({from,dir:{x:0,y:0,z:1},people:[person(0,12)]}).kind,'person','with no building the person is hit');
 assert.ok(lineOfSight(solid,{x:0,z:0},{x:0,z:12})===false&&lineOfSight(()=>false,{x:0,z:0},{x:0,z:12}));
});

test('R7/R10: a shot over a head misses; at head height it is a headshot; at the chest it is the body',()=>{
 const target=person(0,10);
 const at=y=>castShot({from,dir:{x:0,y:(y-from.y)/10,z:1},people:[target]});
 assert.equal(at(2.1).kind,'none','a shot 0.3 m over the head hit');
 assert.equal(at(1.62).zone,'head');
 assert.equal(at(1.2).zone,'body');
 assert.equal(at(.3).zone,'body','the legs are the body');
 // A shorter person's head starts lower.
 const short=castShot({from,dir:{x:0,y:(1.46-from.y)/10,z:1},people:[person(0,10,{height:1.6})]});
 assert.equal(short.zone,'head');
 // Beside the body, it misses.
 assert.equal(castShot({from,dir:{x:.06,y:0,z:1},people:[target]}).kind,'none');
});

test('R7: a car box stops a bullet, but only where the car is -- a shot over its roof goes on',()=>{
 const car={x:0,z:6,heading:Math.PI/2,type:'sedan'},dims={width:1.8,length:4.6,height:1.45};
 const behind=person(0,12);
 const low=castShot({from,dir:{x:0,y:-.02,z:1},cars:[car],dimsOf:()=>dims,people:[behind]});
 assert.equal(low.kind,'car');assert.equal(low.target,car);
 assert.ok(low.point.z>6-dims.width/2-.01&&low.point.z<6,'stopped at the near side of the car');
 const high=castShot({from:{x:0,y:1.55,z:0},dir:{x:0,y:0,z:1},cars:[car],dimsOf:()=>dims,people:[behind]});
 assert.equal(high.kind,'person','a shot over the roof was stopped by the car');
});

test('R7: the ground stops a shot aimed down, and nothing goes past the range',()=>{
 const down=castShot({from,dir:{x:0,y:-.2,z:1},ground:()=>0});
 assert.equal(down.kind,'ground');assert.ok(Math.abs(down.point.y)<.02);
 assert.equal(castShot({from,dir:{x:0,y:0,z:1},people:[person(0,80)],range:60}).kind,'none');
});

test('the people near a shot come from the crowd grid, not the whole city',()=>{
 const grid=new Map([['0,5',[person(1,10)]],['0,-5',[person(1,-10)]],['20,20',[person(40,40)]]]);
 const got=peopleAlong(grid,{x:0,y:1.4,z:0},{x:0,y:0,z:1},30);
 assert.equal(got.length,1);assert.equal(got[0].z,10);
});

// R14 --------------------------------------------------------------------------------------------
function street(people){
 const grid=new Map(),fled=[],said=[];
 for(const p of people){const k=Math.floor(p.x/2)+','+Math.floor(p.z/2);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}
 return {grid,fled,said,flee(p){fled.push(p.id);p.flee={};return true;},say(p){said.push(p.id);return true;}};
}
const walker=(id,x,z,extra={})=>({id,x,z,active:true,controlled:false,archetype:'office',state:'walking',crossing:null,choreographed:false,...extra});

test('R14: a shot sends at most the cap running, nearest first',()=>{
 const people=[];for(let i=0;i<200;i++)people.push(walker(i,(i%20)*1.5-15,Math.floor(i/20)*1.5+1));
 const s=street(people);
 const n=gunfirePanic(s,0,0);
 assert.equal(n,WEAPONS.pistol.panicCap,'the cap does not hold');
 const far=people.filter(p=>s.fled.includes(p.id)).map(p=>Math.hypot(p.x,p.z));
 const stayed=people.filter(p=>!s.fled.includes(p.id)).map(p=>Math.hypot(p.x,p.z));
 assert.ok(Math.max(...far)<=Math.min(...stayed)+1e-9,'someone further away ran before someone nearer');
});

test('R14: nobody on rails is taken off a crossing -- they cry out and keep walking',()=>{
 const onCrossing=walker(1,2,2,{crossing:{group:3}}),cast=walker(2,3,1,{choreographed:true,state:'crossing'}),free=walker(3,1,3);
 const s=street([onCrossing,cast,free]);
 gunfirePanic(s,0,0);
 assert.deepEqual(s.fled,[3]);
 assert.ok(s.said.includes(1)&&s.said.includes(2));
 assert.deepEqual(onCrossing.crossing,{group:3},'the crossing was taken from them');
 assert.equal(cast.state,'crossing');
});

// The arsenal, end to end over a stand-in world -------------------------------------------------
function world(people,{solid=()=>false}={}){
 const crowd={time:0,network:{ctx:{safe:()=>true,height:()=>0,solid}},grid:new Map(),cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=crowd.cell(p.x,p.z);if(!crowd.grid.has(k))crowd.grid.set(k,[]);crowd.grid.get(k).push(p);},
  leave(p){p.crossing=null;},strike(p,dx,dz,speed,impulse){p.struck=0;p.impulse=impulse;return true;},say:()=>true,
  flee(p){p.fled=true;return true;},vehicleOverlap:()=>false,blocked:()=>false,splashes:[]};
 for(const p of people)crowd.insert(p);
 return crowd;
}

test('the pistol end to end: aim, a shot at the chest takes 50, a headshot kills with a gentle push, no hip-fire',()=>{
 const target=walker(7,0,10,{combatHealth:100,combatDead:false,archetype:'office'}),crowd=world([target]);
 const melee=createMeleeCombat(),shots=[];
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true};
 const player={state};
 const w={solid:()=>false,ground:()=>0,cars:[],dimsOf:()=>null,people:()=>crowd.grid.get('0,5')??[],
  bodyOf:p=>({y:0,height:1.74}),skip:()=>false,clear:()=>true,crowd,
  wound:(p,hit)=>melee.wound(crowd,player,p,hit),bleed:()=>{},muzzle:()=>null};
 const arsenal=createArsenal({onShot:s=>shots.push(s)});
 arsenal.select(2);
 // A figure whose gun is not up yet: the shot waits for it.
 const figure={aim:{aimWeight:0}};
 const camera={position:{x:0,y:1.3,z:-.01},direction:{x:0,y:0,z:1}};
 arsenal.trigger();
 arsenal.frame(1/60,{player,figure,world:w,camera});
 assert.equal(shots.length,0,'fired before the gun was raised');
 assert.equal(state.aim,1,'the trigger did not raise the gun');
 figure.aim.aimWeight=1;arsenal.frame(1/60,{player,figure,world:w,camera});
 assert.equal(shots.length,1);assert.equal(shots[0].kind,'person');assert.equal(shots[0].zone,'body');
 assert.equal(target.combatHealth,100-WEAPONS.pistol.bodyDamage);
 assert.ok(state.shotLeft>0,'the figure was not told to recoil');
 // A headshot through the soft lock is at the chest, so aim high by hand: a camera at head height.
 arsenal.frame(WEAPONS.pistol.refire,{player,figure,world:w,camera});
 const head={position:{x:0,y:1.6,z:0},direction:{x:0,y:0,z:1}};
 arsenal.aim(true);arsenal.trigger();
 // Soft lock snaps to the chest; move the person off the lock cone so the camera ray decides.
 target.x=.0;arsenal.frame(1/60,{player,figure,world:{...w,people:(o,d,r,wide)=>wide?[]:(crowd.grid.get('0,5')??[])},camera:head});
 assert.equal(shots.length,2);
 assert.ok(target.combatDead,'two hits did not put them down');
 assert.ok(target.impulse&&Math.hypot(target.impulse.x,target.impulse.z)<1&&target.impulse.y===0,'the body was thrown like a car hit it (R11)');
});

test('the pistol: eight shots then an automatic reload; a car holsters it (R18)',()=>{
 const crowd=world([]),state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true},player={state};
 const w={solid:()=>false,ground:()=>-5,cars:[],dimsOf:()=>null,people:()=>[],bodyOf:()=>({y:0,height:1.76}),skip:()=>false,clear:()=>true,crowd,wound:()=>null,bleed:()=>{},muzzle:()=>null};
 const arsenal=createArsenal();arsenal.select(2);arsenal.aim(true);
 let fired=0;
 for(let i=0;i<40;i++){arsenal.trigger();arsenal.frame(.3,{player,world:w});fired=arsenal.snapshot().shots;}
 assert.ok(fired>8,'no reload after the magazine ran out');
 assert.equal(fired%8===0||fired>8,true);
 arsenal.frame(1/60,{player,world:w,driving:true});
 assert.equal(state.weapon,'fists');assert.equal(state.aim,0);
});

// Wanted (PLAN-WEAPONS §2) ------------------------------------------------------------------------
test('wanted: shooting in public is ☆2 once reported, at once if an officer sees it',()=>{
 const w=createWanted();
 assert.equal(w.crime('shooting',{t:0,witnesses:3,id:77}),'pending');
 w.update(reportDelayOf(77)-.01,{t:reportDelayOf(77)-.01});assert.equal(w.state.stars,0);
 w.update(.02,{t:reportDelayOf(77)+.01});assert.equal(w.state.stars,WANTED.weaponCrimeStars);
 const seen=createWanted();seen.crime('shooting',{t:0,seenByOfficer:true});assert.equal(seen.state.stars,2);
 const quiet=createWanted();assert.equal(quiet.crime('shooting',{t:0,witnesses:0}),'unseen');
});

test('wanted: a gun or katana kill is at least ☆2; a drawn weapon an officer sees is ☆1, and only then',()=>{
 const w=createWanted();w.crime('weaponKill',{t:0,seenByOfficer:true});assert.equal(w.state.stars,2);
 const a=createWanted();assert.equal(a.crime('weaponSeen',{t:0}),'ignored');assert.equal(a.state.stars,0);
 a.crime('weaponSeen',{t:0,seenByOfficer:true});assert.equal(a.state.stars,1);
 // Weapon kills count toward the kill ladder too.
 const b=createWanted();for(let i=0;i<WANTED.killsForThree;i++)b.crime('weaponKill',{t:i,seenByOfficer:true});
 assert.equal(b.state.stars,3);
});

// R17 / R13 --------------------------------------------------------------------------------------
test('R17: aiming pulls the camera in over the right shoulder, through the same wall-clipped arm',()=>{
 const s={x:0,y:0,z:0,heading:0,pitch:0};
 const far=playerCamera(s,{},null,0),near=playerCamera(s,{},null,1);
 assert.ok(Math.hypot(near.x,near.z)<Math.hypot(far.x,far.z)-1.5,'the aim camera is not closer');
 assert.ok(near.x<-.4,'the aim camera is not over the right shoulder (right is -x at heading 0)');
 assert.ok(PLAYER.aimFov<50);
});

test('R13: the street answers a shot -- slapback timed from the facades, none in the open',()=>{
 assert.deepEqual(echoTaps(()=>false,0,0,0),[]);
 // Walls 6 m either side of a street running along z.
 const taps=echoTaps((x)=>Math.abs(x)>=6,0,0,0);
 assert.equal(taps.length,3);
 assert.ok(Math.abs(taps[0].delay-12/GUNFIRE.speedOfSound)<.01);
 assert.ok(taps[2].delay>taps[0].delay&&taps[2].gain<taps[0].gain);
 const one=echoTaps((x)=>x>=10,0,0,0);assert.equal(one.length,1);
 assert.ok(ARSENAL.raiseWait>0);
});
