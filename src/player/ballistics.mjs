// Where a bullet goes (PLAN-WEAPONS R7, R9, R10). Pure: the world is handed in as functions and
// lists, so every rule below is tested without a scene.
//
// The collision world is 2D -- `solid(x, z)` is the pedestrian context's body-height solid test,
// which is what buildings and walls are -- plus the traffic cars as boxes and the people as
// vertical capsules. So:
//  - a shot is hitscan from the muzzle along the aim, no drop and no travel time (a pistol round
//    at 60 m arrives in well under a tenth of a second and drops a few centimetres);
//  - a building stops it wherever the ray crosses its footprint, at any height (the grid has no
//    floors, so a shot over a low roof is stopped too -- R8, a known limitation);
//  - a car stops it only where its box actually is, height included;
//  - a person is hit only where their body is, height included, so a shot over a head misses.
//    Above `headHeight` (scaled to the person) is the head (R10).
// Low street furniture -- fences, planters, bollards -- is not in the solid grid at the right
// height and does not stop a bullet (R8).

export const BALLISTICS = Object.freeze({
 step: .25,          // m between solid samples along the ray
 refine: 6,          // bisection steps once a solid is found (to ~4 mm)
 bodyRadius: .27,    // m: a person's capsule radius
 bodyHeight: 1.76,   // m: the reference height the head zone is measured on
 legsHeight: .85,    // m on that body: below this a hit is to the legs (§9ai, for the reaction)
 headHeight: 1.5,    // m above the feet at the reference height
 carHeight: 1.5      // m: a car box when its type does not say
});

/** Distance along a ray (origin o, unit direction d) to a vertical cylinder, or Infinity. */
function rayCylinder(o, d, cx, cz, r, y0, y1) {
 const ox = o.x - cx, oz = o.z - cz;
 const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
 if (a < 1e-9) {                                 // straight up or down
  if (c > 0) return Infinity;
  const t = d.y > 0 ? y0 - o.y : o.y - y1;
  return t >= 0 ? t : Infinity;
 }
 const disc = b * b - 4 * a * c;
 if (disc < 0) return Infinity;
 const s = Math.sqrt(disc);
 for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
  if (t < 0) continue;
  const y = o.y + d.y * t;
  if (y >= y0 && y <= y1) return t;
 }
 // Through the top cap (a shot coming down on a head).
 if (d.y < 0) {const t = (y1 - o.y) / d.y, x = o.x + d.x * t - cx, z = o.z + d.z * t - cz; if (t >= 0 && x * x + z * z <= r * r) return t;}
 return Infinity;
}

/** Distance along a ray to a car's box (centre x,z on the ground, yaw `heading`), or Infinity. */
function rayCarBox(o, d, car, dims) {
 const h = car.heading ?? 0, s = Math.sin(h), c = Math.cos(h);
 // Into the car's frame: +z along its heading, +x across it.
 const px = o.x - car.x, pz = o.z - car.z, py = o.y - (car.y ?? 0);
 const lx = px * c - pz * s, lz = px * s + pz * c;
 const dx = d.x * c - d.z * s, dz = d.x * s + d.z * c;
 const half = [dims.width / 2, dims.height / 2, dims.length / 2], lo = [lx, py - dims.height / 2, lz], dir = [dx, d.y, dz];
 let t0 = 0, t1 = Infinity;
 for (let k = 0; k < 3; k++) {
  if (Math.abs(dir[k]) < 1e-9) {if (Math.abs(lo[k]) > half[k]) return Infinity; continue;}
  let a = (-half[k] - lo[k]) / dir[k], b = (half[k] - lo[k]) / dir[k];
  if (a > b) [a, b] = [b, a];
  t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  if (t0 > t1) return Infinity;
 }
 return t0;
}

/**
 * Is there a clear line between two points over the solid grid (R9)? Heights are ignored: a
 * building blocks sight at any height, which is what a 2D footprint can say. `skipStart` /
 * `skipEnd` metres at each end are not tested, so someone standing against a wall can still see
 * and be seen.
 */
export function lineOfSight(solid, a, b, {step = .5, skipStart = .4, skipEnd = .4} = {}) {
 const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
 if (d <= skipStart + skipEnd) return true;
 for (let t = skipStart; t <= d - skipEnd; t += step) if (solid(a.x + dx * t / d, a.z + dz * t / d)) return false;
 return true;
}

