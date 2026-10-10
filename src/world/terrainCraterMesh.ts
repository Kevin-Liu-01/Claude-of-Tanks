/**
 * terrainCraterMesh.ts — the drawn ground follows the battle's ground overlay (crater-render-spec §B; ground lane,
 * 2026-10-08, the owner's "destructive explosions that leave holes and craters").
 *
 * The simulation drives on base + `overlay.offsetAt` (sim/terrainDeformation.ts): craters' bowls and rims, collapsed
 * structures' rubble heaps. This keeps every built terrain LOD geometry on the same ground:
 *
 * - The law. A surface vertex reads the overlay on the contact lattice (the 1.333 m grid the chunks' finest LOD and the
 *   simulation's contact surface share, −512 + i·128/96 — the overlay's own `contactOffsetAt` vertices): its height is
 *   base + offset; its normal is the base slope (recovered from the base normal) plus the overlay's gradient by 1.333 m
 *   central differences, the builder's own normal law. A vertex no stamp moves (offset and gradient exactly 0) keeps its
 *   base bits. Skirts follow their ring sources (y − SKIRT_DROP).
 * - In place. Each geometry a stamp reaches takes copies of its base heights and normals on first touch (the
 *   reference every later stamp re-applies from, so overlapping stamps never accumulate error), then only the
 *   vertices in the stamp's bounds (stampBounds, one lattice cell wider for the normals) are rewritten and uploaded as
 *   one row span plus the skirt ring.
 * - Later builds. A geometry the streamer builds after stamps (`adopt`) is built from the base as ever and patched by
 *   the same routine over every stamp that reaches its chunk, so it equals one patched in place bit for bit.
 * - Reset. A rebound overlay, an unbound one or a `reset()` (the stamp count falls, or the revision moved by more than
 *   the new stamps) restores every touched geometry from its copies, bit for bit, and drops them.
 *
 * Polled once per frame from the terrain's `updateLOD` (the `syncGroundOverlay` hook): an O(1) comparison when nothing
 * moved. No per-frame allocation; a stamp allocates only its base copies (first touch) and grows the offset scratch.
 */
import type * as THREE from 'three';
import { stampBounds, type TerrainDeformation } from '../sim/terrainDeformation.ts';

/** A terrain chunk as terrain.ts keeps it: its LOD geometries (null until built) and its south-west corner. */
interface CraterMeshChunk {
  lods: Array<THREE.BufferGeometry | null>;
  cx0: number;
  cz0: number;
}

interface CraterMeshLattice {
  lodSegs: readonly number[];
  chunkSize: number;
  half: number;
  skirtDrop: number;
}

interface CraterBase {
  /** The base heights and normals of the rows copied so far (a row is copied before a stamp first writes it). */
  y: Float32Array;
  nrm: Float32Array;
  rows: Uint8Array;
  radius: number;
}

interface TerrainCraterMeshStats {
  /** Stamps applied from the bound overlay. */
  applied: number;
  /** Geometries holding base copies (deformed, or touched by a stamp). */
  touched: number;
  /** Vertices rewritten since the bind, and the last stamp's own count and time (ms). */
  vertices: number;
  lastStampVertices: number;
  lastStampMs: number;
  /** Bytes of position and normal data marked for upload by the last stamp. */
  lastStampUploadBytes: number;
  restores: number;
}

interface TerrainCraterMesh {
  /** Follow the overlay: apply its new stamps, or restore and re-apply after a reset / rebind. */
  sync(overlay: TerrainDeformation | null): void;
  /** A geometry built after stamps (chunk index, LOD level): patch it over every stamp that reaches its chunk. */
  adopt(chunkIndex: number, level: number): void;
  readonly stats: TerrainCraterMeshStats;
}

/** terrain.ts's chunk lattice: 8 × 8 chunks of 128 m over the 1,024 m square from −512, LOD_SEGS [96, 48, 24], skirts
 * SKIRT_DROP 6.5 m below their ring (terrainCraterMesh.selftest pins each against terrain.ts's own source). */
export const TERRAIN_CRATER_LATTICE: CraterMeshLattice = Object.freeze({
  lodSegs: Object.freeze([96, 48, 24]), chunkSize: 128, half: 512, skirtDrop: 6.5,
});

/** The overlay's ceiling and floor (sim/terrainDeformation.ts: −2.5 / +3 m): a deformed geometry's bounding sphere
 * grows once by the larger, never per stamp. */
const OVERLAY_REACH_M = 3;

