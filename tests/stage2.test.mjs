// Roadmap stage 2: people answer a weapon -- hands up at gunpoint, a leg wound limps and then
// crawls, a few carry a gun and shoot back -- and the bodies that show it (hands up, the limp,
// the crawl, the katana held in both hands while walking, a falling body stopped by walls and cars).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createStreetReactions,isArmed,legWound,woundedPace,civilianHitChance,REACT} from '../src/life/street-reactions.mjs';
import {BODY} from '../src/player/body-states.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

/** A crowd stand-in: people in a pool, a clock, and flee() recording who ran. */
function crowdOf(people){
 const fled=[];
 return {time:0,pool:people.map((p,id)=>({id,active:true,archetype:'adult',x:0,z:0,heading:0,...p})),fled,
  flee(p,ax,az,opts){fled.push({id:p.id,ax,az,opts});p.fleeing=true;return true;}};
}
// The owner's rule after stage 6: nobody on the street is armed (REACT.armedShare 0). The machinery
// is still tested, at the share it was built with.
const SHARE=.05;
const unarmedId=()=>{for(let id=0;;id++)if(!isArmed({id,archetype:'adult'},SHARE))return id;};
const armedId=()=>{for(let id=0;;id++)if(isArmed({id,archetype:'adult'},SHARE))return id;};

test('a few adults are armed, fixed by id; never a child, never an officer',()=>{
 let n=0;for(let id=0;id<4000;id++)if(isArmed({id,archetype:'adult'},SHARE))n++;
 assert.ok(Math.abs(n/4000-SHARE)<.015,`share ${n/4000}`);
 assert.equal(REACT.armedShare,0,'by default nobody is armed');let d=0;for(let id=0;id<4000;id++)if(isArmed({id,archetype:'adult'}))d++;assert.equal(d,0);
 const id=armedId();
 assert.ok(isArmed({id,archetype:'adult'},SHARE)&&isArmed({id,archetype:'adult'},SHARE),'the same person, every time');
 assert.ok(!isArmed({id,archetype:'kid'},SHARE));assert.ok(!isArmed({id,archetype:'adult',officer:true},SHARE));
});

test('at gunpoint: hands up facing the gun, held while aimed, then they run -- and give up holding after a while',()=>{
 const id=unarmedId(),people=[];people[id]={x:0,z:8,heading:0};
 const crowd=crowdOf(Array.from({length:id+1},(_,i)=>people[i]??{active:false}));
 const r=createStreetReactions({armedShare:SHARE}),me={x:0,z:0,alive:true};
 const p=crowd.pool[id];
 for(let t=0;t<1;t+=.1){crowd.time=t;r.update(.1,{crowd,me,aimedId:id});}
 assert.ok(p.handsUpUntil>crowd.time,'hands up');
 assert.ok(Math.abs(Math.atan2(Math.sin(p.heading-Math.PI),Math.cos(p.heading-Math.PI)))<1e-6,'facing the gun (the player is at -z)');
 assert.equal(crowd.fled.length,0);
 for(let t=1;t<1+REACT.handsUpHold+.2;t+=.1){crowd.time=t;r.update(.1,{crowd,me,aimedId:null});}
 assert.equal(crowd.fled.length,1,'the aim left: they run');
 assert.ok(crowd.fled[0].az>0,'away from the player');
 // Held long enough, they break and run even under the gun.
 const q=crowdOf([{x:0,z:5}]),r2=createStreetReactions({armedShare:SHARE}),qid=unarmedId();
 q.pool.length=0;for(let i=0;i<=qid;i++)q.pool.push({id:i,active:i===qid,archetype:'adult',x:0,z:5,heading:0});
 for(let t=0;t<REACT.giveUp+1;t+=.1){q.time=t;r2.update(.1,{crowd:q,me,aimedId:qid});}
 assert.equal(q.fled.length,1,'they gave up standing there');
 assert.equal(r2.stats.gaveUp,1);
 // Too far to see the muzzle: nothing.
 const far=crowdOf([{x:0,z:40}]);far.pool[0].id=qid;far.pool.length=0;for(let i=0;i<=qid;i++)far.pool.push({id:i,active:true,archetype:'adult',x:0,z:40});
 createStreetReactions({armedShare:SHARE}).update(.1,{crowd:far,me,aimedId:qid});assert.ok(!(far.pool[qid].handsUpUntil>0));
});

