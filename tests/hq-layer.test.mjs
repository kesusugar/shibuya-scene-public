import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHQLayer,HQ_LOD} from '../src/life/hq-layer.mjs';
import {STATE} from '../src/life/hq-crowd.mjs';
import {appearanceOf} from '../src/life/appearance.mjs';
import {AWARE} from '../src/life/hq-awareness.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

/** A stand-in for the simulation's pool: the fields the layer is allowed to read. */
function pool(count,spread=1.4){
 const out=[];
 for(let id=0;id<count;id++){
  const row=Math.floor(id/40),col=id%40;
  out.push({id,active:true,controlled:false,archetype:'adult',state:'walking',
   x:(col-20)*spread,z:(row-20)*spread,renderX:(col-20)*spread,renderZ:(row-20)*spread,
   height:0,heading:Math.PI,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});
 }
 return out;
}

test('player perception rebuilds the grid on bounded ticks and counts STARTLE as active',()=>{
 const people=pool(600,1);
 const layer=createHQLayer(manifest,bin,{budget:600});
 layer.sync(people,{x:0,z:0},0,{time:0});
 const rebuild=layer.grid.rebuild.bind(layer.grid);
 let rebuilt=0;
 layer.grid.rebuild=c=>{rebuilt++;return rebuild(c);};
 const player={x:0,z:0,heading:0,course:0,speed:5,alive:true};
 for(let i=0;i<60;i++){
  layer.awareness(player,1/60);
  layer.sync(people,{x:0,z:0},1/60,{time:i/60});
 }
 assert.ok(rebuilt>=8&&rebuilt<=15,`rebuilding the entire grid ${rebuilt} times per second`);
 assert.ok(layer.perception.candidates<layer.crowd.population,
  'local awareness queried the entire population');
 const i=layer.crowd.indexOf(people[0].id);
 layer.crowd.setState(i,STATE.STARTLE,{force:true});
 layer.sync(people,{x:0,z:0},0,{time:1});
 assert.ok(layer.inspect().reacting>=1,'STARTLE disappeared from active awareness metrics');
 assert.ok(Number.isFinite(layer.perception.queryMs));
 assert.ok(Number.isFinite(layer.inspect().awarenessGridMs));
 assert.ok(AWARE.radius>0);
 layer.dispose();
});

test('simulation damage overrides HQ recovery and requests formal movement handoff',()=>{
 const people=pool(40,1);
 const left=[];
 const layer=createHQLayer(manifest,bin,{budget:40,onDisown:(id)=>left.push(id)});
 layer.sync(people,{x:0,z:0},0,{time:0});
 const victim=people[0],i=layer.crowd.indexOf(victim.id);
 layer.crowd.setState(i,STATE.RECOVER,{force:true});
 victim.crossing='scramble-group';victim.choreographed=true;victim.struck=.1;
 layer.sync(people,{x:0,z:0},1/60,{time:1/60});
 assert.equal(layer.crowd.state.behaviour[i],STATE.KNOCKDOWN);
 assert.deepEqual(left,[victim.id],'a new strike did not ask the simulation to leave formally');
 assert.equal(victim.crossing,'scramble-group','the visual layer changed crossing ownership');
 layer.dispose();
});

test('recovery remains visible in the full state count',()=>{
 const people=pool(20);
 const layer=createHQLayer(manifest,bin,{budget:20});
 layer.sync(people,{x:0,z:0},0,{time:0});
 const i=layer.crowd.indexOf(people[0].id);
 layer.crowd.setState(i,STATE.RECOVER,{force:true});
 layer.sync(people,{x:0,z:0},1/60,{time:1/60});
 assert.equal(layer.inspect().byState.RECOVER,1);
 layer.dispose();
});

