// The police helicopter (roadmap stage 3). At ☆4 and above one comes in from the edge of the map,
// holds an orbit over the player and keeps a searchlight on them; when it loses them it sweeps
// the light in a widening spiral round where they were last seen. Its eye counts for the wanted
// level's "seen": staying out of its light (under cover, or simply away from it at night) is part
// of escaping. When the level drops below ☆4 it climbs away and is gone.
//
// Pure: `createHelicopter()` holds the state and `update()` moves it; `createHelicopterMesh()`
// builds what is drawn (one merged body, two rotors, the light's cone and its spot on the ground,
// no real light -- a light would recompile every lit material, §16a).
import {AdditiveBlending,BoxGeometry,Color,ConeGeometry,CylinderGeometry,DoubleSide,Group,Mesh,
 MeshBasicMaterial,MeshStandardMaterial,SphereGeometry,CircleGeometry,Float32BufferAttribute,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const HELI = Object.freeze({
 fromStars: 4,
 enterFrom: 260,          // m out, where it appears
 altitude: 42,            // m above the ground it flies over
 orbit: 26,               // m, the circle it holds round what it watches
 speed: 22, orbitSpeed: 9,// m/s cruising in, and round the orbit
 turn: 1.2,               // rad/s
 light: 7,                // m, the radius of the searchlight's spot
 lightSpeed: 14,          // m/s the spot can slew on the ground
 daySight: 70,            // m (horizontal): in daylight the crew see without the light
 sweepGrow: 3.5,          // m/s the search spiral widens
 sweepTurn: 1.1,          // rad/s round the spiral
 leaveAfter: 320          // m away, climbing, before it is gone
});

const hash = (a, b) => {let h = Math.imul((a | 0) ^ 0x51ed270b, 0x85ebca6b) ^ Math.imul((b | 0) + 0x2a2a2a2a, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296;};

export function createHelicopter() {
 const s = {active: false, leaving: false, x: 0, y: 0, z: 0, heading: 0, speed: 0, angle: 0,
  light: {x: 0, z: 0, y: 0}, sees: false, sweep: 0, visits: 0, rotor: 0};
 const approach = (tx, tz, speed, dt) => {
  const want = Math.atan2(tx - s.x, tz - s.z), turn = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
  s.heading += Math.max(-HELI.turn * dt, Math.min(HELI.turn * dt, turn));
  s.speed += Math.max(-6 * dt, Math.min(4 * dt, speed - s.speed));
  s.x += Math.sin(s.heading) * s.speed * dt; s.z += Math.cos(s.heading) * s.speed * dt;
 };
 return {
  state: s,
  /**
   * One frame. `stars` the wanted level; `me` the player {x, z, y}; `seen` whether the police on
   * the ground can see them now; `lastSeen` {x, z} where they were last seen; `night` whether the
   * searchlight is what the crew see by; `ground(x, z)` the height below; `covered(x, z)` whether
   * a point is under a roof or deep in a building's shadow (optional). Returns the state.
   */
  update(dt, {stars = 0, me = {x: 0, z: 0}, seen = false, lastSeen = null, night = false, ground = () => 0, covered = () => false} = {}) {
   s.rotor += dt;
   const want = stars >= HELI.fromStars;
   if (!s.active && want) {
    s.visits++;
    const a = hash(s.visits, 3) * Math.PI * 2;
    Object.assign(s, {active: true, leaving: false, x: me.x + Math.sin(a) * HELI.enterFrom, z: me.z + Math.cos(a) * HELI.enterFrom,
     heading: a + Math.PI, speed: HELI.speed, angle: a, sweep: 0});
    s.light.x = me.x; s.light.z = me.z;
   }
   if (!s.active) {s.sees = false; return s;}
   if (!want) s.leaving = true;
   const base = ground(s.x, s.z) || 0;
   if (s.leaving) {
    // Out, climbing, away from the player; gone once far enough.
    approach(s.x + (s.x - me.x), s.z + (s.z - me.z), HELI.speed, dt);
    s.y += (base + HELI.altitude + 30 - s.y) * Math.min(1, dt * .4);
    s.sees = false;
    if (Math.hypot(s.x - me.x, s.z - me.z) > HELI.leaveAfter) s.active = false;
    return s;
   }
   // What it watches: the player while anyone can see them, otherwise where they were.
   const focus = seen || s.sees ? me : lastSeen ?? me;
   const d = Math.hypot(s.x - focus.x, s.z - focus.z);
   if (d > HELI.orbit * 1.6) approach(focus.x, focus.z, HELI.speed, dt);
   else {
    // The orbit: round the focus, nose along the circle.
    s.angle += HELI.orbitSpeed / HELI.orbit * dt;
    approach(focus.x + Math.sin(s.angle) * HELI.orbit, focus.z + Math.cos(s.angle) * HELI.orbit, HELI.orbitSpeed + 3, dt);
   }
   s.y += (base + HELI.altitude - s.y) * Math.min(1, dt * .8);
   // The light: on the player if they are in it, otherwise sweeping the spiral round the focus.
   let tx, tz;
   if (seen || s.sees) {tx = me.x; tz = me.z; s.sweep = 0;}
   else {
    s.sweep += dt;
    const r = Math.min(60, HELI.sweepGrow * s.sweep), a = HELI.sweepTurn * s.sweep;
    tx = focus.x + Math.sin(a) * r; tz = focus.z + Math.cos(a) * r;
   }
   const ld = Math.hypot(tx - s.light.x, tz - s.light.z), step = Math.min(ld, HELI.lightSpeed * dt);
   if (ld > 1e-6) {s.light.x += (tx - s.light.x) / ld * step; s.light.z += (tz - s.light.z) / ld * step;}
   s.light.y = ground(s.light.x, s.light.z) || 0;
   // Does the crew see the player: in the light's spot (and not under cover), or, by day, near.
   const inLight = Math.hypot(me.x - s.light.x, me.z - s.light.z) <= HELI.light;
   const byDay = !night && Math.hypot(me.x - s.x, me.z - s.z) <= HELI.daySight;
   s.sees = (inLight || byDay) && !covered(me.x, me.z);
   return s;
  },
  reset() {s.active = false; s.leaving = false; s.sees = false; s.speed = 0;}
 };
}

/** The helicopter as drawn: a white-and-navy body, two rotors, and the searchlight. */
export function createHelicopterMesh() {
 const group = new Group(); group.name = 'police-helicopter'; group.visible = false;
 const paint = (g, colour) => {
  const out = g.index ? g.toNonIndexed() : g, c = new Color(colour), n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  for (let i = 0; i < n; i++) {a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;}
  out.setAttribute('color', new Float32BufferAttribute(a, 3));
  return out;
 };
 const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;};
 const body = mergeGeometries([
  paint(at(new SphereGeometry(1.25, 14, 10).scale(1, .95, 1.9), 0, 0, 0), 0xf2f4f6),        // cabin
  paint(at(new SphereGeometry(1.0, 12, 8).scale(1.02, .45, 1.6), 0, -.55, .2), 0x1d2e5c),   // navy belly stripe
  paint(at(new CylinderGeometry(.22, .38, 5.2, 8), 0, .25, -3.9, Math.PI / 2), 0xf2f4f6),   // tail boom
  paint(at(new BoxGeometry(.12, 1.3, .9), 0, .75, -6.3), 0x1d2e5c),                         // fin
  paint(at(new BoxGeometry(.12, .12, 2.9), -.75, -1.45, .2), 0x2a2d33),                     // skids
  paint(at(new BoxGeometry(.12, .12, 2.9), .75, -1.45, .2), 0x2a2d33),
  paint(at(new BoxGeometry(.08, .55, .08), -.75, -1.15, .9), 0x2a2d33),
  paint(at(new BoxGeometry(.08, .55, .08), .75, -1.15, .9), 0x2a2d33),
  paint(at(new BoxGeometry(.08, .55, .08), -.75, -1.15, -.5), 0x2a2d33),
  paint(at(new BoxGeometry(.08, .55, .08), .75, -1.15, -.5), 0x2a2d33),
  paint(at(new CylinderGeometry(.18, .18, .5, 8), 0, 1.25, 0), 0x2a2d33),                   // mast
  paint(at(new SphereGeometry(.7, 10, 8).scale(1, .6, 1), 0, -.1, 1.55), 0x1a232e)          // windscreen
 ]);
 const material = new MeshStandardMaterial({name: 'helicopter', vertexColors: true, metalness: .3, roughness: .45});
 const hull = new Mesh(body, material); hull.castShadow = true; group.add(hull);
 const rotorMat = new MeshStandardMaterial({color: 0x202226, metalness: .2, roughness: .6, transparent: true, opacity: .85});
 const main = new Mesh(mergeGeometries([new BoxGeometry(11, .05, .32), new BoxGeometry(.32, .05, 11)]), rotorMat);
 main.position.set(0, 1.55, 0); group.add(main);
 const tail = new Mesh(new BoxGeometry(.05, 1.7, .16), rotorMat); tail.position.set(.18, .75, -6.3); group.add(tail);
 // The searchlight: a faint cone from the belly to the ground, and a bright spot where it lands.
 const beamMat = new MeshBasicMaterial({color: 0xfff2d0, transparent: true, opacity: .1, depthWrite: false, blending: AdditiveBlending, side: DoubleSide});
 const beam = new Mesh(new ConeGeometry(1, 1, 20, 1, true).translate(0, -.5, 0), beamMat);
 beam.name = 'searchlight-beam'; beam.frustumCulled = false;
 const spotMat = new MeshBasicMaterial({color: 0xfff2d0, transparent: true, opacity: .35, depthWrite: false, blending: AdditiveBlending,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
 const spot = new Mesh(new CircleGeometry(1, 28).rotateX(-Math.PI / 2), spotMat);
 spot.name = 'searchlight-spot'; spot.frustumCulled = false;
 const scene = new Group(); scene.add(group, beam, spot);
 const down = new Vector3(0, -1, 0), dir = new Vector3();
 beam.visible = spot.visible = false;
 return {
  root: scene, hull: group, beam, spot,
  /** Place it from the state; `night` makes the light carry (by day it is barely there). */
  update(s, {night = false} = {}) {
   group.visible = beam.visible = spot.visible = !!s.active;
   if (!s.active) return;
   group.position.set(s.x, s.y, s.z);
   group.rotation.set(Math.min(.25, s.speed * .012), s.heading, 0, 'YXZ');
   main.rotation.y = s.rotor * 38; tail.rotation.x = s.rotor * 60;
   const from = {x: s.x, y: s.y - 1.2, z: s.z}, to = s.light;
   const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz) || 1;
   beam.position.set(from.x, from.y, from.z);
   beam.scale.set(HELI.light, len, HELI.light);
   // The cone points down its -Y; turn -Y onto the beam's direction.
   beam.quaternion.setFromUnitVectors(down, dir.set(dx / len, dy / len, dz / len));
   spot.position.set(to.x, to.y + .03, to.z); spot.scale.setScalar(HELI.light);
   beamMat.opacity = s.leaving ? 0 : night ? .12 : .012; spotMat.opacity = s.leaving ? 0 : night ? .45 : .05;
  },
  dispose() {scene.removeFromParent(); body.dispose(); material.dispose(); main.geometry.dispose(); tail.geometry.dispose(); rotorMat.dispose();
   beam.geometry.dispose(); beamMat.dispose(); spot.geometry.dispose(); spotMat.dispose();}
 };
}