test('a leg wound limps; a second, or a bad one, puts them on the ground crawling',()=>{
 const p={combatHealth:75};
 assert.equal(legWound(p),'limping');assert.equal(woundedPace(p),REACT.limpSpeed);
 assert.equal(legWound(p),'crawling');assert.equal(woundedPace(p),REACT.crawlSpeed);
 const q={combatHealth:40};assert.equal(legWound(q),'crawling','badly hurt: down at once');
 assert.equal(woundedPace({}),1);
});

test('the armed draw when provoked and fire from where they stand, only with a line to the player, less surely than the police',async()=>{
 const id=armedId(),pool=[];for(let i=0;i<=id;i++)pool.push({active:i===id,x:0,z:12,heading:0});
 const crowd=crowdOf(pool),r=createStreetReactions({armedShare:SHARE}),me={x:0,z:0,y:0,alive:true};
 // A shot nearby: they draw.
 r.update(.1,{crowd,me,shotAt:{x:0,z:1}});
 const p=crowd.pool[id];
 assert.ok(p.gunDrawn,'drawn');assert.equal(crowd.fled.length,0,'they do not run');
 let shots=[];
 for(let t=.1;t<8;t+=.1){crowd.time=t;shots.push(...r.update(.1,{crowd,me}));}
 assert.ok(shots.length>=3&&shots.length<=8,`${shots.length} rounds in 8 s`);
 assert.ok(shots.every(s=>s.kind==='shot'&&s.civilian&&s.officer===p));
 assert.ok(shots[0].from.z>p.z-1&&shots[0].from.z<p.z,'from their hands, toward the player');
 // A wall between: no shots.
 const r2=createStreetReactions({armedShare:SHARE}),c2=crowdOf(pool.map(x=>({...x})));
 r2.provoke(c2.pool[id]);let blocked=[];
 for(let t=0;t<5;t+=.1){c2.time=t;blocked.push(...r2.update(.1,{crowd:c2,me,solid:(x,z)=>z>5&&z<6}));}
 assert.equal(blocked.length,0);assert.ok(r2.stats.blocked>0);
 const {hitChance}=await import('../src/police/guns.mjs');
 for(const d of [2,10,25])assert.ok(civilianHitChance(d)<hitChance(d),`at ${d} m a civilian is no better a shot than an officer`);
 // Dead: holstered, and nothing more.
 p.combatDead=true;crowd.time=9;assert.deepEqual(r.update(.1,{crowd,me}),[]);assert.equal(p.gunDrawn,false);
});

test('the armed, aimed at, draw rather than put their hands up',()=>{
 const id=armedId(),pool=[];for(let i=0;i<=id;i++)pool.push({active:i===id,x:0,z:6});
 const crowd=crowdOf(pool),r=createStreetReactions({armedShare:SHARE});
 r.update(.1,{crowd,me:{x:0,z:0,alive:true},aimedId:id});
 assert.ok(crowd.pool[id].gunDrawn);assert.ok(!(crowd.pool[id].handsUpUntil>0));
});

test('hands up on the body: both hands above the head, in front of the face',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['revolver']});
 const state={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 state.handsUp=true;for(let i=0;i<20;i++)figure.update(state,1/30);
 figure.root.updateMatrixWorld(true);
 const head=figure.root.getObjectByName('Head').getWorldPosition(new Vector3());
 for(const side of ['hand_l','hand_r']){const h=figure.root.getObjectByName(side).getWorldPosition(new Vector3());
  assert.ok(h.y>head.y-.05,`${side} at ${h.y.toFixed(2)}, the head at ${head.y.toFixed(2)}`);
  assert.ok(Math.abs(h.x)>.12&&Math.abs(h.x)<.45,`${side} beside the head (x ${h.x.toFixed(2)})`);}
 state.handsUp=false;for(let i=0;i<20;i++)figure.update(state,1/30);
 const h=figure.root.getObjectByName('hand_r').getWorldPosition(new Vector3());
 assert.ok(h.y<1.1,'and down again');
 figure.dispose();
});

