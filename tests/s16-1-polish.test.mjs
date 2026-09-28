import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildGroundModel}from '../src/ground/model.mjs';import {buildBuildingModel}from '../src/buildings/model.mjs';import {buildStationModel}from '../src/station/model.mjs';import {buildDetailModel}from '../src/station-detail/model.mjs';import {buildStreetscapeModel}from '../src/streetscape/model.mjs';import {buildTrafficGraph}from '../src/traffic/graph.mjs';import {TrafficSimulation}from '../src/traffic/simulation.mjs';import {buildPedestrianNetwork,route,edgePose}from '../src/life/network.mjs';import {CrowdSimulation}from '../src/life/simulation.mjs';import {buildCrowd}from '../src/life/render.mjs';import {QUALITY,ARCHETYPES,POOL_SIZE}from '../src/life/config.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json')),ground=buildGroundModel(data),generic=buildBuildingModel(data),core=buildStationModel(data,{ground,generic}),detail=buildDetailModel(data,{tier:'high',ground,generic,core}),street=buildStreetscapeModel(data,{tier:'high',ground,generic,core}),graph=buildTrafficGraph(data,{ground,generic,street,core}),network=buildPedestrianNetwork(data,{ground,generic,street,core,detail});
const options={ground,generic,street,core,detail,network},traffic=new TrafficSimulation(graph,{tier:'high',street}),sim=new CrowdSimulation(network,{tier:'high',traffic});

import {buildBuildings} from '../src/buildings/render.mjs';
import {installNightEmission} from '../src/environment/day-night.mjs';
test('S16.1 allocated approaches retain diverse safe cells and populated districts',()=>{
 const active=sim.pool.filter(p=>p.active),assigned=active.filter(p=>p.route.some(id=>network.edges[id].crossingId&&network.edges[id].kind!=='normal'));
 assert.ok(assigned.length>=95);assert.ok(new Set(assigned.map(p=>p.destination)).size>=15);
 for(const r of ['hachiko','station','center-gai'])assert.ok(active.filter(p=>p.region===r).length>=10,r);
 assert.ok(active.length<=QUALITY.high.total&&active.length>=350);assert.equal(sim.audit().major,0);
 writeFileSync('evidence/s16-1/allocation.json',JSON.stringify({active:active.length,assigned:assigned.length,destinations:new Set(assigned.map(p=>p.destination)).size,regions:sim.snapshot().regions},null,2));sim.dispose();traffic.dispose();
});
test('S16.1 continuous first floor glazing remains bounded to selected road frontages',()=>{
 const b=buildBuildings(data),first=b.records.shopWindows.filter(r=>r.position[1]<3.5);assert.ok(first.length>100);
 for(const r of first){const model=b.model.buildings.find(b=>b.key===r.building);assert.ok(model.frontage.distance<18);assert.ok(Math.hypot(...model.centroid)<180);assert.equal(r.scale[1],2.8);}
 assert.equal(b.stats.approximateDrawCalls,8);assert.equal(b.stats.materialChannels,7);
 writeFileSync('evidence/s16-1/storefront.json',JSON.stringify({firstFloorPanels:first.length,totalShopPanels:b.records.shopWindows.length,firstFloorGlazingArea:first.reduce((n,r)=>n+r.scale[0]*r.scale[1],0),triangles:b.stats.buildingTriangles,batches:8,materials:7},null,2));b.dispose();
});
test('S16.1 local night pool has a bounded footprint and reversible uniform',()=>{
 const material={onBeforeCompile(){},customProgramCacheKey(){return 'base';}},h=installNightEmission(material,'groundPool'),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.s12Night.value,0);h.uniform.value=1;assert.equal(shader.uniforms.s12Night.value,1);assert.ok(shader.fragmentShader.includes('float pool=0.0'));assert.ok(shader.fragmentShader.includes('i<4'));h.restore();assert.equal(shader.uniforms.s12Night.value,0);
});
