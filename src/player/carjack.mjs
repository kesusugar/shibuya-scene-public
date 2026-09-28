// Taking a car off the person driving it.
//
// RUN 9. What this replaced was one line: `takeOver(slot)` at the moment the button went down.
// The car changed hands instantly, and since no traffic vehicle had anybody in it, there was
// nobody to take it from.
//
// The sequence lives in the transition's CARJACK stage list; this file is what happens at each
// of those stages. Nothing here decides timing, and nothing in the transition decides
// consequences -- the stage names are a schedule and these are the events.
//
// AUTHORITY, in one sentence each:
//   - the OCCUPANCY MODEL decides whether there is a driver and how far out of the seat they
//     are. It is asked, never guessed at from a mesh or from `controlled`.
//   - the CROWD SIMULATION owns the body once it is out. This file does not invent a second
//     kind of pedestrian; it spawns one of the existing ones and hands it over.
//   - the PLAYER'S VEHICLE decides ownership, and only after the seat is empty.
import {DRIVER} from '../traffic/occupancy.mjs';
import {worldAnchor} from '../traffic/vehicle-anchors.mjs';

export const CARJACK=Object.freeze({
 // A car is jackable when it is stopped or barely creeping. This is the same threshold
 // `nearestEntry` already uses to decide that traffic is stealable, and it is deliberately
 // not a GTA-style running dive -- pulling someone out of a car doing thirty is a different
 // feature, and RUN 9 is not it.
 maxSpeed:.35,
 // How hard the driver lands, in the units `crowd.strike` takes. Enough to read as thrown
 // rather than helped out, not so much that they sail across the junction.
 throwSpeed:3.1,
 // How far from the car the body is aimed, beyond the exit anchor, so they do not land
 // underneath the vehicle that is about to drive off.
 clear:.55
});

/**
 * Is this a carjack rather than an ordinary entry?
 *
 * A parked empty car is the normal case and must not be routed through the extraction
 * sequence -- there would be nobody to extract and the player would stand at the door
 * wrestling with the air.
 */
export function isOccupied(traffic,slot){
 return !!(slot&&traffic?.occupancy?.hasDriver(slot.id));
}

/** Can the extraction start at all? Occupied, and not moving. */
export function canCarjack(traffic,slot){
 if(!isOccupied(traffic,slot))return false;
 return Math.abs(slot.speed??0)<=CARJACK.maxSpeed;
}

/** The driver notices. */
export function alertDriver(traffic,slot){
 return !!traffic?.occupancy?.advance(slot?.id,DRIVER.ALERT);
}

/** The driver is being hauled out, and is past the point where they can settle back in. */
export function beginExtraction(traffic,slot){
 return !!traffic?.occupancy?.advance(slot?.id,DRIVER.BEING_EXTRACTED);
}

/**
 * The body lands on the road, and the seat is free.
 *
 * The person who gets out is the person who was sitting there: `appearanceId` carries the
 * driver's seed onto the pedestrian, so the crowd renderers dress them as the driver rather
 * than as whoever happens to own that pool slot. Arriving on the pavement as a different
 * person would undo the whole reason the driver had an identity.
 *
 * They are handed to `crowd.strike`, which is the simulation's own knock-down -- the same
 * path a car uses. That buys the entire existing reaction chain (HIT, KNOCKDOWN, DOWNED,
 * RECOVER) and the blood, the scream and the witness handling with it, rather than a second
 * knockdown architecture that would have to be kept in step with the first.
 *
 * `driverless` is set on the slot so the traffic simulation's reconcile does not put a fresh
 * driver in the seat while the player is still walking round to it.
 */
export function throwDriverOut(traffic,crowd,slot,side=-1){
 const record=traffic?.occupancy?.extract(slot?.id);
 if(!record)return null;
 slot.driverless=true;
 if(!crowd?.spawn)return {...record,pedestrian:null,reason:'no crowd'};

 const at=worldAnchor(slot,'exit',side);
 // Away from the car, along the line from the seat to the door.
 const seat=worldAnchor(slot,'seat',side);
 let dx=at.x-seat.x,dz=at.z-seat.z;
 const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
 const x=at.x+dx*CARJACK.clear,z=at.z+dz*CARJACK.clear;

 // MAKE ROOM IF THERE IS NONE.
 //
 // The crowd pool is saturated at HIGH -- nearly two thousand people, all active -- so
 // `spawn` fails and the browser QA caught exactly that: the driver left the seat and no
 // body arrived, so they simply ceased to exist. A person being dragged out of a car in
 // front of you matters more than the furthest pedestrian on the other side of the map, so
 // one is retired to make room.
 //
 // `despawn` is the right way to do it: it calls `leave` first, which releases any signal
 // group the retired pedestrian was holding. Taking someone off a crossing by hand is what
 // froze every signal on the map once before.
 let p=crowd.spawn('ambient');
 if(!p){
  let furthest=null,best=-1;
  for(const q of crowd.pool){
   if(!q.active||q.controlled||q.struck!==undefined)continue;
   const d=(q.x-slot.x)**2+(q.z-slot.z)**2;
   if(d>best){best=d;furthest=q;}
  }
  if(furthest)crowd.despawn(furthest,'carjack');
  p=crowd.spawn('ambient');
 }
 if(!p)return {...record,pedestrian:null,reason:'crowd pool full'};

 // Move them from wherever the spawn put them to the door of this car. The grid bucket has
 // to be rewritten by hand: everything that moves a pedestrian outside `move` does this, and
 // leaving them in the old cell makes them invisible to every neighbour query.
 const old=crowd.cell(p.x,p.z);
 p.x=x;p.z=z;p.renderX=x;p.renderZ=z;p.previousX=x;p.previousZ=z;
 p.height=crowd.network.ctx.height(x,z);
 p.heading=Math.atan2(dx,dz);
 p.speed=0;p.travelled=0;p.animationTime=0;
 p.crossing=null;p.queueKey=null;p.route=[];p.routeIndex=0;p.edge=-1;
 p.appearanceId=record.seed;
 p.cameFromVehicle=slot.id;
 const bucket=crowd.grid.get(old),index=bucket?.indexOf(p);
 if(index>=0)bucket.splice(index,1);
 crowd.insert(p);

 const thrown=crowd.strike(p,dx,dz,CARJACK.throwSpeed);
 return {...record,pedestrian:p,thrown,reason:thrown?null:'strike refused'};
}

/**
 * Give up. The driver settles back into the seat and the car is handed back to traffic.
 *
 * Only legal before the body is out: once `throwDriverOut` has run there is a person on the
 * road, and putting them back in the car is not an abort, it is a resurrection.
 */
export function abortCarjack(traffic,slot){
 return !!traffic?.occupancy?.abort(slot?.id);
}