test('a limp keeps the wounded knee nearly straight and tips the trunk; a crawl is on the ground',async()=>{
 const figure=createPlayerFigure(await humanoid());
 const walk={x:0,y:0,z:0,speed:1.2,heading:0,bodyHeading:0,alive:true,attackTime:0};
 const knee=()=>{const c=figure.root.getObjectByName('calf_r');return 2*Math.acos(Math.min(1,Math.abs(c.quaternion.w)));};
 let bendWalk=0;for(let i=0;i<60;i++){walk.x+=1.2/30;figure.update(walk,1/30);bendWalk=Math.max(bendWalk,knee());}
 walk.limp=true;let bendLimp=0;for(let i=0;i<60;i++){walk.x+=.5/30;walk.speed=.5;figure.update(walk,1/30);if(i>15)bendLimp=Math.max(bendLimp,knee());}
 assert.ok(bendLimp<bendWalk*.7,`limping, the knee bends ${bendLimp.toFixed(2)} rad against ${bendWalk.toFixed(2)} walking`);
 walk.limp=false;walk.crawling=true;walk.speed=.3;
 for(let i=0;i<60;i++){walk.z+=.3/30;figure.update(walk,1/30);}
 figure.root.updateMatrixWorld(true);
 const head=figure.root.getObjectByName('Head').getWorldPosition(new Vector3()),pelvis=figure.root.getObjectByName('pelvis').getWorldPosition(new Vector3());
 assert.ok(head.y<.6&&pelvis.y<.5,`on the ground: head ${head.y.toFixed(2)}, pelvis ${pelvis.y.toFixed(2)}`);
 assert.ok(head.y>.05&&pelvis.y>.02,'but not through it');
 assert.ok(head.z>pelvis.z+.3,'head first, the way they crawl');
 assert.equal(figure.action,'Crawl');
 figure.dispose();
});

test('the katana stays in both hands while walking (the guard held over the walk)',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana','smg']});
 const s={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'katana'};
 for(let i=0;i<40;i++)figure.update(s,1/30);
 const gap=()=>{figure.root.updateMatrixWorld(true);return figure.root.getObjectByName('hand_l').getWorldPosition(new Vector3())
  .distanceTo(figure.root.getObjectByName('hand_r').getWorldPosition(new Vector3()));};
 const still=gap();
 s.speed=1.4;let worst=0;for(let i=0;i<60;i++){s.z+=1.4/30;figure.update(s,1/30);if(i>10)worst=Math.max(worst,gap());}
 assert.ok(worst<still+.12,`walking, the hands stay together on the handle (${worst.toFixed(2)} m apart; ${still.toFixed(2)} standing)`);
 figure.dispose();
});

test('stage 2 numbers are sane',()=>{
 assert.ok(BODY.handsUp.left[0]>0&&BODY.handsUp.right[0]<0,'left is +X');
 assert.ok(REACT.crawlSpeed<REACT.limpSpeed&&REACT.limpSpeed<1);
});

test('a falling body is stopped by a wall and by a car, not passed through',async()=>{
 const {setRagdollWorld}=await import('../src/player/ragdoll.mjs');
 const fall=async(world)=>{
  const figure=createPlayerFigure(await humanoid());
  const s={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0};
  for(let i=0;i<20;i++)figure.update(s,1/30);
  setRagdollWorld(world);
  s.ragdoll={seq:1,dir:{x:0,z:1},zone:'body',strength:1.5,push:{x:0,y:.4,z:3.5},ground:0};
  let far=-Infinity;const p=new Vector3();
  for(let i=0;i<90;i++){figure.update(s,1/30);figure.root.updateMatrixWorld(true);
   figure.root.traverse(o=>{if(o.isBone){o.getWorldPosition(p);far=Math.max(far,p.z);}});}
  const hits=figure.ragdoll.hits;figure.dispose();setRagdollWorld({});return {far,hits};
 };
 const open=await fall({});
 assert.ok(open.far>1.0,`with nothing in the way it goes down ${open.far.toFixed(2)} m along the push`);
 const wall=await fall({solid:(x,z)=>z>.5});
 assert.ok(wall.far<.62,`a wall at 0.5 m stops it (${wall.far.toFixed(2)})`);assert.ok(wall.hits.walls>0);
 const car=await fall({cars:[{x:0,z:1.6,y:0,heading:Math.PI/2,width:1.8,length:4.6,height:1.45}]});
 assert.ok(car.far<.78,`a car side at 0.7 m stops it (${car.far.toFixed(2)})`);assert.ok(car.hits.cars>0);
});

test('the simulation holds a surrendering or shooting person in place and slows the wounded',async()=>{
 const {woundedPace}=await import('../src/life/street-reactions.mjs');
 const src=readFileSync('src/life/simulation.mjs','utf8');
 assert.match(src,/handsUpUntil>this\.time\|\|p\.shooterUntil>this\.time/,'hold on hands up / shooting');
 assert.match(src,/f\.speed\*woundedPace\(p\)/,'fleeing wounded are slower');
 assert.match(src,/p\.baseSpeed\*woundedPace\(p\)/,'walking wounded are slower');
 assert.equal(woundedPace({limp:true,crawling:true}),REACT.crawlSpeed);
});
