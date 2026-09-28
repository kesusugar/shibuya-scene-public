// Missions (roadmap stage 5): a board of short jobs, each paid in cash.
//
//   delivery  渋谷デリバリー   the existing three-stop run (objective.mjs), paid by its score.
//   chase     追跡            a car makes a break for it; stay on it until it gives up.
//   escape    逃走            the police are called on you (☆2); lose them.
//   escort    護送            walk a client to an address alive, keeping them close.
//   snatch    ひったくり犯を追え a thief grabs a bag nearby and runs; stop them.
//
// Pure over the simulations it is handed each frame (like police/units.mjs): the chase target is a
// traffic slot driven here over the carriageway flow field (units.mjs's createRoadField, run the
// other way -- away from the player); the client and the thief are crowd people moved by the
// simulation's `follow` hold (simulation.mjs); the escape uses the wanted level.

import {createDelivery} from '../player/objective.mjs';
import {route,edgePose} from '../life/network.mjs';
import {createRoadField} from '../police/units.mjs';

export const MISSIONS = Object.freeze([
 Object.freeze({id: 'delivery', name: '渋谷デリバリー', short: '配達', brief: '徒歩と車で3か所へ。降車して停止すると配達できます。', reward: 3000}),
 Object.freeze({id: 'chase', name: '追跡', short: '追跡', brief: '逃げる車を追い、そばに張り付いて止めさせる。', reward: 8000}),
 Object.freeze({id: 'escape', name: '逃走', short: '逃走', brief: '通報された。手配度☆2から逃げ切る。', reward: 6000}),
 Object.freeze({id: 'escort', name: '護送', short: '護送', brief: '依頼人をそばに付けたまま、無事に届け先まで。', reward: 7000}),
 Object.freeze({id: 'snatch', name: 'ひったくり犯を追え', short: 'ひったくり', brief: 'バッグを奪って逃げる男を止める。', reward: 5000})
]);

export const MISSION = Object.freeze({
 chase: Object.freeze({seconds: 150, spawn: [45, 80], speed: 12.5, slow: 8, stretch: 60, catchRange: 7, catchSeconds: 2.5, lose: 220, type: 'coupe'}),
 escape: Object.freeze({seconds: 240, stars: 2}),
 escort: Object.freeze({seconds: 240, pick: 25, dest: [90, 150], follow: 1.8, walk: 1.5, run: 4.6, lost: 35, lostSeconds: 10, arrive: 4}),
 snatch: Object.freeze({seconds: 120, victim: [6, 25], run: 3.9, dest: [140, 220], lose: 110, tackle: 1.6, spare: 1500})
});

const adult = p => p?.active && !p.controlled && !p.officer && !p.combatDead && p.struck === undefined && p.archetype !== 'kid'
 && !p.crossing && !p.choreographed && !p.combatTarget && !p.gunDrawn && !p.crawling && !p.limp;

/** Waypoints along a pedestrian route (edge ids), every ~3 m. */
function waypoints(network, edgeIds) {
 const out = [], p = {};
 for (const id of edgeIds) {const e = network.edges[id]; for (let d = 0; d < e.length; d += 3) {edgePose(network, e, d, p); out.push({x: p.x, z: p.z});}}
 return out;
}
/** A reachable node `range` [lo, hi] m from (x, z), with its route from the node nearest (x, z). */
function destination(network, x, z, [lo, hi], salt = 0) {
 const nodes = (network.eligible?.length ? network.eligible : network.nodes).filter(n => network.ctx.safe(n.x, n.z, .4));
 const from = [...nodes].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
 if (!from) return null;
 const ring = nodes.filter(n => n.component === from.component && Math.hypot(n.x - x, n.z - z) >= lo && Math.hypot(n.x - x, n.z - z) <= hi);
 for (let k = 0; k < Math.min(ring.length, 30); k++) {
  const n = ring[(k * 7 + salt * 13) % ring.length];
  const path = route(network, from.id, n.id);
  if (path.length) return {node: n, path, points: waypoints(network, path)};
 }
 return null;
}

