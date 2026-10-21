/**
 * structureEnclosure.ts — one drawn enclosure per structure (destruction-slabs 227, 2026-10-17; the owner, of Verdant's
 * church in battle: "for building destruction, these weird ugly boxes/surfaces still randomly come up. fix").
 *
 * The damage model's outline was an idealised house: the anatomy's four faces per storey round a box. A regional kit
 * hands over its real walls; the default and set-piece readings hand over the bounding box of every part — a church's
 * forecourt and towers, a station's canopy, a windmill's sails — so every writer that trusted those faces (the storey
 * room, the fracture's room and wall grids, the kit's rims, stubs and heap, the ruin's piers, the collapse's floors)
 * stood plates and walls in the open past the building. This is what the building actually draws, measured once at
 * describe beside the intact form (structureDamageSeam.ts), the only geometry damage writers place against:
 *
 *  - per anatomy storey band, a body-frame grid (cell = max(0.35 m, extent / 64)) of its drawn WALL cells (where the
 *    parts' near-vertical triangles cover at least 35 % of the band's height: a solid wall, a window wall, a post — not a
 *    frame's braces or a canopy's valance; named pieces, roofs and fine trim left out) and its INTERIOR cells (flood-
 *    filled from the border after gaps of 1.5 m or less are closed: doors, arcades of close columns);
 *  - the band's interior box and the share of its box that is enclosed (a frame, a trestle, a pipe run, a tank farm:
 *    little or none);
 *  - for every anatomy face and u-bin, its SETBACK: how far along −out the first drawn wall stands (NaN where none — the
 *    round passed through an opening or a frame);
 *  - over all heights, the drawn wall top per cell and the highest drawn surface (roofs too) per cell.
 * Numbers only, deterministic (the parts and the storeys alone), built once a structure; the interior's components are
 * labelled lazily on the first room a band is asked for. Presentation only: nothing here feeds the simulation.
 */
import type { BufferGeometry } from 'three';
import type { DamageFace, StructureDamageAnatomy } from './destructionKit.ts';

/** One storey band's drawn enclosure. */
export interface EnclosureBand {
  readonly y0: number;
  readonly y1: number;
  /** Per cell: 0 open, 1 a drawn wall, bit 2 enclosed, bit 4 (with 2) covered — something drawn over three quarters of
   *  the band's height there (a roof, an upper floor; not a court under the sky). */
  readonly cells: Uint8Array;
  /** The enclosed cells' box [minX, minZ, maxX, maxZ] (body frame; NaN for none) and the walls' and theirs together. */
  readonly interiorBox: Float64Array;
  readonly solidBox: Float64Array;
  /** The enclosed area (m²) and its share of the walls' box less the walls. */
  readonly interiorM2: number;
  readonly share: number;
  /** Per anatomy face of the storey (by index): the setback (m inward from the face's plane) a u-bin of `bin` m from u =
   *  −width/2; NaN where no wall stands behind it. */
  readonly setback: Float32Array[];
  readonly bin: number;
  /** The enclosed cells' components (4-connected), labelled on first use; 0 for none. */
  labels: Int32Array | null;
}

export interface StructureEnclosure {
  /** The grid: its corner (body frame), cell size and counts. */
  readonly x0: number;
  readonly z0: number;
  readonly cell: number;
  readonly nx: number;
  readonly nz: number;
  readonly bands: EnclosureBand[];
  /** Per cell: the drawn walls' top (cm over the body's floor; 0 none). */
  readonly top: Uint16Array;
  /** Per cell: the drawn walls' lowest point (the same cm; 0 none): a wall drawn from low under its top, not a parapet. */
  readonly base?: Uint16Array;
  /** Per cell: the highest thing drawn over it, a wall's top or a covering (the same cm; 0 none; absent for a probe). */
  readonly over?: Uint16Array;
}

/** Buckets that are no wall: the roofs and thatch (a window's glass and a curtain wall enclose as a wall does). */
const SKIP_BUCKETS: ReadonlySet<string> = new Set(['roof', 'regionalRoof', 'straw', 'thatch', 'hay']);
/** Buckets that cover (a roof over a room): counted in `over` only. */
const COVER_BUCKETS: ReadonlySet<string> = new Set(['roof', 'regionalRoof', 'straw', 'thatch', 'hay']);
const CELL_MIN_M = 0.35;
const GRID_SPAN = 64;
/** Gaps a band's walls close (m): a door, a narrow arcade. */
const CLOSE_GAP_M = 1.5;
/** How far proud of a face its setback may read a wall (m): a regional kit's face is its wall within a hand. */
const PROUD_M = 0.35;
/** A near-vertical triangle: its normal within 30 degrees of level. */
const VERTICAL_NY = 0.5;

const parts3 = new Float64Array(15);
const clipA = new Float64Array(18), clipB = new Float64Array(18);

/** Sutherland-Hodgman: a polygon (xyz triples, n of them) clipped to y ≥ lo (sign 1) or y ≤ hi (sign −1); the count kept. */
function clipY(src: Float64Array, n: number, at: number, sign: 1 | -1, dst: Float64Array): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ay = src[i * 3 + 1], by = src[j * 3 + 1];
    const ain = sign > 0 ? ay >= at : ay <= at, bin = sign > 0 ? by >= at : by <= at;
    if (ain) { dst[m * 3] = src[i * 3]; dst[m * 3 + 1] = ay; dst[m * 3 + 2] = src[i * 3 + 2]; m++; }
    if (ain !== bin) {
      const t = (at - ay) / (by - ay);
      dst[m * 3] = src[i * 3] + (src[j * 3] - src[i * 3]) * t; dst[m * 3 + 1] = at; dst[m * 3 + 2] = src[i * 3 + 2] + (src[j * 3 + 2] - src[i * 3 + 2]) * t;
      m++;
    }
  }
  return m;
}

/** A geometry's positions as an array, its stride and first offset (an interleaved buffer's too); null when it has none
 *  or they are normalized (no structure's are). */
export function positionsOf(g: BufferGeometry): { array: ArrayLike<number>; stride: number; offset: number; count: number } | null {
  const pos = g.getAttribute('position') as (BufferGeometry['attributes'][string] & { isInterleavedBufferAttribute?: boolean;
    data?: { array: ArrayLike<number>; stride: number }; offset?: number }) | undefined;
  if (!pos || pos.normalized) return null;
  if (pos.isInterleavedBufferAttribute) return { array: pos.data!.array, stride: pos.data!.stride, offset: pos.offset ?? 0, count: pos.count };
  return { array: (pos as { array: ArrayLike<number> }).array, stride: pos.itemSize, offset: 0, count: pos.count };
}

/**
 * The drawn enclosure of a structure from its parts (body frame, by bucket) and its anatomy's storeys; null when it draws
 * no wall. Built once at describe (structureDamageSeam.ts).
 */
