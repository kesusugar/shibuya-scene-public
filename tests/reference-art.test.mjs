import test from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_ADS, PANELS} from '../src/signs/reference-ads.mjs';
import {REFERENCE_ART, PAINTED_IDS, PAINTED_ADS, REFERENCE_QUALITY, REFERENCE_COLUMNS,
 referenceAtlasEntries, paintReferenceAtlas, createReferenceAtlas, columnsFor} from '../src/signs/reference-art.mjs';

/** Record every drawing call a painter makes, so its composition can be inspected. */
function record() {
 const calls = [];
 const ctx = new Proxy({}, {
  get(target, key) {
   if (key === 'canvas') return {width: 1, height: 1};
   if (!(key in target)) target[key] = (...args) => {calls.push([key, ...args]); return key === 'measureText' ? {width: 1} : undefined;};
   return target[key];
  },
  set(target, key, value) {calls.push(['set:' + String(key), value]); return true;}
 });
 return {ctx, calls,
  texts: () => calls.filter(c => c[0] === 'fillText').map(c => String(c[1])),
  fills: () => calls.filter(c => c[0] === 'set:fillStyle').map(c => String(c[1])),
  ops: () => new Set(calls.map(c => c[0]))};
}

test('artwork exists for inventory entries and nothing else', () => {
 // PANELS, not REFERENCE_ADS: the scene adds panels of its own that the reference frame
 // does not show, and those are painted here too.
 const ids = new Set(PANELS.map(a => a.id));
 for (const id of PAINTED_IDS) assert.ok(ids.has(id), `painted id ${id} is in neither the inventory nor the extras`);
 assert.equal(PAINTED_ADS.length, PAINTED_IDS.length);
 // Every advertisement the reference frame shows prominently must be drawn.
 for (const ad of REFERENCE_ADS.filter(a => ['critical', 'high'].includes(a.priority))) {
  assert.ok(REFERENCE_ART[ad.id], `${ad.priority} priority ${ad.brand} has no artwork`);
 }
});

test('each panel is its own composition, not one template recoloured', () => {
 const perAd = new Map();
 for (const id of PAINTED_IDS) {
  const r = record();
  REFERENCE_ART[id](r.ctx);
  // A panel declared textless carries artwork instead of a name, the way a vision screen
  // runs a key visual; everything else has to say who it is for.
  const panel = PANELS.find(a => a.id === id);
  if (panel?.textless) assert.equal(r.texts().length, 0, `textless panel ${id} drew text`);
  else assert.ok(r.texts().length > 0, `panel ${id} draws no text`);
  assert.ok(r.fills().length > 1, `panel ${id} uses a single flat colour`);
  perAd.set(id, r);
 }
 // No two panels may share their full text content: that is the repeated-sticker failure.
 const signatures = new Map();
 for (const [id, r] of perAd) {
  // Two textless panels both draw nothing, which is what they are for; they are told apart
  // by their artwork, which the fill and background checks around this already cover.
  if (PANELS.find(a => a.id === id)?.textless) continue;
  const signature = r.texts().join('|');
  assert.ok(!signatures.has(signature), `panels ${signatures.get(signature)} and ${id} draw identical text`);
  signatures.set(signature, id);
 }
 // No single line may be reused across a large share of the sheet either, which is how the
 // generic atlas ended up showing one subtitle on four panels at once.
 const lines = new Map();
 for (const r of perAd.values()) for (const line of new Set(r.texts())) lines.set(line, (lines.get(line) ?? 0) + 1);
 for (const [line, count] of lines) assert.ok(count <= 2, `"${line}" appears on ${count} panels`);
 // And the palettes must differ: at least half the sheet's primary backgrounds are unique.
 const backgrounds = new Set([...perAd.values()].map(r => r.fills()[0]));
 assert.ok(backgrounds.size >= PAINTED_IDS.length / 2, `only ${backgrounds.size} distinct backgrounds`);
});

