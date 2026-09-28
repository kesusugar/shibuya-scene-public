// What a body does that no clip in the pack does (roadmap stage 2), as layers over the finished
// pose -- the same way hands.mjs and the aim layer work:
//
//  HANDS UP    both hands up beside the head, palms out: two-bone IK on each arm to a point in
//              the body's own frame, faded in over a fifth of a second.
//  LIMP        a wounded leg (the right) that will not take the weight: the knee kept nearly
//              straight, the pelvis dropping and the trunk leaning over the good side each time
//              the wounded leg is under the body (the gait's own phase), and a slower pace (the
//              simulation's).
//  UPPER POSE  any clip's upper body over the legs -- the katana's two-handed guard (Sword_Idle)
//              held while walking, instead of the walk's swinging arms with a sword in one hand.
import {BoxGeometry,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {createTwoBoneSolver} from './foot-ik.mjs';
import {BIKE} from '../traffic/motorbike-shape.mjs';

export const BODY = Object.freeze({
 // Hands up: where each palm goes, in the body's frame (+X left, +Y up, +Z forward), at 1.76 m.
 // Stage 4: a phone in the right hand -- held up in front of the face to film, or at the right ear.
 phone: Object.freeze({film: Object.freeze([-.07, 1.36, .31]), call: Object.freeze([-.17, 1.5, .04]), fade: .35,
  // Where each elbow points (body frame): down and out to the right, clear of the chest.
  pole: Object.freeze({film: Object.freeze([-.95, .85, .05]), call: Object.freeze([-.9, 1.25, .15])})}),
 handsUp: Object.freeze({left: Object.freeze([.3, 1.58, .14]), right: Object.freeze([-.3, 1.58, .14]), fade: .2,
  // The elbows out to the sides and a little down, as people hold their hands up.
  pole: Object.freeze({left: Object.freeze([.8, 1.25, 0]), right: Object.freeze([-.8, 1.25, 0])})}),
 // Limp: how far the knee may bend (share of what the walk bends it), the hip drop and lean (rad).
 limp: Object.freeze({knee: .35, drop: .1, lean: .09, fade: .3}),
 // Stage 6: astride the motorbike. The seated Drive clip puts the pelvis .68 m up and .19 m back
 // of the body's root, so the root sits that far below and ahead of the seat; the hands go to the
 // grips and the feet to the pegs (body frame, +X left), the trunk leans forward over the tank.
 ride: Object.freeze({
  root: Object.freeze([0, BIKE.seat[1] + .08 - .68, BIKE.seat[2] + .19]),
  lean: .45,
  grip: Object.freeze({left: Object.freeze([.31, BIKE.bars[1] - (BIKE.seat[1] + .08 - .68), BIKE.bars[2] - (BIKE.seat[2] + .19)]),
   right: Object.freeze([-.31, BIKE.bars[1] - (BIKE.seat[1] + .08 - .68), BIKE.bars[2] - (BIKE.seat[2] + .19)])}),
  peg: Object.freeze({left: Object.freeze([BIKE.pegs[0], BIKE.pegs[1] - (BIKE.seat[1] + .08 - .68) + .04, BIKE.pegs[2] - (BIKE.seat[2] + .19) - .04]),
   right: Object.freeze([-BIKE.pegs[0], BIKE.pegs[1] - (BIKE.seat[1] + .08 - .68) + .04, BIKE.pegs[2] - (BIKE.seat[2] + .19) - .04])}),
  // The elbows out and down; the knees forward and out, gripping the tank.
  elbow: Object.freeze({left: Object.freeze([.7, .55, .1]), right: Object.freeze([-.7, .55, .1])}),
  knee: Object.freeze({left: Object.freeze([.45, .5, .8]), right: Object.freeze([-.45, .5, .8])})
 }),
 // The katana guard's elbows: where each should point (body frame, +X left), below and outside
 // the shoulder -- a two-handed grip with the elbows down, not raised and turned in.
 katanaGuard: Object.freeze({right: Object.freeze([-.4, .7, .2]), left: Object.freeze([.4, .7, .2])}),
 upperFade: .2,
 upper: Object.freeze(['spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'])
});

const palm = .08;

/**
 * Turn an arm about the line from its shoulder to its wrist so the elbow points toward `pole`
 * (world). The wrist is on that line, so it stays where the IK put it; only the elbow swings.
 * A two-bone solve keeps the bend plane the animation had, which for an arm hanging at the side
 * put the elbow in front of the chest once the hand came up to the face -- through the body.
 */
const _s = new Vector3(), _e = new Vector3(), _w = new Vector3(), _axis = new Vector3(), _a = new Vector3(), _b = new Vector3();
const _q = new Quaternion(), _wq = new Quaternion(), _pq = new Quaternion();
export function swivelElbow(upper, lower, wrist, pole) {
 upper.updateWorldMatrix(true, true);
 _s.setFromMatrixPosition(upper.matrixWorld); _e.setFromMatrixPosition(lower.matrixWorld); _w.setFromMatrixPosition(wrist.matrixWorld);
 _axis.subVectors(_w, _s); const len = _axis.length(); if (len < 1e-4) return 0; _axis.divideScalar(len);
 // The elbow's and the pole's directions off the shoulder-wrist line.
 _a.subVectors(_e, _s); _a.addScaledVector(_axis, -_a.dot(_axis));
 _b.subVectors(pole, _s); _b.addScaledVector(_axis, -_b.dot(_axis));
 if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return 0;
 _a.normalize(); _b.normalize();
 const angle = Math.atan2(_axis.dot(_a.clone().cross(_b)), _a.dot(_b));
 _q.setFromAxisAngle(_axis, angle);
 upper.getWorldQuaternion(_wq); upper.parent.getWorldQuaternion(_pq);
 upper.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq)));
 upper.updateMatrixWorld(true);
 return angle;
}

