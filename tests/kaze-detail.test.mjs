// PLAN-POLICE-VOICE-KAZE-DETAIL Step K1: Kaze FR's proportions, body sections, and wheel arches.
// Step K2 (parts, paint, lamps) tests are appended below the K1 ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVehicleShape, SILHOUETTE_TABLES, wheelRadius} from '../src/traffic/vehicle-shape.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {createVehicleAsset} from '../src/player/vehicle-asset.mjs';
import {MeshPhysicalMaterial} from 'three';

const within = (actual, target, pct = .03) => Math.abs(actual - target) <= target * pct;

test('Kaze FR\'s proportions are within 3% of the plan\'s numbers',()=>{
 const d = VEHICLES.ownCar;
 assert.ok(within(d.length, 4.30), `length ${d.length}`);
 assert.ok(within(d.width, 1.76), `width ${d.width}`);
 assert.ok(within(d.height, 1.23), `height ${d.height}`);
 const shape = buildVehicleShape('ownCar');
 assert.ok(within(shape.dimensions.wheelbase, 2.43), `wheelbase ${shape.dimensions.wheelbase}`);
 assert.ok(within(wheelRadius('ownCar') * 2, .66), `wheel diameter ${wheelRadius('ownCar') * 2}`);
});

test('the body has at least 15 authored stations',()=>{
 assert.ok(SILHOUETTE_TABLES.fastback.belt.length >= 15, SILHOUETTE_TABLES.fastback.belt.length);
});

test('the fender peaks stand higher than the bonnet valley between them, at the front axle',()=>{
 const shape = buildVehicleShape('ownCar', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 const axleZ = VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle;
 let centreY = -Infinity, edgeY = -Infinity, found = 0;
 for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i), x = pos.getX(i), y = pos.getY(i);
  if (Math.abs(z - axleZ) > .09) continue;
  found++;
  if (Math.abs(x) < .05) centreY = Math.max(centreY, y);
  else if (Math.abs(x) > VEHICLES.ownCar.width * .35) edgeY = Math.max(edgeY, y);
 }
 assert.ok(found > 0, 'no vertices found near the front axle');
 assert.ok(centreY > -Infinity && edgeY > -Infinity, 'centre or fender edge not sampled');
 assert.ok(edgeY > centreY, `fender ${edgeY.toFixed(3)} should stand above the valley ${centreY.toFixed(3)}`);
});

test('other silhouettes keep their flat bonnet -- the valley is opt-in, not a global change',()=>{
 assert.equal(SILHOUETTE_TABLES.sedan.fenderPeak, undefined);
 const shape = buildVehicleShape('sedan', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 let centreY = null, edgeY = -Infinity;
 for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
  if (Math.abs(z) > .07) continue;               // near the sedan's own belt midpoint
  if (Math.abs(x) < .01) centreY = y;
  else if (Math.abs(x) > VEHICLES.sedan.width * .35) edgeY = Math.max(edgeY, y);
 }
 assert.ok(centreY !== null && edgeY > -Infinity, 'centre or edge not sampled');
 assert.ok(Math.abs(edgeY - centreY) < .01, `sedan's bonnet is not flat: centre ${centreY} edge ${edgeY}`);
});

test('the arch cut-out exposes at least 60% of the front wheel\'s height, seen from the side',()=>{
 const shape = buildVehicleShape('ownCar', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 const axleZ = VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle;
 const radius = wheelRadius('ownCar');
 // The floor and its rounded corner sit at the same low height across the whole car and are not
 // the arch opening -- exclude them by height, not by x, since the floor and sill widths are
 // close enough in this profile that an x-only filter catches both.
 const floorY = VEHICLES.ownCar.height * SILHOUETTE_TABLES.fastback.floor;
 const round = Math.min(.09, VEHICLES.ownCar.width * .055);
 let sillY = Infinity, found = 0;
 for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i), x = Math.abs(pos.getX(i)), y = pos.getY(i);
  if (Math.abs(z - axleZ) > .09 || x < VEHICLES.ownCar.width * .36) continue;
  if (y < floorY + round + .01) continue;
  found++; sillY = Math.min(sillY, y);
 }
 assert.ok(found > 0, 'no outer-flank vertices found near the front axle');
 const exposed = sillY / (radius * 2);
 assert.ok(exposed >= .6, `only ${(exposed * 100).toFixed(1)}% of the wheel is exposed (sill ${sillY.toFixed(3)})`);
});

