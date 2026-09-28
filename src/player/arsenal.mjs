// The player's weapons in the scene (PLAN-WEAPONS). The scene hands this one object its systems
// each frame; the rules live in weapons.mjs (inventory), combat.mjs (the katana's cut and a
// gunshot's wound), ballistics.mjs (where a bullet goes) and weapon-effects.mjs (what it looks
// like).
//
// It owns what the player is holding, and writes it onto the player's state -- `weapon`, and for
// the pistol `aim`, `aimTarget`, `aimHeading`, `shotLeft`, `reloadLeft` -- which is what the
// figure draws (figure.mjs, aim-layer.mjs) and combat reads.
import {createInventory,WEAPONS,GUNS,SHAPE} from './weapons.mjs';
import {createWeaponEffects} from './weapon-effects.mjs';
import {createImpactMarks,wallNormal} from './impact-marks.mjs';
import {castShot,peopleAlong,BALLISTICS} from './ballistics.mjs';
import {onRails} from './combat.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {ARCHETYPES} from '../life/config.mjs';

export const ARSENAL = Object.freeze({
 // Soft lock-on with a mouse: a person whose chest is this close to the crosshair ray (radians)
 // and this near is aimed at instead of the point behind them.
 softLock: .05, softRange: 40,
 // A pad's stick is coarser than a mouse (C3): its soft lock is a little wider.
 padLock: .12,
 // A phone aims by lock-on only (R16): the nearest person this far and this wide of the view.
 touchLock: .52, touchRange: 30,
 // A click without aiming raises the gun first; the shot waits for the aim, up to this long.
 raiseWait: .5, raiseWeight: .8,
 chest: 1.3,       // m above the feet: where a lock-on aims, on a 1.76 m body
 // Item 3, the pad's hard lock (ZL held): the nearest person this wide of the view and this near
 // is locked on and stays locked until ZL is let go, they drop, or they are out of `hardKeep`.
 // `head` is where a flick up aims (above ballistics' head line, below the crown). Turning the
 // controller (gyro) more than `gyroBreak` radians while locked lets go into free aim.
 hardLock: .6, hardRange: 40, hardKeep: 50, head: 1.62, gyroBreak: .08,
 // Roadmap ④: someone shooting at the player (or with a gun drawn) is taken first, from wider
 // and further -- the camera turns onto them. ZL let go and pressed again within `regrab` s takes
 // the next in that order; let go longer, it unlocks. Within a tier the order is distance plus
 // `anglePenalty` metres per radian off the view.
 threatCone: 1.75, threatRange: 60, regrab: .4, anglePenalty: 8,
 // Someone actually firing is taken from any side (behind too): the camera swings round.
 shooterCone: Math.PI,
 // Locked on someone who is not shooting, the lock looks this often (s) for someone who is, and
 // moves to them: chased, the gun is on whoever is firing without a press.
 threatCheck: .25,
 // A target picked by hand (ZL again, a flick) is kept this long (s) before that happens.
 manualHold: 3,
 muzzleFallback: 1.4
});

const heightOf = p => ARCHETYPES[p?.archetype]?.height ?? BALLISTICS.bodyHeight;
const aliveTarget = p => p?.active && !p.controlled && p.struck === undefined && !p.combatDead;

/**
 * Roadmap ④: how much a person matters to the lock. 0 someone who has fired at the player lately
 * (`shotAtPlayerLeft`, set by the police director), 1 someone with a gun out, 2 anyone else.
 */
export const threatTier = p => (p.shotAtPlayerLeft > 0 ? 0 : p.gunDrawn ? 1 : 2);

/**
 * Item 3: the people a pad's hard lock can take, each with its bearing off the view (radians,
 * + to the right of the screen), its angle off the centre, its distance and its `tier`. Threats
 * (tier 0-1) count out to `threatRange` and `threatCone`. Pure over `world`.
 */
