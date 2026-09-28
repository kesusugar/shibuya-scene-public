// A light ragdoll for a body killed by a blade or a bullet (GTA-FIDELITY-STATUS §9ai, H4).
//
// Before this a killed pedestrian was handed to the mass crowd, which plays the same fall every
// time wherever the blow came from, so a cut or a shot read as passing through. Here the body
// that was killed keeps its humanoid and falls under physics, the way it was hit:
//
//  - 18 points on the joints (pelvis, chest, head and a point above it, shoulders, elbows, hands,
//    hips, knees, ankles, toes), placed where the animated pose had them when the blow landed.
//  - Verlet integration with gravity and a ground plane, and distance constraints: every bone's
//    length, a braced torso box (shoulders and hips, crossed), and a few "no closer than"
//    constraints that stop a knee or an elbow folding flat or the head sinking into the chest.
//    No joint-angle solver: a bone chain that can only keep its lengths already falls like a
//    body, and it costs a few microseconds.
//  - §9ak: joint ranges, from human anatomy, so no pose is one a body cannot take: the knee and
//    the elbow are hinges that bend one way only (no hyperextension), the hip stays inside its
//    range (90° of flexion, 20° of extension behind the trunk, 45° out to the side, 20° across), and the
//    head stays within 50° of the chest's line.
//  - §9ak: how a person actually goes down. A round's momentum is tiny next to a body's (a
//    pistol round moves a 70 kg body a few centimetres per second) and a cut is a slice, not a
//    shove: people are not thrown, they lose their footing. So the fall starts as a collapse --
//    the knees buckle forward and the hips drop -- with only a modest push where the blow struck
//    deciding which way the collapse tips.
//  - Each frame the skeleton is turned to follow the points: the pelvis and chest by the frame
//    their spine and hip / shoulder lines make, every limb bone by aiming it at its child point.
//  - It goes to sleep once nothing has moved for half a second; a sleeping ragdoll costs nothing.
//
// Only the nearest humanoids (src/life/near-characters.mjs) carry one; the far crowd is unchanged.
import {Matrix4,Quaternion,Vector3} from 'three';

/**
 * Roadmap stage 2: what a falling body can strike besides the ground -- the buildings' solid
 * cells and the cars nearby. `solid(x, z)` is the collision grid; `cars` a list of boxes
 * {x, z, y, heading, width, length, height}, refreshed by the scene each frame. Shared by every
 * ragdoll (there are at most four). Inelastic, like the ground: a point that meets a wall or a
 * car loses the motion that carried it in, so a body slumps against it instead of passing
 * through or bouncing off.
 */
/** @type {{solid:null|((x:number,z:number)=>boolean), cars:any[]}} */
const WORLD = {solid: null, cars: []};
/** @param {{solid?:null|((x:number,z:number)=>boolean), cars?:any[]}} [world] */
export function setRagdollWorld({solid = null, cars = []} = {}) {WORLD.solid = solid; WORLD.cars = cars; return WORLD;}

export const RAGDOLL = Object.freeze({
 gravity: 9.81,
 step: 1 / 60,              // s per integration step
 maxSteps: 4,               // per frame, so a slow frame does not spiral
 iterations: 8,             // constraint passes per step
 damping: .99,              // velocity kept per step (a limp body loses energy in its joints)
 friction: .7,              // horizontal velocity kept per step while touching the ground
 radius: .06,               // m, a joint's clearance off the ground (the head's is larger)
 headRadius: .11,
 sleepSpeed: .06,           // m/s: below this for `sleepAfter` s, the body stops
 sleepAfter: .5,
 maxAwake: 6,               // s: asleep by then whatever it is doing
 // The blow: m/s added at the point it struck, and 0.6 of it at its neighbours (§9ak: modest).
 blow: Object.freeze({head: .4, body: 1.1, legs: .9}),   // a head shot drops a body where it stands
 // The collapse (§9ak): the knees go forward and the hips drop as the legs stop holding.
 // The trunk goes forward over them: the head is heavy and the back muscles let go too.
 // Mostly the hips dropping: a strong knee kick reads as a marching step, then a roll onto the back.
 buckle: Object.freeze({knee: .35, pelvis: 1.0, trunk: .5}),
 // Joint ranges (§9ak), as components of the thigh's direction in the pelvis's frame and a cone
 // for the neck.
 // sin 15° of extension, ~45° out, sin 20° across, and flexion to sin 20° above level (110°):
 // front to back at most 125°, never a split. `soft` is the share of the correction per pass:
 // a hard limit fought the ground while seated and pumped the pelvis back up.
 hip: Object.freeze({extension: .26, abduction: .7, adduction: .34, flexion: .34, soft: .35}),
 neck: Math.cos(50 * Math.PI / 180)
});