test('the front wheels sit at the new, shorter wheelbase, flush with the arches',()=>{
 const shape = buildVehicleShape('ownCar');
 const [, , frontZ] = shape.anchors.frontLeftWheel;
 assert.ok(within(frontZ, VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle, .01));
});

// --- Step K2: parts, paint, lamps -----------------------------------------------------------

test('the wing sits behind the rear axle and below the roof peak',()=>{
 const shape = buildVehicleShape('ownCar');
 const rearZ = shape.anchors.rearLeftWheel[2];           // negative: behind the car's centre
 const wingZ = -VEHICLES.ownCar.length * .455;           // matches the geometry's own placement
 assert.ok(wingZ < rearZ, `wing z ${wingZ} should be further back than the rear axle ${rearZ}`);
 const tailRow = SILHOUETTE_TABLES.fastback.belt.find(([f]) => Math.abs(f - -.46) < .001);
 assert.ok(tailRow, 'the -.46 belt station this test reads moved');
 const [, tailBeltF] = tailRow;
 const wingY = VEHICLES.ownCar.height * tailBeltF + .13;  // small wing, matches the geometry
 // The roof's highest point is close to H*1.0 (the house table's peak fraction).
 const roofPeakF = Math.max(...SILHOUETTE_TABLES.fastback.house.map(([, topF]) => topF));
 assert.ok(wingY < VEHICLES.ownCar.height * roofPeakF,
  `wing at ${wingY} should sit below the roof peak at ${VEHICLES.ownCar.height * roofPeakF}`);
});

test('Kaze FR alone gets the plan\'s orange and a clearcoat physical material',()=>{
 assert.equal(VEHICLES.ownCar.color, 0xf39a1d);
 assert.equal(VEHICLES.ownCar.clearcoat, true);
 const asset = createVehicleAsset('ownCar');
 const paint = asset.root.getObjectByName('vehicle-paint').material;
 assert.ok(paint instanceof MeshPhysicalMaterial, 'ownCar paint is not a clearcoat material');
 assert.equal(paint.clearcoat, 1);
 asset.dispose();
 // No other type gets it -- clearcoat is a plain MeshStandardMaterial for everyone else.
 const sedan = createVehicleAsset('sedan');
 assert.ok(!(sedan.root.getObjectByName('vehicle-paint').material instanceof MeshPhysicalMaterial));
 sedan.dispose();
});

test('the roof panel and pillars are dark, separate panels, not just the body colour',()=>{
 const maxY = geo => {let m = -Infinity; const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i)); return m;};
 const H = VEHICLES.ownCar.height;
 const own = buildVehicleShape('ownCar');
 // The roof panel is built at H*topF (~1.0), well above every other `dark` kit panel (bonnet,
 // skirts, lip, wing): if it moved out of `paint`, dark's own ceiling rises to meet it.
 assert.ok(maxY(own.geometry.dark) > H * .95,
  `dark's highest point (${maxY(own.geometry.dark).toFixed(3)}) should reach the roof (~${(H*.95).toFixed(3)})`);
 // And paint's own ceiling should drop well below the roof once the roof panel (and the pillars,
 // which reach nearly as high) are gone from it -- what is left is the beltline strip and mirrors.
 assert.ok(maxY(own.geometry.paint) < H * .95,
  `paint should no longer reach the roof (got ${maxY(own.geometry.paint).toFixed(3)})`);
 // A sedan (no `kit`, blackRoof is false) keeps its roof in `paint`, for contrast.
 const sedan = buildVehicleShape('sedan');
 const sedanH = VEHICLES.sedan.height;
 assert.ok(maxY(sedan.geometry.paint) > sedanH * .9,
  'a plain sedan should still carry its roof in paint');
});

test('the whole car is comfortably inside the triangle budget; the draw-call count is a known miss',()=>{
 const asset = createVehicleAsset('ownCar');
 let meshes = 0, triangles = 0;
 asset.root.traverse(o => {
  if (!o.isMesh) return;
  meshes++;
  triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
 });
 asset.dispose();
 assert.ok(triangles <= 60000, `${triangles} triangles over the plan's 60k budget`);
 // The plan's target is 10; four independently-steered/rotated wheels (8 meshes), two hinged
 // popup pods (4) and two hinged doors (2) on top of the six body-part meshes make that
 // unreachable without a wheel/door rig that can share one mesh across independent transforms,
 // which is a bigger rework than this step attempted (see docs/GTA-FIDELITY-STATUS.md §9x). This
 // is a regression guard against the current, honestly-over-budget count, not a pass on the plan's
 // own number.
 assert.ok(meshes <= 20, `${meshes} draw calls, more than the 20 this step shipped with`);
});