function createTerrainCraterMesh(chunks: readonly CraterMeshChunk[], lattice: CraterMeshLattice): TerrainCraterMesh {
  const fineSegs = lattice.lodSegs[0];
  const step = lattice.chunkSize / fineSegs;
  const inv2e = 1 / (2 * step);
  const cells = Math.round((lattice.half * 2) / step); // 768 lattice cells over the square
  const chunksPerSide = Math.round((lattice.half * 2) / lattice.chunkSize);
  const touched = new Set<THREE.BufferGeometry>();
  const stats: TerrainCraterMeshStats = { applied: 0, touched: 0, vertices: 0, lastStampVertices: 0, lastStampMs: 0,
    lastStampUploadBytes: 0, restores: 0 };
  const box = [0, 0, 0, 0];
  let overlay: TerrainDeformation | null = null;
  let appliedCount = 0;
  let appliedRevision = 0;
  // the lattice offsets of one patch region (one row of lattice samples per lattice z), grown as needed
  let grid = new Float64Array(64 * 64);
  let gx0 = 0, gz0 = 0, gw = 0;

  const latticeX = (i: number): number => -lattice.half + i * step;

  /** The overlay on the lattice over [ix0, ix1] × [iz0, iz1] (inclusive), into the scratch grid. */
  function fillGrid(ov: TerrainDeformation, ix0: number, iz0: number, ix1: number, iz1: number): void {
    gx0 = ix0; gz0 = iz0; gw = ix1 - ix0 + 1;
    const need = gw * (iz1 - iz0 + 1);
    if (grid.length < need) grid = new Float64Array(Math.max(need, grid.length * 2));
    let k = 0;
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = latticeX(iz);
      for (let ix = ix0; ix <= ix1; ix++) grid[k++] = ov.offsetAt(latticeX(ix), z);
    }
  }
  const at = (ix: number, iz: number): number => grid[(iz - gz0) * gw + (ix - gx0)];

  function baseOf(geometry: THREE.BufferGeometry, n: number): CraterBase {
    let base = geometry.userData.craterBase as CraterBase | undefined;
    if (base) return base;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    base = { y: new Float32Array(n * n), nrm: new Float32Array(n * n * 3), rows: new Uint8Array(n),
      radius: geometry.boundingSphere!.radius };
    geometry.userData.craterBase = base;
    geometry.boundingSphere!.radius = base.radius + OVERLAY_REACH_M;
    touched.add(geometry);
    stats.touched = touched.size;
    return base;
  }

  /**
   * Rewrite one geometry's vertices whose lattice indices lie in [ix0, ix1] × [iz0, iz1] by the law (the scratch grid
   * covers one more lattice cell all round). Returns the vertices written.
   */
  function patchGeometry(geometry: THREE.BufferGeometry, chunk: CraterMeshChunk, level: number,
    ix0: number, iz0: number, ix1: number, iz1: number): number {
    const segs = lattice.lodSegs[level], n = segs + 1, stride = fineSegs / segs;
    const ci = Math.round((chunk.cx0 + lattice.half) / lattice.chunkSize) * fineSegs;
    const cj = Math.round((chunk.cz0 + lattice.half) / lattice.chunkSize) * fineSegs;
    const vx0 = Math.max(0, Math.ceil((ix0 - ci) / stride)), vx1 = Math.min(segs, Math.floor((ix1 - ci) / stride));
    const vz0 = Math.max(0, Math.ceil((iz0 - cj) / stride)), vz1 = Math.min(segs, Math.floor((iz1 - cj) / stride));
    if (vx0 > vx1 || vz0 > vz1) return 0;
    const base = baseOf(geometry, n);
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nrmAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array, nrm = nrmAttr.array as Float32Array;
    // the rows' base copies, before their first write (an untouched row still holds its base bits)
    for (let vz = vz0; vz <= vz1; vz++) {
      if (base.rows[vz]) continue;
      for (let i = vz * n, e = i + n; i < e; i++) base.y[i] = pos[i * 3 + 1];
      base.nrm.set(nrm.subarray(vz * n * 3, (vz + 1) * n * 3), vz * n * 3);
      base.rows[vz] = 1;
    }
    let written = 0;
    for (let vz = vz0; vz <= vz1; vz++) {
      const iz = cj + vz * stride;
      for (let vx = vx0; vx <= vx1; vx++) {
        const ix = ci + vx * stride, vi = vz * n + vx;
        const off = at(ix, iz);
        const dxo = (at(ix - 1, iz) - at(ix + 1, iz)) * inv2e;
        const dzo = (at(ix, iz - 1) - at(ix, iz + 1)) * inv2e;
        const by = base.y[vi], bnx = base.nrm[vi * 3], bny = base.nrm[vi * 3 + 1], bnz = base.nrm[vi * 3 + 2];
        if (off === 0 && dxo === 0 && dzo === 0) {
          pos[vi * 3 + 1] = by; nrm[vi * 3] = bnx; nrm[vi * 3 + 1] = bny; nrm[vi * 3 + 2] = bnz;
        } else {
          pos[vi * 3 + 1] = by + off;
          const sx = bnx / bny + dxo, sz = bnz / bny + dzo;
          const il = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
          nrm[vi * 3] = sx * il; nrm[vi * 3 + 1] = il; nrm[vi * 3 + 2] = sz * il;
        }
        written++;
      }
      // the touched columns of this row only (a crater spans a few metres of a 128 m row)
      posAttr.addUpdateRange((vz * n + vx0) * 3, (vx1 - vx0 + 1) * 3);
      nrmAttr.addUpdateRange((vz * n + vx0) * 3, (vx1 - vx0 + 1) * 3);
    }
    let bytes = (vz1 - vz0 + 1) * (vx1 - vx0 + 1) * 24;
    // the skirt ring (S, E, N, W edges, as the builder lays it): each edge the patch reaches, one contiguous run
    const nn = n * n;
    const skirt = (k0: number, k1: number, src: (k: number) => number): void => {
      if (k0 > k1) return;
      for (let k = k0; k <= k1; k++) pos[(nn + k) * 3 + 1] = pos[src(k) * 3 + 1] - lattice.skirtDrop;
      posAttr.addUpdateRange((nn + k0) * 3, (k1 - k0 + 1) * 3);
      bytes += (k1 - k0 + 1) * 12;
    };
    if (vz0 === 0) skirt(vx0, Math.min(vx1, segs - 1), (k) => k);
    if (vx1 === segs) skirt(segs + vz0, segs + Math.min(vz1, segs - 1), (k) => (k - segs) * n + segs);
    if (vz1 === segs) skirt(3 * segs - vx1, 3 * segs - Math.max(vx0, 1), (k) => segs * n + (3 * segs - k));
    if (vx0 === 0) skirt(4 * segs - vz1, 4 * segs - Math.max(vz0, 1), (k) => (4 * segs - k) * n);
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
    stats.lastStampUploadBytes += bytes;
    return written;
  }

  /** The lattice index range of a world box, one lattice cell wider (the normals' reach), clamped to the square. */
  function latticeRange(x0: number, z0: number, x1: number, z1: number, out: number[]): void {
    out[0] = Math.max(0, Math.floor((x0 + lattice.half) / step) - 1);
    out[1] = Math.max(0, Math.floor((z0 + lattice.half) / step) - 1);
    out[2] = Math.min(cells, Math.ceil((x1 + lattice.half) / step) + 1);
    out[3] = Math.min(cells, Math.ceil((z1 + lattice.half) / step) + 1);
  }
  const range = [0, 0, 0, 0];

  /** Patch every built geometry (or one chunk's one level) over a lattice range. */
  function patchRange(ov: TerrainDeformation, only: { chunk: number; level: number } | null): number {
    const [ix0, iz0, ix1, iz1] = range;
    fillGrid(ov, ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1);
    let written = 0;
    const cxA = Math.max(0, Math.floor(ix0 / fineSegs) - (ix0 % fineSegs === 0 ? 1 : 0));
    const cxB = Math.min(chunksPerSide - 1, Math.floor(ix1 / fineSegs));
    const czA = Math.max(0, Math.floor(iz0 / fineSegs) - (iz0 % fineSegs === 0 ? 1 : 0));
    const czB = Math.min(chunksPerSide - 1, Math.floor(iz1 / fineSegs));
    for (let cz = czA; cz <= czB; cz++) {
      for (let cx = cxA; cx <= cxB; cx++) {
        const index = cz * chunksPerSide + cx;
        if (only && only.chunk !== index) continue;
        const chunk = chunks[index];
        if (!chunk) continue;
        for (let level = 0; level < chunk.lods.length; level++) {
          if (only && only.level !== level) continue;
          const geometry = chunk.lods[level];
          if (geometry) written += patchGeometry(geometry, chunk, level, ix0, iz0, ix1, iz1);
        }
      }
    }
    return written;
  }

  function applyStamp(ov: TerrainDeformation, index: number): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    stampBounds(ov.stamps[index], box);
    latticeRange(box[0], box[1], box[2], box[3], range);
    stats.lastStampUploadBytes = 0;
    const written = patchRange(ov, null);
    stats.vertices += written;
    stats.lastStampVertices = written;
    stats.lastStampMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  function restoreAll(): void {
    for (const geometry of touched) {
      const base = geometry.userData.craterBase as CraterBase | undefined;
      if (!base) continue;
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const nrmAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array, nrm = nrmAttr.array as Float32Array;
      const n = base.rows.length, nn = n * n, segs = n - 1, perim = 4 * segs;
      for (let vz = 0; vz < n; vz++) {
        if (!base.rows[vz]) continue;
        for (let i = vz * n, e = i + n; i < e; i++) pos[i * 3 + 1] = base.y[i];
        nrm.set(base.nrm.subarray(vz * n * 3, (vz + 1) * n * 3), vz * n * 3);
      }
      for (let k = 0; k < perim; k++) {
        const side = (k / segs) | 0, t = k - side * segs;
        const vx = side === 0 ? t : side === 1 ? segs : side === 2 ? segs - t : 0;
        const vz = side === 0 ? 0 : side === 1 ? t : side === 2 ? segs : segs - t;
        pos[(nn + k) * 3 + 1] = pos[(vz * n + vx) * 3 + 1] - lattice.skirtDrop;
      }
      posAttr.clearUpdateRanges(); nrmAttr.clearUpdateRanges();
      posAttr.needsUpdate = true; nrmAttr.needsUpdate = true;
      if (geometry.boundingSphere) geometry.boundingSphere.radius = base.radius;
      delete geometry.userData.craterBase;
    }
    touched.clear();
    stats.touched = 0;
    stats.restores++;
  }

  return {
    stats,
    sync(next) {
      if (next !== overlay) {
        if (touched.size) restoreAll();
        overlay = next;
        appliedCount = 0;
        appliedRevision = next ? next.revision - next.stamps.length : 0;
        stats.applied = 0; stats.vertices = 0;
      }
      if (!overlay) return;
      const ov = overlay;
      const length = ov.stamps.length;
      if (ov.revision === appliedRevision + (length - appliedCount) && length === appliedCount) return;
      // a reset in between (the revision moved more than the new stamps account for): back to the base, then all
      if (length < appliedCount || ov.revision !== appliedRevision + (length - appliedCount)) {
        if (touched.size) restoreAll();
        appliedCount = 0;
        stats.applied = 0;
      }
      for (let i = appliedCount; i < length; i++) applyStamp(ov, i);
      appliedCount = length;
      appliedRevision = ov.revision;
      stats.applied = length;
    },
    adopt(chunkIndex, level) {
      const ov = overlay;
      if (!ov || !appliedCount) return;
      const chunk = chunks[chunkIndex];
      if (!chunk || !chunk.lods[level]) return;
      const x0 = chunk.cx0, z0 = chunk.cz0, x1 = x0 + lattice.chunkSize, z1 = z0 + lattice.chunkSize;
      for (let i = 0; i < appliedCount; i++) {
        stampBounds(ov.stamps[i], box);
        if (box[2] < x0 - step || box[0] > x1 + step || box[3] < z0 - step || box[1] > z1 + step) continue;
        latticeRange(box[0], box[1], box[2], box[3], range);
        patchRange(ov, { chunk: chunkIndex, level });
      }
    },
  };
}

/**
 * Install the crater mesh on a terrain group (terrain.ts publishes `terrainChunks` and `terrainLattice`): its
 * `updateLOD` then polls `syncGroundOverlay` (the overlay `world.bindGroundOverlay` leaves in `groundOverlay`) and its
 * streamer hands every later-built level to `adoptTerrainGeometry`. Null on a group without chunks (a sandboxed build).
 */
export function installTerrainCraterMesh(group: THREE.Object3D): TerrainCraterMesh | null {
  const chunks = group.userData.terrainChunks as CraterMeshChunk[] | undefined;
  if (!chunks) return null;
  const mesh = createTerrainCraterMesh(chunks, TERRAIN_CRATER_LATTICE);
  group.userData.syncGroundOverlay = (): void =>
    mesh.sync((group.userData.groundOverlay as TerrainDeformation | null | undefined) ?? null);
  group.userData.adoptTerrainGeometry = (index: number, level: number): void => mesh.adopt(index, level);
  group.userData.craterMesh = mesh;
  return mesh;
}
