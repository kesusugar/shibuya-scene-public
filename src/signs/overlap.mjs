// Render-time overlap resolution for sign faces.
//
// The placement audit in model.mjs guarantees the *model* signs do not intersect, but two
// layers run after it and neither was audited: commercialLayout replaces dense faces with
// a freshly generated grid, and the reference layer adds advertisements aimed from a
// photograph. Both can land a panel on top of a panel the audit already accepted, which
// renders as signs clipping through each other.
//
// This pass is the last word before geometry is built: whatever survives here does not
// intersect anything else on its wall.

/** Faces closer than this in their shared normal direction count as the same plane. */
const PLANE_TOLERANCE = 1;
/** Normals must agree this closely to be treated as the same wall direction. */
const PARALLEL = .98;
/** Ignore slivers: panels may touch, they may not visibly cut into each other. */
const BITE = .05;

const normalOf = s => s.normal ?? [Math.sin(s.heading), 0, Math.cos(s.heading)];

/**
 * Rank deciding which panel survives a collision. Lower wins.
 *
 * Hero screens are the building's own displays and are never sacrificed. Reference
 * advertisements are aimed deliberately and outrank filler. Audited model signs outrank
 * the grid commercialLayout generates, because that grid is synthetic density whose only
 * job is to fill a wall — dropping one of its cells costs nothing, while dropping an
 * audited sign loses real placement work.
 */
export function signPriority(s) {
 if (s.screenUV) return 0;
 if (s.referenceAd) return 1;
 if (s.hero) return 2;
 if (String(s.id).includes(':commercial:')) return 4;
 return 3;
}

export function facesIntersect(a, b, {planeTolerance = PLANE_TOLERANCE, bite = BITE} = {}) {
 const na = normalOf(a), nb = normalOf(b);
 if (Math.abs(na[0] * nb[0] + na[2] * nb[2]) < PARALLEL) return false;
 const dx = b.position[0] - a.position[0], dy = b.position[1] - a.position[1], dz = b.position[2] - a.position[2];
 if (Math.abs(dx * na[0] + dz * na[2]) > planeTolerance) return false;
 const across = Math.abs(dx * na[2] - dz * na[0]);
 return (a.width + b.width) / 2 - across > bite && (a.height + b.height) / 2 - Math.abs(dy) > bite;
}

/**
 * Drop the lower-ranked side of every intersecting pair.
 *
 * Deterministic: panels are considered in priority order and then by id, so the same scene
 * always keeps the same faces regardless of the order the layers produced them in.
 */
export function resolveFaceOverlaps(signs, options = {}) {
 const order = signs.map((sign, index) => ({sign, index}))
  .sort((a, b) => signPriority(a.sign) - signPriority(b.sign) ||
   String(a.sign.id).localeCompare(String(b.sign.id)) || a.index - b.index);
 const kept = [], dropped = [];
 // Bucket by rounded wall height so a panel is only tested against plausible neighbours.
 const buckets = new Map();
 const keysFor = s => {
  const low = Math.floor((s.position[1] - s.height / 2) / 8), high = Math.floor((s.position[1] + s.height / 2) / 8);
  return Array.from({length: high - low + 1}, (_, i) => low + i);
 };
 for (const {sign} of order) {
  const keys = keysFor(sign);
  const neighbours = new Set();
  for (const key of keys) for (const other of buckets.get(key) ?? []) neighbours.add(other);
  const clash = [...neighbours].find(other => facesIntersect(sign, other, options));
  if (clash) {dropped.push({sign, against: clash}); continue;}
  kept.push(sign);
  for (const key of keys) {
   if (!buckets.has(key)) buckets.set(key, []);
   buckets.get(key).push(sign);
  }
 }
 // Restore the caller's original ordering so downstream batching is unchanged.
 const survives = new Set(kept);
 return {signs: signs.filter(s => survives.has(s)), dropped};
}
