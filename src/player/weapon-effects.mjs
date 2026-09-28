// What a weapon looks like when it is used (PLAN-WEAPONS R6, R12): sparks where a blade or a
// bullet meets a wall or a car, a muzzle flash, and a faint tracer along the shot.
//
// No lights. A point light per flash would recompile every lit material for the new light count
// and break the night budget (§16a, Police W3), so the flash is emissive and additive: it glows
// and blooms, but the street is not lit by it. Three draw calls at most, and none while nothing
// is live: sparks and puffs share one Points, the flash is a second, the tracers one LineSegments,
// and (§9ai) blood a fourth Points, drawn opaque.
import {AdditiveBlending,BufferAttribute,BufferGeometry,LineBasicMaterial,LineSegments,Points,
 PointsMaterial,Group,NormalBlending} from 'three';

export const EFFECTS = Object.freeze({
 sparks: 96,          // particles in the pool
 sparkLife: [.18, .38],
 sparkSpeed: [2.5, 6.5],
 gravity: 9.8,
 flashLife: .05,      // s: a muzzle flash is three frames at 60 Hz
 tracers: 8, tracerLife: .06,
 // §9ai H2: blood where a blade or a round meets a person -- dark droplets that spray out of the
 // wound along the blow and fall, not the hot sparks a wall gives. Their own pool, drawn opaque
 // (sparks are additive and would glow red).
 blood: 160, bloodLife: [.45, .9], bloodSpeed: [1.2, 4.2], bloodSize: .03
});

const rand = (() => {let s = 0x2545f491; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ 0x5bd1e995) >>> 0) / 4294967296;})();

