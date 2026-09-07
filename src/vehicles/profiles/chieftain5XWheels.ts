// Original Mk5 pressed-wheel construction. The dated Kubinka photograph
// supports the recessed steel bowl and localized hub, not the generic proud
// radial ribs. Unseen depths below are estimates, not AI-source measurements.
import * as THREE from 'three';

export function chieftain5PhotoWheelSolids(): {
  core: THREE.BufferGeometry; shoulder: THREE.BufferGeometry;
} {
  const face = [[0, .246], [.045, .246], [.066, .232], [.100, .173],
    [.135, .110], [.190, .115], [.255, .145], [.300, .178],
    [.334, .203], [.3555, .206]];
  // A continuous closed section carries both bowls and the central bearing.
  // No hidden full-radius disc fills the front depression.
  const profile = [...face.map(([r, x]) => new THREE.Vector2(r, -x)),
    ...[...face].reverse().map(([r, x]) => new THREE.Vector2(r, x))];
  const core = new THREE.LatheGeometry(profile, 48).rotateZ(-Math.PI / 2);
  // Preserve the original .395 R/.40 W rubber and its .94 R/1.03 W shoulder.
  // The former filled rubber center opens only where the real steel seats.
  const shoulder = new THREE.LatheGeometry([
    [.3535, -.206], [.3713, -.206], [.3713, .206],
    [.3535, .206], [.3535, -.206],
  ].map(([r, x]) => new THREE.Vector2(r, x)), 48).rotateZ(-Math.PI / 2);
  return { core, shoulder };
}
