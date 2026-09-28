// Roadmap stage 6: what a car looks like after it has been in a fight.
//
// Two halves. The WEAR is data on the traffic slot (`slot.wear`), so it goes with the car: the
// player can shoot a parked car's windows, get in, and see them; a car that is despawned and
// re-used is a new car and starts clean (the pool's spawns set `wear: null`). The VISUAL is the
// player's close-range model only (vehicle-visual.mjs): its paint is pushed in round each dent and
// its glass is split by pane, so a pane can be whole, cracked or gone. Traffic cars are drawn as
// batches and are not deformed; a pane shot out of one scatters glass all the same.
//
// Frames: `local` is the car's own, +z along its heading and +x across it, the same frame the
// ballistics' box test uses and the one three.js puts a mesh in under `rotation.y = heading`.

import {BufferAttribute, DataTexture, DoubleSide, Matrix4, Mesh, MeshStandardMaterial, RepeatWrapping,
 SRGBColorSpace, Vector3} from 'three';

export const WEAR = Object.freeze({
 maxDents: 24,
 merge: .3,                // m: a hit this close to an old dent deepens it rather than adding one
 depthPerSpeed: .011,      // m of dent per m/s of speed the hit took away
 maxDepth: .17,            // m, one dent at most
 radius: [.38, .95],       // m, a light knock to a big one
 bullet: Object.freeze({depth: .018, radius: .1}),
 // m/s taken off in one hit that cracks the pane on that side, and that breaks it.
 crack: 7, shatter: 13,
 // A person hit at this closing speed goes over the bonnet into the windscreen.
 personCrack: 9, personShatter: 15,
 beltline: .55             // share of the body's height above which a round meets glass
});

export const PANES = Object.freeze(['front', 'rear', 'left', 'right']);

/** A clean car. */
export function createWear() {return {dents: [], panes: {front: 0, rear: 0, left: 0, right: 0}, seq: 0};}

/** The slot's wear, made on first use. */
export function wearOf(slot) {return slot.wear ??= createWear();}

/** A world point into the car's frame. Pure. */
export function toLocal(car, x, z, y = 0) {
 const s = Math.sin(car.heading ?? 0), c = Math.cos(car.heading ?? 0), px = x - car.x, pz = z - car.z;
 return {x: px * c - pz * s, y: y - (car.y ?? 0), z: px * s + pz * c};
}
/** A world direction into the car's frame. Pure. */
export function dirToLocal(car, x, z) {
 const s = Math.sin(car.heading ?? 0), c = Math.cos(car.heading ?? 0);
 return {x: x * c - z * s, z: x * s + z * c};
}

/** Which pane faces a car-local horizontal direction (pointing out of the car). Pure. */
export function paneFacing(dx, dz, dims) {
 // Measured against the body's proportions, so a hit on a long car's flank is a side window.
 // +x is the car's left (the driver's side, the right, is -x, as the anchors have it).
 const ax = Math.abs(dx) / (dims.width / 2), az = Math.abs(dz) / (dims.length / 2);
 if (az >= ax) return dz >= 0 ? 'front' : 'rear';
 return dx >= 0 ? 'left' : 'right';
}

const bump = (wear, pane, to) => {
 const was = wear.panes[pane], now = Math.max(was, Math.min(2, to));
 wear.panes[pane] = now;
 return now > was ? (now === 2 ? 'shatter' : 'crack') : null;
};

function addDent(wear, dent) {
 const near = wear.dents.find(d => Math.hypot(d.x - dent.x, d.y - dent.y, d.z - dent.z) < WEAR.merge);
 if (near) {
  near.depth = Math.min(WEAR.maxDepth, near.depth + dent.depth * .7);
  near.r = Math.min(WEAR.radius[1], Math.max(near.r, dent.r));
 } else {
  wear.dents.push(dent);
  if (wear.dents.length > WEAR.maxDents) {
   // Keep the deepest: dropping a big dent for a scratch would un-crumple the car.
   wear.dents.sort((a, b) => b.depth - a.depth); wear.dents.length = WEAR.maxDents;
  }
 }
}

/**
 * A crash. `car` {x,z,y,heading}, `dims` {width,length,height}, `contact` {nx,nz} the contact's
 * normal (pointing from the obstacle into the car, as vehicle-contact gives it), `lost` the speed
 * the hit took away, m/s. Returns {dent, pane, glass} (glass: null|'crack'|'shatter').
 */
