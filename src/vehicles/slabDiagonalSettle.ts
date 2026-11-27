// 279 (slab-mirror): one diagonal per mirrored pair of twisted slab quads, chosen on the drawn corners.
//
// slab() (factoryGeometry.ts) splits each of its six quads along a fixed a→c diagonal ([a,b,c],[a,c,d]). That split is
// not mirror-invariant: a builder that lists a slab's corners mirror-symmetrically gives a twisted quad and its mirror
// twin opposite diagonals, so one side bulges where the other dishes (the Challenger 2E's cheeks: 7-14 mm, after the
// turret seat twisted a near-flat quad). This pass runs once at the end of the build, after every per-vertex warp (the
// turret seat, turretSeatRace.ts) and before anything bakes or merges, on the quads slab() authored (the SlabQuadTable
// side-table; never fans, lofts or lathes). Main's ruling (279), all of it:
// - it acts only on a quad twisted at least TWIST_M (the gap between its two diagonals) whose mirror twin (x → -x in the
//   vehicle root's frame, a tagged quad of the same mesh) is drawn along the other diagonal: both take the convex
//   (outer-hull) split, which is mirror-invariant;
// - twisted quads whose twin already agrees, twin-less quads and planar ones are left as built (a quad still planar
//   draws the same either way, so there is no tie-break).
// A settled mesh draws its own copy of its geometry, as a seated one does: `onSettled(built, settled, sourceOf)` lets the
// build's followers (camouflage projection, ERA spans, damage ranges) move to the copy; `sourceOf[i]` is the built
// vertex each settled vertex was copied from. A turret-seat foot split's copy draws its own table (splitSlabQuadTable,
// tankFactoryCore's onSplit) that skips the quads the split cut, so the settle and the census read the split copies too.
import * as THREE from 'three';
import { SLAB_VERTICES, slabQuadTable, type SlabQuadTable } from './factoryGeometry.ts';

/** The least gap between a quad's two diagonals that counts as twisted (1 mm). */
export const SLAB_TWIST_M = 1e-3;

/** A flipped quad's six vertices, from the built group [a,b,c,a,c,d]: [b,c,d,b,d,a]. */
const FLIP = [1, 2, 5, 1, 5, 0] as const;

type Vec = [number, number, number];

/** The gap between a quad's two splits: the distance between its diagonals a-c and b-d (closest points on the segments). */
export function quadSplitGap(a: Vec, b: Vec, c: Vec, d: Vec): number {
  const u = sub(c, a), v = sub(d, b), w = sub(a, b);
  const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w), den = A * C - B * B;
  let s = den > 1e-12 ? (B * E - C * D) / den : 0;
  s = Math.min(1, Math.max(0, s));
  let t = C > 1e-12 ? (B * s + E) / C : 0;
  if (t < 0 || t > 1) { t = Math.min(1, Math.max(0, t)); s = A > 1e-12 ? Math.min(1, Math.max(0, (B * t - D) / A)) : 0; }
  return Math.hypot(a[0] + u[0] * s - b[0] - v[0] * t, a[1] + u[1] * s - b[1] - v[1] * t, a[2] + u[2] * s - b[2] - v[2] * t);
}

function sub(a: Vec, b: Vec): Vec { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: Vec, b: Vec): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** A corner's key at 0.1 mm, and its mirror's (x → -x). */
const keyOf = (p: Vec): string => `${Math.round(p[0] * 1e4) + 0},${Math.round(p[1] * 1e4) + 0},${Math.round(p[2] * 1e4) + 0}`;
const mirrorKeyOf = (p: Vec): string => keyOf([-p[0], p[1], p[2]]);

/** The quad's outline turns one way at every corner about its area normal: no dart, no bow-tie (a slab whose top and
 *  bottom cross), which have no outer-hull split. */
function convexOutline(p: readonly [Vec, Vec, Vec, Vec]): boolean {
  const n: Vec = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  for (let i = 0; i < 4; i++) {
    const e1 = sub(p[(i + 1) % 4], p[i]), e2 = sub(p[(i + 2) % 4], p[(i + 1) % 4]);
    if (dot([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], n) <= 0) return false;
  }
  return true;
}

