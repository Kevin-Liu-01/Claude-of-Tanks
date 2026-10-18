/**
 * collapseRuin.ts — a collapsed building leaves a ruin, never a raft (destruction lane, 2026-10-16; the owner ruled flat
 * rafts out; the LOOKS r2 sweep's anti-raft check: 145 placed structure kinds whose collapse stood under 25 % of their
 * intact height, ~/cot-launch-state/streams/looks/sweep/BELOW2.md).
 *
 * Every kit's collapse (destructionKit.ts StructureDamageKit.collapse: the default kit and the regional ones) runs
 * through `keepRuinStanding` from the world seam (structureDamageSeam.ts). The kit writes what it writes; this pass
 * measures it as it is written — the area-weighted height of its triangles (64 bins: no sort, no allocation) and the
 * share of the body's plan it covers (a 48 × 48 grid) — and then adds, in the building's own buckets and tints, only
 * what the ruin still lacks:
 *
 * - the storey interior heaped (a fill mound draped on the simulation's heap, ragged at its edge) where the plan is
 *   bare, so the ruin covers at least ~70 % of the plan (the check's floor: 60 %);
 * - the corners standing: an L-shaped pier at each corner of the ground storey in its structural layer, stepped and
 *   ragged at the top, 42–60 % of the building's height (never past its eaves);
 * - then, while the ruin still stands lower than 30 % of the intact's p90 height (the check's floor: 25 % of the
 *   intact's area-weighted 90th percentile, which is never above the top), ragged wall stubs between the piers with a
 *   breach in each face, and the fallen roof's covering as slabs leaning on the heap.
 *
 * Deterministic in (anatomy, seed): its own stream (damageRng of the collapse seed's sub-seed), the same on every peer
 * and tier. Runs once per collapse, writing through the stage's own writers; its scratch is module-owned and only grows.
 * Presentation only: the simulation's heap and collision are unchanged (a pier or a stub is drawn, not a record).
 */
import type { BufferGeometry } from 'three';
import {
  bodyMoundHeightAt, damageRng, damageSeed,
  type DamageMeshWriter, type DamageRole, type DamageWriters, type FractureSlot, type Rgb, type StructureDamageAnatomy,
} from './destructionKit.ts';
import {
  bandEnclosure, drawnOverAt, enclosedAt, standsOnPosts, tallestDrawn, tallWallAt, wallAlong, wallClusters, wallSpots, wallTopAt,
} from './structureEnclosure.ts';

/** The ruin's floors (the sweep's: 25 % and 60 %, with margin). */
export const RUIN_HEIGHT_SHARE = 0.3;
export const RUIN_PLAN_SHARE = 0.72;
const BINS = 64;
const GRID = 48;
/** A box's 24 vertices. */
const BOX_VERTS = 24;
/** How far a standing piece's foot sinks under the body's floor (a slope's downhill corner never shows daylight). */
const FOOT_M = 0.6;

// ---- the measuring writer (module scratch, grown, never shrunk) ----
let runX = new Float64Array(4096), runY = new Float64Array(4096), runZ = new Float64Array(4096);
const bins = new Float64Array(BINS);
const cells = new Uint8Array(GRID * GRID);
let binTop = 1, planHalfW = 1, planHalfD = 1;
let runBase = -1;
let inner: DamageMeshWriter | null = null;
let measuring = false;
let kitPhase = false;
/** Vertices kept free for the ruin while the kit writes (200 boxes). */
const RUIN_RESERVE_VERTS = 200 * 24;
/** The height the ruin's pieces scale by: the intact's p90 over its share (about its eaves), set per collapse. */
let ruinScale = 1;
/** The ruin's footprint in the body frame (its walls' rectangle: their centre and half extents), set per collapse. */
let fcx = 0, fcz = 0, fhw = 1, fhd = 1;
/** The collapsing structure (its drawn enclosure: a ruin's piece stands on a drawn wall, never in the open past it). */
let ruinOf: StructureDamageAnatomy | null = null;

/**
 * (destruction-slabs 227) Where a standing piece meant for the footprint's edge at (x, z) stands: on the ground storey's
 * first drawn wall inward from it along (nx, nz) — the distance in, or NaN where none is drawn within half the footprint
 * (0 for a structure without an enclosure: its faces are its walls).
 */
function inToWall(x: number, z: number, nx: number, nz: number): number {
  if (!ruinOf) return 0;
  return wallAlong(ruinOf, 0, x, z, nx, nz, Math.max(fhw, fhd));
}
/** The drawn top of the wall cell `d` in from (x, z) along (nx, nz) (inToWall's find): that cell's own, no neighbour's
 *  (a skin wall's post under a gable end's eave stood at the gable's peak height). */
function topOfWallIn(x: number, z: number, nx: number, nz: number, d: number): number {
  const cell = ruinOf?.enclosure?.cell;
  if (!ruinOf || !cell) return Infinity;
  const k = d + cell * 0.5;
  return wallTopAt(ruinOf, x + nx * k, z + nz * k, 0);
}
/** The lowest the drawn walls stand along a plan run (five spots, a tenth in from each end): a long stub on a ragged wall
 *  is no taller than its lowest stretch is drawn (destruction-slabs 227: a ruin's 7.8 m stub stood 1.8 m over its wall). */
function topAlong(ax: number, az: number, bx: number, bz: number): number {
  if (!ruinOf) return Infinity;
  let low = Infinity;
  for (let k = 0; k < 5; k++) {
    const t = 0.1 + 0.2 * k;
    low = Math.min(low, wallTopAt(ruinOf, ax + (bx - ax) * t, az + (bz - az) * t));
  }
  return low;
}

function resetMeasure(top: number, halfW: number, halfD: number): void {
  bins.fill(0); cells.fill(0);
  binTop = Math.max(0.5, top); planHalfW = Math.max(0.25, halfW); planHalfD = Math.max(0.25, halfD);
}
function markCell(x: number, z: number): void {
  const i = Math.floor(((x + planHalfW) / (2 * planHalfW)) * GRID), k = Math.floor(((z + planHalfD) / (2 * planHalfD)) * GRID);
  if (i >= 0 && i < GRID && k >= 0 && k < GRID) cells[k * GRID + i] = 1;
}
function measureTriangle(a: number, b: number, c: number): void {
  const ax = runX[a]!, ay = runY[a]!, az = runZ[a]!, bx = runX[b]!, by = runY[b]!, bz = runZ[b]!, cx = runX[c]!, cy = runY[c]!, cz = runZ[c]!;
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!(area > 0)) return;
  const y = (ay + by + cy) / 3;
  const bin = Math.max(0, Math.min(BINS - 1, Math.floor((y / binTop) * BINS)));
  bins[bin] += area;
  // the plan it covers: a barycentric lattice over it, no coarser than the grid's cell (its corners included)
  const cell = Math.min((2 * planHalfW) / GRID, (2 * planHalfD) / GRID);
  const reach = Math.max(Math.hypot(ux, uz), Math.hypot(vx, vz), Math.hypot(cx - bx, cz - bz));
  const n = Math.max(1, Math.min(48, Math.ceil(reach / cell)));
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
    const s = i / n, t = j / n;
    markCell(ax + ux * s + vx * t, az + uz * s + vz * t);
  }
}
/** The area-weighted 90th percentile height written so far (bin resolution). */
function heightP90(): number {
  let total = 0;
  for (let i = 0; i < BINS; i++) total += bins[i]!;
  if (!(total > 0)) return 0;
  let acc = 0;
  for (let i = 0; i < BINS; i++) {
    acc += bins[i]!;
    if (acc >= 0.9 * total) return ((i + 0.5) / BINS) * binTop;
  }
  return binTop;
}
function planShare(): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) n += cells[i]!;
  return n / cells.length;
}
/** The writer the kit and this pass write through: it forwards everything and measures the triangles. */
const measuringWriter: DamageMeshWriter = {
  begin(bucket: string, role: DamageRole): boolean { runBase = -1; return inner!.begin(bucket, role); },
  vertex(px, py, pz, nx, ny, nz, u, v, r, g, b): number {
    const id = inner!.vertex(px, py, pz, nx, ny, nz, u, v, r, g, b);
    if (measuring) {
      if (runBase < 0) runBase = id;
      const k = id - runBase;
      if (k >= 0) {
        if (k >= runX.length) {
          const grow = (a: Float64Array) => { const next = new Float64Array(Math.max(k + 1, a.length * 2)); next.set(a); return next; };
          runX = grow(runX); runY = grow(runY); runZ = grow(runZ);
        }
        runX[k] = px; runY[k] = py; runZ[k] = pz;
      }
    }
    return id;
  },
  triangle(a: number, b: number, c: number): void {
    inner!.triangle(a, b, c);
    if (measuring && runBase >= 0) {
      const ka = a - runBase, kb = b - runBase, kc = c - runBase;
      if (ka >= 0 && kb >= 0 && kc >= 0 && ka < runX.length && kb < runX.length && kc < runX.length) measureTriangle(ka, kb, kc);
    }
  },
  end(): void { inner!.end(); runBase = -1; },
  get vertices() { return inner!.vertices; },
  // while the kit writes, it sees the capacity less the ruin's reserve (a kit filling the writer leaves the ruin room)
  get capacity() { return kitPhase ? Math.max(0, inner!.capacity - RUIN_RESERVE_VERTS) : inner!.capacity; },
};
const writers: DamageWriters = { mesh: measuringWriter, pieces: null as unknown as DamageWriters['pieces'] };

