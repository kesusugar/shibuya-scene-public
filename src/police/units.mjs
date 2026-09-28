// Police units (PLAN-POLICE-AND-OWN-CAR W2): patrol cars that chase, traffic that gives way,
// officers on foot, and the arrest. Bounded: cars come from the traffic pool and officers from the
// crowd's own pedestrians, so no new crowd or car system exists per unit.
//
// Nothing appears in view: a patrol car is placed on the lane graph 80–200 m away and outside the
// camera, an officer is a pedestrian 40–140 m away and out of view who is re-drawn in uniform.
import {pose,boxOverlap} from '../traffic/path.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {OFFICER_BASE} from '../life/appearance.mjs';
import {COMBAT} from '../player/combat.mjs';

/** Per star (index 0 unused). */
export const UNITS = Object.freeze({
 cars: [0, 1, 2, 4, 5, 6],
 officers: [0, 2, 4, 6, 8, 8],
 spawnNear: 80, spawnFar: 200,       // m, patrol cars
 officerNear: 40, officerFar: 140,   // m, officers
 spawnEvery: 1.5,                    // s between two new units
 chaseSpeed: 13, accel: 5,           // m/s, m/s²
 straightIn: 30,                     // m: the last stretch is driven straight at the player
 stopShort: 4.5,                     // m from the player's centre a patrol car stops
 carGap: 1.2,                        // m between a patrol car and the player's car, bumper to bumper
 reroute: 2,                         // s between route searches
 officerRun: 3.4,                    // m/s
 giveWayReach: 40, giveWayCone: 1.05,// m ahead of a siren, and the heading difference that counts
 arrestReach: 1.2, arrestFoot: 2,    // m, s: an officer's hands on a player who is not fighting
 closeTo: .95,                       // m: how near an officer comes
 batonReach: 1.7, batonEvery: 1.1,   // m, s: a player who fights back is hit with the baton
 carPin: 3.6, arrestCar: 3,          // m, s: a stopped player car with a patrol car against it
 leaveAfter: 60,                     // m out of view before a unit that lost the player is freed
 // Roadmap stage 3: at ☆4 and up the police get in front of a player who is going somewhere. Every
 // other new patrol car comes from ahead of the way they are travelling (inside `aheadCone` of it),
 // and the roadblock is set across the road ahead, once they are moving faster than `movingAt`.
 pincerFrom: 4, aheadCone: .55, movingAt: 3,
 // Owner's plan, item 2: a patrol car that reaches a player on foot stops within `dismountAt` and
 // its crew (`crew` officers) gets out to shoot; the empty car is left parked, and can be taken.
 dismountAt: 25, crew: 2, crewMax: 10
});

/** Lane sample points, for "the lane nearest this point" without scanning every path. */
function laneSamples(graph) {
 const out = [];
 const p = {};
 for (const lane of graph?.lanes ?? []) {
  if (!lane.allowed?.includes('police')) continue;
  for (let d = 0; d < lane.path.length; d += 10) {pose(lane.path, d, p); out.push({lane: lane.id, d, x: p.x, z: p.z});}
 }
 return out;
}

/** Lanes from `from` to `to` over transitions, breadth first. Returns [{lane}|{transition}] or null. */
export function routeLanes(graph, from, to, limit = 400) {
 if (from === to) return [{lane: from}];
 const prev = new Map([[from, null]]), queue = [from];
 while (queue.length && prev.size < limit) {
  const id = queue.shift();
  for (const t of graph.lanes[id]?.next ?? []) {
   const next = graph.transitions[t].to;
   if (prev.has(next) || !graph.lanes[next]?.allowed?.includes('police')) continue;
   prev.set(next, {id, t});
   if (next === to) {
    const steps = [{lane: to}];
    let at = to;
    while (prev.get(at)) {const {id: back, t: via} = prev.get(at); steps.unshift({lane: back}, {transition: via}); at = back;}
    // Collapse the duplicated lane entries the unshift pairs produce.
    return steps.filter((s, i) => !(s.lane !== undefined && steps[i - 1]?.lane === s.lane));
   }
   queue.push(next);
  }
 }
 return null;
}

