// Hung guards (owner 2026-10-19: "the flaps often hang off many tanks"). A guard a builder registers with
// P.hangMudguard is hung once the profile is done (tankFactoryCore, before the spare-track seat pass): at two stations
// along its top edge a flat steel strap runs from GRIP_M inside the guard up into the first permanent hull stock
// straight above it, EMBED_M deep (or half that stock's thickness when it is thinner). A station already touching
// stock gets no strap. A station with no stock above within REACH_M, or whose strap would cross the running gear, is
// left as authored and reported in root.userData.mudguardHangers, so its builder is fixed by hand
// (tools/hull-contact-census.mjs still lists it as floating).
import * as THREE from 'three';

export interface MudguardHangRequest {
  readonly label: string;
  readonly part: THREE.BufferGeometry;
  readonly strapBucket: string;
}

export interface MudguardHangerStation {
  readonly x: number;
  readonly z: number;
  readonly topY: number;
  readonly stockY: number | null;
  readonly strap: boolean;
  readonly reason?: 'touching' | 'no-stock-above' | 'running-gear';
  /** 'arm': a horizontal arm from the top edge into the stock beside it (nothing above within reach). */
  readonly arm?: boolean;
}

export interface MudguardHangerReceipt {
  readonly label: string;
  readonly stations: readonly MudguardHangerStation[];
}

const REACH_M = 0.65;
const EMBED_M = 0.02;
const GRIP_M = 0.03;
const TOUCH_M = 0.004;
const STRAP_WIDTH_M = 0.05;
const STATIONS = [0.22, 0.78] as const;
const STATION_CANDIDATES = [0.22, 0.78, 0.1, 0.9, 0.35, 0.65, 0.5] as const;
const CELL_M = 0.1;

/** Triangles binned by their plan (x, z) cells, for vertical rays and footprint queries. */
class PlanGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly soups: Float32Array[] = [];
  private key(i: number, k: number): number { return (i + 4096) * 8192 + (k + 4096); }
  add(soup: Float32Array): number {
    const s = this.soups.push(soup) - 1, c = (v: number) => Math.floor(v / CELL_M);
    for (let o = 0; o < soup.length; o += 9) {
      const x0 = c(Math.min(soup[o], soup[o + 3], soup[o + 6])), x1 = c(Math.max(soup[o], soup[o + 3], soup[o + 6]));
      const z0 = c(Math.min(soup[o + 2], soup[o + 5], soup[o + 8])), z1 = c(Math.max(soup[o + 2], soup[o + 5], soup[o + 8]));
      for (let i = x0; i <= x1; i++) for (let k = z0; k <= z1; k++) {
        const key = this.key(i, k);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, list = []);
        list.push(s, o);
      }
    }
    return s;
  }
  /** Heights where the vertical line through (x, z) crosses a triangle (not of a skipped soup), ascending. */
  crossings(x: number, z: number, skip?: ReadonlySet<number>): number[] {
    const list = this.cells.get(this.key(Math.floor(x / CELL_M), Math.floor(z / CELL_M)));
    const out: number[] = [];
    if (!list) return out;
    for (let n = 0; n < list.length; n += 2) {
      if (skip?.has(list[n])) continue;
      const T = this.soups[list[n]], o = list[n + 1];
      const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      out.push(u * T[o + 1] + v * T[o + 4] + (1 - u - v) * T[o + 7]);
    }
    return out.sort((a, b) => a - b);
  }
  /** Distance along a horizontal unit ray (dx, dz) from (x, y, z) to the first triangle within reach, or null. */
  horizontal(x: number, y: number, z: number, dx: number, dz: number, reach: number, skip?: ReadonlySet<number>): number | null {
    let best: number | null = null;
    const seen = new Set<number>();
    for (let t = 0; t <= reach + CELL_M; t += CELL_M * 0.5) {
      const list = this.cells.get(this.key(Math.floor((x + dx * t) / CELL_M), Math.floor((z + dz * t) / CELL_M)));
      if (!list) continue;
      for (let n = 0; n < list.length; n += 2) {
        const id = list[n] * 1e8 + list[n + 1];
        if (seen.has(id) || skip?.has(list[n])) continue;
        seen.add(id);
        const T = this.soups[list[n]], o = list[n + 1];
        const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
        const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
        const px = -dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det, tx = x - T[o], ty = y - T[o + 1], tz = z - T[o + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (d > 0 && d <= reach && (best === null || d < best)) best = d;
      }
    }
    return best;
  }
  /** Whether any triangle's bounds meet the box (conservative: running-gear shoes are small). */
  touchesBox(box: THREE.Box3): boolean {
    const c = (v: number) => Math.floor(v / CELL_M);
    for (let i = c(box.min.x); i <= c(box.max.x); i++) for (let k = c(box.min.z); k <= c(box.max.z); k++) {
      const list = this.cells.get(this.key(i, k));
      if (!list) continue;
      for (let n = 0; n < list.length; n += 2) {
        const T = this.soups[list[n]], o = list[n + 1];
        if (Math.max(T[o], T[o + 3], T[o + 6]) < box.min.x || Math.min(T[o], T[o + 3], T[o + 6]) > box.max.x) continue;
        if (Math.max(T[o + 1], T[o + 4], T[o + 7]) < box.min.y || Math.min(T[o + 1], T[o + 4], T[o + 7]) > box.max.y) continue;
        if (Math.max(T[o + 2], T[o + 5], T[o + 8]) < box.min.z || Math.min(T[o + 2], T[o + 5], T[o + 8]) > box.max.z) continue;
        return true;
      }
    }
    return false;
  }
}

