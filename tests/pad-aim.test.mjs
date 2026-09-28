// Owner's plan, item 3: the Switch Pro Controller's GTA aim -- ZL raises the gun and locks onto
// the nearest person in view (chest), a right-stick flick switches target (←/→) or goes to the
// head (↑), ZR attacks, and a gun never goes off on ZR without ZL. Letting go of ZL unlocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputMap,flickOf,BUTTON,INPUT,controlHints} from '../src/player/input-map.mjs';
import {createArsenal,lockCandidates,ARSENAL} from '../src/player/arsenal.mjs';
import {WEAPONS} from '../src/player/weapons.mjs';

const pad=()=>({id:'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',mapping:'standard',connected:true,axes:[0,0,0,0],
 buttons:Array.from({length:18},()=>({pressed:false,value:0}))});
const press=(p,name,v=1)=>{p.buttons[BUTTON[name]]={pressed:v>.5,value:v};};

test('item 3: a right-stick flick is reported once, and again only after the stick comes back',()=>{
 assert.deepEqual(flickOf(.9,0,true),{flick:'right',armed:false});
 assert.deepEqual(flickOf(-.9,.1,true),{flick:'left',armed:false});
 assert.deepEqual(flickOf(0,-.9,true),{flick:'up',armed:false},'up is the stick pushed away');
 assert.deepEqual(flickOf(0,.9,true),{flick:'down',armed:false});
 assert.equal(flickOf(.9,0,false).flick,null,'held out, it does not repeat');
 assert.equal(flickOf(.5,0,true).flick,null,'a small push is not a flick');
 const map=createInputMap(),p=pad();
 p.axes[2]=.95;assert.equal(map.poll(p,1/60,'foot').flick,'right');
 assert.equal(map.poll(p,1/60,'foot').flick,null,'held: once');
 p.axes[2]=0;map.poll(p,1/60,'foot');p.axes[2]=.95;assert.equal(map.poll(p,1/60,'foot').flick,'right','back to rest and out again: again');
 p.axes[2]=0;map.poll(p,1/60,'car');p.axes[2]=.95;assert.equal(map.poll(p,1/60,'car').flick,null,'no flicks in a car');
 assert.ok(INPUT.flick>INPUT.rest);
});

test('item 3: the Pro Con hint names ZL for the lock-on and ZR for the attack',()=>{
 const h=controlHints('switch');
 assert.match(h,/ZL 構える・ロックオン/);assert.match(h,/ZR 攻撃/);assert.match(h,/右スティック弾き/);
});

// A street of stand-ins, looked at from the origin along +z (the screen's right is world -x).
function scene(spots){
 const people=spots.map(([x,z],i)=>({id:i+1,x,z,active:true,controlled:false,archetype:'office',state:'walking',combatHealth:100}));
 const hits=[];
 const crowd={time:0,grid:new Map(),flee:()=>false,say:()=>true};
 const w={solid:()=>false,ground:()=>0,cars:[],dimsOf:()=>null,people:()=>people.filter(p=>p.active),bodyOf:()=>({y:0,height:1.76}),
  skip:p=>!p.active,clear:()=>true,crowd,wound:(p,hit)=>{hits.push({id:p.id,head:hit.head});return 'hit';},bleed:()=>{},muzzle:()=>null};
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true};
 const camera={position:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}};
 return {people,hits,w,state,player:{state},camera};
}
const step=(a,sc,dt=1/60)=>a.frame(dt,{player:sc.player,world:sc.w,camera:sc.camera,pad:true});

test('item 3: ZR without ZL fires no gun (pistol or automatic) and throws no punch; with ZL it fires',()=>{
 const sc=scene([[0,10]]),a=createArsenal();a.select(2);
 assert.equal(a.trigger({pad:true}),true,'the press is taken (no punch instead)');
 for(let i=0;i<30;i++)step(a,sc);
 assert.equal(a.snapshot().shots,0,'the pistol went off on ZR alone');
 assert.equal(sc.state.aim,0,'ZR alone raised the gun');
 a.select(4);a.hold(true,{pad:true});a.trigger({pad:true});
 for(let i=0;i<60;i++)step(a,sc);
 assert.equal(a.snapshot().shots,0,'the automatic went off on ZR alone');
 // ZL now, ZR still held: the automatic fires.
 a.aim(true,{pad:true});
 for(let i=0;i<60;i++)step(a,sc);
 assert.ok(a.snapshot().shots>3,'held ZR with ZL did not fire the automatic');
 a.hold(false,{pad:true});a.aim(false,{pad:true});
 // The fists: ZR is a punch -- trigger() is not the arsenal's (false), so the melee takes it.
 a.select(1);assert.equal(a.trigger({pad:true}),false);
 // The mouse keeps its own rule: a click raises and fires.
 const m=scene([[0,10]]),b=createArsenal();b.select(2);b.trigger();
 for(let i=0;i<5;i++)b.frame(1/60,{player:m.player,world:m.w,camera:m.camera});
 assert.equal(b.snapshot().shots,1);
});

