// Wind in the street trees (RUN 12.4).
//
// The canopies were rigid spheres. This sways them in the vertex shader of the shared `leaf`
// material, so it costs no draw call and no CPU per tree:
//  - two unequal gusts per long cycle, with more still time than moving time, because constant
//    motion reads as machinery and a gust that arrives and settles reads as air;
//  - the gust front travels across the street (phase from the tree's own position), so
//    neighbouring trees move one after another instead of in unison;
//  - weighted by height above the ground: canopies move, the low planter shrubs that share the
//    material barely do, and nothing at the base moves at all;
//  - the same patch goes on the shadow's depth material, so the shadow sways with the leaves.
import {MeshDepthMaterial,RGBADepthPacking} from 'three';

export const WIND = Object.freeze({
 cycle: 11,               // seconds per gust cycle
 speed: 3.2,              // m/s the gust front travels
 direction: [.8, .6],     // where the wind blows to (x, z), normalised in the shader
 sway: .16,               // metres at full gust, at the top of a canopy
 flutter: .025,           // metres of fast leaf motion inside a gust
 from: 1.4, to: 4.6       // world height band the sway ramps up over
});

/** Shared by every patched material; the scene advances `uWindTime` once a frame. */
export const WIND_UNIFORMS = {uWindTime: {value: 0}};

export const WIND_GLSL = `
uniform float uWindTime;
float windGust(vec2 anchor) {
 vec2 dir = normalize(vec2(${WIND.direction[0].toFixed(3)}, ${WIND.direction[1].toFixed(3)}));
 float t = uWindTime - dot(anchor, dir) / ${WIND.speed.toFixed(3)};
 float u = fract(t / ${WIND.cycle.toFixed(3)});
 // Two puffs: a big one early in the cycle, a smaller one later, still in between.
 float a = smoothstep(.0, .12, u) * (1. - smoothstep(.12, .34, u));
 float b = .55 * smoothstep(.52, .6, u) * (1. - smoothstep(.6, .74, u));
 return a + b;
}
vec3 windOffset(vec3 world, vec2 anchor) {
 vec2 dir = normalize(vec2(${WIND.direction[0].toFixed(3)}, ${WIND.direction[1].toFixed(3)}));
 float g = windGust(anchor);
 float h = smoothstep(${WIND.from.toFixed(3)}, ${WIND.to.toFixed(3)}, world.y);
 float flutter = sin(uWindTime * 9.1 + dot(world.xz, vec2(3.7, 2.9))) * ${WIND.flutter.toFixed(3)} * g;
 return vec3(dir.x, 0., dir.y) * (g * ${WIND.sway.toFixed(3)} + flutter) * h;
}
`;

const patch = shader => {
 Object.assign(shader.uniforms, WIND_UNIFORMS);
 shader.vertexShader = WIND_GLSL + shader.vertexShader.replace('#include <project_vertex>', `
 #ifdef USE_INSTANCING
  vec3 windAnchor = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  vec3 windWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
 #else
  vec3 windAnchor = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
  vec3 windWorld = (modelMatrix * vec4(transformed, 1.)).xyz;
 #endif
  // Back into the object's space: the offset is in the world, the vertex is not.
 #ifdef USE_INSTANCING
  transformed += (inverse(mat3(modelMatrix * instanceMatrix)) * windOffset(windWorld, windAnchor.xz));
 #else
  transformed += (inverse(mat3(modelMatrix)) * windOffset(windWorld, windAnchor.xz));
 #endif
 #include <project_vertex>`);
};

/** Sway `material` (and return a depth material for `mesh.customDepthMaterial` that matches). */
export function installWind(material) {
 const original = material.onBeforeCompile, key = material.customProgramCacheKey;
 material.onBeforeCompile = (shader, renderer) => {original?.call(material, shader, renderer); patch(shader);};
 material.customProgramCacheKey = () => (key?.call(material) ?? '') + ':s124-wind';
 material.needsUpdate = true;
 const depth = new MeshDepthMaterial({depthPacking: RGBADepthPacking});
 depth.onBeforeCompile = patch;
 depth.customProgramCacheKey = () => 's124-wind-depth';
 return depth;
}

/** Once a frame. */
export function advanceWind(time) {WIND_UNIFORMS.uWindTime.value = time;}