/**
 * One shot. `from` {x,y,z} is the muzzle, `dir` {x,y,z} the aim (normalised here), `range` in
 * metres. `solid(x,z)` is the wall test; `ground(x,z)` the ground height (optional); `cars` a list
 * of {x,z,heading,type} with `dimsOf(car)` giving {width,length,height}; `people` a list of
 * {x,z,y?,height?} (with `height` the person's height, 1.76 if absent), or anything `bodyOf(p)`
 * turns into {y, height} (the crowd's pedestrians keep their ground height in `height`, so the
 * scene passes a `bodyOf`). `skip(p)` leaves someone out (the shooter).
 *
 * Returns {kind: 'none'|'wall'|'ground'|'car'|'person', distance, point, target, zone}, where
 * zone is 'head' or 'body' for a person (and `part` 'head', 'body' or 'legs', for the reaction).
 * @param {any} options
 * @returns {{kind:string, distance:number, target:any, zone:string|null, point:{x:number,y:number,z:number}, dir:{x:number,y:number,z:number}}}
 */
export function castShot({from, dir, range = 60, solid = () => false, ground = null, cars = [], dimsOf = () => null,
                          people = [], skip = null, bodyOf = null}) {
 const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
 const d = {x: dir.x / len, y: dir.y / len, z: dir.z / len};
 /** @type {any} */
 let best = {kind: 'none', distance: range, target: null, zone: null};

 // Walls and the ground: march, then bisect to the surface.
 const flat = Math.hypot(d.x, d.z);
 const blocked = t => {
  const x = from.x + d.x * t, z = from.z + d.z * t, y = from.y + d.y * t;
  if (flat > 1e-6 && solid(x, z)) return 'wall';
  if (ground && y < ground(x, z)) return 'ground';
  return null;
 };
 for (let t = BALLISTICS.step; t <= range; t += BALLISTICS.step) {
  const what = blocked(t);
  if (!what) continue;
  let lo = t - BALLISTICS.step, hi = t;
  for (let i = 0; i < BALLISTICS.refine; i++) {const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m;}
  best = {kind: what, distance: hi, target: null, zone: null};
  break;
 }

 for (const car of cars) {
  const dims = dimsOf(car); if (!dims) continue;
  // Cheap reject: the car's bounding circle against the segment so far.
  const cx = car.x - from.x, cz = car.z - from.z, along = cx * d.x + cz * d.z;
  const reach = Math.hypot(dims.width, dims.length) / 2 + .1;
  if (along < -reach || along > best.distance / Math.max(flat, 1e-6) + reach) continue;
  if (Math.abs(cx * d.z - cz * d.x) / Math.max(flat, 1e-6) > reach) continue;
  const t = rayCarBox(from, d, car, {width: dims.width, length: dims.length, height: dims.height ?? BALLISTICS.carHeight});
  if (t < best.distance) best = {kind: 'car', distance: t, target: car, zone: null};
 }

 for (const p of people) {
  if (skip?.(p)) continue;
  const b = bodyOf ? bodyOf(p) : p, h = b.height ?? BALLISTICS.bodyHeight, y0 = b.y ?? 0;
  const t = rayCylinder(from, d, p.x, p.z, BALLISTICS.bodyRadius, y0, y0 + h);
  if (t < best.distance) {
   const y = from.y + d.y * t - y0;
   const zone = y >= BALLISTICS.headHeight * h / BALLISTICS.bodyHeight ? 'head' : 'body';
   // §9ai: where on the body, for the reaction only (damage goes by `zone`): below the hips is legs.
   best = {kind: 'person', distance: t, target: p, zone, part: zone === 'head' ? 'head' : y < BALLISTICS.legsHeight * h / BALLISTICS.bodyHeight ? 'legs' : 'body'};
  }
 }
 const t = best.distance;
 best.point = {x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t};
 best.dir = d;
 return best;
}

/**
 * The people near a ray, from the crowd's own 2 m grid (`grid` is a Map of "i,j" -> people), so a
 * shot tests tens of bodies rather than the whole city. Cells are gathered in a 3-wide band.
 */
export function peopleAlong(grid, from, dir, range, cell = 2) {
 const out = new Set(), flat = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / flat, dz = dir.z / flat;
 const reach = range * flat / Math.hypot(dir.x, dir.y, dir.z);
 for (let t = 0; t <= reach + cell; t += cell * .75) {
  const ix = Math.floor((from.x + dx * t) / cell), iz = Math.floor((from.z + dz * t) / cell);
  for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++)
   for (const p of grid?.get(i + ',' + j) ?? []) out.add(p);
 }
 return [...out];
}
