import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {createOccupancy,OCCUPANT,DRIVER} from '../src/traffic/occupancy.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
import {appearanceOf} from '../src/life/appearance.mjs';
import {createSeatedDrivers} from '../src/traffic/drivers.mjs';
import {createVehicleTransition,ENTER_STAGES,EXIT_STAGES,CARJACK_STAGES,DOOR} from '../src/player/vehicle-transition.mjs';
import {isOccupied,canCarjack,alertDriver,beginExtraction,throwDriverOut,abortCarjack,CARJACK} from '../src/player/carjack.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});

// ---------------------------------------------------------------- the model itself

test('a seat holds one occupant, and the model refuses a second',()=>{
 const o=createOccupancy(4);
 assert.equal(o.seat(0),true);
 assert.equal(o.seat(0),false,'two drivers were seated in one car');
 assert.equal(o.takeSeat(0),false,'the player sat on top of a driver');
 assert.equal(o.read(0).type,OCCUPANT.TRAFFIC_DRIVER);
});

test('the player cannot occupy two vehicles',()=>{
 const o=createOccupancy(4);
 assert.equal(o.takeSeat(1),true);
 assert.equal(o.playerVehicle,1);
 assert.equal(o.takeSeat(2),true);
 // Taking a second wheel gives up the first rather than owning both.
 assert.equal(o.playerVehicle,2);
 assert.equal(o.read(1).type,OCCUPANT.NONE,'the player was left in two cars at once');
 const seen=o.inspect();
 assert.equal(seen.player,1);
});

test('a driver cannot be skipped straight out of the seat',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 // This is the instant takeover RUN 9 exists to remove, expressed as a state transition.
 assert.equal(o.extract(0),null,'a seated driver was extracted with no extraction');
 assert.equal(o.advance(0,DRIVER.BEING_EXTRACTED),false,'ALERT was skipped');
 assert.equal(o.advance(0,DRIVER.ALERT),true);
 assert.equal(o.extract(0),null,'an alerted driver was extracted with no extraction');
 assert.equal(o.advance(0,DRIVER.BEING_EXTRACTED),true);
 assert.ok(o.extract(0),'a driver being extracted could not be extracted');
});

test('extraction empties the seat and hands back the same identity',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 const before=o.read(0);
 o.advance(0,DRIVER.ALERT);o.advance(0,DRIVER.BEING_EXTRACTED);
 const out=o.extract(0);
 assert.equal(out.driverId,before.driverId,'a different person got out than got in');
 assert.equal(out.seed,before.seed,'the driver changed appearance on the way out');
 assert.equal(o.isEmpty(0),true,'the seat was still occupied after extraction');
 assert.equal(o.hasDriver(0),false);
 // And the player may now have it -- but only now.
 assert.equal(o.takeSeat(0),true);
});

test('an aborted extraction leaves the driver seated, not half-out',()=>{
 const o=createOccupancy(4);
 o.seat(0);o.advance(0,DRIVER.ALERT);o.advance(0,DRIVER.BEING_EXTRACTED);
 assert.equal(o.abort(0),true);
 assert.equal(o.read(0).state,DRIVER.SEATED);
 assert.equal(o.hasDriver(0),true,'aborting lost the driver');
 assert.equal(o.extract(0),null,'an aborted extraction could still be completed');
});

test('a despawned vehicle takes its driver with it',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 assert.equal(o.drivers,1);
 o.vacate(0);
 assert.equal(o.drivers,0);
 assert.equal(o.isEmpty(0),true);
 // The next car to use the slot is not born with a stranger in it.
 assert.equal(o.seat(0),true);
 assert.notEqual(o.read(0).driverId,-1);
});

// ---------------------------------------------------------------- against the real traffic

test('ordinary moving traffic has drivers, and parked cars do not',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const active=sim.pool.filter(v=>v.active);
 const moving=active.filter(v=>!v.parked&&!v.controlled);
 const parked=active.filter(v=>v.parked);
 assert.ok(moving.length>20,`only ${moving.length} moving vehicles`);
 assert.ok(parked.length>0,'no parked vehicles to check');
 for(const v of moving)
  assert.equal(sim.occupancy.hasDriver(v.id),true,`moving vehicle ${v.id} had nobody driving it`);
 for(const v of parked)
  assert.equal(sim.occupancy.hasDriver(v.id),false,`parked vehicle ${v.id} had a driver`);
 assert.equal(sim.occupancy.drivers,moving.length);
 sim.dispose();
});

