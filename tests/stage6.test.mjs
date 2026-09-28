// Roadmap stage 6: dents and broken glass, the motorbike, the car radio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WEAR, createWear, crash, shot, personStrike, deform, paneFacing, wearLevel, createDamageVisual} from '../src/player/car-damage.mjs';
import {createVehicleAsset, createMotorbikeAsset} from '../src/player/vehicle-asset.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {BIKE, bikeLean, buildMotorbikeShape, motorbikeFleetGeometry} from '../src/traffic/motorbike-shape.mjs';
import {fleetGeometry, FLEET_PARTS} from '../src/traffic/fleet.mjs';
import {anchorsFor} from '../src/traffic/vehicle-anchors.mjs';
import {CAR} from '../src/player/vehicle.mjs';
import {BODY} from '../src/player/body-states.mjs';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure, characterAction} from '../src/player/figure.mjs';
import {STATIONS, FORM, SONG_BARS, JINGLE_BARS, songEvents, jingleEvents, programmeAt, programmeLength, sectionAt, chord} from '../src/audio/radio-music.mjs';
import {createRadio, barEvents, stationFor, INSTRUMENTS} from '../src/audio/radio.mjs';
import {createInputMap, BUTTON} from '../src/player/input-map.mjs';

const sedan = VEHICLES.sedan, car = {x: 10, z: -4, heading: .6, y: 0};

test('a crash dents the car where it hit, pushed in; a hard one cracks or takes out the pane on that side', () => {
 const w = createWear();
 assert.equal(crash(w, car, sedan, {nx: 0, nz: 1}, .5), null, 'a touch is nothing');
 // Head on into a wall: the contact normal points back into the car, against its heading.
 const n = {nx: -Math.sin(car.heading), nz: -Math.cos(car.heading)};
 const soft = crash(w, car, sedan, n, 5);
 assert.ok(Math.abs(soft.dent.z - sedan.length / 2) < 1e-6 && Math.abs(soft.dent.x) < 1e-6, 'on the nose');
 assert.ok(soft.dent.dz < 0, 'pushed back into the car');
 assert.equal(soft.glass, null); assert.equal(soft.pane, 'front');
 assert.equal(crash(w, car, sedan, n, 8).glass, 'crack');
 assert.equal(w.dents.length, 1, 'the same spot deepens rather than adding a dent');
 assert.ok(w.dents[0].depth > 5 * WEAR.depthPerSpeed && w.dents[0].depth <= WEAR.maxDepth);
 assert.equal(crash(w, car, sedan, n, 14).glass, 'shatter');
 assert.equal(w.panes.front, 2);
 // From the side: the side window.
 const side = {nx: -Math.cos(car.heading), nz: Math.sin(car.heading)};   // pushing toward -x local
 const r = crash(w, car, sedan, side, 9);
 assert.equal(r.pane, 'left'); assert.equal(r.glass, 'crack');
 for (let i = 0; i < 60; i++) crash(w, car, sedan, {nx: Math.cos(i), nz: Math.sin(i)}, 3 + i % 5);
 assert.ok(w.dents.length <= WEAR.maxDents);
 assert.ok(wearLevel(w) > .3);
});

test('a round above the beltline cracks a pane, the next takes it out; below it leaves a small dent', () => {
 const w = createWear(), c = {x: 0, z: 0, heading: 0, y: 0};
 const into = {x: 1, y: 0, z: 0};                           // from the -x side, travelling +x
 const g1 = shot(w, c, sedan, {x: -sedan.width / 2, y: 1.2, z: 0}, into);
 assert.deepEqual([g1.kind, g1.pane, g1.glass], ['glass', 'right', 'crack'], 'the -x side is the right (the driver\'s)');
 assert.equal(shot(w, c, sedan, {x: -sedan.width / 2, y: 1.2, z: .3}, into).glass, 'shatter');
 assert.equal(shot(w, c, sedan, {x: -sedan.width / 2, y: 1.2, z: .3}, into).glass, null, 'nothing left to break');
 const d = shot(w, c, sedan, {x: -sedan.width / 2, y: .5, z: 0}, into);
 assert.equal(d.kind, 'dent'); assert.equal(w.dents.length, 1); assert.ok(w.dents[0].depth < .05);
 assert.equal(paneFacing(0, -1, sedan), 'rear');
 assert.equal(personStrike(createWear(), 5), null);
 const pw = createWear(); assert.equal(personStrike(pw, WEAR.personShatter + 1), 'shatter'); assert.equal(pw.panes.front, 2);
});