export function lockCandidates(s, camera, world, {range = ARSENAL.hardRange, cone = ARSENAL.hardLock,
                                                 threatRange = ARSENAL.threatRange, threatCone = ARSENAL.threatCone} = {}) {
 const o = camera?.position ?? {x: s.x, y: s.y + 1.5, z: s.z};
 const d = camera?.direction ?? {x: Math.sin(s.heading), y: 0, z: Math.cos(s.heading)};
 const dl = Math.hypot(d.x, d.y, d.z) || 1, hl = Math.hypot(d.x, d.z) || 1;
 const out = [];
 for (const p of world.people(o, d, Math.max(range, threatRange), true)) {
  if (!aliveTarget(p) || p.archetype === 'kid') continue;
  const tier = threatTier(p), far = tier < 2 ? threatRange : range;
  const wide = tier === 0 ? ARSENAL.shooterCone : tier === 1 ? Math.max(cone, threatCone) : cone;
  const body = world.bodyOf?.(p) ?? {y: 0, height: heightOf(p)};
  const cy = body.y + ARSENAL.chest * body.height / BALLISTICS.bodyHeight;
  const vx = p.x - o.x, vy = cy - o.y, vz = p.z - o.z, dist = Math.hypot(vx, vy, vz);
  if (dist > far || dist < 1) continue;
  const angle = Math.acos(Math.max(-1, Math.min(1, (vx * d.x + vy * d.y + vz * d.z) / (dist * dl))));
  if (angle > wide) continue;
  if (!world.clear(s, p)) continue;
  // The screen's right, looking along (dx, dz), is (-dz, dx).
  const bearing = Math.atan2((-d.z * vx + d.x * vz) / hl, (d.x * vx + d.z * vz) / hl);
  out.push({p, angle, bearing, dist, tier});
 }
 return out;
}

/** Roadmap ④: candidates in lock order -- shooters, then drawn guns, then the rest, nearest first. */
export function lockOrder(candidates) {
 const key = c => c.dist + c.angle * ARSENAL.anglePenalty;
 return [...candidates].sort((a, b) => a.tier - b.tier || key(a) - key(b) || a.p.id - b.p.id);
}

/**
 * Gunfire in the street (R14): the nearest people within `radius` who can run, run -- at most
 * `cap` of them, so one shot cannot empty the crossing. Anyone on rails (a crossing in progress,
 * the Scramble cast on its track) is never taken off it: being stopped there holds the signals
 * (§16a), and the crossing's own clear-out moves them on. Pure over the crowd's grid. Returns how
 * many were sent running.
 */
export function gunfirePanic(crowd, x, z, {radius = WEAPONS.pistol.witnessRadius, cap = WEAPONS.pistol.panicCap,
                                         severity = WEAPONS.pistol.witnessSeverity} = {}) {
 if (!crowd?.grid || !crowd.flee) return 0;
 const near = [];
 const r = Math.ceil(radius / 2);
 for (let i = Math.floor(x / 2) - r; i <= Math.floor(x / 2) + r; i++) for (let j = Math.floor(z / 2) - r; j <= Math.floor(z / 2) + r; j++)
  for (const p of crowd.grid.get(i + ',' + j) ?? []) {
   if (!aliveTarget(p) || p.combatTarget === 'player' || p.officer) continue;
   const d = Math.hypot(p.x - x, p.z - z);
   if (d <= radius) near.push([d, p]);
  }
 near.sort((a, b) => a[0] - b[0]);
 let n = 0;
 for (const [d, p] of near) {
  if (n >= cap) break;
  if (onRails(p)) {crowd.say?.(p, 'alert', .8); continue;}
  if (crowd.flee(p, p.x - x, p.z - z, {urgency: severity * (1 - .4 * d / radius), from: {x, z}})) n++;
 }
 return n;
}

/**
 * §9ah: a round's direction off the aim for an automatic: the spread cone (a deterministic
 * sunflower spiral over the burst, so a test can repeat it) plus the recoil's climb. Pure.
 * `dir` is the aim direction; returns a new unit vector.
 */
export function spreadDirection(dir, {spread = 0, climb = 0, index = 0} = {}) {
 const len = Math.hypot(dir.x, dir.y, dir.z) || 1, d = {x: dir.x / len, y: dir.y / len, z: dir.z / len};
 // The aim's own frame: a horizontal side vector r, and up = d x r (for d = +Z, r = +X, up = +Y).
 let rx = d.z, rz = -d.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
 const ux = d.y * rz, uy = d.z * rx - d.x * rz, uz = -d.y * rx;
 const golden = 2.399963, r = spread * Math.sqrt(((index * .618034) % 1)), a = index * golden;
 const off = Math.tan(climb);
 const x = d.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r + ux * off;
 const y = d.y + uy * Math.sin(a) * r + uy * off;
 const z = d.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r + uz * off;
 const n = Math.hypot(x, y, z);
 return {x: x / n, y: y / n, z: z / n};
}