export function measureEnclosure(parts: Readonly<Record<string, readonly BufferGeometry[]>> | null | undefined,
  anatomy: Pick<StructureDamageAnatomy, 'storeys'>, { cover = true }: { cover?: boolean } = {}): StructureEnclosure | null {
  if (!parts || !anatomy.storeys.length) return null;
  // (a named piece falls on its own, but a vessel stands with the body: landmarks/pieces.ts damageStands)
  const keep = (bucket: string, g: BufferGeometry): boolean => !SKIP_BUCKETS.has(bucket) && (!g.userData?.damagePiece || g.userData?.damageStands === true)
    && g.userData?.fine !== true;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [bucket, list] of Object.entries(parts)) for (const g of list ?? []) {
    if (!keep(bucket, g) && !COVER_BUCKETS.has(bucket)) continue;
    const src = positionsOf(g);
    if (!src) continue;
    const { array, stride, offset, count } = src;
    for (let i = 0, o = offset; i < count; i++, o += stride) {
      const x = array[o]!, z = array[o + 2]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const cell = Math.max(CELL_MIN_M, Math.max(maxX - minX, maxZ - minZ) / GRID_SPAN);
  // a margin round the parts wider than the gap closing reaches (the outside's flood starts at the border)
  const r = Math.max(1, Math.ceil((CLOSE_GAP_M / 2) / cell)), margin = r + 2;
  const x0 = minX - margin * cell, z0 = minZ - margin * cell;
  const nx = Math.ceil((maxX - minX) / cell) + 2 * margin + 1, nz = Math.ceil((maxZ - minZ) / cell) + 2 * margin + 1;
  const N = nx * nz;
  const storeys = anatomy.storeys;
  const bin = cell;
  const bands = storeys.map((st) => ({
    y0: st.y0, y1: st.y1, cells: new Uint8Array(N), setback: st.faces.map((f) => new Float32Array(Math.max(1, Math.ceil(f.width / bin))).fill(NaN)),
    // (build scratch) the band's wall cover per cell (m of its height), and its walls' plan segments
    cover: new Float32Array(N), segs: [] as number[],
    // a face's setback reads no farther in than past the body's middle (a wall beyond is the far side's, seen through an
    // opening): 55 % of the way to the opposite face
    maxBack: st.faces.map((f) => {
      let across = Infinity;
      for (const g of st.faces) {
        if (f.out[0] * g.out[0] + f.out[2] * g.out[2] > -0.9) continue;
        across = Math.min(across, Math.abs((f.origin[0] - g.origin[0]) * f.out[0] + (f.origin[2] - g.origin[2]) * f.out[2]));
      }
      return Number.isFinite(across) ? 0.55 * across : Infinity;
    }),
  }));
  const top = new Uint16Array(N), over = new Uint16Array(N), base = new Uint16Array(N);
  const cm = (y: number): number => Math.max(1, Math.min(65535, Math.round(y * 100) + 1));
  const invCell = 1 / cell;
  const cellOf = (x: number, z: number): number => {
    const i = Math.floor((x - x0) * invCell), k = Math.floor((z - z0) * invCell);
    return i >= 0 && k >= 0 && i < nx && k < nz ? k * nx + i : -1;
  };
  const step = cell * 0.5;
  // (destruction-slabs 227 round 2, the critic's load-time CPU: +19 % on urban's props build) the walks below run inline
  // over the position arrays, a triangle or an edge whose corners share one cell updates that cell once (what its samples
  // would: a cell is convex, and a linear height's extremes are at its corners), and a covering's samples step across
  // it (no division a sample: 8 million of them on urban)
  /** A wall edge into top / over / base: every cell it crosses, its height's extremes where it crosses (a grid walk). */
  const mark = (c: number, qa: number, qb: number, wall: boolean): void => {
    const hi = qa > qb ? qa : qb, lo = qa < qb ? qa : qb;
    if (hi > over[c]!) over[c] = hi;
    if (wall) {
      if (hi > top[c]!) top[c] = hi;
      if (!base[c] || lo < base[c]!) base[c] = lo;
    }
  };
  const edgeTop = (ax: number, az: number, ay: number, bx: number, bz: number, by: number, wall: boolean): void => {
    const gx = (ax - x0) * invCell, gz = (az - z0) * invCell, ex = (bx - x0) * invCell, ez = (bz - z0) * invCell;
    let ci = Math.floor(gx), ck = Math.floor(gz);
    const ti = Math.floor(ex), tk = Math.floor(ez);
    if (ci === ti && ck === tk) {
      if (ci >= 0 && ck >= 0 && ci < nx && ck < nz) mark(ck * nx + ci, cm(ay), cm(by), wall);
      return;
    }
    const dx = ex - gx, dz = ez - gz;
    const si = dx > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? ci + 1 - gx : gx - ci) * tdx : Infinity;
    let tz = dz !== 0 ? (dz > 0 ? ck + 1 - gz : gz - ck) * tdz : Infinity;
    let t0 = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const t1 = Math.min(tx, tz, 1);
      if (ci >= 0 && ck >= 0 && ci < nx && ck < nz) mark(ck * nx + ci, cm(ay + (by - ay) * t0), cm(ay + (by - ay) * t1), wall);
      if (t1 >= 1 || (ci === ti && ck === tk)) break;
      if (tx < tz) { ci += si; t0 = tx; tx += tdx; } else { ck += sk; t0 = tz; tz += tdz; }
    }
  };
  for (const [bucket, list] of Object.entries(parts)) for (const g of list ?? []) {
    const wall = keep(bucket, g);
    const covers = cover && COVER_BUCKETS.has(bucket) && (!g.userData?.damagePiece || g.userData?.damageStands === true);
    if (!wall && !covers) continue;
    const src = positionsOf(g);
    if (!src) continue;
    const { array, stride, offset } = src;
    const index = g.getIndex();
    const idx = index ? index.array : null;
    const n = idx ? index!.count : src.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const o = offset + (idx ? idx[t + k]! : t + k) * stride;
        parts3[k * 3] = array[o]!; parts3[k * 3 + 1] = array[o + 1]!; parts3[k * 3 + 2] = array[o + 2]!;
      }
      const ux = parts3[3] - parts3[0], uy = parts3[4] - parts3[1], uz = parts3[5] - parts3[2];
      const wx = parts3[6] - parts3[0], wy = parts3[7] - parts3[1], wz = parts3[8] - parts3[2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (!(fl > 1e-9)) continue;
      const vertical = Math.abs(fy) <= VERTICAL_NY * fl;
      if (!vertical) {
        // a slope, a deck, a roof: what covers the plan under it (its area sampled at a cell; none for a probe)
        if (!cover) continue;
        const c0 = cellOf(parts3[0], parts3[2]);
        if (c0 >= 0 && c0 === cellOf(parts3[3], parts3[5]) && c0 === cellOf(parts3[6], parts3[8])) {
          const y = cm(Math.max(parts3[1], parts3[4], parts3[7]));
          if (y > over[c0]!) over[c0] = y;
          continue;
        }
        const ex3 = parts3[6] - parts3[3], ez3 = parts3[8] - parts3[5];
        const reach = Math.sqrt(Math.max(ux * ux + uz * uz, wx * wx + wz * wz, ex3 * ex3 + ez3 * ez3));
        const m = Math.max(1, Math.min(64, Math.ceil(reach / cell)));
        const im = 1 / m;
        const dux = ux * im, duy = uy * im, duz = uz * im, dwx = wx * im, dwy = wy * im, dwz = wz * im;
        // (in cell units from the grid's corner, heights in cm: one floor a coordinate a sample)
        const gx0 = (parts3[0] - x0) * invCell, gz0 = (parts3[2] - z0) * invCell, gy0 = parts3[1] * 100;
        const gdux = dux * invCell, gduz = duz * invCell, gdwx = dwx * invCell, gdwz = dwz * invCell, gduy = duy * 100, gdwy = dwy * 100;
        for (let i = 0; i <= m; i++) {
          let gx = gx0 + gdux * i, gz = gz0 + gduz * i, gy = gy0 + gduy * i;
          for (let j = 0; j <= m - i; j++, gx += gdwx, gz += gdwz, gy += gdwy) {
            const ci = Math.floor(gx), ck = Math.floor(gz);
            if (ci < 0 || ck < 0 || ci >= nx || ck >= nz) continue;
            const c = ck * nx + ci;
            const y = Math.max(1, Math.min(65535, Math.round(gy) + 1));
            if (y > over[c]!) over[c] = y;
          }
        }
        continue;
      }
      // a wall: its top over the plan along its edges, and what covers there
      if (cover) {
        edgeTop(parts3[0], parts3[2], parts3[1], parts3[3], parts3[5], parts3[4], wall);
        edgeTop(parts3[3], parts3[5], parts3[4], parts3[6], parts3[8], parts3[7], wall);
        edgeTop(parts3[6], parts3[8], parts3[7], parts3[0], parts3[2], parts3[1], wall);
      }
      if (!wall) continue;
      const lo = Math.min(parts3[1], parts3[4], parts3[7]), hi = Math.max(parts3[1], parts3[4], parts3[7]);
      for (let s = 0; s < bands.length; s++) {
        const band = bands[s];
        if (Math.min(hi, band.y1) - Math.max(lo, band.y0) < 0.05) continue;
        // its part in the band, and that part's plan as a segment between its farthest corners (kept for the setbacks)
        // (a triangle wholly in the band is its own part: two thirds of them)
        let m: number;
        if (lo >= band.y0 && hi <= band.y1) { clipB.set(parts3.subarray(0, 9)); m = 3; } else {
          m = clipY(parts3, 3, band.y0, 1, clipA);
          if (m < 2) continue;
          m = clipY(clipA, m, band.y1, -1, clipB);
          if (m < 2) continue;
        }
        let ia = 0, ib = 0, best = -1;
        for (let i = 0; i < m; i++) {
          for (let j = i + 1; j < m; j++) {
            const d = (clipB[i * 3] - clipB[j * 3]) ** 2 + (clipB[i * 3 + 2] - clipB[j * 3 + 2]) ** 2;
            if (d > best) { best = d; ia = i; ib = j; }
          }
        }
        const ax = clipB[ia * 3], az = clipB[ia * 3 + 2], bx = clipB[ib * 3], bz = clipB[ib * 3 + 2];
        band.segs.push(ax, az, bx, bz);
        // how much wall it lays over each cell of its plan: its area in the band spread along its plan length (a solid
        // wall covers the band's height, a frame's braces and a canopy's valance a strip of it)
        let area = 0;
        for (let i = 1; i + 1 < m; i++) {
          const ex = clipB[i * 3] - clipB[0], ey = clipB[i * 3 + 1] - clipB[1], ez = clipB[i * 3 + 2] - clipB[2];
          const gx = clipB[(i + 1) * 3] - clipB[0], gy = clipB[(i + 1) * 3 + 1] - clipB[1], gz = clipB[(i + 1) * 3 + 2] - clipB[2];
          { const qx = ey * gz - ez * gy, qy = ez * gx - ex * gz, qz = ex * gy - ey * gx; area += 0.5 * Math.sqrt(qx * qx + qy * qy + qz * qz); }
        }
        const len = Math.sqrt(best);
        const samples = Math.max(1, Math.ceil(len / step)) + 1;
        const each = (area / Math.max(len, 1e-3)) * (Math.max(len, 0.02) / samples) / cell;
        // (the walk's samples: n + 1 of them for n = ceil(len / step))
        const cover0 = band.cover;
        const ca = cellOf(ax, az);
        if (ca === cellOf(bx, bz)) {
          if (ca >= 0) for (let q = 0; q < samples; q++) cover0[ca] += each;
        } else {
          const sn = samples - 1;
          for (let q = 0; q <= sn; q++) {
            const tt = q / sn;
            const c = cellOf(ax + (bx - ax) * tt, az + (bz - az) * tt);
            if (c >= 0) cover0[c] += each;
          }
        }
      }
    }
  }
  // a wall cell: the band's walls cover 35 % of its height there (0.6 m at least); then each face's setback to the first
  // such cell along its segments
  for (let s = 0; s < bands.length; s++) {
    const band = bands[s];
    const need = Math.max(0.6, 0.35 * (band.y1 - band.y0));
    for (let c = 0; c < N; c++) if (band.cover[c]! >= need) band.cells[c] = 1;
    const faces = storeys[s].faces;
    const segs = band.segs;
    // (a hole goes on a wall that stands through the band: a garden wall or a parapet low in front of it is no face's)
    const tall = cm(band.y0 + 0.7 * (band.y1 - band.y0));
    const cells = band.cells;
    for (let q = 0; q + 3 < segs.length; q += 4) {
      const ax = segs[q]!, az = segs[q + 1]!, bx = segs[q + 2]!, bz = segs[q + 3]!;
      // (a segment within one cell that is no tall wall cell sets nothing)
      const ca = cellOf(ax, az);
      if (ca === cellOf(bx, bz) && (ca < 0 || cells[ca] !== 1 || top[ca]! < tall)) continue;
      const n = Math.max(1, Math.ceil(Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) / step));
      for (let st = 0; st <= n; st++) {
        const t = st / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const c = cellOf(x, z);
        if (c < 0 || cells[c] !== 1 || top[c]! < tall) continue;
        for (let f = 0; f < faces.length; f++) {
          const face = faces[f]!;
          const ox = x - face.origin[0], oz = z - face.origin[2];
          const u = ox * face.u[0] + oz * face.u[2];
          const d = -(ox * face.out[0] + oz * face.out[2]);
          if (d < -PROUD_M || d > band.maxBack[f]! || Math.abs(u) > face.width / 2) continue;
          const list = band.setback[f]!;
          const k = Math.min(list.length - 1, Math.max(0, Math.floor((u + face.width / 2) / bin)));
          if (!(list[k]! <= d)) list[k] = d;
        }
      }
    }
  }
  let any = false;
  const out: EnclosureBand[] = bands.map((b) => {
    enclose(b.cells, nx, nz, r);
    // covered: something drawn over the enclosed cell above three quarters of the band's height
    const coverCm = Math.round((b.y0 + 0.75 * (b.y1 - b.y0)) * 100) + 1;
    for (let c = 0; c < N; c++) if (b.cells[c] === 2 && over[c]! >= coverCm) b.cells[c] = 6;
    // the interior's box over its rooms, not its pockets (a few cells shut between a canopy's posts and the wall): the
    // components of at least 2 m² and a tenth of the largest
    const labels = labelComponents(b.cells, nx, nz);
    const sizes: number[] = [0];
    for (let c = 0; c < N; c++) if (labels[c]) sizes[labels[c]!] = (sizes[labels[c]!] ?? 0) + 1;
    let largest = 0;
    for (let l = 1; l < sizes.length; l++) largest = Math.max(largest, sizes[l]!);
    const minCells = Math.max(Math.ceil(2 / (cell * cell)), 0.1 * largest);
    let walls = 0, inside = 0;
    const ib = Float64Array.of(Infinity, Infinity, -Infinity, -Infinity), sb = Float64Array.of(Infinity, Infinity, -Infinity, -Infinity);
    let si0 = Infinity, si1 = -Infinity, sk0 = Infinity, sk1 = -Infinity;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const c = k * nx + i;
      const v = b.cells[c];
      if (!v) continue;
      if (v === 1) walls++; else inside++;
      if (v & 2 && sizes[labels[c]!]! < minCells) continue;
      if (v & 2) { ib[0] = Math.min(ib[0], x0 + i * cell); ib[1] = Math.min(ib[1], z0 + k * cell); ib[2] = Math.max(ib[2], x0 + (i + 1) * cell); ib[3] = Math.max(ib[3], z0 + (k + 1) * cell); }
      si0 = Math.min(si0, i); si1 = Math.max(si1, i); sk0 = Math.min(sk0, k); sk1 = Math.max(sk1, k);
    }
    if (walls) any = true;
    if (Number.isFinite(si0)) { sb[0] = x0 + si0 * cell; sb[1] = z0 + sk0 * cell; sb[2] = x0 + (si1 + 1) * cell; sb[3] = z0 + (sk1 + 1) * cell; }
    if (!Number.isFinite(ib[0])) ib.fill(NaN);
    if (!Number.isFinite(sb[0])) sb.fill(NaN);
    const boxCells = Number.isFinite(si0) ? (si1 - si0 + 1) * (sk1 - sk0 + 1) : 0;
    return { y0: b.y0, y1: b.y1, cells: b.cells, interiorBox: ib, solidBox: sb, interiorM2: inside * cell * cell,
      share: inside / Math.max(1, boxCells - walls), setback: b.setback, bin, labels: null };
  });
  if (!any) return null;
  return { x0, z0, cell, nx, nz, bands: out, top, ...(cover ? { over, base } : {}) };
}