// ---- the pieces of a ruin ----
function roomFor(mesh: DamageMeshWriter, boxes: number): boolean { return mesh.vertices + boxes * BOX_VERTS <= mesh.capacity; }

/** A box's six faces (normal, corners), as the default kit writes them (destructionDefaultKit.ts writeBox). */
const BOX_FACES: ReadonlyArray<readonly [readonly [number, number, number], ReadonlyArray<readonly [number, number, number]>]> = [
  [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
  [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
  [[1, 0, 0], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]],
  [[-1, 0, 0], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]],
  [[0, 0, 1], [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]]],
  [[0, 0, -1], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]],
];
const _quad = [0, 0, 0, 0];
/** An oriented box (body frame, yaw about y), tinted and shaded; its UVs run a unit a metre across a face. */
function box(mesh: DamageMeshWriter, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number,
  tint: Rgb, shade: number): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const r = tint[0] * shade, g = tint[1] * shade, b = tint[2] * shade;
  for (const [n, quad] of BOX_FACES) {
    const nx = n[0] * c + n[2] * s, nz = -n[0] * s + n[2] * c;
    // the face's extent along its two in-plane axes (metres): the UVs' scale
    const su = n[0] !== 0 ? hz * 2 : hx * 2, sv = n[1] !== 0 ? hz * 2 : hy * 2;
    for (let i = 0; i < 4; i++) {
      const [qx, qy, qz] = quad[i]!;
      const lx = qx * hx, lz = qz * hz;
      _quad[i] = mesh.vertex(cx + lx * c + lz * s, cy + qy * hy, cz - lx * s + lz * c, nx, n[1], nz,
        i === 1 || i === 2 ? su : 0, i >= 2 ? sv : 0, r, g, b);
    }
    // wound counter-clockwise seen from outside (its normal's side)
    mesh.triangle(_quad[0]!, _quad[2]!, _quad[1]!);
    mesh.triangle(_quad[0]!, _quad[3]!, _quad[2]!);
  }
}

/** The fill mound over the bare plan: a draped grid on the simulation's heap, its edge cells ragged. */
function fillMound(anatomy: StructureDamageAnatomy, rng: () => number, slot: FractureSlot, mesh: DamageMeshWriter,
  x0: number, x1: number, z0: number, z1: number): void {
  const nx = 12, nz = 12;
  if (mesh.vertices + (nx + 1) * (nz + 1) > mesh.capacity || !mesh.begin(slot.bucket, 'rubble')) return;
  const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2, hw = (x1 - x0) * 0.49, hd = (z1 - z0) * 0.49;
  const ids: number[] = _ids;
  ids.length = 0;
  // a rubble surface over the simulation's heap, no deeper than a hull's tracks sink in it
  const lift = Math.min(0.25, 0.03 * anatomy.h);
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || k === 0 || i === nx || k === nz;
    const x = cxm - hw + (2 * hw * i) / nx + (edge ? 0 : (rng() - 0.5) * (hw / nx));
    const z = czm - hd + (2 * hd * k) / nz + (edge ? 0 : (rng() - 0.5) * (hd / nz));
    const mound = bodyMoundHeightAt(anatomy, x, z);
    const y = edge ? Math.max(0.03, mound * 0.6) : Math.max(0.08, mound) + lift * (0.3 + rng() * 0.7);
    const shade = 0.72 + rng() * 0.25;
    ids.push(mesh.vertex(x, y, z, 0, 1, 0, x / 2, z / 2, slot.tint[0] * shade, slot.tint[1] * shade, slot.tint[2] * shade));
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    // (a sparse form's heap follows its pieces: no fill where it drew nothing)
    if (intactPlanAt(anatomy, cxm - hw + (2 * hw * (i + 0.5)) / nx, czm - hd + (2 * hd * (k + 0.5)) / nz) === false) continue;
    const a = ids[k * (nx + 1) + i]!, b = ids[k * (nx + 1) + i + 1]!, c = ids[(k + 1) * (nx + 1) + i + 1]!, d = ids[(k + 1) * (nx + 1) + i]!;
    mesh.triangle(a, c, b); mesh.triangle(a, d, c);
  }
  mesh.end();
}
const _ids: number[] = [];

/** The corners' L piers: two legs along the corner's faces, stepped at the top (three courses, each shorter). */
function cornerPiers(rng: () => number, slot: FractureSlot, cap: number, mesh: DamageMeshWriter, share: number): void {
  if (!roomFor(mesh, 4 * 6) || !mesh.begin(slot.bucket, 'remnant')) return;
  const hw = fhw, hd = fhd;
  const t = Math.max(0.3, Math.min(0.8, slot.thicknessM > 0.05 ? slot.thicknessM * 1.6 : 0.45));
  for (let corner = 0; corner < 4; corner++) {
    const sx = corner & 1 ? 1 : -1, sz = corner & 2 ? 1 : -1;
    const height0 = Math.min(cap, ruinScale * share * (0.85 + rng() * 0.3));
    const legX = Math.min(hw, Math.max(0.8, 2 * hw * (0.16 + rng() * 0.12))), legZ = Math.min(hd, Math.max(0.8, 2 * hd * (0.16 + rng() * 0.12)));
    // (destruction-slabs 227) each leg on the drawn wall in from the footprint's edge, no taller than that wall is drawn
    const inZ = inToWall(fcx + sx * (hw - legX / 2), fcz + sz * hd, 0, -sz), inX = inToWall(fcx + sx * hw, fcz + sz * (hd - legZ / 2), -sx, 0);
    const legs = [Number.isFinite(inZ), Number.isFinite(inX)];
    const height = Math.min(height0,
      legs[0] ? topAlong(fcx + sx * hw, fcz + sz * (hd - inZ), fcx + sx * (hw - legX), fcz + sz * (hd - inZ)) : Infinity,
      legs[1] ? topAlong(fcx + sx * (hw - inX), fcz + sz * hd, fcx + sx * (hw - inX), fcz + sz * (hd - legZ)) : Infinity);
    let h0 = -FOOT_M;
    for (let course = 0; course < 3; course++) {
      const top = height * (course === 0 ? 0.55 : course === 1 ? 0.82 : 1);
      const shrink = 1 - course * 0.28;
      const hy = (top - h0) / 2, cy = h0 + hy;
      const shade = 0.82 + rng() * 0.16;
      // the leg along x (on the z face), then the leg along z (on the x face)
      const lx = legX * shrink * (0.85 + rng() * 0.15), lz = legZ * shrink * (0.85 + rng() * 0.15);
      if (height < 0.6 || !(hy > 0.05)) continue;
      if (legs[0]) box(mesh, fcx + sx * (hw - lx / 2), cy, fcz + sz * (hd - inZ - t / 2), lx / 2, hy, t / 2, 0, slot.tint, shade);
      if (legs[1]) box(mesh, fcx + sx * (hw - inX - t / 2), cy, fcz + sz * (hd - lz / 2), t / 2, hy, lz / 2, 0, slot.tint, shade);
      h0 = top;
    }
  }
  mesh.end();
}

