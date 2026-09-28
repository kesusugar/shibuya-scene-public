import {edgeContact,respondToContact} from './vehicle-contact.mjs';
import {createPedestrianWarnings} from './pedestrian-threat.mjs';
import {handling,suspension,resetDynamics} from './vehicle-dynamics.mjs';
// The car the player drives.
//
// It is a reserved slot in the traffic pool, not a new object. That slot still enters the
// simulation's spatial grid, so the AI cars' own look-ahead sees it and stops behind it,
// and the existing renderer draws it because it draws whatever is in the pool. What the
// simulation no longer does is steer it, audit it, or hold the pedestrian phase red for it.
//
// Handling uses planar momentum with four-point suspension; the traffic slot remains authoritative.

import {clipCameraArm} from './camera.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {DODGE_SPEED} from '../life/simulation.mjs';
import {safePose} from '../traffic/graph.mjs';
import {corners, boxOverlap, pose} from '../traffic/path.mjs';
import {bounds, inPolygon} from '../geo/core.mjs';
import {worldAnchor} from '../traffic/vehicle-anchors.mjs';
import {vehicleImpact, slowBy} from './vehicle-impact.mjs';
import {crash, personStrike, wearOf} from './car-damage.mjs';

/**
 * PLAN-POLICE-AND-OWN-CAR Step H: the player's own car. It is lost when it is gone from the
 * pool, has been left more than `lostDistance` away, or was left wrecked; after `returnDelay`
 * seconds of being lost it is parked again at the nearest legal spot near the player.
 */
export const OWN = Object.freeze({lostDistance: 160, returnDelay: 6, wrecked: .95});

export const CAR = Object.freeze({
 type: 'ownCar',
 accel: 6.5, brake: 11, drag: 1.4,      // m/s^2
 reverseMax: 4.5,                        // reverse is slower than forward, as it should be
 steer: 1.9,                             // rad/s at full lock
 steerEase: 6,                           // how fast the wheel reaches full lock
 // Inertia. `heading` is where the nose points, `course` is where the body is actually
 // going, and they converge at `grip` per second rather than instantly -- that lag is the
 // slide. It is self-limiting: steering authority already falls away as the car slows, so a
 // parking car barely builds any slip while a fast turn washes out properly.
 grip: 9,
 slipMax: .45,                           // rad the course may lag the nose by, about 26 deg
 carPad: .05,                            // m of clearance kept from other cars
 // m of clearance kept from buildings, walls and platforms, by axis. See clearOfSolids.
 solidEnd: .55, solidSide: .25,
 // m a parked car keeps its whole body from every lane and junction centreline.
 parkClear: 1.9,
 // shoves a downed body can take from the car before it is left behind (RUN 11.1).
 runOverHits: 3,
 // Steering authority falls away as the car slows, so a stopped car does not spin on the
 // spot, and a fast one is not twitchy.
 steerLow: 1.2, steerFull: 7,
 enterRange: 5.5,                        // the car parks on the road, the player waits on the kerb
 kerbLift: 9,                            // m/s the body rises and falls mounting a kerb
 pivot: 1.1,                             // rad/s the wheel turns the body when it cannot move
 // A body is a small box for this purpose; the crowd's own radius is .25.
 bodyWidth: .5, bodyLength: .5,
 // Getting out of the way. People react to where the car is going to be, not to where it
 // is, so the corridor is the body swept forward by `alertLead` seconds of travel. Below
 // `alertSpeed` a car is just traffic and nobody scatters for it.
 alertSpeed: 3, alertLead: 1.5, alertReach: 18, alertWidth: 2.6,
 // Damage. A hit costs speed proportional to how fast it was taken, and a wrecked car keeps
 // only `wreckFloor` of its performance -- it never becomes undriveable.
 damagePerSpeed: .025, wreckFloor: .45,
 throwOff: 6.5,                          // m/s lost in one hit that throws a rider off two wheels
 takeOverRange: 6,                       // how far you can reach another car to take it over
 stealRange: 3.8,                        // stopped traffic can be pulled from the driver's door
 // The camera rides further back and higher than the walking one: at 11 m/s the walking
 // arm puts the road under the bonnet and nothing else in frame.
 followBack: 9.8, followUp: 3.6, eye: 1.4
});