const INNER = [[0, 0], [.35, .35], [-.35, .35], [.35, -.35], [-.35, -.35]];
/** The carriageway as a 4 m grid, and distances over it from a target. */
export function createRoadField(ctx, {cell = 4, origin = -250, size = 500} = {}) {
 const N = Math.ceil(size / cell), road = new Uint8Array(N * N), dist = new Int32Array(N * N).fill(-1);
 let built = 0, target = -1, queue = new Int32Array(N * N);
 const index = (x, z) => {const i = Math.floor((x - origin) / cell), j = Math.floor((z - origin) / cell);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;};
 const centre = k => ({x: origin + (k % N + .5) * cell, z: origin + ((k / N | 0) + .5) * cell});
 const nearestRoad = (x, z) => {
  const k = index(x, z); if (k < 0) return -1; if (road[k]) return k;
  const i0 = k % N, j0 = k / N | 0;
  for (let r = 1; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
   if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
   const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
   if (road[j * N + i]) return j * N + i;
  }
  return -1;
 };
 const api = {
  get ready() {return built >= N * N;},
  /** Build up to `budget` more cells. */
  build(budget = 300) {
   // A cell is road if its centre or any of four inner points is: centre-only sampling cut the
   // narrow necks and left 56 islands (95% in one piece); this leaves 6 (98.8%). Measured.
   for (; built < N * N && budget-- > 0; built++) {
    const c = centre(built); let on = 0;
    for (const [a, b] of INNER) if (ctx.onRoad([c.x + a * cell, c.z + b * cell])) {on = 1; break;}
    road[built] = on;
   }
   return api.ready;
  },
  /** Distances from the road cell nearest (x,z). Cheap enough to redo every second. */
  flow(x, z) {
   const start = nearestRoad(x, z); if (start < 0 || start === target) return;
   target = start; dist.fill(-1); dist[start] = 0;
   let head = 0, tail = 0; queue[tail++] = start;
   while (head < tail) {
    const k = queue[head++], i = k % N, j = k / N | 0, dk = dist[k] + 1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
     if (!di && !dj) continue;
     const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
     const n = b * N + a; if (!road[n] || dist[n] >= 0) continue;
     // No cutting a corner across a kerb: a diagonal needs both sides to be road.
     if (di && dj && (!road[j * N + a] || !road[b * N + i])) continue;
     dist[n] = dk; queue[tail++] = n;
    }
   }
  },
  /** Where to steer from (x,z): three cells down the field (or up it, `away`). Null off the field. */
  ahead(x, z, away = false) {
   let k = nearestRoad(x, z); if (k < 0 || dist[k] < 0) return null;
   for (let s = 0; s < 3; s++) {
    const i = k % N, j = k / N | 0; let best = k, bd = dist[k];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
     const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
     const n = b * N + a; if (dist[n] < 0) continue;
     if (away ? dist[n] > bd : dist[n] < bd) {bd = dist[n]; best = n;}
    }
    if (best === k) break; k = best;
   }
   return centre(k);
  },
  distanceAt(x, z) {const k = nearestRoad(x, z); return k < 0 ? -1 : dist[k];}
 };
 return api;
}