/** Ragged wall stubs along each face between its corner piers, a breach of a fifth of the face left open in each. */
function wallStubs(rng: () => number, slot: FractureSlot, cap: number, mesh: DamageMeshWriter, share: number): void {
  if (!mesh.begin(slot.bucket, 'remnant')) return;
  const hw = fhw, hd = fhd;
  const t = Math.max(0.25, Math.min(0.7, slot.thicknessM > 0.05 ? slot.thicknessM * 1.4 : 0.4));
  for (let face = 0; face < 4 && roomFor(mesh, 2); face++) {
    const alongX = face < 2, len = alongX ? 2 * hw : 2 * hd, off = alongX ? hd : hw, side = face & 1 ? 1 : -1;
    const runs = Math.max(3, Math.min(9, Math.round(len / 1.6)));
    const gap = Math.floor(rng() * runs);
    for (let k = 1; k < runs - 1 && roomFor(mesh, 1); k++) {
      if (k === gap || k === gap + 1) continue;
      const u0 = -len / 2 + (k / runs) * len, u1 = -len / 2 + ((k + 1) / runs) * len;
      const h0 = Math.min(cap, ruinScale * share * (0.55 + rng() * 0.6));
      const u = (u0 + u1) / 2, hu = (u1 - u0) / 2 * (0.9 + rng() * 0.1);
      const shade = 0.8 + rng() * 0.18;
      // (destruction-slabs 227) on the drawn wall in from the edge, no taller than it is drawn there
      const ex = alongX ? fcx + u : fcx + side * off, ez = alongX ? fcz + side * off : fcz + u;
      const d = inToWall(ex, ez, alongX ? 0 : -side, alongX ? -side : 0);
      if (!Number.isFinite(d)) continue;
      const x = alongX ? fcx + u : fcx + side * (off - d - t / 2), z = alongX ? fcz + side * (off - d - t / 2) : fcz + u;
      const h = Math.min(h0, alongX ? topAlong(x - hu, z, x + hu, z) : topAlong(x, z - hu, x, z + hu));
      if (h < 0.4) continue;
      const cy = (h - FOOT_M) / 2, hy = (h + FOOT_M) / 2;
      if (alongX) box(mesh, x, cy, z, hu, hy, t / 2, 0, slot.tint, shade);
      else box(mesh, x, cy, z, t / 2, hy, hu, 0, slot.tint, shade);
    }
  }
  mesh.end();
}

/**
 * A standing wall fragment on a face (its `k`-th of a seeded walk round the plan): a ragged run of the wall, 1–2.5 m long,
 * two or three courses stepping down to one side, 50–80 % of the ruin's scale (never past `cap`).
 */
function wallFragment(rng: () => number, slot: FractureSlot, cap: number, mesh: DamageMeshWriter, k: number, minH = 0): void {
  if (!roomFor(mesh, 3) || !mesh.begin(slot.bucket, 'remnant')) return;
  const hw = fhw, hd = fhd;
  const t = Math.max(0.25, Math.min(0.7, slot.thicknessM > 0.05 ? slot.thicknessM * 1.4 : 0.4));
  const face = (k + Math.floor(rng() * 4)) & 3;
  const alongX = face < 2, len = alongX ? 2 * hw : 2 * hd, off = alongX ? hd : hw, side = face & 1 ? 1 : -1;
  const run = Math.min(len * 0.45, 1 + rng() * 1.5);
  const u = (rng() - 0.5) * Math.max(0, len - run);
  const height0 = Math.min(cap, ruinScale * (0.5 + rng() * 0.3));
  const courses = 2 + (rng() < 0.5 ? 1 : 0);
  const lean = rng() < 0.5 ? -1 : 1;
  // (destruction-slabs 227) on the drawn wall in from the edge, no taller than it is drawn there
  const ex = alongX ? fcx + u : fcx + side * off, ez = alongX ? fcz + side * off : fcz + u;
  const d = inToWall(ex, ez, alongX ? 0 : -side, alongX ? -side : 0);
  const at = Number.isFinite(d) ? off - d - t / 2 : NaN;
  const height = !Number.isFinite(at) ? 0 : Math.min(height0, alongX ? topAlong(fcx + u - run / 2, fcz + side * at, fcx + u + run / 2, fcz + side * at)
    : topAlong(fcx + side * at, fcz + u - run / 2, fcx + side * at, fcz + u + run / 2));
  // (destruction-slabs 227 round 2: on a ruin's ragged walls, fragments where the walls are drawn low only spread the
  // heap's height thinner — a hundred of them stood a ruin at a fifth of its height) none under the height the ruin lacks
  const keep = height >= minH;
  let y0 = -FOOT_M;
  for (let c = 0; c < courses; c++) {
    const y1 = height * ((c + 1) / courses) * (c === courses - 1 ? 1 : 0.9 + rng() * 0.1);
    if (!keep) continue;
    const l = run * (1 - c * 0.3);
    const uc = u + lean * (run - l) / 2;
    const hy = (y1 - y0) / 2, shade = 0.8 + rng() * 0.18;
    if (!(height > 0.4) || !(hy > 0.05)) continue;
    if (alongX) box(mesh, fcx + uc, y0 + hy, fcz + side * at, l / 2, hy, t / 2, 0, slot.tint, shade);
    else box(mesh, fcx + side * at, y0 + hy, fcz + uc, t / 2, hy, l / 2, 0, slot.tint, shade);
    y0 = y1;
  }
  mesh.end();
}

/** A segment from (ax, az) to (bx, bz) in plan as a box `hy` half high at `cy`, `t` thick (the box's local x along it). */
function member(mesh: DamageMeshWriter, ax: number, az: number, bx: number, bz: number, cy: number, hy: number, t: number,
  tint: Rgb, shade: number): void {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (!(len > 1e-3)) return;
  box(mesh, (ax + bx) / 2, cy, (az + bz) / 2, len / 2, hy, t / 2, Math.atan2(-dz, dx), tint, shade);
}

/** A strut from A to B (any direction), `t` across: an oriented box written vertex by vertex (no allocation). */
const _sa = new Float64Array(3), _sb = new Float64Array(3);
function strut(mesh: DamageMeshWriter, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number,
  tint: Rgb, shade: number): void {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-3)) return;
  dx /= len; dy /= len; dz /= len;
  // two axes across the strut: against world up unless it runs nearly vertical
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; }
  let px = dy * uz - dz * uy, py = dz * ux - dx * uz, pz = dx * uy - dy * ux;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
  const h = t / 2, r = tint[0] * shade, g = tint[1] * shade, b = tint[2] * shade;
  // the four long faces (±p, ±q), each a quad from A to B
  for (let f = 0; f < 4; f++) {
    const sgn = f & 1 ? -1 : 1, onP = f < 2;
    const nx = onP ? px * sgn : qx * sgn, ny = onP ? py * sgn : qy * sgn, nz = onP ? pz * sgn : qz * sgn;
    const ox = onP ? qx : px, oy = onP ? qy : py, oz = onP ? qz : pz;
    _sa[0] = nx * h; _sa[1] = ny * h; _sa[2] = nz * h;
    _sb[0] = ox * h; _sb[1] = oy * h; _sb[2] = oz * h;
    const v0 = mesh.vertex(ax + _sa[0]! - _sb[0]!, ay + _sa[1]! - _sb[1]!, az + _sa[2]! - _sb[2]!, nx, ny, nz, 0, 0, r, g, b);
    const v1 = mesh.vertex(bx + _sa[0]! - _sb[0]!, by + _sa[1]! - _sb[1]!, bz + _sa[2]! - _sb[2]!, nx, ny, nz, len, 0, r, g, b);
    const v2 = mesh.vertex(bx + _sa[0]! + _sb[0]!, by + _sa[1]! + _sb[1]!, bz + _sa[2]! + _sb[2]!, nx, ny, nz, len, t, r, g, b);
    const v3 = mesh.vertex(ax + _sa[0]! + _sb[0]!, ay + _sa[1]! + _sb[1]!, az + _sa[2]! + _sb[2]!, nx, ny, nz, 0, t, r, g, b);
    // wound outward: (v1 - v0) × (v3 - v0) along the face normal, or the other way round
    const e1x = dx * len, e1y = dy * len, e1z = dz * len, e2x = 2 * _sb[0]!, e2y = 2 * _sb[1]!, e2z = 2 * _sb[2]!;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * nx + cy * ny + cz * nz > 0) { mesh.triangle(v0, v1, v2); mesh.triangle(v0, v2, v3); }
    else { mesh.triangle(v0, v2, v1); mesh.triangle(v0, v3, v2); }
  }
}

