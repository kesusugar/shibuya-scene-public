// What puts the crowd on the ground.
//
// Without this a thousand people stand in a scene that has no idea they are there: nothing
// darkens under a foot, so every figure reads as a cut-out hovering over the road however
// good the figure itself is. A real shadow map for this many movers is not affordable and is
// not what the eye is asking for -- it wants a smudge in the right place.
//
// So: one plane, one material, one draw call for the whole crowd, no texture and no lighting
// term. The same shape `blood.mjs` takes, and for the same reason -- the crowd renders
// through thirteen geometries and three materials, a budget its own tests assert, and a
// contact shadow is not a fourteenth character part.

import {InstancedMesh, PlaneGeometry, ShaderMaterial, Object3D, DynamicDrawUsage} from 'three';

export const SHADOW = Object.freeze({
 // Radius comes from the body, so a child's shadow is a child's. Multiplied by the
 // archetype's width rather than fixed, which is most of what stops a crowd of identical
 // ellipses looking like a polka-dot pattern from above.
 spread: 1.35,
 lift: .015,          // off the road, or it fights the surface for the same pixels
 opacity: .34,
 // A thrown body leaves the ground. Its shadow has to stay on the road, grow, and fade, or
 // it looks like the shadow is flying too.
 airFade: 2.2,        // metres of height over which it fades out entirely
 airSpread: .55       // ...and how much it spreads over that distance
});

export function createContactShadows(capacity) {
 const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
 const material = new ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {opacity: {value: SHADOW.opacity}},
  vertexShader: `
   varying vec2 vUv;
   void main(){
    vUv = uv;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
     p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
   }`,
  // Soft round falloff rather than a disc: a hard-edged ellipse under a person reads as a
  // sticker. Discarding the tail costs less than blending a nearly transparent pixel.
  fragmentShader: `
   uniform float opacity;
   varying vec2 vUv;
   void main(){
    vec2 p = (vUv - .5) * 2.0;
    float a = pow(max(0.0, 1.0 - dot(p, p)), 1.6) * opacity;
    if (a < .004) discard;
    gl_FragColor = vec4(.02, .028, .034, a);
   }`
 });

 const size = Math.max(1, capacity);
 const mesh = new InstancedMesh(geometry, material, size);
 mesh.instanceMatrix.setUsage(DynamicDrawUsage);
 mesh.frustumCulled = false;
 mesh.renderOrder = 1;
 mesh.name = 'crowd-contact-shadows';
 mesh.count = 0;

 const obj = new Object3D();
 let cursor = 0, disposed = false;

 return {
  mesh,
  /** Start a frame. Instances are rewritten from scratch each time, like the crowd itself. */
  begin() {cursor = 0;},
  /**
   * One shadow, on the ground at `ground`, cast by a body whose centre is `height` above it.
   * Returns false once the pool is full rather than growing it.
   */
  add(x, ground, z, width, height = 0) {
   if (disposed || cursor >= size) return false;
   const air = Math.max(0, Math.min(1, height / SHADOW.airFade));
   const r = width * SHADOW.spread * (1 + air * SHADOW.airSpread);
   // Fading by scale keeps this to a single uniform: a shadow that has spread to nothing is
   // a shadow that is not drawn, and the pool never needs a per-instance opacity attribute.
   const fade = 1 - air;
   if (fade <= .02) return false;
   obj.position.set(x, ground + SHADOW.lift, z);
   obj.rotation.set(0, 0, 0);
   obj.scale.set(r * 2, 1, r * 2 * fade);
   obj.updateMatrix();
   mesh.setMatrixAt(cursor++, obj.matrix);
   return true;
  },
  /** Publish the frame. */
  end() {mesh.count = cursor; mesh.instanceMatrix.needsUpdate = true;},
  get drawn() {return cursor;},
  dispose() {
   if (disposed) return; disposed = true;
   geometry.dispose(); material.dispose();
   mesh.removeFromParent(); mesh.dispose?.();
  }
 };
}