test('occupancy survives a despawn, a respawn and a tier change without leaking',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const count=()=>sim.pool.filter(v=>v.active&&!v.parked&&!v.controlled).length;

 const victim=sim.pool.find(v=>v.active&&!v.parked);
 const id=victim.id;
 assert.equal(sim.occupancy.hasDriver(id),true);
 sim.despawn(victim,'test');
 assert.equal(sim.occupancy.hasDriver(id),false,'a despawned car kept its driver');

 sim.setTier('low');sim.update(1/30);
 assert.equal(sim.occupancy.drivers,count(),'tier change leaked or lost drivers');
 sim.setTier('high');sim.update(1/30);
 assert.equal(sim.occupancy.drivers,count(),'tier change leaked or lost drivers');

 // Nothing inactive is holding a seat.
 for(const v of sim.pool)if(!v.active)
  assert.equal(sim.occupancy.hasDriver(v.id),false,`inactive slot ${v.id} held a driver`);
 sim.dispose();
});

test('a car whose driver was dragged out does not quietly get a new one',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(v=>v.active&&!v.parked&&!v.controlled);
 sim.occupancy.advance(v.id,DRIVER.ALERT);
 sim.occupancy.advance(v.id,DRIVER.BEING_EXTRACTED);
 assert.ok(sim.occupancy.extract(v.id));
 v.driverless=true;                       // what the carjack sets when it pulls someone out
 for(let i=0;i<60;i++)sim.update(1/30);
 assert.equal(sim.occupancy.hasDriver(v.id),false,
  'a new driver appeared in the seat while the player was walking round to it');
 sim.dispose();
});

test('a hundred seconds of traffic never produces an invalid seat',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 for(let frame=0;frame<3000;frame++){
  sim.update(1/30);
  if(frame%250)continue;
  const seen=sim.occupancy.inspect();
  assert.equal(seen.player,0,'a player seat appeared with no player');
  assert.ok(seen.drivers>=0&&seen.drivers<=seen.capacity);
  for(const v of sim.pool){
   if(!v.active&&sim.occupancy.hasDriver(v.id))assert.fail(`inactive slot ${v.id} held a driver`);
   if(v.parked&&sim.occupancy.hasDriver(v.id))assert.fail(`parked slot ${v.id} held a driver`);
  }
 }
 sim.dispose();
});

// ---------------------------------------------------------------- the seated driver visual

test('seated drivers cost three draw calls, no skeletons and no mixers, at any traffic count',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 // Look from where the traffic actually is, not from the origin, or the budget never loads.
 const busy=sim.pool.find(v=>v.active&&!v.parked&&sim.occupancy.hasDriver(v.id));
 assert.ok(busy,'no driven traffic to look at');
 drivers.update(sim,{x:busy.x,z:busy.z});
 const seen=drivers.inspect();
 assert.ok(seen.drawn>0,'nobody was drawn in a street full of driven cars');
 assert.equal(seen.skeletons,0,'RUN 7 architecture broken: a driver grew a skeleton');
 assert.equal(seen.mixers,0,'RUN 7 architecture broken: a driver grew an AnimationMixer');
 assert.equal(seen.drawCalls,3,'a driver should not cost its own batch');
 // Three meshes, whatever the count -- the instancing is the whole point.
 assert.equal(Object.keys(drivers.meshes).length,3);
 for(const m of Object.values(drivers.meshes))assert.ok(m.isInstancedMesh);
 drivers.dispose();sim.dispose();
});

test('the driver layer is bounded by distance, not by population',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 const busy=sim.pool.find(v=>v.active&&!v.parked&&sim.occupancy.hasDriver(v.id));
 const near=drivers.update(sim,{x:busy.x,z:busy.z});
 // Somewhere with no road under it at all.
 const far=drivers.update(sim,{x:9000,z:9000});
 assert.ok(near>0);
 assert.equal(far,0,'drivers were drawn on the other side of the world');
 assert.ok(drivers.inspect().drawn<=drivers.inspect().capacity,'the budget was exceeded');
 drivers.dispose();sim.dispose();
});

