// Render-time layer that puts the reference advertisement inventory on real facades.
//
// This runs at render time rather than during the static bake so that re-aiming or
// re-drawing an advertisement does not invalidate the expensive geometry pack. It takes
// the display signs the procedural layout produced and swaps the generic panels that
// occupy a reference slot for the reference advertisement itself.

import {makePlacement, placementIssues} from './model.mjs';
import {CAMERAS} from '../app/foundation.mjs';
import {resolveReferenceAds, referenceBasis} from './reference-ads.mjs';

/** Vertical mounts read as blades; everything else keeps the facade plane. */
const VERTICAL = new Set(['wall_panel_vertical', 'sleeve_sign_vertical', 'sleeve_sign_vertical_banner', 'neon_sign_vertical']);

function overlaps(a, b, margin = 0) {
 return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > -margin;
}

/**
 * Replace procedural panels that sit where a reference advertisement belongs. A generic
 * sign is dropped when it shares a facade with a reference slot and their footprints
 * overlap, so the reference artwork never renders on top of a sticker it did not replace.
 */
/**
 * Placement faults that disqualify a reference advertisement outright.
 *
 * A reference slot is aimed from a photograph, so it can land on a wall that already
 * carries something — most visibly QFRONT's own screen, which a slot measured beside it
 * will happily sit on top of. These are the faults the procedural signs are already
 * audited for; reference advertisements must clear the same bar rather than bypass it.
 *
 * `vertical-host-bounds` is deliberately absent: a rooftop mount is supposed to stand
 * above its host's roofline, which that check reads as leaving the building.
 */
export const FATAL_ISSUES = Object.freeze([
 'invalid-transform', 'invalid-normal', 'backface', 'corner-overrun', 'facade-distance',
 'host-penetration', 'neighbor-penetration', 'duplicate-overlap', 'near-overlap',
 'road-projection', 'crosswalk-projection', 'rail-clearance', 'tile-edge'
]);

// How much of a generated panel may sit across a reference advertisement in the frame
// before the panel gives way, how much of the advertisement it may cover whatever its own
// size, and how far from it that panel has to be to be someone else's problem rather than
// clutter in front of this one. Both share tests are needed: a tall narrow blade crossing a
// wide shallow fascia covers almost none of itself and most of the fascia.
const CLUTTER_OVERLAP = .2, CLUTTER_COVER = .12, CLUTTER_RANGE = 60;

/**
 * Drop generated panels that land across a reference advertisement in the frame.
 *
 * Clearing by world footprint already stops a panel being stamped on the same patch of
 * wall, and the overlap pass already separates faces that intersect in space. Neither
 * catches the case that actually spoils the centre column: a panel on a neighbouring
 * facade, a few metres nearer, that crosses the advertisement from this viewpoint and
 * leaves it half legible. Generated filler is the lowest-priority signage in the scene, so
 * where the two compete for the same pixels the filler goes.
 */
export function clearLineOfSight(kept, accepted, basis) {
 if (!accepted.length) return kept;
 const box = s => {
  if (!s.position || !(s.width > 0) || !(s.height > 0)) return null;
  // Signs from the sign model carry a normal; the centre-gai layout carries only a
  // heading. Accepting both is what lets the same rule cover the second subsystem.
  const n = s.normal ?? (Number.isFinite(s.heading) ? [Math.sin(s.heading), 0, Math.cos(s.heading)] : null);
  if (!n) return null;
  const t = [n[2], 0, -n[0]];
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
   const p = [s.position[0] + t[0] * u * s.width / 2, s.position[1] + v * s.height / 2,
    s.position[2] + t[2] * u * s.width / 2];
   const d = [p[0] - basis.origin[0], p[1] - basis.origin[1], p[2] - basis.origin[2]];
   const z = d[0] * basis.forward[0] + d[1] * basis.forward[1] + d[2] * basis.forward[2];
   if (z <= .01) return null;
   const x = (d[0] * basis.right[0] + d[1] * basis.right[1] + d[2] * basis.right[2]) / z;
   const y = (d[0] * basis.up[0] + d[1] * basis.up[1] + d[2] * basis.up[2]) / z;
   return [x, y, z];
  });
  if (pts.some(p => !p)) return null;
  return {x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])),
   y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])),
   depth: pts.reduce((t, p) => t + p[2], 0) / 4};
 };
 // An advertisement may reserve wall above itself. A panel on the storey over it can clip
 // its top edge by too little to trip either share test and still crowd it.
 const ads = accepted.map(s => {
  const b = box(s);
  if (!b || !(s.clearAbove > 0)) return b;
  return {...b, y1: b.y1 + (b.y1 - b.y0) * s.clearAbove};
 }).filter(Boolean);
 return kept.filter(s => {
  if (s.screenUV || s.hero) return true; // hero screens and landmarks outrank everything
  const b = box(s);
  if (!b) return true;
  const area = (b.x1 - b.x0) * (b.y1 - b.y0);
  if (!(area > 0)) return true;
  return !ads.some(a => {
   if (Math.abs(a.depth - b.depth) > CLUTTER_RANGE) return false;
   const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
   const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
   if (!(w > 0 && h > 0)) return false;
   const shared = w * h, adArea = (a.x1 - a.x0) * (a.y1 - a.y0);
   return shared > area * CLUTTER_OVERLAP || (adArea > 0 && shared > adArea * CLUTTER_COVER);
  });
 });
}

