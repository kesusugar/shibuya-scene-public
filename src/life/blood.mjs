// What a hit leaves on the road.
//
// Deliberately not part of the crowd. The crowd renders through thirteen geometries and
// three materials, a budget its own tests assert, and adding a fourteenth for this would
// break that contract for a decoration. This is its own pool instead: one plane, one
// material, one draw call however many marks are on the ground -- the same shape the player
// marker takes, and for the same reason.
//
// Marks lie flat on the road, fade over their life, and are recycled oldest-first once the
// pool is full, so the cost is fixed no matter how the street is treated.

import {CircleGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Color, DynamicDrawUsage} from 'three';

export const BLOOD = Object.freeze({
 // Marks on the ground at once, oldest reused first. Sized against a measured worst case,
 // not a guess: a minute of driving through the crossing leaves 31 bodies down at the same
 // time and each leaves ten marks, so anything under about 310 wraps and clears blood while
 // its owner is still lying in it. 48 wrapped after five bodies, 220 still wrapped. It is one
 // draw call at any size and the instance data is a few tens of kilobytes.
 pool: 400,
 // Marks do not have a life of their own: each is given the time the body that made it has
 // left, so the road clears at the moment that body is recycled rather than keeping a stain
 // eleven seconds after the person who left it has gone. `seconds` is only the fallback for
 // a caller that does not say.
 seconds: 3,
 rise: .02,           // lifted off the road, or it fights the surface for the same pixels
 minRadius: .22, maxRadius: .62,
 perStrike: 5,        // marks per body, scattered along the direction it was thrown
 spread: 1.5,         // m of scatter along the throw
 drift: .5,           // m of scatter across it
 color: 0x7c0a10,     // dark, and it darkens further as it dries
 opacity: .78
});

export function createBloodMarks() {
 // A coarse circle, not a quad: a rotated square reads as a diamond on the road, which at
 // this scale looks like a graphic rather than a mark.
 const geometry = new CircleGeometry(.5, 8);
 const material = new MeshBasicMaterial({color: 0xffffff, transparent: true,
  opacity: BLOOD.opacity, depthWrite: false});
 const mesh = new InstancedMesh(geometry, material, BLOOD.pool);
 mesh.instanceMatrix.setUsage(DynamicDrawUsage);
 mesh.frustumCulled = false;
 mesh.renderOrder = 2;
 mesh.name = 'blood-marks';

 const marks = Array.from({length: BLOOD.pool}, () => ({age: Infinity, life: BLOOD.seconds, x: 0, y: 0, z: 0, r: 0, spin: 0}));
 const obj = new Object3D(), color = new Color(), base = new Color(BLOOD.color);
 let cursor = 0, disposed = false;
 const stats = {marks: 0, spawned: 0};

 /** Lay a splash down where a body was hit, thrown along `dx,dz`, lasting `life` seconds. */
 const splash = (x, y, z, dx = 0, dz = 0, scale = 1, life = BLOOD.seconds) => {
  const len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  for (let i = 0; i < BLOOD.perStrike; i++) {
   const along = (i / BLOOD.perStrike) * BLOOD.spread * scale;
   const across = ((i * 37 % 11) / 11 - .5) * BLOOD.drift;
   const m = marks[cursor]; cursor = (cursor + 1) % BLOOD.pool;
   m.age = 0; m.life = Math.max(.2, life);
   m.x = x + ux * along - uz * across;
   m.z = z + uz * along + ux * across;
   m.y = y + BLOOD.rise;
   // The first mark is the largest; the trail thins out along the throw.
   m.r = (BLOOD.maxRadius - (BLOOD.maxRadius - BLOOD.minRadius) * (i / BLOOD.perStrike)) * scale;
   m.spin = (i * 53 % 31) / 31 * Math.PI;
   stats.spawned++;
  }
 };

 return {
  mesh, stats, splash,
  update(dt = 0) {
   if (disposed) return;
   let count = 0;
   for (const m of marks) {
    if (m.age === Infinity) continue;
    m.age += dt;
    if (m.age >= m.life) {m.age = Infinity; continue;}
    const life = 1 - m.age / m.life;
    obj.position.set(m.x, m.y, m.z);
    obj.rotation.set(-Math.PI / 2, 0, m.spin);   // flat on the road
    // Spreads a little as it settles, then holds.
    obj.scale.setScalar(m.r * (.72 + .28 * Math.min(1, m.age * 6)));
    obj.updateMatrix();
    mesh.setMatrixAt(count, obj.matrix);
    // Darkens as it dries, and fades out towards the end of its life.
    color.copy(base).multiplyScalar(.55 + .45 * life);
    mesh.setColorAt(count, color);
    count++;
   }
   mesh.count = count;
   stats.marks = count;
   mesh.instanceMatrix.needsUpdate = true;
   if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  },
  clear() {for (const m of marks) m.age = Infinity; mesh.count = 0; stats.marks = 0;},
  dispose() {
   if (disposed) return; disposed = true;
   mesh.removeFromParent(); geometry.dispose(); material.dispose();
  }
 };
}
