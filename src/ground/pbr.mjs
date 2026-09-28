// Photographed CC0 surfaces for the road and the pavement (RUN 12.3).
//
// The ground was procedural: 256-px noise for asphalt and a drawn tile grid for the pavement,
// right from a distance and flat up close. This swaps in Poly Haven PBR sets (colour, normal,
// roughness; see assets/textures/upstream.lock.json) onto the SAME materials, after the city
// is standing:
//  - no startup wait and no new draw call -- the meshes and their night patches (wet roughness,
//    the road mirror) are untouched, because those hook the material, not its maps;
//  - scale from the set's real size: the ground's UVs are world metres / 4;
//  - the scene's calibrated albedo is kept. Each material is tinted, per channel in linear
//    light, so the photograph's average matches the procedural texture it replaces: the
//    lighting was tuned against that average (docs/DAYLIGHT-CALIBRATION-2026-09-14.md) and a
//    brown photograph must not quietly re-grade the whole street;
//  - LOW keeps the procedural textures.

export const GROUND_PBR = Object.freeze({
 uvMetres: 4,                          // ground UV = world metres / 4 (src/ground/render.mjs)
 tiers: ['high', 'medium'],
 anisotropy: 8,
 normalScale: {road: .85, sidewalk: 1},
 meshes: {road: 'ground-asphalt', sidewalk: 'ground-sidewalk'},
 maxTint: 4                            // a guard: never multiply a channel beyond this
});

const toLinear = c => {c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;};

/** Average sRGB colour of a procedural DataTexture (what the lighting was calibrated against). */
export function meanOfData(texture) {
 const d = texture?.image?.data;
 if (!d?.length) return null;
 let r = 0, g = 0, b = 0; const n = d.length / 4;
 for (let i = 0; i < d.length; i += 4) {r += d[i]; g += d[i + 1]; b += d[i + 2];}
 return [r / n, g / n, b / n];
}

/** Per-channel linear multiplier that moves `from` (sRGB mean) onto `to` (sRGB mean). */
export function albedoTint(from, to, max = GROUND_PBR.maxTint) {
 return from.map((f, i) => Math.min(max, toLinear(to[i]) / Math.max(1e-4, toLinear(f))));
}

/**
 * Upgrade the ground's materials in place. `load(url)` returns a THREE texture (TextureLoader's
 * loadAsync in the browser); `fetchJson(url)` the manifest. Resolves to what was applied.
 */
/**
 * @param {any} root
 * @param {{tier?:string, base?:string, load?:(url:string)=>Promise<any>, fetchJson?:(url:string)=>Promise<any>, THREE?:any}} [options]
 */
export async function upgradeGroundTextures(root, {tier = 'high', base = 'textures/ground/', load, fetchJson, THREE} = {}) {
 const result = {applied: [], skipped: null};
 if (!GROUND_PBR.tiers.includes(tier)) {result.skipped = 'tier'; return result;}
 if (!root || !load || !fetchJson || !THREE) {result.skipped = 'missing'; return result;}
 const manifest = await fetchJson(base + 'manifest.json');
 for (const set of manifest.sets) {
  const mesh = root.getObjectByName(GROUND_PBR.meshes[set.use]);
  const material = mesh?.material;
  if (!material || material.userData.s123Pbr) continue;
  const [diff, normal, rough] = await Promise.all(['diff', 'normal', 'rough'].map(role => load(base + set.maps[role].file)));
  const repeat = GROUND_PBR.uvMetres / (set.metres?.[0] || GROUND_PBR.uvMetres);
  for (const t of [diff, normal, rough]) {
   t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = GROUND_PBR.anisotropy;
   t.colorSpace = t === diff ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  }
  const target = meanOfData(material.map);
  const tint = target && set.meanSrgb ? albedoTint(set.meanSrgb, target) : [1, 1, 1];
  const old = [material.map, material.bumpMap].filter(Boolean);
  material.map = diff; material.normalMap = normal; material.roughnessMap = rough; material.bumpMap = null;
  const s = GROUND_PBR.normalScale[set.use] ?? 1; material.normalScale.set(s, s);
  material.roughness = 1;                              // the map carries it now
  material.color.setRGB(material.color.r * tint[0], material.color.g * tint[1], material.color.b * tint[2]);
  material.userData.s123Pbr = {set: set.id, tint: tint.map(v => +v.toFixed(3)), repeat: +repeat.toFixed(3)};
  material.needsUpdate = true;
  for (const t of new Set(old)) t.dispose?.();
  result.applied.push({use: set.use, set: set.id, ...material.userData.s123Pbr});
 }
 return result;
}