/** Do two segments cross? Used to catch a wall thinner than the car's corner spacing. */
/** Shortest signed angle between two headings. */
function wrapAngle(a) {return Math.atan2(Math.sin(a), Math.cos(a));}

function segmentsCross(a, b, c, d) {
 const s = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
 return s(a, b, c) !== s(a, b, d) && s(c, d, a) !== s(c, d, b);
}

export function createPlayerVehicle(sim, ctx) {
 // Not const: taking over a parked van makes the player a van, and every box test from the
 // pose check to the strike scan has to use the body that is actually being driven.
 let def = VEHICLES[CAR.type];
 const state = {x: 0, z: 0, y: 0, heading: 0, course: 0, speed: 0, steering: 0,
                type: CAR.type, damage: 0, stalled: false, active: false, slot: null};
 resetDynamics(state);
 const warnPedestrians=createPedestrianWarnings();
 const probe = {x: 0, z: 0, heading: 0};
 const impacts = [];        // this step's pedestrian contacts; see strikePedestrians
 let contact=null, impactCooldown=0;

 /**
  * Is this pose legal for the car?
  *
  * safePose asks two things: that all four corners sit on carriageway, and that the body
  * touches nothing solid. Driving over a kerb means dropping the first and keeping the
  * second -- a car may leave the road, it may not drive through a wall. The solid half is
  * reimplemented here rather than loosened in traffic/graph.mjs, which is a STATIC_ROOT and
  * would have moved the static pack's key for something only the player ever does.
  */
 const clearOfSolids = (x, z, heading) => {
  probe.x = x; probe.z = z; probe.heading = heading;
  // Station walls and raised platforms render slightly ahead of their map solids. Keep the
  // driven body clear of the visible edge instead of allowing its bonnet into the facade.
  //
  // The margin is split by axis. Codex's fix used .55 on all four sides, and measured over
  // every sedan lane pose on the map (qa/gta-upgrade/clearance-cost.mjs) that made 35 of
  // 2,467 undrivable -- a stretch of narrow unclassified street where the AI's own sedans
  // drive, which reads as an invisible wall. All of that cost is LATERAL: the bonnet margin
  // alone loses nothing. So the ends keep the .55 that stops the bonnet entering a facade,
  // and the sides take .25, five times the original clearance and still zero lanes lost.
  const ring = corners(probe, def.width + 2 * CAR.solidSide, def.length + 2 * CAR.solidEnd, 0);
  for (const {value: s} of sim.graph.ctx.solid.query(bounds(ring))) {
   const outer = s.outer ?? s.polygon?.outer; if (!outer) continue;
   const reject=()=>{contact=edgeContact(outer,state);return false;};
   if (ring.some(p => inPolygon(p, {outer, holes: []}))) return reject();
   if (outer.some(p => inPolygon(p, {outer: ring, holes: []}))) return reject();
   // Corner-to-corner crossing, for a wall thinner than the gap between sampled points.
   for (let i = 0; i < 4; i++) for (let j = 0; j < outer.length; j++)
    if (segmentsCross(ring[i], ring[(i + 1) % 4], outer[j], outer[(j + 1) % outer.length])) return reject();
  }
  return true;
 };
 /**
  * Is this pose legal at all? Solids are static, the other cars are not, and the car has to
  * respect both -- driving through an AI car was the one thing decided but never built.
  * The traffic simulation already answers the moving half for its own cars, against the same
  * spatial grid the player's slot lives in, so it answers it here too; the player's own slot
  * is excluded or the car would collide with itself.
  */
 const poseOk = (x, z, heading) => {
  contact=null;
  if(Math.abs(x)>242||Math.abs(z)>242){
   const onX=Math.abs(x)>242;
   contact={nx:onX?-Math.sign(x):0,nz:onX?0:-Math.sign(z),x:onX?Math.sign(x)*242:state.x,z:onX?state.z:Math.sign(z)*242};return false;
  }
  if (!clearOfSolids(x, z, heading)) return false;
  probe.x = x; probe.z = z; probe.heading = heading;
  if(!sim.blocked(probe, state.type, state.slot, CAR.carPad))return true;
  // Only scan the bounded traffic pool after the broad-phase rejects a pose.
  let overlapped=false;
  for(const v of sim.pool){
   if(!v.active||v===state.slot)continue;
   const d=VEHICLES[v.type];if(!d||!boxOverlap(probe,def,v,d,CAR.carPad))continue;
   overlapped=true;
   // A car already overlapping this one (a patrol car rammed in, a car that pulled into the
   // player) must not pin it: a move that takes the player further from it is allowed, so the
   // player can always drive out of a hit. Moving closer, or into a car not already touching, is
   // still a contact.
   if(boxOverlap(state,def,v,d,CAR.carPad)&&Math.hypot(x-v.x,z-v.z)>Math.hypot(state.x-v.x,state.z-v.z)+1e-5){state.rammed=v;continue;}
   contact=edgeContact(corners(v,d.width,d.length,CAR.carPad),state);state.rammed=v;return false;
  }
  return overlapped;
 };
 /**
  * Is this spot on a pedestrian crossing? RUN 10 browser QA, scenario K: from the player start
  * the first legal road pose was ON the scramble. Its cast stops for any vehicle on its track,
  * so two dozen of them stood on the crossing for good, and because the signal controller
  * holds the cycle until a crossing clears, every signal on the map froze. The car still parks
  * on the carriageway, just never across a crossing or inside the scramble plaza.
  */
 const onCrossing = (x, z) => {
  const signals = sim.signals;
  if (!signals) return false;
  if (signals.area?.contains(x, z)) return true;     // pads by a vehicle footprint itself
  for (const c of signals.crossings?.values() ?? []) {
   const reach = c.width / 2 + def.length / 2 + .5;
   for (let i = 1; i < c.points.length; i++) {
    const a = c.points[i - 1], b = c.points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < reach) return true;
   }
  }
  return false;
 };
 /**
  * How far a point is from the nearest traffic lane or junction path, up to ~4 m. Moving the
  * car off the scramble was not enough: the next legal pose, beside it, sat in the lane the
  * central stream leaves by, and an eight-car platoon stopped behind it INSIDE the scramble
  * holding the crossing's locks -- no WALK for anyone, ever. Sampled once, on first use.
  */
 let laneCells = null;
 const laneClearance = (x, z) => {
  if (!laneCells) {
   laneCells = new Map(); const p = {};
   for (const l of [...sim.graph.lanes, ...(sim.graph.transitions ?? [])]) {
    if (!l.path) continue;
    for (let d = 0; d <= l.path.length; d += 1) {
     pose(l.path, d, p); const k = Math.floor(p.x / 4) + ',' + Math.floor(p.z / 4);
     let c = laneCells.get(k); if (!c) laneCells.set(k, c = []); c.push(p.x, p.z);
    }
   }
  }
  let m = Infinity; const ix = Math.floor(x / 4), iz = Math.floor(z / 4);
  for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++) {
   const c = laneCells.get(i + ',' + j);
   if (c) for (let n = 0; n < c.length; n += 2) m = Math.min(m, Math.hypot(c[n] - x, c[n + 1] - z));
  }
  return m;
 };
 /**
  * Somewhere a car of `type` may be parked near `x,z`: road under all four corners and road
  * ahead, out of every traffic lane if possible. Always measured with that car's own body, not
  * whichever car the player happens to be holding.
  */
 const roadFor = (x, z, heading, type) => {
  probe.x = x; probe.z = z; probe.heading = heading;
  return safePose(sim.graph.ctx, probe, type, .05);
 };
 const lanesClearFor = (x, z, heading, type) => {
  const d = VEHICLES[type];
  probe.x = x; probe.z = z; probe.heading = heading;
  return [[x, z], ...corners(probe, d.width, d.length, 0)].every(([px, pz]) => laneClearance(px, pz) > CAR.parkClear);
 };
 const findParking = (x, z, type = CAR.type) => {
  // Search outward for somewhere the car legally fits, since the player is on a pavement
  // and the car needs road under all four corners. The heading has to have road *ahead* of
  // it too: picking the first of eight that merely fits parks the car facing a kerb, and it
  // then cannot pull away.
  // First out of every traffic lane; only if there is no such room nearby, anywhere legal.
  for (const clearOfTraffic of [true, false])
  for (let r = 3; r <= 40; r += 1.5) for (let i = 0; i < 16; i++) {
   const a = i * Math.PI / 8, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
   if (onCrossing(px, pz)) continue;
   for (let h = 0; h < 16; h++) {
    const ph = h * Math.PI / 8;
    if (!roadFor(px, pz, ph, type)) continue;
    if (!roadFor(px + Math.sin(ph) * 6, pz + Math.cos(ph) * 6, ph, type)) continue;   // road ahead
    if (clearOfTraffic && !lanesClearFor(px, pz, ph, type)) continue;
    return {x: px, z: pz, heading: ph};
   }
  }
  return null;
 };

 /** Stand a pool slot, parked, at a pose, as the player's own car. */
 const park = (slot, x, z, heading) => {
  Object.assign(slot, {
   active: true, wear: null, kept: false, controlled: false, parked: true, service: false, platoon: undefined, owned: true,
   type: CAR.type, x, z, heading, speed: 0, brake: false, blinker: 0, doorPhase: 0,
   lane: 0, transition: -1, next: -1, progress: 0, age: 0, stuck: 0, junction: null
  });
  slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
 };
 let own = null, ownLostFor = 0, ownDamage = 0;

 const api = {
  state, get def(){return def;},
  /** Take a pool slot and stand the car on legal ground near `x,z`. */
  spawn(x, z, heading = 0) {
   const slot = state.slot ?? sim.pool.find(v => !v.active);
   if (!slot) return false;
   const spot = findParking(x, z);
   if (!spot) return false;
   const {x: px, z: pz, heading: ph} = spot;
   state.slot = slot; state.x = px; state.z = pz; state.heading = ph; state.course = ph;
   impactCooldown=0; resetDynamics(state); state.speed = 0; state.steering = 0; state.type = CAR.type; state.damage = 0; state.stalled = false;
   def = VEHICLES[CAR.type];
   park(slot, px, pz, ph);
   slot.controlled = true;
   own = slot; ownLostFor = 0; ownDamage = 0;
   state.active = true;
   return true;
  },

  /**
   * Stage 6: stand a vehicle of `type` parked near `x,z` for anyone to take -- the motorbikes. It is
   * `kept`: a tier change does not recycle it as surplus parked traffic. Returns the slot or null.
   */
  parkNear(type, x, z) {
   const slot = sim.pool.find(v => !v.active); if (!slot) return null;
   const spot = findParking(x, z, type); if (!spot) return null;
   Object.assign(slot, {active: true, wear: null, controlled: false, parked: true, service: false, platoon: undefined,
    owned: false, kept: true, type, x: spot.x, z: spot.z, heading: spot.heading, speed: 0, brake: false, blinker: 0,
    doorPhase: 0, lane: 0, transition: -1, next: -1, progress: 0, age: 0, stuck: 0, junction: null});
   slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
   sim.rebuildGrid?.();
   return slot;
  },

  /** The player's own car's slot, or null. */
  get own() {return own;},

  /**
   * Bring the player's own car back when it is lost. Returns true on the frame it reappears.
   * The scene calls it only while the player is on foot -- never while driving or getting in or
   * out -- so the car is never moved from under them.
   */
  keepOwn(dt, x, z) {
   const gone = !own || !own.active || !own.owned || own.type !== CAR.type;
   const far = !gone && Math.hypot(own.x - x, own.z - z) > OWN.lostDistance;
   const wrecked = !gone && ownDamage >= OWN.wrecked;
   if (!gone && !far && !wrecked) {ownLostFor = 0; return false;}
   ownLostFor += dt;
   if (ownLostFor < OWN.returnDelay) return false;
   const spot = findParking(x, z);
   if (!spot) return false;
   const slot = !gone ? own : sim.pool.find(v => !v.active);
   if (!slot) return false;
   if (!gone && slot !== state.slot) {slot.playerVisual = false;}
   park(slot, spot.x, spot.z, spot.heading);
   if (state.slot === slot) {
    state.x = spot.x; state.z = spot.z; state.heading = spot.heading; state.course = spot.heading;
    state.speed = 0; state.damage = 0; resetDynamics(state);
   }
   own = slot; ownLostFor = 0; ownDamage = 0;
   return true;
  },

  /**
   * The nearest car a person standing here could get into, which need not be the one this
   * object is currently holding. Only parked cars: stepping into moving traffic and taking
   * the wheel mid-flow would drop a car out of its lane with a queue behind it.
   */
  nearestTakeover(x, z) {
   let best = null, bestD = CAR.takeOverRange;
   for (const v of sim.pool) {
    if (!v.active || !v.parked || v === state.slot || v.controlled) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) {bestD = d; best = v;}
   }
   return best;
  },

  /**
   * Take the wheel of another car. The slot being left goes back to being ordinary parked
   * traffic -- leaving it `controlled` would hide it from the AI, the audit and the tier
   * budget for the rest of the session -- and the body being driven changes with it, so a
   * van is a van for every box test from here on.
   */
  takeOver(slot) {
   if (!api.reserve(slot)) return false;
   api.commit();
   return true;
  },

  /**
   * Claim a car without being able to drive it yet.
   *
   * RUN 9 split `takeOver` in two. It used to be one call at the moment the button went
   * down: the car became the player's, `active` went true, and the transition that followed
   * was decoration over a change that had already happened. That is the instant takeover this
   * run exists to remove.
   *
   * `reserve` does the half that has to happen FIRST, because the entry animation needs it:
   * the car is frozen so traffic cannot pull away mid-carjack, permits are released so a held
   * signal group does not stall the map while the player walks round the bonnet, and the slot
   * becomes the one the player's renderer draws, so its door can swing.
   *
   * What it deliberately does NOT do is set `active`. Every driving path is gated on that, so
   * a reserved car sits there: input does nothing, `step` returns immediately, and nothing is
   * struck by it. Control is `commit`, and that happens when the body reaches the seat.
   */
  reserve(slot) {
   if (!slot) return false;
   if (slot === state.slot) return true;
   if (state.slot === own) ownDamage = state.damage;   // left wrecked, it will be replaced
   if (state.slot) {state.slot.playerVisual = false; state.slot.controlled = false; state.slot.parked = true; state.slot.speed = 0;}
   sim.releasePermits?.(slot);
   impactCooldown=0; state.slot = slot; state.type = slot.type; def = VEHICLES[slot.type]; resetDynamics(state);
   state.x = slot.x; state.z = slot.z; state.heading = slot.heading; state.course = slot.heading;
   state.y = ctx.height(slot.x, slot.z); state.speed = 0; state.steering = 0; state.damage = 0; state.stalled = false;
   Object.assign(slot, {controlled: true, parked: true, service: false, platoon: undefined,
    speed: 0, brake: false, blinker: 0, lane: 0, transition: -1, next: -1, progress: 0,
    age: 0, stuck: 0, junction: null});
   slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
   state.active = false;
   return true;
  },

  /**
   * Take the wheel. The seat has to be free -- the occupancy model is asked, not assumed --
   * so a car whose driver is still in it cannot be driven away by the player.
   */
  commit() {
   const slot = state.slot;
   if (!slot) return false;
   if (sim.occupancy && !sim.occupancy.takeSeat(slot.id)) return false;
   state.active = true;
   return true;
  },

  /**
   * Get out of the seat while keeping the car.
   *
   * Stepping out is not the same as giving the car up: the player still owns it, it is still
   * the slot the renderer draws, and `nearestEntry` still offers it back as 'own'. What ends
   * is the OCCUPANCY -- the seat is empty the moment the body is standing on the pavement, and
   * a car the player is not sitting in must not report them as its occupant.
   */
  vacateSeat() {
   const slot = state.slot;
   if (!slot) return false;
   return !!sim.occupancy?.leaveSeat(slot.id);
  },

  /** Give a reserved car back without ever having driven it. Used when an entry is aborted. */
  unreserve() {
   const slot = state.slot;
   if (!slot || state.active) return false;
   slot.playerVisual = false; slot.controlled = false; slot.parked = true; slot.speed = 0;
   slot.doorPhase = 0;
   state.slot = null;
   return true;
  },

  /**
   * The nearest car this person could get into, and whether they are close enough yet.
   *
   * Pressing the button out of range used to do nothing at all and say nothing about why,
   * which on a phone is indistinguishable from a broken button. This is what the label reads
   * from, so the answer is on screen before the button is pressed.
   */
  nearestEntry(x, z) {
   let best = null;
   const offer = (d, range, slot, kind) => {
    if (!best || d < best.distance) best = {distance: d, range, slot, kind, inRange: d <= range};
   };
   if (state.active) offer(Math.hypot(state.x - x, state.z - z), CAR.enterRange, state.slot, 'own');
   for (const v of sim.pool) {
    if (!v.active || v === state.slot || v.controlled || v.service) continue;
    const stopped=v.parked||Math.abs(v.speed??0)<.35;
    if(!stopped)continue;
    if(!v.parked&&sim.signals?.area?.contains?.(v.x,v.z,3))continue;
    offer(Math.hypot(v.x - x, v.z - z), v.parked?CAR.takeOverRange:CAR.stealRange, v, v.parked?'parked':'steal');
   }
   return best;
  },

  /** Nearest visible driver's-door pose. It is used before ownership changes. */
  doorPose(slot=state.slot,fromX=state.x,fromZ=state.z){
   if(!slot)return null;const d=VEHICLES[slot.type],s=Math.sin(slot.heading),c=Math.cos(slot.heading),back=-d.length*.12;
   let best=null;for(const side of [-1,1]){const out=d.width/2+.38,x=slot.x+c*side*out+s*back,z=slot.z-s*side*out+c*back;
    if(ctx.solid(x,z,.22))continue;const distance=Math.hypot(x-fromX,z-fromZ);if(!best||distance<best.distance)best={x,z,heading:slot.heading+side*Math.PI/2,distance,side};}
   return best;
  },

  /**
   * The waypoints a staged entry or exit travels through, for one car and one side.
   *
   * RUN 9. These come from the vehicle's OWN anchors -- driverSeat, driverEntry, driverExit --
   * rather than from offsets invented at the call site, which is what `doorPose` still does
   * for the standing spot. `doorPose` earns that: it also tests the ground for solids, and
   * picks whichever side is actually clear. So the side comes from there and the distances
   * come from here.
   */
  anchors(slot=state.slot,side=-1){
   if(!slot)return null;
   return {seat:worldAnchor(slot,'seat',side),
           entry:worldAnchor(slot,'entry',side),
           exit:worldAnchor(slot,'exit',side),
           door:worldAnchor(slot,'door',side)};
  },

  /** Where a person standing here could get in from. */
  nearestDoor(x, z) {
   if (!state.active) return null;
   const d = Math.hypot(state.x - x, state.z - z);
   return d <= CAR.enterRange ? d : null;
  },

  /**
   * Somewhere beside the car a person can stand. The car is on the carriageway, so the point
   * immediately beside it is road too: the search has to reach the kerb, nearest first, and
   * both sides are tried before widening so you step out onto the closer pavement.
   */
  doorstep() {
   for (let out = def.width / 2 + .8; out <= 9; out += .6) {
    for (const side of [-1, 1]) for (const back of [0, -1.4, 1.4]) {
     const s = Math.sin(state.heading), c = Math.cos(state.heading);
     const x = state.x + c * side * out + s * back, z = state.z - s * side * out + c * back;
     if (ctx.safe(x, z)) return [x, z];
    }
   }
   return null;
  },

  step(dt, input) {
   if (!state.active) return;
   if(!Number.isFinite(dt)||dt<=0)return;
   dt=Math.min(dt,.1);
   if(dt>1/120){const steps=Math.ceil(dt*120);for(let i=0;i<steps;i++)api.step(dt/steps,input);return;}
   const {heading,course,travel}=handling(state,def,input,dt);
   impactCooldown=Math.max(0,impactCooldown-dt);
   const nx=state.x+Math.sin(course)*travel,nz=state.z+Math.cos(course)*travel;
   if(poseOk(nx,nz,heading)){
    state.x=nx;state.z=nz;state.heading=heading;state.course=course;state.stalled=false;
   }else{
    const hit=contact;
    const lost=hit?respondToContact(state,def,hit):Math.abs(state.speed);
    if(!hit){state.speed=0;state.lateral=0;state.yawRate=0;}
    if(lost>1&&impactCooldown===0){state.damage=Math.min(1,state.damage+lost*CAR.damagePerSpeed);impactCooldown=.25;
     // Stage 6: the dent where it hit, and the pane on that side if it was hard enough.
     if(hit&&state.slot){const r=crash(wearOf(state.slot),state,def,hit,lost);if(r?.glass)state.glassEvent={pane:r.pane,kind:r.glass,x:state.x,z:state.z};}
     // Stage 6: a hard hit on two wheels throws the rider off.
     if(def.twoWheel&&lost>=CAR.throwOff)state.thrownOff={speed:lost,heading:state.course??state.heading,nx:hit?.nx??0,nz:hit?.nz??0};}
    state.stalled=true;
    // Keep the last safe pose, then try tangent motion and a tiny outward separation.
    // Each proposal still passes the complete geometry/traffic gate.
    const s=Math.sin(state.heading),c=Math.cos(state.heading);
    const vx=s*state.speed+c*state.lateral,vz=c*state.speed-s*state.lateral;
    if(hit){
     const sx=state.x+vx*dt+hit.nx*.002,sz=state.z+vz*dt+hit.nz*.002;
     if(poseOk(sx,sz,state.heading)){state.x=sx;state.z=sz;}
    }
    state.course=state.heading+Math.atan2(state.lateral,Math.max(.01,Math.abs(state.speed)))*Math.sign(state.speed||1);
   }
   // The pedestrian context is the only one that knows ground height, and a kerb is 15 cm:
   // without this the car sinks into the pavement the moment it leaves the road.
   suspension(state,def,(x,z)=>ctx.height(x,z),dt);
   api.sync();
  },

  /** Write the pose back to the pool slot, which is what gets drawn and what the AI sees. */
  sync() {
   const slot = state.slot; if (!slot) return;
   slot.x = state.x; slot.z = state.z; slot.heading = state.heading; slot.y = state.y;
   slot.speed = Math.abs(state.speed); slot.brake = state.speed < 0 || Math.abs(state.speed) < .1;
  },

  /**
   * Who did the car just hit?
   *
   * Only the crowd cells the car actually covers are looked at -- there are nearly two
   * thousand pedestrians and the car spans a handful of two-metre cells -- and each
   * candidate is measured with the traffic model's own box overlap, so a person is judged
   * against the car exactly as the cars are against each other.
   *
   * The same threshold gates both halves of the rule. Below it the crowd treats the car as
   * an obstacle and walks around it, so it must not knock anyone down: otherwise creeping
   * into a queue, or braking to a stop in one, would scatter bodies at walking pace.
   */
  strikePedestrians(crowd) {
   impacts.length = 0;
   if (!state.active || !crowd || Math.abs(state.speed) < DODGE_SPEED) return 0;
   const reach = Math.hypot(def.width, def.length) / 2 + 1;
   const x0 = Math.floor((state.x - reach) / 2), x1 = Math.floor((state.x + reach) / 2);
   const z0 = Math.floor((state.z - reach) / 2), z1 = Math.floor((state.z + reach) / 2);
   const body = {width: CAR.bodyWidth, length: CAR.bodyLength};
   const now = crowd.time ?? 0;
   let hit = 0;
   for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    for (const p of crowd.grid.get(i + ',' + j) ?? []) {
     if (!p.active || p.controlled || !boxOverlap(state, def, p, body, 0)) continue;
     // RUN 11.1: someone already down in front of the car is shoved along the road for a
     // moment and the car feels them, instead of the car passing through. Bounded: a body is
     // pushed at most CAR.runOverHits times, a third of a second apart, so nobody is carried for good.
     if (p.struck !== undefined) {
      // Only a body lying on the road: one still in its throw is not hit twice, and the car
      // catching up with a body it just threw must not rewrite where the throw sent it.
      if (Math.abs(state.speed) < 1 || p.struck < .6 || (p.flyHeight ?? 0) > .05) continue;
      if ((p.runOverAt ?? -9) > now - .35 || (p.runOverCount ?? 0) >= CAR.runOverHits) continue;
      p.runOverAt = now; p.runOverCount = (p.runOverCount ?? 0) + 1;
      // Raise the body's speed ALONG the car to a share of the car's; keep what it has across.
      const dirSign = Math.sign(state.speed) || 1, fx = Math.sin(state.course) * dirSign, fz = Math.cos(state.course) * dirSign;
      const along = (p.flyX ?? 0) * fx + (p.flyZ ?? 0) * fz, want = Math.abs(state.speed) * .45;
      if (along < want) { p.flyX = (p.flyX ?? 0) + fx * (want - along); p.flyZ = (p.flyZ ?? 0) + fz * (want - along); }
      state.speed = slowBy(state.speed, .03 * Math.abs(state.speed) + .08);
      impacts.push({id: p.id, kind: 'runover', x: p.x, z: p.z, closing: Math.abs(state.speed)});
      continue;
     }
     // Direction, strength and state from the contact itself: which face hit, where on it,
     // how fast they closed, and which way the person was already moving. See vehicle-impact.
     const r = vehicleImpact(state, def, p, {type: state.type});
     if (!r) continue;
     let landed = false;
     if (r.kind === 'push') {
      // Too slow to knock anyone down: a shove, and the person steps out of the way.
      const l = Math.hypot(r.impulse.x, r.impulse.z) || 1;
      landed = crowd.scatter?.(p, r.impulse.x / l, r.impulse.z / l, .9) ?? false;
     } else landed = crowd.strike(p, 0, 0, r.closing, r.impulse);
     if (!landed) continue;
     hit++;
     // Stage 6: thrown up onto the windscreen.
     if(state.slot&&!def.twoWheel&&r.kind!=='push'){const g=personStrike(wearOf(state.slot),r.closing);if(g)state.glassEvent={pane:'front',kind:g,x:state.x,z:state.z};}
     // Every body the car goes through costs it speed; a crowd costs it a lot.
     state.speed = slowBy(state.speed, r.speedLoss);
     impacts.push({id: p.id, kind: r.kind, contact: r.contact, x: p.x, z: p.z, closing: r.closing,
      ix: r.impulse.x, iz: r.impulse.z, iy: r.impulse.y});
    }
   }
   return hit;
  },
  /** This step's contacts, for QA, audio and camera: {id, kind, contact, closing, impulse}. */
  get impacts() {return impacts;},

  /**
   * Warn everyone the car is about to reach.
   *
   * This is the half that was missing: people dodged the car where it stood, but walked on
   * regardless of one bearing down on them, so the first they knew of it was being hit.
   * The corridor is the body swept forward by alertLead seconds of travel, and the scan
   * runs over the crowd's own grid cells, so the cost is the corridor rather than the two
   * thousand pedestrians. Whoever is inside it is told which way is out -- perpendicular to
   * the car's course, towards whichever side they are already nearer -- and the crowd does
   * the actual moving, so nobody is pushed anywhere the walkable context forbids.
   */
  alertPedestrians(crowd) {return warnPedestrians(crowd,state,def);},

  release() {
   const slot = state.slot;
   if (slot) {
    sim.occupancy?.leaveSeat(slot.id);
    slot.playerVisual = false; slot.controlled = false; slot.parked = true; slot.speed = 0;
   }
   state.active = false; state.slot = null;
  }
 };
 return api;
}

/** Third-person camera for the car, framed further back than the walking one. */
export function vehicleCamera(state, out = {}, ctx = null) {
 const facing=state.heading+wrapAngle((state.course??state.heading)-state.heading)*.45;
 const s = Math.sin(facing), c = Math.cos(facing);
 const eye = state.y + CAR.eye;
 out.x = state.x - s * (CAR.followBack+Math.abs(state.speed)*.06); out.z = state.z - c * (CAR.followBack+Math.abs(state.speed)*.06);
 out.y = eye + CAR.followUp;
 const ahead = 2.8 + Math.min(2,Math.abs(state.speed)*.12);
 out.tx = state.x + s * ahead; out.ty = eye - .1; out.tz = state.z + c * ahead;
 clipCameraArm({x:state.x,y:eye,z:state.z},out,ctx,out);
 return out;
}
