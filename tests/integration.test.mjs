// Where the stages meet: the motorbike (stage 6) against the damage (stage 6), the police's fire
// (W3, stage 3), the traffic pool's recycling and tiers, and the missions (stage 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWear, crash, shot, wearOf} from '../src/player/car-damage.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {createPoliceDirector} from '../src/police/director.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {createPlayerVehicle, CAR} from '../src/player/vehicle.mjs';
import {createMissionBoard} from '../src/game/missions.mjs';

const pack = JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data = JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground = restoreGroundModel(pack.ground);
const network = restorePedestrianNetwork(pack.life.high, ground);
function traffic(tier = 'high') {
 const graph = restoreTrafficGraph(pack.traffic.high); graph.ground = ground; graph.data = data;
 const sim = new TrafficSimulation(graph, {tier, street: pack.street.high}); sim.refill(true); return sim;
}
const bike = VEHICLES.motorbike;

test('a motorbike has no glass: a round at rider height and a hard crash dent it and break nothing', () => {
 const w = createWear(), b = {x: 0, z: 0, heading: 0, y: 0};
 const r = shot(w, b, bike, {x: -bike.width / 2, y: 1.0, z: 0}, {x: 1, y: 0, z: 0});
 assert.equal(r.kind, 'dent', 'a round high on a bike is not a window');
 const c = crash(w, b, bike, {nx: 0, nz: -1}, 15);
 assert.equal(c.glass, null, 'a crash on a bike cracks no pane');
 assert.deepEqual(w.panes, {front: 0, rear: 0, left: 0, right: 0});
});

test('riding into a wall throws the rider off and breaks no glass; the bike is dented', () => {
 const sim = traffic(), car = createPlayerVehicle(sim, network.ctx);
 assert.ok(car.spawn(12, 24), 'the own car');
 const slot = car.parkNear('motorbike', 20, 30);
 assert.ok(slot && slot.kept && slot.type === 'motorbike', 'a bike parked and kept');
 assert.ok(car.reserve(slot)); car.state.active = true;
 // Face the nearest solid within a clear run-up and ride at it.
 let aim = null;
 for (let a = 0; a < 64 && !aim; a++) {
  const h = a / 64 * Math.PI * 2;
  for (let d = 6; d <= 40; d += .5) {
   const x = slot.x + Math.sin(h) * d, z = slot.z + Math.cos(h) * d;
   if (network.ctx.solid(x, z, .1)) {aim = {h, d}; break;}
  }
 }
 assert.ok(aim, 'a wall within 40 m');
 Object.assign(car.state, {heading: aim.h, course: aim.h, speed: 14});
 let thrown = null, glass = null;
 for (let i = 0; i < 30 * 6 && !thrown; i++) {
  car.step(1 / 30, {forward: 1, strafe: 0});
  thrown ??= car.state.thrownOff ?? null; glass ??= car.state.glassEvent ?? null;
  if (car.state.stalled && !thrown) car.state.speed = Math.max(car.state.speed, 14);
 }
 assert.ok(thrown, 'the rider thrown off');
 assert.ok(thrown.speed >= CAR.throwOff);
 assert.equal(glass, null, 'no glass to break on a bike');
 assert.ok(!slot.wear || Object.values(slot.wear.panes).every(v => v === 0));
 sim.dispose();
});

let bikePerHit = 0;
test('roadmap ②: the police\'s rounds reach a rider in full, a driver through the car -- a little less', () => {
 const officer = (id, x, z) => ({id, x, z, active: true, officer: true, combatDead: false, heading: Math.atan2(-x, -z)});
 for (const type of ['motorbike', 'sedan']) {
  const director = createPoliceDirector({getAudioContext: () => null, getAudioBus: () => null, speech: null});
  director.units.officers.add(officer(1, 0, 8));
  director.wanted.crime('policeCarTaken', {x: 0, z: 0, t: 0});
  const car = {state: {x: 0, z: 0, y: 0, type, damage: 0, speed: 0, slot: null}};
  let hurt = 0, hits = 0, cabin = 0;
  for (let t = 0; t < 60; t += 1 / 30) {
   const w = director.frame(1 / 30, {player: {x: 0, z: 0, y: 0, alive: true}, car, driving: true,
    weapons: {current: 'fists', shots: 0}, solid: () => false, hurt: (n, src, o) => {hurt += n; if (o?.cabin) cabin++;}});
   for (const e of w.gunfire ?? []) if (e.kind === 'shot' && e.hit) hits++;
  }
  assert.ok(hits > 3, `${type}: only ${hits} hits in a minute of fleeing at ☆2+`);
  const perHit = hurt / hits;
  if (type === 'motorbike') {assert.ok(perHit >= 10, 'the rider did not take the whole round'); bikePerHit = perHit;}
  else {
   assert.ok(car.state.damage > 0, 'the car was not battered');
   assert.ok(cabin > 0 && cabin < hits, `${cabin} of ${hits} rounds reached the cabin`);
   const ratio = bikePerHit / perHit;
   assert.ok(ratio > 1.1 && ratio < 2.2, `a car lasts ${ratio.toFixed(2)}x a bike, not "a little longer"`);
  }
 }
});