/** Close a band's wall cells' gaps of up to 2r cells, flood the outside from the border, give the outside back the cells
 *  the closing took from it (a walk of up to r cells round no wall), and mark what is left (not a wall) enclosed (2).
 *  Returns the enclosed count. */
function enclose(cells: Uint8Array, nx: number, nz: number, r: number): number {
  const N = nx * nz;
  // the walls dilated by r (a square: two passes of a running window)
  const rows = new Uint8Array(N), grown = new Uint8Array(N);
  for (let k = 0; k < nz; k++) {
    let last = -Infinity;
    for (let i = 0; i < nx; i++) { if (cells[k * nx + i] === 1) last = i; if (i - last <= r) rows[k * nx + i] = 1; }
    last = Infinity;
    for (let i = nx - 1; i >= 0; i--) { if (cells[k * nx + i] === 1) last = i; if (last - i <= r) rows[k * nx + i] = 1; }
  }
  for (let i = 0; i < nx; i++) {
    let last = -Infinity;
    for (let k = 0; k < nz; k++) { if (rows[k * nx + i]) last = k; if (k - last <= r) grown[k * nx + i] = 1; }
    last = Infinity;
    for (let k = nz - 1; k >= 0; k--) { if (rows[k * nx + i]) last = k; if (last - k <= r) grown[k * nx + i] = 1; }
  }
  // the outside: from the border over what the grown walls leave open
  const dist = new Int32Array(N).fill(-1);
  let queue: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < nx; i++) { stack.push(i, (nz - 1) * nx + i); }
  for (let k = 0; k < nz; k++) { stack.push(k * nx, k * nx + nx - 1); }
  while (stack.length) {
    const c = stack.pop()!;
    if (dist[c] >= 0 || grown[c]) continue;
    dist[c] = 0;
    queue.push(c);
    const i = c % nx, k = (c - i) / nx;
    if (i > 0) stack.push(c - 1);
    if (i < nx - 1) stack.push(c + 1);
    if (k > 0) stack.push(c - nx);
    if (k < nz - 1) stack.push(c + nx);
  }
  // back up to the walls (never through one): r steps of a walk over open cells
  for (let d = 1; d <= r && queue.length; d++) {
    const next: number[] = [];
    for (const c of queue) {
      const i = c % nx, k = (c - i) / nx;
      for (const [di, dk] of DIRS) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const cc = kk * nx + ii;
        if (dist[cc] >= 0 || cells[cc] === 1) continue;
        dist[cc] = d;
        next.push(cc);
      }
    }
    queue = next;
  }
  let inside = 0;
  for (let c = 0; c < N; c++) if (cells[c] !== 1 && dist[c] < 0) { cells[c] = 2; inside++; }
  return inside;
}
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---- readers -----------------------------------------------------------------------------------------------------

