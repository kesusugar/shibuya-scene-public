// RUN 10: headless HIGH simulation with the real traffic signals and choreographed crowd.
// Run: node qa/gta-upgrade/awareness-cycle.mjs [seconds]
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../../src/ground/model.mjs';
import {buildBuildingModel} from '../../src/buildings/model.mjs';
import {buildStationModel} from '../../src/station/model.mjs';
import {buildStreetscapeModel} from '../../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../../src/traffic/graph.mjs';
import {TrafficSimulation} from '../../src/traffic/simulation.mjs';
import {buildPedestrianNetwork} from '../../src/life/network.mjs';
import {CrowdSimulation} from '../../src/life/simulation.mjs';
import {createHQLayer} from '../../src/life/hq-layer.mjs';

const seconds=Number(process.argv[2]??120),dt=1/30;
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const traffic=new TrafficSimulation(buildTrafficGraph(data,{ground,generic,street,core}),
 {tier:'high',street});
const network=buildPedestrianNetwork(data,{ground,generic,street,core});
const sim=new CrowdSimulation(network,{traffic,tier:'high',choreography:true});
const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const layer=createHQLayer(manifest,bin,{budget:1978,
 onDisown:id=>{const p=sim.pool[id];if(p?.active){sim.leave(p);p.reactionOwned=true;}},
 onReclaim:id=>{const p=sim.pool[id];if(p)p.reactionOwned=false;}});
let center=sim.pool.find(p=>p.active&&p.choreographed)??sim.pool.find(p=>p.active);
const camera={x:center.x,z:center.z},player={x:center.x,z:center.z,heading:0,course:0,speed:0,alive:true};
const phases=new Set(),samples={},max={candidates:0,accepted:0,active:0,gridMs:0,queryMs:0,updateMs:0};
let maxPopulation=0,peakDisowned=0;
layer.sync(sim.pool,camera,0,{time:sim.time});
for(let f=0;f<Math.round(seconds/dt);f++){
 const t=f*dt;
 traffic.update(dt);sim.update(dt);
 const phase=traffic.signals.phase();phases.add(phase[0]);
 let focus=null;
 if(t<2)focus={...player};
 else if(t<4)focus={...player,speed:1.2};
 else if(t<6)focus={...player,speed:5,course:0};
 if(focus)layer.awareness(focus,dt);
 layer.sync(sim.pool,camera,dt,{time:sim.time});
 if(f===Math.round(7/dt))layer.witness({x:camera.x,z:camera.z,severity:.8});
 if(f===Math.round(10/dt))layer.vehicle({x:camera.x,z:camera.z-4,heading:0,speed:11},dt);
 const a=layer.perception,h=layer.inspect();
 max.candidates=Math.max(max.candidates,focus?a.candidates:0);
 max.accepted=Math.max(max.accepted,focus?a.changed:0);
 max.active=Math.max(max.active,h.reacting);
 if(focus){
  max.gridMs=Math.max(max.gridMs,h.awarenessGridMs);
  max.queryMs=Math.max(max.queryMs,a.queryMs);
  max.updateMs=Math.max(max.updateMs,a.updateMs);
 }
 maxPopulation=Math.max(maxPopulation,h.population);
 peakDisowned=Math.max(peakDisowned,h.disowned);
 for(const [key,at] of Object.entries({standing:1,walking:3,running:5,melee:7.1,vehicle:10.1,recovered:seconds-1}))
  if(f===Math.round(at/dt))samples[key]={...h.byState,
   candidates:focus?a.candidates:0,accepted:focus?a.changed:0,
   active:h.reacting,population:h.population};
}
const h=layer.inspect(),snapshot=sim.snapshot(),result={duration:seconds,frames:Math.round(seconds/dt),
 population:{peak:maxPopulation,end:h.population,target:1978},drawCalls:h.drawCalls,
 skeletons:h.skeletons,mixers:h.mixers,awareness:{radius:13,...max},samples,
 crossing:{completed:Object.values(snapshot.completed).reduce((a,b)=>a+b,0),
  abandoned:snapshot.abandonedCrossings??0,stuck:snapshot.stuck,queues:snapshot.queueSizes,
  signalPhases:[...phases],violations:snapshot.signalViolations},
 disowned:{peak:peakDisowned,end:h.disowned},endStates:h.byState};
console.log(JSON.stringify(result,null,2));
layer.dispose();sim.dispose();traffic.dispose();
