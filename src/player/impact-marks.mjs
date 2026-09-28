// What a gunfight leaves behind (roadmap stage 1): bullet holes in walls and the ground, spent
// casings that bounce and lie in the street, the smoke off a muzzle, a dropped magazine, and a
// pool of blood that spreads under a body.
//
// All of it bounded: fixed pools, oldest replaced first, and each kind one draw call (instanced
// meshes and one Points), none while it has nothing live. Textures are generated here as data,
// not drawn on a canvas, so the module builds in a test without a DOM.
import {BufferAttribute,BufferGeometry,CylinderGeometry,DataTexture,DynamicDrawUsage,Group,InstancedMesh,
 Euler,Matrix4,MeshBasicMaterial,MeshStandardMaterial,NormalBlending,PlaneGeometry,Points,PointsMaterial,Quaternion,
 RGBAFormat,Vector3,LinearFilter} from 'three';
import {weaponGeometry,weaponMaterial} from './weapon-mesh.mjs';

export const MARKS = Object.freeze({
 holes: 64, holeSize: [.055, .085], holeLife: 90,          // s before a hole fades
 casings: 40, casingLife: 14, restitution: .35, friction: .55,
 mags: 4, magLife: 30,
 smoke: 48, smokeLife: [.7, 1.3], smokeRise: .35,
 pools: 12, poolRadius: [.45, .8], poolGrow: 9, poolLife: 120, poolDelay: 1.1,
 gravity: 9.8
});

const rand = (() => {let s = 0x1b873593; return () => ((s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) ^ 0x27d4eb2d) >>> 0) / 4294967296;})();

/** A generated RGBA texture: `f(u, v)` in -1..1 returns [r, g, b, a] in 0..1. */
function texture(size, f) {
 const data = new Uint8Array(size * size * 4);
 for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const c = f(i / (size - 1) * 2 - 1, j / (size - 1) * 2 - 1), o = (j * size + i) * 4;
  for (let k = 0; k < 4; k++) data[o + k] = Math.round(Math.max(0, Math.min(1, c[k])) * 255);
 }
 const t = new DataTexture(data, size, size, RGBAFormat);
 t.magFilter = t.minFilter = LinearFilter; t.needsUpdate = true;
 return t;
}
// A few fixed ripples make an edge irregular without noise tables.
const wobble = (a, seed) => .08 * Math.sin(a * 5 + seed) + .05 * Math.sin(a * 9 + seed * 2.3) + .04 * Math.sin(a * 14 + seed * .7);
const HOLE = () => texture(64, (u, v) => {
 const r = Math.hypot(u, v), a = Math.atan2(v, u), edge = .92 + wobble(a, 1.3);
 if (r < .22) return [.03, .03, .03, 1];                                     // the hole
 if (r < .38) return [.12, .11, .1, .95];                                    // scorched rim
 const crack = Math.max(0, Math.cos(a * 7 + 1) ** 24) * (r < edge ? 1 : 0);  // radial cracks
 const chip = r < edge * .8 ? .55 * (1 - (r - .38) / (edge * .8 - .38)) : 0; // chipped render
 return [.32, .3, .28, Math.max(chip, crack * .7 * (1 - r))];
});
// A pool is nearly black-red where it is deep and thins to a lighter rim; its edge is lobed, not
// spiky (blood spreads round the unevenness of the pavement, it does not splash).
const POOL = () => texture(64, (u, v) => {
 const r = Math.hypot(u, v), a = Math.atan2(v, u), edge = .84 + .07 * Math.sin(a * 3 + 1.2) + .05 * Math.sin(a * 5 + 4.1) + .025 * Math.sin(a * 9);
 if (r > edge) return [0, 0, 0, 0];
 const k = Math.min(1, (edge - r) / .06), rim = Math.max(0, 1 - (edge - r) / .18);
 return [.13 + .1 * rim, .006, .01, (.88 + .1 * (1 - rim)) * k];
});
const PUFF = () => texture(32, (u, v) => {const r = Math.hypot(u, v); const a = Math.max(0, 1 - r) ** 2; return [1, 1, 1, a];});