test('the layer draws no more than its budget, and holds no more than it draws',()=>{
 // The bug this pins: citizens that fall out of the budget were never released, so the crowd
 // only grew -- frozen bodies standing in the street beside the legacy pedestrian they were
 // meant to replace. In the real scene it reached 224 held against 128 drawn within a minute.
 const people=pool(900);
 const layer=createHQLayer(manifest,bin,{budget:128});
 const camera={x:0,z:0};
 for(let f=0;f<40;f++){
  // Move the camera so the nearest 128 keeps changing, which is what exposed it.
  camera.x=Math.sin(f*.3)*22;camera.z=Math.cos(f*.3)*22;
  const drawn=layer.sync(people,camera,1/60,{time:f/60});
  assert.ok(drawn.size<=128,`drew ${drawn.size} against a budget of 128`);
  assert.equal(layer.crowd.population,drawn.size,
   `frame ${f}: holding ${layer.crowd.population} citizens while drawing ${drawn.size}`);
 }
 layer.dispose();
});

test('a released citizen leaves no gap in the lanes it was drawn from',()=>{
 const people=pool(400);
 const layer=createHQLayer(manifest,bin,{budget:64});
 const camera={x:0,z:0};
 for(let f=0;f<30;f++){
  camera.x=Math.sin(f*.5)*18;
  layer.sync(people,camera,1/60,{time:f/60});
  let laneTotal=0;
  for(const lane of layer.crowd.lanes){
   laneTotal+=lane.count;
   // Every occupied slot must point back at a citizen that points back at it.
   for(let slot=0;slot<lane.count;slot++){
    const owner=lane.owners[slot];
    assert.ok(owner>=0&&owner<layer.crowd.population,
     `lane slot ${slot} owned by ${owner}, population ${layer.crowd.population}`);
    assert.equal(layer.crowd.state.slot[owner],slot,'a citizen and its slot disagree');
   }
  }
  assert.equal(laneTotal,layer.crowd.population,'lanes and population disagree');
 }
 layer.dispose();
});

test('identity survives being released and drawn again',()=>{
 const people=pool(300);
 const layer=createHQLayer(manifest,bin,{budget:32});
 const first=new Map();
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 for(let i=0;i<layer.crowd.population;i++)
  first.set(layer.crowd.state.id[i],{
   lane:layer.crowd.state.lane[i],phase:layer.crowd.state.phase[i],
   height:layer.crowd.state.height[i],width:layer.crowd.state.width[i]});
 // Walk away, then come back.
 for(let f=0;f<20;f++)layer.sync(people,{x:60,z:60},1/60,{time:f/60});
 layer.sync(people,{x:0,z:0},1/60,{time:1});
 let checked=0;
 for(let i=0;i<layer.crowd.population;i++){
  const was=first.get(layer.crowd.state.id[i]);
  if(!was)continue;
  checked++;
  assert.equal(layer.crowd.state.phase[i],was.phase,'a citizen came back on a different foot');
  assert.equal(layer.crowd.state.height[i],was.height,'a citizen came back a different height');
  assert.equal(layer.crowd.state.width[i],was.width);
  // The archetype is derived from the id, so it cannot have changed.
  assert.equal(appearanceOf(layer.crowd.state.id[i]).archetype.id,
   layer.crowd.lanes[layer.crowd.state.lane[i]].archetype.id,
   'a citizen came back as a different body');
 }
 assert.ok(checked>4,`only ${checked} citizens returned to be checked`);
 layer.dispose();
});

test('the layer never touches route, crossing, queue or signal state',()=>{
 // The rule the whole file exists for. A pedestrian released from a crossing without
 // releasing its signal group freezes every signal on the map.
 const people=pool(200);
 for(const p of people){p.crossing='hachiko-n';p.queueKey='k';}
 const before=people.map(p=>({crossing:p.crossing,queueKey:p.queueKey,edge:p.edge,
  route:[...p.route],x:p.x,z:p.z}));
 const layer=createHQLayer(manifest,bin,{budget:128});
 for(let f=0;f<20;f++)layer.sync(people,{x:0,z:0},1/60,{time:f/60});
 people.forEach((p,i)=>{
  assert.equal(p.crossing,before[i].crossing,'the renderer cleared a crossing');
  assert.equal(p.queueKey,before[i].queueKey,'the renderer cleared a queue key');
  assert.equal(p.edge,before[i].edge);
  assert.deepEqual(p.route,before[i].route);
  assert.equal(p.x,before[i].x,'the renderer moved a pedestrian');
  assert.equal(p.z,before[i].z,'the renderer moved a pedestrian');
 });
 layer.dispose();
});

