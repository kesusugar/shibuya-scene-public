import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {prepareHero} from '../src/heroes/model.mjs';
import {BUILDERS} from '../src/heroes/builders.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {CAMERAS} from '../src/app/foundation.mjs';
import {REFERENCE_ADS, REFERENCE_VIEW, MOUNT_CATEGORY, MAX_WIDTH, MAX_RANGE, MIN_FACING,
 AD_ANCHORS, EXCLUDED_ADS, MAX_BLADE_WIDTH, PANELS, referenceBasis, adRay, intersectHosts,
 bestCameraEdge, placeAnchorGroup, visibleWallPatch, ANCHOR_SHAPES, AD_ANCHOR_FACE, resolveReferenceAds} from '../src/signs/reference-ads.mjs';
import {applyReferenceAds} from '../src/signs/reference-layer.mjs';
import {buildSignModel} from '../src/signs/model.mjs';
import {commercialLayout} from '../src/signs/commercial-layout.mjs';

const data = JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground = buildGroundModel(data), generic = buildBuildingModel(data);
const heroes = HERO_DEFINITIONS.map(d => {const h = prepareHero(data, d); BUILDERS[d.builder](h); return h;});
const core = buildStationModel(data, {ground, generic});
const hosts = [
 ...generic.buildings.map(b => ({id: b.id, key: b.key, polygon: b.polygon, bottom: b.base, top: b.base + b.height})),
 ...heroes.flatMap(h => h.masses.map((m, i) => ({id: h.id, key: h.key + ':mass:' + i, ...m}))),
 ...core.masses.map(m => ({id: 'station:' + m.owner, key: 'station:' + m.owner, ...m}))
];
const camera = CAMERAS.find(c => c.id === 'scramble');
const resolved = resolveReferenceAds(hosts, camera);

test('the inventory is complete, uniquely identified and mountable', () => {
 assert.equal(REFERENCE_ADS.length, 30);
 assert.equal(new Set(REFERENCE_ADS.map(a => a.id)).size, 30);
 for (const ad of REFERENCE_ADS) {
  assert.ok(MOUNT_CATEGORY[ad.mount], `unmapped mount ${ad.mount}`);
  assert.ok(MAX_WIDTH[ad.mount] > 0, `no width limit for ${ad.mount}`);
  assert.ok(['critical', 'high', 'medium', 'low'].includes(ad.priority));
  for (const key of ['left', 'top', 'width', 'height']) assert.ok(ad[key] >= 0 && ad[key] <= 100, `${ad.id} ${key}`);
  assert.ok(ad.left + ad.width <= 100.01 && ad.top + ad.height <= 100.01, `${ad.id} leaves the frame`);
 }
});

test('rays are unprojected through the frame the inventory was measured in', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 assert.ok(Math.abs(Math.hypot(...basis.forward) - 1) < 1e-9);
 assert.ok(Math.abs(basis.forward[0] * basis.right[0] + basis.forward[1] * basis.right[1] + basis.forward[2] * basis.right[2]) < 1e-9);
 // The frame centre must look straight down the camera axis, and the corners must spread
 // apart by the recorded aspect rather than the viewer's current canvas.
 const centre = adRay({left: 50, top: 50, width: 0, height: 0}, basis);
 for (let i = 0; i < 3; i++) assert.ok(Math.abs(centre.direction[i] - basis.forward[i]) < 1e-9);
 const right = adRay({left: 100, top: 50, width: 0, height: 0}, basis);
 const up = adRay({left: 50, top: 0, width: 0, height: 0}, basis);
 const spreadX = Math.abs(right.direction[0] * basis.right[0] + right.direction[1] * basis.right[1] + right.direction[2] * basis.right[2]);
 const spreadY = Math.abs(up.direction[0] * basis.up[0] + up.direction[1] * basis.up[1] + up.direction[2] * basis.up[2]);
 assert.ok(spreadX > spreadY, 'a wide frame must spread further horizontally than vertically');
});

