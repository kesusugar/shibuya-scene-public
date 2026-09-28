// The gun arm while walking (PLAN-WEAPONS W2, R1 and R2).
//
// §9k is the warning this module is built on: a punch blended over the walk was averaged with it
// and put the fist 0.6 m off its line. An aim blended the same way would do the same to the
// muzzle -- and a muzzle a few degrees off is metres off at the target. So:
//
//  1. The aim pose is not averaged with the gait. Above the waist (spine_02 up, both arms, the
//     head) each bone is SET to the aim pose, slerped in by the aim weight alone, after the mixer
//     has evaluated the walk. The pelvis and legs keep walking.
//  2. The aim poses are three single frames (Pistol_Aim_Up/Neutral/Down, measured at about +90°,
//     0° and -90° of barrel pitch); the pose for the target's pitch is slerped between them.
//     Pistol_Shoot's recoil and Pistol_Reload ride on top as local deltas from the neutral pose.
//  3. The walk still sways the pelvis and spine_01 under all that, and left/right comes from the
//     body's yaw (R2), not from any clip. So an AIM CORRECTION then turns spine_01..spine_03, a
//     share each, until the muzzle ray points at the target. It is measured, not assumed:
//     `error` is how far the ray passes from the target after the correction, and the R1 test
//     holds it under 0.25 m at 10 m, walking, at 0°, ±45° and ±90° between the walk and the aim.
//
// §9ah: the submachine gun uses the same layer with its own poses. Drawn, the upper body holds
// SmgLow (a low ready: butt in the shoulder, muzzle 40° down) over whatever the legs are doing;
// aimed, it blends to SmgAim (shouldered, the head down to the sights), looped; the same spine
// correction then puts the muzzle on the target. Each round's recoil (`state.recoil`, radians of
// muzzle climb) is added AFTER the correction, so the climb shows; the arsenal puts the same climb
// into where the rounds go. Reloading drops it to the low ready with a dip of the muzzle.
import {Quaternion,Vector3} from 'three';

export const AIM = Object.freeze({
 fadeIn: .12, fadeOut: .2, reloadFade: .15,
 // The bones the aim pose owns. spine_01 and below belong to the walk.
 upper: Object.freeze(['spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r']),
 // The correction's bones and how much of what is left each takes, per pass.
 spine: Object.freeze([['spine_01', 1 / 3], ['spine_02', 1 / 2], ['spine_03', 1]]),
 passes: 3,
 poseRange: Math.PI / 2   // Pistol_Aim_Up / _Down are the barrel at about ±90°
});

const CLIPS = ['PistolAimUp', 'PistolAimNeutral', 'PistolAimDown', 'PistolShoot', 'PistolReload'];
const SMG_CLIPS = ['SmgLow', 'SmgAim'];
/** §9ah: the submachine gun's layer: how fast it comes up when drawn, and the reload's dip. */
export const SMG_LAYER = Object.freeze({drawFade: .2, reloadDip: .5});

/**
 * @param {any} root the figure's root
 * @param {any[]} clips the instance's AnimationClips
 * @param {any} rig the weapon rig (weapon-mesh.mjs), for the muzzle
 */