test('a vehicle makes many of the drawn citizens react at once',()=>{
 const people=pool(900,1.15);
 const layer=createHQLayer(manifest,bin,{budget:600});
 let cz=0;for(const p of people)cz+=p.z;cz/=people.length;
 layer.sync(people,{x:0,z:cz},1/60,{time:0});
 const car={x:0,z:cz-24,heading:0,speed:14};
 let peakReacting=0,peakDown=0;
 for(let f=0;f<150;f++){
  car.z+=14/60;
  layer.sync(people,{x:0,z:cz},1/60,{time:f/60});
  layer.vehicle(car,1/60);
  const got=layer.inspect();
  peakReacting=Math.max(peakReacting,got.reacting);
  peakDown=Math.max(peakDown,got.down);
 }
 assert.ok(peakReacting>=20,`only ${peakReacting} reacted at once`);
 assert.ok(peakDown>=1,`nobody was knocked down over a whole pass`);
 layer.dispose();
});

test('movement authority is handed over on a hit and handed back after',()=>{
 const people=pool(400,1.15);
 const taken=[],given=[];
 const layer=createHQLayer(manifest,bin,{budget:300,
  onDisown:id=>taken.push(id),onReclaim:id=>given.push(id)});
 let cz=0;for(const p of people)cz+=p.z;cz/=people.length;
 layer.sync(people,{x:0,z:cz},1/60,{time:0});
 const car={x:0,z:cz-16,heading:0,speed:16};
 for(let f=0;f<120;f++){
  car.z+=16/60;
  layer.sync(people,{x:0,z:cz},1/60,{time:f/60});
  layer.vehicle(car,1/60);
 }
 assert.ok(taken.length>0,'nobody was ever thrown, so the handover was not exercised');
 assert.ok(layer.disowned.size<=taken.length);
 // And a thrown body is not being dragged back onto its route while it flies.
 for(const id of layer.disowned){
  const i=layer.crowd.indexOf(id);
  assert.ok(i>=0,'a disowned citizen was released mid-flight');
  const b=layer.crowd.state.behaviour[i];
  assert.ok(b===STATE.HIT||b===STATE.KNOCKDOWN||b===STATE.DOWNED,
   `citizen ${id} is owned by the reaction system but is in state ${b}`);
 }
 layer.dispose();
});

test('the level of detail follows distance, with hysteresis',()=>{
 assert.ok(HQ_LOD.bands.length>=3,'fewer than three levels of detail');
 for(const band of HQ_LOD.bands)
  assert.ok(band.out>=band.in,`band ${band.lod} has no hysteresis`);
 const people=pool(300,1.2);
 // Stand the camera IN the crowd. `pool` lays rows out from the origin, so three hundred
 // people never come within L0's band of (0,0) -- an earlier version of this test stood
 // outside the crowd and concluded the LOD selection was broken.
 let cx=0,cz=0;for(const p of people){cx+=p.x;cz+=p.z;}
 cx/=people.length;cz/=people.length;
 const camera={x:cx,z:cz};
 const layer=createHQLayer(manifest,bin,{budget:300});
 layer.sync(people,camera,1/60,{time:0});
 for(let f=0;f<40;f++)layer.sync(people,camera,HQ_LOD.reviewInterval,{time:f});
 const got=layer.inspect();
 const used=Object.entries(got.byLod).filter(([,n])=>n>0).map(([k])=>k);
 assert.ok(used.length>=2,
  `a crowd spanning tens of metres used only ${used.join(',')||'nothing'}`);
 assert.ok(got.byLod.L0>0,'nobody near the camera got the best body');
 layer.dispose();
});

