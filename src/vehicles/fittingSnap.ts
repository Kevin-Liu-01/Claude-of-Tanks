// Seated fittings (owner 2026-10-19: "check for any floating tank parts on hull and turret, as well as floating tank
// decorations and props"). A fitting a builder authors inside P.snapGroup(label, build) is seated once the profile is
// done (tankFactoryCore, after the hanging pass): when the group's nearest point stands between TOUCH_M and its reach
// off the other stock of its own rig group (the hull, the turret, the gun mount), the whole group moves along that
// shortest vector until it sits EMBED_M into the surface. A group already touching or embedded, one with nothing within
// reach, or one the move would carry into the running gear stays as authored; root.userData.fittingSnaps records each.
// Contact is the census's law (tools/hull-contact-census-lib.mjs): a vertex within TOUCH_M of a stock face, or inside
// a closed stock solid.
import * as THREE from 'three';

export interface SnapGroupRequest {
  readonly label: string;
  readonly parts: readonly THREE.BufferGeometry[];
  /** Standalone fitting objects (antenna whips, mounted fittings) children of the same rig group, moved with it. */
  readonly objects?: readonly THREE.Object3D[];
  /** 'down' drops the group straight onto the stock under its lowest band (a mast on a roof) instead of along its
   * shortest gap; `direction` moves it along that direction instead (a door plate onto its recessed face). */
  readonly mode?: 'nearest' | 'down';
  readonly direction?: readonly [number, number, number];
  /** Farthest the group may move, metres. */
  readonly reachM: number;
  /** Hears the move once the group has moved. */
  readonly onMove?: (move: readonly [number, number, number]) => void;
}

export interface SnapReceipt {
  readonly label: string;
  readonly moved: boolean;
  /** The group's clearance to the stock before the move (0: embedded; null: nothing within reach). */
  readonly gapM: number | null;
  readonly vector?: readonly [number, number, number];
  readonly reason?: 'touching' | 'beyond-reach' | 'running-gear';
}

const TOUCH_M = 0.004;
const EMBED_M = 0.002;
const CELL_M = 0.05;

function soupOf(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const count = index ? index.count : position.count, out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i;
    out[i * 3] = position.getX(v); out[i * 3 + 1] = position.getY(v); out[i * 3 + 2] = position.getZ(v);
  }
  return out;
}

/** Triangles binned in a uniform 3D grid. */
class TriangleGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly soups: Float32Array[] = [];
  private key(i: number, j: number, k: number): number { return ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512); }
  add(soup: Float32Array): void {
    const s = this.soups.push(soup) - 1, c = (v: number) => Math.floor(v / CELL_M);
    for (let o = 0; o < soup.length; o += 9) {
      const x0 = c(Math.min(soup[o], soup[o + 3], soup[o + 6])), x1 = c(Math.max(soup[o], soup[o + 3], soup[o + 6]));
      const y0 = c(Math.min(soup[o + 1], soup[o + 4], soup[o + 7])), y1 = c(Math.max(soup[o + 1], soup[o + 4], soup[o + 7]));
      const z0 = c(Math.min(soup[o + 2], soup[o + 5], soup[o + 8])), z1 = c(Math.max(soup[o + 2], soup[o + 5], soup[o + 8]));
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) {
        const key = this.key(i, j, k);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, list = []);
        list.push(s, o);
      }
    }
  }
  /** Visits each triangle once whose cells meet the box. */
  query(min: THREE.Vector3, max: THREE.Vector3, visit: (soup: Float32Array, offset: number) => void): void {
    const c = (v: number) => Math.floor(v / CELL_M), seen = new Set<number>();
    for (let i = c(min.x); i <= c(max.x); i++) for (let j = c(min.y); j <= c(max.y); j++) for (let k = c(min.z); k <= c(max.z); k++) {
      const list = this.cells.get(this.key(i, j, k));
      if (!list) continue;
      for (let n = 0; n < list.length; n += 2) {
        const id = list[n] * 1e8 + list[n + 1];
        if (seen.has(id)) continue;
        seen.add(id);
        visit(this.soups[list[n]], list[n + 1]);
      }
    }
  }
}

