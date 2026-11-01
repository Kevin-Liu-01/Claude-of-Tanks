// A regional window's pane stack (local-fps-266): the room's dark at the back of the reveal (house.ts holedPolygon,
// -reveal - 0.004), the unit's pane 1.6 cm in front of it (openings.ts windowUnit, back + 0.012; the craft's leaning
// glass back + 0.02 with its lean and turn) and the frame and glazing bars a further 1-3 cm out (back + frameOut). Past
// about 300 m those gaps are under one step of the scene's 24-bit depth (near 0.5 m: 1.3 cm a step at 330 m), so the
// draw order chose what showed. Three's material order happened to draw the curtain after the dark and the frame after
// the pane; the program-first order (engine/opaqueProgramOrder.ts) drew the dark last, and Urban's distant lit windows
// went dark. Each farther face of a stack now draws in a mesh of its own a fixed count of depth steps behind the faces
// in front of it (a polygon offset in depth units: the same steps at every range): a pane behind its frame one layer,
// the dark behind a framed pane two. So the nearer face wins in any draw order; where nothing stands in front (an open
// doorway, a damage stage's hidden glass) a face draws as before.
import * as THREE from 'three';

/** A face this far or nearer behind another facing its way, overlapping it, is the farther face of their stack. */
export const PANE_STACK_MAX_GAP_M = 0.05;
/** Depth-buffer steps between a stack's layers (one rounding step either way still leaves the nearer face in front). */
export const PANE_STACK_UNITS_PER_LAYER = 2;

/**
 * Which of `subject`'s triangles (flat xyz, nine numbers a triangle) have a triangle of `others` (each flat the same way,
 * in the same frame) facing their way, overlapping them and 0..PANE_STACK_MAX_GAP_M in front of them (`side` 'behind':
 * the subject is the farther face) or behind them ('front': the subject is the nearer face).
 */
export function stacked(subject: ArrayLike<number>, others: ReadonlyArray<ArrayLike<number>>, side: 'behind' | 'front'): boolean[] {
  const count = Math.floor(subject.length / 9), out = new Array<boolean>(count).fill(false);
  if (!count || !others.length) return out;
  interface Tri { v: THREE.Vector3[]; n: THREE.Vector3; centre: THREE.Vector3 }
  const triAt = (src: ArrayLike<number>, t: number): Tri | null => {
    const v = [0, 1, 2].map((k) => new THREE.Vector3(src[t * 9 + k * 3], src[t * 9 + k * 3 + 1], src[t * 9 + k * 3 + 2]));
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const length = n.length();
    if (length < 1e-9) return null;
    return { v, n: n.multiplyScalar(1 / length), centre: new THREE.Vector3().add(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3) };
  };
  // each triangle of `others` in every metre cell its box (grown by the gap) meets; a subject asks the cells its own meets
  const CELL = 1, cells = new Map<string, Tri[]>();
  const cellsOf = (tri: Tri, visit: (key: string) => void) => {
    const lo = tri.v.reduce((m, p) => m.min(p), tri.v[0].clone()).subScalar(PANE_STACK_MAX_GAP_M);
    const hi = tri.v.reduce((m, p) => m.max(p), tri.v[0].clone()).addScalar(PANE_STACK_MAX_GAP_M);
    for (let x = Math.floor(lo.x / CELL); x <= Math.floor(hi.x / CELL); x++)
      for (let y = Math.floor(lo.y / CELL); y <= Math.floor(hi.y / CELL); y++)
        for (let z = Math.floor(lo.z / CELL); z <= Math.floor(hi.z / CELL); z++) visit(`${x},${y},${z}`);
  };
  for (const list of others) {
    for (let t = 0; t < Math.floor(list.length / 9); t++) {
      const tri = triAt(list, t);
      if (tri) cellsOf(tri, (key) => (cells.get(key) ?? cells.set(key, []).get(key)!).push(tri));
    }
  }
  const triangle = new THREE.Triangle(), probe = new THREE.Vector3(), closest = new THREE.Vector3(), towards = new THREE.Vector3();
  // within 5 mm of the triangle: a leaning pane's plane stands a few millimetres off a carried point
  const inside = (p: THREE.Vector3, tri: Tri) => {
    triangle.set(tri.v[0], tri.v[1], tri.v[2]);
    return triangle.closestPointToPoint(p, closest).distanceToSquared(p) < 2.5e-5;
  };
  // a triangle's centre and its corners drawn a tenth in towards it (a face that only meets the other's edge is not over it)
  const points = (tri: Tri) => [tri.centre, ...tri.v.map((p) => towards.copy(p).lerp(tri.centre, 0.1).clone())];
  for (let t = 0; t < count; t++) {
    const d = triAt(subject, t);
    if (!d) continue;
    const candidates = new Set<Tri>();
    cellsOf(d, (key) => { for (const other of cells.get(key) ?? []) candidates.add(other); });
    for (const other of candidates) {
      if (d.n.dot(other.n) < 0.999) continue;
      const gap = d.n.dot(probe.subVectors(other.centre, d.centre)), ahead = side === 'behind' ? gap : -gap;
      if (ahead <= 1e-4 || ahead > PANE_STACK_MAX_GAP_M) continue;
      // overlapping: a point of either carried onto the other's plane lies on it
      if (points(d).some((p) => inside(probe.copy(p).addScaledVector(d.n, gap), other))
        || points(other).some((p) => inside(probe.copy(p).addScaledVector(d.n, -gap), d))) { out[t] = true; break; }
    }
  }
  return out;
}