test('the sheet packs without overlap and stays inside the texture', () => {
 for (const size of Object.values(REFERENCE_QUALITY)) {
  const entries = referenceAtlasEntries(size, PAINTED_IDS.length);
  assert.equal(entries.length, PAINTED_IDS.length);
  for (const e of entries) {
   assert.ok(e.u0 >= 0 && e.v0 >= 0 && e.u1 <= 1 && e.v1 <= 1, 'tile leaves the texture');
   assert.ok(e.u1 > e.u0 && e.v1 > e.v0, 'tile is inverted');
   assert.ok(e.padding >= 2, 'tile has no padding');
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
   const a = entries[i], b = entries[j];
   const apart = a.u1 <= b.u0 || b.u1 <= a.u0 || a.v1 <= b.v0 || b.v1 <= a.v0;
   assert.ok(apart, `tiles ${i} and ${j} overlap`);
  }
 }
});

test('a reference tile carries more pixels than a generic city tile', () => {
 // The city atlas spreads 32 tiles over an 8x4 grid at 2048, and every one of them is
 // shared by many faces. The point of a separate sheet is that the advertisements the
 // camera reads get their own tile, and a bigger one - which only holds if the sheet is
 // built for the advertisements a scene actually places rather than the whole inventory.
 const cityTile = (2048 / 8) * (2048 / 4);
 for (const count of [8, 12, 16]) {
  const entry = referenceAtlasEntries(REFERENCE_QUALITY.high, count)[0];
  assert.ok(entry.w * entry.h >= cityTile * 2,
   `${count} panels give a ${Math.round(entry.w)}x${Math.round(entry.h)} tile, no gain over the city atlas`);
 }
});

test('the sheet grid stays square as the panel count changes', () => {
 for (const count of [1, 5, 15, 30]) {
  const entries = referenceAtlasEntries(REFERENCE_QUALITY.high, count);
  assert.equal(entries.length, count);
  const columns = columnsFor(count);
  assert.ok(columns * columns >= count, `${count} panels do not fit ${columns} columns`);
  assert.ok((columns - 1) * (columns - 1) < count || count === 1, `${count} panels waste a column`);
 }
});

test('painting the sheet draws every panel inside its own clip', () => {
 const r = record();
 const entries = paintReferenceAtlas(r.ctx, 1024, PAINTED_IDS);
 assert.equal(entries.length, PAINTED_IDS.length);
 assert.equal(r.calls.filter(c => c[0] === 'clip').length, PAINTED_IDS.length);
 assert.equal(r.calls.filter(c => c[0] === 'save').length, r.calls.filter(c => c[0] === 'restore').length);
 assert.ok(r.calls.some(c => c[0] === 'fillRect'), 'the sheet is never cleared');
});

test('atlas honours the GPU limit, indexes by ad id and disposes once', () => {
 const atlas = createReferenceAtlas({tier: 'high', maxTextureSize: 512, canvasFactory: () => ({getContext: () => record().ctx})});
 assert.equal(atlas.size, 512);
 assert.equal(atlas.mode, 'canvas');
 for (const id of PAINTED_IDS) assert.ok(atlas.entryFor(id), `no tile for ad ${id}`);
 assert.equal(atlas.entryFor(9999), null);
 let disposals = 0;
 atlas.texture.addEventListener('dispose', () => disposals++);
 atlas.dispose(); atlas.dispose();
 assert.equal(disposals, 1);
 assert.throws(() => createReferenceAtlas({tier: 'nope'}), /tier/);
 assert.throws(() => createReferenceAtlas({maxTextureSize: 8}), /texture limit/);
});

test('every tier produces a usable sheet', () => {
 for (const tier of ['high', 'medium', 'low']) {
  const atlas = createReferenceAtlas({tier, maxTextureSize: 8192, canvasFactory: () => ({getContext: () => record().ctx})});
  assert.equal(atlas.size, REFERENCE_QUALITY[tier]);
  assert.equal(atlas.entries.length, PAINTED_IDS.length);
  atlas.dispose();
 }
 assert.ok(REFERENCE_COLUMNS >= 1);
});