const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
const lo = new THREE.Vector3(), hi = new THREE.Vector3();

/** Whether p stands inside closed stock: an odd count of faces along +X (jittered off shared edges). */
function insideStock(grid: TriangleGrid, p: THREE.Vector3, farX: number): boolean {
  const y = p.y + 1.37e-6, z = p.z + 2.71e-6;
  let crossings = 0;
  grid.query(lo.set(p.x, y, z), hi.set(farX, y, z), (T, o) => {
    const ay = T[o + 1], az = T[o + 2], by = T[o + 4], bz = T[o + 5], cy = T[o + 7], cz = T[o + 8];
    const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
    if (Math.abs(d) < 1e-14) return;
    const u = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d, v = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
    if (u < 0 || v < 0 || u + v > 1) return;
    if (u * T[o] + v * T[o + 3] + (1 - u - v) * T[o + 6] > p.x) crossings++;
  });
  return crossings % 2 === 1;
}

/** Distance along the unit direction from the origin to the triangle (Möller-Trumbore), or null. */
function rayTriangle(T: Float32Array, o: number, origin: THREE.Vector3, direction: THREE.Vector3): number | null {
  const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
  const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
  const px = direction.y * e2z - direction.z * e2y, py = direction.z * e2x - direction.x * e2z, pz = direction.x * e2y - direction.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det, tx = origin.x - T[o], ty = origin.y - T[o + 1], tz = origin.z - T[o + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (direction.x * qx + direction.y * qy + direction.z * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : null;
}

/** Moves the group's parts and objects unless the moved bounds meet the running gear. */
function moveGroup(request: SnapGroupRequest, move: THREE.Vector3, objectBox: THREE.Box3,
  gearTouches: (box: THREE.Box3) => boolean): boolean {
  const moved = objectBox.isEmpty() ? new THREE.Box3() : objectBox.clone().translate(move);
  for (const part of request.parts) {
    if (!part.boundingBox) part.computeBoundingBox();
    if (part.boundingBox) moved.union(part.boundingBox.clone().translate(move));
  }
  if (gearTouches(moved)) return false;
  for (const part of request.parts) part.translate(move.x, move.y, move.z);
  for (const object of request.objects ?? []) object.position.add(move);
  request.onMove?.([move.x, move.y, move.z]);
  return true;
}

/**
 * Seats every requested group on `stock` (its rig group's other parts, in that group's frame). `gearTouches` says
 * whether a box in that frame meets the running gear (hull groups only).
 */
export function snapFittings(
  requests: readonly SnapGroupRequest[],
  stock: readonly THREE.BufferGeometry[],
  gearTouches: (box: THREE.Box3) => boolean = () => false,
  rig: THREE.Object3D | null = null,
): SnapReceipt[] {
  if (!requests.length) return [];
  const grid = new TriangleGrid(), stockBox = new THREE.Box3();
  for (const part of stock) {
    const soup = soupOf(part);
    if (!soup.length) continue;
    grid.add(soup);
    if (!part.boundingBox) part.computeBoundingBox();
    if (part.boundingBox) stockBox.union(part.boundingBox);
  }
  const farX = stockBox.isEmpty() ? 0 : stockBox.max.x + 1;
  const receipts: SnapReceipt[] = [], p = new THREE.Vector3();
  for (const request of requests) {
    const vertices: number[] = [], keys = new Set<string>(), objectBox = new THREE.Box3();
    const take = (x: number, y: number, z: number): void => {
      const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
      if (keys.has(key)) return;
      keys.add(key); vertices.push(x, y, z);
    };
    for (const part of request.parts) {
      const position = part.getAttribute('position');
      for (let i = 0; i < position.count; i++) take(position.getX(i), position.getY(i), position.getZ(i));
    }
    if (request.objects?.length && rig) {
      // the objects' meshes in the rig's frame
      rig.updateMatrixWorld(true);
      const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert(), matrix = new THREE.Matrix4(), v = new THREE.Vector3();
      for (const object of request.objects) object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        matrix.multiplyMatrices(toRig, mesh.matrixWorld);
        const position = mesh.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(matrix);
          take(v.x, v.y, v.z); objectBox.expandByPoint(v);
        }
      });
    }
    const direction = request.direction ? new THREE.Vector3(...request.direction).normalize()
      : request.mode === 'down' ? new THREE.Vector3(0, -1, 0) : null;
    if (direction) {
      // along the direction from the group's leading 10 mm band onto the first stock ahead of it
      let lead = -Infinity;
      for (let n = 0; n < vertices.length; n += 3) lead = Math.max(lead, vertices[n] * direction.x + vertices[n + 1] * direction.y + vertices[n + 2] * direction.z);
      let travel = Infinity, embedded = false;
      for (let n = 0; n < vertices.length && !embedded; n += 3) {
        if (vertices[n] * direction.x + vertices[n + 1] * direction.y + vertices[n + 2] * direction.z < lead - 0.01) continue;
        p.set(vertices[n], vertices[n + 1], vertices[n + 2]);
        const far = p.clone().addScaledVector(direction, request.reachM + 0.01), back = p.clone().addScaledVector(direction, -2);
        let ahead = Infinity, behind = 0;
        grid.query(lo.copy(back).min(far), hi.copy(back).max(far), (T, o) => {
          const t = rayTriangle(T, o, back, direction);
          if (t === null) return;
          const along = t - 2;
          if (along < 0) behind++;
          else ahead = Math.min(ahead, along);
        });
        // an odd count of faces behind the vertex (along the ray from 2 m back) puts it inside closed stock
        if (behind % 2 === 1 || ahead <= TOUCH_M) embedded = true;
        else travel = Math.min(travel, ahead);
      }
      if (embedded) { receipts.push({ label: request.label, moved: false, gapM: 0, reason: 'touching' }); continue; }
      if (!Number.isFinite(travel) || travel > request.reachM) {
        receipts.push({ label: request.label, moved: false, gapM: null, reason: 'beyond-reach' });
        continue;
      }
      const move = direction.clone().multiplyScalar(travel + EMBED_M);
      if (!moveGroup(request, move, objectBox, gearTouches)) {
        receipts.push({ label: request.label, moved: false, gapM: travel, reason: 'running-gear' });
        continue;
      }
      receipts.push({ label: request.label, moved: true, gapM: travel, vector: [move.x, move.y, move.z] });
      continue;
    }
    let gap = Infinity, inside = false;
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    for (let n = 0; n < vertices.length && !inside; n += 3) {
      p.set(vertices[n], vertices[n + 1], vertices[n + 2]);
      grid.query(lo.copy(p).subScalar(request.reachM), hi.copy(p).addScalar(request.reachM), (T, o) => {
        triangle.a.set(T[o], T[o + 1], T[o + 2]); triangle.b.set(T[o + 3], T[o + 4], T[o + 5]); triangle.c.set(T[o + 6], T[o + 7], T[o + 8]);
        const d = triangle.closestPointToPoint(p, closest).distanceTo(p);
        if (d < gap) { gap = d; from.copy(p); to.copy(closest); }
      });
      if (insideStock(grid, p, farX)) inside = true;
    }
    if (inside || gap <= TOUCH_M) { receipts.push({ label: request.label, moved: false, gapM: inside ? 0 : gap, reason: 'touching' }); continue; }
    if (!Number.isFinite(gap) || gap > request.reachM) {
      receipts.push({ label: request.label, moved: false, gapM: null, reason: 'beyond-reach' });
      continue;
    }
    const move = to.clone().sub(from).multiplyScalar((gap + EMBED_M) / gap);
    if (!moveGroup(request, move, objectBox, gearTouches)) {
      receipts.push({ label: request.label, moved: false, gapM: gap, reason: 'running-gear' });
      continue;
    }
    receipts.push({ label: request.label, moved: true, gapM: gap, vector: [move.x, move.y, move.z] });
  }
  return receipts;
}