test('changing level of detail changes nothing but the level of detail',()=>{
 // A camera sweeping in and out crosses every band repeatedly. What must NOT move with it:
 // the body, the hairstyle, the height, the build, the walk phase. qa/gta-upgrade/lodpop.mjs
 // is the same check at four hundred frames; this is the gate.
 const people=pool(600,1.3);
 let cx=0,cz=0;for(const p of people){cx+=p.x;cz+=p.z;}
 cx/=people.length;cz/=people.length;
 const layer=createHQLayer(manifest,bin,{budget:600});
 const seen=new Map();
 let moves=0,identityBreaks=0,phaseBreaks=0;
 const lods=new Set();
 for(let f=0;f<120;f++){
  const camera={x:cx,z:cz+Math.sin(f*.12)*30};
  layer.sync(people,camera,HQ_LOD.reviewInterval,{time:f*HQ_LOD.reviewInterval});
  const c=layer.crowd;
  for(let i=0;i<c.population;i++){
   const lane=c.lanes[c.state.lane[i]];
   const now={arch:lane.archetype.id,lod:lane.lod,phase:c.state.phase[i],
    height:c.state.height[i],width:c.state.width[i]};
   lods.add(now.lod);
   const was=seen.get(c.state.id[i]);
   if(was){
    if(was.lod!==now.lod)moves++;
    if(was.arch!==now.arch||was.height!==now.height||was.width!==now.width)identityBreaks++;
    if(was.phase!==now.phase)phaseBreaks++;
   }
   seen.set(c.state.id[i],now);
  }
 }
 assert.ok(moves>50,`only ${moves} level-of-detail changes -- the test never exercised one`);
 assert.ok(lods.size>=2,`only ${[...lods].join(',')} was ever used`);
 assert.equal(identityBreaks,0,`${identityBreaks} citizens changed body, height or build with distance`);
 assert.equal(phaseBreaks,0,`${phaseBreaks} citizens had their walk cycle reset by an LOD change`);
 layer.dispose();
});

test('a knocked-down body gets up, and ownership drains when the car stops',()=>{
 // The bug this pins: DOWNED was excluded from the state fall-through on the theory that it
 // "waits to be recovered", and nothing ever recovered it. Over 240 simulated seconds that
 // left 132 bodies permanently down and permanently disowned from their own routes -- state
 // that only grows, which a crossing running all day must never accumulate.
 //
 // A steady population of bodies under a car that never stops is NOT a leak, so the only way
 // to tell the two apart is to remove the cause and watch it drain. That is what this does.
 const people=pool(900,1.15);
 const taken=new Set();
 const layer=createHQLayer(manifest,bin,{budget:900,
  onDisown:id=>taken.add(id),onReclaim:id=>taken.delete(id)});
 let cz=0;for(const p of people)cz+=p.z;cz/=people.length;
 const camera={x:0,z:cz};
 const car={x:0,z:cz-30,heading:0,speed:16};
 let peakDown=0;
 for(let f=0;f<900;f++){                       // drive through them
  car.z+=16/60;if(car.z>cz+30)car.z=cz-30;
  layer.sync(people,camera,1/60,{time:f/60});
  layer.vehicle(car,1/60);
  peakDown=Math.max(peakDown,layer.inspect().down);
 }
 assert.ok(peakDown>=10,`only ${peakDown} were ever down -- the test never exercised it`);
 assert.ok(layer.disowned.size>0,'nobody was disowned while a car was driving through them');

 // Now the car leaves. Everybody must get back up.
 let drainedAt=null;
 for(let f=0;f<1200&&drainedAt===null;f++){
  layer.sync(people,camera,1/60,{time:(900+f)/60});
  if(layer.disowned.size===0)drainedAt=f/60;
 }
 assert.ok(drainedAt!==null,
  `${layer.disowned.size} bodies were still down and disowned 20 s after the car left`);
 assert.equal(taken.size,0,'onReclaim was never called for some bodies');
 const end=layer.inspect();
 assert.equal(end.down,0,`${end.down} citizens are still on the ground`);
 assert.equal(end.disowned,0);
 layer.dispose();
});