test('the deform pushes vertices in round a dent and leaves the rest alone', () => {
 const base = new Float32Array([0, .6, 2.3, 0, .6, 0, .3, .6, 2.3]), out = new Float32Array(9);
 deform(base, out, [{x: 0, y: .6, z: 2.3, dx: 0, dy: 0, dz: -1, depth: .1, r: .6}]);
 assert.ok(out[2] < 2.3 - .05, 'the centre goes in');
 assert.deepEqual([...out.slice(3, 6)], [...base.slice(3, 6)], 'far away is untouched');
 assert.ok(out[8] < 2.3 && out[8] > out[2], 'falls off with distance');
});

test('the close-range model shows it: paint dented, a cracked pane textured, a broken one gone, a repair clean', () => {
 const asset = createVehicleAsset('sedan'), dmg = createDamageVisual();
 dmg.attach(asset);
 const info = dmg.inspect();
 assert.ok(info.paintMeshes >= 1 && info.glassTriangles > 100);
 for (const [, n] of info.panes) assert.ok(n > 10, 'every pane has glass');
 const paint = asset.root.getObjectByName('vehicle-paint'), glass = asset.root.getObjectByName('vehicle-glass');
 const cracked = asset.root.getObjectByName('vehicle-glass-cracked');
 assert.ok(cracked, 'a cracked-glass mesh');
 const before = paint.geometry.attributes.position.array.slice();
 const w = createWear(), c = {x: 0, z: 0, heading: 0};
 crash(w, c, sedan, {nx: 0, nz: -1}, 14);              // the nose: front pane shattered
 crash(w, c, sedan, {nx: 1, nz: 0}, 8);                // struck on the -x flank: the right pane cracked
 const gone = dmg.apply(w);
 assert.deepEqual(gone.map(s => s.pane), ['front']);
 const after = paint.geometry.attributes.position.array;
 let moved = 0, most = 0;
 for (let i = 0; i < after.length; i++) {const d = Math.abs(after[i] - before[i]); if (d > 1e-4) moved++; most = Math.max(most, d);}
 assert.ok(moved > 30 && most > .05, `dented: ${moved} values, ${most.toFixed(3)} m`);
 const live = a => {let n = 0; for (let i = 0; i < a.length; i += 9) if (a[i] || a[i + 1] || a[i + 2] || a[i + 4] || a[i + 7]) n++; return n;};
 const intact = live(glass.geometry.attributes.position.array), crackedTris = live(cracked.geometry.attributes.position.array);
 const count = Object.fromEntries(info.panes);
 assert.equal(intact, info.glassTriangles - count.front - count.right, 'front and right no longer plain glass');
 assert.equal(crackedTris, count.right, 'the right drawn cracked');
 assert.deepEqual(dmg.apply(w), [], 'nothing new');
 dmg.apply(null);                                       // repaired
 assert.equal(live(glass.geometry.attributes.position.array), info.glassTriangles);
 assert.ok(paint.geometry.attributes.position.array.every((v, i) => Math.abs(v - before[i]) < 1e-6));
 dmg.dispose(); asset.dispose();
});

test('the motorbike: a two-wheeled, hand-driven type with its own model, fleet parts, anchors and lean', () => {
 const d = VEHICLES.motorbike;
 assert.ok(d.twoWheel && d.handDriven && d.weight === 0);
 assert.ok(d.speed > Math.max(...Object.values(VEHICLES).filter(v => !v.twoWheel).map(v => v.speed)), 'faster than any car');
 assert.ok(CAR.throwOff > 3);
 const g = fleetGeometry('motorbike');
 for (const part of FLEET_PARTS) assert.ok(g[part]?.attributes.position.count > 0 && g[part].attributes.position.array.every(Number.isFinite), part);
 const shape = buildMotorbikeShape();
 assert.ok(Math.abs(shape.anchors.frontWheel[2] - shape.anchors.rearWheel[2] - BIKE.wheelbase) < 1e-9);
 const a = anchorsFor('motorbike');
 assert.deepEqual(a.seat, shape.anchors.driverSeat);
 const asset = createMotorbikeAsset();
 assert.ok(asset.twoWheel && asset.wheels.front && asset.wheels.rear && asset.lean);
 asset.root.updateMatrixWorld(true);
 const lowest = new Vector3(); let min = Infinity;
 asset.root.traverse(o => {if (!o.isMesh) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); min = Math.min(min, b.min.y);});
 assert.ok(min > -.02 && min < .03, `on its tyres: ${min}`); void lowest;
 asset.dispose();
 // Leaning into a turn: the faster and tighter, the further, never past the cap.
 assert.equal(bikeLean(0, 1), -0);
 assert.ok(bikeLean(10, .3) < 0 && bikeLean(10, -.3) > 0);
 assert.ok(Math.abs(bikeLean(10, .3)) < Math.abs(bikeLean(15, .3)));
 assert.ok(Math.abs(bikeLean(40, 2)) <= BIKE.lean + 1e-9);
});