function soupOf(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): Float32Array {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const count = index ? index.count : position.count, out = new Float32Array(count * 3), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, index ? index.getX(i) : i);
    if (matrix) v.applyMatrix4(matrix);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

/**
 * Hangs every requested guard from the hull stock above it. `supports` are the hull rig's permanent parts in the hull
 * frame (no running gear, tracks or glass); `hullG`'s running-gear meshes are what a strap may not cross; `addStrap`
 * files each strap in its bucket as a guard part.
 */
export function hangAuthoredMudguards(
  requests: readonly MudguardHangRequest[],
  supports: readonly THREE.BufferGeometry[],
  hullG: THREE.Object3D,
  addStrap: (request: MudguardHangRequest, geometry: THREE.BufferGeometry) => void,
): MudguardHangerReceipt[] {
  if (!requests.length) return [];
  const stock = new PlanGrid(), gear = new PlanGrid();
  // Every permanent hull part is stock, other hung guards included (a hem hangs from its hung board); each guard skips
  // only itself and what it carries (below).
  const stockIndex = new Map<THREE.BufferGeometry, number>(), stockBoxes: THREE.Box3[] = [];
  for (const part of [...new Set([...supports, ...requests.map((request) => request.part)])]) {
    if (!part.boundingBox) part.computeBoundingBox();
    if (!part.boundingBox || part.boundingBox.isEmpty()) continue;
    stockIndex.set(part, stock.add(soupOf(part)));
    stockBoxes.push(part.boundingBox);
  }
  hullG.updateMatrixWorld(true);
  const toHull = new THREE.Matrix4().copy(hullG.matrixWorld).invert(), matrix = new THREE.Matrix4();
  hullG.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.runningGear) return;
    matrix.multiplyMatrices(toHull, mesh.matrixWorld);
    const instanced = mesh as unknown as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) { gear.add(soupOf(mesh.geometry, matrix)); return; }
    const instance = new THREE.Matrix4(), combined = new THREE.Matrix4();
    for (let i = 0; i < instanced.count; i++) {
      instanced.getMatrixAt(i, instance);
      gear.add(soupOf(mesh.geometry, combined.multiplyMatrices(matrix, instance)));
    }
  });
  const receipts: MudguardHangerReceipt[] = [];
  for (const request of requests) {
    const position = request.part.getAttribute('position'), bounds = request.part.boundingBox!;
    // What the guard carries is not stock to hang it from: a piece riding it (its painted strip, a bolt row) inside its
    // bounds grown 30 mm, and a load resting on its top inside its plan (stowage on a fender board), whose plan the
    // stations also keep clear of.
    const own = stockIndex.get(request.part);
    const skip = new Set<number>(own === undefined ? [] : [own]), loads: THREE.Box3[] = [];
    const grown = bounds.clone().expandByScalar(0.03);
    stockBoxes.forEach((box, index) => {
      if (index === own) return;
      const rests = box.min.y >= bounds.max.y - 0.03 && box.min.y <= bounds.max.y + 0.01
        && box.min.x >= grown.min.x && box.max.x <= grown.max.x && box.min.z >= grown.min.z && box.max.z <= grown.max.z;
      if (rests) loads.push(box);
      if (rests || grown.containsBox(box)) skip.add(index);
    });
    const alongX = bounds.max.x - bounds.min.x >= bounds.max.z - bounds.min.z;
    const band = Math.min(0.04, (bounds.max.y - bounds.min.y) * 0.3);
    const top: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(position, i);
      if (v.y >= bounds.max.y - band) top.push(v);
    }
    const along = (v: THREE.Vector3) => (alongX ? v.x : v.z), across = (v: THREE.Vector3) => (alongX ? v.z : v.x);
    // The top edge as stations along the guard (vertices grouped by their position along it), interpolated between them.
    const groups = new Map<number, { a: number; y: number; c0: number; c1: number }>();
    for (const v of top) {
      const key = Math.round(along(v) * 1000);
      const group = groups.get(key) ?? { a: along(v), y: -Infinity, c0: Infinity, c1: -Infinity };
      group.y = Math.max(group.y, v.y); group.c0 = Math.min(group.c0, across(v)); group.c1 = Math.max(group.c1, across(v));
      groups.set(key, group);
    }
    const edge = [...groups.values()].sort((p, q) => p.a - q.a);
    const a0 = edge[0].a, a1 = edge[edge.length - 1].a;
    const stations: MudguardHangerStation[] = [];
    // Two stations along the top edge, the first two candidates whose strap line stands clear of every load.
    const underLoad = (t: number) => {
      const a = a0 + (a1 - a0) * t, half = STRAP_WIDTH_M / 2;
      return loads.some((box) => (alongX ? a + half >= box.min.x && a - half <= box.max.x : a + half >= box.min.z && a - half <= box.max.z));
    };
    const chosen: number[] = [];
    for (const t of STATION_CANDIDATES) {
      if (chosen.length === 2) break;
      if (!underLoad(t) && chosen.every((u) => Math.abs(u - t) >= 0.25)) chosen.push(t);
    }
    for (const t of chosen.length === 2 ? chosen : STATIONS) {
      const a = a0 + (a1 - a0) * t;
      let i = 0;
      while (i < edge.length - 2 && edge[i + 1].a < a) i++;
      const p = edge[i], q = edge[Math.min(i + 1, edge.length - 1)], f = q.a > p.a ? (a - p.a) / (q.a - p.a) : 0;
      const topY = THREE.MathUtils.lerp(p.y, q.y, f);
      const c0 = THREE.MathUtils.lerp(p.c0, q.c0, f), c1 = THREE.MathUtils.lerp(p.c1, q.c1, f), mid = (c0 + c1) / 2;
      // Over the guard's mid-thickness, or (when that line grazes a face edge) a quarter thickness toward the hull.
      const lineAt = (across: number) => {
        const line = stock.crossings(alongX ? a : across, alongX ? across : a, skip), above = line.filter((y) => y > topY - 0.001);
        return { across, line, above, stockY: above.length ? above[0] : null };
      };
      const towardHull = -Math.sign(mid) || -1;
      let probe = lineAt(mid);
      if (probe.stockY === null || probe.stockY - topY > REACH_M) {
        const inward = lineAt(mid + towardHull * (c1 - c0) * 0.25);
        if (inward.stockY !== null && inward.stockY - topY <= REACH_M) probe = inward;
      }
      const { line, above, stockY } = probe, c = probe.across;
      const x = alongX ? a : c, z = alongX ? c : a;
      // An odd count of stock faces under the guard's top: the top already stands inside stock.
      const inside = (line.length - above.length) % 2 === 1;
      if (inside || (stockY !== null && stockY - topY <= TOUCH_M)) { stations.push({ x, z, topY, stockY, strap: false, reason: 'touching' }); continue; }
      if (stockY === null || stockY - topY > REACH_M) {
        // Nothing above: an arm from the top edge, inward across the guard toward the hull's centre line, into the
        // first stock beside it (a flap hung past the hull's end or outboard of its fender).
        const dir = towardHull, face = dir < 0 ? c0 : c1, armY = topY - GRIP_M / 2;
        const reach = alongX ? stock.horizontal(a, armY, face, 0, dir, REACH_M, skip) : stock.horizontal(face, armY, a, dir, 0, REACH_M, skip);
        if (reach === null) { stations.push({ x, z, topY, stockY, strap: false, reason: 'no-stock-above' }); continue; }
        if (reach <= TOUCH_M) { stations.push({ x, z, topY, stockY, strap: false, reason: 'touching' }); continue; }
        const end = face + dir * (reach + EMBED_M), centre = (mid + end) / 2, length = Math.abs(end - mid), height = GRIP_M;
        const sx = alongX ? STRAP_WIDTH_M : length, sz = alongX ? length : STRAP_WIDTH_M;
        const ax = alongX ? a : centre, az = alongX ? centre : a;
        const footprint = new THREE.Box3(new THREE.Vector3(ax - sx / 2, armY - height / 2, az - sz / 2),
          new THREE.Vector3(ax + sx / 2, armY + height / 2, az + sz / 2));
        if (gear.touchesBox(footprint)) { stations.push({ x, z, topY, stockY, strap: false, reason: 'running-gear' }); continue; }
        addStrap(request, new THREE.BoxGeometry(sx, height, sz).translate(ax, armY, az));
        stations.push({ x, z, topY, stockY, strap: true, arm: true });
        continue;
      }
      const thickness = above.length > 1 ? above[1] - stockY : Infinity;
      const strapTop = stockY + Math.min(EMBED_M, thickness / 2), strapBottom = topY - GRIP_M;
      // within the guard's thickness wherever the line runs (mid or the inward quarter)
      const strapDepth = THREE.MathUtils.clamp((c1 - c0) * (c === mid ? 0.6 : 0.4), 0.008, 0.022);
      const w = alongX ? STRAP_WIDTH_M : strapDepth, d = alongX ? strapDepth : STRAP_WIDTH_M;
      const footprint = new THREE.Box3(new THREE.Vector3(x - w / 2, strapBottom, z - d / 2), new THREE.Vector3(x + w / 2, strapTop, z + d / 2));
      if (gear.touchesBox(footprint)) { stations.push({ x, z, topY, stockY, strap: false, reason: 'running-gear' }); continue; }
      addStrap(request, new THREE.BoxGeometry(w, strapTop - strapBottom, d).translate(x, (strapTop + strapBottom) / 2, z));
      stations.push({ x, z, topY, stockY, strap: true });
    }
    receipts.push({ label: request.label, stations });
  }
  return receipts;
}