test('item 3 / ④: ZL locks the nearest person in view, at the chest; the round finds them',()=>{
 // ④: nearest first (12 m, a little off centre) over one further on the centre line (15 m);
 // the one at 8,6 is out of the view.
 const sc=scene([[-.5,15],[3,12],[8,6]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);
 assert.deepEqual([a.lock?.id,a.lock?.part],[2,'chest']);
 assert.ok(Math.abs(sc.state.aimTarget.y-ARSENAL.chest)<1e-9);
 a.trigger({pad:true});step(a,sc);
 assert.deepEqual(sc.hits,[{id:2,head:false}]);
 // A flick up: the head.
 a.lockFlick('up');step(a,sc,WEAPONS.pistol.refire);
 assert.equal(a.lock.part,'head');a.trigger({pad:true});step(a,sc);
 assert.deepEqual(sc.hits.at(-1),{id:2,head:true},'the head lock did not take a headshot');
 a.lockFlick('down');step(a,sc);assert.equal(a.lock.part,'chest');
 // Let go of ZL: unlocked.
 a.aim(false,{pad:true});step(a,sc);assert.equal(a.lock,null);assert.equal(sc.state.aim,0);
});

test('item 3: a flick right takes the next person to the right, left the next to the left; none past the end',()=>{
 // Looking along +z, the screen's right is world -x.
 const sc=scene([[0,12],[-4,12],[-8,12],[4,12]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 const bearing=id=>lockCandidates(sc.state,sc.camera,sc.w).find(c=>c.p.id===id).bearing;
 assert.ok(bearing(2)>0&&bearing(4)<0,'the bearing sign is not the screen\'s right');
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,2);
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,3);
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,3,'past the last one it stays');
 a.lockFlick('left');step(a,sc);a.lockFlick('left');step(a,sc);a.lockFlick('left');step(a,sc);assert.equal(a.lock.id,4);
 assert.equal(a.snapshot().switchedLocks,5);
});

test('item 3: the lock holds as they move, retakes when they drop, and ignores kids and the dead',()=>{
 const sc=scene([[0,10],[2,14]]),a=createArsenal();a.select(2);
 sc.people.push({id:9,x:0,z:4,active:true,controlled:false,archetype:'kid'});
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1,'a kid was locked');
 // They walk off across the view: still them (the camera keeps them in, in the scene).
 sc.people[0].x=-6;step(a,sc);assert.equal(a.lock.id,1);
 sc.people[0].combatDead=true;step(a,sc);assert.equal(a.lock.id,2,'no retake after the target dropped');
 sc.people[1].x=80;step(a,sc);assert.equal(a.lock,null,'held a lock out of range');
});