globalThis.ProgressEvent ??= class {constructor(type, init = {}) {Object.assign(this, {type}, init);}};
test('the rider sits the bike: the Drive pose, hands on the grips, feet on the pegs', async () => {
 const bytes = readFileSync('public/data/character/citizen.glb'), report = JSON.parse(readFileSync('public/data/character/citizen.json', 'utf8'));
 const asset = humanoidCitizen(await new Promise((res, rej) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej)), report);
 assert.equal(characterAction({riding: true, alive: true}), 'Drive');
 const f = createPlayerFigure(asset), s = {x: 0, y: BODY.ride.root[1], z: BODY.ride.root[2], heading: 0, speed: 0, alive: true, attackTime: 0, riding: true, riderLean: 0};
 for (let i = 0; i < 10; i++) f.update(s, 1 / 30);
 f.root.updateMatrixWorld(true);
 const at = n => f.root.getObjectByName(n).getWorldPosition(new Vector3());
 // In the bike's frame (+x is the rider's left, as in the body frame): the grips and the pegs.
 const grip = side => new Vector3(side * .31, BIKE.bars[1], BIKE.bars[2]);
 for (const [hand, side] of [['hand_l', 1], ['hand_r', -1]]) {
  const d = at(hand).distanceTo(grip(side));   // the wrist: the palm, on the grip, is .08 m on
  assert.ok(d < .14, `${hand} ${d.toFixed(3)} m from its grip`);
 }
 for (const [foot, side] of [['foot_l', 1], ['foot_r', -1]]) {
  const p = at(foot), peg = new Vector3(side * BIKE.pegs[0], BIKE.pegs[1], BIKE.pegs[2]);
  assert.ok(p.distanceTo(peg) < .15, `${foot} ${p.distanceTo(peg).toFixed(3)} m from its peg`);
 }
 const pelvis = at('pelvis');
 assert.ok(Math.abs(pelvis.y - (BIKE.seat[1] + .08)) < .06 && Math.abs(pelvis.z - BIKE.seat[2]) < .08, `on the seat: ${pelvis.toArray().map(v => v.toFixed(2))}`);
 // Leaning with the bike.
 s.riderLean = -.5; f.update(s, 1 / 30); assert.ok(Math.abs(f.root.rotation.z + .5) < 1e-9);
 f.dispose?.();
});

test('the radio: six stations of original songs in their styles, each the same every time it plays', () => {
 assert.equal(STATIONS.length, 6);
 assert.deepEqual(STATIONS.map(s => s.style), ['citypop', 'boombap', 'house', 'synthwave', 'rock', 'trap']);
 const titles = STATIONS.flatMap(s => s.songs.map(x => x.title));
 assert.equal(new Set(titles).size, titles.length, 'no title twice');
 assert.equal(SONG_BARS, FORM.reduce((n, [, b]) => n + b, 0));
 assert.deepEqual(sectionAt(0), {section: 'intro', index: 0}); assert.equal(sectionAt(12).section, 'chorus');
 assert.deepEqual(chord(60, 1, [0, 2, 4, 5, 7, 9, 11], true), [60, 64, 67, 71]);
 for (const s of STATIONS) for (const song of s.songs) {
  for (let bar = 0; bar < SONG_BARS; bar++) {
   const e = songEvents(s.style, song, bar);
   assert.deepEqual(e, songEvents(s.style, song, bar), 'deterministic');
   assert.ok(e.length > 0 && e.length < 140, `${s.id} bar ${bar}: ${e.length}`);
   for (const n of e) {
    assert.ok(INSTRUMENTS.includes(n.inst), n.inst);
    assert.ok(n.at >= 0 && n.at < 4 && n.len > 0 && n.vel > 0 && n.vel <= 1, JSON.stringify(n));
    if (n.note) assert.ok(n.note >= 20 && n.note <= 100, `${s.id} ${n.inst} ${n.note}`);
   }
  }
 }
 const chorus = st => songEvents(st.style, st.songs[0], 13);
 const at = (e, inst) => e.filter(n => n.inst === inst).map(n => n.at);
 assert.deepEqual(at(chorus(STATIONS[2]), 'kick'), [0, 1, 2, 3], 'house: four to the floor');
 assert.deepEqual(at(chorus(STATIONS[5]), 'clap'), [2], 'trap: half time, the clap on three');
 assert.deepEqual(at(chorus(STATIONS[0]), 'snare'), [1, 3], 'city pop: backbeat');
 const rock = chorus(STATIONS[4]).filter(n => n.inst === 'guitar' && n.at === 0).map(n => n.note);
 assert.equal(rock[1] - rock[0], 7, 'rock: power chords');
 // Swing: the hip-hop station's off-sixteenths are late.
 const hh = STATIONS[1], p = programmeAt(hh, 0);
 const straight = songEvents(hh.style, hh.songs[p.song], p.bar), swung = barEvents(hh, p);
 const off = straight.findIndex(n => Math.round(n.at * 4) % 2 === 1);
 if (off >= 0) assert.ok(swung[off].at > straight[off].at);
 assert.ok(jingleEvents(STATIONS[0], 0).some(n => n.inst === 'riser'));
});

