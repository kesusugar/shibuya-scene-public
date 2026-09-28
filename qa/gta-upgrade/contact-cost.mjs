// Player crowd contact: what the player's body against the crowd costs per frame, at the real
// population, walking through the Scramble while it is full. CPU only, offline and deterministic
// (the crowd is seeded); no frame rate is reported, and the timings are this machine's.
//   node qa/gta-upgrade/contact-cost.mjs
//
// Measured per frame: the contact step inside controller.step() (bodiesNear, resolveStep and
// the people's reaction, `contact.stats.lastMs`) plus yieldToPlayer(). The crowd's own update is
// not counted; it runs whether or not the player collides with anyone.
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../../src/ground/model.mjs';
import {buildBuildingModel} from '../../src/buildings/model.mjs';
import {buildStationModel} from '../../src/station/model.mjs';
import {buildStreetscapeModel} from '../../src/streetscape/model.mjs';
import {buildPedestrianNetwork} from '../../src/life/network.mjs';
import {buildTrafficGraph} from '../../src/traffic/graph.mjs';
import {TrafficSimulation} from '../../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../../src/life/simulation.mjs';
import {createPlayer} from '../../src/player/controller.mjs';
import {yieldToPlayer} from '../../src/player/crowd-interaction.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const ctx=network.ctx;

const traffic=new TrafficSimulation(graph,{tier:'high',street});
traffic.signals.time=90;   // the pedestrian phase: the hero cast starts across the Scramble
const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true,heroStart:true});
for(let i=0;i<30;i++){traffic.update(1/30);sim.step(1/30);}
const population=sim.pool.filter(p=>p.active).length;

// The densest 4 m cell, and a 15 m line through it that is clear of solids.
const cells=new Map();
for(const p of sim.pool){if(!p.active)continue;const k=Math.floor(p.x/4)+','+Math.floor(p.z/4);cells.set(k,(cells.get(k)??0)+1);}
let plan=null;
for(const [k] of [...cells].sort((a,b)=>b[1]-a[1]).slice(0,30)){
 const [i,j]=k.split(',').map(Number),tx=i*4+2,tz=j*4+2;
 for(let a=0;a<32&&!plan;a++){const h=a/32*Math.PI*2,sx=tx-Math.sin(h)*7,sz=tz-Math.cos(h)*7;let ok=true;
  for(let d=0;d<=15&&ok;d+=.5)if(ctx.solid(sx+Math.sin(h)*d,sz+Math.cos(h)*d,.5))ok=false;
  if(ok)plan={sx,sz,h,dense:cells.get(k)};}
 if(plan)break;
}
if(!plan)throw new Error('no clear line through a dense cell');

const player=createPlayer(ctx,{start:[plan.sx,plan.sz],heading:plan.h,bodies:()=>sim});
Object.assign(player.state,{x:plan.sx,z:plan.sz,y:ctx.height(plan.sx,plan.sz),bodyHeading:plan.h,course:plan.h});
sim.setCamera(plan.sx,plan.sz);
player.setTouch({forward:1,strafe:0,running:false});
const dt=1/60,times=[];let nearMax=0;
for(let f=0;f<600;f++){
 player.step(dt);
 const t0=performance.now();yieldToPlayer(sim,player.state,player.contact.nearby);const yieldMs=performance.now()-t0;
 times.push(player.contact.stats.lastMs+yieldMs);
 nearMax=Math.max(nearMax,player.contact.bodies.length);
 traffic.update(dt);sim.update(dt);sim.setCamera(player.state.x,player.state.z);
}
const warm=times.slice(60).sort((a,b)=>a-b);
const mean=warm.reduce((s,v)=>s+v,0)/warm.length;
const s=player.contact.stats;
console.log(JSON.stringify({population,denseCell4m:plan.dense,frames:600,
 meanMs:+mean.toFixed(4),p95Ms:+warm[Math.floor(warm.length*.95)].toFixed(4),maxMs:+warm.at(-1).toFixed(4),
 walked:+Math.hypot(player.state.x-plan.sx,player.state.z-plan.sz).toFixed(2),
 bodiesMax:nearMax,contacts:s.contacts,bumps:s.bumps,dodges:s.dodges,fights:s.fights,
 yielded:sim.stats.yielded??0,minGap:s.minGap===null?null:+s.minGap.toFixed(3),trappedSeconds:+s.trappedSeconds.toFixed(3),
 target:{meanMs:.05,p95Ms:.15}},null,1));