test('a driver keeps one face for as long as they keep one car',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 const first=sim.occupancy.read(v.id);
 for(let i=0;i<300;i++)sim.update(1/30);
 if(sim.occupancy.hasDriver(v.id)&&v.active){
  const later=sim.occupancy.read(v.id);
  assert.equal(later.driverId,first.driverId,'the driver was silently replaced mid-journey');
  assert.equal(later.seed,first.seed,'the driver changed appearance mid-journey');
 }
 sim.dispose();
});

test('the driver layer disposes without leaving anything in the scene',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 const root=drivers.root;
 assert.equal(root.children.length,3);
 drivers.dispose();
 assert.equal(root.children.length,0,'the driver meshes outlived their layer');
 drivers.dispose();                                   // a second dispose must be harmless
 assert.equal(drivers.update(sim,{x:0,z:0}),0,'a disposed layer still drew');
 sim.dispose();
});

// ---------------------------------------------------------------- staged enter and exit

test('entry is a sequence of stages, not one move',()=>{
 const m=createVehicleTransition();
 assert.equal(m.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:Math.PI/2},
  seat:{x:2.4,z:.4,heading:0}}),true);
 const seen=[];
 for(let i=0;i<400&&m.active;i++){const p=m.update(1/60);if(p&&seen.at(-1)!==p.stage)seen.push(p.stage);}
 assert.deepEqual(seen,ENTER_STAGES.map(s=>s.name),
  `entry ran ${seen.join(' -> ')} instead of the staged sequence`);
});

test('the door opens before the body moves and shuts after it has arrived',()=>{
 const m=createVehicleTransition();
 m.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat:{x:2.4,z:.4,heading:0}});
 let openedAt=-1,movedThroughAt=-1,shutFrom=-1,clock=0,last=null;
 for(let i=0;i<400&&m.active;i++){
  const p=m.update(1/60);clock+=1/60;if(!p)break;
  if(p.stage==='DOOR_OPEN'&&p.doorPhase>.9&&openedAt<0)openedAt=clock;
  if(p.stage==='ENTRY')movedThroughAt=clock;
  if(p.door===DOOR.CLOSING&&shutFrom<0)shutFrom=clock;
  last=p;
 }
 assert.ok(openedAt>0,'the door never opened');
 assert.ok(openedAt<=movedThroughAt,'the body went through a door that was still shut');
 assert.ok(shutFrom>movedThroughAt,'the door started shutting while the body was in it');
 assert.equal(last.doorPhase,0,'the door was left open at the end');
 assert.equal(last.door,DOOR.CLOSED);
});

test('entry ends in the seat, not at the door',()=>{
 const m=createVehicleTransition();
 const seat={x:2.4,z:.4,heading:1};
 m.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat});
 let last=null;
 for(let i=0;i<400&&m.active;i++)last=m.update(1/60)??last;
 assert.ok(Math.hypot(last.x-seat.x,last.z-seat.z)<1e-6,
  `entry finished at ${last.x.toFixed(2)},${last.z.toFixed(2)} rather than in the seat`);
 assert.equal(last.seated,true);
});

test('the player is only reported seated once the body has arrived',()=>{
 const m=createVehicleTransition();
 m.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat:{x:2.4,z:.4,heading:0}});
 for(let i=0;i<400&&m.active;i++){
  const p=m.update(1/60);if(!p)break;
  if(['ALIGN','DOOR_OPEN','ENTRY'].includes(p.stage))
   assert.equal(p.seated,false,`seated was true during ${p.stage}`);
 }
});

test('exit starts in the seat and finishes where the caller said it was safe to stand',()=>{
 const m=createVehicleTransition();
 const seat={x:0,z:0,heading:0},spot={x:-2.5,z:-.4,heading:Math.PI/2};
 assert.equal(m.begin('exit',{seat,exit:spot}),true);
 const first=m.update(1/600);
 assert.ok(Math.hypot(first.x-seat.x,first.z-seat.z)<.05,'exit began outside the car');
 let last=first;
 for(let i=0;i<400&&m.active;i++)last=m.update(1/60)??last;
 assert.ok(Math.hypot(last.x-spot.x,last.z-spot.z)<1e-6,'exit did not reach the safe spot');
 assert.equal(last.doorPhase,0,'the door was left open after getting out');
});

