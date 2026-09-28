// §9ai: hits that land -- the ragdoll a killed near body falls with (H4), and (below) the
// hit-stop, the contact effects and the directional flinch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createRagdoll,RAGDOLL} from '../src/player/ragdoll.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

async function fall(zone,dir={x:0,z:1},push={x:0,y:0,z:0}){
 const figure=createPlayerFigure(await humanoid());
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 const rag=createRagdoll(figure.root);
 assert.ok(rag.ready,'the rig lacks a ragdoll bone');
 const pelvis=figure.root.getObjectByName('pelvis'),head=figure.root.getObjectByName('Head');
 const p0=pelvis.getWorldPosition(new Vector3()),h0=head.getWorldPosition(new Vector3());
 rag.start({dir,zone,push,ground:0});
 let t=0;for(;t<RAGDOLL.maxAwake+.1&&rag.update(1/30);t+=1/30);
 figure.root.updateMatrixWorld(true);
 const p1=pelvis.getWorldPosition(new Vector3()),h1=head.getWorldPosition(new Vector3());
 const out={figure,rag,p0,p1,h0,h1,t};
 return out;
}

for(const zone of ['head','body','legs'])test(`H4: a blow to the ${zone} puts the body on the ground, along the blow, in one piece`,async()=>{
 const {figure,rag,p0,p1,h0,h1,t}=await fall(zone,{x:1,z:0});
 assert.ok(rag.asleep,`still moving after ${t.toFixed(1)} s`);
 // Down: lying, or slumped over the knees (§9ak: a real collapse ends either way), never standing.
 assert.ok(p1.y<.55,`the pelvis is ${p1.y.toFixed(2)} m up: not down`);
 assert.ok(h1.y<.45,`the head is ${h1.y.toFixed(2)} m up: not down`);
 // Along the blow: the head ends further along +x than it started -- or, for a blow to the legs,
 // the legs are taken out along it (and the body comes down the other way, which is right).
 // §9ak: a body collapses rather than being thrown, so "along the blow" is a tip, not a flight.
 if(zone==='legs'){const k=rag.points.calf_l.x+rag.points.calf_r.x;assert.ok(k/2>.05,`the knees moved ${(k/2).toFixed(2)} m along the blow`);}
 else assert.ok(h1.x-h0.x>.2,`the head moved ${(h1.x-h0.x).toFixed(2)} m along the blow`);
 // It goes down where it stood: the pelvis ends within a body's width or so of where it was.
 assert.ok(Math.hypot(p1.x-p0.x,p1.z-p0.z)<.9,`the pelvis travelled ${Math.hypot(p1.x-p0.x,p1.z-p0.z).toFixed(2)} m`);
 for(const s of rag.sticks)assert.ok(Math.abs(s.now-s.rest)<.05*s.rest+.01,`${s.a}-${s.b} stretched to ${s.now.toFixed(3)} from ${s.rest.toFixed(3)}`);
 for(const [name,p] of Object.entries(rag.points)){assert.ok([p.x,p.y,p.z].every(Number.isFinite),name);assert.ok(p.y>=-.001,`${name} under the ground`);}
 // The skeleton follows the points.
 assert.ok(p1.distanceTo(rag.points.pelvis)<.02,'the pelvis bone is not on its point');
 figure.dispose();
});

test('H4: hit from behind the body goes down forward, further than when hit from the front',async()=>{
 // §9ak: a collapse curls the trunk forward whichever way the blow came, so a body shot from the
 // front may still end up forward; the blow only tips it.
 const a=await fall('body',{x:0,z:1}),b=await fall('body',{x:0,z:-1});
 assert.ok(a.h1.z>a.h0.z+.3,`from behind, the head went ${(a.h1.z-a.h0.z).toFixed(2)} m forward`);
 assert.ok(a.h1.z-a.h0.z>b.h1.z-b.h0.z+.2,`from behind ${(a.h1.z-a.h0.z).toFixed(2)} m, from the front ${(b.h1.z-b.h0.z).toFixed(2)} m`);
 a.figure.dispose();b.figure.dispose();
});