test('a punch is witnessed by the people near it, and only by them',()=>{
 // RUN 8. A crowd that keeps walking through a fight is wrong; a crowd that empties the
 // crossing because of one punch is worse. This pins both ends.
 const people=pool(900,1.3);
 const layer=createHQLayer(manifest,bin,{budget:900});
 let cx=0,cz=0;for(const p of people){cx+=p.x;cz+=p.z;}
 cx/=people.length;cz/=people.length;
 layer.sync(people,{x:cx,z:cz},1/60,{time:0});

 const radius=11;
 const reacted=layer.witness({x:cx,z:cz,severity:.72,radius});
 assert.ok(reacted>0,'nobody noticed a punch beside them');

 // Everyone who changed state must be inside the radius. This is the "no global panic" half.
 let outside=0,inside=0;
 for(let i=0;i<layer.crowd.population;i++){
  const b=layer.crowd.state.behaviour[i];
  if(b===STATE.NORMAL)continue;
  const d=Math.hypot(layer.crowd.state.x[i]-cx,layer.crowd.state.z[i]-cz);
  if(d>radius+.01)outside++;else inside++;
 }
 assert.equal(outside,0,`${outside} citizens reacted from outside the event radius`);
 assert.equal(inside,reacted);
 // And it must not be the whole crowd.
 assert.ok(reacted<layer.crowd.population*.5,
  `${reacted} of ${layer.crowd.population} reacted to one punch`);

 const got=layer.inspect();
 assert.ok(got.witnessCandidates<layer.crowd.population,
  'the witness query scanned the entire population');
 layer.dispose();
});

test('witnesses do not all react the same way, and they recover',()=>{
 const people=pool(900,1.15);
 const layer=createHQLayer(manifest,bin,{budget:900});
 let cx=0,cz=0;for(const p of people){cx+=p.x;cz+=p.z;}
 cx/=people.length;cz/=people.length;
 const camera={x:cx,z:cz};
 layer.sync(people,camera,1/60,{time:0});
 layer.witness({x:cx,z:cz,severity:.72,radius:11});

 const kinds=new Set();
 for(let i=0;i<layer.crowd.population;i++){
  const b=layer.crowd.state.behaviour[i];
  if(b!==STATE.NORMAL)kinds.add(b);
 }
 assert.ok(kinds.size>=2,
  `every witness reacted identically (${kinds.size} distinct response)`);

 // Nobody flees forever.
 let settled=null;
 for(let f=0;f<900&&settled===null;f++){
  layer.sync(people,camera,1/60,{time:(1+f)/60});
  let busy=0;
  for(let i=0;i<layer.crowd.population;i++)
   if(layer.crowd.state.behaviour[i]!==STATE.NORMAL)busy++;
  if(busy===0)settled=f/60;
 }
 assert.ok(settled!==null,'witnesses were still reacting 15 s after one punch');
 layer.dispose();
});

test('a punch in a dense crowd is seen by a useful number of people',()=>{
 // The QA threshold from the brief: in the dense scramble centre, a punch should reach at
 // least twenty people. Not a spec for every situation -- a measurement of this one.
 const people=pool(1200,1.05);
 const layer=createHQLayer(manifest,bin,{budget:1200});
 let cx=0,cz=0;for(const p of people){cx+=p.x;cz+=p.z;}
 cx/=people.length;cz/=people.length;
 layer.sync(people,{x:cx,z:cz},1/60,{time:0});
 const reacted=layer.witness({x:cx,z:cz,severity:.72,radius:11});
 assert.ok(reacted>=20,`only ${reacted} people reacted to a punch in a dense crowd`);
 layer.dispose();
});