test('a frame long enough to step over a whole stage does not skip it',()=>{
 const m=createVehicleTransition();
 m.begin('enter',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat:{x:2.4,z:.4,heading:0}});
 // One enormous frame. The sequence must still finish cleanly rather than stall or produce
 // a pose from a stage that no longer exists.
 const p=m.update(10);
 assert.equal(p.done,true);
 assert.equal(p.seated,true);
 assert.equal(p.doorPhase,0);
 assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.heading));
 assert.equal(m.active,false);
});

test('a transition refuses to start on waypoints that are not numbers',()=>{
 const m=createVehicleTransition();
 assert.equal(m.begin('enter',{start:{x:NaN,z:0,heading:0},entry:{x:1,z:1,heading:0},
  seat:{x:2,z:2,heading:0}}),false,'a NaN waypoint was accepted');
 assert.equal(m.active,false);
 assert.equal(m.begin('sideways',{start:{x:0,z:0,heading:0}}),false,'an unknown kind was accepted');
});

test('only one transition runs at a time',()=>{
 const m=createVehicleTransition();
 const points={start:{x:0,z:0,heading:0},entry:{x:1,z:0,heading:0},seat:{x:2,z:0,heading:0}};
 assert.equal(m.begin('enter',points),true);
 assert.equal(m.begin('enter',points),false,'a second entry started on top of the first');
 assert.equal(m.begin('exit',{seat:{x:0,z:0,heading:0},exit:{x:3,z:0,heading:0}}),false);
 const was=m.cancel();
 assert.equal(was.kind,'enter');
 assert.equal(m.active,false);
 assert.equal(m.begin('enter',points),true,'cancelling did not free the transition');
});

// ---------------------------------------------------------------- the carjack

test('the carjack sequence puts the extraction between the door and the seat',()=>{
 const m=createVehicleTransition();
 m.begin('carjack',{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat:{x:2.4,z:.4,heading:0}});
 const seen=[];
 for(let i=0;i<900&&m.active;i++){const p=m.update(1/60);if(p&&seen.at(-1)!==p.stage)seen.push(p.stage);}
 assert.deepEqual(seen,CARJACK_STAGES.map(s=>s.name));
 // The three that matter are between the door opening and the body moving to the seat.
 const at=n=>seen.indexOf(n);
 assert.ok(at('DOOR_OPEN')<at('GRAB'),'the driver was grabbed through a shut door');
 assert.ok(at('THROW')<at('ENTRY'),'the player got in before the driver was out');
});

test('an empty parked car is not routed through an extraction',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const parked=sim.pool.find(v=>v.active&&v.parked);
 assert.ok(parked);
 assert.equal(isOccupied(sim,parked),false);
 assert.equal(canCarjack(sim,parked),false,'an empty car offered a carjack');
 sim.dispose();
});

test('a moving car refuses the carjack, and the same car stopped accepts it',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 assert.ok(v);
 v.speed=6;
 assert.equal(isOccupied(sim,v),true,'the driver vanished when the car moved');
 assert.equal(canCarjack(sim,v),false,'a car doing 6 m/s was jackable');
 v.speed=0;
 assert.equal(canCarjack(sim,v),true,'a stopped car with a driver was not jackable');
 sim.dispose();
});

test('the driver leaves the seat only at the throw, and the player cannot take it before',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 v.speed=0;

 // Through the sequence, one stage at a time, checking the seat after each.
 assert.equal(sim.occupancy.takeSeat(v.id),false,'the player took an occupied seat');
 assert.equal(alertDriver(sim,v),true);
 assert.equal(sim.occupancy.read(v.id).stateName,'ALERT');
 assert.equal(sim.occupancy.takeSeat(v.id),false,'the player took the seat from an alerted driver');
 assert.equal(beginExtraction(sim,v),true);
 assert.equal(sim.occupancy.read(v.id).stateName,'BEING_EXTRACTED');
 assert.equal(sim.occupancy.takeSeat(v.id),false,'the player took the seat mid-extraction');
 assert.equal(sim.occupancy.hasDriver(v.id),true,'the seat emptied before the throw');
 sim.dispose();
});