test('§9ak: the ragdoll keeps to a human range -- no knee bent backward, no split, no hip far behind',async()=>{
 const asset=await humanoid();
 for(const [zone,dir] of [['body',{x:1,z:0}],['legs',{x:0,z:-1}],['legs',{x:0,z:1}],['head',{x:-1,z:0}]]){
  const figure=createPlayerFigure(asset);const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
  for(let i=0;i<20;i++)figure.update(state,1/30);
  const rag=createRagdoll(figure.root);rag.start({dir,zone,ground:0});
  let worstSplit=0,worstBack=0;
  for(let t=0;t<4&&rag.update(1/30);t+=1/30){
   const P=rag.points,up=P.spine_03.clone().sub(P.pelvis).normalize(),left=P.thigh_l.clone().sub(P.thigh_r);
   left.addScaledVector(up,-left.dot(up)).normalize();const fwd=left.clone().cross(up);
   const tl=P.calf_l.clone().sub(P.thigh_l).normalize(),tr=P.calf_r.clone().sub(P.thigh_r).normalize();
   worstSplit=Math.max(worstSplit,Math.acos(Math.max(-1,Math.min(1,tl.dot(tr)))));
   worstBack=Math.max(worstBack,-tl.dot(fwd),-tr.dot(fwd));
   for(const s of ['l','r']){   // the knee in front of the hip-ankle line (or on it)
    const H=P['thigh_'+s],K=P['calf_'+s],A=P['foot_'+s],e=A.clone().sub(H),k=K.clone().sub(H).dot(e)/e.lengthSq();
    const off=K.clone().sub(H.clone().addScaledVector(e,k)).dot(fwd);
    assert.ok(off>-.03,`${zone}: the ${s} knee bent backward by ${(-off*100).toFixed(1)} cm`);
   }
  }
  // Hip range front-to-back plus side to side: a sprawled fall can reach about 120°, never a split.
  assert.ok(worstSplit<125*Math.PI/180,`${zone}: the legs split ${(worstSplit*180/Math.PI).toFixed(0)}°`);
  assert.ok(worstBack<.5,`${zone}: a thigh went ${(Math.asin(Math.min(1,worstBack))*180/Math.PI).toFixed(0)}° behind the trunk`);
  figure.dispose();
 }
});

// H3 ---------------------------------------------------------------------------------------------
import {createHitReaction,HIT_REACTION} from '../src/player/hit-reaction.mjs';
import {Object3D} from 'three';

async function standing(){
 const figure=createPlayerFigure(await humanoid());
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 return {figure,state};
}
/** Peak displacement of a bone over the reaction, relative to its pose without it. */
async function reaction(zone,dir){
 const {figure,state}=await standing(),r=createHitReaction(figure.root);
 assert.ok(r.ready);
 // The crown: 15 cm above the head bone (which sits on the neck joint and hardly moves when the head tilts).
 const headBone=figure.root.getObjectByName('Head'),crown=new Object3D();crown.name='crown';headBone.add(crown);
 figure.root.updateMatrixWorld(true);crown.position.copy(headBone.worldToLocal(headBone.getWorldPosition(new Vector3()).add(new Vector3(0,.15,0))));
 const at=n=>figure.root.getObjectByName(n).getWorldPosition(new Vector3());
 r.hit({dirX:dir.x,dirZ:dir.z,heading:0,zone,strength:1});
 const peak={};const frames=[];
 for(let i=0;i<45;i++){figure.update(state,1/30);const base={head:at('crown'),knee:at('calf_l'),ankle:at('foot_l'),hip:at('thigh_l'),chest:at('spine_03')};
  r.update(1/30,0);const now={head:at('crown'),knee:at('calf_l'),ankle:at('foot_l'),hip:at('thigh_l'),chest:at('spine_03')};frames.push({base,now});}
 for(const k of ['head','chest'])peak[k]=frames.reduce((m,f)=>Math.abs(f.now[k].z-f.base[k].z)>Math.abs(m.z)?{z:f.now[k].z-f.base[k].z,x:f.now[k].x-f.base[k].x}:m,{z:0,x:0});
 const settled=!r.awake;
 figure.dispose();
 return {peak,frames,settled};
}

