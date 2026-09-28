// The weapons point the right way through every change of gait (owner report after stage 6: the
// katana's blade swung back behind the body as the player set off).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';

globalThis.ProgressEvent ??= class {constructor(type, init = {}) {Object.assign(this, {type}, init);}};
const bytes = readFileSync('public/data/character/citizen.glb'), report = JSON.parse(readFileSync('public/data/character/citizen.json', 'utf8'));
const load = async () => humanoidCitizen(await new Promise((res, rej) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej)), report);
// Stand, walk, stop, creep, run, stop: every start and stop a touch stick makes.
const PROFILE = [...Array(30).fill(0), ...Array(60).fill(1.4), ...Array(40).fill(0), ...Array(60).fill(.6), ...Array(30).fill(0), ...Array(40).fill(4), ...Array(30).fill(0)];

test('the katana stays in the guard, blade forward and up, through every start and stop and after a cut', async () => {
 const asset = await load(), f = createPlayerFigure(asset, {}, {weapons: ['pistol', 'katana', 'smg']});
 const s = {x: 0, y: 0, z: 0, heading: 0, speed: 0, alive: true, attackTime: 0, weapon: 'katana'};
 const tip = new Vector3(), hand = new Vector3();
 const blade = () => {f.root.updateMatrixWorld(true); f.weapons.tip(tip); f.root.getObjectByName('hand_r').getWorldPosition(hand); return tip.clone().sub(hand).normalize();};
 let worst = 1, at = -1;
 const check = (i, label) => {const d = blade(); if (d.z < worst) {worst = d.z; at = label ?? i;} return d;};
 PROFILE.forEach((v, i) => {s.speed = v; s.z += v / 30; f.update(s, 1 / 30); check(i);});
 assert.ok(worst > .3, `the blade pointed back (forward ${worst.toFixed(2)}) at frame ${at}`);
 // A cut, then back to the guard, walking off at once.
 s.attackName = 'SwordAttack'; s.attackDuration = .9; s.attackHeading = 0;
 for (let t = .9; t > 0; t -= 1 / 30) {s.attackTime = t; f.update(s, 1 / 30);}
 s.attackTime = 0; worst = 1;
 for (let i = 0; i < 30; i++) {s.speed = 1.4; s.z += 1.4 / 30; f.update(s, 1 / 30); if (i > 6) check(i, 'after the cut ' + i);}
 assert.ok(worst > .3, `after a cut the blade pointed back (forward ${worst.toFixed(2)}) at ${at}`);
});

test('the pistol and the submachine gun never point back at the player through the same starts and stops', async () => {
 const asset = await load();
 for (const w of ['pistol', 'smg']) {
  const f = createPlayerFigure(asset, {}, {weapons: ['pistol', 'katana', 'smg']});
  const s = {x: 0, y: 0, z: 0, heading: 0, speed: 0, alive: true, attackTime: 0, weapon: w}, p = new Vector3(), d = new Vector3();
  let worst = 1;
  PROFILE.forEach(v => {s.speed = v; s.z += v / 30; f.update(s, 1 / 30); f.root.updateMatrixWorld(true); if (f.weapons.muzzle(p, d)) worst = Math.min(worst, d.z);});
  assert.ok(worst > 0, `${w}: the muzzle pointed back (${worst.toFixed(2)})`);
 }
});

test('the katana guard holds both elbows down and out, both hands on the handle (owner report: the right elbow was up and turned in)', async () => {
 const asset = await load();
 for (const speed of [0, 1.4, 3.5]) {
  const f = createPlayerFigure(asset, {}, {weapons: ['pistol', 'katana', 'smg']});
  const s = {x: 0, y: 0, z: 0, heading: 0, speed, alive: true, attackTime: 0, weapon: 'katana'};
  for (let i = 0; i < 60; i++) {s.z += speed / 30; f.update(s, 1 / 30);}
  f.root.updateMatrixWorld(true);
  const at = n => f.root.getObjectByName(n).getWorldPosition(new Vector3());
  for (const [side, out] of [['r', -1], ['l', 1]]) {
   const sh = at('upperarm_' + side), el = at('lowerarm_' + side), wr = at('hand_' + side);
   const axis = wr.clone().sub(sh).normalize(), off = el.clone().sub(sh); off.addScaledVector(axis, -off.dot(axis)); off.normalize();
   assert.ok(el.y < sh.y, `${side} elbow below the shoulder at ${speed} m/s`);
   assert.ok(off.y < -.5, `${side} elbow points down at ${speed} m/s: ${off.y.toFixed(2)}`);
   assert.ok(off.x * out > 0, `${side} elbow out, not across the body, at ${speed} m/s`);
  }
  const grip = new Vector3(); f.weapons.grip(grip);
  assert.ok(at('hand_l').distanceTo(grip) < .22, 'the left hand on the handle');
 }
});
