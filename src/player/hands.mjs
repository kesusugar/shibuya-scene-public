// The hands between shots (roadmap stage 1): changing weapons, and the submachine gun's reload.
//
// Both are hand movements over the pose the rest of the figure has already made (the gait, the
// weapon's stance, the aim layer), so both are two-bone IK on an arm, weighted in and out:
//
//  DRAW     the right hand goes to where the weapon out is carried (the hip holster, the handle
//           over the right shoulder, the sling), the weapon goes away there, the hand goes to
//           where the next one is carried and brings it up. The weapon in the hand changes at
//           the moment the hand is at the carry, not at the key press. From fists the hand only
//           goes to fetch; to fists it only puts away. `busy` while any of it runs: a shot waits.
//  RELOAD   the submachine gun's magazine is changed by the left hand, which leaves the fore-end
//           for the magazine, pulls it and lets it fall, takes a fresh one from the left hip,
//           seats it and goes back to the fore-end; the magazine mesh follows the hand. Timed on
//           the reload (`state.reloadLeft` of WEAPONS.smg.reloadSeconds). The pistol has a clip
//           of its own (Pistol_Reload) and is left alone.
//
// Pure of the scene: it takes the figure's root and its weapon rig (weapon-mesh.mjs).
import {Vector3} from 'three';
import {createTwoBoneSolver} from './foot-ik.mjs';
import {DRAW,WEAPONS} from './weapons.mjs';
import {SMG_MAG} from './weapon-mesh.mjs';

/**
 * The reload's key points: [time share of the reload, where the left hand is, magazine state].
 * Where: 'grip' is the fore-end (the hand's own animated place, weight 0), a gun-frame point, or
 * 'pouch' (the left hip, in the body's frame). Magazine: 'gun' seated, 'hand' held, 'none' gone.
 */
export const RELOAD = Object.freeze({
 keys: Object.freeze([
  [0, 'grip', 'gun'],
  [.14, [0, -.07, .148], 'hand'],         // hand onto the magazine
  [.3, [0, -.3, .12], 'hand'],            // pulled out and down
  [.38, [0, -.42, .05], 'none'],          // let go: it falls
  [.55, 'pouch', 'hand'],                 // a fresh one from the left hip
  [.74, [0, -.22, .13], 'hand'],          // lined up under the well
  [.84, [0, -.07, .148], 'gun'],          // seated
  [1, 'grip', 'gun']
 ]),
 pouch: Object.freeze([.21, .93, 0]),   // body frame: +X left, +Y up, +Z forward (metres, at 1.76 m)
 palm: .08,                               // m from the wrist to where the palm holds
 grab: Object.freeze([0, -.07, .148])     // where the hand takes the magazine, in the gun's frame
});

const smooth = x => x * x * (3 - 2 * x);

/** The draw's timeline: {from, to, t, holster, draw}; which weapon shows and where the hand is. Pure. */
export function drawPhase(swap) {
 if (!swap) return null;
 const {t, holster, draw} = swap;
 if (t < holster) return {shown: swap.from, spot: swap.fromSpot, weight: smooth(t / holster)};
 const u = draw > 0 ? Math.min(1, (t - holster) / draw) : 1;
 return {shown: swap.to, spot: swap.toSpot, weight: 1 - smooth(u), done: t >= holster + draw};
}

/** Where the reload's left hand is at `u` (0..1): {from, to, k, mag}. Pure. */
export function reloadPhase(u) {
 const K = RELOAD.keys;
 u = Math.max(0, Math.min(1, u));
 let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
 const [a, from, magA] = K[i], [b, to] = K[i + 1];
 const k = smooth(Math.max(0, Math.min(1, (u - a) / Math.max(1e-6, b - a))));
 return {from, to, k, mag: magA};
}

/**
 * @param {any} root the figure's root
 * @param {any} rig the weapon rig (weapon-mesh.mjs)
 */