test('H3: shot in the head from the front, the head snaps back more than the chest moves',async()=>{
 const {peak,settled}=await reaction('head',{x:0,z:-1});   // travelling toward -z: from the front
 assert.ok(peak.head.z<-.03,`the head moved ${peak.head.z.toFixed(3)} m along the facing`);
 assert.ok(Math.abs(peak.head.z)>2*Math.abs(peak.chest.z),'the chest took the blow, not the head');
 assert.ok(settled,'still moving after 1.5 s');
});

test('§9ak H3: hit in the chest, the trunk curls FORWARD whichever side it came from, with only a small lean along the blow',async()=>{
 for(const dir of [{x:0,z:-1},{x:0,z:1},{x:1,z:0}]){
  const {frames}=await reaction('body',dir);
  const fwd=Math.max(...frames.map(f=>f.now.head.z-f.base.head.z));
  assert.ok(fwd>.04,`from ${JSON.stringify(dir)} the head went ${fwd.toFixed(3)} m forward (no curl)`);
  const back=Math.min(...frames.map(f=>f.now.head.z-f.base.head.z));
  assert.ok(back>-.05,`from ${JSON.stringify(dir)} the trunk was thrown back ${(-back).toFixed(3)} m`);
  if(dir.x){const side=Math.max(...frames.map(f=>f.now.chest.x-f.base.chest.x));assert.ok(side>0&&side<fwd,'the lean along the blow is not small');}
  const last=frames[frames.length-1];assert.ok(last.now.head.distanceTo(last.base.head)<.01,'did not settle');
 }
});

test('§9ak H3: hit in the legs, the knees give -- from the front and from behind (never backward)',async()=>{
 for(const dir of [{x:0,z:-1},{x:0,z:1}]){
  const {frames}=await reaction('legs',dir);
  const knee=f=>{const a=f.hip.clone().sub(f.knee).normalize(),b=f.ankle.clone().sub(f.knee).normalize();return Math.acos(a.dot(b));};
  const straight=knee(frames[0].base),least=Math.min(...frames.map(f=>knee(f.now)));
  assert.ok(least<straight-.12,`from ${JSON.stringify(dir)} the knee went from ${straight.toFixed(2)} to ${least.toFixed(2)} rad`);
 }
});

test('H3: a burst adds up, and the springs stay bounded',()=>{
 const bones={};const root={getObjectByName:n=>bones[n]??=null,updateMatrixWorld(){}};
 const r=createHitReaction(root);
 for(let i=0;i<12;i++)r.hit({dirX:0,dirZ:-1,zone:'body',strength:.6});
 // Without bones the springs still integrate: advance them by hand through angleOf.
 assert.ok(r.hits===12);
 assert.ok(HIT_REACTION.limit<1);
});

// H1 / H2 and the wiring ----------------------------------------------------------------------------
import {createHitStop,victimScale,HIT_STOP} from '../src/player/hit-stop.mjs';
import {createMeleeCombat} from '../src/player/combat.mjs';
import {SWORD} from '../src/player/attack-timing.mjs';
import {castShot} from '../src/player/ballistics.mjs';
import {createWeaponEffects} from '../src/player/weapon-effects.mjs';

test('H1: a landed blow nearly stops the swing for its hit-stop, then time runs on',()=>{
 const h=createHitStop();
 assert.equal(h.scale(1/60),1/60,'no blow, full speed');
 h.hit('katana');
 let run=0;for(let k=0;k<Math.floor(HIT_STOP.katana*120);k++)run+=h.scale(1/120);
 assert.ok(run<HIT_STOP.katana*.1,`the swing ran ${run.toFixed(4)} s through a ${HIT_STOP.katana} s stop`);
 h.scale(1/120);
 assert.ok(Math.abs(h.scale(1/60)-1/60)<1e-9,'did not resume');
 // An automatic's rounds: at most one stop per smgGap, so a burst does not stutter.
 const g=createHitStop();let stops=0;for(let i=0;i<12;i++){if(g.hit('smg'))stops++;g.scale(WEAPONS_REFIRE);}
 assert.ok(stops<=Math.ceil(12*WEAPONS_REFIRE/HIT_STOP.smgGap)+1,`${stops} stops in a 12-round burst`);
 assert.ok(victimScale(1/60,0,.01)<1/60&&victimScale(1/60,1,.5)===1/60);
});
const WEAPONS_REFIRE=.085;