/** A face's facing: the axis and sign of its outward normal's largest component (back-to-back faces differ). */
function facingOf(n: Vec): string {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  return `${n[axis] < 0 ? '-' : '+'}${'xyz'[axis]}`;
}

/** One drawn slab quad: its group's first vertex, its corners a,b,c,d in the root frame, and its split gap. */
interface DrawnQuad {
  readonly start: number;
  readonly corners: readonly [Vec, Vec, Vec, Vec];
  readonly gap: number;
  /** the convex split runs a→c (else b→d); null when the slab gives the quad no outward side */
  readonly convexAC: boolean | null;
  /** its corner set and outward facing, and the same of its mirror image */
  readonly key: string;
  readonly mirrorKey: string;
}

/**
 * The slab table a turret-seat foot split's copy draws (turretSeatRace.ts splitFootFaces, non-indexed): the built vertices
 * keep their slots, a cut triangle's slot holds its first piece and the pieces past the first are appended, so the built
 * runs still index the copy and every quad group with a vertex the split changed is skipped. Null when the built geometry
 * has no table or the split is indexed.
 */
export function splitSlabQuadTable(built: THREE.BufferGeometry, split: THREE.BufferGeometry): SlabQuadTable | null {
  const table = slabQuadTable(built), was = built.getAttribute('position'), now = split.getAttribute('position');
  if (!table || split.index || !now || now.count < table.vertexCount) return null;
  const skip = new Set(table.skip ?? []);
  for (let k = 0; k < table.runs.length; k += 2) {
    for (let start = table.runs[k]; start < table.runs[k] + table.runs[k + 1]; start += 6) {
      for (let i = start; i < start + 6; i++) {
        if (was.getX(i) !== now.getX(i) || was.getY(i) !== now.getY(i) || was.getZ(i) !== now.getZ(i)) { skip.add(start); break; }
      }
    }
  }
  return { vertexCount: now.count, runs: table.runs, skip: [...skip].sort((a, b) => a - b) };
}

/** The slab quads a mesh draws, in the root frame; a skipped group (SlabQuadTable.skip), or one no longer in the slab
 *  pattern (a→a, c→c), is left out. */
function drawnSlabQuads(mesh: THREE.Mesh, toRoot: THREE.Matrix4): DrawnQuad[] {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const table = slabQuadTable(geometry);
  if (!table) return [];
  const skip = new Set(table.skip ?? []);
  const position = geometry.getAttribute('position');
  const e = toRoot.elements;
  const at = (i: number): Vec => {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  };
  const same = (i: number, j: number): boolean => position.getX(i) === position.getX(j)
    && position.getY(i) === position.getY(j) && position.getZ(i) === position.getZ(j);
  const quads: DrawnQuad[] = [];
  for (let k = 0; k < table.runs.length; k += 2) {
    for (let slab = table.runs[k]; slab + SLAB_VERTICES <= table.runs[k] + table.runs[k + 1]; slab += SLAB_VERTICES) {
      const groups: Array<{ start: number; corners: [Vec, Vec, Vec, Vec] }> = [];
      const centroid: Vec = [0, 0, 0];
      for (let start = slab; start < slab + SLAB_VERTICES; start += 6) {
        if (skip.has(start) || !same(start, start + 3) || !same(start + 2, start + 4)) continue;
        const corners: [Vec, Vec, Vec, Vec] = [at(start), at(start + 1), at(start + 2), at(start + 5)];
        for (const p of corners) { centroid[0] += p[0]; centroid[1] += p[1]; centroid[2] += p[2]; }
        groups.push({ start, corners });
      }
      if (!groups.length) continue;
      const n = groups.length * 4;
      centroid[0] /= n; centroid[1] /= n; centroid[2] /= n;
      for (const { start, corners } of groups) {
        const [a, b, c, d] = corners;
        const gap = quadSplitGap(a, b, c, d);
        // the face's normal, turned away from the slab's centre (its winding's where the slab gives it no side): the convex
        // split takes the diagonal standing further out
        const u = sub(c, a), v = sub(d, b);
        const normal: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const mid: Vec = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
        const side = dot(normal, sub(mid, centroid));
        const lift = dot(normal, [(a[0] + c[0] - b[0] - d[0]) / 2, (a[1] + c[1] - b[1] - d[1]) / 2, (a[2] + c[2] - b[2] - d[2]) / 2]);
        const convexAC = gap >= SLAB_TWIST_M && convexOutline(corners) && Math.abs(side) > 1e-12 && Math.abs(lift) > 1e-12
          ? (side > 0) === (lift > 0) : null;
        const outward = side < 0 ? normal.map((x) => -x) as Vec : normal;
        quads.push({ start, corners, gap, convexAC,
          key: `${corners.map(keyOf).sort().join('|')}#${facingOf(outward)}`,
          mirrorKey: `${corners.map(mirrorKeyOf).sort().join('|')}#${facingOf([-outward[0], outward[1], outward[2]])}` });
      }
    }
  }
  return quads;
}