const enclosureOf = (a: Pick<StructureDamageAnatomy, 'enclosure'>): StructureEnclosure | null => (a.enclosure as StructureEnclosure | undefined) ?? null;

/** A plan point's cell, or −1 off the grid. */
export function enclosureCell(enc: StructureEnclosure, x: number, z: number): number {
  const i = Math.floor((x - enc.x0) / enc.cell), k = Math.floor((z - enc.z0) / enc.cell);
  return i >= 0 && k >= 0 && i < enc.nx && k < enc.nz ? k * enc.nx + i : -1;
}

/**
 * The setback of a storey face at u (m inward along −out from the face's plane to the first drawn wall in that band):
 * 0 where the structure has no enclosure (a kit's faces are its walls), NaN where no wall stands behind that stretch.
 */
export function faceSetback(anatomy: Pick<StructureDamageAnatomy, 'enclosure' | 'storeys'>, storey: number, faceIndex: number, u: number): number {
  const enc = enclosureOf(anatomy);
  const band = enc?.bands[storey];
  const list = band?.setback[faceIndex];
  const face = anatomy.storeys[storey]?.faces[faceIndex];
  if (!band || !list || !face) return 0;
  const k = Math.floor((u + face.width / 2) / band.bin);
  if (k < 0 || k >= list.length) return NaN;
  const v = list[k];
  if (Number.isFinite(v)) return v;
  // a bin between two walls (a sample walk's gap): its neighbours'
  const a = list[k - 1], b = list[k + 1];
  return Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : NaN;
}

/** A face's median setback over the bins a wall stands behind (NaN for none) and the share of its bins that have one. */
export function faceSetbackMedian(anatomy: Pick<StructureDamageAnatomy, 'enclosure' | 'storeys'>, storey: number, faceIndex: number): { median: number; share: number } {
  const enc = enclosureOf(anatomy);
  const list = enc?.bands[storey]?.setback[faceIndex];
  if (!list) return { median: 0, share: 1 };
  const vals: number[] = [];
  for (let i = 0; i < list.length; i++) if (Number.isFinite(list[i])) vals.push(list[i]);
  if (!vals.length) return { median: NaN, share: 0 };
  vals.sort((p, q) => p - q);
  return { median: vals[vals.length >> 1], share: vals.length / list.length };
}