function crowdOf(people){
 const c={time:0,network:{ctx:{safe:()=>true,height:()=>0,solid:()=>false}},grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){p.crossing=null;},strike(p,dx,dz){p.struck=0;const l=Math.hypot(dx,dz)||1;p.flyX=dx/l*2.2;p.flyZ=dz/l*2.2;p.flyY=1.3;p.flyGround=0;return true;},
  say:()=>true,scatter:()=>true,vehicleOverlap:()=>false,blocked:()=>false,flee:()=>true};
 for(const p of people)c.insert(p);return c;
}
const npc=(id,x,z)=>({id,active:true,controlled:false,choreographed:false,archetype:'adult',state:'walking',
 x,z,renderX:x,renderZ:z,heading:Math.PI,speed:0,crossing:null,combatHealth:100,combatDead:false});

test('H1-H4 wiring: a cut marks where and which way it struck, catches the victim, and a kill hands the ragdoll its start',()=>{
 const a=npc(1,0,1.3),c=crowdOf([a]),state={x:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,health:100,attackTime:0,hurtTime:0};
 const player={state,startAttack(sec,name){state.attackTime=sec;state.attackDuration=sec;state.attackName=name;return true;}};
 const melee=createMeleeCombat({weapon:()=>'katana'});
 melee.request();
 for(let t=0;t<SWORD.duration+.1&&!a.hitSeq;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}
 assert.equal(a.hitSeq,1,'no blow recorded');
 assert.ok(['head','body','legs'].includes(a.hitZone));
 assert.ok(a.hitStopUntil>c.time,'the victim does not catch');
 // The blade goes across the body from its left to its right, and away: toward -x and +z here.
 assert.ok(a.hitX<0&&a.hitZ>0,`blow direction ${a.hitX.toFixed(2)},${a.hitZ.toFixed(2)}`);
 assert.ok(!a.ragdoll,'a survivor has no ragdoll');
 for(let t=0;t<SWORD.duration;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}   // the first swing ends
 Object.assign(a,{x:0,z:1.3});   // cut, they would run (the owner's rule); cornered where they stood
 melee.request();
 for(let t=0;t<2*SWORD.duration&&!a.combatDead;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}
 assert.ok(a.combatDead&&a.ragdoll,'the kill gave no ragdoll');
 assert.equal(a.ragdoll.seq,a.hitSeq);
 assert.ok(Math.hypot(a.ragdoll.push.x,a.ragdoll.push.z)>1,'the ragdoll was not given the knock-down push');
});

test('H3: a round below the hips is a hit to the legs (for the reaction; damage still goes by zone)',()=>{
 const p={id:1,x:0,z:10,y:0,height:1.76};
 assert.equal(castShot({from:{x:0,y:.5,z:0},dir:{x:0,y:0,z:1},people:[p]}).part,'legs');
 assert.equal(castShot({from:{x:0,y:1.2,z:0},dir:{x:0,y:0,z:1},people:[p]}).part,'body');
 const head=castShot({from:{x:0,y:1.65,z:0},dir:{x:0,y:0,z:1},people:[p]});
 assert.equal(head.part,'head');assert.equal(head.zone,'head');
 assert.equal(castShot({from:{x:0,y:.5,z:0},dir:{x:0,y:0,z:1},people:[p]}).zone,'body');
 // A round's wound marks the part, lighter for an automatic.
 const q=npc(2,0,5),c=crowdOf([q]),melee=createMeleeCombat();
 melee.wound(c,{state:{x:0,z:0}},q,{damage:25,dir:{x:0,z:1},weapon:'smg',part:'legs'});
 assert.equal(q.hitZone,'legs');assert.equal(q.hitStrength,.6);
});

