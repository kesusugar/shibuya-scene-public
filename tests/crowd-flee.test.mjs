import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {buildPedestrianNetwork,inCrossing} from '../src/life/network.mjs';
import {CrowdSimulation,FLEE} from '../src/life/simulation.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {isWaiting} from '../src/life/stance.mjs';

// claude/crowd-realism. The real Shibuya pedestrian network, traffic signals and scramble cast,
// with a car driven at the densest crowd. Before this change the people it frightened did not
// move: live, 323 of 347 were within 30 cm of their spot two seconds later.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core});
const def=VEHICLES.sedan;
const graph=buildTrafficGraph(data,{ground,generic,street,core});

function scene(){
 const traffic=new TrafficSimulation(graph,{tier:'high',street});
 const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true,heroStart:true});
 sim.refill(true);
 for(let i=0;i<90;i++){traffic.update(1/30);sim.step(1/30);}
 return {traffic,sim};
}
/** The densest 4 m cell, and a clear 14 m run-up to it. */
function aim(sim){
 const cells=new Map();
 for(const p of sim.pool){if(!p.active||p.struck!==undefined)continue;
  const k=Math.floor(p.x/4)+','+Math.floor(p.z/4);cells.set(k,(cells.get(k)??0)+1);}
 for(const [k] of [...cells].sort((a,b)=>b[1]-a[1]).slice(0,40)){
  const [i,j]=k.split(',').map(Number),tx=i*4+2,tz=j*4+2;
  for(let a=0;a<32;a++){const h=a/32*Math.PI*2,sx=tx-Math.sin(h)*14,sz=tz-Math.cos(h)*14;let ok=true;
   for(let d=0;d<=20&&ok;d+=.8)if(network.ctx.solid(sx+Math.sin(h)*d,sz+Math.cos(h)*d,1.3))ok=false;
   if(ok)return {tx,tz,h,sx,sz};}
 }
 return null;
}
function drive(sim,traffic,plan,{speed=9,seconds=4,onStep=()=>{}}={}){
 const car={active:true,x:plan.sx,z:plan.sz,heading:plan.h,course:plan.h,speed};
 for(let f=0;f<seconds*30;f++){
  // The car stops where the crowd is (the real one is slowed by every body); it only has to
  // bear down on them for the reaction to be tested.
  if(Math.hypot(car.x-plan.tx,car.z-plan.tz)>2){car.x+=Math.sin(car.heading)*speed/30;car.z+=Math.cos(car.heading)*speed/30;}
  else car.speed=0;
  sim.vehicleThreat(car,def);traffic.update(1/30);sim.step(1/30);onStep(car,f);
 }
 return car;
}
const walkable=(p)=>{const e=network.edges[p.edge]??p.track?.e;
 return network.ctx.safe(p.x,p.z,.27)||(e?.crossingId&&inCrossing(p.x,p.z,e,.29));};

test('a car driven at a crowd makes it really move: metres in two seconds, 3-5 m/s, fanned out',()=>{

 const {sim,traffic}=scene();
 const plan=aim(sim);assert.ok(plan,'no clear approach to a crowd');
 const start=new Map(),peak=new Map();
 // How many people stand inside each other already: the kerb slot grid doubles some up.
 const nearby=sim.pool.filter(p=>p.active&&Math.hypot(p.x-plan.tx,p.z-plan.tz)<14);
 const pairs=list=>{let n=0;for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++)
  if(Math.hypot(list[a].x-list[b].x,list[a].z-list[b].z)<.2)n++;return n;};
 const stackedBefore=pairs(nearby),t0=sim.time;let midStacked=-1;
 drive(sim,traffic,plan,{onStep:()=>{
  for(const p of sim.pool){if(!p.active||!p.flee)continue;
   if(!start.has(p.id))start.set(p.id,{x:p.x,z:p.z,t:sim.time,away:Math.atan2(p.flee.x,p.flee.z),cast:!!p.choreographed});
   peak.set(p.id,Math.max(peak.get(p.id)??0,p.speed));}
  for(const [id,s] of start)if(s.t2===undefined&&sim.time-s.t>=2){const p=sim.pool[id];s.t2=sim.time;s.x2=p.x;s.z2=p.z;}
  if(midStacked<0&&sim.time-t0>=2)midStacked=pairs(nearby.filter(p=>p.active&&p.struck===undefined));
 }});
 const done=[...start.values()].filter(s=>s.t2!==undefined);
 const moved0=done.map(s=>Math.hypot(s.x2-s.x,s.z2-s.z)).sort((a,b)=>a-b);
 console.log('FLEE',JSON.stringify({fled:start.size,cast:done.filter(s=>s.cast).length,
  median:+moved0[moved0.length>>1].toFixed(2),p10:+moved0[Math.floor(moved0.length*.1)].toFixed(2),
  p90:+moved0[Math.floor(moved0.length*.9)].toFixed(2),under30:moved0.filter(m=>m<.3).length,
  stackedBefore,midStacked}));
 assert.ok(done.length>=20,`only ${done.length} people ran from the car`);
 assert.ok(done.some(s=>s.cast),'the choreographed cast never moved -- the bug this fixes');
 const moved=done.map(s=>Math.hypot(s.x2-s.x,s.z2-s.z)).sort((a,b)=>a-b);
 const median=moved[moved.length>>1];
 assert.ok(median>=1.8,`median displacement in 2 s was ${median.toFixed(2)} m`);
 assert.ok(moved.filter(m=>m<.3).length<done.length*.15,
  `${moved.filter(m=>m<.3).length} of ${done.length} still ran on the spot`);
 const peaks=[...peak.values()].sort((a,b)=>a-b);
 assert.ok(peaks.at(-1)<=FLEE.speed[1]+.25,`someone fled at ${peaks.at(-1).toFixed(2)} m/s`);
 assert.ok(peaks[peaks.length>>1]>=FLEE.speed[0]-.4,`median peak speed ${peaks[peaks.length>>1].toFixed(2)} m/s`);
 // Fanned out: the actual directions are not one block moving together.
 const dirs=done.filter((s,i)=>Math.hypot(s.x2-s.x,s.z2-s.z)>.5).map(s=>Math.atan2(s.x2-s.x,s.z2-s.z));
 const mx=dirs.reduce((a,d)=>a+Math.sin(d),0)/dirs.length,mz=dirs.reduce((a,d)=>a+Math.cos(d),0)/dirs.length;
 const coherence=Math.hypot(mx,mz);
 assert.ok(coherence<.9,`the crowd moved as one block (coherence ${coherence.toFixed(2)})`);
 // Only on walkable ground or their own crossing, and nobody standing inside anybody else.
 const fled=[...start.keys()].map(id=>sim.pool[id]).filter(p=>p.active&&p.struck===undefined);
 const off=fled.filter(p=>!walkable(p));
 assert.ok(off.length<=Math.max(1,fled.length*.02),`${off.length} fled off walkable ground`);
 // Running must not press people into each other: no more doubled-up pairs mid-flight than
 // the same people had standing at the kerb before the car came.
 assert.ok(midStacked<=stackedBefore+2,`${midStacked} pairs inside each other mid-flight (${stackedBefore} before)`);
});

