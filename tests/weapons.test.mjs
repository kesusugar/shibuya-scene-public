// PLAN-WEAPONS W1: the inventory, the weapon in the hand (R3), and the katana's cut (R4-R6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {SWORD,swordBearing} from '../src/player/attack-timing.mjs';
import {createInventory,WEAPONS,SLOTS,PALM,DRAW} from '../src/player/weapons.mjs';
import {createMeleeCombat,katanaSweep,COMBAT} from '../src/player/combat.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

test('the weapon clips are in the character pack, on the same skeleton',()=>{
 const names=new Set(REPORT.clips.map(c=>c.name));
 for(const n of ['PistolIdle','PistolAimUp','PistolAimNeutral','PistolAimDown','PistolShoot','PistolReload','SwordIdle','SwordAttack','Roll','CrouchWalk'])
  assert.ok(names.has(n),`${n} is missing from citizen.glb`);
 const sword=REPORT.clips.find(c=>c.name==='SwordAttack');
 assert.ok(Math.abs(sword.seconds-SWORD.duration)<.01,'SWORD was measured on a different clip');
});

test('inventory: 1/2/3/4 and the wheel, refused mid-action; a car holsters, stepping out is fists',()=>{
 const inv=createInventory();
 assert.equal(inv.current,'fists');
 assert.deepEqual(SLOTS,['fists','pistol','katana','smg']);
 assert.ok(inv.select(3));assert.equal(inv.current,'katana');
 assert.ok(!inv.select(2,{busy:true}),'a swing in progress must not change weapons');
 assert.equal(inv.current,'katana');
 assert.ok(inv.cycle(1));assert.equal(inv.current,'smg','the submachine gun is after the katana');
 assert.ok(inv.cycle(1));assert.equal(inv.current,'fists','the wheel wraps round');
 assert.ok(inv.cycle(-1));assert.equal(inv.current,'smg');
 assert.ok(!inv.select(4),'already out');assert.ok(inv.select(3));assert.ok(inv.select(4));assert.equal(inv.current,'smg');
 inv.select('pistol');inv.holster();assert.equal(inv.current,'fists','in a car nothing is drawn');
 inv.unholster();assert.equal(inv.current,'fists','out of the car the fists, not the last weapon');
});

test('the pistol: eight rounds, a refire gap, a reload the length of its clip',()=>{
 const inv=createInventory();inv.select('pistol');
 let fired=0;for(let i=0;i<40;i++){if(inv.fire())fired++;inv.update(WEAPONS.pistol.refire+.01);}
 assert.equal(fired,WEAPONS.pistol.magazine);
 assert.ok(!inv.fire(),'an empty magazine fires nothing');
 assert.ok(inv.reload());
 inv.update(WEAPONS.pistol.reloadSeconds-.05);assert.ok(!inv.canFire,'fired mid-reload');
 inv.update(.1);assert.equal(inv.state.rounds,8);
 assert.ok(inv.fire());assert.ok(!inv.fire(),'two shots inside the refire gap');
 const clip=REPORT.clips.find(c=>c.name==='PistolReload');
 assert.ok(Math.abs(clip.seconds-WEAPONS.pistol.reloadSeconds)<.01,'the reload does not follow its clip');
});

test('§9ah the submachine gun: thirty rounds at its own rate, its own magazine, its own reload',()=>{
 const inv=createInventory();inv.select('smg');
 assert.equal(WEAPONS.smg.auto,true);
 let fired=0,t=0,last=0;for(let i=0;i<400;i++){if(inv.fire()){fired++;last=t;}inv.update(.01);t+=.01;}
 assert.equal(fired,WEAPONS.smg.magazine,'an automatic empties its magazine');
 assert.ok(last<(WEAPONS.smg.magazine-1)*(WEAPONS.smg.refire+.01)+.01,`the last round at ${last.toFixed(2)} s: slower than its rate`);
 assert.ok(WEAPONS.smg.refire<.1&&WEAPONS.smg.refire>.06,'about 600-1000 rounds a minute');
 // The pistol's magazine is its own: emptying the submachine gun leaves it full.
 inv.select('pistol');assert.equal(inv.state.rounds,WEAPONS.pistol.magazine);
 inv.select('smg');assert.equal(inv.state.rounds,0);
 assert.ok(inv.reload());inv.update(WEAPONS.smg.reloadSeconds+.01);assert.equal(inv.state.rounds,WEAPONS.smg.magazine);
 assert.ok(!inv.reload(),'a full magazine does not reload');
 // Fists and the katana cannot fire.
 inv.select('katana');assert.ok(!inv.canFire&&!inv.fire());
});