export function crash(wear, car, dims, contact, lost) {
 if (!(lost > 1)) return null;
 // Where the body meets the obstacle: out from the centre against the normal, to the box's skin.
 const d = dirToLocal(car, -contact.nx, -contact.nz), l = Math.hypot(d.x, d.z) || 1;
 const dx = d.x / l, dz = d.z / l;
 const t = Math.min(Math.abs(dx) > 1e-6 ? dims.width / 2 / Math.abs(dx) : Infinity, Math.abs(dz) > 1e-6 ? dims.length / 2 / Math.abs(dz) : Infinity);
 const k = Math.min(1, (lost - 1) / 14);
 const dent = {x: dx * t, y: Math.min(dims.height * .42, .62), z: dz * t, dx: -dx, dy: -.12, dz: -dz,
  depth: Math.min(WEAR.maxDepth, lost * WEAR.depthPerSpeed), r: WEAR.radius[0] + (WEAR.radius[1] - WEAR.radius[0]) * k};
 addDent(wear, dent);
 // A bike has no glass (stage 6 integration): only the dent.
 const pane = dims.twoWheel ? null : paneFacing(dx, dz, dims);
 const glass = !pane ? null : lost >= WEAR.shatter ? bump(wear, pane, 2) : lost >= WEAR.crack ? bump(wear, pane, 1) : null;
 wear.seq++;
 return {dent, pane, glass};
}

/**
 * A round into the car. `point` {x,y,z} where it met the box, `dir` {x,y,z} its travel. Above the
 * beltline it meets glass (the first round cracks a pane, the next takes it out); below, it leaves
 * a small dent. Returns {kind: 'glass'|'dent', pane, glass}.
 */
export function shot(wear, car, dims, point, dir) {
 const p = toLocal(car, point.x, point.z, point.y);
 const d = dirToLocal(car, dir.x, dir.z);
 if (!dims.twoWheel && p.y > dims.height * WEAR.beltline) {
  // The pane it came in through faces back along the round.
  const pane = paneFacing(-d.x, -d.z, dims);
  const glass = bump(wear, pane, wear.panes[pane] + 1);
  wear.seq++;
  return {kind: 'glass', pane, glass};
 }
 const l = Math.hypot(d.x, d.z) || 1;
 addDent(wear, {x: p.x, y: p.y, z: p.z, dx: d.x / l, dy: 0, dz: d.z / l, depth: WEAR.bullet.depth, r: WEAR.bullet.radius});
 wear.seq++;
 return {kind: 'dent', pane: null, glass: null};
}

/** A person thrown onto the bonnet: the windscreen takes it. Returns null|'crack'|'shatter'. */
export function personStrike(wear, closing) {
 if (closing < WEAR.personCrack) return null;
 const r = bump(wear, 'front', closing >= WEAR.personShatter ? 2 : 1);
 addDent(wear, {x: 0, y: .9, z: .9, dx: 0, dy: -1, dz: -.2, depth: Math.min(WEAR.maxDepth, closing * .006), r: .5});
 wear.seq++;
 return r;
}

/** How bent the car is, 0..1, from its dents (for diagnostics and the repair price). Pure. */
export function wearLevel(wear) {
 if (!wear) return 0;
 const dents = wear.dents.reduce((s, d) => s + d.depth * d.r, 0);
 const glass = PANES.reduce((s, p) => s + wear.panes[p], 0) / 8;
 return Math.min(1, dents / .5 + glass * .3);
}

/**
 * Push `base` positions (a Float32Array of xyz in the frame the dents are in, after `toFrame`)
 * into `out` round every dent. Smooth falloff, and a crumple term so a big dent creases instead
 * of looking pressed in by a ball. Pure.
 */
export function deform(base, out, dents) {
 out.set(base);
 if (!dents.length) return out;
 for (let i = 0; i < base.length; i += 3) {
  const x = base[i], y = base[i + 1], z = base[i + 2];
  let ox = 0, oy = 0, oz = 0;
  for (const d of dents) {
   const dist = Math.hypot(x - d.x, y - d.y, z - d.z);
   if (dist >= d.r) continue;
   const u = 1 - (dist / d.r) ** 2, w = u * u;
   const crumple = 1 + .45 * Math.sin(x * 23.1 + y * 17.3 + z * 19.7) * Math.min(1, d.depth / .08);
   const k = d.depth * w * crumple;
   ox += d.dx * k; oy += d.dy * k; oz += d.dz * k;
  }
  out[i] += ox; out[i + 1] += oy; out[i + 2] += oz;
 }
 return out;
}