test('resolved advertisements land on a real facade at a buildable size', () => {
 assert.ok(resolved.placed.length >= 20, `only ${resolved.placed.length} placed`);
 for (const p of resolved.placed) {
  assert.ok(hosts.includes(p.host), `${p.ad.id} left the host set`);
  assert.ok(p.distance > 0 && p.distance <= MAX_RANGE, `${p.ad.id} range ${p.distance}`);
  assert.ok(p.width > .4 && p.width <= MAX_WIDTH[p.ad.mount], `${p.ad.id} width ${p.width}`);
  assert.ok(p.height > .3, `${p.ad.id} height ${p.height}`);
  assert.ok(p.foreshortening >= MIN_FACING, `${p.ad.id} sits on a receding wall`);
  assert.ok([p.along, p.y, ...p.point].every(Number.isFinite), `${p.ad.id} transform`);
  // Wall mounts stay inside the host; only roof mounts are allowed to clear the roofline.
  assert.ok(p.along - p.width / 2 >= -1e-6 && p.along + p.width / 2 <= p.edge.length + 1e-6, `${p.ad.id} overruns its wall`);
  if (!p.roof) assert.ok(p.y - p.height / 2 >= p.host.bottom - 1e-6 && p.y + p.height / 2 <= p.host.top + 1e-6, `${p.ad.id} leaves its host`);
  else assert.ok(p.y - p.height / 2 >= p.host.top - 1e-6, `${p.ad.id} sinks into its roof`);
 }
});

test('advertisements with no building are reported, never relocated', () => {
 for (const u of resolved.unplaced) {
  assert.ok(u.reason, `${u.id} rejected without a reason`);
  assert.ok(!resolved.placed.some(p => p.ad.id === u.id), `${u.id} is both placed and unplaced`);
 }
 // PANELS: the inventory plus the panels the scene adds, every one of which is either
 // placed or reported.
 assert.equal(resolved.placed.length + resolved.unplaced.length, PANELS.length);
});

test('placement is deterministic', () => {
 const again = resolveReferenceAds(hosts, camera);
 assert.deepEqual(again.placed.map(p => [p.ad.id, p.host.key, p.along, p.y, p.width, p.height]),
  resolved.placed.map(p => [p.ad.id, p.host.key, p.along, p.y, p.width, p.height]));
 assert.deepEqual(again.unplaced.map(u => [u.id, u.reason]), resolved.unplaced.map(u => [u.id, u.reason]));
});

test('the render layer clears the panels a reference slot covers', () => {
 const procedural = [];
 for (const p of resolved.placed) {
  // A generated panel sitting squarely inside the slot must not survive alongside it.
  procedural.push({id: 'sticker:' + p.ad.id, hostKey: p.host.key, edge: p.edge, along: p.along,
   width: Math.min(1.2, p.width / 2), height: Math.min(1.2, p.height / 2), category: 'billboard', region: 'frontage',
   position: [p.edge.a[0] + p.edge.tangent[0] * p.along, p.y, p.edge.a[1] + p.edge.tangent[1] * p.along]});
 }
 const far = {id: 'sticker:far', hostKey: 'none', edge: null, along: 0, width: 1, height: 1,
  category: 'billboard', region: 'frontage', position: [9999, 5, 9999]};
 const result = applyReferenceAds([...procedural, far], hosts, {camera});
 assert.equal(result.replaced, procedural.length);
 assert.ok(result.signs.includes(far), 'a panel outside every slot must be kept');
 assert.equal(result.signs.length, 1 + resolved.placed.length);
 for (const sign of result.signs.filter(s => s.referenceAd)) {
  assert.ok(sign.id.startsWith('ref:'));
  assert.ok(Number.isFinite(sign.heading) && sign.position.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...sign.normal) - 1) < 1e-6);
  assert.equal(sign.emissive.class, ['screen', 'rooftop'].includes(sign.category) ? 'screen' : 'commercial');
 }
});