// R3. The grip is attached to hand_r, so it moves with it by construction; what can go wrong is
// the offset -- a gun floating in front of the fingers, or a katana handle through the wrist.
test('R3: the grip stays within 3 cm of the palm through every frame of every weapon clip',async()=>{
 const asset=await humanoid(),dt=1/30;
 for(const [weapon,clips] of [['katana',['SwordIdle','SwordAttack']],['pistol',['PistolIdle','PistolShoot','PistolReload','PistolAimNeutral']]]){
  const figure=createPlayerFigure(asset,undefined,{weapons:['pistol','katana']});
  const hand=figure.root.getObjectByName('hand_r'),palm=new Vector3(),grip=new Vector3();
  const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon};
  figure.update(state,dt);
  let worst=0,frames=0;
  for(const name of clips){
   const clip=figure.root.animations?.find?.(c=>c.name===name)??null;
   // Walk the body through the clip with the game's own update where the game plays it, and
   // otherwise just stand in the weapon stance.
   const seconds=REPORT.clips.find(c=>c.name===name).seconds;
   if(name==='SwordAttack'){state.attackName=name;state.attackDuration=state.attackTime=seconds;}
   for(let t=0;t<=seconds;t+=dt){
    figure.update(state,dt);if(state.attackTime>0)state.attackTime=Math.max(0,state.attackTime-dt);
    figure.root.updateMatrixWorld(true);
    palm.set(...PALM).applyMatrix4(hand.matrixWorld);
    assert.ok(figure.weapons.grip(grip),`${weapon} is not in the hand`);
    worst=Math.max(worst,grip.distanceTo(palm));frames++;
    void clip;
   }
  }
  assert.ok(frames>30);
  assert.ok(worst<=.03,`${weapon}: the grip is ${(worst*100).toFixed(1)} cm from the palm`);
  figure.dispose();
 }
});

test('R3: a stowed weapon rides its bone -- the pistol at the right hip, the katana on the back',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana']});
 const state={x:0,y:0,z:0,speed:1.4,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'fists'};
 const hip=figure.root.getObjectByName('weapon-holstered'),back=figure.root.getObjectByName('weapon-sheathed');
 const pelvis=figure.root.getObjectByName('pelvis'),a=new Vector3(),b=new Vector3();
 let far=0;
 for(let i=0;i<90;i++){figure.update(state,1/30);figure.root.updateMatrixWorld(true);
  hip.getWorldPosition(a);pelvis.getWorldPosition(b);far=Math.max(far,a.distanceTo(b));}
 assert.ok(hip.visible&&back.visible,'fists out: both carried weapons are shown stowed');
 assert.ok(far<.3,`the holstered pistol drifted ${far.toFixed(2)} m from the pelvis while walking`);
 hip.getWorldPosition(a);assert.ok(a.x<0,'the holster is not on the right hip (right is -x)');
 // Behind the chest, whatever the walk's lean does to both.
 back.getWorldPosition(a);figure.root.getObjectByName('spine_03').getWorldPosition(b);
 assert.ok(a.z-b.z<-.05,`the katana is ${(a.z-b.z).toFixed(2)} m from the chest along the facing, not on the back`);
 // Stage 1: drawing is a hand movement -- the hand goes over the shoulder first, and the katana
 // comes out of the scabbard when it gets there (hands.mjs), not on the key press.
 state.weapon='katana';figure.update(state,1/30);
 assert.ok(back.visible&&!figure.root.getObjectByName('weapon-katana').visible,'the katana left the back before the hand reached it');
 for(let t=0;t<DRAW.holster+DRAW.draw;t+=1/30)figure.update(state,1/30);
 assert.ok(!back.visible&&figure.root.getObjectByName('weapon-saya').visible,'a drawn katana leaves its scabbard on the back');
 assert.ok(figure.root.getObjectByName('weapon-katana').visible);
 figure.dispose();
});

test('R4 (b): the katana is two-handed, as the clip is (§9ah, CMU 02_07)',()=>{
 assert.equal(WEAPONS.katana.hands,2);
 assert.equal(SWORD.hand,'right');
});

// R6 ---------------------------------------------------------------------------------------------
test('R6: the cut sweeps only inside its measured window, left to right in front',()=>{
 assert.ok(SWORD.windup>0&&SWORD.activeEnd>SWORD.windup&&SWORD.activeEnd<SWORD.duration);
 // The two-handed cut (§9ah) comes down from high on the left to the right knee.
 assert.ok(SWORD.sweepFrom>0&&SWORD.sweepTo<0,'the cut goes from the left to the right');
 assert.ok(swordBearing(SWORD.windup+.02)<swordBearing(SWORD.windup),'the sweep runs the wrong way');
 assert.ok(SWORD.tipHeight[1]>2&&SWORD.tipHeight[0]<1,'from over the head to below the waist');
 const me={x:0,z:0,heading:0},victim={id:1,x:0,z:1.4};
 assert.equal(katanaSweep(me,0,SWORD.windup-.01,{people:[victim]}).people.length,0,'cut before the window');
 assert.equal(katanaSweep(me,SWORD.activeEnd+.01,SWORD.duration,{people:[victim]}).people.length,0,'cut after the window');
 assert.equal(katanaSweep(me,SWORD.windup,SWORD.activeEnd,{people:[victim]}).people.length,1,'the window missed the person in front');
 const behind={id:2,x:0,z:-1.2},far={id:3,x:0,z:WEAPONS.katana.reach+.2};
 assert.equal(katanaSweep(me,0,SWORD.duration,{people:[behind,far]}).people.length,0,'cut behind, or out of reach');
});