test('someone in the car\'s path dodges sideways, not ahead of it',()=>{
 const {sim,traffic}=scene();
 const plan=aim(sim);
 const fx=Math.sin(plan.h),fz=Math.cos(plan.h);
 const lateral=[],along=[];
 const seen=new Map();
 drive(sim,traffic,plan,{seconds:2.5,onStep:(car)=>{
  for(const p of sim.pool){if(!p.active||!p.flee?.dodge||seen.has(p.id))continue;seen.set(p.id,{x:p.x,z:p.z,t:sim.time});}
  for(const [id,s] of seen)if(!s.done&&sim.time-s.t>=1){s.done=true;const p=sim.pool[id];
   const dx=p.x-s.x,dz=p.z-s.z;along.push(Math.abs(dx*fx+dz*fz));lateral.push(Math.abs(dx*fz-dz*fx));}
 }});
 assert.ok(lateral.length>=5,`only ${lateral.length} dodges`);
 const sum=a=>a.reduce((x,y)=>x+y,0);
 assert.ok(sum(lateral)>sum(along)*1.5,`dodges went along the car's path (${sum(lateral).toFixed(1)} across vs ${sum(along).toFixed(1)} along)`);
});

test('the flight ends, the cast walks back onto its track, and the signals never freeze',()=>{
 const {sim,traffic}=scene();
 const plan=aim(sim);
 const fledCast=new Set();
 drive(sim,traffic,plan,{seconds:3,onStep:()=>{for(const p of sim.pool)if(p.flee&&p.choreographed)fledCast.add(p.id);}});
 assert.ok(fledCast.size>0);
 // Nothing drives any more; let them settle.
 let waitingWhileFleeing=0;
 for(let f=0;f<30*12;f++){traffic.update(1/30);sim.step(1/30);
  for(const id of fledCast){const p=sim.pool[id];if(p.flee&&isWaiting(p))waitingWhileFleeing++;}}
 assert.equal(waitingWhileFleeing,0,'a fleeing person counted as standing at the kerb (Idle while running)');
 const still=[...sim.pool].filter(p=>p.active&&p.flee);
 assert.equal(still.length,0,`${still.length} people still fleeing 12 s later`);
 const offTrack=[...fledCast].map(id=>sim.pool[id]).filter(p=>p.active&&Math.hypot(p.fleeOffX??0,p.fleeOffZ??0)>.05);
 assert.equal(offTrack.length,0,`${offTrack.length} cast members never got back onto their track`);
 const audit=sim.audit();
 assert.equal(audit.signalViolations,0);
 assert.equal(audit.findings.filter(f=>f.kind==='finite').length,0);
 // The controller is still cycling: nobody's flight held a crossing forever.
 const t0=traffic.signals.time;for(let f=0;f<30*40;f++){traffic.update(1/30);sim.step(1/30);}
 assert.ok(traffic.signals.time-t0>30,'the signals froze after the crowd ran');
});

test('an accident scatters the people nearest it, fewer further out',()=>{
 const {sim}=scene();
 const plan=aim(sim);
 const near=[],far=[];
 for(const p of sim.pool){if(!p.active)continue;const d=Math.hypot(p.x-plan.tx,p.z-plan.tz);if(d<3)near.push(p);else if(d>6&&d<9)far.push(p);}
 sim.panic(plan.tx,plan.tz,{radius:9,severity:.9});
 const rate=a=>a.filter(p=>p.flee).length/Math.max(1,a.length);
 assert.ok(rate(near)>.7,`only ${(rate(near)*100).toFixed(0)}% of those beside the accident ran`);
 assert.ok(rate(far)<rate(near),'the far edge ran as readily as those beside it');
 // Away from it.
 for(const p of near.filter(p=>p.flee)){const ax=p.x-plan.tx,az=p.z-plan.tz;if(Math.hypot(ax,az)<.3)continue;
  assert.ok(p.flee.x*ax+p.flee.z*az>-.2,`${p.id} ran towards the accident`);}
});
