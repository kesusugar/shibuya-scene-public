// PLAN-LOOKS-AND-FLEET Step B: traffic on the loft, one BatchedMesh per part, paint per car.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ShaderLib,Matrix4} from 'three';
import {buildTraffic} from '../src/traffic/render.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {FLEET_PARTS,PAINT_MIX,PAINT_CLASS,TAXI_SCHEMES,LIVERY,paintOf,fleetGeometry,FLEET_LIVERY_GLSL} from '../src/traffic/fleet.mjs';
import {noAO} from '../src/fidelity/pipeline.mjs';
import {buildVehicleShape} from '../src/traffic/vehicle-shape.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
function traffic(tier='high'){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 return buildTraffic(data,{graph,tier});
}
const trafficMeshes=root=>{const out=[];root.traverse(o=>{if(/^traffic-/.test(o.name)&&o.name!=='traffic-headlight-halos')out.push(o);});return out;};

test('the general paint mix is within 3% of the plan table',()=>{
 const n=100000,count={};
 for(let id=0;id<n;id++){const p=paintOf(id,'sedan');count[p.name]=(count[p.name]??0)+1;}
 for(const e of PAINT_MIX.general){
  const share=(count[e.name]??0)/n;
  assert.ok(Math.abs(share-e.share/100)<.03,`${e.name}: ${share.toFixed(3)} vs ${e.share/100}`);
 }
 const table={'pearl white':.30,black:.20,'silver and grey':.20,'dark blue':.08,red:.05};
 for(const [name,share] of Object.entries(table))
  assert.equal(PAINT_MIX.general.find(e=>e.name===name).share/100,share,`${name} is not the plan's share`);
});

test('vans lean white, kei cars get pastels, taxis wear generic schemes',()=>{
 const white=t=>{let w=0;for(let id=0;id<20000;id++)if(paintOf(id,t).name==='pearl white')w++;return w/20000;};
 assert.equal(PAINT_CLASS.van,'commercial');assert.ok(white('van')>white('sedan')+.2);
 let pastel=0;for(let id=0;id<20000;id++)if(paintOf(id,'kei').name==='pastel')pastel++;
 assert.ok(pastel/20000>.25,`kei pastels ${pastel/20000}`);
 const names=new Set();for(let id=0;id<2000;id++)names.add(paintOf(id,'taxi').name);
 assert.deepEqual([...names].sort(),TAXI_SCHEMES.map(s=>s.name).sort());
 assert.equal(paintOf(7,'bus').livery,LIVERY.bus.id);
});

test('paint is a pure function of the car id',()=>{
 for(let id=0;id<146;id++)for(const t of Object.keys(VEHICLES))assert.deepEqual(paintOf(id,t),paintOf(id,t));
 const hexes=new Set();for(let id=0;id<146;id++)hexes.add(paintOf(id,'sedan').hex);
 assert.ok(hexes.size>=8,'every sedan the same colour is paint per type, not per car');
});

test('every lofted type has body, glass, dark, front and rear',()=>{
 for(const type of Object.keys(VEHICLES)){
  if(type==='scooter')continue;   // no glasshouse; it keeps the box scooter
  const g=fleetGeometry(type);
  for(const part of FLEET_PARTS)assert.ok(g[part]?.attributes.position.count>0,`${type} has no ${part}`);
  for(const part of FLEET_PARTS)assert.ok(g[part].attributes.position.array.every(Number.isFinite));
 }
});

test('traffic draws in six batches whatever the number of types, named as day-night expects',()=>{
 const t=traffic('high');
 t.update(1/30);
 const meshes=trafficMeshes(t.root);
 // Step P: the patrol car's light-bar lens is a sixth, optional batch (like `glass` already
 // skips the scooter, this one is skipped by every type but the patrol car) -- the plan allows
 // at most one extra draw call for all police cars together, spent here.
 assert.equal(meshes.length,6,meshes.map(m=>m.name).join());
 assert.ok(meshes.every(m=>m.isBatchedMesh));
 // Before Step B this was one InstancedMesh per type and part: 34 at HIGH.
 const before=Object.keys(VEHICLES).length*5-1;
 assert.ok(meshes.length<=before);
 assert.ok(meshes.some(m=>/^traffic-.*-front$/.test(m.name)),'day-night ramps the headlamps by this name');
 assert.ok(meshes.some(m=>/^traffic-.*-rear$/.test(m.name)),'day-night ramps the tail lamps by this name');
 assert.ok(meshes.some(m=>m.name==='traffic-fleet-lightbar'),'the patrol car has its own light-bar batch');
 for(const m of meshes)if(/-(front|rear)$/.test(m.name))assert.ok(noAO(m),`${m.name} lost its no-AO exemption`);
 assert.ok(t.stats.batches<=39);
 t.dispose();
});