/** Both arms up. `update(on, dt)` after everything else has posed the body. */
export function createHandsUp(root) {
 const bone = n => root.getObjectByName(n);
 const arms = [[bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l'), BODY.handsUp.left, BODY.handsUp.pole.left],
  [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r'), BODY.handsUp.right, BODY.handsUp.pole.right]];
 const ready = arms.every(a => a.slice(0, 3).every(Boolean));
 const solve = createTwoBoneSolver(), goal = new Vector3(), hand = new Vector3(), p = new Vector3();
 let w = 0;
 return {
  get ready() {return ready;},
  get weight() {return w;},
  update(on, dt) {
   w += Math.max(-dt / BODY.handsUp.fade, Math.min(dt / BODY.handsUp.fade, (on ? 1 : 0) - w));
   if (!ready || w <= 1e-3) return false;
   root.updateMatrixWorld(true);
   const k = w * w * (3 - 2 * w);
   for (const [upper, lower, wrist, at, pole] of arms) {
    wrist.updateWorldMatrix(true, false);
    hand.setFromMatrixPosition(wrist.matrixWorld);
    p.set(0, palm, 0).applyMatrix4(wrist.matrixWorld).sub(hand);          // wrist -> palm
    goal.set(...at);
    // The body's frame without its scale: the points are metres at the game's height.
    goal.applyQuaternion(root.quaternion).add(root.position).sub(p);
    goal.sub(hand).multiplyScalar(k).add(hand);
    solve(upper, lower, wrist, goal);
    if (k > .05) swivelElbow(upper, lower, wrist, goal.set(...pole).applyQuaternion(root.quaternion).add(root.position));
   }
   return true;
  },
  reset() {w = 0;}
 };
}

/** A limp on the right leg. `update(on, phase, dt)`: phase 0..1 of the gait cycle. */
export function createLimp(root) {
 const pelvis = root.getObjectByName('pelvis'), spine = root.getObjectByName('spine_01'), calf = root.getObjectByName('calf_r');
 const ready = !!(pelvis && spine && calf);
 const q = new Quaternion(), rest = new Quaternion(), axis = new Vector3(), wq = new Quaternion(), pq = new Quaternion();
 let w = 0;
 const turn = (b, ax, angle) => {
  b.getWorldQuaternion(wq); b.parent.getWorldQuaternion(pq);
  q.setFromAxisAngle(ax, angle);
  b.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  b.updateMatrixWorld(true);
 };
 return {
  get ready() {return ready;},
  get weight() {return w;},
  update(on, phase, dt, moving = true) {
   w += Math.max(-dt / BODY.limp.fade, Math.min(dt / BODY.limp.fade, (on ? 1 : 0) - w));
   if (!ready || w <= 1e-3) return false;
   // The knee: toward its rest bend, so the leg stays nearly straight.
   rest.identity();
   calf.quaternion.slerp(rest, (1 - BODY.limp.knee) * w);
   calf.updateMatrixWorld(true);
   if (!moving) return true;
   // Weight on the wounded leg for the first half of the cycle (the walk starts on the right):
   // the hip drops away from it and the trunk throws itself over the good leg.
   const load = Math.max(0, Math.sin(phase * Math.PI * 2));
   axis.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));   // the body's forward
   root.updateMatrixWorld(true);
   turn(pelvis, axis, -BODY.limp.drop * load * w);
   turn(spine, axis, BODY.limp.lean * 2 * load * w);
   return true;
  },
  reset() {w = 0;}
 };
}

/**
 * A clip's upper body over the legs: `update(weight, dt)` sets the upper bones to the clip's pose
 * (looped at its own speed), slerped in by `weight` (already faded by the caller).
 */
export function createUpperPose(root, clips, name) {
 const clip = clips.find(c => c.name === name);
 const tracks = new Map();
 if (clip) for (const t of clip.tracks) {
  const dot = t.name.lastIndexOf('.'), b = t.name.slice(0, dot);
  if (t.name.slice(dot + 1) === 'quaternion' && BODY.upper.includes(b)) tracks.set(b, t.createInterpolant());
 }
 const bones = new Map(BODY.upper.map(n => [n, root.getObjectByName(n)]).filter(([, b]) => b));
 const q = new Quaternion();
 let time = 0;
 return {
  get ready() {return !!clip && tracks.size >= 8;},
  update(weight, dt) {
   if (!clip || weight <= 1e-3) return false;
   time = (time + dt) % clip.duration;
   for (const [n, it] of tracks) {
    const b = bones.get(n); if (!b) continue;
    const v = it.evaluate(time); q.set(v[0], v[1], v[2], v[3]);
    b.quaternion.slerp(q, weight);
   }
   root.updateMatrixWorld(true);
   return true;
  }
 };
}

let phoneGeometry = null, phoneMaterial = null;
/**
 * Stage 4: a phone in the right hand. `update(mode, dt)` with 'film', 'call' or null: the hand goes
 * up in front of the face (filming) or to the right ear (calling), and the phone shows in it.
 */
export function createPhone(root) {
 const bone = n => root.getObjectByName(n);
 const arm = [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r')];
 const ready = arm.every(Boolean);
 const solve = createTwoBoneSolver(), goal = new Vector3(), hand = new Vector3(), p = new Vector3();
 phoneGeometry ??= new BoxGeometry(.072, .15, .009);
 phoneMaterial ??= new MeshStandardMaterial({name: 'phone', color: 0x15171b, metalness: .4, roughness: .3, emissive: 0x2b3a4a, emissiveIntensity: .35});
 const mesh = ready ? new Mesh(phoneGeometry, phoneMaterial) : null;
 if (mesh) {
  const s = new Vector3(); arm[2].getWorldScale(s);
  mesh.scale.setScalar(1 / (s.x || 1)); mesh.position.set(-.03 / (s.x || 1), .1 / (s.x || 1), 0); mesh.visible = false; mesh.name = 'phone';
  arm[2].add(mesh);
 }
 let w = 0, mode = null;
 return {
  get ready() {return ready;},
  get weight() {return w;},
  get mesh() {return mesh;},
  update(want, dt) {
   if (want) mode = want;
   w += Math.max(-dt / BODY.phone.fade, Math.min(dt / BODY.phone.fade, (want ? 1 : 0) - w));
   if (mesh) mesh.visible = w > .4;
   if (!ready || w <= 1e-3 || !mode) return false;
   root.updateMatrixWorld(true);
   const [upper, lower, wrist] = arm, k = w * w * (3 - 2 * w);
   wrist.updateWorldMatrix(true, false);
   hand.setFromMatrixPosition(wrist.matrixWorld);
   p.set(0, palm, 0).applyMatrix4(wrist.matrixWorld).sub(hand);
   goal.set(...BODY.phone[mode]).applyQuaternion(root.quaternion).add(root.position).sub(p);
   goal.sub(hand).multiplyScalar(k).add(hand);
   solve(upper, lower, wrist, goal);
   if (k > .05) swivelElbow(upper, lower, wrist, goal.set(...BODY.phone.pole[mode]).applyQuaternion(root.quaternion).add(root.position));
   return true;
  },
  reset() {w = 0; mode = null; if (mesh) mesh.visible = false;},
  dispose() {mesh?.removeFromParent();}
 };
}

/**
 * Stage 6: riding. `update(on)` after the Drive clip has posed the body: the trunk leans forward
 * over the tank, the hands take the grips, the feet the pegs (two-bone IK, elbows and knees swivelled
 * out). Snaps rather than fades: the body is either on the bike or it is not.
 */
export function createRideGrip(root) {
 const bone = n => root.getObjectByName(n), R = BODY.ride;
 const limbs = [[bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l'), R.grip.left, R.elbow.left, palm],
  [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r'), R.grip.right, R.elbow.right, palm],
  [bone('thigh_l'), bone('calf_l'), bone('foot_l'), R.peg.left, R.knee.left, 0],
  [bone('thigh_r'), bone('calf_r'), bone('foot_r'), R.peg.right, R.knee.right, 0]];
 const spine = bone('spine_02');
 const ready = limbs.every(a => a.slice(0, 3).every(Boolean));
 const solve = createTwoBoneSolver(), goal = new Vector3(), hand = new Vector3(), p = new Vector3(), axis = new Vector3();
 const q = new Quaternion(), wq = new Quaternion(), pq = new Quaternion();
 return {
  get ready() {return ready;},
  update(on) {
   if (!ready || !on) return false;
   root.updateMatrixWorld(true);
   if (spine) {            // forward over the tank, about the body's own left-right axis
    axis.set(1, 0, 0).applyQuaternion(root.quaternion);
    spine.getWorldQuaternion(wq); spine.parent.getWorldQuaternion(pq);
    q.setFromAxisAngle(axis, R.lean);
    spine.quaternion.copy(pq.invert().multiply(q.multiply(wq))); spine.updateMatrixWorld(true);
   }
   for (const [upper, lower, end, at, pole, reach] of limbs) {
    end.updateWorldMatrix(true, false);
    hand.setFromMatrixPosition(end.matrixWorld);
    p.set(0, reach, 0).applyMatrix4(end.matrixWorld).sub(hand);
    goal.set(...at).applyQuaternion(root.quaternion).add(root.position).sub(p);
    solve(upper, lower, end, goal);
    swivelElbow(upper, lower, end, goal.set(...pole).applyQuaternion(root.quaternion).add(root.position));
   }
   return true;
  },
  reset() {}
 };
}

/**
 * The katana's two-handed guard, corrected (owner report after stage 6). The Sword_Idle clip
 * holds the right elbow up above the shoulder and turned in across the chest, and the left elbow
 * turned in and back. `update(weight)` after the guard is posed: each elbow is swung round the
 * shoulder-wrist line (so the fists and the blade stay where they are) to point down and out,
 * the right hand keeping its world orientation so the blade does not turn with the forearm.
 */
export function createKatanaGrip(root) {
 const bone = n => root.getObjectByName(n);
 // Both hands keep their orientation: the right carries the blade, and the left, let roll with its
 // forearm, came off the handle.
 const arms = [[bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r'), BODY.katanaGuard.right],
  [bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l'), BODY.katanaGuard.left]];
 const ready = arms.every(a => a.slice(0, 3).every(Boolean));
 const pole = new Vector3(), keep = new Quaternion(), before = new Quaternion(), pq = new Quaternion();
 return {
  get ready() {return ready;},
  update(weight) {
   if (!ready || weight <= 1e-3) return false;
   root.updateMatrixWorld(true);
   for (const [upper, lower, hand, at] of arms) {
    hand.getWorldQuaternion(keep); before.copy(upper.quaternion);
    swivelElbow(upper, lower, hand, pole.set(...at).applyQuaternion(root.quaternion).add(root.position));
    if (weight < 1) {upper.quaternion.slerpQuaternions(before, upper.quaternion.clone(), weight); upper.updateMatrixWorld(true);}
    // The hand as it was in the world: the grip and the blade do not roll with the forearm.
    hand.parent.getWorldQuaternion(pq); hand.quaternion.copy(pq.invert().multiply(keep)); hand.updateMatrixWorld(true);
   }
   return true;
  },
  reset() {}
 };
}