test('an aborted carjack leaves the driver in the car and nobody on the road',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 const before=sim.occupancy.read(v.id);
 alertDriver(sim,v);beginExtraction(sim,v);
 assert.equal(abortCarjack(sim,v),true);
 const after=sim.occupancy.read(v.id);
 assert.equal(after.stateName,'SEATED','the driver was left hanging out of the door');
 assert.equal(after.driverId,before.driverId,'aborting swapped the driver');
 assert.equal(sim.occupancy.drivers>0,true);
 // And the sequence cannot then be finished without starting again.
 assert.equal(sim.occupancy.extract(v.id),null,'an aborted extraction still completed');
 sim.dispose();
});

test('no duplicate driver: one carjack produces one person, and the seat stays empty',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 alertDriver(sim,v);beginExtraction(sim,v);
 const first=sim.occupancy.extract(v.id);
 assert.ok(first);
 v.driverless=true;
 // A second throw must find nobody, or a carjack could mint people.
 assert.equal(sim.occupancy.extract(v.id),null,'the same driver was extracted twice');
 for(let i=0;i<120;i++)sim.update(1/30);
 assert.equal(sim.occupancy.hasDriver(v.id),false,'the seat refilled behind the player');
 sim.dispose();
});

test('the person thrown out of the car is the person who was sitting in it',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const crowd=new CrowdSimulation(network,{traffic:sim,tier:'medium'});
 sim.update(1/30);crowd.update(1/30);

 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 v.speed=0;
 const seated=sim.occupancy.read(v.id);
 const peopleBefore=crowd.pool.filter(p=>p.active).length;

 alertDriver(sim,v);beginExtraction(sim,v);
 const out=throwDriverOut(sim,crowd,v,-1);

 assert.ok(out,'nobody came out of the car');
 assert.equal(out.driverId,seated.driverId,'a different person got out than was driving');
 assert.ok(out.pedestrian,`no pedestrian was created: ${out.reason}`);
 // IDENTITY. The crowd renderers dress a pedestrian from `appearanceId` when it exists, so
 // the driver keeps their face on the way out rather than becoming whoever owns that slot.
 assert.equal(out.pedestrian.appearanceId,seated.seed,'the driver changed appearance getting out');
 assert.equal(appearanceOf(out.pedestrian.appearanceId).archetype.id,
              appearanceOf(seated.seed).archetype.id);

 // They are a real body in the world, off their feet, near the car they came out of.
 assert.equal(out.pedestrian.active,true);
 assert.equal(out.thrown,true,'the driver was placed but never knocked down');
 assert.notEqual(out.pedestrian.struck,undefined,'the driver is not in the knockdown chain');
 assert.ok(Math.hypot(out.pedestrian.x-v.x,out.pedestrian.z-v.z)<4,
  'the driver landed nowhere near the car');
 assert.ok(crowd.pool.filter(p=>p.active).length>peopleBefore-1);

 // The seat is empty, and stays empty.
 assert.equal(sim.occupancy.hasDriver(v.id),false);
 assert.equal(v.driverless,true);
 // ...and only now may the player have it.
 assert.equal(sim.occupancy.takeSeat(v.id),true);

 // Everything about the body is finite -- a NaN here is invisible until the renderer folds.
 for(const k of ['x','z','height','heading','struck'])
  assert.ok(Number.isFinite(out.pedestrian[k]),`${k} is not finite`);
 crowd.dispose?.();sim.dispose();
});

test('the extracted driver stays a pedestrian through recovery with a stable appearance',()=>{
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const crowd=new CrowdSimulation(network,{tier:'low'});
 const p=crowd.pool.find(q=>q.active&&!q.choreographed);
 assert.ok(p);
 const appearance=4242;
 p.appearanceId=appearance;p.cameFromVehicle=5;
 assert.equal(crowd.strike(p,1,0,3.1),true);
 for(let i=0;i<165;i++)crowd.update(1/30);
 assert.equal(p.active,true,'the extracted driver vanished instead of recovering');
 assert.equal(p.struck,undefined,'the extracted driver cannot resume ordinary perception');
 assert.equal(p.appearanceId,appearance,'their appearance changed during recovery');
 assert.ok(network.nodes[p.node],'the recovered driver was assigned no route origin');
 crowd.despawn(p,'test');
 const recycled=crowd.spawn('ambient');
 assert.ok(recycled);
 assert.equal(recycled.appearanceId,undefined,'another citizen inherited the driver face');
 assert.equal(recycled.cameFromVehicle,undefined,'another citizen inherited the driver history');
 crowd.dispose();
});

