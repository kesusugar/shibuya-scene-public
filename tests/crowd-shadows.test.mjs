import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildDetailModel} from '../src/station-detail/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {buildCrowd} from '../src/life/render.mjs';
import {createContactShadows,SHADOW} from '../src/life/shadows.mjs';
import {POOL_SIZE} from '../src/life/config.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const detail=buildDetailModel(data,{tier:'high',ground,generic,core});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core,detail});
const options={ground,generic,street,core,detail,network};

test('the shadow pool is one geometry, one material, and one draw call at any size',()=>{
 const s=createContactShadows(64);
 assert.equal(s.mesh.isInstancedMesh,true);
 assert.equal(s.mesh.geometry.type,'PlaneGeometry');
 assert.ok(!Array.isArray(s.mesh.material));
 assert.equal(s.mesh.material.transparent,true);
 assert.equal(s.mesh.material.depthWrite,false,'a shadow that writes depth punches a hole in the road');
 s.begin();for(let i=0;i<200;i++)s.add(i,0,0,.42,0);s.end();
 assert.equal(s.mesh.count,64,'the pool is bounded, not grown');
 s.dispose();});

test('a thrown body keeps its shadow on the road and loses it as it rises',()=>{
 const s=createContactShadows(8),m=new Matrix4(),p=new Vector3();
 s.begin();
 assert.equal(s.add(5,2,7,.42,0),true);
 assert.equal(s.add(5,2,7,.42,1),true);
 assert.equal(s.add(5,2,7,.42,SHADOW.airFade+.1),false,'nothing is drawn once it has faded out');
 s.end();
 assert.equal(s.drawn,2);
 // Both are at the ground height that was passed, not at the height of the body above it.
 for(const i of [0,1]){s.mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);
  assert.equal(Number(p.y.toFixed(4)),Number((2+SHADOW.lift).toFixed(4)),'shadow left the road');}
 // ...and the airborne one is the fainter of the two, by being the smaller.
 const scale=i=>{s.mesh.getMatrixAt(i,m);return new Vector3().setFromMatrixScale(m).z;};
 assert.ok(scale(1)<scale(0),'a rising body casts the same shadow as a standing one');
 s.dispose();});

test('the crowd casts one shadow per body and it survives a tier change',()=>{
 const t=new TrafficSimulation(graph,{tier:'low',street});
 const crowd=buildCrowd(data,{...options,tier:'low',traffic:t});
 crowd.update(1/30,{x:55,z:65});
 const shadow=crowd.root.getObjectByName('crowd-contact-shadows');
 assert.ok(shadow,'the crowd renders no contact shadow at all');
 const standing=crowd.sim.pool.filter(p=>p.active&&!p.controlled&&(p.flyHeight??0)<SHADOW.airFade).length;
 assert.ok(standing>0);
 assert.equal(crowd.stats.contactShadows.drawn,shadow.count);
 assert.equal(shadow.count,standing,'a body on the ground with no shadow under it');
 assert.equal(crowd.stats.contactShadows.batches,1);
 // The contract is reported apart from the decoration, and is unchanged by it.
 assert.equal(crowd.stats.geometries,13);
 assert.equal(crowd.stats.materials,3);
 assert.ok(crowd.stats.batches<=13);
 crowd.setTier('high');
 assert.ok(shadow.count>standing,'a denser crowd did not bring more shadows');
 assert.ok(shadow.count<=POOL_SIZE);
 crowd.dispose();t.dispose();});

test('disposing the crowd takes the shadows with it',()=>{
 const t=new TrafficSimulation(graph,{tier:'low',street});
 const crowd=buildCrowd(data,{...options,tier:'low',traffic:t});
 const shadow=crowd.root.getObjectByName('crowd-contact-shadows');
 crowd.dispose();
 assert.equal(shadow.parent,null);
 assert.equal(crowd.root.children.length,0);
 crowd.dispose();          // twice, like every other scene module
 t.dispose();});