/** One mirrored pair of twisted slab quads drawn along opposite diagonals (each pair once). */
export interface SlabMirrorPair {
  readonly mesh: string;
  readonly gapMm: number;
  /** the pair's first member's a corner, root frame */
  readonly corner: readonly number[];
  /** every member of the mirror class (both sides, coincident duplicates included), by its group's first vertex */
  readonly starts: readonly number[];
}

export interface SlabMirrorCensus {
  /** twisted tagged quads in all */
  twisted: number;
  /** mirror classes with twisted members that already draw mirrored diagonals: left alone */
  agreeingPairs: number;
  /** twisted tagged quads with no tagged twin in their mesh */
  noTwin: number;
  /** mirror classes with a twisted member whose outline is not convex (a dart, or a bow-tie where a slab's top and bottom
   *  cross): no outer-hull split, so left as built even where the twins disagree */
  nonConvex: number;
  /** mirror classes (a face and its mirror twin, with any coincident duplicates) drawn along opposite diagonals */
  readonly pairs: SlabMirrorPair[];
}

interface MeshPlan { mesh: THREE.Mesh; flips: number[] }

function survey(root: THREE.Object3D): { census: SlabMirrorCensus; plans: MeshPlan[] } {
  const census: SlabMirrorCensus = { twisted: 0, agreeingPairs: 0, noTwin: 0, nonConvex: 0, pairs: [] };
  const plans: MeshPlan[] = [];
  root.updateMatrixWorld(true);
  const fromRoot = root.matrixWorld.clone().invert();
  const toRoot = new THREE.Matrix4();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || !mesh.geometry) return;
    if (!slabQuadTable(mesh.geometry)) return;
    toRoot.multiplyMatrices(fromRoot, mesh.matrixWorld);
    // A mirror class: the quads over one corner set facing one way, with those over its mirror facing the mirrored way
    // (several slabs can draw the same face: coincident duplicates join their class; a back-to-back face is its own).
    const classes = new Map<string, Array<{ quad: DrawnQuad; mirrored: boolean }>>();
    for (const quad of drawnSlabQuads(mesh, toRoot)) {
      const mirrored = quad.mirrorKey < quad.key;
      const key = mirrored ? quad.mirrorKey : quad.key;
      const members = classes.get(key) ?? [];
      members.push({ quad, mirrored });
      classes.set(key, members);
    }
    const flips: number[] = [];
    for (const members of classes.values()) {
      const twisted = members.filter(({ quad }) => quad.gap >= SLAB_TWIST_M);
      if (!twisted.length) continue;
      census.twisted += twisted.length;
      const self = members[0].quad.key === members[0].quad.mirrorKey;
      if (!self && (members.every(({ mirrored }) => mirrored) || members.every(({ mirrored }) => !mirrored))) {
        census.noTwin += twisted.length;
        continue;
      }
      // each member's split in the class's own frame (a mirrored member's mirrored): one split for all = mirror-symmetric
      const splits = new Set(members.map(({ quad, mirrored }) => {
        const ends = mirrored ? [mirrorKeyOf(quad.corners[0]), mirrorKeyOf(quad.corners[2])] : [keyOf(quad.corners[0]), keyOf(quad.corners[2])];
        return ends.sort().join('|');
      }));
      if (splits.size === 1) { census.agreeingPairs++; continue; }
      if (twisted.some(({ quad }) => quad.convexAC === null)) { census.nonConvex++; continue; }
      // opposite diagonals: every twisted member takes the convex split
      for (const { quad } of twisted) if (quad.convexAC === false) flips.push(quad.start);
      const worst = twisted.reduce((a, b) => (b.quad.gap > a.quad.gap ? b : a)).quad;
      census.pairs.push({ mesh: mesh.name, gapMm: +(worst.gap * 1000).toFixed(2), corner: worst.corners[0].map((x) => +x.toFixed(3)),
        starts: members.map(({ quad }) => quad.start).sort((a, b) => a - b) });
    }
    if (flips.length) plans.push({ mesh, flips: flips.sort((a, b) => a - b) });
  });
  return { census, plans };
}

