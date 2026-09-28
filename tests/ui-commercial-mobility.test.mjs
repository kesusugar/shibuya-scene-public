import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commercialLayout} from '../src/signs/commercial-layout.mjs';
import {patrolRoute} from '../src/life/patrol.mjs';
import {vehicleGeometry} from '../src/traffic/render.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
import {restoreContext} from '../src/quality/static-context.mjs';
import {centralDetail} from '../src/streetscape/central-detail.mjs';
import {plazaIssues} from '../src/streetscape/plaza-clearance.mjs';
import {fixtureIssues} from '../src/streetscape/model.mjs';
import {bounds,SpatialIndex} from '../src/geo/core.mjs';
import {rotaryPath} from '../src/traffic/rotary-service.mjs';
import {safePose} from '../src/traffic/graph.mjs';
import {pose} from '../src/traffic/path.mjs';
import {CENTER_ADS,centerGaiLayout,buildCenterGai} from '../src/signs/center-gai.mjs';
import {lampGlows} from '../src/streetscape/lamp-glows.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
test('street glare is a single depth-tested batch and fades out in daylight',()=>{
 const material={emissiveIntensity:.2},glare=lampGlows([{position:[0,6.5,0]},{position:[5,6.5,0]}],material);
 assert.equal(glare.mesh.count,2);assert.equal(glare.mesh.material.depthTest,true);glare.mesh.onBeforeRender();assert.equal(glare.mesh.material.uniforms.strength.value,0);
 material.emissiveIntensity=5;glare.mesh.onBeforeRender();assert.equal(glare.mesh.material.uniforms.strength.value,.9);glare.dispose();
});
test('prebuilt plaza additions preserve roads, walking strips and existing station equipment',()=>{
 const source=structuredClone(pack.street.high),detail=pack.detail.high;
 source.context=restoreContext(source.context,restoreGroundModel(pack.ground),pack.generic);
 const result=centralDetail(source,detail),ctx={...source.context,occupied:new SpatialIndex(8)};
 assert.equal(result.centralDetail.rejected,0,'must use precomputed additions');
 assert.ok(result.centralDetail.signals>=8&&result.centralDetail.lights>=16&&result.centralDetail.trees>=4);
 for(const f of [...source.fixtures,...detail.fixtures.filter(f=>f.bottom<6)])ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);
 for(const f of result.fixtures.filter(f=>f.id.startsWith('central:'))){let issues=fixtureIssues(f,ctx);if(issues.length===1&&issues[0]==='S6-exclusion')issues=plazaIssues(f,ctx);assert.deepEqual(issues,[],f.id);ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);}
});
test('full-sized rotary bus swept path stays on-road at 10cm intervals',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high),path=rotaryPath(graph);
 assert.ok(path&&path.length>180);
 for(let d=0;d<=path.length;d+=.1)assert.ok(safePose(graph.ctx,pose(path,d),'bus'),'bus path '+d);
});
test('rotary buses dwell, depart and return without vehicle/pedestrian overlap',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const sim=new TrafficSimulation(graph,{tier:'high',heroStart:true,street:pack.street.high});
 assert.equal(sim.snapshot().rotary.buses,4);
 let walking=0;
 for(let f=0;f<5400;f++){sim.update(1/30);if(sim.signals.getPedestrianPhase('scramble')==='WALK'){walking++;assert.equal(sim.signals.areaVehicles.size,0);}if(f%30===0)assert.equal(sim.audit().major,0);}
 assert.ok(walking>500);assert.ok(sim.rotary.departures>=4);assert.ok(sim.rotary.arrivals>4);
});
test('commercial facade panels are fewer and advertiser IDs never repeat in a building',()=>{
 const signs=commercialLayout(pack.signs.high.signs),used=new Map();
 assert.ok(signs.length<pack.signs.high.signs.length*.8);
 for(const s of signs){assert.ok(s.width>0&&s.height>0&&s.position.every(Number.isFinite));if(s.screenUV)continue;
 const key=s.buildingId??s.hostKey;if(!used.has(key))used.set(key,new Set());assert.ok(!used.get(key).has(s.variant),key);used.get(key).add(s.variant);}
 assert.deepEqual(signs,commercialLayout(pack.signs.high.signs));
});
test('commercial re-layout remains inside the original facade advertising envelope',()=>{
 for(const s of commercialLayout(pack.signs.high.signs).filter(s=>s.id.includes(':commercial:'))){
  const list=pack.signs.high.signs.filter(t=>t.hostKey===s.hostKey&&t.edge?.index===s.edge?.index&&t.heading.toFixed(4)===s.heading.toFixed(4)&&!t.screenUV&&!['blade','directory','rooftop'].includes(t.category));
  assert.ok(s.along-s.width/2>=Math.min(...list.map(t=>t.along-t.width/2))-1e-6);
  assert.ok(s.along+s.width/2<=Math.max(...list.map(t=>t.along+t.width/2))+1e-6);
  assert.ok(s.position[1]-s.height/2>=Math.min(...list.map(t=>t.position[1]-t.height/2))-1e-6);
  assert.ok(s.position[1]+s.height/2<=Math.max(...list.map(t=>t.position[1]+t.height/2))+1e-6);
 }
});
test('sidewalk patrol reverses its route without using crossings or path search',()=>{
 const nodes=[0,1,2].map((id)=>({id,x:id*5,z:0,edges:[]})),edges=[];
 for(const [from,to]of [[0,1],[1,0],[1,2],[2,1]]){const id=edges.length;edges.push({id,from,to,length:5});nodes[from].edges.push(id);}
 const p={id:0,node:0,heading:Math.PI/2};assert.ok(patrolRoute({nodes,edges},p));assert.deepEqual(p.route,[0,2]);
 p.node=2;assert.ok(patrolRoute({nodes,edges},p));assert.deepEqual(p.route,[3,1]);
 p.node=0;assert.ok(patrolRoute({nodes,edges},p));assert.deepEqual(p.route,[0,2]);
});
test('all rounded vehicle geometries have finite positions and normals',()=>{
 for(const type of Object.keys(VEHICLES))for(const g of Object.values(vehicleGeometry(type))){
  assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));g.dispose();
 }
});
test('hero traffic stages a denser, collision-free central allocation with dedicated approach queues',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high,heroStart:true});
 assert.equal(sim.pool.length,146);assert.ok(sim.stats.heroStaged>=14);
 assert.ok(sim.pool.filter(v=>v.active&&Math.hypot(v.x,v.z)<85).length>=18);
 assert.equal(sim.signals.areaVehicles.size,0,'no initial cars anywhere inside the crossing');
 assert.deepEqual(sim.audit().findings,[]);sim.dispose();
});
test('complete pedestrian-green interval is clear and vehicles can cross during vehicle-green',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high,heroStart:true});let walkFrames=0,maxCrossing=0;
 for(let f=0;f<3600;f++){sim.update(1/30);maxCrossing=Math.max(maxCrossing,sim.signals.areaVehicles.size);
  if(sim.signals.getPedestrianPhase('scramble')==='WALK'){
   walkFrames++;
   for(const v of sim.pool.filter(v=>v.active))assert.equal(sim.signals.area.contains(v.x,v.z,Math.hypot(VEHICLES[v.type].width,VEHICLES[v.type].length)/2),false,'car inside pedestrian phase');
  }
  if(f%900===899)assert.deepEqual(sim.audit().findings,[]);
 }
 assert.ok(walkFrames>=590,'pedestrians get a full interval, not indefinite clearance');
 assert.ok(sim.centralStreams.entries>=20,'sustained green-phase departures');
 assert.ok(maxCrossing>=7,'several cars must traverse concurrently');
 assert.equal(sim.stats.redViolations,0);sim.dispose();
});
test('supporting cast walks while pedestrian-green keeps all cars outside',()=>{
 const graph=restoreTrafficGraph(pack.traffic.high),ground=restoreGroundModel(pack.ground);graph.ground=ground;graph.data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const traffic=new TrafficSimulation(graph,{tier:'high',street:pack.street.high,heroStart:true});traffic.signals.time=88;
 const network=restorePedestrianNetwork(pack.life.high,ground),crowd=new CrowdSimulation(network,{tier:'high',traffic,choreography:true,heroStart:true});
 const patrol=crowd.pool.filter(p=>p.active&&p.mode==='patrol');assert.ok(patrol.length>=500);
 for(let f=0;f<600;f++){traffic.update(1/30);crowd.update(1/30);assert.equal(traffic.signals.areaVehicles.size,0);}
 assert.ok(patrol.filter(p=>p.travelled>2).length>=patrol.length*.95);
 for(const p of patrol)assert.ok(network.ctx.safe(p.x,p.z),'patrol stays on walkable ground');
 assert.deepEqual(traffic.audit().findings,[]);crowd.dispose();traffic.dispose();
});