test('a thrown body stays down while the simulation holds it, gets up once, and does not snap',()=>{
 // RUN 10 browser QA, scenario L. An extracted driver is held down by the simulation for 4.9 s
 // (`struck`); the HQ chain reached RECOVER at 3.9 s, was handed back, and was knocked down a
 // SECOND time because `struck` was still set. When the simulation then stood them at the
 // nearest safe node 4.4 m away and let them walk, the HQ body was still lying down, disowned,
 // at the old spot. A person walking away from their own body.
 const people=pool(12,1);
 const layer=createHQLayer(manifest,bin,{budget:12});
 const victim=people[0],dt=1/30;
 layer.sync(people,{x:0,z:0},dt,{time:0});
 victim.struck=0;victim.speed=0;victim.state='walking';
 const states=[],steps=[];let t=0,lastX=null,lastZ=null,relocatedAt=null,recoverAt=null;
 const safe={x:victim.x+4.4,z:victim.z};
 for(let f=0;f<300;f++){
  t+=dt;
  if(victim.struck!==undefined){
   victim.struck+=dt;
   if(victim.struck>=4.9){           // the simulation's own release, as in simulation.step
    victim.struck=undefined;relocatedAt=t;
    victim.x=victim.renderX=safe.x;victim.z=victim.renderZ=safe.z;
   }
  }
  layer.sync(people,{x:0,z:0},dt,{time:t});
  const i=layer.crowd.indexOf(victim.id),b=layer.crowd.state.behaviour[i];
  if(states.at(-1)!==b)states.push(b);
  if(b===STATE.RECOVER&&recoverAt===null)recoverAt=t;
  const x=layer.crowd.state.x[i],z=layer.crowd.state.z[i];
  if(lastX!==null)steps.push(Math.hypot(x-lastX,z-lastZ));
  lastX=x;lastZ=z;
 }
 const K=STATE.KNOCKDOWN;
 assert.equal(states.filter(s=>s===K).length,1,`knocked down more than once: ${states.join(' -> ')}`);
 assert.deepEqual(states.slice(0,4),[K,STATE.DOWNED,STATE.RECOVER,STATE.NORMAL],states.join(' -> '));
 assert.ok(recoverAt>=relocatedAt-1e-9,
  `got up at ${recoverAt?.toFixed(2)} s while the simulation held the body until ${relocatedAt?.toFixed(2)} s`);
 const worst=Math.max(...steps);
 assert.ok(worst<.4,`the body jumped ${worst.toFixed(2)} m in one frame`);
 const i=layer.crowd.indexOf(victim.id);
 assert.ok(Math.hypot(layer.crowd.state.x[i]-safe.x,layer.crowd.state.z[i]-safe.z)<.01,
  'the body never reached the safe destination');
 layer.dispose();
});

test('a body handed back closes the gap even if a car makes it step aside at once',()=>{
 // The same scenario live: RECOVER lasted one frame before the player's stationary car asked
 // for AVOID, and the body jumped 6.6 m in one frame, from where it had lain to the safe node.
 const people=pool(12,1);
 const layer=createHQLayer(manifest,bin,{budget:12});
 const victim=people[0],dt=1/30;
 layer.sync(people,{x:0,z:0},dt,{time:0});
 victim.struck=0;victim.speed=0;
 const safe={x:victim.x+6.5,z:victim.z};
 let t=0,last=null,worst=0,overridden=false;
 for(let f=0;f<300;f++){
  t+=dt;
  if(victim.struck!==undefined){victim.struck+=dt;
   if(victim.struck>=4.9){victim.struck=undefined;victim.x=victim.renderX=safe.x;victim.z=victim.renderZ=safe.z;}}
  layer.sync(people,{x:0,z:0},dt,{time:t});
  const i=layer.crowd.indexOf(victim.id);
  if(!overridden&&layer.crowd.state.behaviour[i]===STATE.RECOVER){layer.crowd.setState(i,STATE.AVOID);overridden=true;}
  const p=[layer.crowd.state.x[i],layer.crowd.state.z[i]];
  if(last)worst=Math.max(worst,Math.hypot(p[0]-last[0],p[1]-last[1]));last=p;
 }
 assert.ok(overridden,'the test never reached RECOVER');
 assert.ok(worst<.4,`the body jumped ${worst.toFixed(2)} m in one frame`);
 assert.ok(Math.hypot(last[0]-safe.x,last[1]-safe.z)<.01,'the body never reached the safe destination');
 layer.dispose();
});

/** Walk `people` along +z at their own `speed` for `seconds`, syncing the layer each frame. */
function walkFor(layer,people,seconds,{dt=1/60,t0=0,moving=people}={}){
 let t=t0;
 for(let f=0;f<Math.round(seconds/dt);f++){
  for(const p of moving){p.z+=p.speed*dt;p.renderZ=p.z;}
  t+=dt;layer.sync(people,{x:0,z:0},dt,{time:t});
 }
 return t;
}