interface FrameLegs { legs: ReadonlyArray<{ foot: readonly number[]; head: readonly number[] }>; size: number; bucket: string; colour: Rgb | null }
/** The frame's lattice reading (latticeFall.ts latticeOf), its own or its first body's. */
function latticeLegs(anatomy: StructureDamageAnatomy): FrameLegs | null {
  const plan = anatomy.kitPlan as { damage?: { lattice?: FrameLegs }; bodies?: StructureDamageAnatomy[] } | undefined;
  if (plan?.damage?.lattice?.legs?.length) return plan.damage.lattice;
  for (const body of plan?.bodies ?? []) {
    const lattice = (body.kitPlan as { damage?: { lattice?: FrameLegs } } | undefined)?.damage?.lattice;
    if (lattice?.legs?.length) return lattice;
  }
  return null;
}
/** A frame without a lattice reading stands in its own skin's material, else steel (never a masonry slot). */
const STEEL: FractureSlot = Object.freeze({ material: 'metal', bucket: 'structureMetal', tint: [0.42, 0.42, 0.44] as Rgb, thicknessM: 0.2, share: 1 });
function frameSlot(anatomy: StructureDamageAnatomy): FractureSlot {
  const wall = wallSlot(anatomy);
  return wall && !MASONRY.has(wall.material) ? wall : STEEL;
}
const _stubTop: number[] = [], _stubX: number[] = [], _stubZ: number[] = [];
/** The last frame's stubs stood on its drawn wall clusters (no bays between them: no girts, no struts across). */
let stubsDrawn = false;
/**
 * (destruction-slabs 227 round 2) Stubs where the walls are drawn tall: the drawn wall cells (of any storey: a tower on its
 * podium) standing over the height the ruin still lacks, tallest first, each stub a short run along its wall from the
 * ground (no farther than the wall runs that tall, no taller than it is drawn there) at least 1.8 m from the last, until
 * the ruin stands. A tower set back on its podium keeps its own walls' lower courses, where the corner piers and edge
 * stubs (capped at the podium's drawn top) left a raft (the critic's anti-raft probe: 39 structures under the floors, an
 * arcology's ruin at a fifth of its height).
 */
function tallWallStubs(rng: () => number, slot: FractureSlot, cap: number, mesh: DamageMeshWriter, target: number): void {
  const anatomy = ruinOf;
  const cell = anatomy?.enclosure?.cell;
  // (round 2: an airstrip's 5 m cells stood 12 m stubs where nothing is drawn) only on a grid fine enough to stand on a wall
  if (!anatomy || !cell || cell > 1) return;
  // walls tall enough that a stub on them stands over the target, else the tallest there are
  let spots = wallSpots(anatomy, target * 1.25, 600);
  if (spots.length < 4) spots = wallSpots(anatomy, target * 0.6, 600);
  if (!spots.length || !mesh.begin(slot.bucket, 'remnant')) return;
  const t = Math.max(0.25, Math.min(0.7, slot.thicknessM > 0.05 ? slot.thicknessM * 1.4 : 0.4));
  const placed: number[] = [];
  // two passes: stubs 1.8 m apart at a half to most of the wall's drawn height; still short, closer (1 m) and taller (a
  // low wide body's heap outweighs a few stubs: a tank farm's crumpled shells stand to most of their height)
  for (let pass = 0, n = 0; pass < 2; pass++, n = 0) {
  const minGap2 = pass ? 1.0 : 1.8 * 1.8;
  for (; n < spots.length && placed.length < 192 && roomFor(mesh, 1) && heightP90() < target; n++) {
    // a seeded stride through the tallest spots (not every stub on the one tallest wall)
    const spot = spots[(n * 7 + Math.floor(rng() * 5)) % spots.length]!;
    let near = false;
    for (let q = 0; q < placed.length; q += 2) if ((placed[q]! - spot.x) ** 2 + (placed[q + 1]! - spot.z) ** 2 < minGap2) { near = true; break; }
    if (near) continue;
    // a half to most of the wall's drawn height there, and over the height the ruin lacks where the wall reaches it
    const h = Math.min(cap, Math.max(spot.top * (pass ? 0.7 + rng() * 0.22 : 0.5 + rng() * 0.35), Math.min(spot.top * 0.92, target * (1.2 + rng() * 0.3))));
    if (h < 0.6) continue;
    // its run: out from the spot along its wall while the wall stands that tall, up to 1.3 m each way
    const dx = spot.alongX ? 1 : 0, dz = spot.alongX ? 0 : 1;
    const reach = 0.5 + rng() * 0.8;
    let a = 0, b = 0;
    for (let d = cell * 0.5; d <= reach; d += cell * 0.5) { if (!tallWallAt(anatomy, spot.x - dx * d, spot.z - dz * d, h)) break; a = d; }
    for (let d = cell * 0.5; d <= reach; d += cell * 0.5) { if (!tallWallAt(anatomy, spot.x + dx * d, spot.z + dz * d, h)) break; b = d; }
    const hu = Math.max(t / 2, (a + b) / 2 + cell * 0.25), mid = (b - a) / 2;
    const x = spot.x + dx * mid, z = spot.z + dz * mid;
    const cy = (h - FOOT_M) / 2, hy = (h + FOOT_M) / 2, shade = 0.8 + rng() * 0.18;
    if (spot.alongX) box(mesh, x, cy, z, hu, hy, t / 2, 0, slot.tint, shade);
    else box(mesh, x, cy, z, t / 2, hy, hu, 0, slot.tint, shade);
    placed.push(spot.x, spot.z);
  }
  }
  mesh.end();
}

/**
 * An open frame's buckled remnant (never masonry): every leg of its lattice standing to a buckle `share` of its height up
 * (kinked at mid-height, seeded), a girt ring between the legs under the buckle, in the frame's own bucket and tint;
 * a frame without a reading (a mast, a pylon, a flood mast by name) stands a four-legged stump about its footprint's
 * middle.
 */
