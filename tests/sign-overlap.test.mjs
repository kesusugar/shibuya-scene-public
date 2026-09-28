import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSignModel} from '../src/signs/model.mjs';
import {commercialLayout} from '../src/signs/commercial-layout.mjs';
import {applyReferenceAds} from '../src/signs/reference-layer.mjs';
import {facesIntersect, resolveFaceOverlaps, signPriority} from '../src/signs/overlap.mjs';
import {CAMERAS} from '../src/app/foundation.mjs';

const data = JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const model = buildSignModel(data, {tier: 'high'});
const camera = CAMERAS.find(c => c.id === 'scramble');

/** The render list exactly as buildSignage assembles it, before overlap resolution. */
const rendered = applyReferenceAds(
 commercialLayout(model.signs, 32).filter(s => s.id !== 'qfront:facadeSign:3:s7'),
 model.hosts, {camera, variantOf: ad => ad.id % 32, context: model.context}).signs;

const panel = (x, y, z, w, h, normal = [0, 0, 1], extra = {}) =>
 ({id: extra.id ?? `p${x},${y},${z}`, position: [x, y, z], width: w, height: h, normal, ...extra});

function intersectingPairs(signs) {
 const pairs = [];
 for (let i = 0; i < signs.length; i++) for (let j = i + 1; j < signs.length; j++) {
  if (facesIntersect(signs[i], signs[j])) pairs.push([signs[i].id, signs[j].id]);
 }
 return pairs;
}

test('intersection is judged on the shared wall plane', () => {
 const base = panel(0, 10, 0, 4, 4);
 assert.ok(facesIntersect(base, panel(2, 10, 0, 4, 4)), 'panels sharing a plane and overlapping');
 assert.ok(facesIntersect(base, panel(0, 12, 0, 4, 4)), 'stacked panels that cut into each other');
 assert.ok(!facesIntersect(base, panel(5, 10, 0, 4, 4)), 'panels clear of each other sideways');
 assert.ok(!facesIntersect(base, panel(0, 15, 0, 4, 4)), 'panels clear of each other vertically');
 assert.ok(!facesIntersect(base, panel(0, 10, 9, 4, 4)), 'panels on different planes');
 assert.ok(!facesIntersect(base, panel(0, 10, 0, 4, 4, [1, 0, 0])), 'panels on perpendicular walls');
 // Touching edge to edge is legitimate: a facade grid is built that way.
 assert.ok(!facesIntersect(base, panel(4, 10, 0, 4, 4)), 'panels that merely touch');
});

test('the scene renders with no sign cutting through another', () => {
 const before = intersectingPairs(rendered);
 assert.ok(before.length > 0, 'this scene is supposed to produce collisions to resolve');
 const {signs, dropped} = resolveFaceOverlaps(rendered);
 assert.deepEqual(intersectingPairs(signs), [], 'a panel still cuts through another');
 assert.equal(signs.length + dropped.length, rendered.length, 'panels were lost or duplicated');
});

test('resolution sacrifices generated filler, never the signs that matter', () => {
 const {signs, dropped} = resolveFaceOverlaps(rendered);
 for (const d of dropped) {
  assert.equal(signPriority(d.sign), 4, `dropped a non-filler panel: ${d.sign.id}`);
  assert.ok(d.against, 'a drop must name what it collided with');
 }
 // Nothing the scene depends on may disappear.
 for (const kind of [s => s.screenUV, s => s.referenceAd, s => s.hero]) {
  assert.equal(signs.filter(kind).length, rendered.filter(kind).length, 'a load-bearing sign was dropped');
 }
});

test('resolution is deterministic and order independent', () => {
 const a = resolveFaceOverlaps(rendered).signs.map(s => s.id);
 const b = resolveFaceOverlaps(rendered).signs.map(s => s.id);
 assert.deepEqual(a, b);
 // Shuffling the input must not change which faces survive, only the surviving order is
 // inherited from the caller.
 const shuffled = [...rendered].reverse();
 const c = resolveFaceOverlaps(shuffled).signs.map(s => s.id).sort();
 assert.deepEqual(c, [...a].sort());
});

test('resolution keeps the caller ordering of whatever survives', () => {
 const {signs} = resolveFaceOverlaps(rendered);
 const index = new Map(rendered.map((s, i) => [s, i]));
 for (let i = 1; i < signs.length; i++) assert.ok(index.get(signs[i - 1]) < index.get(signs[i]));
});

test('an empty or single-panel wall needs no resolution', () => {
 assert.deepEqual(resolveFaceOverlaps([]).signs, []);
 const one = [panel(0, 10, 0, 4, 4, [0, 0, 1], {id: 'only'})];
 assert.deepEqual(resolveFaceOverlaps(one).signs, one);
});

test('a hero screen outranks an advertisement aimed on top of it', () => {
 const screen = panel(0, 22, -30, 6, 10, [0, 0, 1], {id: 'screen', screenUV: [0, 1]});
 const ad = panel(0, 24, -30, 5, 5, [0, 0, 1], {id: 'ref:1', referenceAd: {id: 1}});
 const filler = panel(0, 20, -30, 5, 5, [0, 0, 1], {id: 'x:commercial:0:0'});
 const {signs} = resolveFaceOverlaps([filler, ad, screen]);
 assert.deepEqual(signs.map(s => s.id), ['screen']);
 assert.ok(signPriority(screen) < signPriority(ad) && signPriority(ad) < signPriority(filler));
});