const hide = new Matrix4().makeScale(0, 0, 0);

/**
 * The surface normal where a round met a wall: the directions around the point that are open
 * air, averaged. `solid(x, z)` is the collision query; falls back to against the round.
 */
export function wallNormal(point, dir, solid, out = {x: 0, y: 0, z: 0}) {
 let nx = 0, nz = 0;
 const bx = point.x - dir.x * .04, bz = point.z - dir.z * .04;
 for (let k = 0; k < 8; k++) {
  const a = k * Math.PI / 4, x = Math.cos(a), z = Math.sin(a);
  if (!solid(bx + x * .25, bz + z * .25)) {nx += x; nz += z;}
 }
 const l = Math.hypot(nx, nz);
 if (l < .3) {const f = Math.hypot(dir.x, dir.z) || 1; nx = -dir.x / f; nz = -dir.z / f;} else {nx /= l; nz /= l;}
 out.x = nx; out.y = 0; out.z = nz;
 return out;
}

export function createImpactMarks() {
 const root = new Group(); root.name = 'impact-marks';
 const e = new Euler(), m = new Matrix4(), q = new Quaternion(), v = new Vector3(), s = new Vector3(), n = new Vector3(), up = new Vector3(0, 1, 0), z = new Vector3(0, 0, 1);
 const holeTex = HOLE(), poolTex = POOL(), puffTex = PUFF();
 const instanced = (geometry, material, count, name) => {
  const mesh = new InstancedMesh(geometry, material, count); mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hide);
  root.add(mesh); return mesh;
 };
 // --- holes ------------------------------------------------------------------------------------
 const holes = instanced(new PlaneGeometry(1, 1), new MeshBasicMaterial({map: holeTex, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4}), MARKS.holes, 'bullet-holes');
 const holeAge = new Float32Array(MARKS.holes).fill(-1);
 let holeCursor = 0;
 // --- casings and magazines ----------------------------------------------------------------------
 const brass = new MeshStandardMaterial({name: 'casing', color: 0xb8893a, metalness: .85, roughness: .3});
 const casings = instanced(new CylinderGeometry(.0045, .0045, .02, 6), brass, MARKS.casings, 'casings');
 const C = MARKS.casings, cp = new Float32Array(C * 3), cv = new Float32Array(C * 3), ca = new Float32Array(C * 3), cw = new Float32Array(C * 3), clife = new Float32Array(C), crest = new Uint8Array(C);
 let casingCursor = 0;
 const mags = instanced(weaponGeometry('smgMag'), weaponMaterial(), MARKS.mags, 'dropped-mags');
 const M = MARKS.mags, mp = new Float32Array(M * 3), mv = new Float32Array(M * 3), mlife = new Float32Array(M), mrest = new Uint8Array(M), myaw = new Float32Array(M), mtilt = new Float32Array(M);
 let magCursor = 0;
 // --- smoke --------------------------------------------------------------------------------------
 const S = MARKS.smoke, spos = new Float32Array(S * 3), scol = new Float32Array(S * 4), svel = new Float32Array(S * 3), slife = new Float32Array(S), sfull = new Float32Array(S);
 const smokeGeometry = new BufferGeometry();
 smokeGeometry.setAttribute('position', new BufferAttribute(spos, 3));
 smokeGeometry.setAttribute('color', new BufferAttribute(scol, 4));
 const smoke = new Points(smokeGeometry, new PointsMaterial({size: .2, map: puffTex, vertexColors: true, transparent: true,
  depthWrite: false, blending: NormalBlending}));
 smoke.frustumCulled = false; smoke.visible = false; smoke.name = 'muzzle-smoke'; root.add(smoke);
 for (let i = 0; i < S; i++) spos[i * 3 + 1] = -1e4;
 let smokeCursor = 0;
 // --- blood pools --------------------------------------------------------------------------------
 const pools = instanced(new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new MeshStandardMaterial({name: 'blood-pool', map: poolTex,
  transparent: true, depthWrite: false, roughness: .08, metalness: .1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3}),
  MARKS.pools, 'blood-pools');
 const P = MARKS.pools, pp = new Float32Array(P * 3), page = new Float32Array(P), pon = new Uint8Array(P), prad = new Float32Array(P), pyaw = new Float32Array(P);
 let poolCursor = 0;
 const stats = {holes: 0, casings: 0, mags: 0, smoke: 0, pools: 0};

 const used = (mesh, live) => {mesh.count = live ? mesh.instanceMatrix.count : 0; mesh.instanceMatrix.needsUpdate = true;};

 return {
  root,
  get stats() {return {...stats};},
  /** Live counts now (for tests and the perf panel). */
  get live() {return {holes: holeAge.filter(a => a >= 0).length, casings: clife.filter(l => l > 0).length,
   mags: mlife.filter(l => l > 0).length, pools: pon.reduce((a, b) => a + b, 0), smoke: slife.filter(l => l > 0).length};},
  /** A hole where a round stopped: `normal` out of the surface (up for the ground). */
  hole(point, normal) {
   const i = holeCursor; holeCursor = (holeCursor + 1) % MARKS.holes;
   n.set(normal.x, normal.y, normal.z).normalize();
   q.setFromUnitVectors(z, n);
   q.multiply(new Quaternion().setFromAxisAngle(z, rand() * Math.PI * 2));
   const size = MARKS.holeSize[0] + rand() * (MARKS.holeSize[1] - MARKS.holeSize[0]);
   v.set(point.x + n.x * .012, point.y + n.y * .012, point.z + n.z * .012);
   holes.setMatrixAt(i, m.compose(v, q, s.set(size, size, size)));
   holeAge[i] = 0; stats.holes++; used(holes, true);
  },
  /**
   * A spent casing out of the ejection port: `from` the port, `dir` the barrel, thrown to the
   * gun's right and up. `onLand(x, y, z)` is told the first time it hits the ground (the tink).
   */
  casing(from, dir) {
   const i = casingCursor; casingCursor = (casingCursor + 1) % C;
   const f = Math.hypot(dir.x, dir.z) || 1, rx = -dir.z / f, rz = dir.x / f;   // the gun's right
   const out = 1.6 + rand() * .8, lift = 1.4 + rand() * .7, back = .3 + rand() * .3;
   cp[i * 3] = from.x; cp[i * 3 + 1] = from.y; cp[i * 3 + 2] = from.z;
   cv[i * 3] = rx * out - dir.x / f * back; cv[i * 3 + 1] = lift; cv[i * 3 + 2] = rz * out - dir.z / f * back;
   ca[i * 3] = rand() * 6; ca[i * 3 + 1] = rand() * 6; ca[i * 3 + 2] = rand() * 6;
   cw[i * 3] = (rand() - .5) * 40; cw[i * 3 + 1] = (rand() - .5) * 20; cw[i * 3 + 2] = (rand() - .5) * 40;
   clife[i] = MARKS.casingLife; crest[i] = 0; stats.casings++; used(casings, true);
  },
  /** A magazine let go at `at` (world): it falls and lies there. */
  magazine(at) {
   const i = magCursor; magCursor = (magCursor + 1) % M;
   mp[i * 3] = at.x; mp[i * 3 + 1] = at.y; mp[i * 3 + 2] = at.z;
   mv[i * 3] = (rand() - .5) * .3; mv[i * 3 + 1] = -.3; mv[i * 3 + 2] = (rand() - .5) * .3;
   myaw[i] = rand() * Math.PI * 2; mtilt[i] = 0; mlife[i] = MARKS.magLife; mrest[i] = 0; stats.mags++; used(mags, true);
  },
  /** Smoke off the muzzle after a shot, drifting forward a little and rising. */
  smoke(at, dir, count = 3) {
   for (let k = 0; k < count; k++) {
    const i = smokeCursor; smokeCursor = (smokeCursor + 1) % S;
    spos[i * 3] = at.x + dir.x * .04 * k; spos[i * 3 + 1] = at.y + dir.y * .04 * k; spos[i * 3 + 2] = at.z + dir.z * .04 * k;
    svel[i * 3] = dir.x * (.5 + rand() * .4) + (rand() - .5) * .15; svel[i * 3 + 1] = MARKS.smokeRise * (.6 + rand() * .8);
    svel[i * 3 + 2] = dir.z * (.5 + rand() * .4) + (rand() - .5) * .15;
    sfull[i] = slife[i] = MARKS.smokeLife[0] + rand() * (MARKS.smokeLife[1] - MARKS.smokeLife[0]);
   }
   stats.smoke += count; smoke.visible = true;
  },
  /** A pool of blood that spreads under a body lying at `x, y, z` (after it has fallen). */
  pool(x, y, z) {
   const i = poolCursor; poolCursor = (poolCursor + 1) % P;
   pp[i * 3] = x; pp[i * 3 + 1] = y + .015; pp[i * 3 + 2] = z;
   page[i] = -MARKS.poolDelay; pon[i] = 1; prad[i] = MARKS.poolRadius[0] + rand() * (MARKS.poolRadius[1] - MARKS.poolRadius[0]); pyaw[i] = rand() * Math.PI * 2;
   pools.setMatrixAt(i, hide); stats.pools++; used(pools, true);
  },
  /**
   * One frame. `ground(x, z)` is the height of what a casing lands on; `onLand(x, y, z, kind)` is
   * told when a casing or a magazine first strikes it.
   */
  update(dt, {ground = () => 0, onLand = null} = {}) {
   dt = Math.max(0, Math.min(.1, dt || 0));
   let liveHoles = 0;
   for (let i = 0; i < MARKS.holes; i++) {
    if (holeAge[i] < 0) continue;
    holeAge[i] += dt;
    if (holeAge[i] > MARKS.holeLife) {holeAge[i] = -1; holes.setMatrixAt(i, hide); holes.instanceMatrix.needsUpdate = true; continue;}
    liveHoles++;
   }
   if (!liveHoles && holes.count) used(holes, false);
   let liveCasings = 0;
   for (let i = 0; i < C; i++) {
    if (clife[i] <= 0) continue;
    clife[i] -= dt;
    if (clife[i] <= 0) {casings.setMatrixAt(i, hide); continue;}
    liveCasings++;
    const o = i * 3;
    if (!crest[i]) {
     cv[o + 1] -= MARKS.gravity * dt;
     cp[o] += cv[o] * dt; cp[o + 1] += cv[o + 1] * dt; cp[o + 2] += cv[o + 2] * dt;
     ca[o] += cw[o] * dt; ca[o + 1] += cw[o + 1] * dt; ca[o + 2] += cw[o + 2] * dt;
     const g = ground(cp[o], cp[o + 2]) + .0045;
     if (cp[o + 1] < g) {
      cp[o + 1] = g;
      if (cv[o + 1] < -.6) onLand?.(cp[o], g, cp[o + 2], 'casing');
      cv[o + 1] = -cv[o + 1] * MARKS.restitution; cv[o] *= MARKS.friction; cv[o + 2] *= MARKS.friction;
      cw[o] *= .5; cw[o + 1] *= .7; cw[o + 2] *= .5;
      // Lying down: a cylinder rests on its side.
      if (Math.abs(cv[o + 1]) < .35) {crest[i] = 1; ca[o] = Math.PI / 2; ca[o + 2] = 0;}
     }
    }
    q.setFromEuler(e.set(ca[o], ca[o + 1], ca[o + 2], 'XYZ'));
    casings.setMatrixAt(i, m.compose(v.set(cp[o], cp[o + 1], cp[o + 2]), q, s.set(1, 1, 1)));
   }
   casings.instanceMatrix.needsUpdate = true;
   if (!liveCasings && casings.count) used(casings, false);
   let liveMags = 0;
   for (let i = 0; i < M; i++) {
    if (mlife[i] <= 0) continue;
    mlife[i] -= dt;
    if (mlife[i] <= 0) {mags.setMatrixAt(i, hide); continue;}
    liveMags++;
    const o = i * 3;
    if (!mrest[i]) {
     mv[o + 1] -= MARKS.gravity * dt;
     mp[o] += mv[o] * dt; mp[o + 1] += mv[o + 1] * dt; mp[o + 2] += mv[o + 2] * dt;
     mtilt[i] = Math.min(Math.PI / 2, mtilt[i] + dt * 3);
     const g = ground(mp[o], mp[o + 2]) + .018;
     if (mp[o + 1] < g) {mp[o + 1] = g; mrest[i] = 1; mtilt[i] = Math.PI / 2; onLand?.(mp[o], g, mp[o + 2], 'magazine');}
    }
    q.setFromEuler(e.set(mtilt[i], myaw[i], 0, 'YXZ'));
    mags.setMatrixAt(i, m.compose(v.set(mp[o], mp[o + 1], mp[o + 2]), q, s.set(1, 1, 1)));
   }
   mags.instanceMatrix.needsUpdate = true;
   if (!liveMags && mags.count) used(mags, false);
   let puffs = 0;
   for (let i = 0; i < S; i++) {
    const o = i * 3, c = i * 4;
    if (slife[i] <= 0) {scol[c + 3] = 0; spos[o + 1] = -1e4; continue;}
    slife[i] -= dt; puffs++;
    svel[o] *= 1 - 1.8 * dt; svel[o + 2] *= 1 - 1.8 * dt;
    spos[o] += svel[o] * dt; spos[o + 1] += svel[o + 1] * dt; spos[o + 2] += svel[o + 2] * dt;
    const k = Math.max(0, slife[i] / sfull[i]);
    scol[c] = scol[c + 1] = scol[c + 2] = .72; scol[c + 3] = .35 * k * Math.min(1, (1 - k) * 8);
   }
   smokeGeometry.attributes.position.needsUpdate = smokeGeometry.attributes.color.needsUpdate = true;
   smoke.visible = puffs > 0;
   let livePools = 0;
   for (let i = 0; i < P; i++) {
    if (!pon[i]) continue;
    page[i] += dt;
    if (page[i] > MARKS.poolLife) {pon[i] = 0; pools.setMatrixAt(i, hide); continue;}
    livePools++;
    if (page[i] < 0) continue;              // the body is still going down
    // Spreads fast at first and slows, as a pool does.
    const grow = 1 - Math.exp(-page[i] / (MARKS.poolGrow / 3)), r = Math.max(.05, prad[i] * grow);
    q.setFromAxisAngle(up, pyaw[i]);
    pools.setMatrixAt(i, m.compose(v.set(pp[i * 3], pp[i * 3 + 1], pp[i * 3 + 2]), q, s.set(r, 1, r)));
   }
   pools.instanceMatrix.needsUpdate = true;
   if (!livePools && pools.count) used(pools, false);
   return liveHoles + liveCasings + liveMags + puffs + livePools;
  },
  /** Roadmap stage 4: wash the blood within `r` m of (x, z) -- the pools go. Returns how many. */
  clearNear(x, z, r) {
   let n = 0;
   for (let i = 0; i < P; i++) if (pon[i] && Math.hypot(pp[i * 3] - x, pp[i * 3 + 2] - z) <= r) {pon[i] = 0; pools.setMatrixAt(i, hide); n++;}
   if (n) pools.instanceMatrix.needsUpdate = true;
   return n;
  },
  clear() {
   holeAge.fill(-1); clife.fill(0); mlife.fill(0); slife.fill(0); pon.fill(0);
   for (const mesh of [holes, casings, mags, pools]) {for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setMatrixAt(i, hide); used(mesh, false);}
   smoke.visible = false;
  },
  dispose() {
   root.removeFromParent();
   holes.geometry.dispose(); holes.material.dispose(); casings.geometry.dispose(); brass.dispose();
   pools.geometry.dispose(); pools.material.dispose(); smokeGeometry.dispose(); smoke.material.dispose();
   holeTex.dispose(); poolTex.dispose(); puffTex.dispose();
   holes.dispose(); casings.dispose(); mags.dispose(); pools.dispose();
  }
 };
}