export function createAimLayer(root, clips, rig, {correction = true} = {}) {
 const bones = new Map();
 for (const name of [...AIM.upper, 'spine_01']) {const b = root.getObjectByName(name); if (b) bones.set(name, b);}
 // Each clip's quaternion track per upper bone, as an interpolant.
 const tracks = new Map();
 for (const name of [...CLIPS, ...SMG_CLIPS]) {
  const clip = clips.find(c => c.name === name); if (!clip) continue;
  const per = new Map();
  for (const t of clip.tracks) {
   const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot);
   if (t.name.slice(dot + 1) !== 'quaternion' || !AIM.upper.includes(bone)) continue;
   per.set(bone, {interpolant: t.createInterpolant(), duration: clip.duration});
  }
  tracks.set(name, per);
 }
 const ready = bones.size >= AIM.upper.length && CLIPS.every(c => tracks.has(c)) && !!rig;
 const smgReady = ready && SMG_CLIPS.every(c => tracks.has(c));
 let smgW = 0, smgPhase = 0;
 const q = new Quaternion(), qa = new Quaternion(), qb = new Quaternion(), qn = new Quaternion(), qd = new Quaternion();
 const muzzle = new Vector3(), dir = new Vector3(), want = new Vector3(), target = new Vector3(), chest = new Vector3();
 const wq = new Quaternion(), pq = new Quaternion(), rot = new Quaternion(), id = new Quaternion();
 let aimW = 0, reloadW = 0, error = null;

 const sample = (clip, bone, t, out) => {
  const tr = tracks.get(clip)?.get(bone); if (!tr) return false;
  const v = tr.interpolant.evaluate(Math.max(0, Math.min(tr.duration, t)));
  out.set(v[0], v[1], v[2], v[3]); return true;
 };

 /** How far a ray from `o` along `d` passes from `p`. */
 const miss = (o, d, p) => {const v = p.clone().sub(o), along = v.dot(d); return along < 0 ? v.length() : v.addScaledVector(d, -along).length();};

 return {
  get ready() {return ready;},
  get weight() {return Math.max(aimW, reloadW);},
  get aimWeight() {return aimW;},
  /** After the last update: how far the muzzle ray passed from the target, metres (null: none). */
  get error() {return error;},
  /**
   * After the mixer has posed the body and the root is placed. `state.aim` (0/1) is the aim
   * request, `state.aimTarget` {x,y,z} what to aim at, `state.shotLeft` seconds of Pistol_Shoot
   * still to play, `state.reloadLeft` seconds of Pistol_Reload.
   */
  update(state, dt) {
   error = null;
   if (!ready) return false;
   if (state.weapon === 'smg' || smgW > 0) return smg(state, dt);
   const gun = state.weapon === 'pistol' || state.weapon === 'revolver';
   const shooting = gun && (state.shotLeft ?? 0) > 0, reloading = gun && (state.reloadLeft ?? 0) > 0;
   const on = gun && ((state.aim ?? 0) > 0 || shooting) && !reloading;
   aimW += Math.max(-dt / AIM.fadeOut, Math.min(dt / AIM.fadeIn, (on ? 1 : 0) - aimW));
   reloadW += Math.max(-dt / AIM.reloadFade, Math.min(dt / AIM.reloadFade, (reloading ? 1 : 0) - reloadW));
   if (aimW <= 0 && reloadW <= 0) return false;
   const t = state.aimTarget;
   root.updateMatrixWorld(true);
   // The target's pitch from the chest picks the aim pose.
   let pitch = 0;
   if (t) {bones.get('spine_03').getWorldPosition(chest); pitch = Math.atan2(t.y - chest.y, Math.hypot(t.x - chest.x, t.z - chest.z));}
   const k = Math.max(-1, Math.min(1, pitch / AIM.poseRange));
   const shotAt = shooting ? (tracks.get('PistolShoot').values().next().value.duration - state.shotLeft) : 0;
   const reloadAt = reloading ? (tracks.get('PistolReload').values().next().value.duration - state.reloadLeft) : 0;
   const w = Math.max(aimW, reloadW);
   for (const name of AIM.upper) {
    const bone = bones.get(name);
    sample('PistolAimNeutral', name, 0, qn);
    q.copy(qn);
    if (k > 0 && sample('PistolAimUp', name, 0, qa)) q.slerp(qa, k);
    else if (k < 0 && sample('PistolAimDown', name, 0, qb)) q.slerp(qb, -k);
    // Recoil: the shot's local change from the neutral aim, on top of the pitched aim.
    if (shooting && sample('PistolShoot', name, shotAt, qd)) q.multiply(qn.clone().invert().multiply(qd));
    if (reloadW > 0 && sample('PistolReload', name, reloadAt, qd)) q.slerp(qd, reloadW / w);
    bone.quaternion.slerp(q, w);
   }
   root.updateMatrixWorld(true);
   if (!t || aimW <= 0 || !rig.muzzle(muzzle, dir)) return true;
   target.set(t.x, t.y, t.z);
   if (correction) {
    for (let pass = 0; pass < AIM.passes; pass++) for (const [name, share] of AIM.spine) {
     const bone = bones.get(name);
     rig.muzzle(muzzle, dir);
     want.copy(target).sub(muzzle).normalize();
     rot.setFromUnitVectors(dir, want);
     rot.copy(id.slerp(rot, share * aimW)); id.identity();
     // Rotate the bone in world space: local' = parent^-1 * rot * world.
     bone.getWorldQuaternion(wq); bone.parent.getWorldQuaternion(pq);
     bone.quaternion.copy(pq.invert().multiply(rot.multiply(wq)));
     bone.updateMatrixWorld(true);
    }
   }
   rig.muzzle(muzzle, dir);
   error = miss(muzzle, dir, target);
   return true;
  },
  reset() {aimW = 0; reloadW = 0; error = null; smgW = 0; smgPhase = 0;}
 };

 /** The spine correction: turn spine_01..03, a share each, until the muzzle ray meets the target. */
 function correct(weight) {
  for (let pass = 0; pass < AIM.passes; pass++) for (const [name, share] of AIM.spine) {
   const bone = bones.get(name);
   rig.muzzle(muzzle, dir);
   want.copy(target).sub(muzzle).normalize();
   rot.setFromUnitVectors(dir, want);
   rot.copy(id.slerp(rot, share * weight)); id.identity();
   bone.getWorldQuaternion(wq); bone.parent.getWorldQuaternion(pq);
   bone.quaternion.copy(pq.invert().multiply(rot.multiply(wq)));
   bone.updateMatrixWorld(true);
  }
 }

 /** §9ah: the submachine gun's upper body (see the header). */
 function smg(state, dt) {
  if (!smgReady) return false;
  const drawn = state.weapon === 'smg';
  const reloading = drawn && (state.reloadLeft ?? 0) > 0;
  const on = drawn && ((state.aim ?? 0) > 0 || (state.shotLeft ?? 0) > 0) && !reloading;
  smgW += Math.max(-dt / SMG_LAYER.drawFade, Math.min(dt / SMG_LAYER.drawFade, (drawn ? 1 : 0) - smgW));
  aimW += Math.max(-dt / AIM.fadeOut, Math.min(dt / AIM.fadeIn, (on ? 1 : 0) - aimW));
  reloadW += Math.max(-dt / AIM.reloadFade, Math.min(dt / AIM.reloadFade, (reloading ? 1 : 0) - reloadW));
  if (!drawn) aimW = 0;
  if (smgW <= 0) return false;
  const loop = tracks.get('SmgAim').values().next().value.duration;
  smgPhase = (smgPhase + dt) % loop;
  for (const name of AIM.upper) {
   if (!sample('SmgLow', name, 0, qn)) continue;
   q.copy(qn);
   if (aimW > 0 && sample('SmgAim', name, smgPhase, qa)) q.slerp(qa, aimW);
   bones.get(name).quaternion.slerp(q, smgW);
  }
  root.updateMatrixWorld(true);
  const t = state.aimTarget;
  if (t && aimW > 0 && rig.muzzle(muzzle, dir)) {
   target.set(t.x, t.y, t.z);
   if (correction) correct(aimW * smgW);
  }
  // The reload: the muzzle dips further while the magazine is changed.
  const dip = reloadW * SMG_LAYER.reloadDip * Math.sin(Math.PI * Math.min(1, reloadW));
  // Recoil after the correction, so it shows: the chest tips back about the body's right-left line.
  const climb = (state.recoil ?? 0) * aimW - dip;
  if (climb) {
   const chestBone = bones.get('spine_03');
   chestBone.getWorldQuaternion(wq);
   const right = muzzle.set(1, 0, 0).applyQuaternion(root.quaternion);
   rot.setFromAxisAngle(right, -climb);
   chestBone.parent.getWorldQuaternion(pq);
   chestBone.quaternion.copy(pq.invert().multiply(rot.multiply(wq)));
   root.updateMatrixWorld(true);
  }
  if (t && aimW > 0 && rig.muzzle(muzzle, dir)) error = miss(muzzle, dir, target.set(t.x, t.y, t.z));
  return true;
 }
}
