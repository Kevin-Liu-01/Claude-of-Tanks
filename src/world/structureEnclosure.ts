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

/**
 * The drawn enclosure of a structure from its parts (body frame, by bucket) and its anatomy's storeys; null when it draws
 * no wall. Built once at describe (structureDamageSeam.ts).
 */
export function measureEnclosure(parts: Readonly<Record<string, readonly BufferGeometry[]>> | null | undefined,
  anatomy: Pick<StructureDamageAnatomy, 'storeys'>, { cover = true }: { cover?: boolean } = {}): StructureEnclosure | null {
  if (!parts || !anatomy.storeys.length) return null;
  const keep = (bucket: string, g: BufferGeometry): boolean => !SKIP_BUCKETS.has(bucket) && !g.userData?.damagePiece && g.userData?.fine !== true;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [bucket, list] of Object.entries(parts)) for (const g of list ?? []) {
    if (!keep(bucket, g) && !COVER_BUCKETS.has(bucket)) continue;
    const pos = g.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
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
  const top = new Uint16Array(N), over = new Uint16Array(N);
  const cm = (y: number): number => Math.max(1, Math.min(65535, Math.round(y * 100) + 1));
  const cellOf = (x: number, z: number): number => {
    const i = Math.floor((x - x0) / cell), k = Math.floor((z - z0) / cell);
    return i >= 0 && k >= 0 && i < nx && k < nz ? k * nx + i : -1;
  };
  const step = cell * 0.5;
  /** Walk a plan segment at half-cell steps (endpoints included): each sample's cell and its point. */
  const walk = (ax: number, az: number, ay: number, bx: number, bz: number, by: number, visit: (c: number, x: number, z: number, y: number) => void): void => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const c = cellOf(x, z);
      if (c >= 0) visit(c, x, z, ay + (by - ay) * t);
    }
  };
  for (const [bucket, list] of Object.entries(parts)) for (const g of list ?? []) {
    const wall = keep(bucket, g);
    const covers = cover && COVER_BUCKETS.has(bucket) && !g.userData?.damagePiece;
    if (!wall && !covers) continue;
    const pos = g.getAttribute('position');
    if (!pos) continue;
    const index = g.getIndex();
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = index ? index.getX(t + k) : t + k;
        parts3[k * 3] = pos.getX(v); parts3[k * 3 + 1] = pos.getY(v); parts3[k * 3 + 2] = pos.getZ(v);
      }
      const ux = parts3[3] - parts3[0], uy = parts3[4] - parts3[1], uz = parts3[5] - parts3[2];
      const wx = parts3[6] - parts3[0], wy = parts3[7] - parts3[1], wz = parts3[8] - parts3[2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const fl = Math.hypot(fx, fy, fz);
      if (!(fl > 1e-9)) continue;
      const vertical = Math.abs(fy) <= VERTICAL_NY * fl;
      if (!vertical) {
        // a slope, a deck, a roof: what covers the plan under it (its area sampled at a cell; none for a probe)
        if (!cover) continue;
        const reach = Math.max(Math.hypot(ux, uz), Math.hypot(wx, wz), Math.hypot(parts3[6] - parts3[3], parts3[8] - parts3[5]));
        const m = Math.max(1, Math.min(64, Math.ceil(reach / cell)));
        for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) {
          const a = i / m, b = j / m;
          const c = cellOf(parts3[0] + ux * a + wx * b, parts3[2] + uz * a + wz * b);
          if (c >= 0) { const y = cm(parts3[1] + uy * a + wy * b); if (y > over[c]) over[c] = y; }
        }
        continue;
      }
      // a wall: its top over the plan along its edges, and what covers there
      if (cover) for (let e = 0; e < 3; e++) {
        const a = e * 3, b = ((e + 1) % 3) * 3;
        walk(parts3[a], parts3[a + 2], parts3[a + 1], parts3[b], parts3[b + 2], parts3[b + 1], (c, _x, _z, y) => {
          const q = cm(y);
          if (q > over[c]) over[c] = q;
          if (wall && q > top[c]) top[c] = q;
        });
      }
      if (!wall) continue;
      const lo = Math.min(parts3[1], parts3[4], parts3[7]), hi = Math.max(parts3[1], parts3[4], parts3[7]);
      for (let s = 0; s < bands.length; s++) {
        const band = bands[s];
        if (Math.min(hi, band.y1) - Math.max(lo, band.y0) < 0.05) continue;
        // its part in the band, and that part's plan as a segment between its farthest corners (kept for the setbacks)
        let m = clipY(parts3, 3, band.y0, 1, clipA);
        if (m < 2) continue;
        m = clipY(clipA, m, band.y1, -1, clipB);
        if (m < 2) continue;
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
          area += 0.5 * Math.hypot(ey * gz - ez * gy, ez * gx - ex * gz, ex * gy - ey * gx);
        }
        const len = Math.sqrt(best);
        const samples = Math.max(1, Math.ceil(len / step)) + 1;
        const each = (area / Math.max(len, 1e-3)) * (Math.max(len, 0.02) / samples) / cell;
        walk(ax, az, 0, bx, bz, 0, (c) => { band.cover[c] += each; });
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
    for (let q = 0; q + 3 < segs.length; q += 4) {
      walk(segs[q]!, segs[q + 1]!, 0, segs[q + 2]!, segs[q + 3]!, 0, (c, x, z) => {
        if (band.cells[c] !== 1 || top[c]! < tall) return;
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
      });
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
  return { x0, z0, cell, nx, nz, bands: out, top };
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

/** The drawn walls' top over a plan point (body y, the highest within a cell); +Infinity where nothing restricts, −1 for
 *  none drawn there. */
export function wallTopAt(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, x: number, z: number): number {
  const enc = enclosureOf(anatomy);
  if (!enc) return Infinity;
  const ci = Math.floor((x - enc.x0) / enc.cell), ck = Math.floor((z - enc.z0) / enc.cell);
  let best = 0;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && k >= 0 && i < enc.nx && k < enc.nz) best = Math.max(best, enc.top[k * enc.nx + i]);
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

/** The share of a structure's bands under `share` enclosed (a frame's: most of them). */
export function openBandShare(anatomy: Pick<StructureDamageAnatomy, 'enclosure'>, share = 0.35): number {
  const enc = enclosureOf(anatomy);
  if (!enc || !enc.bands.length) return 0;
  let open = 0;
  for (const b of enc.bands) if (b.share < share) open++;
  return open / enc.bands.length;
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
/** How far round the hint a room's component is looked for (m). */
const HINT_REACH_M = 2.5;

/**
 * The room behind a hole on a storey: the enclosed component behind the hint (a body-frame plan point just inside the
 * hole), less what nothing covers (a court, a yard under the sky), covered by rectangles, its boundary its inward walls,
 * its ceiling capped at the band's drawn wall top round it (and `capY`). Null when the band encloses under half its box
 * (a frame, a trestle, a pipe run, a tank farm), the component is under 2 m², or no enclosed cell is near the hint; and
 * for a structure without an enclosure (null too: lay none).
 */
export function storeyInterior(anatomy: Pick<StructureDamageAnatomy, 'enclosure' | 'storeys'>, storey: number, hintX: number, hintZ: number,
  capY = Infinity): StoreyInterior | null {
  const enc = enclosureOf(anatomy);
  // a structure measured without its parts (a kit's own reading handed over whole): its faces are its walls
  if (!enc) return facesInterior(anatomy, storey, capY);
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
  for (let c = 0; c < labels.length; c++) {
    if (labels[c] !== label || !(band.cells[c]! & 4)) continue;
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
