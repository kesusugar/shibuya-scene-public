import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
const ground=restoreGroundModel(pack.ground);

test('prebuilt traffic graph restores typed paths and the full HIGH fleet',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=ground;graph.data=data;
 assert.equal(graph.nodes.size,graph.stats.nodes);
 assert.equal(graph.lanes.length,graph.stats.lanes);
 assert.ok(graph.lanes.every(lane=>lane.edge===graph.edges[lane.edgeIndex??graph.edges.indexOf(lane.edge)]||graph.edges.includes(lane.edge)));
 assert.ok(graph.lanes.every(lane=>lane.path.x instanceof Float64Array&&lane.path.z instanceof Float64Array));
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});
 assert.equal(sim.snapshot().moving,62);assert.equal(sim.snapshot().parked,12);assert.equal(sim.audit().major,0);sim.dispose();
});

test('prebuilt pedestrian network restores exact graph references and the full HIGH crowd',()=>{
 const network=restorePedestrianNetwork(pack.life.high,ground);
 assert.equal(network.nodes.length,network.stats.nodes);
 assert.equal(network.edges.length,network.stats.edges);
 assert.equal(network.eligible.length,network.stats.eligible);
 assert.ok(network.eligible.every(node=>network.nodes[node.id]===node));
 assert.ok(network.crossings.every(edge=>network.edges[edge.id]===edge));
 const trafficGraph=restoreTrafficGraph(pack.traffic.high);trafficGraph.ground=ground;trafficGraph.data=data;
 const traffic=new TrafficSimulation(trafficGraph,{tier:'high',street:pack.street.high});
 const crowd=new CrowdSimulation(network,{tier:'high',traffic,choreography:true});
 assert.equal(crowd.snapshot().total,1978);assert.equal(crowd.audit().major,0);crowd.dispose();traffic.dispose();
});