test('a reference slot is audited like any other sign and never stamped onto one', () => {
 // Regression: slots 19 and 20 resolved onto the QFRONT facade at the same position as
 // that building's own large screen, so IKEA and ACN rendered stuck through the middle of
 // it. Two more hung over the roadway. Reference advertisements must clear the same
 // placement audit the procedural signs already clear.
 const model = buildSignModel(data, {generic, ground, core, heroes, tier: 'high'});
 const layout = commercialLayout(model.signs, 32);
 const audited = applyReferenceAds(layout, model.hosts, {camera, context: model.context});
 const unaudited = applyReferenceAds(layout, model.hosts, {camera});

 const screens = audited.signs.filter(s => s.screenUV);
 assert.ok(screens.length, 'the scene must still carry its hero screens');
 for (const ad of audited.signs.filter(s => s.referenceAd)) {
  for (const screen of screens) {
   const dx = ad.position[0] - screen.position[0], dz = ad.position[2] - screen.position[2];
   const offPlane = Math.abs(dx * screen.normal[0] + dz * screen.normal[2]);
   const across = Math.abs(dx * screen.normal[2] - dz * screen.normal[0]);
   const apart = offPlane > 2.5 || across >= (ad.width + screen.width) / 2 ||
    Math.abs(ad.position[1] - screen.position[1]) >= (ad.height + screen.height) / 2;
   assert.ok(apart, `${ad.referenceAd.brand} is stamped onto ${screen.id}`);
  }
 }
 // The audit must be doing the work, not luck: it has to reject placements that the
 // unaudited path accepts, and every rejection has to name the fault it found.
 assert.ok(audited.rejected.length > 0, 'the audit rejected nothing at all');
 assert.ok(audited.placed.length < unaudited.placed.length, 'the audit changed no outcome');
 for (const r of audited.rejected) {
  assert.match(r.reason, /^placement-audit:/);
  assert.ok(!audited.placed.some(p => p.ad.id === r.ad?.id ?? r.id), 'a rejected slot is still placed');
 }
 assert.equal(audited.placed.length + audited.unplaced.length, PANELS.length);
});

test('an anchored advertisement sits on the building it was anchored to', () => {
 // Regression: the centre block's percentages were measured off a reference image whose
 // composition is not this scene's, so unprojecting them sent Hisamitsu, Rakuten, DMM and
 // 大盛堂書店 onto neighbouring plots, over the roadway, or past every roof into open sky.
 // Naming the host makes the placement follow the scene's own geometry.
 const anchored = resolved.placed.filter(p => p.anchored);
 assert.equal(anchored.length, Object.keys(AD_ANCHORS).length, 'an anchored slot went missing');
 for (const p of anchored) {
  assert.equal(p.host.key, AD_ANCHORS[p.ad.id], `${p.ad.brand} drifted off its anchor`);
  assert.ok(p.foreshortening >= MIN_FACING, `${p.ad.brand} sits on a wall turned from the camera`);
 }
});

test('an anchored group keeps the reference arrangement without overlapping', () => {
 for (const key of new Set(Object.values(AD_ANCHORS))) {
  const group = resolved.placed.filter(p => p.anchored && p.host.key === key);
  assert.ok(group.length >= 2, `${key} carries no group`);
  // One wall, so a shared facade rectangle: the panels must tile it, not stack on it.
  assert.equal(new Set(group.map(p => p.edge.index)).size, 1, `${key} spread across walls`);
  for (const p of group) {
   assert.ok(p.along - p.width / 2 > 0 && p.along + p.width / 2 < p.edge.length, `${p.ad.brand} overruns its wall`);
   assert.ok(p.y - p.height / 2 >= p.host.bottom && p.y + p.height / 2 <= p.host.top, `${p.ad.brand} leaves its host`);
  }
  for (const a of group) for (const b of group) {
   if (a.ad.id >= b.ad.id) continue;
   const apart = Math.abs(a.along - b.along) >= (a.width + b.width) / 2 - 1e-9 ||
    Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - 1e-9;
   assert.ok(apart, `${a.ad.brand} overlaps ${b.ad.brand}`);
  }
  // A panel with a stated band occupies exactly that band of the wall, so the vision can
  // run the building's full width down to its middle and the fascia can sit just clear of
  // the lit ground floor, rather than each landing wherever a stack happens to reach.
  const span = p => p.host.top - p.host.bottom;
  for (const p of group.filter(p => ANCHOR_SHAPES[p.ad.id])) {
   const band = ANCHOR_SHAPES[p.ad.id];
   const top = (p.y + p.height / 2 - p.host.bottom) / span(p);
   const bottom = (p.y - p.height / 2 - p.host.bottom) / span(p);
   assert.ok(Math.abs(top - band.top) < .02, `${p.ad.brand} tops out at ${top.toFixed(3)}, not ${band.top}`);
   assert.ok(Math.abs(bottom - band.bottom) < .02, `${p.ad.brand} bottoms at ${bottom.toFixed(3)}, not ${band.bottom}`);
   assert.ok(p.width <= band.width * p.edge.length + 1e-6, `${p.ad.brand} is wider than its share of the wall`);
  }
  // Panels without a band keep the proportions their reference rectangles imply.
  const plain = group.filter(p => !ANCHOR_SHAPES[p.ad.id] && p.category !== 'blade');
  for (let i = 1; i < plain.length; i++)
   assert.ok(Math.abs(plain[i].width / plain[0].width - plain[i].ad.width / plain[0].ad.width) < 1e-6,
    `${key} lost its proportions`);
 }
});