export function createHands(root, rig, {onDrop = null} = {}) {
 const bone = n => root.getObjectByName(n);
 const right = [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r')], left = [bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l')];
 const ready = !!rig && right.every(Boolean) && left.every(Boolean);
 const solve = createTwoBoneSolver();
 const mid = new Vector3(), hand = new Vector3(), goal = new Vector3(), a = new Vector3(), b = new Vector3(), palm = new Vector3();
 let current = null, swap = null, shown = null, reloadK = 0, stats = {draws: 0, reloads: 0, drops: 0};
 let wasReloading = false, held = false;

 /** A spot's world position into `out`: a weapon's carry, 'pouch', or a gun-frame point. */
 const spotAt = (spot, out) => {
  if (spot === 'pouch') {out.set(...RELOAD.pouch); return !!root.localToWorld(out);}
  if (Array.isArray(spot)) return rig.gunPoint(spot, out);
  return spot ? rig.stowPoint(spot, out) : false;
 };
 /** Move an arm's hand (its palm) `weight` of the way from where it is to `target`. */
 const reach = (arm, target, weight) => {
  if (!(weight > 1e-3)) return;
  const [upper, lower, wrist] = arm;
  wrist.updateWorldMatrix(true, false);
  hand.setFromMatrixPosition(wrist.matrixWorld);
  // The palm is a hand's length along the fingers from the wrist; put the palm on the target.
  palm.set(0, RELOAD.palm, 0).applyMatrix4(wrist.matrixWorld).sub(hand);
  goal.copy(target).sub(palm).sub(hand).multiplyScalar(weight).add(hand);
  solve(upper, lower, wrist, goal);
 };

 return {
  get ready() {return ready;},
  /** A weapon change is under way: the shot waits. */
  get busy() {return !!swap;},
  /** The weapon to draw in the hand this frame (the old one until the hand has put it away). */
  get shown() {return shown;},
  get stats() {return {...stats};},
  /** Before the rig is shown: follow `state.weapon`, and say what the hand holds. */
  begin(state, dt) {
   const want = state.weapon ?? null;
   if (current === null) {current = want; shown = want; return shown;}
   if (want !== current) {
    const from = swap ? drawPhase(swap).shown : current;
    const has = k => !!k && k !== 'fists' && rig?.stowPoint(k, a);
    const fromSpot = has(from) ? from : has(want) ? want : null, toSpot = has(want) ? want : fromSpot;
    swap = ready && fromSpot ? {from, to: want, fromSpot, toSpot, t: 0,
     holster: DRAW.holster, draw: has(want) ? DRAW.draw : 0} : null;
    if (swap) stats.draws++;
    current = want;
   }
   if (swap) {swap.t += Math.max(0, dt || 0); const p = drawPhase(swap); shown = p.shown; if (p.done) swap = null;}
   else shown = current;
   return shown;
  },
  /** After the aim layer: the arms. */
  update(state, dt) {
   if (!ready) return false;
   root.updateMatrixWorld(true);
   let moved = false;
   if (swap) {
    const p = drawPhase(swap);
    if (spotAt(p.spot, b)) {reach(right, b, p.weight); moved = true;}
   }
   // The submachine gun's magazine.
   const total = WEAPONS.smg.reloadSeconds, left_ = state.reloadLeft ?? 0;
   const reloading = shown === 'smg' && state.weapon === 'smg' && left_ > 0;
   if (reloading && !wasReloading) stats.reloads++;
   wasReloading = reloading;
   reloadK += Math.max(-dt / .15, Math.min(dt / .15, (reloading ? 1 : 0) - reloadK));
   if (reloading) {
    const r = reloadPhase(1 - left_ / total);
    const fromOk = r.from !== 'grip' && spotAt(r.from, a), toOk = r.to !== 'grip' && spotAt(r.to, b);
    if (fromOk && toOk) reach(left, mid.copy(a).lerp(b, r.k), reloadK);
    else if (toOk) reach(left, b, r.k * reloadK);
    else if (fromOk) reach(left, a, (1 - r.k) * reloadK);
    // The magazine: seated, in the hand (its top above the palm by what the grab point is below
    // the seat), or gone between the drop and the fresh one.
    if (r.mag === 'hand' && rig.gunPoint(SMG_MAG, a) && rig.gunPoint(RELOAD.grab, b)) {
     left[2].updateWorldMatrix(true, false);
     rig.magazine(mid.set(0, RELOAD.palm, 0).applyMatrix4(left[2].matrixWorld).add(a).sub(b));
     held = true;
    } else {
     // Let go: it falls from where the hand had it.
     if (held && r.mag === 'none' && rig.gunPoint(SMG_MAG, a)) {left[2].updateWorldMatrix(true, false); onDrop?.(mid.set(0, RELOAD.palm, 0).applyMatrix4(left[2].matrixWorld).clone()); stats.drops++;}
     held = false;
     rig.magazine(null, {hidden: r.mag === 'none'});
    }
    moved = true;
   } else {held = false; if (shown === 'smg') rig.magazine(null);}
   return moved;
  },
  /** Stage 1 hook: told where a magazine was let go (world), to drop it. */
  set onDrop(f) {onDrop = f;},
  reset() {current = null; swap = null; shown = null; reloadK = 0; wasReloading = false; held = false;}
 };
}