function frameStubs(anatomy: StructureDamageAnatomy, rng: () => number, cap: number, mesh: DamageMeshWriter, share: number,
  fallback: FractureSlot | null, named = true): void {
  // (a stub-less return leaves no earlier building's stubs for frameTier)
  _stubTop.length = 0; _stubX.length = 0; _stubZ.length = 0; stubsDrawn = false;
  const lattice = latticeLegs(anatomy);
  // (destruction-slabs 227) a frame by what it draws (no lattice reading, no frame's name: a tank on its legs, a fence)
  // stands its stubs on its own drawn legs (the ground storey's wall clusters, to their drawn tops), never a four-legged
  // stump about its middle where it drew nothing
  const drawn = !lattice && !named && anatomy.enclosure
    ? wallClusters(anatomy, 0, 6).filter((c) => c.top > 0.6).map((c) => ({ foot: [c.x, 0, c.z], head: [c.x, c.top, c.z] })) : null;
  if (drawn && !drawn.length) return;
  // (destruction-slabs 227) a named frame without a reading (a guyed mast on its pad beside its hut) stands its stump where
  // it is drawn tallest, no wider than it is drawn there (about the footprint's middle it stood a 2.8 m lattice beside the
  // 0.6 m mast, where nothing was drawn), and none where its body draws nothing near the frame's height (a set piece whose
  // mast is its own falling piece: the body left is its pad and hut)
  const tall = !lattice && !drawn && anatomy.enclosure ? tallestDrawn(anatomy) : null;
  const stumpTop = Math.max(2, ruinScale);
  if (!lattice && !drawn && anatomy.enclosure && (!tall || tall.top < 0.5 * stumpTop)) return;
  const bucket = lattice ? lattice.bucket : fallback?.bucket;
  if (!bucket || !roomFor(mesh, 16) || !mesh.begin(bucket, 'remnant')) return;
  const tint: Rgb = lattice?.colour ?? fallback?.tint ?? [0.42, 0.42, 0.44];
  const t = Math.max(0.12, Math.min(0.5, lattice ? lattice.size : 0.2));
  _stubTop.length = 0; _stubX.length = 0; _stubZ.length = 0;
  const legs = lattice ? lattice.legs : drawn;
  const n = legs ? legs.length : 4;
  const sx = tall ? tall.x : fcx, sz = tall ? tall.z : fcz;
  const r = tall ? Math.max(0.12, Math.min(1.4, Math.min(tall.halfW, tall.halfD) - t / 2))
    : Math.max(0.5, Math.min(1.4, 0.18 * Math.min(fhw, fhd)));
  for (let k = 0; k < n && roomFor(mesh, 3); k++) {
    let foot = legs ? legs[k]!.foot : [sx + (k & 1 ? r : -r), 0, sz + (k & 2 ? r : -r)];
    // (a named stump's leg on the tall cluster's nearest drawn cell: a hollow tower's ring left its legs in the void)
    if (!legs && tall && tall.spots.length) {
      let best = 0, bd = Infinity;
      for (let q = 0; q < tall.spots.length; q += 2) {
        const d2 = (tall.spots[q]! - foot[0]!) ** 2 + (tall.spots[q + 1]! - foot[2]!) ** 2;
        if (d2 < bd) { bd = d2; best = q; }
      }
      foot = [tall.spots[best]!, 0, tall.spots[best + 1]!];
    }
    // (a named stump buckles as high up its frame as the frame's own height reads, never over the frame as drawn there)
    const head = legs ? legs[k]!.head : [foot[0]!, stumpTop, foot[2]!];
    const rise = Math.max(0.5, head[1]! - foot[1]!);
    const top = Math.min(cap, foot[1]! + rise * share * (0.85 + rng() * 0.3), tall ? tall.top : Infinity);
    const u = (top - foot[1]!) / rise;
    const x = foot[0]! + (head[0]! - foot[0]!) * u, z = foot[2]! + (head[2]! - foot[2]!) * u;
    const mid = (foot[1]! - FOOT_M + top) / 2;
    const kx = (rng() - 0.5) * t * 2.5, kz = (rng() - 0.5) * t * 2.5;
    const shade = 0.82 + rng() * 0.15;
    // the leg to the kink, then the kinked upper length to the buckle
    box(mesh, (foot[0]! + x) / 2, (foot[1]! - FOOT_M + mid) / 2, (foot[2]! + z) / 2, t / 2, (mid - foot[1]! + FOOT_M) / 2, t / 2, 0, tint, shade);
    box(mesh, x + kx, (mid + top) / 2, z + kz, t / 2, (top - mid) / 2, t / 2, 0, tint, shade);
    _stubTop.push(top); _stubX.push(x); _stubZ.push(z);
  }
  // the girt ring under the lowest buckle (not between a drawn frame's clusters: they need not be a frame's bays)
  let low = Infinity;
  for (const y of _stubTop) low = Math.min(low, y);
  // (a named stump where its frame is drawn tallest takes no bent legs out from it: struts across it, between its own
  // legs, only)
  stubsDrawn = !!drawn || !!tall;
  if (drawn) low = NaN;
  if (Number.isFinite(low)) {
    // girts up the standing panels (their bracing reads as the frame's own, and stands)
    for (const f of [0.2, 0.36, 0.52, 0.68, 0.84, 0.97]) {
      const gy = low * f;
      for (let k = 0; k < _stubX.length && roomFor(mesh, 1); k++) {
        const j = (k + 1) % _stubX.length;
        member(mesh, _stubX[k]!, _stubZ[k]!, _stubX[j]!, _stubZ[j]!, gy, t * 0.35, t * 0.6, tint, 0.8 + rng() * 0.15);
      }
    }
  }
  // each bay's X bracing up the standing panels (the frame's own diagonals)
  if (Number.isFinite(low)) {
    for (let k = 0; k < _stubX.length && roomFor(mesh, 2); k++) {
      const j = (k + 1) % _stubX.length;
      for (const [y0, y1] of [[low * 0.2, low * 0.6], [low * 0.6, low * 0.97]]) {
        strut(mesh, _stubX[k]!, y0, _stubZ[k]!, _stubX[j]!, y1, _stubZ[j]!, t * 0.55, tint, 0.78 + rng() * 0.15);
        strut(mesh, _stubX[j]!, y0, _stubZ[j]!, _stubX[k]!, y1, _stubZ[k]!, t * 0.55, tint, 0.78 + rng() * 0.15);
      }
    }
  }
  mesh.end();
}

/**
 * A frame's remnant beyond its standing panels (frameStubs' legs, in its scratch): tier 1 bends each leg's upper length
 * out and up from its buckle; tier 2 lays struts across the frame between opposite legs, high. New members each tier.
 */
function frameTier(rng: () => number, cap: number, mesh: DamageMeshWriter, tier: number, fallback: FractureSlot,
  anatomy: StructureDamageAnatomy): void {
  const n = _stubX.length;
  if (!n || (stubsDrawn && tier === 1)) return;
  const lattice = latticeLegs(anatomy);
  const bucket = lattice ? lattice.bucket : fallback.bucket;
  if (!roomFor(mesh, n * 2) || !mesh.begin(bucket, 'remnant')) return;
  const tint: Rgb = lattice?.colour ?? fallback.tint;
  const t = Math.max(0.12, Math.min(0.5, lattice ? lattice.size : 0.2));
  // the frame's middle: its stubs' (a named stump stands where its frame is drawn, not about the footprint's middle)
  let mx = 0, mz = 0;
  for (let k = 0; k < n; k++) { mx += _stubX[k]! / n; mz += _stubZ[k]! / n; }
  for (let k = 0; k < n && roomFor(mesh, 2); k++) {
    const x = _stubX[k]!, z = _stubZ[k]!, top = _stubTop[k]!;
    if (tier === 1) {
      // up to 1.45 times the buckle (never past the cap): out from the frame's middle, or (destruction-slabs 227 round 2)
      // where the frame's drawn form is known, folded in over its middle — under what it drew there (a water tower's legs
      // under its tank), never splayed out over nothing (a leg bent out and up stood past the drawn tower's envelope; capped
      // there, it drooped to the ground and the ruin stood a fifth of the tower's height)
      const ox = x - mx, oz = z - mz, ol = Math.hypot(ox, oz) || 1;
      const inward = !!ruinOf && ol > 0.6;
      const reach = inward ? Math.min(ol * 0.85, 0.8 + rng() * 1.4) : 0.8 + rng() * 1.4;
      const sgn = inward ? -1 : 1;
      const tx = x + sgn * (ox / ol) * reach, tz = z + sgn * (oz / ol) * reach;
      const drawnTip = ruinOf ? drawnOverAt(ruinOf, tx, tz, 0) : Infinity;
      const y1 = Math.min(cap, top * (1.3 + rng() * 0.15), Number.isFinite(drawnTip) ? Math.max(0.4, drawnTip + 0.4) : Infinity);
      strut(mesh, x, top, z, tx, y1, tz, t * 0.9, tint, 0.8 + rng() * 0.15);
    } else {
      const j = (k + (n >> 1)) % n;
      if (j === k) continue;
      const y = Math.min(_stubTop[k]!, _stubTop[j]!) * (0.78 + rng() * 0.15);
      strut(mesh, x, y, z, _stubX[j]!, y * (0.92 + rng() * 0.1), _stubZ[j]!, t * 0.7, tint, 0.8 + rng() * 0.15);
    }
  }
  mesh.end();
}

/**
 * A skin wall's standing frame (timber, plank, sheet metal; never masonry): its posts at the corners and along each face
 * (a gap left in each), `share` of the ruin's scale, some leaning (two courses offset), and a wall panel or two leant
 * against them, in the wall's own bucket and tint.
 */