test('the visibility scan reports what standing in front of a wall does to it', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const host = hosts.find(h => h.key === AD_ANCHORS[22]);
 const edge = bestCameraEdge(host, basis, hosts).edge;
 const open = visibleWallPatch(host, edge, basis, hosts);
 assert.ok(open && open.coverage > .9, 'the anchor wall should be effectively unobstructed');
 assert.ok(open.along[1] > open.along[0] && open.y[1] > open.y[0]);
 assert.ok(open.along[0] >= -1e-9 && open.along[1] <= edge.length + 1e-9);

 // Drop a wall in front of it and the reported patch has to shrink.
 const t = edge.tangent, n = edge.normal, mid = 40;
 const c = [edge.a[0] + t[0] * edge.length / 2 + n[0] * mid, edge.a[1] + t[1] * edge.length / 2 + n[1] * mid];
 const wall = {key: 'test:wall', bottom: 0, top: 60, polygon: {outer: [
  [c[0] - t[0] * 60 - n[0], c[1] - t[1] * 60 - n[1]], [c[0] + t[0] * 60 - n[0], c[1] + t[1] * 60 - n[1]],
  [c[0] + t[0] * 60 + n[0], c[1] + t[1] * 60 + n[1]], [c[0] - t[0] * 60 + n[0], c[1] - t[1] * 60 + n[1]]]}};
 const blocked = visibleWallPatch(host, edge, basis, [...hosts, wall]);
 assert.ok(!blocked || blocked.coverage < open.coverage, 'a wall in the way changed nothing');
});

test('a short wall costs the gaps between stacked advertisements, never their size', () => {
 // This is the stacking path, used by any anchored group without stated bands. The centre
 // column no longer goes through it — each of its three states its own band — so the rule
 // is exercised on a pair built for it: same size, a wide gap between them.
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const host = hosts.find(h => h.key === AD_ANCHORS[22]);
 const pair = [
  {id: 901, brand: 'upper', left: 45, top: 20, width: 6, height: 6, mount: 'wall_panel'},
  {id: 902, brand: 'lower', left: 45, top: 45, width: 6, height: 6, mount: 'wall_panel'}
 ];
 assert.ok(pair.every(a => !ANCHOR_SHAPES[a.id]), 'this pair is meant to have no stated shapes');
 const tall = placeAnchorGroup(pair, {...host, top: host.bottom + 80}, basis, hosts);
 const squat = placeAnchorGroup(pair, {...host, top: host.bottom + 20}, basis, hosts);
 assert.ok(Array.isArray(tall) && Array.isArray(squat), 'both walls should carry the pair');
 const gapOf = col => {
  const s = [...col].sort((a, b) => b.y - a.y);
  return (s[0].y - s[0].height / 2) - (s[1].y + s[1].height / 2);
 };
 assert.ok(gapOf(squat) < gapOf(tall) - 1e-9,
  `the short wall did not compress the gap (${gapOf(squat).toFixed(2)} vs ${gapOf(tall).toFixed(2)} m)`);
 assert.ok(gapOf(squat) > 0, 'the panels were pushed into each other');
 for (const p of squat) {
  const roomyOne = tall.find(q => q.ad.id === p.ad.id);
  assert.ok(p.height >= roomyOne.height - 1e-9,
   `${p.ad.brand} was shrunk instead of the wall between them`);
 }
});

test('a blade is sized by how far it may stand off the wall', () => {
 // A blade's width is its reach over the street, so panel-sized widths put a neon sign
 // metres above the pavement and the placement audit throws it out.
 for (const p of resolved.placed.filter(p => p.category === 'blade'))
  assert.ok(p.width <= MAX_BLADE_WIDTH, `${p.ad.brand} reaches ${p.width} m off its facade`);
});

test('an excluded advertisement is reported, not placed and not forgotten', () => {
 for (const [id, reason] of Object.entries(EXCLUDED_ADS)) {
  // PANELS, not REFERENCE_ADS: a panel the scene adds for a hero facade to carry is
  // excluded from the raycast pass too, and it is an extra rather than an inventory entry.
  assert.ok(PANELS.some(a => a.id === Number(id)), `${id} is excluded but in neither the inventory nor the extras`);
  assert.ok(!resolved.placed.some(p => p.ad.id === Number(id)), `${id} is excluded but placed`);
  assert.equal(resolved.unplaced.find(u => u.id === Number(id))?.reason, reason);
 }
});