test('H2: blood is its own pool, sprayed along the blow, and falls',()=>{
 const fx=createWeaponEffects();
 fx.blood(0,1.2,0,{dir:{x:1,y:0,z:0},count:20});
 assert.equal(fx.stats.blood,20);
 const pts=fx.root.getObjectByName('weapon-blood');assert.ok(pts&&pts.visible);
 assert.notEqual(pts.material.blending,fx.root.getObjectByName('weapon-sparks').material.blending,'blood must not glow like sparks');
 for(let i=0;i<12;i++)fx.update(1/30);
 const pos=pts.geometry.attributes.position.array;let sx=0,sy=0,n=0;
 for(let i=0;i<20;i++){if(pos[i*3+1]<-100)continue;sx+=pos[i*3];sy+=pos[i*3+1];n++;}
 assert.ok(n>0&&sx/n>.2,'the spray did not go along the blow');
 assert.ok(sy/n<1.2,'the blood did not fall');
 fx.dispose();
});

test('H4 wiring: a figure told it is a ragdoll falls from where it stood and stops following the state',async()=>{
 const figure=createPlayerFigure(await humanoid());
 const state={x:3,y:0,z:4,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<10;i++)figure.update(state,1/30);
 state.ragdoll={seq:1,dir:{x:1,z:0},zone:'body',push:{x:1,y:0,z:0},ground:0};state.alive=true;
 figure.update(state,1/30);
 assert.ok(figure.ragdoll?.active,'no ragdoll');
 state.x=40;for(let i=0;i<120;i++)figure.update(state,1/30);
 assert.ok(Math.abs(figure.root.position.x-3)<1e-6,'the root followed the state while ragdolling');
 const pelvis=figure.root.getObjectByName('pelvis').getWorldPosition(new Vector3());
 assert.ok(pelvis.y<.35,`the pelvis is ${pelvis.y.toFixed(2)} m up`);
 figure.dispose();
});

// §9aj G1 / G2 --------------------------------------------------------------------------------------
import {createNearCharacters,PRIORITY_RANGE} from '../src/life/near-characters.mjs';
import {createHQLayer} from '../src/life/hq-layer.mjs';

test('G1: the person on the crosshair gets a near body even 45 m out, past everyone nearer',()=>{
 const pool=createNearCharacters('high'),people=[];
 for(let id=0;id<40;id++)people.push({id,active:true,archetype:'adult',x:(id%8)*1.2,z:Math.floor(id/8)*1.2,heading:0,speed:1,
  renderX:(id%8)*1.2,renderZ:Math.floor(id/8)*1.2,height:0,reactionUntil:-1});
 const far={id:99,active:true,archetype:'adult',x:0,z:45,renderX:0,renderZ:45,heading:0,speed:1,height:0,reactionUntil:-1};
 people.push(far);
 let sel;for(let f=0;f<60;f++)sel=pool.update(people,{x:0,z:0},1/60,f/60);
 assert.ok(!sel.has(99),'held at 45 m without being aimed at');
 far.aimedUntil=10;for(let f=60;f<120;f++)sel=pool.update(people,{x:0,z:0},1/60,f/60);
 assert.ok(sel.has(99),'the aimed-at person was not promoted');
 assert.ok(PRIORITY_RANGE>=50);
 // Just hit, the same holds without the aim; and it lets go a while after.
 far.aimedUntil=0;far.hitAt=2;for(let f=120;f<180;f++)sel=pool.update(people,{x:0,z:0},1/60,f/60);
 assert.ok(sel.has(99),'the person just hit was not held');
 for(let f=180;f<600;f++)sel=pool.update(people,{x:0,z:0},1/60,f/60);
 assert.ok(!sel.has(99),'held long after the hit');
 // Killed this instant while NOT held: picked up for the ragdoll. Killed a while ago: left alone.
 far.struck=0;far.combatDead=true;far.ragdoll={seq:1};far.hitAt=10;
 sel=pool.update(people,{x:0,z:0},1/60,10.05);
 assert.ok(sel.has(99),'a fresh kill was not picked up for its ragdoll');
 const old={...far,id:98,hitAt:0};people.push(old);
 sel=pool.update(people,{x:0,z:0},1/60,10.1);
 assert.ok(!sel.has(98),'a body killed long ago was picked up (it would stand up and fall)');
 pool.dispose();
});