export function createMissionBoard(network) {
 const delivery = createDelivery(network);
 let m = null, field = null, fieldCtx = null, runs = 0;
 const done = (status, reason = '') => {m.status = status; m.reason = reason; m.endedAt = m.elapsed;};
 const release = world => {
  if (!m) return;
  if (m.car?.active) {Object.assign(m.car, {controlled: false, service: false, parked: true, speed: 0, missionTarget: false});}
  // A client or a thief is left standing where the mission left them (their old walk is gone).
  for (const p of [m.client, m.thief]) if (p) {p.follow = null; p.missionRole = null; p.mode = 'idle'; p.edge = -1; p.route = []; p.pause = 0;}
  if (m.id === 'delivery') delivery.cancel();
 };

 function startChase(world) {
  const {traffic, player} = world;
  if (!traffic?.graph?.ctx?.onRoad) return 'この場所では追跡できません';
  if (!field || fieldCtx !== traffic.graph.ctx) {fieldCtx = traffic.graph.ctx; field = createRoadField(fieldCtx);}
  const slot = traffic.pool.find(v => !v.active); if (!slot) return '車が見つかりません';
  // A lane point in the spawn ring, ahead of the player if one is.
  const cands = [], p = {};
  for (const lane of traffic.graph.lanes) for (let d = 0; d < lane.path.length; d += 6) {
   const L = lane.path, i = Math.min(L.x.length - 1, Math.round(d / L.length * (L.x.length - 1)));
   const x = L.x[i], z = L.z[i], r = Math.hypot(x - player.x, z - player.z);
   if (r >= MISSION.chase.spawn[0] && r <= MISSION.chase.spawn[1]) cands.push({x, z, h: L.h[i], lane: lane.id, ahead: (x - player.x) * Math.sin(player.heading ?? 0) + (z - player.z) * Math.cos(player.heading ?? 0)});
  }
  if (!cands.length) return 'この場所では追跡できません';
  cands.sort((a, b) => b.ahead - a.ahead);
  const c = cands[runs % Math.min(cands.length, 5)];
  Object.assign(slot, {active: true, wear: null, kept: false, parked: false, controlled: true, service: true, missionTarget: true, platoon: undefined,
   type: MISSION.chase.type, x: c.x, z: c.z, heading: c.h, speed: 0, brake: false, blinker: 0, lane: c.lane, transition: -1, next: -1,
   progress: 0, age: 0, stuck: 0, junction: null, siren: false, pursuit: undefined});
  slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
  m.car = slot; m.close = 0; m.flowClock = 0; void p;
  return null;
 }
 function tickChase(dt, world) {
  const v = m.car, me = world.driving && world.car ? world.car : world.player;
  if (!v?.active) return done('failed', '見失った');
  if (field && !field.ready) field.build(600);
  const d = Math.hypot(me.x - v.x, me.z - v.z);
  if (d > MISSION.chase.lose) return done('failed', '逃げられた');
  if (m.caught) {v.speed = Math.max(0, v.speed - 8 * dt); return;}
  // Close enough, long enough: they give up.
  m.close = d <= MISSION.chase.catchRange ? m.close + dt : Math.max(0, m.close - dt * .5);
  m.progress = m.close / MISSION.chase.catchSeconds;
  if (m.close >= MISSION.chase.catchSeconds) {m.caught = true; v.brake = true; return done('complete', '車を止めさせた');}
  // Driving away over the flow field: up the distance from the player, slower when far ahead.
  m.flowClock -= dt;
  if (field?.ready && m.flowClock <= 0) {m.flowClock = 1; field.flow(me.x, me.z);}
  const aim = field?.ready ? field.ahead(v.x, v.z, true) : null;
  const want = aim ? (d > MISSION.chase.stretch ? MISSION.chase.slow : MISSION.chase.speed) : 0;
  if (aim) {
   const h = Math.atan2(aim.x - v.x, aim.z - v.z), turn = Math.atan2(Math.sin(h - v.heading), Math.cos(h - v.heading));
   v.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, turn));
   const goal = Math.abs(turn) > .9 ? Math.min(want, 5) : want;
   v.speed += Math.max(-10 * dt, Math.min(5 * dt, goal - v.speed));
  } else v.speed = Math.max(0, v.speed - 6 * dt);
  v.x += Math.sin(v.heading) * v.speed * dt; v.z += Math.cos(v.heading) * v.speed * dt;
  m.target = {x: v.x, z: v.z, label: '逃走車'};
 }

 function startEscort(world) {
  const {crowd, player} = world;
  const near = (crowd?.pool ?? []).filter(adult).map(p => [Math.hypot(p.x - player.x, p.z - player.z), p]).filter(([d]) => d <= MISSION.escort.pick).sort((a, b) => a[0] - b[0]);
  if (!near.length) return '近くに依頼人がいません';
  const client = near[0][1], dest = destination(network, player.x, player.z, MISSION.escort.dest, runs);
  if (!dest) return '届け先が見つかりません';
  client.missionRole = 'client'; client.flee = null; m.client = client;
  m.dest = dest.node; m.lostFor = 0;
  return null;
 }
 function tickEscort(dt, world) {
  const c = m.client, me = world.driving && world.car ? world.car : world.player;
  if (!c?.active || c.combatDead || c.struck !== undefined) return done('failed', '依頼人が倒れた');
  const d = Math.hypot(c.x - me.x, c.z - me.z);
  m.lostFor = d > MISSION.escort.lost ? m.lostFor + dt : 0;
  if (m.lostFor >= MISSION.escort.lostSeconds) return done('failed', '依頼人を置き去りにした');
  // Follow a step behind the player: walking when near, running when left behind.
  const bx = me.x - Math.sin(me.heading ?? 0) * MISSION.escort.follow, bz = me.z - Math.cos(me.heading ?? 0) * MISSION.escort.follow;
  const gap = Math.hypot(bx - c.x, bz - c.z);
  c.follow = gap < .5 ? {x: c.x, z: c.z, speed: 0} : {x: bx, z: bz, speed: gap > 6 ? MISSION.escort.run : MISSION.escort.walk};
  const arrived = Math.hypot(c.x - m.dest.x, c.z - m.dest.z) <= MISSION.escort.arrive;
  m.target = {x: m.dest.x, z: m.dest.z, label: '届け先'};
  m.progress = 1 - Math.min(1, Math.hypot(c.x - m.dest.x, c.z - m.dest.z) / (m.startDistance ??= Math.hypot(c.x - m.dest.x, c.z - m.dest.z) || 1));
  if (arrived) {c.follow = null; done('complete', '依頼人を届けた');}
 }

 function startSnatch(world) {
  const {crowd, player} = world, pool = crowd?.pool ?? [];
  const ring = pool.filter(adult).map(p => [Math.hypot(p.x - player.x, p.z - player.z), p])
   .filter(([d]) => d >= MISSION.snatch.victim[0] && d <= MISSION.snatch.victim[1]).sort((a, b) => a[0] - b[0]);
  for (const [, victim] of ring) {
   const thief = pool.filter(adult).filter(p => p !== victim && Math.hypot(p.x - victim.x, p.z - victim.z) <= 12)
    .sort((a, b) => Math.hypot(a.x - victim.x, a.z - victim.z) - Math.hypot(b.x - victim.x, b.z - victim.z))[0];
   if (!thief) continue;
   const dest = destination(network, thief.x, thief.z, MISSION.snatch.dest, runs);
   if (!dest) continue;
   thief.missionRole = 'thief'; thief.flee = null; m.thief = thief; m.victim = victim;
   m.path = dest.points; m.at = 0; m.hitSeq = thief.hitSeq ?? 0;
   world.crowd.say?.(victim, 'scream', 1);
   return null;
  }
  return '近くに人がいません';
 }
 function tickSnatch(dt, world) {
  const t = m.thief, me = world.player;
  if (!t?.active) return done('failed', '見失った');
  const stopped = t.combatDead || t.struck !== undefined || (t.hitSeq ?? 0) !== m.hitSeq || (!world.driving && Math.hypot(t.x - me.x, t.z - me.z) <= MISSION.snatch.tackle);
  if (stopped) {
   t.follow = null;
   if (!t.combatDead && t.struck === undefined) {t.handsUpUntil = (world.crowd?.time ?? 0) + 8; t.handsUpSince = world.crowd?.time ?? 0;}
   m.bonus = t.combatDead ? 0 : MISSION.snatch.spare;
   return done('complete', t.combatDead ? 'バッグは取り返した' : '犯人を取り押さえ、バッグを取り返した');
  }
  if (Math.hypot(t.x - me.x, t.z - me.z) > MISSION.snatch.lose) return done('failed', '逃げられた');
  while (m.at < m.path.length - 1 && Math.hypot(m.path[m.at].x - t.x, m.path[m.at].z - t.z) < 1.5) m.at++;
  if (m.at >= m.path.length - 1 && Math.hypot(m.path.at(-1).x - t.x, m.path.at(-1).z - t.z) < 1.5) return done('failed', '逃げ切られた');
  const w = m.path[m.at];
  t.follow = {x: w.x, z: w.z, speed: MISSION.snatch.run};
  m.target = {x: t.x, z: t.z, label: 'ひったくり犯'};
 }

 const api = {
  get missions() {return MISSIONS;},
  get active() {return m?.status === 'running' ? m.id : null;},
  /** Start mission `id`. `world` as for tick. Returns the snapshot (status 'unavailable' with a reason when it cannot start). */
  start(id, world) {
   if (m?.status === 'running') api.cancel(world);
   const def = MISSIONS.find(x => x.id === id);
   if (!def) return null;
   m = {id, name: def.name, status: 'running', reason: '', elapsed: 0, progress: 0, target: null, reward: def.reward, bonus: 0, paid: false};
   let problem = null;
   if (id === 'delivery') {problem = delivery.start(world.player) ? null : 'この場所から配達ルートを作れません'; m.target = delivery.snapshot().target;}
   else if (id === 'chase') problem = startChase(world);
   else if (id === 'escape') {world.raiseWanted?.(MISSION.escape.stars); m.seen = false;}
   else if (id === 'escort') problem = startEscort(world);
   else if (id === 'snatch') problem = startSnatch(world);
   if (problem) {release(world); m.status = 'unavailable'; m.reason = problem;}
   else runs++;
   return api.snapshot();
  },
  cancel(world) {if (m?.status === 'running') {release(world); m.status = 'cancelled';}},
  /**
   * One frame. `world` {player, driving, car, traffic, crowd, wanted: {stars, cleared}, raiseWanted}.
   * Returns the reward to pay (once) when a mission completes, else 0.
   */
  tick(dt, world) {
   if (!m || m.status !== 'running') return 0;
   m.elapsed += Math.max(0, dt);
   if (world.player?.alive === false) {done('failed', '倒れた'); release(world); return 0;}
   const limit = m.id === 'delivery' ? null : MISSION[m.id]?.seconds;
   if (limit && m.elapsed >= limit) {done('failed', '時間切れ'); release(world); return 0;}
   if (m.id === 'delivery') {
    delivery.tick(dt, world.player, {driving: world.driving, alive: world.player?.alive !== false, hits: world.hits ?? 0});
    const s = delivery.snapshot();
    m.target = s.target; m.progress = s.progress; m.remaining = s.remaining; m.text = s.status === 'running' ? `${s.index}/${s.total}` : '';
    if (s.status === 'complete') {m.bonus = s.score * 5; done('complete', `配達完了 ${s.score}点`);}
    else if (s.status === 'failed') done('failed', s.reason);
   } else if (m.id === 'chase') tickChase(dt, world);
   else if (m.id === 'escape') {
    const w = world.wanted ?? {};
    if (w.stars > 0) m.seen = true;
    m.progress = w.escapeNeeded ? Math.min(1, (w.escape ?? 0) / w.escapeNeeded) : 0;
    if (m.seen && !w.stars) {if (w.cleared === 'escaped') done('complete', '逃げ切った'); else done('failed', w.cleared === 'arrested' ? '逮捕された' : '終わった');}
   } else if (m.id === 'escort') tickEscort(dt, world);
   else if (m.id === 'snatch') tickSnatch(dt, world);
   if (m.status !== 'running') {
    const pay = m.status === 'complete' && !m.paid ? m.reward + (m.bonus ?? 0) : 0;
    m.paid = true;
    release(world);
    return pay;
   }
   return 0;
  },
  snapshot() {
   if (!m) return {status: 'idle'};
   const limit = m.id === 'delivery' ? null : MISSION[m.id]?.seconds;
   return {id: m.id, name: m.name, status: m.status, reason: m.reason, target: m.status === 'running' ? m.target : null,
    progress: m.progress ?? 0, remaining: m.remaining ?? (limit ? Math.max(0, limit - m.elapsed) : 0), reward: m.reward + (m.bonus ?? 0), text: m.text ?? ''};
  }
 };
 return api;
}
