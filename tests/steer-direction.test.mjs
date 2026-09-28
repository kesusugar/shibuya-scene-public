import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer,playerCamera} from '../src/player/controller.mjs';
import {createPlayerVehicle,vehicleCamera} from '../src/player/vehicle.mjs';

// Left and right are judged on screen, so the right vector is taken from the camera the game
// actually uses rather than written by hand. A three.js camera looking along f with +y up has
// its right at f x up = (-f.z, 0, f.x).
const ctx={height:()=>0,solid:()=>false,safe:()=>true,onRoad:()=>false};
const rightOf=camera=>{
 const fx=camera.tx-camera.x,fz=camera.tz-camera.z,len=Math.hypot(fx,fz);
 return {x:-fz/len,z:fx/len};
};

for(const heading of [0,Math.PI/2,Math.PI]){
 test(`on foot at heading ${heading.toFixed(2)}, strafe right walks to the right of the screen`,()=>{
  const player=createPlayer(ctx,{start:[0,0],heading});
  player.place(0,0,heading);
  const right=rightOf(playerCamera(player.state,{}));
  player.setTouch({forward:0,strafe:1,running:false});
  for(let i=0;i<90;i++)player.step(1/60);
  const dx=player.state.x,dz=player.state.z,moved=Math.hypot(dx,dz);
  assert.ok(moved>.5,`moved only ${moved.toFixed(2)} m`);
  const along=(dx*right.x+dz*right.z)/moved;
  assert.ok(along>.9,`strafe +1 went ${along.toFixed(2)} along the camera's right`);
 });
 test(`on foot at heading ${heading.toFixed(2)}, strafe left walks to the left of the screen`,()=>{
  const player=createPlayer(ctx,{start:[0,0],heading});
  player.place(0,0,heading);
  const right=rightOf(playerCamera(player.state,{}));
  player.setTouch({forward:0,strafe:-1,running:false});
  for(let i=0;i<90;i++)player.step(1/60);
  const moved=Math.hypot(player.state.x,player.state.z);
  assert.ok((player.state.x*right.x+player.state.z*right.z)/moved<-.9);
 });
}

test('forward plus right walks forward-right, not forward-left',()=>{
 const player=createPlayer(ctx,{start:[0,0],heading:0});
 player.place(0,0,0);
 const camera=playerCamera(player.state,{}),right=rightOf(camera);
 player.setTouch({forward:1,strafe:1,running:false});
 for(let i=0;i<90;i++)player.step(1/60);
 assert.ok(player.state.z>0,'did not go forward');
 assert.ok(player.state.x*right.x+player.state.z*right.z>0,'went to the left of the screen');
});

for(const heading of [0,Math.PI/2,Math.PI]){
 test(`the car at heading ${heading.toFixed(2)} turns the view to the right on right input`,()=>{
  const car=createPlayerVehicle({pool:[],graph:{ctx:{solid:{query:()=>[]}}},blocked:()=>false},ctx);
  car.takeOver({type:'sedan',x:0,z:0,heading});
  car.state.speed=6;
  const before=vehicleCamera(car.state,{}),right=rightOf(before);
  const fx0=before.tx-before.x,fz0=before.tz-before.z;
  for(let i=0;i<30;i++)car.step(1/60,{forward:.3,strafe:1});
  const after=vehicleCamera(car.state,{});
  const fx1=after.tx-after.x,fz1=after.tz-after.z;
  // The new view direction has swung toward the old view's right.
  const swing=(fx1*right.x+fz1*right.z)/Math.hypot(fx1,fz1);
  assert.ok(swing>.05,`view swung ${swing.toFixed(3)} toward the right`);
  // And the car itself has moved off to that side.
  const side=(car.state.x*right.x+car.state.z*right.z);
  assert.ok(side>0,`car drifted ${side.toFixed(3)} m to the right`);
  assert.ok(Math.hypot(fx0,fz0)>0);
 });
}