function framePosts(rng: () => number, slot: FractureSlot, cap: number, mesh: DamageMeshWriter, share: number, loose = false): void {
  // (loose posts need a grid fine enough to read a post's own drawn height: a guyed mast's metre cells stood them 1.8 m
  // over what is drawn there)
  if (loose && !((ruinOf?.enclosure?.cell ?? Infinity) <= 0.6)) return;
  if (!roomFor(mesh, 8) || !mesh.begin(slot.bucket, 'remnant')) return;
  const t = Math.max(0.14, Math.min(0.32, slot.thicknessM > 0.05 ? slot.thicknessM : 0.2));
  for (let face = 0; face < 4 && roomFor(mesh, 3); face++) {
    const alongX = face < 2, len = alongX ? 2 * fhw : 2 * fhd, off = alongX ? fhd : fhw, side = face & 1 ? 1 : -1;
    const posts = Math.max(2, Math.min(7, Math.round(len / 2.8) + 1));
    const gap = 1 + Math.floor(rng() * Math.max(1, posts - 2));
    for (let k = 0; k < posts && roomFor(mesh, 2); k++) {
      if (k === gap) continue;
      const u = -len / 2 + t / 2 + (k / (posts - 1)) * (len - t);
      const h0 = Math.min(cap, ruinScale * share * (0.6 + rng() * 0.5));
      const lean = rng() < 0.4 ? (rng() - 0.5) * 0.6 : 0;
      const shade = 0.8 + rng() * 0.18;
      // (destruction-slabs 227) on the drawn wall in from the edge, no taller than it is drawn there
      const px = alongX ? fcx + u : fcx + side * off, pz = alongX ? fcz + side * off : fcz + u, pnx = alongX ? 0 : -side, pnz = alongX ? -side : 0;
      // (a frame's posts and rails make no wall cell — too thin for a band's cover: `loose`, they stand on the plan's edge
      // under what is drawn over it there)
      let d = inToWall(px, pz, pnx, pnz);
      if (!Number.isFinite(d) && loose) d = 0;
      if (!Number.isFinite(d)) continue;
      const x = alongX ? fcx + u : fcx + side * (off - d - t / 2), z = alongX ? fcz + side * (off - d - t / 2) : fcz + u;
      // (loose: no taller than drawn in its own cell, and none where nothing is drawn — a frame's yard, a farm's gap)
      const h = Math.min(h0, loose && ruinOf ? 0.6 * wallTopAt(ruinOf, x, z, 0) : topOfWallIn(px, pz, pnx, pnz, d));
      if (h < 0.5) continue;
      const h1 = h * 0.55;
      box(mesh, x, (h1 - FOOT_M) / 2, z, t / 2, (h1 + FOOT_M) / 2, t / 2, 0, slot.tint, shade);
      box(mesh, x + (alongX ? lean : 0), (h1 + h) / 2, z + (alongX ? 0 : lean), t / 2, (h - h1) / 2, t / 2, 0, slot.tint, shade);
    }
    // panels of the wall leant against its posts, inside the walls (destruction-slabs 227: they stood 0.25 m past them)
    for (let p = 0; p < 2 && roomFor(mesh, 1); p++) {
      const pl = Math.min(len * 0.45, 1.6 + rng() * 1.6), ph0 = Math.min(cap, ruinScale * share * (0.6 + rng() * 0.35));
      const u = (rng() - 0.5) * (len - pl);
      const shade = 0.75 + rng() * 0.2;
      const px = alongX ? fcx + u : fcx + side * off, pz = alongX ? fcz + side * off : fcz + u, pnx = alongX ? 0 : -side, pnz = alongX ? -side : 0;
      let d = inToWall(px, pz, pnx, pnz);
      if (!Number.isFinite(d) && loose) d = 0;
      if (!Number.isFinite(d)) continue;
      const inset = off - d - t - 0.12;
      const x = alongX ? fcx + u : fcx + side * inset, z = alongX ? fcz + side * inset : fcz + u;
      // (loose: under what is drawn at its middle and both its ends, inside the drawn plan)
      const ex = alongX ? pl / 2 : 0, ez = alongX ? 0 : pl / 2;
      const ph = Math.min(ph0, loose && ruinOf
        ? (enclosedAt(ruinOf, x - ex, z - ez, 0) && enclosedAt(ruinOf, x + ex, z + ez, 0)
          ? 0.6 * Math.min(wallTopAt(ruinOf, x, z, 0), wallTopAt(ruinOf, x - ex, z - ez, 0), wallTopAt(ruinOf, x + ex, z + ez, 0)) : 0)
        : topOfWallIn(px, pz, pnx, pnz, d));
      if (!(ph > 0.3)) continue;
      box(mesh, x, ph / 2 - 0.1, z, alongX ? pl / 2 : 0.05, ph / 2, alongX ? 0.05 : pl / 2, 0, slot.tint, shade);
    }
  }
  mesh.end();
}

/** The fallen roof's covering as slabs leaning on the heap, tipped from the eaves inward. */
function roofSlabs(anatomy: StructureDamageAnatomy, rng: () => number, mesh: DamageMeshWriter, cap: number): void {
  const roof = anatomy.roof;
  if (!roof || !roomFor(mesh, 6) || !mesh.begin(roof.covering.bucket, 'rubble')) return;
  for (let k = 0; k < 6 && roomFor(mesh, 1); k++) {
    const x = fcx + (rng() - 0.5) * fhw * 1.4, z = fcz + (rng() - 0.5) * fhd * 1.4;
    const base = bodyMoundHeightAt(anatomy, x, z);
    const len = 2 * Math.min(fhw, fhd) * (0.25 + rng() * 0.2);
    const rise = Math.min(cap, len * (0.5 + rng() * 0.4));
    const shade = 0.7 + rng() * 0.25;
    // (destruction-slabs 227) only over what the building drew (its walls and their enclosure)
    const yaw = rng() * Math.PI;
    if (enclosedAt(anatomy, x, z, 0.5) === false) continue;
    // (round 2: a warehouse's leant slab stood a third past its walls) both its ends over the drawn plan too
    const ex = Math.cos(yaw) * len / 2, ez = -Math.sin(yaw) * len / 2;
    if (enclosedAt(anatomy, x + ex, z + ez, 0) === false || enclosedAt(anatomy, x - ex, z - ez, 0) === false) continue;
    // a slab stood on its end against the heap: a thin box, tall over the mound
    box(mesh, x, base + rise / 2, z, len / 2, rise / 2, Math.max(0.08, roof.thicknessM), yaw, roof.covering.tint, shade);
  }
  mesh.end();
}

/**
 * The intact form's area-weighted 90th percentile height, estimated from the anatomy (the check's reference; the seam
 * has no triangles): every storey's faces spread over their heights, the roof's area over its eaves to its ridge (a flat
 * roof at its eaves), on the measure's bins. Never above the top.
 */
export function intactHeightP90(anatomy: StructureDamageAnatomy): number {
  const top = Math.max(0.5, anatomy.h);
  bins.fill(0);
  const spread = (y0: number, y1: number, area: number) => {
    if (!(area > 0)) return;
    const a = Math.max(0, Math.min(BINS - 1, Math.floor((Math.min(y0, y1) / top) * BINS)));
    const b = Math.max(a, Math.min(BINS - 1, Math.floor((Math.max(y0, y1) / top) * BINS)));
    const each = area / (b - a + 1);
    for (let i = a; i <= b; i++) bins[i] += each;
  };
  for (const storey of anatomy.storeys) for (const face of storey.faces) spread(storey.y0, storey.y0 + face.height, face.width * face.height);
  const roof = anatomy.roof;
  if (roof) {
    const pitch = Math.min(75, Math.max(0, roof.pitchDeg)) * (Math.PI / 180);
    const area = (anatomy.w * anatomy.d) / Math.max(0.26, Math.cos(pitch));
    if (roof.ridgeY - roof.eaveY > 0.2) spread(roof.eaveY, roof.ridgeY, area); else spread(roof.eaveY, roof.eaveY, area);
  }
  let total = 0;
  for (let i = 0; i < BINS; i++) total += bins[i]!;
  let p90 = top * 0.85;
  if (total > 0) {
    let acc = 0;
    for (let i = 0; i < BINS; i++) { acc += bins[i]!; if (acc >= 0.9 * total) { p90 = ((i + 0.5) / BINS) * top; break; } }
  }
  bins.fill(0);
  return Math.min(top, p90);
}

/**
 * The intact form as drawn, from its parts (body frame, by bucket): the area-weighted 90th percentile of its triangles'
 * centroid heights (the sweep's measure, on 64 bins over its height), its top and its plan's box. Once per structure at
 * describe; no allocation but the result.
 */