/** Whether a plan point is drawn over in a band (a wall or enclosed), within `growM`; null where nothing restricts. */
export function enclosedAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, growM = 0, band = -1): boolean | null {
  const enc = enclosureOf(anatomy);
  if (!enc) return null;
  const r = Math.max(0, Math.ceil(growM / enc.cell));
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
    const i = ci + di, k = ck + dk;
    if (i < 0 || k < 0 || i >= enc.nx || k >= enc.nz) continue;
    if (di * di + dk * dk > r * r + 1) continue;
    const c = k * enc.nx + i;
    if (band >= 0) { if (enc.bands[band]?.cells[c]) return true; continue; }
    for (const b of enc.bands) if (b.cells[c]) return true;
  }
  return false;
}

/** Whether a drawn wall stands at a plan point in a band, within `growM`; null where nothing restricts. */
export function wallAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, band: number, x: number, z: number, growM = 0): boolean | null {
  const enc = enclosureOf(anatomy);
  const b = enc?.bands[band];
  if (!enc || !b) return null;
  const r = Math.max(0, Math.ceil(growM / enc.cell));
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && k >= 0 && i < enc.nx && k < enc.nz && b.cells[k * enc.nx + i] === 1) return true;
  }
  return false;
}

/** The drawn walls' top over a plan point (body y, the highest within `reach` cells: one by default, none for the point's
 *  own cell); +Infinity where nothing restricts, −1 for none drawn there. */
export function wallTopAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, reach = 1): number {
  const enc = enclosureOf(anatomy);
  if (!enc) return Infinity;
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  let best = 0;
  for (let dk = -reach; dk <= reach; dk++) for (let di = -reach; di <= reach; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && k >= 0 && i < enc.nx && k < enc.nz) best = Math.max(best, enc.top[k * enc.nx + i]);
  }
  return best ? (best - 1) / 100 : -1;
}

/** The lowest a wall is drawn at a plan point (body y, its own cell): −Infinity where nothing is known (no enclosure, no
 *  bases measured), +Infinity where no wall is drawn there. */
export function wallBaseAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number): number {
  const enc = enclosureOf(anatomy);
  if (!enc?.base) return -Infinity;
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  if (ci < 0 || ck < 0 || ci >= enc.nx || ck >= enc.nz) return Infinity;
  const b = enc.base[ck * enc.nx + ci]!;
  return b ? (b - 1) / 100 : Infinity;
}

/** The highest thing drawn over a plan point (body y: a wall's top or a covering, a tank's roof, a deck), within `reach`
 *  cells; +Infinity where nothing restricts, −1 for nothing drawn there. */
export function drawnOverAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, reach = 1): number {
  const enc = enclosureOf(anatomy);
  if (!enc) return Infinity;
  const grid = enc.over ?? enc.top;
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  let best = 0;
  for (let dk = -reach; dk <= reach; dk++) for (let di = -reach; di <= reach; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && k >= 0 && i < enc.nx && k < enc.nz) best = Math.max(best, grid[k * enc.nx + i]!);
  }
  return best ? (best - 1) / 100 : -1;
}

/**
 * From a plan point along a level direction, the distance to the first drawn wall of a band within `maxM` (NaN for none):
 * a ruin's pier or stub stands there, not in the open past it.
 */
export function wallAlong(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, band: number, x: number, z: number, dx: number, dz: number, maxM: number): number {
  const enc = enclosureOf(anatomy);
  const b = enc?.bands[band];
  if (!enc || !b) return 0;
  const step = enc.cell * 0.5;
  for (let d = 0; d <= maxM; d += step) {
    const c = enclosureCell(enc, x + dx * d, z + dz * d);
    if (c >= 0 && b.cells[c] === 1) return d;
  }
  return NaN;
}

/** A band's enclosed share and interior box (body frame), or null where the structure has no enclosure. */
export function bandEnclosure(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, band: number): EnclosureBand | null {
  return enclosureOf(anatomy)?.bands[band] ?? null;
}

/**
 * Whether a structure stands on posts (an open frame by what it draws, whatever its walls are named): every band encloses
 * under `share` of its box AND the ground band's walls are posts — no cluster of its wall cells runs `postM` or more (a
 * fire lookout's legs, a market's stall posts). A ruin's ragged walls, a gate's arch piers or a depot's open front enclose
 * little too, but their walls are runs, not posts (destruction-slabs 227 round 2: reading "most bands under 35 %" made
 * the ruins, gates, depots and warehouses frames, their ruins rafts).
 */
export function standsOnPosts(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, share = 0.35, postM = 2): boolean {
  const enc = enclosureOf(anatomy);
  const b = enc?.bands[0];
  if (!enc || !b) return false;
  for (const band of enc.bands) if (!(band.share < share)) return false;
  const { nx, nz, cell } = enc;
  const longest = Math.max(1, Math.ceil(postM / cell));
  const seen = new Uint8Array(nx * nz);
  const stack: number[] = [];
  let any = false;
  for (let c0 = 0; c0 < b.cells.length; c0++) {
    if (b.cells[c0] !== 1 || seen[c0]) continue;
    any = true;
    stack.push(c0);
    seen[c0] = 1;
    let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity;
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % nx, k = (c - i) / nx;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
      if (i1 - i0 + 1 >= longest || k1 - k0 + 1 >= longest) return false;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const cc = kk * nx + ii;
        if (b.cells[cc] === 1 && !seen[cc]) { seen[cc] = 1; stack.push(cc); }
      }
    }
  }
  return any;
}

/** A storey room laid behind a hole: its floor and ceiling rectangles, its inward walls, its heights, and its key. */
export interface StoreyInterior {
  /** Rectangles [x0, z0, x1, z1] (body frame) the floor and ceiling cover. */
  rects: number[][];
  /** Inward walls: [ax, az, bx, bz, nx, nz] (a plan segment and its normal into the room). */
  walls: number[][];
  y0: number;
  y1: number;
  /** Unique per storey and component: a room is laid once. */
  key: string;
}

const ROOM_MIN_M2 = 2;
const ROOM_MIN_SHARE = 0.5;
/**
 * A room is at least this deep across its plan both ways (m): a pocket the gap closing shuts (a porch under a portico's
 * podium, a step's recess, the bay between two buttresses) is no room (blackglass's civic hall, 2026-10-17: a 1.5 m porch
 * pocket got a room whose walls stood in its open entrance).
 */
const ROOM_MIN_SPAN_M = 1.9;
/**
 * At most this share of a room's edge may be open to the outside (the rest its drawn walls): a space shut only by the gap
 * closing between posts (an ore bin's legs and its ladder, a colonnade) is no room (Copper Mesa's ore bin, 2026-10-17: a
 * room laid between its legs under the hopper).
 */
const ROOM_MAX_OPEN = 0.35;
/** How far round the hint a room's component is looked for (m). */
const HINT_REACH_M = 2.5;

/**
 * The room behind a hole on a storey: the enclosed component behind the hint (a body-frame plan point just inside the
 * hole), less what nothing covers (a court, a yard under the sky), covered by rectangles, its boundary its inward walls,
 * its ceiling capped at the band's drawn wall top round it (and `capY`). Null when the band encloses under half its box
 * (a frame, a trestle, a pipe run, a tank farm), the component is under 2 m², or no enclosed cell is near the hint; and
 * for a structure without an enclosure (null too: lay none).
 */