export function createWeaponEffects() {
 const root = new Group(); root.name = 'weapon-effects';
 // --- sparks and dust --------------------------------------------------------------------------
 const N = EFFECTS.sparks, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
 const vel = new Float32Array(N * 3), life = new Float32Array(N), full = new Float32Array(N), tint = new Float32Array(N * 3);
 const sparkGeometry = new BufferGeometry();
 sparkGeometry.setAttribute('position', new BufferAttribute(pos, 3));
 sparkGeometry.setAttribute('color', new BufferAttribute(col, 3));
 const sparks = new Points(sparkGeometry, new PointsMaterial({size: .05, vertexColors: true, transparent: true,
  depthWrite: false, blending: AdditiveBlending}));
 sparks.frustumCulled = false; sparks.visible = false; sparks.name = 'weapon-sparks';
 // --- muzzle flash -----------------------------------------------------------------------------
 const F = 4, fpos = new Float32Array(F * 3), fcol = new Float32Array(F * 3), flife = new Float32Array(F);
 const flashGeometry = new BufferGeometry();
 flashGeometry.setAttribute('position', new BufferAttribute(fpos, 3));
 flashGeometry.setAttribute('color', new BufferAttribute(fcol, 3));
 const flash = new Points(flashGeometry, new PointsMaterial({size: .32, vertexColors: true, transparent: true,
  depthWrite: false, blending: AdditiveBlending}));
 flash.frustumCulled = false; flash.visible = false; flash.name = 'weapon-flash';
 // --- tracers ----------------------------------------------------------------------------------
 const L = EFFECTS.tracers, lpos = new Float32Array(L * 6), lcol = new Float32Array(L * 6), llife = new Float32Array(L);
 const lineGeometry = new BufferGeometry();
 lineGeometry.setAttribute('position', new BufferAttribute(lpos, 3));
 lineGeometry.setAttribute('color', new BufferAttribute(lcol, 3));
 const tracers = new LineSegments(lineGeometry, new LineBasicMaterial({vertexColors: true, transparent: true,
  depthWrite: false, blending: AdditiveBlending}));
 tracers.frustumCulled = false; tracers.visible = false; tracers.name = 'weapon-tracers';
 // --- blood ------------------------------------------------------------------------------------
 const B = EFFECTS.blood, bpos = new Float32Array(B * 3), bcol = new Float32Array(B * 3), bvel = new Float32Array(B * 3);
 const blife = new Float32Array(B), bfull = new Float32Array(B), bshade = new Float32Array(B), bglass = new Uint8Array(B);
 const bloodGeometry = new BufferGeometry();
 bloodGeometry.setAttribute('position', new BufferAttribute(bpos, 3));
 bloodGeometry.setAttribute('color', new BufferAttribute(bcol, 3));
 const blood = new Points(bloodGeometry, new PointsMaterial({size: EFFECTS.bloodSize, vertexColors: true, transparent: true,
  depthWrite: false, blending: NormalBlending}));
 blood.frustumCulled = false; blood.visible = false; blood.name = 'weapon-blood';
 root.add(sparks, flash, tracers, blood);
 let bcursor = 0;

 let cursor = 0, fcursor = 0, lcursor = 0, kick = 0;
 const stats = {sparks: 0, flashes: 0, tracers: 0, blood: 0};

 const api = {
  root,
  get stats() {return {...stats};},
  /** How much the frame should bloom for a flash: 1 on the frame of a shot, gone in 60 ms. */
  get kick() {return kick;},
  /**
   * A burst where something hard was struck: hot orange for steel on steel or a bullet on
   * concrete, `dust` for a grey puff (a bullet into the ground or a wall's render).
   */
  burst(x, y, z, {count = 14, nx = 0, nz = 0, ny = 0, dust = false} = {}) {
   for (let k = 0; k < count; k++) {
    const i = cursor; cursor = (cursor + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = rand() * Math.PI * 2, up = rand() * .9 + .1, v = EFFECTS.sparkSpeed[0] + rand() * (EFFECTS.sparkSpeed[1] - EFFECTS.sparkSpeed[0]);
    // Out of the surface, in a spray.
    vel[i * 3] = (Math.cos(a) * .7 + nx) * v * (dust ? .3 : 1);
    vel[i * 3 + 1] = (up + ny) * v * (dust ? .25 : .7);
    vel[i * 3 + 2] = (Math.sin(a) * .7 + nz) * v * (dust ? .3 : 1);
    full[i] = life[i] = EFFECTS.sparkLife[0] + rand() * (EFFECTS.sparkLife[1] - EFFECTS.sparkLife[0]) * (dust ? 1.8 : 1);
    if (dust) {tint[i * 3] = .35; tint[i * 3 + 1] = .33; tint[i * 3 + 2] = .3;}
    else {tint[i * 3] = 1.6; tint[i * 3 + 1] = .9 + rand() * .3; tint[i * 3 + 2] = .35;}
   }
   stats.sparks += count; sparks.visible = true;
  },
  /**
   * §9ai H2: blood out of a wound at `x,y,z`, sprayed along `dir` (the way the blow went) in a
   * cone of `spread`, with a little back-spatter toward the attacker. `count` droplets.
   */
  blood(x, y, z, {dir = {x: 0, y: 0, z: 1}, count = 18, spread = .6, back = .25} = {}) {
   const l = Math.hypot(dir.x, dir.y ?? 0, dir.z) || 1, dx = dir.x / l, dy = (dir.y ?? 0) / l, dz = dir.z / l;
   for (let k = 0; k < count; k++) {
    const i = bcursor; bcursor = (bcursor + 1) % B;
    bpos[i * 3] = x; bpos[i * 3 + 1] = y; bpos[i * 3 + 2] = z;
    const s = rand() < back ? -.5 : 1, v = EFFECTS.bloodSpeed[0] + rand() * (EFFECTS.bloodSpeed[1] - EFFECTS.bloodSpeed[0]);
    const jx = (rand() - .5) * 2 * spread, jy = (rand() - .2) * spread, jz = (rand() - .5) * 2 * spread;
    bvel[i * 3] = (dx * s + jx) * v; bvel[i * 3 + 1] = (dy * s + jy + .25) * v; bvel[i * 3 + 2] = (dz * s + jz) * v;
    bfull[i] = blife[i] = EFFECTS.bloodLife[0] + rand() * (EFFECTS.bloodLife[1] - EFFECTS.bloodLife[0]);
    bshade[i] = .55 + rand() * .45; bglass[i] = 0;
   }
   stats.blood += count; blood.visible = true;
  },
  /**
   * Stage 6: a pane going -- glass thrown out along `dir` and falling, pale and glinting. It rides
   * the blood pool (opaque points that fall) with its own colour.
   */
  glass(x, y, z, {dir = {x: 0, y: 0, z: 1}, count = 26, spread = .9} = {}) {
   const l = Math.hypot(dir.x, dir.y ?? 0, dir.z) || 1, dx = dir.x / l, dy = (dir.y ?? 0) / l, dz = dir.z / l;
   for (let k = 0; k < count; k++) {
    const i = bcursor; bcursor = (bcursor + 1) % B;
    bpos[i * 3] = x + (rand() - .5) * .5; bpos[i * 3 + 1] = y + (rand() - .5) * .25; bpos[i * 3 + 2] = z + (rand() - .5) * .5;
    const v = .8 + rand() * 2.4;
    bvel[i * 3] = (dx + (rand() - .5) * 2 * spread) * v; bvel[i * 3 + 1] = (dy + rand() * .6) * v; bvel[i * 3 + 2] = (dz + (rand() - .5) * 2 * spread) * v;
    bfull[i] = blife[i] = .6 + rand() * .7;
    bshade[i] = .6 + rand() * .4; bglass[i] = 1;
   }
   stats.glass = (stats.glass ?? 0) + count; blood.visible = true;
  },
  /** The muzzle flash at `x,y,z`, looking along `dir`: a bright core and two points down the line. */
  muzzle(x, y, z, dir) {
   for (let k = 0; k < 3; k++) {
    const i = fcursor; fcursor = (fcursor + 1) % F;
    const along = k * .06;
    fpos[i * 3] = x + dir.x * along; fpos[i * 3 + 1] = y + dir.y * along; fpos[i * 3 + 2] = z + dir.z * along;
    flife[i] = EFFECTS.flashLife * (1 - k * .2);
   }
   kick = 1; stats.flashes++; flash.visible = true;
  },
  /** A faint streak from the muzzle to where the shot stopped. */
  tracer(a, b) {
   const i = lcursor; lcursor = (lcursor + 1) % L;
   lpos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
   llife[i] = EFFECTS.tracerLife; stats.tracers++; tracers.visible = true;
  },
  update(dt) {
   dt = Math.max(0, Math.min(.1, dt || 0));
   kick = Math.max(0, kick - dt / EFFECTS.flashLife);
   let live = 0;
   for (let i = 0; i < N; i++) {
    if (life[i] <= 0) {col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue;}
    life[i] -= dt; live++;
    vel[i * 3 + 1] -= EFFECTS.gravity * dt;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    const k = Math.max(0, life[i] / full[i]);
    col[i * 3] = tint[i * 3] * k; col[i * 3 + 1] = tint[i * 3 + 1] * k; col[i * 3 + 2] = tint[i * 3 + 2] * k;
   }
   sparkGeometry.attributes.position.needsUpdate = sparkGeometry.attributes.color.needsUpdate = true;
   sparks.visible = live > 0;
   let lit = 0;
   for (let i = 0; i < F; i++) {
    flife[i] = Math.max(0, flife[i] - dt); const k = flife[i] / EFFECTS.flashLife;
    if (k > 0) lit++;
    fcol[i * 3] = 3 * k; fcol[i * 3 + 1] = 2.1 * k; fcol[i * 3 + 2] = .8 * k;
   }
   flashGeometry.attributes.position.needsUpdate = flashGeometry.attributes.color.needsUpdate = true;
   flash.visible = lit > 0;
   let streaks = 0;
   for (let i = 0; i < L; i++) {
    llife[i] = Math.max(0, llife[i] - dt); const k = llife[i] / EFFECTS.tracerLife;
    if (k > 0) streaks++;
    lcol.set([1.2 * k, 1 * k, .6 * k, .3 * k, .25 * k, .15 * k], i * 6);
   }
   lineGeometry.attributes.position.needsUpdate = lineGeometry.attributes.color.needsUpdate = true;
   tracers.visible = streaks > 0;
   let drops = 0;
   for (let i = 0; i < B; i++) {
    if (blife[i] <= 0) {bcol[i * 3] = bcol[i * 3 + 1] = bcol[i * 3 + 2] = 0; bpos[i * 3 + 1] = -1e4; continue;}
    blife[i] -= dt; drops++;
    bvel[i * 3 + 1] -= EFFECTS.gravity * dt;
    bvel[i * 3] *= 1 - 1.5 * dt; bvel[i * 3 + 2] *= 1 - 1.5 * dt;
    bpos[i * 3] += bvel[i * 3] * dt; bpos[i * 3 + 1] += bvel[i * 3 + 1] * dt; bpos[i * 3 + 2] += bvel[i * 3 + 2] * dt;
    // Dark arterial red, darker as it goes.
    const k = .5 + .5 * Math.max(0, blife[i] / bfull[i]), c = bshade[i] * k;
    if (bglass[i]) {bcol[i * 3] = .78 * c; bcol[i * 3 + 1] = .88 * c; bcol[i * 3 + 2] = .92 * c;}
    else {bcol[i * 3] = .42 * c; bcol[i * 3 + 1] = .02 * c; bcol[i * 3 + 2] = .03 * c;}
   }
   bloodGeometry.attributes.position.needsUpdate = bloodGeometry.attributes.color.needsUpdate = true;
   blood.visible = drops > 0;
   return live + drops;
  },
  dispose() {
   root.removeFromParent();
   sparkGeometry.dispose(); flashGeometry.dispose(); lineGeometry.dispose(); bloodGeometry.dispose();
   sparks.material.dispose(); flash.material.dispose(); tracers.material.dispose(); blood.material.dispose();
  }
 };
 return api;
}
