// The room's dark behind a window pane (local-fps-266). The house grammar lays the dark at the back of an opening's
// reveal (house.ts holedPolygon, -reveal - 0.004) and the opening's unit stands its pane 0.4..4.4 cm in front of it
// (openings.ts windowUnit: back + 0.012, the craft's leaning glass back + 0.02 with its lean and turn). Past about 300 m
// that is under one step of the scene's 24-bit depth (near 0.5 m, 1.3 cm a step at 330 m), so the draw order chose which
// showed: three's material order happened to draw the curtain after the dark and the glass before it, the program-first
// order (engine/opaqueProgramOrder.ts) drew the dark last, and Urban's distant lit windows went dark. The dark a pane
// stands in front of now draws in its own mesh, a fixed count of depth-buffer steps behind the rest (a polygon offset in
// depth units: the same steps at every range), so the pane wins in either order; where no pane stands (an open doorway,
// a damage stage's hidden glass) the dark draws as before.
import * as THREE from 'three';

/** A dark face this far or nearer behind a pane facing its way is the pane's backing. */
export const PANE_BACKING_MAX_GAP_M = 0.05;
/** The backing's draw: this many depth-buffer steps behind the faces in front of it (the pane wins a step's rounding). */
export const PANE_BACKING_DEPTH_UNITS = 2;

/**
 * Which of `dark`'s triangles (flat xyz, nine numbers a triangle) stand behind a pane of `panes` (each flat the same
 * way, in the same frame): facing its way, its plane 0..PANE_BACKING_MAX_GAP_M behind the pane's, and overlapping it.
 */
export function paneBackingTriangles(dark: ArrayLike<number>, panes: ReadonlyArray<ArrayLike<number>>): boolean[] {
  const count = Math.floor(dark.length / 9), out = new Array<boolean>(count).fill(false);
  if (!count || !panes.length) return out;
  interface Tri { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; n: THREE.Vector3; centre: THREE.Vector3 }
  const triAt = (src: ArrayLike<number>, t: number): Tri | null => {
    const a = new THREE.Vector3(src[t * 9], src[t * 9 + 1], src[t * 9 + 2]);
    const b = new THREE.Vector3(src[t * 9 + 3], src[t * 9 + 4], src[t * 9 + 5]);
    const c = new THREE.Vector3(src[t * 9 + 6], src[t * 9 + 7], src[t * 9 + 8]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const length = n.length();
    if (length < 1e-9) return null;
    return { a, b, c, n: n.multiplyScalar(1 / length), centre: new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3) };
  };
  const CELL = 1, cellKey = (p: THREE.Vector3, dx = 0, dy = 0, dz = 0) =>
    `${Math.floor(p.x / CELL) + dx},${Math.floor(p.y / CELL) + dy},${Math.floor(p.z / CELL) + dz}`;
  const cells = new Map<string, Tri[]>();
  for (const pane of panes) {
    for (let t = 0; t < Math.floor(pane.length / 9); t++) {
      const tri = triAt(pane, t);
      if (!tri) continue;
      const key = cellKey(tri.centre);
      (cells.get(key) ?? cells.set(key, []).get(key)!).push(tri);
    }
  }
  const triangle = new THREE.Triangle(), probe = new THREE.Vector3(), closest = new THREE.Vector3();
  // within 5 mm of the triangle: a leaning pane's plane stands a few millimetres off the backing's carried centre
  const inside = (p: THREE.Vector3, tri: Tri) => {
    triangle.set(tri.a, tri.b, tri.c);
    return triangle.closestPointToPoint(p, closest).distanceToSquared(p) < 2.5e-5;
  };
  for (let t = 0; t < count; t++) {
    const d = triAt(dark, t);
    if (!d) continue;
    search: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const pane of cells.get(cellKey(d.centre, dx, dy, dz)) ?? []) {
        if (d.n.dot(pane.n) < 0.999) continue;
        const gap = d.n.dot(probe.subVectors(pane.centre, d.centre));
        if (gap <= 1e-4 || gap > PANE_BACKING_MAX_GAP_M) continue;
        // overlapping: the backing's centre carried onto the pane's plane lies on the pane, or the pane's centre on it
        if (inside(probe.copy(d.centre).addScaledVector(d.n, gap), pane)
          || inside(probe.copy(pane.centre).addScaledVector(d.n, -gap), d)) { out[t] = true; break search; }
      }
    }
  }
  return out;
}

/** The backing's material: the dark's, its program and hooks shared, drawn PANE_BACKING_DEPTH_UNITS steps back. */
export function paneBackingMaterial<T extends THREE.Material>(dark: T, setup: (material: T) => void): T {
  const material = dark.clone() as T;
  setup(material);
  material.userData.propsKind = dark.userData.propsKind;
  material.customProgramCacheKey = dark.customProgramCacheKey;
  material.polygonOffset = true;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = PANE_BACKING_DEPTH_UNITS;
  return material;
}
