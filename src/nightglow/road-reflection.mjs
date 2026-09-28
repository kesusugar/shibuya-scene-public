// A real reflection in the wet night road (RUN 12.2).
//
// The road used to carry art-directed light streaks (road-spill.mjs): believable at a glance,
// but a bus's headlights or a sign that changes colour never appeared in it. This renders the
// city into a mirror camera below the road plane and lets the asphalt's own night patch sample
// it, so what is lit above is what shines below.
//
// The method (a planar mirror with an oblique near plane, sampled along a perturbed reflected
// ray rather than by screen UV) is standard; the budget is what is specific to Shibuya:
//  - HIGH only, and only while the night is active; MEDIUM/LOW keep the painted spill;
//  - half resolution, capped, and re-rendered every other frame;
//  - the ground and the whole crowd are hidden from the mirror: the road must not reflect
//    itself, and 1,978 bodies are the one thing too expensive to draw twice. People are
//    dark against a lit city anyway; what the eye expects in a wet road is light.
// The painted streaks stay, blended under the reflection, where the mirror has no texel.
import {Matrix4,PerspectiveCamera,Plane,Vector3,Vector4,WebGLRenderTarget,HalfFloatType,LinearFilter} from 'three';

export const ROAD_REFLECTION = Object.freeze({
 height: .02,          // the mirror plane, just above the asphalt
 scale: .5,            // of the drawing buffer
 maxWidth: 960,
 interval: 2,          // frames between mirror renders
 slowInterval: 4,      // ...on a machine already below `slowFrame`, where every render hurts most
 slowFrame: 1 / 25,
 far: 320,             // metres; the mirror has no use for the horizon
 strength: .9,         // how much of the mirror the wet road returns at full wetness
 fadeSeconds: .6
});

/**
 * Shared by every asphalt material the night patch compiles (day-night.mjs). The texture is
 * black and the strength 0 until a mirror exists, so the road looks exactly as before.
 */
export const ROAD_REFLECTION_UNIFORMS = {
 s13Reflection: {value: null},
 s13ReflectMatrix: {value: new Matrix4()},
 s13ReflectStrength: {value: 0}
};

/** GLSL for the asphalt night patch. Needs `roadNoise`, `s161Position` and `cameraPosition`. */
export const ROAD_REFLECTION_GLSL = `
uniform sampler2D s13Reflection;
uniform mat4 s13ReflectMatrix;
uniform float s13ReflectStrength;
vec3 roadMirror(vec2 q, float wet) {
 vec3 V = normalize(cameraPosition - s161Position);
 // Ripples bend the normal a little, more where the road is only damp.
 vec2 rip = vec2(roadNoise(q * 1.9 + vec2(3.1, 0.)) - .5, roadNoise(q * 1.9 + vec2(0., 7.7)) - .5);
 vec3 N = normalize(vec3(rip.x * mix(.12, .05, wet), 1., rip.y * mix(.12, .05, wet)));
 float fresnel = .04 + .96 * pow(1. - max(dot(V, N), 0.), 5.);
 vec3 R = reflect(-V, N);
 float dist = length(cameraPosition - s161Position);
 vec4 p = s13ReflectMatrix * vec4(s161Position + R * (4. + dist * .18), 1.);
 vec2 uv = p.xy / p.w;
 float edge = smoothstep(0., .05, uv.x) * smoothstep(1., .95, uv.x) * smoothstep(0., .05, uv.y) * smoothstep(1., .95, uv.y);
 uv = clamp(uv, vec2(.002), vec2(.998));
 // Wet asphalt streaks light along the view: blur more across depth than across the road.
 vec2 spread = vec2(.0012, mix(.009, .004, wet));
 vec3 c = texture2D(s13Reflection, uv).rgb * .36
  + texture2D(s13Reflection, clamp(uv + spread, vec2(.002), vec2(.998))).rgb * .32
  + texture2D(s13Reflection, clamp(uv - spread, vec2(.002), vec2(.998))).rgb * .32;
 return c * fresnel * mix(.2, 1., wet) * edge * s13ReflectStrength;
}
`;   // the trailing newline matters: this is prepended to a shader that opens with #define

