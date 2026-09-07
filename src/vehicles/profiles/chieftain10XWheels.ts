// Original turned solids from scalar radial cuts of wheel_l_06. The two
// pressed dishes have different crowns and real air between their outer rims.
// No source vertices, indices or texture data are runtime inputs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Section = readonly [axial: number, radius: number];
const CENTER_X = 1.35287;

function turn(profile: readonly Section[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([x, radius]) =>
    new THREE.Vector2(radius, x - CENTER_X)), segments).rotateZ(-Math.PI / 2);
}

function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error('Mk10 turned wheel solids need compatible attributes');
  return result;
}

function pressedHalves(segments: number): THREE.BufferGeometry[] {
  const inner: readonly Section[] = [
    [1.33118, 0], [1.33118, .001], [1.26740, .3397],
    [1.17104, .3397], [1.19326, .411105], [1.32967, .411105],
    [1.34838, .3397], [1.35985, .220], [1.39744, .215],
    [1.39744, .164], [1.3802, .160], [1.38255, .115], [1.39, 0],
  ];
  const outer: readonly Section[] = [
    [1.35985, .220], [1.37085, .334], [1.39061, .409455],
    [1.52720, .409455], [1.54938, .3418], [1.45789, .3418],
    [1.415, .220], [1.39744, .215], [1.35985, .220],
  ];
  return [turn(inner, segments), turn(outer, segments)];
}

function bearingCaps(segments: number): THREE.BufferGeometry[] {
  const inner: readonly Section[] = [
    [1.15636, 0], [1.15636, .080], [1.17671, .100], [1.30086, .110],
    [1.30961, .115], [1.33118, .115], [1.33118, 0],
  ];
  const outer: readonly Section[] = [
    [1.3808, 0], [1.3808, .075], [1.44072, .075], [1.44072, .121],
    [1.46378, .121], [1.46378, .100], [1.49594, .080],
    [1.53635, .035], [1.54823, 0],
  ];
  return [turn(inner, segments), turn(outer, segments)];
}

function face(side: -1 | 1, segments: number): THREE.BufferGeometry {
  const parts = [...pressedHalves(segments), ...bearingCaps(segments)];
  // Ten separate local heads stand on the recessed mounting flange. They
  // cannot become long radial spokes or a full proud disc over the bowl.
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 10 + i * Math.PI / 5;
    parts.push(new THREE.CylinderGeometry(.0107, .0107, .0282, 6)
      .rotateZ(-Math.PI / 2).translate(1.4115 - CENTER_X,
        Math.cos(angle) * .18, Math.sin(angle) * .18));
  }
  const result = join(parts);
  // A proper rotation, not a negative scale, keeps both dish windings outward.
  if (side < 0) result.rotateY(Math.PI);
  return result;
}

export function chieftain10WheelSolids(segments = 32): {
  core: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry;
} {
  // This is the physical central spindle, not a full-radius generic filler.
  const core = new THREE.CylinderGeometry(.072, .072, .20, segments)
    .rotateZ(-Math.PI / 2);
  return { core, left: face(-1, segments), right: face(1, segments) };
}