/** The slab quads the build draws along opposite diagonals from their mirror twins (read-only). */
export function slabMirrorCensus(root: THREE.Object3D): SlabMirrorCensus {
  return survey(root).census;
}

/** Flat per-triangle normals (computeVertexNormals on non-indexed geometry) in the group: then the flip recomputes them. */
function flatNormals(normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, start: number): boolean {
  for (let t = start; t < start + 6; t += 3) {
    for (let i = t + 1; i < t + 3; i++) {
      if (normal.getX(i) !== normal.getX(t) || normal.getY(i) !== normal.getY(t) || normal.getZ(i) !== normal.getZ(t)) return false;
    }
  }
  return true;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * The settle: every mirror-disagreeing twisted slab quad pair takes its convex split. Returns the census before the
 * settle. Each settled mesh draws a copy of its geometry (pushed to `disposables`); `onSettled` follows it.
 */
export function settleSlabDiagonals(root: THREE.Object3D, disposables: { push(geometry: THREE.BufferGeometry): unknown },
  onSettled?: (built: THREE.BufferGeometry, settled: THREE.BufferGeometry, sourceOf: Int32Array) => void): SlabMirrorCensus {
  const { census, plans } = survey(root);
  for (const { mesh, flips } of plans) {
    const built = mesh.geometry as THREE.BufferGeometry;
    const settled = built.clone();
    const count = built.getAttribute('position').count;
    const sourceOf = new Int32Array(count);
    for (let i = 0; i < count; i++) sourceOf[i] = i;
    for (const start of flips) for (let k = 0; k < 6; k++) sourceOf[start + k] = start + FLIP[k];
    const builtNormal = built.getAttribute('normal');
    const flat = builtNormal ? flips.map((start) => flatNormals(builtNormal, start)) : [];
    for (const [name, attribute] of Object.entries(settled.attributes)) {
      const from = built.getAttribute(name);
      const out = attribute as THREE.BufferAttribute;
      for (const start of flips) {
        for (let k = 0; k < 6; k++) {
          for (let c = 0; c < out.itemSize; c++) out.setComponent(start + k, c, from.getComponent(start + FLIP[k], c));
        }
      }
      out.needsUpdate = true;
    }
    const normal = settled.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (normal) {
      const position = settled.getAttribute('position');
      flips.forEach((start, f) => {
        if (!flat[f]) return;
        for (let t = start; t < start + 6; t += 3) {
          _a.fromBufferAttribute(position, t);
          _b.fromBufferAttribute(position, t + 1).sub(_a);
          _c.fromBufferAttribute(position, t + 2).sub(_a);
          _b.cross(_c);
          if (_b.lengthSq() > 1e-24) _b.normalize();
          for (let i = t; i < t + 3; i++) normal.setXYZ(i, _b.x, _b.y, _b.z);
        }
      });
    }
    disposables.push(settled);
    mesh.geometry = settled;
    onSettled?.(built, settled, sourceOf);
  }
  return census;
}