test('Center-gai ads mix business-specific art without repeating a design on one building',()=>{
 assert.equal(CENTER_ADS.length,31);assert.equal(new Set(CENTER_ADS.map(a=>a[4])).size,CENTER_ADS.length);
 const layout=centerGaiLayout();for(const id of new Set(layout.map(s=>s.building+':'+(s.surface??'original')))){const signs=layout.filter(s=>s.building+':'+(s.surface??'original')===id);assert.equal(new Set(signs.map(s=>s.variant)).size,signs.length,id);}
 const east=layout.filter(s=>s.surface==='east');assert.equal(east.length,15);assert.equal(east.filter(s=>s.building==='way/136691386').length,0);
 for(const s of east){assert.ok(s.position[1]-s.height/2>10);assert.ok(Math.sin(s.heading)>.95);assert.ok(s.variant<CENTER_ADS.length);}
 assert.ok(layout.some(s=>s.width/s.height<.3));assert.ok(layout.some(s=>s.width/s.height>2));
 assert.equal(layout.filter(s=>s.surface==='north-feature').length,3);
 assert.equal(layout.filter(s=>s.building==='way/114755219').length,30);
 assert.equal(layout.filter(s=>s.surface==='roof-rear').length,3);
 const view=buildCenterGai();assert.equal(view.stats.batches,6);assert.equal(view.stats.arches,1);
 view.root.traverse(o=>{if(o.geometry)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});view.dispose();
});