export function applyReferenceAds(signs, hosts, {camera = CAMERAS.find(c => c.id === 'scramble'), variantOf, context} = {}) {
 if (!hosts?.length) return {signs, placed: [], unplaced: [], basis: referenceBasis(camera)};
 const {basis, placed, unplaced} = resolveReferenceAds(hosts, camera);
 // Reference slots are measured from the frame, not from the procedural grid, so a slot
 // routinely straddles several generated panels on a neighbouring host key. Clearing by
 // world footprint rather than by host identity is what actually stops the reference
 // artwork rendering on top of the stickers it is meant to replace.
 const boxes = placed.map(p => ({
  centre: [p.edge.a[0] + p.edge.tangent[0] * p.along, p.y, p.edge.a[1] + p.edge.tangent[1] * p.along],
  normal: [p.edge.normal[0], 0, p.edge.normal[1]], tangent: [p.edge.tangent[0], 0, p.edge.tangent[1]],
  half: p.width / 2, vertical: [p.y - p.height / 2, p.y + p.height / 2]
 }));
 const kept = signs.filter(s => {
  if (s.screenUV) return true; // hero screens keep their own segmented mapping
  return !boxes.some(b => {
   const delta = [s.position[0] - b.centre[0], 0, s.position[2] - b.centre[2]];
   if (Math.abs(delta[0] * b.normal[0] + delta[2] * b.normal[2]) > 1.5) return false; // different wall plane
   const along = delta[0] * b.tangent[0] + delta[2] * b.tangent[2];
   return overlaps([along - s.width / 2, along + s.width / 2], [-b.half, b.half], -.15) &&
    overlaps([s.position[1] - s.height / 2, s.position[1] + s.height / 2], b.vertical, -.15);
  });
 });

 const rejected = [];
 const added = placed.map(p => {
  const vertical = VERTICAL.has(p.ad.mount);
  const sign = makePlacement(
   {id: p.host.id ?? p.host.key, key: p.host.key, label: 'reference-ad', polygon: p.host.polygon, bottom: p.host.bottom, top: p.host.top},
   p.edge,
   {id: 'ref:' + p.ad.id, category: vertical ? 'blade' : p.category, along: p.along, y: p.y,
    width: p.width, height: p.height, region: 'frontage',
    offset: p.roof ? .2 : .18, variant: variantOf?.(p.ad) ?? 0});
  sign.referenceAd = p.ad;
  sign.referenceMount = p.ad.mount;
  sign.referenceLowered = p.lowered;
  sign.clearAbove = p.clearAbove ?? 0;
  // Roof and vision mounts are lit as displays; painted wall panels stay printed.
  sign.emissive = {...sign.emissive, class: p.category === 'screen' || p.roof ? 'screen' : 'commercial'};
  return sign;
 });

 // Audit the reference advertisements against everything that survived, exactly as the
 // procedural signs are audited. Accepting them one at a time means two reference slots
 // resolving onto the same wall are caught against each other too.
 const accepted = [];
 for (const sign of added) {
  const issues = context ? placementIssues(sign, context, [...kept, ...accepted]) : [];
  const fatal = issues.filter(issue => FATAL_ISSUES.includes(issue));
  if (fatal.length) rejected.push({...sign.referenceAd, reason: 'placement-audit:' + fatal.join('+')});
  else accepted.push(sign);
 }
 const keptIds = new Set(accepted.map(s => s.referenceAd.id));
 const clear = clearLineOfSight(kept, accepted, basis);
 return {basis, signs: [...clear, ...accepted], placed: placed.filter(p => keptIds.has(p.ad.id)),
  unplaced: [...unplaced, ...rejected], rejected,
  replaced: signs.length - kept.length, decluttered: kept.length - clear.length};
}