/**
 * @param {object} [options]
 * @param {any} [options.effects]
 * @param {null|((shot:any)=>void)} [options.onShot] every shot: the scene's sound, bloom and crimes
 * @param {null|((event:any)=>number)} [options.onWitness] the HQ crowd's visual reaction (bounded there)
 * @param {null|((x:number,y:number,z:number,kind:string)=>any)} [options.onLand] stage 1: a casing or magazine hits the ground
 */
export function createArsenal({effects = createWeaponEffects(), onShot = null, onWitness = null, onLand = null} = {}) {
 const inventory = createInventory();
 // Stage 1: holes, casings, smoke, dropped magazines and blood pools (impact-marks.mjs), drawn
 // with the rest of the weapon effects. `onLand` hears a casing or a magazine hit the ground.
 const marks = createImpactMarks(); effects.root.add(marks.root);
 let groundOf = null;
 const dropMag = at => marks.magazine(at);
 let wasDriving = false, aimHeld = false, pendingShot = 0, lastShot = null, touchAim = 0;
 // §9ah: the automatic's trigger, held; its spread and recoil, and the round index in the burst.
 let triggerHeld = false, spread = 0, recoil = 0, burst = 0;
 // §9aj: the person the crosshair's ray last met, if any.
 let lastRayTarget = null;
 // Item 3: the aim came from the pad (ZL), the trigger from the pad (ZR); the hard lock ({p, part})
 // while ZL is held, a flick waiting for the next frame, and gyro turn since the lock was taken.
 let aimPad = false, triggerPad = false, hard = null, flickQueued = null, gyroTurn = 0, lockBroken = false;
 // Roadmap ④: the arsenal's own clock, when ZL was let go (the lock waits `regrab` for a re-press),
 // a re-press waiting to take the next target, and where the lock aimed last frame.
 let clock = 0, releasedAt = -Infinity, cycleQueued = false, hardAt = null, threatCheckAt = -Infinity, manualUntil = -Infinity;
 const hardPoint = (world, h) => {
  const body = world.bodyOf?.(h.p) ?? {y: 0, height: heightOf(h.p)};
  return {x: h.p.x, y: body.y + (h.part === 'head' ? ARSENAL.head : ARSENAL.chest) * body.height / BALLISTICS.bodyHeight, z: h.p.z};
 };
 /** The pad's lock this frame: kept, retaken, switched by a flick, or let go. */
 function hardLock(player, camera, world) {
  const s = player.state;
  if (hard && (!aliveTarget(hard.p) || Math.hypot(hard.p.x - s.x, hard.p.z - s.z) > ARSENAL.hardKeep || !world.clear(s, hard.p))) hard = null;
  const flick = flickQueued; flickQueued = null;
  const cycle = cycleQueued; cycleQueued = false;
  if (!hard) {
   // Taken (or retaken when the last one drops): whoever is shooting, then a drawn gun, then the
   // nearest person in view (roadmap ④).
   const best = lockOrder(lockCandidates(s, camera, world))[0];
   if (best) {hard = {p: best.p, part: 'chest'}; gyroTurn = 0; stats.locks++;}
   return hard;
  }
  if (cycle) {
   // ZL again: the next in the order after the one held, round to the first -- but someone
   // shooting comes before anyone who is not, whoever is held.
   const order = lockOrder(lockCandidates(s, camera, world));
   if (order.length) {
    const i = order.findIndex(c => c.p === hard.p);
    const next = i < 0 || order[0].tier < threatTier(hard.p) ? order[0] : order[(i + 1) % order.length];
    if (next.p !== hard.p) {hard = {p: next.p, part: 'chest'}; stats.switchedLocks++;}
   }
   manualUntil = clock + ARSENAL.manualHold;
   return hard;
  }
  // Held on someone not shooting while someone is: onto the one shooting.
  if (threatTier(hard.p) > 0 && clock >= manualUntil && clock - threatCheckAt >= ARSENAL.threatCheck) {
   threatCheckAt = clock;
   const best = lockOrder(lockCandidates(s, camera, world))[0];
   if (best && best.tier === 0 && best.p !== hard.p) {hard = {p: best.p, part: 'chest'}; stats.switchedLocks++; return hard;}
  }
  if (flick === 'up') hard.part = 'head';
  else if (flick === 'down') hard.part = 'chest';
  else if (flick === 'left' || flick === 'right') {
   const all = lockCandidates(s, camera, world, {cone: ARSENAL.hardLock * 1.5});
   const cur = all.find(c => c.p === hard.p)?.bearing ?? 0, side = flick === 'right' ? 1 : -1;
   let next = null;
   for (const c of all) if (c.p !== hard.p && (c.bearing - cur) * side > .005 && (!next || (c.bearing - cur) * side < (next.bearing - cur) * side)) next = c;
   if (next) {hard = {p: next.p, part: hard.part}; stats.switchedLocks++; manualUntil = clock + ARSENAL.manualHold;}
  }
  return hard;
 }
 // Roadmap stage 2: whom the gun is on this frame (their pool id), for hands up and the armed.
 let aimedId = null;
 const isGun = id => GUNS.includes(id);
 const stats = {locks: 0, switchedLocks: 0, switches: 0, clanks: 0, shots: 0, hits: 0, headshots: 0, kills: 0, walls: 0, cars: 0, misses: 0, panicked: 0, maxPanic: 0};

 /** Where the camera's centre ray first meets something, or `range` out along it. */
 function cameraPoint(camera, world, range) {
  const o = camera.position, d = camera.direction;
  const hit = castShot({from: o, dir: d, range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(o, d, range), skip: world.skip, bodyOf: world.bodyOf});
  lastRayTarget = hit.kind === 'person' ? hit.target : null;
  return hit;
 }
 /** Soft lock (mouse) or lock-on (touch): the person the aim should snap to, or null. */
 function lockTarget(player, camera, world, touch, pad = false) {
  const s = player.state, o = camera?.position ?? {x: s.x, y: s.y + 1.5, z: s.z};
  const d = camera?.direction ?? {x: Math.sin(s.heading), y: 0, z: Math.cos(s.heading)};
  const range = touch ? ARSENAL.touchRange : ARSENAL.softRange, limit = touch ? ARSENAL.touchLock : pad ? ARSENAL.padLock : ARSENAL.softLock;
  let best = null, score = Infinity;
  for (const p of world.people(o, d, range, touch)) {
   if (!aliveTarget(p) || p.archetype === 'kid') continue;
   const body = world.bodyOf?.(p) ?? {y: 0, height: heightOf(p)};
   const cy = body.y + ARSENAL.chest * body.height / BALLISTICS.bodyHeight;
   const vx = p.x - o.x, vy = cy - o.y, vz = p.z - o.z, dist = Math.hypot(vx, vy, vz);
   if (dist > range || dist < 1) continue;
   const cos = (vx * d.x + vy * d.y + vz * d.z) / (dist * Math.hypot(d.x, d.y, d.z));
   const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
   if (angle > limit) continue;
   if (!world.clear(s, p)) continue;   // behind a wall: no lock
   const sc = angle * 20 + dist * .05;
   if (sc < score) {score = sc; best = {p, x: p.x, y: cy, z: p.z};}
  }
  return best;
 }

 function fire(player, world, figure, time) {
  const s = player.state, t = s.aimTarget, gunId = inventory.current, w = WEAPONS[gunId];
  if (!inventory.fire()) return null;
  // The muzzle as the figure holds it; without a figure, in front of the chest.
  const from = (figure && world.muzzle?.(figure)) ||
   {x: s.x + Math.sin(s.aimHeading ?? s.heading) * .45, y: s.y + ARSENAL.muzzleFallback, z: s.z + Math.cos(s.aimHeading ?? s.heading) * .45};
  let dir = {x: t.x - from.x, y: t.y - from.y, z: t.z - from.z};
  if (w.auto) {
   // The round goes where the gun points after the recoil so far, inside the burst's spread;
   // then this round adds its own climb and opens the spread.
   dir = spreadDirection(dir, {spread: w.spread.first + spread, climb: recoil, index: burst});
   burst++; spread = Math.min(w.spread.max, spread + w.spread.perShot); recoil += w.recoil.climb;
  }
  const hit = castShot({from, dir, range: w.range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(from, dir, w.range), skip: world.skip, bodyOf: world.bodyOf});
  stats.shots++;
  s.shotLeft = w.shotSeconds;
  effects.muzzle(from.x, from.y, from.z, hit.dir);
  effects.tracer(from, hit.point);
  // Stage 1: the spent case out of the port (above the grip, behind the muzzle) and a breath of
  // smoke off the muzzle; an automatic's rounds each leave a little, and it gathers.
  {const port = (SHAPE[gunId]?.muzzle?.[2] ?? .2) - (w.auto ? .12 : .05), d = hit.dir;
   marks.casing({x: from.x - d.x * port, y: from.y - d.y * port + .02, z: from.z - d.z * port}, d);
   marks.smoke(from, d, w.auto ? 1 : 3);}
  let outcome = null;
  if (hit.kind === 'person') {
   stats.hits++; if (hit.zone === 'head') stats.headshots++;
   outcome = world.wound?.(hit.target, {damage: w.bodyDamage, head: hit.zone === 'head', dir: hit.dir, weapon: gunId, part: hit.part}) ?? null;
   if (outcome === 'killed') stats.kills++;
   world.bleed?.(hit.point, hit.dir);
   // §9ai H2: blood out of the wound, along the round (an automatic's rounds spray less each).
   effects.blood(hit.point.x, hit.point.y, hit.point.z, {dir: hit.dir, count: w.auto ? 10 : 18, spread: .45});
  } else if (hit.kind === 'wall' || hit.kind === 'ground') {
   stats.walls++;
   // Stage 1: the hole it leaves.
   marks.hole(hit.point, hit.kind === 'ground' ? {x: 0, y: 1, z: 0} : wallNormal(hit.point, hit.dir, world.solid));
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 10, nx: -hit.dir.x, nz: -hit.dir.z});
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 6, dust: true, nx: -hit.dir.x, nz: -hit.dir.z});
  } else if (hit.kind === 'car') {
   stats.cars++;
   // Stage 6: the car takes it -- a dent below the windows, a crack or a pane gone above them.
   const r = world.shootCar?.(hit.target, hit.point, hit.dir) ?? null;
   if (r?.kind === 'glass' && effects.glass) effects.glass(hit.point.x, hit.point.y, hit.point.z, {dir: hit.dir, count: r.glass === 'shatter' ? 40 : 8});
   else effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 14, nx: -hit.dir.x, nz: -hit.dir.z});
  } else stats.misses++;
  // The street hears it (R14): the nearest run, capped; the HQ crowd looks, bounded there.
  const panicked = gunfirePanic(world.crowd, s.x, s.z, {radius: w.witnessRadius, cap: w.panicCap, severity: w.witnessSeverity});
  stats.panicked += panicked; stats.maxPanic = Math.max(stats.maxPanic, panicked);
  onWitness?.({x: s.x, z: s.z, severity: w.witnessSeverity, radius: w.witnessRadius, kind: 'gunshot'});
  lastShot = {kind: hit.kind, zone: hit.zone, distance: +hit.distance.toFixed(2), outcome, time,
   from: {...from}, point: hit.point, target: hit.target?.id ?? null, weapon: gunId};
  onShot?.({...lastShot, heading: s.aimHeading ?? s.heading, hit});
  if (inventory.state.rounds === 0) inventory.reload();
  return lastShot;
 }

 const api = {
  inventory, effects, marks,
  get current() {return inventory.current;},
  get weapon() {return WEAPONS[inventory.current];},
  get aiming() {return aimHeld;},
  get lastShot() {return lastShot;},
  /** Stage 2: the pool id of the person the raised gun is on, or null. */
  get aimedAt() {return aimedId;},
  /** 1/2/3. Refused mid-swing (`busy`), while reloading, and in a car. */
  select(slot, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.select(slot, {busy});
   if (ok) {stats.switches++; pendingShot = 0;}
   return ok;
  },
  cycle(step, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.cycle(step, {busy});
   if (ok) {stats.switches++; pendingShot = 0;}
   return ok;
  },
  /**
   * The right mouse button, or the pad's ZL (`pad`: item 3, the hard lock). Letting go unlocks.
   */
  aim(on, {pad = false} = {}) {
   const was = aimHeld;
   aimHeld = !!on;
   // Roadmap ④: ZL let go keeps the lock for `regrab` s; pressed again in time, the next target.
   if (pad && !on && was && hard) {releasedAt = clock; flickQueued = null; return;}
   if (pad && on && !was && hard && clock - releasedAt <= ARSENAL.regrab) {aimPad = true; cycleQueued = true; return;}
   aimPad = aimHeld && !!pad;
   if (!aimPad) {hard = null; hardAt = null; flickQueued = null; cycleQueued = false; lockBroken = false; gyroTurn = 0;}
   else {hard = null; hardAt = null; lockBroken = false; gyroTurn = 0;}
  },
  /**
   * §9ah: the attack button held (the mouse's left, E, the pad's ZR): an automatic keeps firing.
   * From the pad (`pad`) it fires only while ZL is held too (item 3).
   */
  hold(on, {pad = false} = {}) {triggerHeld = !!on; triggerPad = !!on && !!pad; if (!on && WEAPONS[inventory.current]?.auto) pendingShot = 0;},
  /** Item 3: a right-stick flick while locked ('left'/'right' switch, 'up' head, 'down' chest). */
  lockFlick(dir) {if (hard) flickQueued = dir;},
  /** Item 3: the controller turned (gyro) while locked: past `gyroBreak`, free aim until ZL again. */
  lockGyro(yaw = 0, pitch = 0) {
   if (!hard) return;
   gyroTurn += Math.hypot(yaw, pitch);
   if (gyroTurn > ARSENAL.gyroBreak) {hard = null; lockBroken = true; gyroTurn = 0;}
  },
  /** Item 3: the pad's hard lock -- {id, part, x, y, z} -- or null. */
  get lock() {return hard && aimHeld && aimPad && hardAt ? {id: hard.p.id, part: hard.part, tier: threatTier(hard.p), x: hardAt.x, y: hardAt.y, z: hardAt.z} : null;},
  /** §9ah: the drawn automatic's muzzle climb (radians) and spread, for the figure and the camera. */
  get recoil() {return recoil;},
  get spread() {return spread;},
  /**
   * The attack button with the pistol out. With the gun already up it fires at once; otherwise
   * it raises the gun and fires when it is up (a hip shot is not a thing this body can do). On a
   * phone (`touch`) it also locks on for the shot. Returns false if this is not a gun.
   */
  trigger({touch = false, pad = false} = {}) {
   if (!isGun(inventory.current)) return false;
   // Item 3 (owner's choice): the pad's ZR does not fire a gun without ZL. Taken, so no punch either.
   if (pad && !aimHeld) return true;
   if (inventory.state.rounds === 0) {inventory.reload(); return true;}
   pendingShot = ARSENAL.raiseWait; if (touch) touchAim = ARSENAL.raiseWait + .35;
   return true;
  },
  reload() {return inventory.reload();},
  /** What the feedback bus says about the weapons. Returns true if it was a weapon event. */
  event(e) {
   if (e.kind === 'blade_clank') {effects.burst(e.x, 1.2, e.z, {count: 18}); stats.clanks++; return true;}
   return false;
  },
  /**
   * One frame. `player` is the controller, `figure` the drawn body (for the muzzle and the aim
   * weight), `driving` whether the player is in a car (R18: a car holsters everything, and
   * stepping out brings back the fists). `world` is the scene's collision world:
   *   {solid, ground, cars, dimsOf, people(from, dir, range), skip, clear(a, p), crowd,
   *    wound(p, hit), bleed(point, dir), muzzle(figure)}
   * `camera` {position, direction} is the view's centre ray; without one the aim is straight
   * ahead. `touch` means aiming is lock-on only (R16).
   */
  frame(dt, {player, figure = null, driving = false, world = null, camera = null, touch = false, pad = false, time = 0} = {}) {
   inventory.update(dt);
   clock += dt;
   if (hard && !aimHeld && clock - releasedAt > ARSENAL.regrab) {hard = null; hardAt = null; aimPad = false;}
   if (driving && !wasDriving) {inventory.holster(); aimHeld = false; aimPad = false; hard = null; hardAt = null; pendingShot = 0;}
   if (!driving && wasDriving) inventory.unholster();
   wasDriving = driving;
   effects.update(dt);
   if (world?.ground) groundOf = world.ground;
   marks.update(dt, {ground: groundOf ?? undefined, onLand});
   // A magazine the hand lets go of during the automatic's reload falls to the ground (hands.mjs).
   if (figure?.hands) figure.hands.onDrop = dropMag;
   aimedId = null;
   const s = player?.state; if (!s) return;
   if (driving) s.crouching = false;              // W4: nobody crouches in a car seat
   s.weapon = inventory.current;
   s.shotLeft = Math.max(0, (s.shotLeft ?? 0) - dt);
   // §9ah: an automatic's recoil settles and its spread closes; a released trigger ends the burst.
   const drawnGun = WEAPONS[inventory.current];
   if (drawnGun?.auto) {
    recoil = Math.max(0, recoil - recoil * Math.min(1, drawnGun.recoil.settle * dt));
    if (!triggerHeld) {spread = Math.max(0, spread - drawnGun.spread.recover * dt); burst = 0;}
   } else {recoil = 0; spread = 0; burst = 0;}
   s.recoil = recoil;
   s.reloadLeft = inventory.state.reloading;
   pendingShot = Math.max(0, pendingShot - dt); touchAim = Math.max(0, touchAim - dt);
   const gun = isGun(inventory.current) && !driving && s.alive !== false && !(s.vehiclePhase > 0);
   const auto = gun && !!WEAPONS[inventory.current].auto;
   // An automatic keeps the gun up while the trigger is held, as a pending shot does.
   if (auto && triggerHeld && (!triggerPad || aimHeld) && inventory.state.rounds > 0) pendingShot = Math.max(pendingShot, .05);
   const wants = gun && (aimHeld || pendingShot > 0 || touchAim > 0);
   s.aim = wants && inventory.state.reloading <= 0 ? 1 : 0;
   if (!gun || !world) {if (!gun) s.aim = 0; return;}
   if (s.aim || s.shotLeft > 0) {
    // What the crosshair is on: the person the lock picks, or the first thing on the camera ray.
    // Item 3: ZL on the pad holds a hard lock; otherwise (mouse, touch, a lock let go by the
    // gyro) the soft lock as before.
    const h = aimPad && !lockBroken && s.aim ? hardLock(player, camera, world) : null;
    const lock = h ? {p: h.p, ...hardPoint(world, h)} : lockTarget(player, camera, world, touch, pad);
    hardAt = h ? {x: lock.x, y: lock.y, z: lock.z} : null;
    let point;
    if (lock) point = {x: lock.x, y: lock.y, z: lock.z};
    else if (camera) point = cameraPoint(camera, world, WEAPONS[inventory.current].range).point;
    else point = {x: s.x + Math.sin(s.heading) * 20, y: s.y + ARSENAL.chest, z: s.z + Math.cos(s.heading) * 20};
    s.aimTarget = point; s.aimLock = lock?.p?.id ?? null;
    // §9aj G1: whoever is on the crosshair gets a detailed body before the round lands.
    const on = lock?.p ?? (camera && !lock ? lastRayTarget : null);
    if (on && world.crowd) on.aimedUntil = (world.crowd.time ?? 0) + .6;
    aimedId = s.aim > 0 && on ? on.id : null;
    s.aimHeading = Math.atan2(point.x - s.x, point.z - s.z);
    // Standing, the body's heading is the aim: a step off then starts from where the gun points.
    if ((s.speed ?? 0) < .16) s.bodyHeading = s.aimHeading;
   }
   // Fire once the gun is up (or at once without a figure to wait for).
   // Stage 1: and not while the hand is still changing weapons (hands.mjs).
   const up = (!figure?.aim || figure.aim.aimWeight >= ARSENAL.raiseWeight) && !figure?.hands?.busy;
   if (pendingShot > 0 && s.aim && up && inventory.canFire) {
    // The pistol fires once per press; an automatic, every refire while the trigger is held.
    if (!auto || !triggerHeld) pendingShot = 0;
    fire(player, world, figure, time);
   }
  },
  /** Respawn or leaving play: fists, a full magazine, nothing in flight. */
  reset() {inventory.reset(); wasDriving = false; aimHeld = false; aimPad = false; triggerPad = false; hard = null; hardAt = null; cycleQueued = false; releasedAt = -Infinity; flickQueued = null; lockBroken = false; gyroTurn = 0; pendingShot = 0; touchAim = 0; triggerHeld = false; spread = 0; recoil = 0; burst = 0;},
  snapshot() {return {...inventory.snapshot(), ...stats, aiming: aimHeld, lastShot,
   // Roadmap ④: the pad lock's state, for QA.
   padLock: {pad: aimPad, id: hard?.p?.id ?? null, broken: lockBroken, manualFor: +Math.max(0, manualUntil - clock).toFixed(2), sinceRelease: +(clock - releasedAt).toFixed(2)}, effects: effects.stats, marks: marks.stats};},
  dispose() {marks.dispose(); effects.dispose();}
 };
 return api;
}