test('an anchored group lands on the wall its anchor asks for', () => {
 // Facing alone picks the widest wall, which in a street this dense is regularly the one
 // standing behind its neighbour, so measured visibility decides by default. The centre
 // block overrides that: its signs hang on the narrow return facing QFRONT, and being on
 // the right wall outranks being on the wall with the most of it showing.
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 for (const key of new Set(Object.values(AD_ANCHORS))) {
  const host = hosts.find(h => h.key === key);
  assert.ok(host, `anchor host ${key} is missing from the scene`);
  const prefer = AD_ANCHOR_FACE[key];
  const asked = bestCameraEdge(host, basis, hosts, {prefer});
  assert.ok(asked?.patch, `${key} shows no visible facade`);
  assert.ok(asked.facing >= MIN_FACING && asked.edge.length > 1);
  for (const p of resolved.placed.filter(p => p.host.key === key && p.anchored)) {
   assert.equal(p.edge.index, asked.edge.index, `${p.ad.brand} is not on the wall its anchor asks for`);
   // And the panel has to sit inside the patch that scan found, not merely on that wall.
   assert.ok(p.along - p.width / 2 >= asked.patch.along[0] - 1e-6 &&
    p.along + p.width / 2 <= asked.patch.along[1] + 1e-6, `${p.ad.brand} runs past the visible patch`);
   assert.ok(p.y - p.height / 2 >= asked.patch.y[0] - 1e-6 &&
    p.y + p.height / 2 <= asked.patch.y[1] + 1e-6, `${p.ad.brand} sits outside the visible band`);
  }
  // Geometry-only selection remains available and must still answer.
  assert.ok(bestCameraEdge(host, basis), `${key} shows no facade to the camera`);
 }

 // The override has to be doing work: the centre block's preferred wall is NOT the one the
 // visibility scan would choose, and it is the one further right in the frame.
 const host = hosts.find(h => h.key === AD_ANCHORS[22]);
 const visible = bestCameraEdge(host, basis, hosts);
 const asked = bestCameraEdge(host, basis, hosts, {prefer: 'rightmost'});
 assert.notEqual(asked.edge.index, visible.edge.index, 'the preferred wall is the default one, so nothing is proved');
 const midX = e => {
  const m = [(e.a[0] + e.b[0]) / 2, (host.bottom + host.top) / 2, (e.a[1] + e.b[1]) / 2];
  const d = [m[0] - basis.origin[0], m[1] - basis.origin[1], m[2] - basis.origin[2]];
  const z = d[0] * basis.forward[0] + d[1] * basis.forward[1] + d[2] * basis.forward[2];
  return (d[0] * basis.right[0] + d[1] * basis.right[1] + d[2] * basis.right[2]) / (z * basis.tanHalf * basis.aspect);
 };
 assert.ok(midX(asked.edge) > midX(visible.edge), 'the preferred wall is not the one nearer QFRONT');
});

test('a wall too hidden to read carries nothing at all', () => {
 // Squeezing a group into a sliver produces panels smaller than the procedural stickers
 // beside them, which reads as litter on the facade rather than as an advertisement.
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const host = hosts.find(h => h.key === AD_ANCHORS[22]);
 const ads = REFERENCE_ADS.filter(a => AD_ANCHORS[a.id] === host.key);
 const sliver = {...host, polygon: host.polygon, bottom: host.bottom, top: host.bottom + .9};
 const out = placeAnchorGroup(ads, sliver, basis, hosts);
 assert.ok(!Array.isArray(out), 'a wall with no room still produced placements');
});

test('an empty host set leaves the procedural signs untouched', () => {
 const signs = [{id: 'a', position: [0, 5, 0], width: 1, height: 1, category: 'billboard', region: 'frontage'}];
 const result = applyReferenceAds(signs, [], {camera});
 assert.equal(result.signs, signs);
 assert.deepEqual(result.placed, []);
});

test('a ray that faces away from every wall finds nothing', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const skyward = {origin: basis.origin, direction: [0, 1, 0]};
 assert.equal(intersectHosts(skyward, hosts), null);
});