test('R6: a wall in the arc stops the blade there; nobody past it is cut',()=>{
 const me={x:0,z:0,heading:0};
 // A wall on the left-front (the cut starts on the left, +x): x > 0.35, z > 0.
 const solid=(x,z)=>x>.35&&z>0;
 const right={id:1,x:-1.0,z:1.0};
 const r=katanaSweep(me,SWORD.windup,SWORD.activeEnd,{people:[right],solid});
 assert.ok(r.stop,'the blade went through the wall');
 assert.equal(r.stop.what,'wall');
 assert.equal(r.people.length,0,'the cut carried on past the wall to the right');
 const car=katanaSweep(me,SWORD.windup,SWORD.activeEnd,{people:[right],car:(x,z)=>x<-.2&&z>.2});
 assert.equal(car.stop?.what,'car');
});

// The same stand-in crowd as tests/combat.test.mjs and tests/punch-aim.test.mjs.
function crowd(people=[],{solid=()=>false}={}){
 const c={time:0,network:{ctx:{safe:()=>true,height:()=>0,solid}},grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){p.crossing=null;},strike(p){c.leave(p);p.struck=0;return true;},say:()=>true,
  scatter:()=>true,vehicleOverlap:()=>false,blocked:()=>false,flee:()=>true};
 for(const p of people)c.insert(p);return c;
}
const npc=(id,x,z,extra={})=>({id,active:true,controlled:false,choreographed:false,archetype:'adult',state:'walking',
 x,z,renderX:x,renderZ:z,heading:Math.PI,speed:0,crossing:null,combatHealth:100,combatDead:false,...extra});
const player=()=>{const state={x:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,health:100,attackTime:0,hurtTime:0};
 return {state,startAttack(sec,name){state.attackTime=sec;state.attackDuration=sec;state.attackName=name;return true;}};};

test('R6: in combat the katana lands in the window, cuts everyone in the arc, and two cuts put a person down',()=>{
 const a=npc(1,-.5,1.2),b=npc(2,.6,1.1),c=crowd([a,b]),p=player(),events=[];
 const melee=createMeleeCombat({weapon:()=>'katana',onEvent:(k)=>events.push(k)});
 melee.request();
 let first=null;
 for(let t=0;t<SWORD.duration+.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);
  if(first===null&&melee.snapshot().cuts>0)first=t;}
 assert.equal(p.state.attackName,'SwordAttack');
 assert.ok(first!==null,'the cut hit nobody');
 assert.ok(first>=SWORD.windup-1/60&&first<=SWORD.activeEnd+1/60,`cut at ${first.toFixed(3)} s, outside ${SWORD.windup}-${SWORD.activeEnd}`);
 assert.equal(melee.snapshot().cuts,2,'one cut, two people in its arc');
 assert.equal(a.combatHealth,100-WEAPONS.katana.damage);
 assert.ok(events.includes('blade_hit'));
 // Second cut: faster (R5), and both go down. Cut, they stagger back and would run (the owner's
 // rule); here they are cornered where they stood.
 Object.assign(a,{x:-.5,z:1.2});Object.assign(b,{x:.6,z:1.1});
 melee.request();
 for(let t=0;t<SWORD.duration+.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);}
 assert.ok(p.state.attackDuration<SWORD.duration,'every other cut is quicker');
 assert.ok(a.combatDead&&b.combatDead,'two cuts did not put them down');
});

test('R6: in combat a wall stops the cut with a clank, and the clip holds where it struck',()=>{
 const behindWall=npc(1,-.8,1.0),c=crowd([behindWall],{solid:(x,z)=>x>.35&&z>0}),p=player(),events=[];
 const melee=createMeleeCombat({weapon:()=>'katana',onEvent:(k)=>events.push(k)});
 melee.request();
 let held=null;
 for(let t=0;t<SWORD.duration+.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);if(held===null&&Number.isFinite(p.state.attackHold))held=p.state.attackHold;}
 assert.ok(events.includes('blade_clank'),'no clank');
 assert.equal(melee.snapshot().cuts,0,'the blade went through the wall into the person beyond');
 assert.ok(held>SWORD.windup/SWORD.duration-.01&&held<SWORD.activeEnd/SWORD.duration+.01,'the clip did not hold at the strike');
 assert.ok(COMBAT.clankHold>0);
});

test('the fists are unchanged: a punch is still a punch with the fists out',()=>{
 const v=npc(1,0,1.2),c=crowd([v]),p=player(),melee=createMeleeCombat({weapon:()=>'fists'});
 melee.request();for(let t=0;t<1.1;t+=1/60){c.time+=1/60;melee.update(1/60,c,p);}
 assert.equal(melee.snapshot().hits,1);assert.equal(v.combatHealth,75);
 assert.notEqual(p.state.attackName,'SwordAttack');
});
