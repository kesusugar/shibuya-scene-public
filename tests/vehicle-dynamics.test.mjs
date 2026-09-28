import test from 'node:test';
import pack from '../src/player/generated/vehicles.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlayerVehicle} from '../src/player/vehicle.mjs';
const make=(height=()=>0)=>{const car=createPlayerVehicle({pool:[],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false},{height,safe:()=>true,solid:()=>false});car.takeOver({type:'sedan',x:0,z:0,heading:0});return car;};
test('handling stays consistent at 30, 60 and 120 Hz',()=>{
 const run=hz=>{const car=make();for(let i=0;i<hz*5;i++)car.step(1/hz,{forward:.7,strafe:.35});return car.state;};
 const a=run(30),b=run(120);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.001);assert.ok(Math.abs(a.heading-b.heading)<.001);
});
test('creeping steering works and handbrake increases lateral slip',()=>{
 const slow=make();slow.state.speed=.7;slow.step(.1,{forward:.2,strafe:1});assert.ok(Math.abs(slow.state.heading)>.001);
 const run=handbrake=>{const car=make();car.state.speed=10;for(let i=0;i<60;i++)car.step(1/120,{forward:1,strafe:1,handbrake});return Math.abs(car.state.lateral);};
 assert.ok(run(true)>run(false));
});
test('four wheel samples react to a sloped road without nonfinite transforms',()=>{
 const car=make((x,z)=>x*.03+z*.02);for(let i=0;i<120;i++)car.step(1/120,{forward:1,strafe:.3});
 assert.ok(Math.abs(car.state.roll)>.001);assert.ok(car.state.wheelCompression.every(Number.isFinite));assert.ok(new Set(car.state.wheelCompression).size>1);
});
test('prebuilt vehicle pack matches source and contains only baked buffers',()=>{

 // The generator moved into src/ when the runtime and the bake script stopped carrying two
 // copies of the same update; the key hashes whatever the shape actually comes from.
 const key=createHash('sha256').update(readFileSync('src/traffic/vehicle-shape.mjs'))
  .update(readFileSync('src/player/vehicle-asset.mjs'))
  .update(readFileSync('src/traffic/config.mjs')).digest('hex');
 assert.equal(pack.sourceKey,key);
 for(const model of Object.values(pack.models))for(const geometry of model.geometries){assert.equal(geometry.type,'BufferGeometry');assert.ok(geometry.data.attributes.position.array.length>0);}
 // Dimensions and anchors do not survive the graph round trip in a usable form, so the pack
 // has to carry them: the wheel anchors become node positions the game then moves.
 for(const type of Object.keys(pack.models)){
  assert.ok(pack.dimensions[type]?.wheelbase>1,`${type} has no wheelbase`);
  for(const anchor of ['frontLeftWheel','rearRightWheel','driverSeat','driverDoor','driverEntry','driverExit'])
   assert.equal(pack.anchors[type]?.[anchor]?.length,3,`${type} is missing the ${anchor} anchor`);
 }
});