test('someone waiting at the kerb plays Idle; anyone the simulation is not moving stands too',()=>{
 const people=pool(12,1);
 const layer=createHQLayer(manifest,bin,{budget:12});
 const [waiting,blocked,walker]=people;
 waiting.state='waiting';waiting.speed=0;
 blocked.state='walking';blocked.speed=0;       // held up in a jam: not waiting, not moving
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const idx=p=>layer.crowd.indexOf(p.id),clip=p=>layer.crowd.clipName(idx(p));
 let t=walkFor(layer,people,.5,{moving:[walker]});
 assert.equal(clip(waiting),'Idle','a waiting citizen walked on the spot');
 // claude/crowd-realism: the measured pace decides, so a jam no longer walks on the spot.
 assert.equal(clip(blocked),'Idle','a citizen who is not moving walked on the spot');
 assert.equal(clip(walker),'Walk');
 // The instanced attribute really carries the Idle row, not just the name.
 const i=idx(waiting),lane=layer.crowd.lanes[layer.crowd.state.lane[i]];
 const idle=manifest.clips.find(c=>c.name==='Idle');
 assert.equal(lane.clipAttr.getX(layer.crowd.state.slot[i]),idle.row);
 // A glance keeps the stance (RUN 11.0); a real reaction outranks waiting; physical outranks both.
 layer.crowd.setState(i,STATE.LOOK);assert.equal(clip(waiting),'Idle','a waiting citizen who glanced walked on the spot');
 layer.crowd.setState(i,STATE.STARTLE);assert.equal(clip(waiting),'Startle');
 // A fright that is not carrying the body anywhere is a wary stance, not a run on the spot.
 layer.crowd.setState(i,STATE.FLEE,{force:true});assert.equal(clip(waiting),'Guard');
 layer.crowd.setState(i,STATE.KNOCKDOWN,{force:true});assert.equal(clip(waiting),'Fall');
 layer.crowd.setState(i,STATE.NORMAL,{force:true});assert.equal(clip(waiting),'Idle',
  'back to NORMAL at the kerb did not return to Idle');
 // The light changes: they step off and walk.
 waiting.state='crossing';waiting.speed=1.3;
 t=walkFor(layer,people,.6,{t0:t,moving:[waiting,walker]});
 assert.equal(clip(waiting),'Walk','still idling after starting to cross');
 layer.dispose();
});

test('the queue behind the front row and the cast between crossings idle, and walk off when they move',()=>{
 const people=pool(12,1);
 const layer=createHQLayer(manifest,bin,{budget:12});
 const [queued,cast,held]=people;
 queued.state='walking';queued.speed=0;queued.kerbQueue=true;
 cast.state='exiting';cast.choreographed=true;cast.speed=0;
 held.state='walking';held.speed=0;held.stuck=2;         // held up, not at a kerb
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const clip=p=>layer.crowd.clipName(layer.crowd.indexOf(p.id));
 assert.equal(clip(queued),'Idle','the queue behind the front row walked on the spot');
 assert.equal(clip(cast),'Idle','the scramble cast walked on the spot between crossings');
 assert.equal(clip(held),'Idle','held up and not moving is standing, not walking on the spot');
 queued.kerbQueue=false;queued.speed=1.3;held.speed=1.3; // the light changed and they moved
 walkFor(layer,people,.6,{moving:[queued,held]});
 assert.equal(clip(queued),'Walk');
 assert.equal(clip(held),'Walk');
 layer.dispose();
});

test('Idle and Walk switch on the MEASURED pace with hysteresis, and cadence follows ground speed',()=>{
 const people=pool(4,3);
 const layer=createHQLayer(manifest,bin,{budget:4});
 const [a]=people;
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const clip=()=>layer.crowd.clipName(layer.crowd.indexOf(a.id));
 const rate=()=>layer.crowd.animRate(layer.crowd.indexOf(a.id));
 // A shuffle that wobbles around the stop threshold must not flicker Idle/Walk every frame.
 a.speed=.25;let t=walkFor(layer,people,1,{moving:[a]});
 let flips=0,last=clip();
 for(let f=0;f<120;f++){a.speed=f%2?.12:.4;t=walkFor(layer,people,1/60,{t0:t,moving:[a]});
  if(clip()!==last){flips++;last=clip();}}
 assert.ok(flips<=1,`${flips} Idle/Walk flips on a threshold wobble`);
 // Cadence: stride / speed. Walk is authored at 1.30 m per cycle.
 const walk=manifest.clips.find(c=>c.name==='Walk');
 a.speed=1.3;t=walkFor(layer,people,1.5,{t0:t,moving:[a]});
 assert.equal(clip(),'Walk');
 assert.ok(Math.abs(rate()-1)<.08,`1.3 m/s walked at ${rate()} cycles/s, want ~1.0`);
 a.speed=1.8;t=walkFor(layer,people,1.5,{t0:t,moving:[a]});
 assert.ok(Math.abs(rate()-1.8/1.3)<.1,`1.8 m/s walked at ${rate()} cycles/s, want ~1.38`);
 assert.ok(rate()<=1/walk.duration*1.75+1e-6);
 // Fast enough is a run, not a sped-up walk.
 a.speed=3.8;t=walkFor(layer,people,1,{t0:t,moving:[a]});
 assert.equal(clip(),'Run');
 // And stopping stands them within half a second, not on the next stalled frame.
 a.speed=0;t=walkFor(layer,people,1/60,{t0:t,moving:[]});
 assert.equal(clip(),'Run','one stalled frame is not a stop');
 // (3.6 m/s also reads as FLEE to the simulation, which drains through RECOVER first.)
 t=walkFor(layer,people,3.2,{t0:t,moving:[]});
 assert.equal(clip(),'Idle');
 layer.dispose();
});

