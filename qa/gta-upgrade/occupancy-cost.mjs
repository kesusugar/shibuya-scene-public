// RUN 9 STEP 26: what occupancy and its drivers cost the CPU.
//
// CPU only. This project does not accept a SwiftShader frame rate as performance evidence, so
// nothing here reports one -- the numbers are milliseconds of JavaScript per frame, counts,
// and bytes, against the real Shibuya traffic graph.
//
// The two costs scale differently and are kept apart:
//   reconcileOccupancy  -- O(pool), a fixed 146 slots, once per frame, over typed arrays.
//   seated drivers      -- bounded by the RADIUS around the camera, not by the traffic count.
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../../src/ground/model.mjs';
import {buildBuildingModel} from '../../src/buildings/model.mjs';
import {buildStationModel} from '../../src/station/model.mjs';
import {buildStreetscapeModel} from '../../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../../src/traffic/graph.mjs';
import {TrafficSimulation} from '../../src/traffic/simulation.mjs';
import {createSeatedDrivers,SEATED_DRIVER} from '../../src/traffic/drivers.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});

console.log('RUN 9 occupancy cost -- real Shibuya graph, CPU only. No frame rate is claimed.\n');
console.log('tier    cars  drivers  reconcile us/f  drivers drawn  driver us/f  draws  skel  mix');

for(const tier of ['low','medium','high']){
 const sim=new TrafficSimulation(graph,{tier,street});
 for(let i=0;i<30;i++)sim.update(1/30);
 const cars=sim.pool.filter(v=>v.active).length;

 // Reconcile on its own, with the rest of the step excluded.
 for(let i=0;i<200;i++)sim.reconcileOccupancy();          // warm
 const t0=performance.now();
 const N=2000;
 for(let i=0;i<N;i++)sim.reconcileOccupancy();
 const reconcileUs=(performance.now()-t0)/N*1000;

 // Drivers, looking from the BUSIEST point rather than the first car found: the cost this
 // step is asking about is the loaded one, and a focus that happens to sit on an empty street
 // measures the early return.
 const driven=sim.pool.filter(v=>v.active&&sim.occupancy.hasDriver(v.id));
 let focus={x:0,z:0},best=-1;
 for(const v of driven){
  let near=0;
  for(const w of driven)if(Math.hypot(w.x-v.x,w.z-v.z)<=SEATED_DRIVER.radius)near++;
  if(near>best){best=near;focus={x:v.x,z:v.z};}
 }
 const drivers=createSeatedDrivers();
 for(let i=0;i<30;i++)drivers.update(sim,focus);          // warm
 const t1=performance.now();
 for(let i=0;i<600;i++)drivers.update(sim,focus);
 const driverUs=(performance.now()-t1)/600*1000;
 const seen=drivers.inspect();

 console.log(
  tier.padEnd(8)
  +String(cars).padStart(5)
  +String(sim.occupancy.drivers).padStart(9)
  +reconcileUs.toFixed(1).padStart(16)
  +String(seen.drawn).padStart(15)
  +driverUs.toFixed(1).padStart(13)
  +String(seen.drawCalls).padStart(7)
  +String(seen.skeletons).padStart(6)
  +String(seen.mixers).padStart(5));
 drivers.dispose();sim.dispose();
}

// What occupancy actually costs in memory: four arrays over the pool, and nothing per car.
const slots=146;
console.log(`\noccupancy storage: ${slots} slots x (1 + 4 + 1 + 4) bytes = ${slots*10} bytes total`);
console.log(`driver radius ${SEATED_DRIVER.radius} m, budget ${SEATED_DRIVER.budget}`);