export function storeyInterior(anatomy: Pick<StructureDamageAnatomy, 'enclosure' | 'storeys' | 'intact'>, storey: number, hintX: number,
  hintZ: number, capY = Infinity): StoreyInterior | null {
  const enc = enclosureOf(anatomy);
  // a structure measured without its parts (a kit's own reading handed over whole): its faces are its walls; one measured
  // from its parts that encloses nothing it draws has no room (Saltwind's house row, every house a named piece of the set
  // piece: the faces' box over the whole row stood as three storeys of room boxes once the houses slumped)
  if (!enc) return anatomy.intact ? null : facesInterior(anatomy, storey, capY);
  const band = enc.bands[storey];
  if (!band || band.share < ROOM_MIN_SHARE || band.interiorM2 < ROOM_MIN_M2) return null;
  const { nx, nz, cell, x0, z0 } = enc;
  if (!band.labels) band.labels = labelComponents(band.cells, nx, nz);
  const labels = band.labels;
  // the component: the hint's cell, else the nearest enclosed cell within reach
  let label = 0;
  const hc = enclosureCell(enc, hintX, hintZ);
  if (hc >= 0 && labels[hc]) label = labels[hc];
  else {
    const r = Math.ceil(HINT_REACH_M / cell), ci = Math.floor((hintX - x0) / cell), ck = Math.floor((hintZ - z0) / cell);
    let best = Infinity;
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const i = ci + di, k = ck + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const l = labels[k * nx + i];
      const d = di * di + dk * dk;
      if (l && d < best) { best = d; label = l; }
    }
  }
  if (!label) return null;
  // its edge: open to the outside, or a drawn wall
  {
    let open = 0, walled = 0;
    for (let c = 0; c < labels.length; c++) {
      if (labels[c] !== label) continue;
      const i = c % nx, k = (c - i) / nx;
      for (const [di, dk] of DIRS) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) { open++; continue; }
        const v = band.cells[kk * nx + ii];
        if (v === 0) open++;
        else if (v === 1) walled++;
      }
    }
    if (open > ROOM_MAX_OPEN * (open + walled)) return null;
  }
  // its ceiling: under the band's top, at the drawn walls round it (their median top), never under a metre over its floor
  const y0 = band.y0 + 0.03;
  const tops: number[] = [];
  for (let c = 0; c < labels.length; c++) {
    if (labels[c] !== label) continue;
    const i = c % nx, k = (c - i) / nx;
    for (const [di, dk] of DIRS) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const cc = kk * nx + ii;
      if (band.cells[cc] === 1 && enc.top[cc]) tops.push((enc.top[cc] - 1) / 100);
    }
  }
  tops.sort((p, q) => p - q);
  const wallTop = tops.length ? tops[tops.length >> 1] : band.y1;
  const y1 = Math.min(capY, band.y1 - 0.06, Math.max(y0 + 1, wallTop - 0.06));
  if (!(y1 - y0 > 0.8)) return null;
  // the room: the component's cells something covers (a roof, an upper floor: not a court under the sky)
  const inRoom = new Uint8Array(nx * nz);
  let n = 0;
  // (destruction-slabs 227, Saltwind's house row stepping down its slope: one ceiling over the band stood through the lower
  // houses' roofs) a cell whose covering is drawn under the ceiling is no room's
  const overCm = enc.over ? Math.round((y1 - 0.1) * 100) + 1 : 0;
  for (let c = 0; c < labels.length; c++) {
    if (labels[c] !== label || !(band.cells[c]! & 4)) continue;
    if (enc.over && enc.over[c]! < overCm) continue;
    // (a cell open to the outside on a side — a door's threshold, a gap's mouth — is no room's: it stays a cell back)
    const i = c % nx, k = (c - i) / nx;
    if ((i > 0 && band.cells[c - 1] === 0) || (i < nx - 1 && band.cells[c + 1] === 0) || (k > 0 && band.cells[c - nx] === 0)
      || (k < nz - 1 && band.cells[c + nx] === 0)) continue;
    inRoom[c] = 1; n++;
  }
  if (n * cell * cell < ROOM_MIN_M2) return null;
  {
    let i0 = nx, i1 = -1, k0 = nz, k1 = -1;
    for (let c = 0; c < inRoom.length; c++) {
      if (!inRoom[c]) continue;
      const i = c % nx, k = (c - i) / nx;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (k < k0) k0 = k;
      if (k > k1) k1 = k;
    }
    if (Math.min(i1 - i0 + 1, k1 - k0 + 1) * cell < ROOM_MIN_SPAN_M) return null;
  }
  // rectangles: each row's runs, a run stacked on the same run of the row before extends its rectangle
  const rects: number[][] = [];
  let open = new Map<string, number[]>();
  for (let k = 0; k < nz; k++) {
    const next = new Map<string, number[]>();
    let i = 0;
    while (i < nx) {
      if (!inRoom[k * nx + i]) { i++; continue; }
      let j = i;
      while (j + 1 < nx && inRoom[k * nx + j + 1]) j++;
      const key = `${i}:${j}`;
      const r = open.get(key);
      if (r) { r[3] = z0 + (k + 1) * cell; next.set(key, r); open.delete(key); }
      else { const nr = [x0 + i * cell, z0 + k * cell, x0 + (j + 1) * cell, z0 + (k + 1) * cell]; rects.push(nr); next.set(key, nr); }
      i = j + 1;
    }
    open = next;
  }
  // inward walls: the room's boundary, merged along runs (normal into the room)
  const walls: number[][] = [];
  // along x (edges between rows k-1 and k)
  for (let k = 0; k <= nz; k++) {
    for (const side of [1, -1] as const) {
      let start = -1;
      for (let i = 0; i <= nx; i++) {
        const a = i < nx && k - 1 >= 0 ? inRoom[(k - 1) * nx + i] : 0, b = i < nx && k < nz ? inRoom[k * nx + i] : 0;
        // side 1: the room above the edge (b), its wall faces +z; side -1: the room below (a), facing -z
        const edge = i < nx && (side > 0 ? b && !a : a && !b);
        if (edge && start < 0) start = i;
        if (!edge && start >= 0) {
          const z = z0 + k * cell;
          walls.push([x0 + start * cell, z, x0 + i * cell, z, 0, side]);
          start = -1;
        }
      }
    }
  }
  // along z (edges between columns i-1 and i)
  for (let i = 0; i <= nx; i++) {
    for (const side of [1, -1] as const) {
      let start = -1;
      for (let k = 0; k <= nz; k++) {
        const a = k < nz && i - 1 >= 0 ? inRoom[k * nx + i - 1] : 0, b = k < nz && i < nx ? inRoom[k * nx + i] : 0;
        const edge = k < nz && (side > 0 ? b && !a : a && !b);
        if (edge && start < 0) start = k;
        if (!edge && start >= 0) {
          const x = x0 + i * cell;
          walls.push([x, z0 + start * cell, x, z0 + k * cell, side, 0]);
          start = -1;
        }
      }
    }
  }
  return { rects, walls, y0, y1, key: `${storey}:${label}` };
}