/** The pane each triangle of a glass geometry belongs to, from its normal. Pure. */
export function paneOfTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
 const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
 const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
 const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
 // A roof-ward face (mostly up) goes with whichever way it leans; its centre breaks a tie.
 const hx = Math.abs(nx) > 1e-9 ? nx : mx, hz = Math.abs(nz) > 1e-9 ? nz : mz;
 if (Math.abs(hz) >= Math.abs(hx)) return hz >= 0 ? 'front' : 'rear';
 return hx >= 0 ? 'left' : 'right';
}

/** A crazed-glass texture: radial cracks from a few strikes, rings round them. Built once. */
let crackTexture = null;
export function crackMap(size = 256) {
 if (crackTexture) return crackTexture;
 const px = new Uint8Array(size * size * 4);
 let seed = 99991;
 const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
 const plot = (x, y, a) => {
  const ix = ((Math.round(x) % size) + size) % size, iy = ((Math.round(y) % size) + size) % size, o = (iy * size + ix) * 4;
  px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = Math.max(px[o + 3], a);
 };
 for (let s = 0; s < 3; s++) {
  const cx = rnd() * size, cy = rnd() * size;
  for (let r = 0; r < 14; r++) {            // radial cracks, wandering
   let a = r / 14 * Math.PI * 2 + rnd() * .3, x = cx, y = cy;
   const len = size * (.25 + rnd() * .35);
   for (let t = 0; t < len; t++) {a += (rnd() - .5) * .18; x += Math.cos(a); y += Math.sin(a); plot(x, y, 235 - t / len * 120);}
  }
  for (let ring = 1; ring <= 4; ring++) {    // the rings between them
   const rr = ring * size * .045 * (1 + rnd() * .3);
   for (let t = 0; t < rr * 6.3; t++) {const a = t / rr; plot(cx + Math.cos(a) * rr * (1 + .08 * Math.sin(a * 7)), cy + Math.sin(a) * rr, 150);}
  }
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y < 25) plot(cx + x, cy + y, 250);   // the strike
 }
 crackTexture = new DataTexture(px, size, size);
 crackTexture.wrapS = crackTexture.wrapT = RepeatWrapping; crackTexture.colorSpace = SRGBColorSpace;
 crackTexture.needsUpdate = true;
 return crackTexture;
}

/** A car with nothing wrong with it, for a slot whose wear was cleared (a repair). */
const CLEAN = Object.freeze({dents: Object.freeze([]), panes: Object.freeze({front: 0, rear: 0, left: 0, right: 0}), seq: 0});

const inverse = new Matrix4(), rel = new Matrix4(), v = new Vector3();

/**
 * The close-range model's damage. `attach(asset)` once per model (clones the paint and glass it
 * will change); `apply(wear)` when `wear.seq` moves on. `onShatter(pane, points)` is called with
 * a few world-ish points of a pane that has just gone, for the shards.
 */