/**
 * The layer of each face of a building's pane stacks. A pane behind another face (its frame, a glazing bar, a grille)
 * with nothing but the dark behind it 1, else 0 (a unit laid on a solid face keeps its wall 1.8 cm behind the pane: a
 * pane drawn back would lose to it); the dark behind a pane one more than that pane's.
 */
export function paneStackLayers(panes: ReadonlyArray<ArrayLike<number>>, darks: ReadonlyArray<ArrayLike<number>>,
  others: ReadonlyArray<ArrayLike<number>>): { panes: number[][]; darks: number[][] } {
  const paneLayers = panes.map((pane) => {
    const framed = stacked(pane, others, 'behind'), walled = stacked(pane, others, 'front');
    return framed.map((f, t) => (f && !walled[t] ? 1 : 0));
  });
  const byLayer = [0, 1].map((layer) => panes.map((pane, i) => {
    const out: number[] = [];
    for (let t = 0; t < paneLayers[i].length; t++) if (paneLayers[i][t] === layer) for (let k = 0; k < 9; k++) out.push(pane[t * 9 + k]);
    return out;
  }).filter((list) => list.length));
  const darkLayers = darks.map((dark) => {
    const behindFramed = stacked(dark, byLayer[1], 'behind'), behindBare = stacked(dark, byLayer[0], 'behind');
    return behindFramed.map((framed, t) => (framed ? 2 : behindBare[t] ? 1 : 0));
  });
  return { panes: paneLayers, darks: darkLayers };
}

/**
 * Draw `mesh` (a stack layer's faces in `material`, shared with the bucket's other meshes) `layer` steps behind: its
 * own draws take the offset and give the material back after, so the shared material's other draws, its program and
 * every uniform that drives it (the curtain's night glow) are the bucket's. Shadow passes run neither hook.
 */
export function installPaneStackDepth(mesh: THREE.Mesh, material: THREE.Material, layer: number): void {
  const units = layer * PANE_STACK_UNITS_PER_LAYER;
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  let held: [boolean, number, number] | null = null;
  mesh.userData.paneStackLayer = layer;
  mesh.onBeforeRender = function paneStackDepth(renderer, scene, camera, geometry, rendered, group) {
    before.call(this, renderer, scene, camera, geometry, rendered, group);
    if (rendered !== material) return;
    held = [material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits];
    material.polygonOffset = true;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = units;
  };
  mesh.onAfterRender = function paneStackDepthDone(renderer, scene, camera, geometry, rendered, group) {
    after.call(this, renderer, scene, camera, geometry, rendered, group);
    if (!held) return;
    [material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits] = held;
    held = null;
  };
}