// The points, and the bone each one is read from at the start.
const POINTS = ['pelvis', 'spine_03', 'Head', 'headTop',
 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'];
const I = Object.fromEntries(POINTS.map((n, i) => [n, i]));

// Bones (equal length) and braces (the torso box, held as it was).
const STICKS = [
 ['pelvis', 'spine_03'], ['spine_03', 'Head'], ['Head', 'headTop'],
 ['spine_03', 'upperarm_l'], ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'],
 ['spine_03', 'upperarm_r'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'],
 ['pelvis', 'thigh_l'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['foot_l', 'ball_l'],
 ['pelvis', 'thigh_r'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'], ['foot_r', 'ball_r'],
 // the torso box
 ['upperarm_l', 'upperarm_r'], ['thigh_l', 'thigh_r'], ['upperarm_l', 'thigh_l'], ['upperarm_r', 'thigh_r'],
 ['upperarm_l', 'thigh_r'], ['upperarm_r', 'thigh_l'], ['spine_03', 'thigh_l'], ['spine_03', 'thigh_r'],
 // the head on its neck, and the foot as one piece
 ['spine_03', 'headTop'], ['calf_l', 'ball_l'], ['calf_r', 'ball_r']
];
// "No closer than" this fraction of the starting distance: joints that may bend, but not flat.
const LIMITS = [
 ['thigh_l', 'foot_l', .55], ['thigh_r', 'foot_r', .55],        // a knee does not fold shut
 ['upperarm_l', 'hand_l', .45], ['upperarm_r', 'hand_r', .45],  // nor an elbow
 ['pelvis', 'Head', .8], ['pelvis', 'headTop', .8],             // the spine curls, a little
 ['Head', 'upperarm_l', .7], ['Head', 'upperarm_r', .7]         // the head stays off the shoulders
];
const NEIGHBOURS = {head: ['Head', 'headTop'], body: ['spine_03', 'upperarm_l', 'upperarm_r'], legs: ['calf_l', 'calf_r', 'thigh_l', 'thigh_r']};

/**
 * @param {any} root the figure's root (bones are found by name under it)
 */
export function createRagdoll(root) {
 const bone = n => root.getObjectByName(n);
 const bones = Object.fromEntries(['pelvis', 'spine_01', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']
  .map(n => [n, bone(n)]));
 const ready = Object.values(bones).every(Boolean);
 const n = POINTS.length;
 const pos = Array.from({length: n}, () => new Vector3()), prev = Array.from({length: n}, () => new Vector3());
 const sticks = [], limits = [];
 let active = false, asleep = false, age = 0, still = 0, ground = 0, carry = 0;
 const hits = {walls: 0, cars: 0};
 // The frames the pelvis and chest are turned by: their bone world rotation at the start, and
 // the (spine, lateral) basis the points made then.
 const start = {pelvis: new Quaternion(), chest: new Quaternion(), pelvisBasis: new Matrix4(), chestBasis: new Matrix4(),
  head: new Quaternion(), headUp: new Vector3()};
 const v = new Vector3(), w = new Vector3(), q = new Quaternion(), pq = new Quaternion(), m = new Matrix4();

 const worldOf = (b, out) => {b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld);};
 const basis = (up, lateral, out) => {
  const y = up.clone().normalize(), x = lateral.clone().addScaledVector(y, -lateral.dot(y)).normalize(), z = x.clone().cross(y);
  return out.makeBasis(x, y, z);
 };
 const pelvisFrame = out => basis(v.subVectors(pos[I.spine_03], pos[I.pelvis]), w.subVectors(pos[I.thigh_l], pos[I.thigh_r]), out);
 const chestFrame = out => basis(v.subVectors(pos[I.Head], pos[I.spine_03]), w.subVectors(pos[I.upperarm_l], pos[I.upperarm_r]), out);
 const setWorld = (b, wq) => {b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true);};
 /** Turn a bone so its child sits along the direction from point a to point b. */
 const aim = (name, child, a, bb) => {
  const b = bones[name], c = bones[child];
  const from = worldOf(c, new Vector3()).sub(worldOf(b, new Vector3()));
  const to = new Vector3().subVectors(pos[I[bb]], pos[I[a]]);
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  b.getWorldQuaternion(q);
  setWorld(b, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(q));
 };

 /** §9ak: the pelvis's and chest's frames from the points: x to the body's left, y up the spine, z forward. */
 const frame = (lo, hi, l, r, out) => {
  const y = out.y.subVectors(pos[hi], pos[lo]).normalize(), x = out.x.subVectors(pos[l], pos[r]);
  x.addScaledVector(y, -x.dot(y)).normalize(); out.z.crossVectors(x, y); return out;
 };
 const pf = {x: new Vector3(), y: new Vector3(), z: new Vector3()}, cf = {x: new Vector3(), y: new Vector3(), z: new Vector3()};
 const e = new Vector3(), m2 = new Vector3(), t = new Vector3();
 /** A hinge: `mid` may only sit on the `side` of the line from `a` to `b` (no hyperextension). */
 const hinge = (a, mid, b, side, sign = 1) => {
  const A = pos[I[a]], M = pos[I[mid]], B = pos[I[b]];
  e.subVectors(B, A); const len2 = e.lengthSq(); if (len2 < 1e-8) return;
  const k = m2.subVectors(M, A).dot(e) / len2;
  m2.copy(A).addScaledVector(e, k);                     // the nearest point on the line
  const off = t.subVectors(M, m2).dot(side) * sign;
  if (off >= 0) return;
  // Momentum-conserving: the joint moves two thirds of the way, the two ends a sixth each the
  // other way. Moving the joint alone would push the whole body along a little every step.
  const d = -off * sign;
  M.addScaledVector(side, d * 2 / 3); A.addScaledVector(side, -d / 3); B.addScaledVector(side, -d / 3);
 };
 /** The hip's range: the thigh's direction in the pelvis frame, clamped, the knee put back on it. */
 const hip = (thigh, knee, left) => {
  const H = pos[I[thigh]], K = pos[I[knee]], len = H.distanceTo(K);
  t.subVectors(K, H).normalize();
  let fx = t.dot(pf.x), fz = t.dot(pf.z);
  const up = t.dot(pf.y);
  const out = left ? fx : -fx;                           // positive: away from the body's midline
  const J = RAGDOLL.hip;
  let changed = false;
  if (fz < -J.extension) {fz = -J.extension; changed = true;}
  if (out > J.abduction) {fx = (left ? 1 : -1) * J.abduction; changed = true;}
  if (out < -J.adduction) {fx = (left ? -1 : 1) * J.adduction; changed = true;}
  let fy;
  if (up > J.flexion) {
   // Flexed past its range (the knee above the hip): back to the range's edge.
   fy = J.flexion; const k = Math.sqrt((1 - fy * fy) / Math.max(1e-6, fx * fx + fz * fz)); fx *= k; fz *= k; changed = true;
  }
  if (!changed) return;
  // What is left of the unit length goes along the spine, on the side the thigh was on.
  fy ??= (up > 0 ? 1 : -1) * Math.sqrt(Math.max(0, 1 - fx * fx - fz * fz));
  t.set(0, 0, 0).addScaledVector(pf.x, fx).addScaledVector(pf.y, fy).addScaledVector(pf.z, fz).normalize();
  // Half to the knee, half (the other way) to the hip and pelvis, so the correction is internal.
  const d = e.copy(H).addScaledVector(t, len).sub(K);
  const k = J.soft;
  K.addScaledVector(d, .5 * k); H.addScaledVector(d, -.25 * k); pos[I.pelvis].addScaledVector(d, -.25 * k);
 };
 /** The neck: the head stays within RAGDOLL.neck of the chest's line. */
 const neck = () => {
  const C = pos[I.spine_03], Hd = pos[I.Head], len = C.distanceTo(Hd);
  t.subVectors(Hd, C).normalize(); const c = t.dot(cf.y);
  if (c >= RAGDOLL.neck) return;
  // Swing it back to the cone's edge, in the plane of the chest's line and where it is now.
  e.copy(t).addScaledVector(cf.y, -c); if (e.lengthSq() < 1e-8) e.copy(cf.z); e.normalize();
  const s = Math.sqrt(1 - RAGDOLL.neck * RAGDOLL.neck);
  t.copy(cf.y).multiplyScalar(RAGDOLL.neck).addScaledVector(e, s);
  const move = m2.copy(C).addScaledVector(t, len).sub(Hd);
  // The head and the point above it move toward the cone, the chest and shoulders the other way.
  Hd.addScaledVector(move, .6); pos[I.headTop].addScaledVector(move, .6);
  C.addScaledVector(move, -.6); pos[I.upperarm_l].addScaledVector(move, -.3); pos[I.upperarm_r].addScaledVector(move, -.3);
 };
 function joints() {
  if (globalThis.__RAGDOLL_OFF__?.all) return;
  frame(I.pelvis, I.spine_03, I.thigh_l, I.thigh_r, pf);
  frame(I.spine_03, I.Head, I.upperarm_l, I.upperarm_r, cf);
  const off = globalThis.__RAGDOLL_OFF__ ?? {};
  if (!off.knee) {hinge('thigh_l', 'calf_l', 'foot_l', pf.z); hinge('thigh_r', 'calf_r', 'foot_r', pf.z);}       // knees bend forward
  if (!off.elbow) {hinge('upperarm_l', 'lowerarm_l', 'hand_l', cf.z, -1); hinge('upperarm_r', 'lowerarm_r', 'hand_r', cf.z, -1);}  // elbows backward
  if (!off.hip) {hip('thigh_l', 'calf_l', true); hip('thigh_r', 'calf_r', false);}
  if (!off.neck) neck();
 }

 function satisfy() {
  joints();
  for (const [a, b, rest] of sticks) {
   v.subVectors(pos[b], pos[a]); const d = v.length() || 1e-6, k = (d - rest) / d * .5;
   pos[a].addScaledVector(v, k); pos[b].addScaledVector(v, -k);
  }
  for (const [a, b, min] of limits) {
   v.subVectors(pos[b], pos[a]); const d = v.length() || 1e-6; if (d >= min) continue;
   const k = (d - min) / d * .5; pos[a].addScaledVector(v, k); pos[b].addScaledVector(v, -k);
  }
  floor();
  // The joint ranges again, last, so the lengths pass cannot leave a knee bent the wrong way;
  // and the floor after them, so they cannot leave a joint in the ground.
  joints();
  floor();
 }
 /**
  * §9ak: the ground, inelastic. Lifting a point out of the ground without also lifting where it
  * was a step ago hands it an upward velocity -- in Verlet the correction IS velocity -- and a
  * body lying down bounced itself back up onto its shoulders. A point that touches the ground
  * keeps no downward or upward motion.
  */
 function floor() {
  for (let i = 0; i < n; i++) {
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (pos[i].y < ground + r) {pos[i].y = ground + r; if (prev[i].y < pos[i].y) prev[i].y = pos[i].y;}
   // Stage 2: a wall stops the point where it met it (back to where it was, across the ground).
   if (WORLD.solid && WORLD.solid(pos[i].x, pos[i].z) && !WORLD.solid(prev[i].x, prev[i].z)) {
    pos[i].x = prev[i].x; pos[i].z = prev[i].z; hits.walls++;
   }
   for (const car of WORLD.cars) {
    const h = car.heading ?? 0, s = Math.sin(h), c = Math.cos(h), px = pos[i].x - car.x, pz = pos[i].z - car.z;
    const across = px * c - pz * s, along = px * s + pz * c, hw = car.width / 2 + r, hl = car.length / 2 + r;
    if (Math.abs(across) >= hw || Math.abs(along) >= hl || pos[i].y > (car.y ?? 0) + car.height + r) continue;
    // Out through the nearest face -- the roof if it came down onto the car.
    const up = (car.y ?? 0) + car.height + r - pos[i].y, sx = hw - Math.abs(across), sz = hl - Math.abs(along);
    if (up < Math.min(sx, sz) && prev[i].y >= (car.y ?? 0) + car.height) {pos[i].y += up; if (prev[i].y < pos[i].y) prev[i].y = pos[i].y;}
    else {
     const ax = sx < sz ? Math.sign(across || 1) * sx : 0, az = sx < sz ? 0 : Math.sign(along || 1) * sz;
     pos[i].x += ax * c + az * s; pos[i].z += -ax * s + az * c;
     prev[i].x = pos[i].x; prev[i].z = pos[i].z;
    }
    hits.cars++;
   }
  }
 }

 function step(dt) {
  let fastest = 0;
  for (let i = 0; i < n; i++) {
   const p = pos[i], o = prev[i];
   v.subVectors(p, o).multiplyScalar(RAGDOLL.damping);
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (p.y <= ground + r + .005) {v.x *= RAGDOLL.friction; v.z *= RAGDOLL.friction;}
   o.copy(p); p.add(v); p.y -= RAGDOLL.gravity * dt * dt;
   fastest = Math.max(fastest, v.length() / dt);
  }
  for (let k = 0; k < RAGDOLL.iterations; k++) satisfy();
  return fastest;
 }

 /** Turn the skeleton to follow the points. */
 function pose() {
  const pel = bones.pelvis;
  // The pelvis: placed on its point, turned by how its frame has turned.
  const now = pelvisFrame(new Matrix4());
  q.setFromRotationMatrix(m.multiplyMatrices(now, start.pelvisBasis.clone().invert()));
  setWorld(pel, q.clone().multiply(start.pelvis));
  pel.parent.updateWorldMatrix(true, false);
  pel.position.copy(pel.parent.worldToLocal(pos[I.pelvis].clone())); pel.updateMatrixWorld(true);
  // The spine: spine_01 aimed at the chest point, then the chest turned by its own frame.
  aim('spine_01', 'spine_03', 'pelvis', 'spine_03');
  const chestNow = chestFrame(new Matrix4());
  q.setFromRotationMatrix(m.multiplyMatrices(chestNow, start.chestBasis.clone().invert()));
  setWorld(bones.spine_03, q.clone().multiply(start.chest));
  aim('neck_01', 'Head', 'spine_03', 'Head');
  // The head: turned so its own up follows the point above it.
  v.subVectors(pos[I.headTop], pos[I.Head]);
  if (v.lengthSq() > 1e-8) setWorld(bones.Head, new Quaternion().setFromUnitVectors(start.headUp, v.normalize()).multiply(start.head));
  for (const s of ['l', 'r']) {
   aim(`upperarm_${s}`, `lowerarm_${s}`, `upperarm_${s}`, `lowerarm_${s}`);
   aim(`lowerarm_${s}`, `hand_${s}`, `lowerarm_${s}`, `hand_${s}`);
   aim(`thigh_${s}`, `calf_${s}`, `thigh_${s}`, `calf_${s}`);
   aim(`calf_${s}`, `foot_${s}`, `calf_${s}`, `foot_${s}`);
   aim(`foot_${s}`, `ball_${s}`, `foot_${s}`, `ball_${s}`);
  }
 }

 return {
  get ready() {return ready;},
  get active() {return active;},
  get asleep() {return asleep;},
  /** Stage 2: how often a point has met a wall or a car (for tests and QA). */
  get hits() {return {...hits};},
  /** Where the points are, for tests and QA: name -> Vector3 (live). */
  get points() {return Object.fromEntries(POINTS.map((p, i) => [p, pos[i]]));},
  get sticks() {return sticks.map(([a, b, rest]) => ({a: POINTS[a], b: POINTS[b], rest, now: pos[a].distanceTo(pos[b])}));},
  /**
   * Start from the pose the body has now. `push` {x, y, z} is the whole body's velocity (m/s, the
   * crowd's own knock-down push); `dir` {x, z} the blow's direction; `zone` 'head' | 'body' |
   * 'legs' where it struck; `strength` scales the blow (1 = RAGDOLL.blow); `ground` the height of
   * the ground under the body.
   */
  start({push = {x: 0, y: 0, z: 0}, dir = {x: 0, z: 1}, zone = 'body', strength = 1, ground: g = 0} = {}) {
   if (!ready) return false;
   root.updateMatrixWorld(true);
   for (let i = 0; i < n; i++) {
    const name = POINTS[i];
    if (name === 'headTop') {
     worldOf(bones.Head, pos[i]);
     v.subVectors(pos[i], worldOf(bones.neck_01, w)).normalize();
     pos[i].addScaledVector(v, .2);
    } else worldOf(bones[name], pos[i]);
   }
   sticks.length = 0; limits.length = 0;
   for (const [a, b] of STICKS) sticks.push([I[a], I[b], pos[I[a]].distanceTo(pos[I[b]])]);
   for (const [a, b, k] of LIMITS) limits.push([I[a], I[b], pos[I[a]].distanceTo(pos[I[b]]) * k]);
   bones.pelvis.getWorldQuaternion(start.pelvis); bones.spine_03.getWorldQuaternion(start.chest);
   pelvisFrame(start.pelvisBasis); chestFrame(start.chestBasis);
   bones.Head.getWorldQuaternion(start.head); start.headUp.subVectors(pos[I.headTop], pos[I.Head]).normalize();
   ground = g;
   // Velocities, as the previous positions: the whole body's push, and the blow where it struck.
   const len = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / len, dz = dir.z / len;
   const hit = RAGDOLL.blow[zone] ?? RAGDOLL.blow.body;
   const where = NEIGHBOURS[zone] ?? NEIGHBOURS.body;
   for (let i = 0; i < n; i++) {
    const at = where.includes(POINTS[i]) ? (i === I[where[0]] ? 1 : .6) : 0;
    const vx = push.x + dx * hit * strength * at, vz = push.z + dz * hit * strength * at, vy = (push.y ?? 0);
    prev[i].set(pos[i].x - vx * RAGDOLL.step, pos[i].y - vy * RAGDOLL.step, pos[i].z - vz * RAGDOLL.step);
   }
   // §9ak: the collapse -- the knees go forward and the hips drop as the legs stop holding.
   frame(I.pelvis, I.spine_03, I.thigh_l, I.thigh_r, pf);
   for (const k of ['calf_l', 'calf_r']) prev[I[k]].addScaledVector(pf.z, -RAGDOLL.buckle.knee * RAGDOLL.step);
   for (const k of ['pelvis', 'thigh_l', 'thigh_r']) prev[I[k]].y += RAGDOLL.buckle.pelvis * RAGDOLL.step;
   for (const k of ['Head', 'headTop', 'spine_03']) prev[I[k]].addScaledVector(pf.z, -RAGDOLL.buckle.trunk * RAGDOLL.step);
   active = true; asleep = false; age = 0; still = 0; carry = 0;
   return true;
  },
  /** One frame. Returns false once asleep (the pose then stays as it is). */
  update(dt) {
   if (!active || asleep) return false;
   carry += Math.max(0, Math.min(.25, dt || 0));
   let steps = 0, fastest = 0;
   while (carry >= RAGDOLL.step && steps < RAGDOLL.maxSteps) {fastest = Math.max(fastest, step(RAGDOLL.step)); carry -= RAGDOLL.step; steps++; age += RAGDOLL.step;}
   if (steps === RAGDOLL.maxSteps) carry = 0;
   if (steps) pose();
   still = fastest < RAGDOLL.sleepSpeed ? still + steps * RAGDOLL.step : 0;
   if (still >= RAGDOLL.sleepAfter || age >= RAGDOLL.maxAwake) asleep = true;
   return !asleep;
  },
  reset() {active = false; asleep = false; age = 0; still = 0; carry = 0;}
 };
}