test('item 3: the gyro turned past the break lets go into free aim until ZL again; the mouse never hard-locks',()=>{
 const sc=scene([[0,10]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 a.lockGyro(.02,0);step(a,sc);assert.equal(a.lock.id,1,'a small turn broke the lock');
 a.lockGyro(ARSENAL.gyroBreak,0);step(a,sc);assert.equal(a.lock,null);
 step(a,sc);assert.equal(a.lock,null,'retaken while the gyro is aiming');
 assert.equal(sc.state.aim,1,'free aim put the gun down');
 a.aim(false,{pad:true});a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1,'ZL again did not lock');
 const m=scene([[0,10]]),b=createArsenal();b.select(2);b.aim(true);
 b.frame(1/60,{player:m.player,world:m.w,camera:m.camera});assert.equal(b.lock,null,'the mouse hard-locked');
});

// Roadmap ④: shooters first, ZL re-pressed to cycle, the next shooter taken when one drops.
import {lockOrder,threatTier} from '../src/player/arsenal.mjs';
import {SHOOTER_MEMORY} from '../src/police/director.mjs';

test('④: the order is shooters, then drawn guns, then the rest -- each nearest first',()=>{
 const P=(id,tier,dist,angle=0)=>({p:{id},tier,dist,angle});
 const order=lockOrder([P(1,2,5),P(2,0,30),P(3,1,10),P(4,0,12),P(5,2,4,.5)]).map(c=>c.p.id);
 assert.deepEqual(order,[4,2,3,1,5],'8 m per radian off the view: 4 m at 0.5 rad counts as 8 m');
 assert.equal(threatTier({shotAtPlayerLeft:1}),0);assert.equal(threatTier({gunDrawn:true}),1);assert.equal(threatTier({}),2);
 assert.ok(SHOOTER_MEMORY>=3,'a shooter is forgotten too soon to be picked');
});

test('④: chased, ZL takes the officer shooting -- even off to the side and further than a pedestrian',()=>{
 const sc=scene([[0,6],[-20,15],[25,25]]),a=createArsenal();a.select(2);
 Object.assign(sc.people[1],{officer:true,shotAtPlayerLeft:4});   // 55° to the right, 25 m
 Object.assign(sc.people[2],{officer:true,gunDrawn:true});        // 45° left, 35 m
 a.aim(true,{pad:true});step(a,sc);
 assert.equal(a.lock.id,2,'the pedestrian in front was taken over the officer firing');
 assert.equal(a.lock.tier,0);
 // The shooter drops: the lock goes to the next threat, ZL still held -- ZR keeps firing.
 sc.people[1].combatDead=true;step(a,sc);assert.equal(a.lock.id,3);
 sc.people[2].combatDead=true;step(a,sc);assert.equal(a.lock.id,1,'with no threats left, the nearest person');
});

test('④: ZL let go and pressed again within 0.4 s takes the next target; let go longer, it unlocks',()=>{
 const sc=scene([[0,6],[2,10],[-3,14]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 const regrab=()=>{a.aim(false,{pad:true});step(a,sc,.1);assert.equal(a.lock,null,'shown locked with ZL up');a.aim(true,{pad:true});step(a,sc);};
 regrab();assert.equal(a.lock.id,2);
 regrab();assert.equal(a.lock.id,3);
 regrab();assert.equal(a.lock.id,1,'past the last it goes round to the first');
 a.aim(false,{pad:true});step(a,sc,ARSENAL.regrab+.05);a.aim(true,{pad:true});step(a,sc);
 assert.equal(a.lock.id,1,'a late press should lock afresh (the first), not cycle');
 a.aim(false,{pad:true});step(a,sc,.1);a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,2);
});

test('④: held with ZR, the automatic keeps firing from one shooter to the next',()=>{
 const sc=scene([[-3,12],[3,12]]),a=createArsenal();a.select(4);
 for(const p of sc.people)Object.assign(p,{officer:true,shotAtPlayerLeft:5});
 sc.w.wound=(p,hit)=>{sc.hits.push({id:p.id});p.combatDead=true;return 'killed';};
 a.aim(true,{pad:true});a.hold(true,{pad:true});a.trigger({pad:true});
 for(let i=0;i<120;i++)step(a,sc);
 assert.deepEqual([...new Set(sc.hits.map(h=>h.id))].sort(),[1,2],'both shooters were not taken down in turn');
});

test('④: the reticle point is where the lock aims (the scene projects it onto the screen)',()=>{
 const sc=scene([[0,10]]),a=createArsenal();a.select(2);a.aim(true,{pad:true});step(a,sc);
 assert.deepEqual([a.lock.x,a.lock.y,a.lock.z],[0,ARSENAL.chest,10]);
 a.lockFlick('up');step(a,sc);assert.ok(Math.abs(a.lock.y-ARSENAL.head)<1e-9);
});

test('④: held on a pedestrian, the lock moves by itself to someone who starts shooting; ZL again prefers a shooter',()=>{
 const sc=scene([[0,6],[-12,14],[10,12]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 sc.people[1].shotAtPlayerLeft=5;step(a,sc,ARSENAL.threatCheck);step(a,sc);
 assert.equal(a.lock.id,2,'the lock stayed on the pedestrian while an officer fired');
 // The shooter stops being one; a re-press from a pedestrian goes to a new shooter first.
 sc.people[1].shotAtPlayerLeft=0;a.aim(false,{pad:true});step(a,sc,.1);a.aim(true,{pad:true});step(a,sc);
 const held=a.lock.id;sc.people[2].shotAtPlayerLeft=5;
 a.aim(false,{pad:true});step(a,sc,.1);a.aim(true,{pad:true});step(a,sc);
 assert.equal(a.lock.id,3,`from ${held}, ZL again did not go to the one shooting`);
});

test('④: ZL again away from the one shooting is kept (for manualHold), then the lock goes back to them',()=>{
 const sc=scene([[0,8],[3,12]]),a=createArsenal();a.select(2);
 sc.people[0].shotAtPlayerLeft=30;
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 a.aim(false,{pad:true});step(a,sc,.1);a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,2);
 for(let t=0;t<ARSENAL.manualHold-.5;t+=.25)step(a,sc,.25);
 assert.equal(a.lock.id,2,'the chosen target was taken back before manualHold');
 for(let t=0;t<1.5;t+=.25)step(a,sc,.25);
 assert.equal(a.lock.id,1,'after manualHold the lock did not return to the one shooting');
});

test('④: someone firing from behind is taken; a drawn gun behind is not',()=>{
 const sc=scene([[0,8],[1,-15],[-1,-12]]),a=createArsenal();a.select(2);
 sc.people[2].gunDrawn=true;
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1,'a drawn gun behind was taken');
 sc.people[1].shotAtPlayerLeft=5;step(a,sc,ARSENAL.threatCheck);step(a,sc);
 assert.equal(a.lock.id,2,'the one firing from behind was not taken');
});