export function measureIntactParts(parts: Readonly<Record<string, readonly BufferGeometry[]>> | null | undefined): StructureDamageAnatomy['intact'] | null {
  if (!parts) return null;
  let topY = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, any = false;
  for (const list of Object.values(parts)) for (const geometry of list) {
    const pos = geometry.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y > topY) topY = y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      any = true;
    }
  }
  if (!any || !(topY > 0)) return null;
  bins.fill(0);
  let total = 0;
  for (const list of Object.values(parts)) for (const geometry of list) {
    const pos = geometry.getAttribute('position');
    if (!pos) continue;
    const index = geometry.getIndex();
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const ux = pos.getX(b) - ax, uy = pos.getY(b) - ay, uz = pos.getZ(b) - az;
      const vx = pos.getX(c) - ax, vy = pos.getY(c) - ay, vz = pos.getZ(c) - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(area > 0)) continue;
      const y = (ay + pos.getY(b) + pos.getY(c)) / 3;
      bins[Math.max(0, Math.min(BINS - 1, Math.floor((y / topY) * BINS)))] += area;
      total += area;
    }
  }
  let p90 = topY;
  if (total > 0) {
    let acc = 0;
    for (let i = 0; i < BINS; i++) { acc += bins[i]!; if (acc >= 0.9 * total) { p90 = ((i + 1) / BINS) * topY; break; } }
  }
  bins.fill(0);
  // its plan: every triangle laid on a 32 × 32 grid over its box (a barycentric lattice no coarser than a cell)
  const cells = new Uint8Array(PLAN_N * PLAN_N);
  const sx = Math.max(1e-3, maxX - minX), sz = Math.max(1e-3, maxZ - minZ), cell = Math.min(sx, sz) / PLAN_N;
  for (const list of Object.values(parts)) for (const geometry of list) {
    const pos = geometry.getAttribute('position');
    if (!pos) continue;
    const index = geometry.getIndex();
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      const ax = pos.getX(a), az = pos.getZ(a), ux = pos.getX(b) - ax, uz = pos.getZ(b) - az, vx = pos.getX(c) - ax, vz = pos.getZ(c) - az;
      const steps = Math.max(1, Math.min(64, Math.ceil(Math.max(Math.hypot(ux, uz), Math.hypot(vx, vz)) / cell)));
      for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
        const x = ax + (ux * i + vx * j) / steps, z = az + (uz * i + vz * j) / steps;
        const ci = Math.min(PLAN_N - 1, Math.max(0, Math.floor(((x - minX) / sx) * PLAN_N)));
        const ck = Math.min(PLAN_N - 1, Math.max(0, Math.floor(((z - minZ) / sz) * PLAN_N)));
        cells[ck * PLAN_N + ci] = 1;
      }
    }
  }
  let drawn = 0;
  for (let i = 0; i < cells.length; i++) drawn += cells[i]!;
  return { p90M: p90, topM: topY, minX, maxX, minZ, maxZ, cells, planFill: drawn / cells.length };
}

/** The intact plan's grid (measureIntactParts). */
const PLAN_N = 32;
/**
 * Whether the intact form was drawn over (x, z) (body frame), within a cell: false only for a sparse form (under half its
 * box drawn over: a guyed mast, a frame, a row) away from its pieces; null where nothing restricts (a dense form, no data).
 * A heap follows the form's own pieces, not its box.
 */
export function intactPlanAt(anatomy: StructureDamageAnatomy, x: number, z: number): boolean | null {
  // (destruction-slabs 227) the drawn enclosure where there is one, for every form (a dense one's plan is no box either:
  // a church's forecourt, a station's platform)
  const drawn = enclosedAt(anatomy, x, z, 0.75);
  if (drawn !== null) return drawn;
  const intact = anatomy.intact;
  if (!intact || !intact.cells || !(intact.planFill < 0.5)) return null;
  const sx = intact.maxX - intact.minX, sz = intact.maxZ - intact.minZ;
  if (!(sx > 0 && sz > 0)) return null;
  const ci = Math.floor(((x - intact.minX) / sx) * PLAN_N), ck = Math.floor(((z - intact.minZ) / sz) * PLAN_N);
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, k = ck + dk;
    if (i >= 0 && i < PLAN_N && k >= 0 && k < PLAN_N && intact.cells[k * PLAN_N + i]) return true;
  }
  return false;
}

/**
 * The walls' rectangle in the body frame (a kit's body frame is not always centred on its walls): the ground storey's
 * faces' ends, else the intact's plan box, else the anatomy's extents about the origin.
 */
