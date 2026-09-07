// Original closed rotational solids measured from Char Leclerc Object_6 and
// Object_23. No source topology, accessor buffers or vertex arrays are used.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Section = readonly [axial: number, radius: number];

function turned(rows: readonly Section[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x, r]) => new THREE.Vector2(r, x)),
    segments).rotateZ(-Math.PI / 2);
}

function annulus(a: number, b: number, inner: number, outer: number,
  segments: number): THREE.BufferGeometry {
  return turned([[a, inner], [a, outer], [b, outer], [b, inner], [a, inner]], segments);
}

function combine(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Leclerc wheel solids require compatible original attributes');
  return merged;
}

function face(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // Exact outward steps from the preserved axle station. The source supplies
  // single-sided plate faces; a 3 mm inward closure is a construction inference,
  // not a claim that the unseen plate thickness was measured.
  const front: readonly Section[] = [[.18722077, 0], [.18722077, .040645],
    [.22228547, .040645], [.22228547, .065], [.18515690, .1107934],
    [.13788326, .1107934], [.13788326, .17910956],
    [.11195822, .17910956], [.11195822, .26157037],
    [.14728280, .26157037], [.14728280, .2753843]];
  const back: Section[] = [...front].reverse().map(([x, r]) => [x - .003, r]);
  const geometry = combine([
    turned([...front, ...back, front[0]].reverse(), segments),
    annulus(-.24310975, -.0249, .2713843, .2753843, segments),
    annulus(.0249, .14728280, .2713843, .2753843, segments),
  ]);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

function groove(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // Source tire crown drops from R330.787 to R279.660 through the central
  // groove. Its two measured bands differ by 7.574 mm in axial width.
  const geometry = turned([[-.04944961, .2753843], [-.04944961, .3307865],
    [-.02921228, .2796600], [.02183922, .2796600],
    [.04187592, .3307865], [.04944961, .3307865],
    [.04944961, .2753843], [-.04944961, .2753843]], segments);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

export function leclercWheelSolids(segments = 32): {
  core: THREE.BufferGeometry;
  faces: { side: -1 | 1; steel: THREE.BufferGeometry; rubber: THREE.BufferGeometry }[];
} {
  return {
    core: annulus(-.025, .025, .2713843, .2753843, segments),
    faces: ([-1, 1] as const).map(side => ({ side,
      steel: face(side, segments), rubber: groove(side, segments) })),
  };
}