test('a station is live: it runs its songs and a jingle after each on its own clock', () => {
 const s = STATIONS[3], len = programmeLength(s);
 const first = programmeAt(s, 0), later = programmeAt(s, 240 / s.songs[0].bpm * 5 + .01);
 assert.deepEqual([first.song, first.jingle, first.bar], [0, false, 0]);
 assert.equal(later.bar, 5);
 const jingle = programmeAt(s, SONG_BARS * 240 / s.songs[0].bpm + .01);
 assert.ok(jingle.jingle && jingle.song === 0 && jingle.bar === 0);
 const next = programmeAt(s, (SONG_BARS + JINGLE_BARS) * 240 / s.songs[0].bpm + .01);
 assert.deepEqual([next.song, next.jingle, next.bar], [1, false, 0]);
 {const a = programmeAt(s, 17.3), b = programmeAt(s, 17.3 + len * 3);
  assert.deepEqual([b.song, b.bar, b.jingle], [a.song, a.bar, a.jingle]); assert.ok(Math.abs(b.beat - a.beat) < 1e-6 && Math.abs(b.barStart - a.barStart - len * 3) < 1e-6);}
 // Bars follow on without a gap.
 let t = 0;
 for (let i = 0; i < 300; i++) {const p = programmeAt(s, t + 1e-4); assert.ok(Math.abs(p.barStart - t) < 1e-6); t = p.barStart + p.barSeconds;}
});

test('the dial: along the stations and off, per car, patrol cars off; the pad and the key tune it', () => {
 const r = createRadio({context: () => null, clock: () => 0});
 assert.equal(r.station, -1);
 const seen = [];
 for (let i = 0; i < STATIONS.length + 1; i++) seen.push(r.step(1));
 assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, -1]);
 assert.equal(r.step(-1), 5);
 assert.equal(r.nowPlaying().station, STATIONS[5].name);
 r.tune(-1); assert.equal(r.nowPlaying(), null);
 assert.equal(r.update(1 / 30, {on: true}), false, 'no audio context: silent, no throw');
 assert.equal(stationFor({type: 'police', id: 3}), -1);
 assert.equal(stationFor({type: 'sedan', id: 3, radio: 4}), 4, 'the car remembers');
 assert.ok(stationFor({type: 'sedan', id: 9}) >= 0);
 const map = createInputMap(), buttons = Array.from({length: 18}, () => ({pressed: false, value: 0}));
 const pad = {id: 'Xbox', mapping: 'standard', axes: [0, 0, 0, 0], buttons};
 map.poll(pad, 1 / 60, 'car');
 buttons[BUTTON.dright] = {pressed: true, value: 1};
 assert.ok(map.poll(pad, 1 / 60, 'car').pressed.includes('radioNext'));
 buttons[BUTTON.dright] = {pressed: false, value: 0}; buttons[BUTTON.dleft] = {pressed: true, value: 1};
 assert.ok(map.poll(pad, 1 / 60, 'car').pressed.includes('radioPrev'));
 assert.ok(!map.poll({...pad}, 1 / 60, 'foot').pressed.includes('radioPrev'));
});