/** The room inside a storey's faces' rectangle, behind their thickness (a structure without an enclosure). */
function facesInterior(anatomy: Pick<StructureDamageAnatomy, 'storeys'>, storey: number, capY: number): StoreyInterior | null {
  const st = anatomy.storeys[storey];
  if (!st || !st.faces.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, thick = 0.2;
  for (const f of st.faces) {
    for (const k of [-1, 1]) {
      const x = f.origin[0] + f.u[0] * f.width / 2 * k, z = f.origin[2] + f.u[2] * f.width / 2 * k;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    thick = Math.max(thick, f.layers.reduce((sum, l) => sum + l.thicknessM, 0));
  }
  const inset = Math.min(thick + 0.08, 0.9);
  x0 += inset; x1 -= inset; z0 += inset; z1 -= inset;
  if (!(x1 - x0 > 0.6 && z1 - z0 > 0.6)) return null;
  const y0 = st.y0 + 0.03, y1 = Math.min(capY, Math.max(y0 + 1, st.y1 - 0.06));
  if (!(y1 - y0 > 0.8)) return null;
  return { rects: [[x0, z0, x1, z1]], walls: [[x0, z1, x1, z1, 0, -1], [x0, z0, x1, z0, 0, 1], [x1, z0, x1, z1, -1, 0], [x0, z0, x0, z1, 1, 0]],
    y0, y1, key: `${storey}:faces` };
}

/** 4-connected components of a band's enclosed cells (labels from 1). */
function labelComponents(cells: Uint8Array, nx: number, nz: number): Int32Array {
  const labels = new Int32Array(nx * nz);
  let next = 0;
  const stack: number[] = [];
  for (let c0 = 0; c0 < cells.length; c0++) {
    if (!(cells[c0]! & 2) || labels[c0]) continue;
    next++;
    stack.push(c0);
    while (stack.length) {
      const c = stack.pop()!;
      if (labels[c] || !(cells[c]! & 2)) continue;
      labels[c] = next;
      const i = c % nx, k = (c - i) / nx;
      if (i > 0) stack.push(c - 1);
      if (i < nx - 1) stack.push(c + 1);
      if (k > 0) stack.push(c - nx);
      if (k < nz - 1) stack.push(c + nx);
    }
  }
  return labels;
}

/** A face's index in its storey (the setback's key). */
export function faceIndexOf(anatomy: Pick<StructureDamageAnatomy, 'storeys'>, storey: number, face: DamageFace): number {
  return anatomy.storeys[storey]?.faces.indexOf(face) ?? -1;
}

/**
 * A band's drawn walls as clusters (8-connected wall cells), the `max` largest: each its cell nearest its middle (body
 * frame), its drawn top there and its size in cells — an open frame's legs, a fence's runs (a ruin's stubs stand on them).
 */
export function wallClusters(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, band: number, max: number): Array<{ x: number; z: number; top: number; cells: number }> {
  const enc = enclosureOf(anatomy);
  const b = enc?.bands[band];
  if (!enc || !b) return [];
  const { nx, nz, cell, x0, z0 } = enc;
  const seen = new Uint8Array(nx * nz);
  const out: Array<{ x: number; z: number; top: number; cells: number }> = [];
  const stack: number[] = [], list: number[] = [];
  for (let c0 = 0; c0 < b.cells.length; c0++) {
    if (b.cells[c0] !== 1 || seen[c0]) continue;
    list.length = 0;
    stack.push(c0);
    seen[c0] = 1;
    let sx = 0, sz = 0;
    while (stack.length) {
      const c = stack.pop()!;
      list.push(c);
      const i = c % nx, k = (c - i) / nx;
      sx += i; sz += k;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const cc = kk * nx + ii;
        if (b.cells[cc] === 1 && !seen[cc]) { seen[cc] = 1; stack.push(cc); }
      }
    }
    const mi = sx / list.length, mk = sz / list.length;
    let best = list[0]!, bd = Infinity;
    for (const c of list) { const i = c % nx, k = (c - i) / nx, d = (i - mi) ** 2 + (k - mk) ** 2; if (d < bd) { bd = d; best = c; } }
    const i = best % nx, k = (best - i) / nx;
    out.push({ x: x0 + (i + 0.5) * cell, z: z0 + (k + 0.5) * cell, top: enc.top[best] ? (enc.top[best]! - 1) / 100 : b.y1, cells: list.length });
  }
  out.sort((p, q) => q.cells - p.cells || p.x - q.x || p.z - q.z);
  return out.slice(0, max);
}

/**
 * The drawn wall cells (of any band) whose walls stand at least `minTopM` (body y) over them, tallest first (ties by plan
 * order): each its middle (body frame), its drawn top and its wall's run (along x when more of its wall neighbours lie
 * along x) — a ruin's stubs stand where its walls are drawn tall (a tower set back on its podium: the tower's walls, never
 * the podium's corners), at most `max` of them.
 */
export function wallSpots(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, minTopM: number, max: number): Array<{ x: number; z: number; top: number; alongX: boolean }> {
  const enc = enclosureOf(anatomy);
  if (!enc || !enc.bands.length) return [];
  const { nx, nz, cell, x0, z0, top } = enc;
  const need = Math.max(1, Math.round(minTopM * 100) + 1);
  const found: number[] = [];
  for (let c = 0; c < top.length; c++) if (top[c]! >= need && wallCell(enc, c)) found.push(c);
  found.sort((p, q) => top[q]! - top[p]! || p - q);
  const at = (i: number, k: number): number => (i >= 0 && k >= 0 && i < nx && k < nz && wallCell(enc, k * nx + i) ? 1 : 0);
  return found.slice(0, max).map((c) => {
    const i = c % nx, k = (c - i) / nx;
    const ax = at(i - 1, k) + at(i + 1, k) + at(i - 2, k) + at(i + 2, k);
    const az = at(i, k - 1) + at(i, k + 1) + at(i, k - 2) + at(i, k + 2);
    return { x: x0 + (i + 0.5) * cell, z: z0 + (k + 0.5) * cell, top: (top[c]! - 1) / 100, alongX: ax >= az };
  });
}
/** A cell drawn as a wall: in a band, or (a tower over its podium, above the storeys the reading counts) a wall drawn
 *  there from no higher than 40 % of its top, not a parapet on a roof. */
function wallCell(enc: StructureEnclosure, c: number): boolean {
  for (const b of enc.bands) if (b.cells[c] === 1) return true;
  const lo = enc.base?.[c] ?? 0, hi = enc.top[c]!;
  return lo > 0 && hi > 0 && lo - 1 <= 0.4 * (hi - 1);
}

/**
 * Whether what is drawn over the eaves at a plan point is the roof's furniture (destruction-slabs 227 round 2): the walls
 * drawn over `eaveY` (by 30 cm) gather in clusters (8-connected cells); a cluster under 3 m across whose cells are mostly
 * not drawn from below (their walls' lowest point over the eaves less a metre) — a chimney or a dormer on the covering, a
 * turret on the ridge — is furniture, and goes with the roof whole; a gable, a tower and its spire, a stack drawn from the
 * ground, a wall dormer flush with its facade stand. One decision per cluster (round 2: a dormer's window frames stood in
 * the sky after its plaster went with the roof), none rising 3.5 m over the ridge. False where nothing is known (no
 * enclosure, or one without its walls' bases).
 */
export function roofFurnitureAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, eaveY: number, ridgeY = Infinity): boolean {
  return furnitureCell(anatomy, x, z, eaveY, ridgeY) === 2;
}
/** Whether a plan point lies under none of the clusters standing over the eaves (a gable, a tower, a stack). */
export function clearOverEaves(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, eaveY: number, ridgeY = Infinity): boolean {
  return furnitureCell(anatomy, x, z, eaveY, ridgeY) !== 1;
}
function furnitureCell(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, eaveY: number, ridgeY: number): number {
  const enc = enclosureOf(anatomy);
  if (!enc?.base) return 1;
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  if (ci < 0 || ck < 0 || ci >= enc.nx || ck >= enc.nz) return 0;
  const mask = furnitureMask(enc, Math.round(eaveY * 100), Number.isFinite(ridgeY) ? Math.round(ridgeY * 100) : 65535);
  // (a triangle's centroid a cell off its cluster: its neighbours decide)
  if (mask[ck * enc.nx + ci]) return mask[ck * enc.nx + ci]!;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && k >= 0 && i < enc.nx && k < enc.nz && mask[k * enc.nx + i]) return mask[k * enc.nx + i]!;
  }
  return 0;
}
const furnitureCache = new WeakMap<StructureEnclosure, Map<number, Uint8Array>>();
/** Per cell: 0 nothing over the eaves, 1 a standing cluster's, 2 furniture's; cached per eave and ridge height. */
function furnitureMask(enc: StructureEnclosure, eaveCm: number, ridgeCm: number): Uint8Array {
  let byEave = furnitureCache.get(enc);
  if (!byEave) { byEave = new Map(); furnitureCache.set(enc, byEave); }
  const key = eaveCm * 65536 + ridgeCm;
  let mask = byEave.get(key);
  if (mask) return mask;
  const N = enc.nx * enc.nz;
  mask = new Uint8Array(N);
  const over = eaveCm + 1 + 30, below = eaveCm + 1 - 100;
  const seen = new Uint8Array(N), stack: number[] = [], members: number[] = [];
  for (let c0 = 0; c0 < N; c0++) {
    if (seen[c0] || !(enc.top[c0]! >= over)) continue;
    stack.push(c0); seen[c0] = 1; members.length = 0;
    let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity, fromBelow = 0, peak = 0;
    while (stack.length) {
      const c = stack.pop()!;
      members.push(c);
      const i = c % enc.nx, k = (c - i) / enc.nx;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); k0 = Math.min(k0, k); k1 = Math.max(k1, k);
      if (enc.base![c]! > 0 && enc.base![c]! <= below) fromBelow++;
      peak = Math.max(peak, enc.top[c]!);
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= enc.nx || kk >= enc.nz) continue;
        const cc = kk * enc.nx + ii;
        if (seen[cc] || !(enc.top[cc]! >= over)) continue;
        seen[cc] = 1; stack.push(cc);
      }
    }
    const across = Math.max(i1 - i0 + 1, k1 - k0 + 1) * enc.cell;
    // (and no higher than 3.5 m over the ridge: a chimney's stack; round 2: a broadcast tower's platforms 30 m over its
    // podium's roof were no roof's furniture)
    const v = across < 3 && fromBelow < 0.5 * members.length && peak <= ridgeCm + 1 + 350 ? 2 : 1;
    for (const c of members) mask[c] = v;
  }
  byEave.set(key, mask);
  return mask;
}