test('a cadence change keeps the pose where it is (no jump in the cycle)',()=>{
 const people=pool(2,3);
 const layer=createHQLayer(manifest,bin,{budget:2});
 const [a]=people;a.speed=1;
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 let t=walkFor(layer,people,1,{moving:[a]});
 const c=layer.crowd;
 const pose=at=>{const i=c.indexOf(a.id);const p=c.state.phase[i]+at*c.state.animRate[i];return p-Math.floor(p);};
 let worst=0;
 for(let f=0;f<60;f++){
  a.speed=f<30?1+f*.03:1.9-(f-30)*.03;
  // The pose the GPU shows at the current time, before and after this frame's rewrite.
  const before=pose(t);
  for(const p of [a]){p.z+=p.speed/60;p.renderZ=p.z;}
  layer.sync(people,{x:0,z:0},1/60,{time:t});   // same instant: only the rewrite can move it
  let d=Math.abs(pose(t)-before);d=Math.min(d,1-d);worst=Math.max(worst,d);
  t+=1/60;layer.sync(people,{x:0,z:0},0,{time:t});
 }
 assert.ok(worst<.02,`the walk cycle jumped by ${worst.toFixed(3)} of a cycle on a rate change`);
 layer.dispose();
});

test('a pedestrian the simulation is carrying away from a car runs; walking back afterwards walks',()=>{
 const people=pool(4,3);
 const layer=createHQLayer(manifest,bin,{budget:4});
 const [a]=people;
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 const i=()=>layer.crowd.indexOf(a.id),clip=()=>layer.crowd.clipName(i());
 // A glance first: a real flight must override it.
 layer.crowd.setState(i(),STATE.LOOK);
 a.flee={x:0,z:1};a.speed=4.2;
 let t=walkFor(layer,people,.8,{moving:[a]});
 assert.equal(layer.crowd.state.behaviour[i()],STATE.FLEE);
 assert.equal(clip(),'Run');
 // The flight is over; FLEE drains through RECOVER while they walk back.
 a.flee=null;a.speed=1.25;
 t=walkFor(layer,people,1.8,{t0:t,moving:[a]});
 assert.equal(layer.crowd.state.behaviour[i()],STATE.RECOVER);
 assert.equal(clip(),'Walk','a recovering body walking back played a standing Guard and slid');
 layer.dispose();
});

test('a thrown body turns to face against its flight, so the backwards Fall goes the way it travels',()=>{
 const people=pool(4,3);
 const layer=createHQLayer(manifest,bin,{budget:4});
 const [a]=people;a.heading=0;                   // walking +z
 layer.sync(people,{x:0,z:0},1/60,{time:0});
 a.struck=.05;a.flyX=6;a.flyZ=0;a.flyY=1;        // thrown towards +x
 let t=0;for(let f=0;f<30;f++){a.x+=a.flyX/60;t+=1/60;layer.sync(people,{x:0,z:0},1/60,{time:t});}
 const h=layer.crowd.state.heading[layer.crowd.indexOf(a.id)],want=Math.atan2(-6,0);
 assert.ok(Math.abs(Math.atan2(Math.sin(h-want),Math.cos(h-want)))<.05,`heading ${h.toFixed(2)}, want ${want.toFixed(2)}`);
 layer.dispose();
});
