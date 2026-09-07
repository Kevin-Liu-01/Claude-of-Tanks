// Original axial/radial solids from the source's two separate wheel dishes.
// These scalar section dimensions are not source vertex or topology arrays.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type AxialRadius = readonly [axial: number, radius: number];

function turned(profile: readonly AxialRadius[], segments: number): THREE.BufferGeometry {
  // Lathe +Y is rotated onto +X. Source coordinates are measured outward
  // from the preserved wheel station, before the left/right side reflection.
  return new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)),
    segments).rotateZ(-Math.PI / 2);
}

function combine(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('A6 wheel solids must have compatible original attributes');
  return merged;
}

function face(side: -1 | 1, segments: number): THREE.BufferGeometry {
  const inner: readonly AxialRadius[] = [
    [-.033975, 0], [-.033975, .31624], [-.173535, .31624],
    [-.15885, .31624], [-.15885, .29464], [-.05099, .19092], [-.05099, 0],
  ];
  const outer: readonly AxialRadius[] = [
    [.035305, 0], [.035305, .31624], [.174865, .31624],
    [.16018, .31624], [.16018, .29464], [.12216, .29464],
    [.06981, .25055], [.04147, .15935], [.04147, 0],
  ];
  const hub: readonly AxialRadius[] = [
    [.040905, 0], [.040905, .08959], [.10362, .0838], [.10362, .0609],
    [.12758, .0575], [.14697, .0443], [.156835, .0205], [.156835, 0],
  ];
  const mesh = combine([turned([...inner].reverse(), segments), turned(outer, segments), turned(hub, segments)]);
  // A proper half-turn mirrors the rotational solid axially without negative
  // determinants or reversing its triangle winding.
  if (side < 0) mesh.rotateY(Math.PI);
  return mesh;
}

export function leopardA6WheelSolids(segments = 32): {
  core: THREE.BufferGeometry; left: THREE.BufferGeometry; right: THREE.BufferGeometry;
} {
  const core = turned([[-.03572, 0], [-.03572, .12401], [.03706, .12401],
    [.03706, 0]], segments);
  return { core, left: face(-1, segments), right: face(1, segments) };
}