/** Whether a wall is drawn (in any band) at a plan point standing at least `minTopM` over it (the point's own cell). */
export function tallWallAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number, minTopM: number): boolean {
  const enc = enclosureOf(anatomy);
  if (!enc) return false;
  const c = enclosureCell(enc, x, z);
  return c >= 0 && enc.top[c]! >= Math.round(minTopM * 100) + 1 && wallCell(enc, c);
}

/**
 * Where a structure is drawn tallest from the ground (body frame): of the ground band's drawn wall cells, the one its
 * walls reach highest over, and the extent of the ground band's wall cells joined to it (within 3 m) drawn to at least
 * 0.6 of that height, as a half width and depth (a mast's lattice on its pad beside its hut: the mast; a flood mast's pole,
 * not its lamp head; a gantry's leg, not the beam over the span), and its cells' middles as [x, z, x, z, ...] (a stump's
 * legs stand on them, never in a hollow tower's void). Null without an enclosure or anything drawn upright.
 */
export function tallestDrawn(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>): { x: number; z: number; top: number; halfW: number; halfD: number;
  spots: number[] } | null {
  const enc = enclosureOf(anatomy);
  const ground = enc?.bands[0]?.cells;
  if (!enc || !ground) return null;
  const { nx, nz, cell, x0, z0, top } = enc;
  let maxTop = 0;
  for (let c = 0; c < top.length; c++) if (ground[c] === 1 && top[c]! > maxTop) maxTop = top[c]!;
  const hi = (maxTop - 1) / 100;
  if (!(hi > 0.5)) return null;
  const need = 1 + Math.round(hi * 0.6 * 100), peak = 1 + Math.round(hi * 0.95 * 100), r = Math.ceil(3 / cell);
  // the clusters of tall ground wall cells (8-neighbours); of those reaching the peak, the biggest (a pole over the lone
  // tall cells of its stays), its extent within 3 m of its highest cell
  const label = new Int32Array(top.length);
  let bestCells: number[] = [], bestPeak = -1;
  for (let c0 = 0; c0 < top.length; c0++) {
    if (label[c0] || ground[c0] !== 1 || top[c0]! < need) continue;
    const cells: number[] = [];
    const stack = [c0];
    label[c0] = 1;
    let pk = c0;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      if (top[c]! > top[pk]!) pk = c;
      const ci = c % nx, ck = (c - ci) / nx;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, k = ck + dk, cc = k * nx + i;
        if (i < 0 || k < 0 || i >= nx || k >= nz || label[cc] || ground[cc] !== 1 || top[cc]! < need) continue;
        label[cc] = 1;
        stack.push(cc);
      }
    }
    if (top[pk]! >= peak && cells.length > bestCells.length) { bestCells = cells; bestPeak = pk; }
  }
  if (bestPeak < 0) return null;
  const bi = bestPeak % nx, bk = (bestPeak - bi) / nx;
  let i0 = bi, i1 = bi, k0 = bk, k1 = bk;
  const spots: number[] = [];
  for (const c of bestCells) {
    const i = c % nx, k = (c - i) / nx;
    if (Math.abs(i - bi) > r || Math.abs(k - bk) > r) continue;
    if (i < i0) i0 = i;
    if (i > i1) i1 = i;
    if (k < k0) k0 = k;
    if (k > k1) k1 = k;
    spots.push(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell);
  }
  return { x: x0 + ((i0 + i1 + 1) / 2) * cell, z: z0 + ((k0 + k1 + 1) / 2) * cell, top: (top[bestPeak]! - 1) / 100,
    halfW: ((i1 - i0 + 1) * cell) / 2, halfD: ((k1 - k0 + 1) * cell) / 2, spots };
}
