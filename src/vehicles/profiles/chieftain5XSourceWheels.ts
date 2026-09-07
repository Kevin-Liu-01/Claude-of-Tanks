// Original turned steel/rubber sections measured from Wheels_310. The source
// has a broad annular tire, stepped recessed dish and local conical hub.
import * as THREE from 'three';

function dish(segments: number): THREE.BufferGeometry {
  const center = 1.2951864;
  const face = [
    [0, 1.49820], [.025, 1.49820], [.086, 1.4468], [.095, 1.42650],
    [.1156, 1.42650], [.1631, 1.33418], [.2313, 1.33418],
    [.2752, 1.39244], [.3162, 1.39244], [.3200, 1.50358],
  ];
  const inner = [[.3200, 1.08679], [.308, 1.08679], [.129, 1.25530], [0, 1.25530]];
  // The complete closed axle/steel section replaces the generic dish. It
  // never installs a full-radius filler behind the measured depression.
  return new THREE.LatheGeometry([...face, ...inner].reverse().map(([r, x]) =>
    new THREE.Vector2(r, x - center)), segments).rotateZ(-Math.PI / 2);
}

export function chieftain5SourceWheelSolids(segments = 40): {
  core: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry;
} {
  // The small common spindle lies inside the real central steel. The distinct
  // turned dishes are native face layers and rotate with the actual wheels.
  const core = new THREE.CylinderGeometry(.035, .035, .060, segments).rotateZ(-Math.PI / 2);
  return { core, left: dish(segments).rotateY(Math.PI), right: dish(segments) };
}