test('each active car is exactly one visible instance per part it has',()=>{
 const t=traffic('high');
 for(let i=0;i<30;i++)t.update(1/30);
 const body=t.meshes.body,glass=t.meshes.glass;
 let active=0,scooters=0;
 for(const v of t.sim.pool){
  const shown=v.active&&!v.playerVisual;
  assert.equal(body.getVisibleAt(v.id),shown,`car ${v.id}`);
  if(shown){active++;if(v.type==='scooter'){scooters++;assert.equal(glass.getVisibleAt(v.id),false);}}
 }
 assert.ok(active>=40,`only ${active} cars`);
 const m=new Matrix4();
 const car=t.sim.pool.find(v=>v.active&&!v.playerVisual);
 body.getMatrixAt(car.id,m);
 assert.ok(Math.abs(m.elements[12]-car.x)<1e-4&&Math.abs(m.elements[14]-car.z)<1e-4);
 t.dispose();
});

test('the livery band is written into the body shader, and every directive starts its line',()=>{
 const t=traffic('low');
 const material=t.meshes.body.material;
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 assert.ok(FLEET_LIVERY_GLSL.endsWith('\n'));
 assert.ok(shader.fragmentShader.includes(FLEET_LIVERY_GLSL));
 assert.ok(shader.vertexShader.includes('vFleetY=position.y'));
 // Found on the device: guarded by USE_BATCHING_COLOR, which three defines only for the vertex
 // stage, the livery compiled out of the fragment shader and every taxi was one colour.
 assert.doesNotMatch(FLEET_LIVERY_GLSL,/USE_BATCHING_COLOR/,'a vertex-only macro guards fragment code');
 assert.match(FLEET_LIVERY_GLSL,/#ifdef USE_COLOR_ALPHA/);
 for(const src of [shader.vertexShader,shader.fragmentShader])for(const line of src.split('\n'))
  if(line.includes('#'))assert.match(line.trimStart(),/^(#|\/\/)/,line);
 t.dispose();
});

test('a car keeps its paint when it re-spawns as the same type',()=>{
 const a=paintOf(12,'taxi'),b=paintOf(12,'taxi');
 assert.equal(a.hex,b.hex);assert.equal(a.livery,b.livery);
});

// PLAN-POLICE-VOICE-KAZE-DETAIL Step P: the patrol car reads as a Japanese black-and-white.
test('the police livery band sits at the beltline, not down in the door',()=>{
 const shape=buildVehicleShape('police',{detail:0});
 const pos=shape.geometry.paint;
 let beltY=-Infinity;
 for(let i=0;i<pos.attributes.position.count;i++){
  if(Math.abs(pos.attributes.position.getZ(i))<.05)beltY=Math.max(beltY,pos.attributes.position.getY(i));
 }
 const h=VEHICLES.police.height,bandY=LIVERY.police.band*h;
 assert.ok(Math.abs(bandY-beltY)<.15,`band ${bandY.toFixed(3)} vs the actual beltline ${beltY.toFixed(3)}`);
 assert.ok(bandY>h*.55,'the band must not sit down in the lower door');
});

test('the light bar is rounded, sits above the roof, and is not the tail lamp',()=>{
 const shape=buildVehicleShape('police',{detail:0});
 const h=VEHICLES.police.height;
 assert.ok(shape.anchors.lightbar[1]>h*.95,'the light bar must sit above the roof');
 const g=fleetGeometry('police');
 assert.ok(g.lightbar,'the patrol car has no light-bar batch');
 assert.ok(g.lightbar.attributes.position.count>0);
 // A box loft (the old flat plank) has a handful of vertices; a cylinder with more than 8
 // radial segments, three of them merged (two lens segments and two grille lamps), does not.
 assert.ok(g.lightbar.attributes.position.count>150,`too few vertices to be rounded: ${g.lightbar.attributes.position.count}`);
});

test('the light bar costs the plan\'s allowed one extra draw call, not more',()=>{
 const t=traffic('high');
 t.update(1/30);
 const meshes=trafficMeshes(t.root);
 assert.equal(meshes.length,6);
 t.dispose();
});
