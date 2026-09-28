// Where the door, the seat and the kerb are, for every body in the scene.
//
// RUN 9. The anchors have existed since the vehicle assets were built -- driverSeat,
// driverDoor, driverEntry, driverExit, in vehicle-local metres -- and nothing used them. Enter
// and exit invented their own offsets instead (`d.width/2 + .38`, `-d.length * .12`), so the
// authoritative numbers and the numbers actually used were two different things.
//
// This is the one place that turns them into world poses. Building a vehicle shape to read
// four vectors is far too expensive to do per frame, so each body is measured ONCE and cached.
//
// SIDES. The anchors describe the driver's side only, which in these assets is -X. The player
// is allowed to approach from whichever side is clear, so `side` mirrors the anchor across the
// car: the anchor remains the authority on how far out and how far back the spot is, and only
// its sign changes. That is why nothing here hard-codes a distance.
import {VEHICLES} from './config.mjs';
import {buildVehicleShape} from './vehicle-shape.mjs';
import {buildMotorbikeShape} from './motorbike-shape.mjs';

const cache=new Map();

/** The four driver anchors for a body, in vehicle-local metres. Measured once per type. */
export function anchorsFor(type){
 if(cache.has(type))return cache.get(type);
 let found=null;
 if(VEHICLES[type]?.twoWheel){
  // Stage 6: a bike's anchors are its own (the rider stands beside it and swings a leg over).
  const a=buildMotorbikeShape().anchors;
  found={seat:a.driverSeat,door:a.driverDoor,entry:a.driverEntry,exit:a.driverExit};
 }else if(VEHICLES[type]){
  const shape=buildVehicleShape(type,{detail:0});
  const a=shape.anchors;
  if(a?.driverSeat)found={seat:a.driverSeat,door:a.driverDoor,entry:a.driverEntry,exit:a.driverExit};
  shape.dispose?.();
 }
 cache.set(type,found);
 return found;
}

/**
 * A local anchor in world space, on the given side of the car.
 *
 * `side` is -1 for the anchors' own side and +1 for the mirror. `heading` faces the car from
 * outside for entry and exit, and matches the car for the seat -- a driver sits facing
 * forwards, and someone standing at the door is looking at it.
 */
export function worldAnchor(slot,name,side=-1,out={}){
 const a=anchorsFor(slot?.type);
 if(!a||!a[name]){out.x=slot?.x??0;out.z=slot?.z??0;out.heading=slot?.heading??0;out.y=slot?.y??0;return out;}
 const [ax,ay,az]=a[name];
 // The anchors are authored on the -X side, so mirroring means flipping the sign when the
 // caller wants the other one. `side` is the side the player is on, not a multiplier.
 //
 // THE SEAT DOES NOT MIRROR. Walking round the far side of a car does not move the steering
 // wheel to meet you: the standing spot may be on either side, because that is where a body
 // can legally stand, but the driver's seat is where it is.
 const lx=name==='seat'?ax:(side>=0?-ax:ax);
 const s=Math.sin(slot.heading),c=Math.cos(slot.heading);
 out.x=slot.x+c*lx+s*az;
 out.z=slot.z-s*lx+c*az;
 out.y=(slot.y??0)+ay;
 // Facing: the seat looks where the car looks; a body outside the car looks at it.
 out.heading=name==='seat'?slot.heading:slot.heading+(side>=0?-Math.PI/2:Math.PI/2);
 return out;
}

/** Clear the memo. Only tests need this, and only to prove the cache is a cache. */
export function resetAnchorCache(){cache.clear();}