test('G2: a body the mass crowd draws falls along the blow, even when the push was slight',()=>{
 const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
 const raw=readFileSync('public/data/crowd/hq-crowd.bin');
 const layer=createHQLayer(manifest,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),{budget:40});
 const people=[];for(let id=0;id<20;id++)people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',
  x:id,z:5,renderX:id,renderZ:5,height:0,heading:0,speed:1.2,crossing:null,queueKey:null,edge:3,route:[3]});
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const p=people[4];
 // A round from the west: the blow travels +x; the push is a gunshot's 0.7 m/s scaled down.
 Object.assign(p,{struck:0,combatDead:true,hitX:1,hitZ:0,flyX:.3,flyZ:0,flyY:0});
 for(let f=1;f<20;f++)layer.sync(people,{x:0,z:0},1/60,{time:f/60});
 const i=layer.crowd.indexOf(p.id),h=layer.crowd.state.heading[i];
 // Facing against the blow (the baked fall goes over backwards): heading atan2(-1, 0) = -pi/2.
 const off=Math.abs(Math.atan2(Math.sin(h+Math.PI/2),Math.cos(h+Math.PI/2)));
 assert.ok(off<.1,`the body faces ${h.toFixed(2)}, not against the blow`);
 layer.dispose();
});

import {createArsenal} from '../src/player/arsenal.mjs';
test('G1: aiming at someone marks them for a detailed body before the round is fired',()=>{
 const target={id:7,active:true,controlled:false,archetype:'office',x:0,z:12,y:0,height:0};
 const crowd={time:5,grid:new Map(),flee:()=>true,say:()=>true};
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true},player={state};
 const world={solid:()=>false,ground:()=>0,cars:[],dimsOf:()=>null,people:()=>[target],bodyOf:()=>({y:0,height:1.76}),
  skip:()=>false,clear:()=>true,crowd,wound:()=>null,bleed:()=>{},muzzle:()=>null};
 const arsenal=createArsenal();arsenal.select(2);arsenal.aim(true);
 arsenal.frame(1/60,{player,world,camera:{position:{x:0,y:1.3,z:0},direction:{x:0,y:0,z:1}}});
 assert.ok(target.aimedUntil>crowd.time,'the person on the crosshair was not marked');
});

import {HQ_LOD} from '../src/life/hq-layer.mjs';
test('G3: the far band is placed every few frames but never falls behind; the near band every frame',()=>{
 const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
 const raw=readFileSync('public/data/crowd/hq-crowd.bin');
 const layer=createHQLayer(manifest,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),{budget:40});
 const walker=(id,z)=>({id,active:true,controlled:false,archetype:'adult',state:'walking',x:0,z,renderX:0,renderZ:z,height:0,heading:0,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});
 const near=walker(1,5),far=walker(2,80),people=[near,far];
 for(let f=0;f<120;f++){for(const p of people){p.z+=1.3/60;p.renderZ=p.z;}layer.sync(people,{x:0,z:0},1/60,{time:f/60});}
 const at=p=>layer.crowd.state.z[layer.crowd.indexOf(p.id)];
 assert.ok(layer.stats.farSkipped>0,'the far band was never skipped');
 assert.ok(Math.abs(at(near)-near.z)<1e-6,'the near citizen lags');
 assert.ok(Math.abs(at(far)-far.z)<=1.3/60*(HQ_LOD.farEvery-1)+1e-6,`the far citizen is ${(far.z-at(far)).toFixed(3)} m behind`);
 layer.dispose();
});