test('the extracted driver is findable in the crowd grid, not lost between cells',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const crowd=new CrowdSimulation(network,{traffic:sim,tier:'medium'});
 sim.update(1/30);crowd.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 alertDriver(sim,v);beginExtraction(sim,v);
 const out=throwDriverOut(sim,crowd,v,-1);
 assert.ok(out?.pedestrian);
 // Anything that moves a pedestrian outside `move` has to rewrite the grid bucket by hand:
 // insert them in the new cell AND take them out of the old one. Doing only the first leaves
 // the same body in two cells, which every neighbour query then counts twice -- silent, and
 // exactly the sort of thing that is only ever found as a symptom somewhere else.
 const bucket=crowd.grid.get(crowd.cell(out.pedestrian.x,out.pedestrian.z))??[];
 assert.ok(bucket.includes(out.pedestrian),'the thrown driver was left in their old grid cell');
 let appearances=0;
 for(const cell of crowd.grid.values())for(const q of cell)if(q===out.pedestrian)appearances++;
 assert.equal(appearances,1,`the thrown driver is in ${appearances} grid cells at once`);
 // And the simulation carries them without complaint.
 for(let i=0;i<200;i++)crowd.update(1/30);
 assert.equal(crowd.audit().major,0,
  `the thrown driver broke the crowd audit: ${JSON.stringify(crowd.audit().findings)}`);
 crowd.dispose?.();sim.dispose();
});

// ---------------------------------------------------------------- handing the car back

test('a stolen car is released to traffic cleanly, with no duplicate and no leaked seat',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 const id=v.id;
 v.speed=0;
 alertDriver(sim,v);beginExtraction(sim,v);
 assert.ok(sim.occupancy.extract(id));
 v.driverless=true;
 assert.equal(sim.occupancy.takeSeat(id),true);
 assert.equal(sim.occupancy.playerVehicle,id);

 // The player gets out and walks away; the slot goes back to being ordinary traffic.
 assert.equal(sim.occupancy.leaveSeat(id),true);
 assert.equal(sim.occupancy.playerVehicle,-1);
 v.controlled=false;v.parked=true;v.driverless=false;

 // Exactly one slot carries this id -- the pool is fixed, so a "duplicate car" would be the
 // same slot counted twice or a second slot at the same pose.
 assert.equal(sim.pool.filter(x=>x.id===id).length,1);
 const here=sim.pool.filter(x=>x.active&&x!==v&&Math.hypot(x.x-v.x,x.z-v.z)<.25);
 assert.equal(here.length,0,'a second car was left standing inside the stolen one');

 // Traffic reclaims it, and because it is parked it stays empty rather than gaining a driver.
 for(let i=0;i<120;i++)sim.update(1/30);
 assert.equal(sim.occupancy.hasDriver(id),false,'a parked car was given a driver');
 assert.equal(sim.occupancy.playerVehicle,-1,'the player still holds a car they left');
 sim.dispose();
});

test('a car taken from traffic holds no signal permits',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 for(let i=0;i<200;i++)sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&x.locks.size>0)
        ??sim.pool.find(x=>x.active&&!x.parked);
 assert.ok(v);
 sim.releasePermits(v);
 assert.equal(v.locks.size,0,'a taken car kept a signal lock');
 for(const owner of sim.reservations.values())
  assert.notEqual(owner,v.id,'a taken car kept a junction reservation');
 // A held group is what froze every signal on the map once before; the audit must stay clean.
 for(let i=0;i<300;i++)sim.update(1/30);
 assert.equal(sim.audit().major,0);
 assert.equal(sim.stats.redViolations,0);
 sim.dispose();
});

