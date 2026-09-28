// A hit you can see land (GTA-FIDELITY-STATUS §9ai H3, reworked §9ak): where the blow struck and
// which way it was going decide how the body gives.
//
// §9ak, from how people actually react. A round's momentum is tiny next to a body's and a cut is a
// slice, so a hit does not throw the trunk back (the first version bent it 40°, which is the film
// convention, not the body). What shows is the REFLEX: within about a tenth of a second the body
// flexes -- the trunk curls forward around the wound, the head drops, the shoulders come in -- and
// only a small part of the motion goes the way the blow travelled. So each bone gets two kicks:
//
//   flex   a fixed forward curl (a flexion reflex), whichever side the blow came from;
//   along  a small push the way the blow went (a few degrees; the head, being light, a little more).
//
//   head  -- the head snaps along the blow (about 15°) and then the neck curls it down.
//   body  -- the trunk curls forward about 20° over three bones, the head drops, a lean of a few
//            degrees along the blow.
//   legs  -- both knees give (about 20°), the hip flexes, the trunk curls forward.
//
// The knees FLEX whichever way the blow came (the first version flipped them into hyperextension
// for a blow from behind). Every blow adds to what is moving, so a burst shakes the body round
// after round; the springs are underdamped (one overshoot, still in about 0.7 s) and each bone is
// bounded. Applied after the mixer, on top of whatever the body is doing.
import {Quaternion,Vector3} from 'three';

export const HIT_REACTION = Object.freeze({
 stiffness: 90,         // 1/s^2
 damping: 10,           // 1/s: about 0.53 of critical -- one overshoot, still in about 0.7 s
 limit: .6,             // rad, per bone and axis (§9ak: no bone bends past ~35° in a flinch)
 // Per zone: [bone, along (rad/s per unit strength, the way the blow went), across, flex (rad/s
 // of forward curl, whichever way it came)]. With these springs 1 rad/s peaks at about 3°.
 zones: Object.freeze({
  head: Object.freeze([['Head', 6, 5, 0], ['neck_01', 2.5, 2, .8], ['spine_03', .3, .2, 1.2]]),
  body: Object.freeze([['spine_03', 1.4, 1.2, 3.2], ['spine_02', 1, .8, 2.4], ['spine_01', .4, .3, 1.2],
   ['neck_01', 0, 0, 2], ['Head', 0, 0, 2.5], ['clavicle_l', 0, 0, 2], ['clavicle_r', 0, 0, 2]]),
  legs: Object.freeze([['calf_l', 0, 0, 7], ['calf_r', 0, 0, 7], ['thigh_l', 0, .6, 3.5], ['thigh_r', 0, .6, 3.5],
   ['spine_01', .5, .4, 2.5], ['spine_02', .3, .2, 1.5]])
 })
});

/**
 * @param {any} root the figure's root; bones are found by name under it
 */
export function createHitReaction(root) {
 const names = [...new Set(Object.values(HIT_REACTION.zones).flat().map(([b]) => b))];
 const bones = new Map(names.map(n => [n, root.getObjectByName(n)]).filter(([, b]) => b));
 // Per bone: angle and angular velocity about the body's right axis (pitch, + bends back) and its
 // forward axis (roll, + leans to the body's left).
 const spring = new Map(names.map(n => [n, {pitch: 0, roll: 0, vp: 0, vr: 0}]));
 const right = new Vector3(), forward = new Vector3(), wq = new Quaternion(), pq = new Quaternion(), r = new Quaternion(), r2 = new Quaternion();
 let awake = false, hits = 0;
 const api = {
  get ready() {return bones.size === names.length;},
  get awake() {return awake;},
  get hits() {return hits;},
  /** How far a bone is bent right now: {pitch, roll} radians (for tests). */
  angleOf(name) {const s = spring.get(name); return s ? {pitch: s.pitch, roll: s.roll} : null;},
  /**
   * A blow. `dirX, dirZ` which way it was travelling (world), `heading` the body's facing,
   * `zone` 'head' | 'body' | 'legs', `strength` 1 for a pistol round or a cut.
   */
  hit({dirX = 0, dirZ = 1, heading = 0, zone = 'body', strength = 1} = {}) {
   const l = Math.hypot(dirX, dirZ) || 1, dx = dirX / l, dz = dirZ / l;
   // In the body's frame: forward is (sin h, cos h), the body's left is (cos h, -sin h).
   const along = dx * Math.sin(heading) + dz * Math.cos(heading), left = dx * Math.cos(heading) - dz * Math.sin(heading);
   // A blow travelling backward through the body (along < 0, hit from the front) bends it back.
   const back = -along, across = left;
   for (const [bone, along, side, flex] of HIT_REACTION.zones[zone] ?? HIT_REACTION.zones.body) {
    const s = spring.get(bone); if (!s) continue;
    // + pitch bends back: a blow travelling back through the body (back > 0) pushes it back;
    // the flex curls it forward (- pitch) whichever way the blow came. For a calf, - pitch closes
    // the knee (the shin swings back): that is the flex too.
    s.vp += (along * back - flex) * strength;
    // Across: pushed to its left, a bone leans to its left, which is +roll.
    s.vr += side * across * strength;
   }
   awake = true; hits++;
  },
  /** One frame, after the mixer. `heading` is the body's facing now. */
  update(dt, heading = 0) {
   if (!awake || !api.ready) return false;
   dt = Math.max(0, Math.min(.05, dt || 0));
   let moving = false;
   for (const s of spring.values()) {
    // Semi-implicit Euler, in two halves for stability at 30 fps.
    for (let k = 0; k < 2; k++) {
     const h = dt / 2;
     s.vp += (-HIT_REACTION.stiffness * s.pitch - HIT_REACTION.damping * s.vp) * h; s.pitch += s.vp * h;
     s.vr += (-HIT_REACTION.stiffness * s.roll - HIT_REACTION.damping * s.vr) * h; s.roll += s.vr * h;
    }
    s.pitch = Math.max(-HIT_REACTION.limit, Math.min(HIT_REACTION.limit, s.pitch));
    s.roll = Math.max(-HIT_REACTION.limit, Math.min(HIT_REACTION.limit, s.roll));
    if (Math.abs(s.pitch) + Math.abs(s.roll) + (Math.abs(s.vp) + Math.abs(s.vr)) * .05 > 1e-3) moving = true;
   }
   if (!moving) {for (const s of spring.values()) s.pitch = s.roll = s.vp = s.vr = 0; awake = false; return false;}
   // The body's right (bending about it pitches) and forward (rolling about it leans sideways).
   right.set(-Math.cos(heading), 0, Math.sin(heading)); forward.set(Math.sin(heading), 0, Math.cos(heading));
   root.updateMatrixWorld(true);
   for (const name of names) {
    const s = spring.get(name), b = bones.get(name);
    if (!s || !b || (!s.pitch && !s.roll)) continue;
    // + pitch bends back: about the body's right axis, the top of the bone goes backward.
    r.setFromAxisAngle(right, s.pitch); r2.setFromAxisAngle(forward, -s.roll);
    b.getWorldQuaternion(wq); b.parent.getWorldQuaternion(pq);
    b.quaternion.copy(pq.invert().multiply(r.multiply(r2).multiply(wq)));
    b.updateMatrixWorld(true);
   }
   return true;
  },
  reset() {for (const s of spring.values()) s.pitch = s.roll = s.vp = s.vr = 0; awake = false;}
 };
 return api;
}
