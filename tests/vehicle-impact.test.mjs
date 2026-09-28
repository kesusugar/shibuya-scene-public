import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleImpact,contactSpeedLoss,slowBy,IMPACT,VEHICLE_MASS} from '../src/player/vehicle-impact.mjs';

// RUN 11.1. A hit threw every body along the car's course whatever part of the car struck it,
// and fast hits flew ~36 m. These pin direction, strength, weight and the car's own loss.
const def={width:1.78,length:4.6};
const car=(o={})=>({x:0,z:0,heading:0,course:0,speed:10,...o});
const person=(o={})=>({x:0,z:2.6,heading:0,speed:0,...o});
const angle=(v)=>Math.atan2(v.x,v.z);

test('a face-on hit throws the body the way the car was going',()=>{
 const r=vehicleImpact(car(),def,person());
 assert.equal(r.contact,'front');
 assert.ok(r.impulse.z>0&&Math.abs(r.impulse.x)<.05*r.impulse.z,JSON.stringify(r.impulse));
 // and a car heading east throws east
 const e=vehicleImpact(car({heading:Math.PI/2,course:Math.PI/2}),def,person({x:2.6,z:0}));
 assert.ok(Math.abs(angle(e.impulse)-Math.PI/2)<.1);
});

test('harder is stronger, and a heavy human is pushed, not launched',()=>{
 const at=s=>vehicleImpact(car({speed:s}),def,person());
 const slow=at(1.5),mid=at(6),fast=at(12),top=at(22);
 assert.equal(slow.kind,'push');assert.equal(slow.state,'HIT');assert.equal(slow.impulse.y,0);
 assert.equal(mid.state,'KNOCKDOWN');
 const h=r=>Math.hypot(r.impulse.x,r.impulse.z);
 assert.ok(h(slow)<h(mid)&&h(mid)<h(fast)&&h(fast)<=h(top));
 assert.ok(slow.impulse.y<=mid.impulse.y&&mid.impulse.y<fast.impulse.y&&fast.impulse.y<=top.impulse.y);
 assert.ok(h(top)<=IMPACT.maxThrow+.5,'a very fast hit is capped');
 assert.ok(top.impulse.y<=IMPACT.maxLift);
 // Flight time at the cap is well under a second: no cartoon arcs.
 assert.ok(2*top.impulse.y/16<.5);
});

test('a corner catches and deflects; a side swipe throws sideways',()=>{
 const centre=vehicleImpact(car(),def,person());
 const corner=vehicleImpact(car(),def,person({x:.8}));
 assert.ok(corner.impulse.x>.5,'a body caught by the right corner goes right');
 assert.ok(Math.abs(angle(corner.impulse))>Math.abs(angle(centre.impulse)));
 // car sliding into someone standing at its right flank
 const swipe=vehicleImpact(car({speed:7,course:.6}),def,person({x:1.1,z:0}));
 assert.equal(swipe.contact,'side');
 assert.ok(swipe.impulse.x>Math.abs(swipe.impulse.z),'a side swipe should throw mostly sideways');
});

test('the victim\'s own motion counts: walking into the car hits harder than walking away',()=>{
 const towards=vehicleImpact(car({speed:5}),def,person({heading:Math.PI,speed:1.4}));
 const away=vehicleImpact(car({speed:5}),def,person({heading:0,speed:1.4}));
 assert.ok(towards.closing>away.closing);
});

test('a reversing car hits with its rear',()=>{
 const r=vehicleImpact(car({speed:-4}),def,person({z:-2.6}));
 assert.equal(r.contact,'rear');assert.ok(r.impulse.z<0);
});

test('each contact costs the car a little; many cost it a lot',()=>{
 let v=10;const after=[v];
 for(let i=0;i<20;i++){v=slowBy(v,contactSpeedLoss(v,VEHICLE_MASS.sedan));after.push(v);}
 assert.ok(after[1]>9&&after[1]<10,`one person took the car to ${after[1].toFixed(2)} m/s`);
 assert.ok(after[5]<7.5&&after[5]>5,`five people took it to ${after[5].toFixed(2)} m/s`);
 assert.ok(after[10]<5,`ten people left it at ${after[10].toFixed(2)} m/s`);
 assert.ok(after[20]<1.5,`a dense crowd left it at ${after[20].toFixed(2)} m/s`);
 // heavier vehicles lose less
 assert.ok(contactSpeedLoss(10,VEHICLE_MASS.van)<contactSpeedLoss(10,VEHICLE_MASS.sedan));
 assert.ok(contactSpeedLoss(10,VEHICLE_MASS.bus)<.3);
 // never reverses, never NaN
 assert.equal(slowBy(.1,5),0);assert.equal(slowBy(-3,1),-2);assert.equal(slowBy(4,NaN),4);
});

test('nothing non-finite comes out, whatever goes in',()=>{
 for(const [c,p] of [[car({speed:0}),person()],[car(),person({x:0,z:0})],[car({speed:30}),person({speed:NaN})],[car({course:undefined}),person()]]){
  const r=vehicleImpact(c,def,{...p,speed:Number.isFinite(p.speed)?p.speed:0});
  for(const v of Object.values(r.impulse))assert.ok(Number.isFinite(v),JSON.stringify(r));
  assert.ok(Number.isFinite(r.speedLoss));
 }
});