test('the occupancy model survives a thousand random transitions without a contradiction',()=>{
 // Not a scenario -- a fuzz. The invariants are the point, and they must hold whatever order
 // the calls arrive in, including the illegal ones.
 const o=createOccupancy(16);
 let seed=12345;
 const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
 for(let i=0;i<1000;i++){
  const v=rnd(16);
  switch(rnd(7)){
   case 0:o.seat(v);break;
   case 1:o.advance(v,DRIVER.ALERT);break;
   case 2:o.advance(v,DRIVER.BEING_EXTRACTED);break;
   case 3:o.extract(v);break;
   case 4:o.takeSeat(v);break;
   case 5:o.leaveSeat(v);break;
   default:o.vacate(v);break;
  }
  // The player is in one car or none, and that car agrees that they are in it.
  const pv=o.playerVehicle;
  if(pv>=0)assert.equal(o.read(pv).type,OCCUPANT.PLAYER,`vehicle ${pv} disagrees about the player`);
  let players=0;
  for(let k=0;k<16;k++)if(o.read(k).type===OCCUPANT.PLAYER)players++;
  assert.ok(players<=1,`${players} cars hold the player at once`);
  assert.equal(players,pv>=0?1:0,'playerVehicle and the seats disagree');
 }
 const seen=o.inspect();
 assert.equal(seen.none+seen.drivers+seen.player,seen.capacity,'the seats do not add up');
});

test('a carjack reports the player seated, exactly as an entry does',()=>{
 // The bug this pins: the commit branch tested `kind === 'enter'`, so a carjack ran its whole
 // sequence -- driver alerted, hauled out, thrown on the road -- and then handed the car back,
 // because the one line that takes the wheel did not recognise the kind that had just earned
 // it. A carjack IS an entry with a fight spliced into the middle, and both end the same way.
 for(const kind of ['enter','carjack']){
  const m=createVehicleTransition();
  m.begin(kind,{start:{x:0,z:0,heading:0},entry:{x:2,z:0,heading:0},seat:{x:2.4,z:.4,heading:0}});
  let last=null;
  for(let i=0;i<900&&m.active;i++)last=m.update(1/60)??last;
  assert.equal(last.done,true,`${kind} never finished`);
  assert.equal(last.seated,true,`${kind} finished without reporting the player seated`);
  assert.equal(last.doorPhase,0,`${kind} left the door open`);
 }
 // An exit is the one that must NOT report seated -- it ends with the body on the pavement.
 const m=createVehicleTransition();
 m.begin('exit',{seat:{x:0,z:0,heading:0},exit:{x:-3,z:0,heading:0}});
 let last=null;
 for(let i=0;i<900&&m.active;i++)last=m.update(1/60)??last;
 assert.equal(last.seated,false,'getting out reported the player seated');
});

test('a driver still gets out when the crowd pool is full',()=>{
 // Found by browser QA, not by a test: at HIGH the crowd pool is saturated -- nearly two
 // thousand people, all active -- so `spawn` fails and the driver left the seat with no body
 // arriving. They simply ceased to exist. One distant pedestrian is retired to make room.
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 const network=buildPedestrianNetwork(data,{ground,generic,street,core});
 const crowd=new CrowdSimulation(network,{traffic:sim,tier:'medium'});
 sim.update(1/30);crowd.update(1/30);

 // Saturate it: every slot active, exactly as the live scene is.
 while(crowd.spawn('ambient'));
 assert.equal(crowd.spawn('ambient'),false,'the pool was not actually full');
 const activeBefore=crowd.pool.filter(q=>q.active).length;

 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 const seated=sim.occupancy.read(v.id);
 alertDriver(sim,v);beginExtraction(sim,v);
 const out=throwDriverOut(sim,crowd,v,-1);

 assert.ok(out,'nobody was extracted');
 assert.ok(out.pedestrian,`the driver vanished instead of getting out: ${out.reason}`);
 assert.equal(out.thrown,true,'the driver was placed but never knocked down');
 assert.equal(out.pedestrian.appearanceId,seated.seed,'the replacement wore the wrong face');
 // Exactly one slot was freed, not a handful.
 assert.equal(crowd.pool.filter(q=>q.active).length,activeBefore,
  'making room changed the population');
 // And the retired pedestrian released whatever they were holding: the audit stays clean.
 for(let i=0;i<200;i++)crowd.update(1/30);
 assert.equal(crowd.audit().major,0,
  `retiring a pedestrian to make room broke the crowd: ${JSON.stringify(crowd.audit().findings)}`);
 crowd.dispose?.();sim.dispose();
});
