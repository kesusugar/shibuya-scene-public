// The aftermath (roadmap stage 4): when the police are not chasing anyone, the dead are collected.
// An ambulance and a patrol car come up the nearest lane with their lamps flashing, stop by the
// bodies, stay while the crew work, and leave; the bodies go with them and the blood is washed.
//
// Bodies used to vanish 14 s after they fell (simulation FALL_SECONDS). A body killed in a fight
// or by a weapon now stays down until it is collected, or for `keep` seconds at most.
//
// Vehicles come from the traffic pool (like the police units) and are moved here along one lane's
// path, not by the traffic simulation: `controlled`, from `approach` metres up the lane to the stop.

import {pose} from '../traffic/path.mjs';

export const AFTERMATH = Object.freeze({
 wait: 18,                // s after the newest death before anyone is sent (and only at ☆0)
 cluster: 25,             // m: bodies this close are one scene
 reach: 35,               // m from the scene to the lane point the ambulance stops at
 approach: 70,            // m up the lane it starts from
 speed: 9, accel: 3,      // m/s, m/s²
 gap: 7.5,                // m the patrol car stops behind the ambulance
 work: 14,                // s stopped before the bodies are taken
 keep: 180                // s a body lies at most, collected or not
});

/** The lane point nearest (x, z) usable by the service vehicles, from pre-sampled lane points. */
export function nearestLanePoint(samples, x, z, reach = AFTERMATH.reach) {
 let best = null, bd = reach;
 for (const s of samples) {const d = Math.hypot(s.x - x, s.z - z); if (d < bd) {bd = d; best = s;}}
 return best;
}

export function createAftermath() {
 let samples = null, sampledGraph = null, job = null;
 const stats = {dispatched: 0, collected: 0, washed: 0};
 const sample = graph => {
  const out = [], p = {};
  for (const lane of graph?.lanes ?? []) {
   if (!lane.allowed?.includes('police')) continue;
   for (let d = 0; d < lane.path.length; d += 5) {pose(lane.path, d, p); out.push({lane: lane.id, d, x: p.x, z: p.z});}
  }
  return out;
 };
 const bodies = crowd => (crowd?.pool ?? []).filter(p => p.active && p.combatDead && p.struck !== undefined && !p.collected);
 const place = (v, lane, d) => {const p = pose(lane.path, Math.max(0, Math.min(lane.path.length, d)), {}); v.x = p.x; v.z = p.z; v.heading = p.heading; v.progress = d;};
 const take = (traffic, type, lane, d) => {
  const slot = traffic.pool.find(v => !v.active); if (!slot) return null;
  Object.assign(slot, {active: true, wear: null, kept: false, parked: false, controlled: true, service: true, platoon: undefined, type, speed: 0,
   brake: false, blinker: 0, lane: lane.id, transition: -1, next: -1, age: 0, stuck: 0, junction: null, siren: true, pursuit: undefined});
  slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
  place(slot, lane, d);
  return slot;
 };
 const drive = (v, lane, goal, dt) => {
  const left = goal - v.progress;
  const want = left <= 0 ? 0 : Math.min(AFTERMATH.speed, Math.sqrt(2 * AFTERMATH.accel * Math.max(0, left - .5)));
  v.speed += Math.max(-AFTERMATH.accel * 2 * dt, Math.min(AFTERMATH.accel * dt, want - v.speed));
  v.brake = v.speed > want + .2;
  place(v, lane, v.progress + Math.max(0, v.speed) * dt);
  return left <= .6 && v.speed < .3;
 };
 return {
  get job() {return job ? {phase: job.phase, x: job.x, z: job.z, bodies: job.bodies.length} : null;},
  get stats() {return {...stats};},
  /**
   * One frame. `traffic` the traffic simulation (graph and pool); `crowd` the pedestrians; `stars`
   * the wanted level; `marks` the impact marks (for washing the blood). Returns the job's phase.
   */
  update(dt, {traffic = null, crowd = null, stars = 0, marks = null} = {}) {
   if (!traffic?.graph || !crowd) return null;
   if (sampledGraph !== traffic.graph) {samples = sample(traffic.graph); sampledGraph = traffic.graph;}
   const time = crowd.time ?? 0;
   // Bodies nobody collected go in the end anyway.
   for (const p of bodies(crowd)) if ((p.struck ?? 0) > AFTERMATH.keep) {p.collected = true;}
   if (!job) {
    if (stars > 0) return null;
    const down = bodies(crowd);
    if (!down.length || down.some(p => (p.struck ?? 0) < AFTERMATH.wait)) return null;
    // The scene: the oldest body a vehicle can reach, and everyone down near it. A body nowhere
    // near a lane is taken off-screen (it simply goes).
    let scene = null, stop = null, x = 0, z = 0;
    for (const first of [...down].sort((a, b) => b.struck - a.struck || a.id - b.id)) {
     if (first.collected) continue;
     const near = down.filter(p => !p.collected && Math.hypot(p.x - first.x, p.z - first.z) <= AFTERMATH.cluster);
     x = near.reduce((s, p) => s + p.x, 0) / near.length; z = near.reduce((s, p) => s + p.z, 0) / near.length;
     stop = nearestLanePoint(samples, x, z);
     if (stop) {scene = near; break;}
     for (const p of near) p.collected = true;
    }
    if (!scene) return null;
    const lane = traffic.graph.lanes[stop.lane];
    const start = Math.max(0, stop.d - AFTERMATH.approach);
    const ambulance = take(traffic, 'ambulance', lane, start);
    const patrol = ambulance ? take(traffic, 'police', lane, Math.max(0, start - AFTERMATH.gap)) : null;
    if (!ambulance) return null;
    job = {phase: 'coming', x, z, lane, stop: stop.d, ambulance, patrol, bodies: scene, since: time};
    stats.dispatched++;
   }
   const {lane, ambulance, patrol} = job;
   if (job.phase === 'coming') {
    const a = drive(ambulance, lane, job.stop, dt);
    if (patrol) drive(patrol, lane, job.stop - AFTERMATH.gap, dt);
    if (a) {job.phase = 'working'; job.since = time;}
   } else if (job.phase === 'working') {
    if (time - job.since >= AFTERMATH.work) {
     for (const p of job.bodies) if (p.active) {p.collected = true; stats.collected++;}
     if (marks?.clearNear) stats.washed += marks.clearNear(job.x, job.z, AFTERMATH.cluster);
     job.phase = 'leaving';
    }
   } else if (job.phase === 'leaving') {
    const end = lane.path.length;
    const a = drive(ambulance, lane, end, dt);
    if (patrol) drive(patrol, lane, end, dt);
    if (a || ambulance.progress >= end - .5) {
     for (const v of [ambulance, patrol]) if (v?.active) {v.siren = false; traffic.despawn?.(v, 'service'); if (v.active) v.active = false;}
     job = null;
     return 'done';
    }
   }
   return job?.phase ?? null;
  },
  reset(traffic) {
   if (job) for (const v of [job.ambulance, job.patrol]) if (v?.active) {traffic?.despawn?.(v, 'service'); v.active = false;}
   job = null;
  }
 };
}