export function createDamageVisual() {
 let asset = null, seq = -1, last = null, paint = [], glass = null, cracked = null, crackMaterial = null;
 const panesSeen = {front: 0, rear: 0, left: 0, right: 0};

 const detach = () => {
  for (const p of paint) {p.mesh.geometry.dispose(); p.mesh.geometry = p.original;}
  if (glass) {glass.mesh.geometry.dispose(); glass.mesh.geometry = glass.original;}
  cracked?.removeFromParent(); cracked?.geometry.dispose(); crackMaterial?.dispose();
  paint = []; glass = null; cracked = null; crackMaterial = null; asset = null; seq = -1; last = null;
  for (const p of PANES) panesSeen[p] = 0;
 };

 return {
  get attached() {return !!asset;},
  attach(next) {
   detach(); if (!next) return;
   asset = next;
   // The body's lean is applied per frame; measure the meshes with it level.
   const body = asset.body, saved = body.rotation.clone();
   body.rotation.set(0, 0, 0); asset.root.updateMatrixWorld(true);
   inverse.copy(asset.root.matrixWorld).invert();
   asset.root.traverse(o => {
    if (!o.isMesh) return;
    rel.multiplyMatrices(inverse, o.matrixWorld);
    // Wheels turn and are left alone; the paint shell and door panels dent, the glass breaks.
    if (o.name === 'vehicle-glass' && !glass) {
     const original = o.geometry, g = original.index ? original.toNonIndexed() : original.clone();
     const pos = g.attributes.position.array, rootPos = new Float32Array(pos.length);
     for (let i = 0; i < pos.length; i += 3) {v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(rel); rootPos.set([v.x, v.y, v.z], i);}
     const tris = pos.length / 9, pane = new Array(tris);
     for (let t = 0; t < tris; t++) {const o9 = t * 9; pane[t] = paneOfTriangle(...rootPos.subarray(o9, o9 + 9));}
     o.geometry = g;
     glass = {mesh: o, original, base: pos.slice(), pane, rootPos};
     // The cracked panes: the same triangles, drawn with the crazed texture, box-mapped per pane.
     const cg = g.clone(), uv = new Float32Array(tris * 6);
     for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
      const i = t * 9 + k * 3, side = pane[t] === 'left' || pane[t] === 'right';
      uv[t * 6 + k * 2] = (side ? rootPos[i + 2] : rootPos[i]) * .9; uv[t * 6 + k * 2 + 1] = rootPos[i + 1] * .9;
     }
     cg.setAttribute('uv', new BufferAttribute(uv, 2));
     crackMaterial = new MeshStandardMaterial({color: 0xe6eef2, map: crackMap(), transparent: true, opacity: .9,
      roughness: .35, metalness: 0, side: DoubleSide, depthWrite: false, alphaTest: .02});
     crackMaterial.map.repeat?.set(1, 1);
     cracked = new Mesh(cg, crackMaterial); cracked.name = 'vehicle-glass-cracked'; cracked.renderOrder = 3;
     cracked.frustumCulled = false; o.parent.add(cracked); cracked.position.copy(o.position); cracked.quaternion.copy(o.quaternion); cracked.scale.copy(o.scale);
     // Start with every triangle collapsed: nothing is cracked yet.
     glass.crackBase = cg.attributes.position.array.slice();
     cg.attributes.position.array.fill(0); cg.attributes.position.needsUpdate = true;
     return;
    }
    if (o.material !== asset.materials?.[0] && o.name !== 'vehicle-paint') return;
    if (o.material?.name === 'vehicle-glass-cracked') return;
    const original = o.geometry, g = original.clone(), pos = g.attributes.position.array;
    // Dents are authored in the car's frame; bring them into this mesh's by the inverse.
    const toMesh = rel.clone().invert(), fromMesh = rel.clone();
    o.geometry = g;
    paint.push({mesh: o, original, base: pos.slice(), toMesh, fromMesh, scratch: new Float32Array(pos.length)});
   });
   body.rotation.copy(saved); asset.root.updateMatrixWorld(true);
  },
  /** Bring the model up to `wear`. Returns the panes that have just shattered. */
  apply(wear) {
   wear ??= CLEAN;
   if (!asset || (wear === last && wear.seq === seq)) return [];
   seq = wear.seq; last = wear;
   for (const p of paint) {
    // Dents into this mesh's frame (points and directions), then deform.
    const local = wear.dents.map(d => {
     const at = v.set(d.x, d.y, d.z).applyMatrix4(p.toMesh).clone();
     const tip = v.set(d.x + d.dx, d.y + d.dy, d.z + d.dz).applyMatrix4(p.toMesh);
     return {x: at.x, y: at.y, z: at.z, dx: tip.x - at.x, dy: tip.y - at.y, dz: tip.z - at.z, depth: d.depth, r: d.r};
    });
    const pos = p.mesh.geometry.attributes.position;
    deform(p.base, pos.array, local);
    pos.needsUpdate = true; p.mesh.geometry.computeVertexNormals();
   }
   const shattered = [];
   if (glass) {
    const pos = glass.mesh.geometry.attributes.position, cpos = cracked.geometry.attributes.position;
    for (let t = 0; t < glass.pane.length; t++) {
     const state = wear.panes[glass.pane[t]] ?? 0, o = t * 9;
     for (let k = 0; k < 9; k++) {
      pos.array[o + k] = state === 0 ? glass.base[o + k] : 0;
      cpos.array[o + k] = state === 1 ? glass.crackBase[o + k] : 0;
     }
    }
    pos.needsUpdate = true; cpos.needsUpdate = true;
    for (const pane of PANES) {
     if (wear.panes[pane] === 2 && panesSeen[pane] < 2) {
      const pts = [];
      for (let t = 0; t < glass.pane.length && pts.length < 12; t += 3) if (glass.pane[t] === pane) pts.push(glass.rootPos.slice(t * 9, t * 9 + 3));
      shattered.push({pane, points: pts});
     }
     panesSeen[pane] = wear.panes[pane];
    }
   }
   return shattered;
  },
  inspect() {return {paintMeshes: paint.length, glassTriangles: glass?.pane.length ?? 0, seq,
   panes: glass ? PANES.map(p => [p, glass.pane.filter(q => q === p).length]) : []};},
  dispose: detach
 };
}