function footprintOf(anatomy: StructureDamageAnatomy): void {
  const faces = anatomy.storeys[0]?.faces ?? [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const face of faces) {
    for (const end of [-0.5, 0.5]) {
      const x = face.origin[0] + face.u[0] * face.width * end, z = face.origin[2] + face.u[2] * face.width * end;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  // (destruction-slabs 227) the ground storey's drawn walls and what they enclose, where the structure has them
  const band0 = bandEnclosure(anatomy, 0);
  if (band0 && band0.solidBox[2] - band0.solidBox[0] > 0.5 && band0.solidBox[3] - band0.solidBox[1] > 0.5) {
    minX = band0.solidBox[0]; minZ = band0.solidBox[1]; maxX = band0.solidBox[2]; maxZ = band0.solidBox[3];
  }
  const intact = anatomy.intact;
  if (!(maxX - minX > 0.5 && maxZ - minZ > 0.5) && intact) { minX = intact.minX; maxX = intact.maxX; minZ = intact.minZ; maxZ = intact.maxZ; }
  if (!(maxX - minX > 0.5 && maxZ - minZ > 0.5)) { minX = -anatomy.w / 2; maxX = anatomy.w / 2; minZ = -anatomy.d / 2; maxZ = anatomy.d / 2; }
  // never past the body's reach about its walls' middle (the face origins' mean; the kits' receipts hold a collapse there)
  if (faces.length) {
    let mx = 0, mz = 0;
    for (const face of faces) { mx += face.origin[0]; mz += face.origin[2]; }
    mx /= faces.length; mz /= faces.length;
    const reach = Math.max(anatomy.w, anatomy.d) / 2 + 5.8;
    minX = Math.max(minX, mx - reach); maxX = Math.min(maxX, mx + reach); minZ = Math.max(minZ, mz - reach); maxZ = Math.min(maxZ, mz + reach);
    reachBox[0] = mx - reach; reachBox[1] = mx + reach; reachBox[2] = mz - reach; reachBox[3] = mz + reach;
  } else {
    reachBox[0] = -Infinity; reachBox[1] = Infinity; reachBox[2] = -Infinity; reachBox[3] = Infinity;
  }
  fcx = (minX + maxX) / 2; fcz = (minZ + maxZ) / 2; fhw = Math.max(0.5, (maxX - minX) / 2); fhd = Math.max(0.5, (maxZ - minZ) / 2);
}
/** The body's reach about its walls' middle [minX, maxX, minZ, maxZ] (footprintOf). */
const reachBox = new Float64Array(4);

/** The wall materials a ruin's piers and stubs stand in: masonry (a wall of courses or a mass), never a frame or a skin. */
const MASONRY: ReadonlySet<string> = new Set(['brick', 'stone', 'rubble', 'concrete', 'adobe', 'plaster', 'infill', 'earth']);
/** The builders that are open frames, whatever their walls read as (they fall as their own lattice: latticeFall.ts). */
const FRAME_BUILDER = /watertower|windmill|mill-wheel|mast|pylon|lattice|headframe|gantry|derrick|crane|radar|antenna|aerial/i;
/** An open frame by its builder's name. */
export function frameByName(builder: string | null | undefined): boolean {
  return typeof builder === 'string' && FRAME_BUILDER.test(builder);
}
/** An open frame by its kit's plan (latticeFall.ts latticeOf), its own or a body's (damage.ts bodiesOf). */
function framePlan(anatomy: StructureDamageAnatomy): boolean {
  const plan = anatomy.kitPlan as { damage?: { lattice?: unknown }; bodies?: StructureDamageAnatomy[] } | undefined;
  if (plan?.damage?.lattice) return true;
  for (const body of plan?.bodies ?? []) {
    if ((body.kitPlan as { damage?: { lattice?: unknown } } | undefined)?.damage?.lattice) return true;
  }
  return false;
}
/**
 * How a collapse's ruin may stand (2026-10-16, the LOOKS gate: a 5.71 m masonry pier run stood on navajo's collapsed
 * steel water tower): 'frame' — an open lattice (a water tower, a windmill, a mast, a pylon, a headframe: anything
 * latticeFall.ts lays down) falls as its own buckled remnant and takes nothing from this pass; 'skin' — a timber, plank,
 * sheet-metal, thatch or canvas wall takes the heap and the fallen covering but no masonry pier or stub; 'masonry' —
 * the whole pass.
 */
export function ruinKind(anatomy: StructureDamageAnatomy, builder: string | null = null): 'frame' | 'skin' | 'masonry' {
  // (destruction-slabs 227) or by what it draws: it stands on posts, every band open (a fire lookout, a market's stalls:
  // whatever their walls read as; a ruin's ragged walls or a gate's piers enclose little too, but they are runs)
  if (framePlan(anatomy) || anatomy.intact?.frame || frameByName(builder) || standsOnPosts(anatomy)) return 'frame';
  const wall = wallSlot(anatomy);
  return wall && MASONRY.has(wall.material) ? 'masonry' : 'skin';
}

/** The structural slot of the ground storey's walls (its innermost layer: the masonry, the frame), else the pile's. */
function wallSlot(anatomy: StructureDamageAnatomy): FractureSlot | null {
  const face = anatomy.storeys[0]?.faces[0];
  const layers = face?.layers;
  if (layers && layers.length) return layers[layers.length - 1]!;
  return anatomy.rubble.length ? biggest(anatomy.rubble) : null;
}
function biggest(slots: readonly FractureSlot[]): FractureSlot {
  let best = slots[0]!;
  for (const slot of slots) if (slot.share > best.share) best = slot;
  return best;
}

/**
 * Run the kit's collapse through the measuring writer, then add what the ruin lacks (the file's note). The kit's own
 * writes go to `out` exactly as before; this only appends.
 */
export function keepRuinStanding<R>(anatomy: StructureDamageAnatomy, seed: number, out: DamageWriters,
  collapse: (writers: DamageWriters) => R, builder: string | null = null): R {
  // an open frame falls as its own lattice remnant (latticeFall.ts) and a skin wall as its own frame: never masonry
  const kind = ruinKind(anatomy, builder);
  const intact = anatomy.intact;
  // the reference: the intact form's p90 height as drawn (measured at describe), else estimated from the anatomy
  const reference = intact ? intact.p90M : intactHeightP90(anatomy);
  const top = Math.max(0.5, anatomy.h, intact ? intact.topM : 0, reference);
  ruinScale = Math.max(anatomy.h * 0.6, reference / 0.85);
  inner = out.mesh;
  writers.pieces = out.pieces;
  measuring = true;
  ruinOf = anatomy.enclosure ? anatomy : null;
  footprintOf(anatomy);
  // the plan the ruin covers: the intact's own box about the body's origin, else the walls' rectangle about it
  const halfW = intact ? Math.max(Math.abs(intact.minX), Math.abs(intact.maxX)) : Math.abs(fcx) + fhw;
  const halfD = intact ? Math.max(Math.abs(intact.minZ), Math.abs(intact.maxZ)) : Math.abs(fcz) + fhd;
  resetMeasure(top, halfW, halfD);
  let result: R;
  try {
    kitPhase = true;
    result = collapse(writers);
    kitPhase = false;
    const rng = damageRng(damageSeed(seed, 0x52554e));
    const pile = anatomy.rubble.length ? biggest(anatomy.rubble) : wallSlot(anatomy);
    // only a masonry wall leaves piers and stubs standing (a timber, sheet or canvas wall leaves its heap and covering)
    const wall = kind === 'masonry' ? wallSlot(anatomy) : null;
    const target = RUIN_HEIGHT_SHARE * reference;
    // nothing stands past the eaves (a stub never stands over the roof line it carried)
    const cap = Math.max(1.2, reference * 0.7, anatomy.roof ? Math.min(top, anatomy.roof.eaveY) : top);
    // the plan: the interior heaped over the body's footprint, then (a row, a frame wider than its walls) the intact's box
    if (kind === 'frame') {
      // an open shed's frame (lattice.ts `shed`) drops its roof and floor over its plan: the heap there
      // (a roofed hall reads so by its roof, or by an intact plan its roof covers: not a tower, mast or gantry by name)
      const covered = !!anatomy.roof || (intact ? intact.planFill >= 0.5 : false);
      const shedFrame = !!(latticeLegs(anatomy) as { shed?: unknown } | null)?.shed || (covered && !frameByName(builder) && !intact?.frame);
      if (shedFrame && pile && planShare() < RUIN_PLAN_SHARE) fillMound(anatomy, rng, pile, measuringWriter, fcx - fhw, fcx + fhw, fcz - fhd, fcz + fhd);
      if (shedFrame && pile && intact && planShare() < RUIN_PLAN_SHARE) {
        fillMound(anatomy, rng, pile, measuringWriter, Math.max(intact.minX, reachBox[0]!), Math.min(intact.maxX, reachBox[1]!),
          Math.max(intact.minZ, reachBox[2]!), Math.min(intact.maxZ, reachBox[3]!));
      }
      // an open frame: its own legs buckled and standing, nothing heaped where it drew nothing, no masonry
      if (heightP90() < target) frameStubs(anatomy, rng, cap, measuringWriter, 0.42, frameSlot(anatomy),
        framePlan(anatomy) || !!intact?.frame || frameByName(builder));
      // still short: the bent upper legs leaning out from the buckle, then struts across the frame (each a new member)
      for (let tier = 1; tier <= 2 && heightP90() < target; tier++) frameTier(rng, cap, measuringWriter, tier, frameSlot(anatomy), anatomy);
      // (destruction-slabs 227 round 2: a rack or a shed read as a frame by its posts — no longer as a skin wall — stood
      // at a fifth of its height on its legs alone) still short: its posts where it is drawn, and its boards leant on them
      for (let pass = 0; pass < 12 && ruinOf && heightP90() < target; pass++) framePosts(rng, frameSlot(anatomy), cap, measuringWriter, 0.4 + Math.min(8, pass) * 0.05, true);
      return result;
    }
    if (pile && planShare() < RUIN_PLAN_SHARE) fillMound(anatomy, rng, pile, measuringWriter, fcx - fhw, fcx + fhw, fcz - fhd, fcz + fhd);
    if (pile && intact && planShare() < RUIN_PLAN_SHARE) {
      fillMound(anatomy, rng, pile, measuringWriter, Math.max(intact.minX, reachBox[0]!), Math.min(intact.maxX, reachBox[1]!),
        Math.max(intact.minZ, reachBox[2]!), Math.min(intact.maxZ, reachBox[3]!));
    }
    // the height: the corners, then wall fragments round the plan until it stands (a heap of a great many pieces needs
    // more of them), the fallen covering's slabs once
    if (wall && heightP90() < target) cornerPiers(rng, wall, cap, measuringWriter, 0.42 + rng() * 0.18);
    if (wall && heightP90() < target) wallStubs(rng, wall, cap, measuringWriter, 0.32);
    // still short (a tower set back on its podium: the walls round the plan's edge are drawn low): stubs on its walls
    // where they are drawn tall, before the fragments spend the reserve
    if (wall && heightP90() < target) tallWallStubs(rng, wall, cap, measuringWriter, target);
    if (heightP90() < target) roofSlabs(anatomy, rng, measuringWriter, cap * 0.5);
    for (let k = 0; k < 120 && wall && heightP90() < target && roomFor(measuringWriter, 3); k++) wallFragment(rng, wall, cap, measuringWriter, k, target);
    // a skin wall: its walls' posts where they are drawn tall (a bin over its legs, a mill on its base, a tank's shell),
    // then its posts and leant panels round the plan until it stands
    const skin = kind === 'skin' ? wallSlot(anatomy) : null;
    if (skin && ruinOf && heightP90() < target) tallWallStubs(rng, skin, cap, measuringWriter, target);
    for (let pass = 0; pass < 8 && skin && heightP90() < target; pass++) framePosts(rng, skin, cap, measuringWriter, 0.4 + pass * 0.05);
    // (round 2: a tank farm's shells stand few and far between, its crumpled heap the most of its vertices) still short:
    // posts and panels on the plan's edge under what is drawn there, as a frame's
    for (let pass = 0; pass < 4 && skin && ruinOf && heightP90() < target; pass++) framePosts(rng, skin, cap, measuringWriter, 0.6 + pass * 0.05, true);
  } finally {
    kitPhase = false;
    measuring = false;
    ruinOf = null;
    inner = null;
    writers.pieces = null as unknown as DamageWriters['pieces'];
  }
  return result;
}

/** Receipts: the last ruin's measured height (area-weighted p90) and plan share. */
export function lastRuinMeasure(): { heightP90: number; planShare: number } {
  return { heightP90: heightP90(), planShare: planShare() };
}