export function createRoadReflection(renderer, {height = ROAD_REFLECTION.height} = {}) {
 const target = new WebGLRenderTarget(2, 2, {type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true});
 target.texture.name = 's13-road-mirror';
 const mirror = new PerspectiveCamera();
 const bias = new Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
 const plane = new Plane(), clip = new Vector4(), q = new Vector4(), look = new Vector3(), dir = new Vector3(), at = new Vector3();
 const size = {x: 0, y: 0};
 let frame = 0, level = 0, disposed = false, lastTime = null, frameTime = 1 / 60;
 const stats = {active: false, renders: 0, width: 0, height: 0, hidden: 0, ms: 0, interval: ROAD_REFLECTION.interval};

 const resize = () => {
  const buffer = renderer.getDrawingBufferSize?.(new Vector3()) ?? {x: 2, y: 2};
  const w = Math.max(2, Math.min(ROAD_REFLECTION.maxWidth, Math.round(buffer.x * ROAD_REFLECTION.scale)));
  const h = Math.max(2, Math.round(w * buffer.y / Math.max(1, buffer.x)));
  if (w !== size.x || h !== size.y) {target.setSize(w, h); size.x = w; size.y = h; stats.width = w; stats.height = h;}
 };

 /** Build the mirror camera for `camera` and render `scene` into it, with `hide` hidden. */
 /** @param {import('three').Scene} scene @param {import('three').PerspectiveCamera} camera @param {Array<any>} hide */
 const render = (scene, camera, hide) => {
  const start = typeof performance !== 'undefined' ? performance.now() : 0;
  resize();
  camera.updateMatrixWorld(); camera.getWorldDirection(dir);
  look.copy(camera.position).add(dir);
  mirror.copy(camera, false);
  mirror.far = Math.min(camera.far, ROAD_REFLECTION.far);
  mirror.position.set(camera.position.x, 2 * height - camera.position.y, camera.position.z);
  look.y = 2 * height - look.y;
  mirror.up.copy(camera.up); mirror.up.y *= -1;
  mirror.lookAt(look); mirror.updateProjectionMatrix(); mirror.updateMatrixWorld();
  mirror.matrixWorldInverse.copy(mirror.matrixWorld).invert();
  ROAD_REFLECTION_UNIFORMS.s13ReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  // Oblique near plane: nothing below the road is drawn into the mirror.
  plane.setFromNormalAndCoplanarPoint(at.set(0, 1, 0), dir.set(0, height, 0)); plane.applyMatrix4(mirror.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = mirror.projectionMatrix.elements;
  q.x = (Math.sign(clip.x) + p[8]) / p[0]; q.y = (Math.sign(clip.y) + p[9]) / p[5]; q.z = -1; q.w = (1 + p[10]) / p[14];
  clip.multiplyScalar(2 / clip.dot(q));
  p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1; p[14] = clip.w;
  mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

  const was = [];
  for (const o of hide) if (o && o.visible) {was.push(o); o.visible = false;}
  const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate, xr = renderer.xr?.enabled;
  renderer.shadowMap.autoUpdate = false; if (renderer.xr) renderer.xr.enabled = false;
  // Never sample the mirror while drawing into it (a WebGL feedback loop), whatever `hide` missed.
  const bound = ROAD_REFLECTION_UNIFORMS.s13Reflection.value;ROAD_REFLECTION_UNIFORMS.s13Reflection.value = null;
  try {renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, mirror);}
  finally {
   ROAD_REFLECTION_UNIFORMS.s13Reflection.value = bound;
   renderer.setRenderTarget(previous); renderer.shadowMap.autoUpdate = shadows; if (renderer.xr) renderer.xr.enabled = xr;
   for (const o of was) o.visible = true;
  }
  stats.renders++; stats.hidden = was.length;
  stats.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - start;
 };

 const api = {
  /** QA and A/B: false fades the mirror out and stops rendering it. */
  enabled: true,
  target, stats,
  /**
   * Once a frame, before the main render. `active` is "HIGH and the night is on"; `hide` is
   * the list of roots the mirror must not draw (ground, crowd, wet decals).
   */
  /**
   * @param {import('three').Scene} scene @param {import('three').PerspectiveCamera} camera
   * @param {{active?:boolean, hide?:Array<any>, time?:number|null}} [options]
   */
  update(scene, camera, {active = false, hide = [], time = null} = {}) {
   if (disposed || !renderer) return;
   const dt = lastTime === null || time === null ? 1 / 60 : Math.max(0, Math.min(.1, time - lastTime));
   lastTime = time;
   frameTime += (dt - frameTime) * .05;          // slow average: a hitch must not flip it
   stats.interval = frameTime > ROAD_REFLECTION.slowFrame ? ROAD_REFLECTION.slowInterval : ROAD_REFLECTION.interval;
   const want = active && api.enabled ? 1 : 0;
   level += Math.sign(want - level) * Math.min(Math.abs(want - level), dt / ROAD_REFLECTION.fadeSeconds);
   stats.active = level > 0;
   ROAD_REFLECTION_UNIFORMS.s13Reflection.value = level > 0 ? target.texture : null;
   ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value = level * ROAD_REFLECTION.strength;
   if (level <= 0) return;
   if (frame++ % stats.interval === 0 || stats.renders === 0) render(scene, camera, hide);
  },
  dispose() {
   if (disposed) return; disposed = true;
   ROAD_REFLECTION_UNIFORMS.s13Reflection.value = null; ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value = 0;
   target.dispose();
  }
 };
 return api;
}
