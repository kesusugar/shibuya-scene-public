import fs from 'node:fs';
import assert from 'node:assert/strict';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
const p=JSON.parse(fs.readFileSync('public/data/shibuya-static-models.json')),g=restoreTrafficGraph(p.traffic.high);g.ground=restoreGroundModel(p.ground);g.data=JSON.parse(fs.readFileSync('public/data/shibuya-scene-data.json'));
const t=new TrafficSimulation(g,{tier:'high',heroStart:true});t.signals.time=88;
const c=new CrowdSimulation(restorePedestrianNetwork(p.life.high,g.ground),{tier:'high',heroStart:true,choreography:true,traffic:t});
const greens=new Set();let walkFrames=0;for(let i=0;i<300*30;i++){t.update(1/30);c.update(1/30);for(const axis of ['NS','EW'])if(t.signals.getSignalState('scramble',axis)==='GREEN')greens.add(axis);if(t.signals.getPedestrianPhase('scramble')==='WALK'){walkFrames++;assert.equal(t.signals.areaVehicles.size,0);}if(i%900===0)console.log(JSON.stringify({seconds:i/30,phase:t.signals.phase(),ped:t.signals.pedestrians.get('scramble')?.size,entries:t.centralStreams.entries}));}
assert.equal(greens.size,2);assert.ok(walkFrames>600);assert.ok(t.centralStreams.entries>=35);console.log('PASS: repeated coupled pedestrian/vehicle phases, entries='+t.centralStreams.entries);