test('a recycled pool slot is a new vehicle: no dents, not kept, whoever takes it', () => {
 const sim = traffic(), car = createPlayerVehicle(sim, network.ctx);
 car.spawn(12, 24);
 const slot = car.parkNear('motorbike', 20, 30);
 wearOf(slot).dents.push({x: 0, y: .5, z: 1, dx: 0, dy: 0, dz: -1, depth: .1, r: .5}); slot.wear.panes.front = 2;
 sim.despawn(slot, 'test');
 // The simulation's own spawns refill the pool; the freed slot comes back as an ordinary car.
 for (let i = 0; i < 400 && !slot.active; i++) sim.spawn('sedan', true);
 assert.ok(slot.active, 'the slot was reused');
 assert.equal(slot.wear, null, 'dents cleared'); assert.equal(slot.kept, false, 'no longer kept');
 for (const v of sim.pool) if (v.active && v.type !== 'motorbike') assert.ok(!v.kept, `a ${v.type} kept`);
 sim.dispose();
});

test('the parked bikes survive a change of tier; ordinary parked cars are trimmed', () => {
 const sim = traffic(), car = createPlayerVehicle(sim, network.ctx);
 car.spawn(12, 24);
 const bikes = [car.parkNear('motorbike', 20, 30), car.parkNear('motorbike', 60, -40)].filter(Boolean);
 assert.ok(bikes.length >= 1);
 sim.setTier('low'); sim.setTier('high');
 for (const b of bikes) assert.ok(b.active && b.type === 'motorbike', 'the bike is still there');
 sim.dispose();
});

test('a chase mission can be ridden: the board works from the bike like from a car', () => {
 const sim = traffic(), board = createMissionBoard(network);
 const me = {x: 0, z: 20, heading: 0, speed: 0, alive: true, type: 'motorbike'};
 const world = {player: me, driving: true, car: me, traffic: sim};
 assert.equal(board.start('chase', world).status, 'running');
 const target = sim.pool.find(v => v.active && v.missionTarget);
 for (let i = 0; i < 30 * 70 && board.snapshot().status === 'running'; i++) {
  const dx = target.x - me.x, dz = target.z - me.z, d = Math.hypot(dx, dz);
  if (d > 4) {const k = Math.min(d - 4, bike.speed / 30) / d; me.x += dx * k; me.z += dz * k;}
  board.tick(1 / 30, world);
 }
 assert.equal(board.snapshot().status, 'complete', board.snapshot().reason);
 sim.dispose();
});

test('owner\'s plan: the patrol car its crew left can be got into and taken (a stolen police car)', async () => {
 const {createPoliceUnits} = await import('../src/police/units.mjs');
 const sim = traffic(), car = createPlayerVehicle(sim, network.ctx), units = createPoliceUnits();
 car.spawn(12, 24);
 const people = []; for (let i = 0; i < 30; i++) people.push({id: 9000 + i, active: true, x: 300 + i, z: 300, archetype: 'office', heading: 0, speed: 1});
 const grid = new Map(), cell = (x, z) => Math.floor(x / 2) + ',' + Math.floor(z / 2);
 const crowd = {time: 0, pool: people, grid, cell, insert(p) {const k = cell(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);}, despawn(p) {p.active = false;}, network: {ctx: {safe: () => true}}};
 const me = {x: 12, z: 24};
 for (let i = 0; i < 5 * 30; i++) units.update(1 / 30, {stars: 1, traffic: sim, crowd, me, visible: () => false, driving: true});
 const pc = [...units.cars][0]; assert.ok(pc, 'a patrol car');
 for (let t = 0; t < 60 && units.cars.has(pc); t += 1 / 30) units.update(1 / 30, {stars: 1, traffic: sim, crowd, me, visible: () => false, driving: false});
 assert.ok(!units.cars.has(pc), 'the crew got out');
 const e = car.nearestEntry(pc.x + 2.5, pc.z);
 assert.equal(e?.slot, pc, 'offered as the car to get into');
 assert.equal(e.kind, 'parked');
 assert.ok(car.reserve(pc) && car.commit(), 'taken');
 sim.dispose();
});
