// The overhead marker that makes the played character findable.
//
// It is deliberately not part of the crowd. The crowd is a fixed set of thirteen instanced
// geometry pools sharing three materials, a contract its own tests guard, and this is a
// player affordance rather than a pedestrian body part: putting the cone in those pools
// would have spent that contract on something no pedestrian ever uses.

import {ConeGeometry, Mesh, MeshStandardMaterial} from 'three';

export const MARKER = Object.freeze({
 color: 0xff6a3d,
 car: 0x3dc8ff,   // the car's own cone, so it is not mistaken for the player's
 radius: .17, height: .3,
 clearance: 1.14,  // multiples of the figure's height, so the cone clears the tallest heads
 bob: .055, bobRate: 2.2
});

/**
 * @param {number} [color] the cone's colour; the car gets its own so the two are told apart
 *   at a glance in a street where everything else is orange neon.
 */
export function createPlayerMarker(color = MARKER.color) {
 const geometry = new ConeGeometry(1, 1, 6);
 // Its own emissive: the crowd material has none, and at night nothing else would light it.
 const material = new MeshStandardMaterial({
  color, roughness: .35, emissive: color, emissiveIntensity: 1.6
 });
 const mesh = new Mesh(geometry, material);
 mesh.name = 'player-marker';
 mesh.frustumCulled = false;
 mesh.rotation.x = Math.PI;           // point down at the player
 mesh.scale.set(MARKER.radius, MARKER.height, MARKER.radius);
 mesh.visible = false;
 let clock = 0, disposed = false;
 return {
  mesh,
  /** `height` is the figure's own height, so the cone rides above whatever archetype is worn. */
  update(state, dt = 0, height = 1.7) {
   clock += dt;
   mesh.visible = true;
   mesh.position.set(state.x, state.y + height * MARKER.clearance + Math.sin(clock * MARKER.bobRate) * MARKER.bob, state.z);
  },
  hide() {mesh.visible = false;},
  dispose() {if (disposed) return; disposed = true; mesh.removeFromParent(); geometry.dispose(); material.dispose();}
 };
}