export function createPoliceUnits({koban = {x: 48.5, z: 20.4}, buildBudget = 150} = {}) {
 const cars = new Set(), officers = new Set();
 let samples = null, sampledGraph = null, clock = 0, spawnClock = 0;
 const arrest = {foot: 0, car: 0};
 let field = null, fieldCtx = null, flowClock = 0, blocked = false;
 const scratch = {};


 /** The player's travel: a smoothed velocity from where they have been (stage 3). */
 const motion = {x: 0, z: 0, speed: 0, last: null};
 function track(me, dt) {
  if (motion.last && dt > 0) {
   const vx = (me.x - motion.last.x) / dt, vz = (me.z - motion.last.z) / dt, k = Math.min(1, dt * 2);
   if (Math.hypot(vx, vz) < 80) {motion.x += (vx - motion.x) * k; motion.z += (vz - motion.z) * k;}
  }
  motion.last = {x: me.x, z: me.z}; motion.speed = Math.hypot(motion.x, motion.z);
 }
 /** Is (x, z) ahead of a moving player, inside the cone? */
 const aheadOf = (me, x, z) => {
  if (motion.speed < UNITS.movingAt) return false;
  const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz) || 1;
  return (dx * motion.x + dz * motion.z) / (d * motion.speed) > UNITS.aheadCone;
 };
 let pincerTurn = false;

 function spawnCar(traffic, me, visible, type = 'police', ahead = false) {
  const slot = traffic.pool.find(v => !v.active);
  if (!slot) return false;
  // Only where the flow field can bring the car to the player.
  field.flow(me.x, me.z);
  const pick = samples.filter(s => {
   const d = Math.hypot(s.x - me.x, s.z - me.z);
   return d >= UNITS.spawnNear && d <= UNITS.spawnFar && !visible(s.x, s.z) && field.distanceAt(s.x, s.z) >= 0;
  });
  if (!pick.length) return false;
  // The pincer: from in front of the player when asked and when anywhere in front will do.
  const front = ahead ? pick.filter(q => aheadOf(me, q.x, q.z)) : [];
  const from = front.length ? front : pick;
  const s = from[(clock * 997 | 0) % from.length];
  const lane = traffic.graph.lanes[s.lane];
  pose(lane.path, s.d, scratch);
  Object.assign(slot, {active: true, wear: null, kept: false, parked: false, controlled: true, service: false, platoon: undefined,
   type, x: scratch.x, z: scratch.z, heading: scratch.heading, speed: 0, brake: false, blinker: 0,
   lane: s.lane, transition: -1, next: -1, progress: s.d, age: 0, stuck: 0, junction: null, siren: true,
   pursuit: {leaving: false, ahead: !!front.length}});
  slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
  cars.add(slot);
  if (front.length) stats.ahead++;
  return true;
 }
 const stats = {ahead: 0, roadblocks: 0, roadblocksAhead: 0, dismounted: 0};
 let crowdRef = null, visibleRef = () => false, onFoot = false;

 /**
  * The crew gets out: `UNITS.crew` pedestrians from out of view become officers standing at the
  * car's doors (the same off-for-a-frame conversion the foot officers use), and the car is left
  * parked, its lights off, an ordinary car anyone -- the player included -- can get into. Taking it
  * is still a stolen police car (director.mjs: `policeCarTaken`).
  */
 function dismount(v, traffic, me) {
  cars.delete(v);
  Object.assign(v, {controlled: false, parked: true, service: false, siren: false, speed: 0, brake: false, pursuit: undefined, abandonedBy: 'police'});
  stats.dismounted++;
  const crowd = crowdRef; if (!crowd) return;
  const dims = VEHICLES[v.type] ?? VEHICLES.police, s = Math.sin(v.heading), c = Math.cos(v.heading);
  let placed = 0;
  for (const p of crowd.pool) {
   if (placed >= UNITS.crew || officers.size >= UNITS.crewMax) break;
   if (!p.active || p.officer || p.choreographed || p.crossing || p.combatDead || p.fatal || p.archetype === 'kid' || p.struck !== undefined) continue;
   if (visibleRef(p.x, p.z) || Math.hypot(p.x - me.x, p.z - me.z) < 30) continue;
   const side = placed ? 1 : -1, out = dims.width / 2 + .45;
   const x = v.x + c * side * out, z = v.z - s * side * out;
   crowd.despawn?.(p, 'officer'); p.active = false; p.downUntil = crowd.time + 1; p.officerPending = crowd.time + .05;
   p.x = x; p.z = z; p.renderX = x; p.renderZ = z; p.heading = Math.atan2(me.x - x, me.z - z);
   officers.add(p); placed++;
  }
 }

 // Pursuit follows a flow field over the carriageway, not a lane route: the lane graph is built
 // for traffic that despawns at a route's end, and fewer than one lane pair in ten connects
 // (measured on the HIGH graph), so a routed chase wandered off; and steering by look-ahead
 // alone stalls in narrow streets. A 4 m grid of road cells is built once, a few hundred cells a
 // frame (ctx.onRoad is ~37 µs a call), and a breadth-first distance from the player's cell is
 // refreshed every second. A car steers at the point three cells down the field.
 function driveCar(v, traffic, me, dt, wanted, visible) {
  const P = v.pursuit;
  const d = Math.hypot(me.x - v.x, me.z - v.z);
  if (!wanted) {
   P.leaving = true;
   if (d > UNITS.leaveAfter && !visible(v.x, v.z)) {traffic.despawn(v, 'police'); cars.delete(v); return;}
  }
  if (P.roadblock) {v.speed = 0; if (!P.leaving) return;}   // a roadblock stands until the level clears
  // Owner's plan, item 2: the player on foot and near: stop, and the crew gets out once stopped.
  if (!P.leaving && onFoot && d <= UNITS.dismountAt) {
   v.speed = Math.max(0, v.speed - UNITS.accel * 2 * dt); v.brake = true;
   if (v.speed < .3) dismount(v, traffic, me);
   return;
  }
  let aim = null;
  if (!P.leaving && d <= UNITS.straightIn) aim = me;
  else if (field?.ready) aim = field.ahead(v.x, v.z, P.leaving);
  const want = !P.leaving && d < UNITS.stopShort + 1 ? 0 : aim ? (P.leaving ? UNITS.chaseSpeed * .6 : UNITS.chaseSpeed) : 0;
  if (aim) {
   const h = Math.atan2(aim.x - v.x, aim.z - v.z);
   const turn = Math.atan2(Math.sin(h - v.heading), Math.cos(h - v.heading));
   v.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, turn));
   const goal = Math.abs(turn) > .9 ? Math.min(want, 5) : want;
   v.speed += Math.max(-UNITS.accel * 2 * dt, Math.min(UNITS.accel * dt, goal - v.speed));
  } else v.speed = Math.max(0, v.speed - UNITS.accel * 2 * dt);
  v.brake = v.speed < want - .3;
  let step = v.speed * dt;
  // Stop short of the player. In a car the gap is both bodies' half-lengths and a margin: the old
  // fixed 4.5 m between centres left a patrol car pressed into the player's car, which then could
  // not move at all (found on the device: rammed by a patrol car, the player's car stopped).
  const myDims = me.type ? VEHICLES[me.type] : null, dims = VEHICLES[v.type];
  const gap = myDims && dims ? Math.max(UNITS.stopShort, (myDims.length + dims.length) / 2 + UNITS.carGap) : UNITS.stopShort;
  if (!P.leaving) step = Math.min(step, Math.max(0, d - gap));
  const nx = v.x + Math.sin(v.heading) * step, nz = v.z + Math.cos(v.heading) * step;
  // And never into the player's car's box, whatever the angle.
  if (myDims && dims && boxOverlap({x: nx, z: nz, heading: v.heading}, dims, me, myDims, .15)) {v.speed = Math.min(v.speed, 1); return;}
  v.x = nx; v.z = nz;
 }

 /**
  * ☆4: a roadblock. Two patrol cars across the road, 80–140 m away and out of view, on a cell
  * the flow field reaches, turned across the direction the field runs there. Once per episode.
  */
 function roadblock(traffic, me, visible) {
  const free = traffic.pool.filter(v => !v.active);
  if (free.length < 2 || !field?.ready) return false;
  field.flow(me.x, me.z);
  // Stage 3: across the road ahead of a moving player (the first 20 tries), anywhere otherwise.
  const heading = Math.atan2(motion.x, motion.z), moving = motion.speed >= UNITS.movingAt;
  for (let tries = 0; tries < 40; tries++) {
   const a = moving && tries < 20 ? heading + ((tries % 5) - 2) * .22 : ((clock * 37 + tries * 2.39996) % (Math.PI * 2)), r = 80 + (tries * 7) % 60;
   const x = me.x + Math.sin(a) * r, z = me.z + Math.cos(a) * r;
   if (visible(x, z) || field.distanceAt(x, z) < 0) continue;
   const next = field.ahead(x, z); if (!next) continue;
   const along = Math.atan2(next.x - x, next.z - z), across = along + Math.PI / 2;
   const half = VEHICLES.police.length / 2 + .3;
   free.slice(0, 2).forEach((slot, i) => {
    const k = i ? 1 : -1;
    Object.assign(slot, {active: true, wear: null, kept: false, parked: false, controlled: true, service: false, platoon: undefined,
     type: 'police', x: x + Math.sin(across) * half * k, z: z + Math.cos(across) * half * k, heading: across,
     speed: 0, brake: true, blinker: 0, lane: -1, transition: -1, next: -1, progress: 0, age: 0, stuck: 0,
     junction: null, siren: true, pursuit: {leaving: false, roadblock: true}});
    slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
    cars.add(slot);
   });
   stats.roadblocks++; if (moving && tries < 20) stats.roadblocksAhead++;
   return true;
  }
  return false;
 }

 function giveWay(traffic, dt) {
  const sirens = traffic.pool.filter(v => v.active && v.siren);
  if (!sirens.length) return 0;
  let n = 0;
  for (const v of traffic.pool) {
   if (!v.active || v.controlled || v.parked || v.siren) continue;
   for (const s of sirens) {
    const dx = v.x - s.x, dz = v.z - s.z, d = Math.hypot(dx, dz);
    if (d > UNITS.giveWayReach || d < 1) continue;
    const ahead = (dx * Math.sin(s.heading) + dz * Math.cos(s.heading)) / d;
    const same = Math.abs(Math.atan2(Math.sin(v.heading - s.heading), Math.cos(v.heading - s.heading)));
    if (ahead < .6 || same > UNITS.giveWayCone) continue;
    // Slow and hold: the traffic step takes it from this speed, so it stays slow while the
    // siren is behind it.
    v.speed = Math.max(0, v.speed - 6 * dt); v.brake = true; v.givingWay = true; n++;
    break;
   }
  }
  return n;
 }

 function officerCandidates(crowd, me, visible, nearKoban) {
  const out = [];
  for (const p of crowd.pool) {
   if (!p.active || p.officer || p.choreographed || p.crossing || p.combatDead || p.fatal || p.archetype === 'kid' || p.struck !== undefined) continue;
   const d = Math.hypot(p.x - me.x, p.z - me.z);
   if (d < UNITS.officerNear || d > UNITS.officerFar || visible(p.x, p.z)) continue;
   if (nearKoban && Math.hypot(p.x - koban.x, p.z - koban.z) > 45) continue;
   out.push(p);
  }
  return out;
 }

 function driveOfficer(p, crowd, me, dt, wanted, visible, attacking, hurt) {
  if (!wanted) {
   // Walk off, then become an ordinary pedestrian again, out of sight.
   p.combatTarget = null; p.combatUntil = 0;
   if (!visible(p.x, p.z) && Math.hypot(p.x - me.x, p.z - me.z) > UNITS.leaveAfter) {
    p.officer = false; p.appearanceId = undefined; p.active = false; p.downUntil = crowd.time + 1;
    officers.delete(p);
   }
   return;
  }
  p.combatTarget = 'player'; p.combatUntil = crowd.time + 5; p.combatHealth ??= 100;
  const d = Math.hypot(me.x - p.x, me.z - p.z);
  p.heading = Math.atan2(me.x - p.x, me.z - p.z); p.state = 'fighting';
  // PLAN-WEAPONS W3: an officer covering an armed player with a revolver holds where they are
  // (guns.mjs sets `gunHold`) instead of walking into arm's reach. Unarmed, they close to arrest.
  if (p.gunHold) {p.speed = 0; return;}
  // The baton, for a player who is fighting back.
  p.batonNext ??= 0;
  if (attacking && d <= UNITS.batonReach && crowd.time >= p.batonNext) {p.batonNext = crowd.time + UNITS.batonEvery; hurt?.(COMBAT.officerDamage);}
  if (d > UNITS.closeTo) {
   const run = d > 4 ? UNITS.officerRun : 1.6;
   const step = Math.min(run * dt, d - UNITS.closeTo), nx = p.x + (me.x - p.x) / d * step, nz = p.z + (me.z - p.z) / d * step;
   p.speed = run;
   // An officer chasing crosses the road; only a wall stops them.
   const ctx = crowd.network?.ctx;
   if (!ctx?.solid?.(nx, nz, .28)) {
    const old = crowd.cell(p.x, p.z); p.x = nx; p.z = nz; p.renderX = nx; p.renderZ = nz;
    if (crowd.cell(nx, nz) !== old) {const b = crowd.grid.get(old), i = b?.indexOf(p); if (i >= 0) b.splice(i, 1); crowd.insert(p);}
   }
  }
 }

 const api = {
  cars, officers, arrest,
  get field() {return field;},
  /** Stage 3: the player's estimated travel and how often the police got in front of it. */
  get motion() {return {x: motion.x, z: motion.z, speed: motion.speed};},
  get stats() {return {...stats};},
  /**
   * One frame. `stars` from the wanted level; `visible(x,z)` whether a point is in the camera;
   * `me` the player's position; `attacking` whether the player is mid-swing; `driving` and
   * `carSpeed` for the in-car arrest. Returns 'arrested' on the frame the arrest completes.
   */
  update(dt, {stars = 0, traffic = null, crowd = null, me, visible = () => false, attacking = false,
               driving = false, carSpeed = 0, alive = true, hurt = null}) {
   clock += dt; spawnClock -= dt; crowdRef = crowd; visibleRef = visible; onFoot = !driving && alive;
   if (me) track(me, dt);
   if (traffic?.graph && sampledGraph !== traffic.graph) {samples = laneSamples(traffic.graph); sampledGraph = traffic.graph;}
   if (traffic?.graph?.ctx?.onRoad && fieldCtx !== traffic.graph.ctx) {fieldCtx = traffic.graph.ctx; field = createRoadField(fieldCtx);}
   if (field && !field.ready) field.build(buildBudget);
   flowClock -= dt;
   if (field?.ready && cars.size && flowClock <= 0) {flowClock = 1; field.flow(me.x, me.z);}
   const wanted = stars > 0;
   if (!wanted) blocked = false;
   // Units first leave when the level clears.
   if (traffic) for (const v of [...cars]) {if (!v.active || !VEHICLES[v.type]?.police) {cars.delete(v); continue;} driveCar(v, traffic, me, dt, wanted, visible);}
   if (crowd) for (const p of [...officers]) {if (!p.active && !p.officerPending) {officers.delete(p); continue;} if (p.active) driveOfficer(p, crowd, me, dt, wanted && !driving, visible, attacking, hurt);}
   // Pending conversions: off for a frame so the HQ layer drops the old body, then back in uniform.
   if (crowd) for (const p of officers) if (p.officerPending && !p.active && crowd.time >= p.officerPending) {
    p.officerPending = 0; p.active = true; p.downUntil = 0;
    Object.assign(p, {officer: true, appearanceId: OFFICER_BASE + p.id, combatTarget: 'player', combatUntil: crowd.time + 5,
     combatHealth: 100, combatDead: false, fatal: false, state: 'fighting', speed: 0, choreographed: false, crossing: null});
    crowd.insert?.(p);
   }
   if (wanted && spawnClock <= 0) {
    spawnClock = UNITS.spawnEvery;
    const has = t => [...cars].some(v => v.type === t);
    const tryBlock = traffic && field?.ready && stars >= 4 && !blocked && cars.size + 2 <= UNITS.cars[stars];
    if (tryBlock && roadblock(traffic, me, visible)) blocked = true;
    else if (traffic && samples?.length && field?.ready && cars.size < UNITS.cars[stars])
     spawnCar(traffic, me, visible, stars >= 5 && !has('riotBus') ? 'riotBus' : stars >= 4 && !has('unmarked') ? 'unmarked' : 'police',
      stars >= UNITS.pincerFrom && (pincerTurn = !pincerTurn));
    else if (crowd && officers.size < UNITS.officers[stars]) {
     const near = stars === 1 && Math.hypot(koban.x - me.x, koban.z - me.z) < 180;
     const c = officerCandidates(crowd, me, visible, near);
     const p = c[(clock * 131 | 0) % Math.max(1, c.length)];
     if (p) {crowd.despawn?.(p, 'officer'); p.active = false; p.downUntil = crowd.time + 1; p.officerPending = crowd.time + .15; officers.add(p);}
    }
   }
   const yielded = traffic ? giveWay(traffic, dt) : 0;

   // --- the arrest -------------------------------------------------------------------------
   // Owner's plan, item 2: no arrest by hands or by a pinned car any more. The player is taken only
   // when shot dead by the police (director.mjs turns that death into the arrest).
   const result = null;
   return {result, cars: cars.size, officers: [...officers].filter(p => p.active).length, yielded};
  },
  /** Is this pedestrian an officer (for crimes against the police). */
  isOfficer: p => !!p?.officer,
  dispose(traffic, crowd) {
   for (const v of cars) if (v.active) traffic?.despawn?.(v, 'police');
   for (const p of officers) {p.officer = false; p.appearanceId = undefined; p.officerPending = 0;}
   cars.clear(); officers.clear();
  }
 };
 return api;
}
