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
    mesh.triangle(_quad[0]!, _quad[1]!, _quad[2]!);
    mesh.triangle(_quad[0]!, _quad[2]!, _quad[3]!);
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
    const a = ids[k * (nx + 1) + i]!, b = ids[k * (nx + 1) + i + 1]!, c = ids[(k + 1) * (nx + 1) + i + 1]!, d = ids[(k + 1) * (nx + 1) + i]!;
    mesh.triangle(a, c, b); mesh.triangle(a, d, c);
  }
  mesh.end();
}
const _ids: number[] = [];

/** The corners' L piers: two legs along the corner's faces, stepped at the top (three courses, each shorter). */
function cornerPiers(anatomy: StructureDamageAnatomy, rng: () => number, slot: FractureSlot, cap: number,
  mesh: DamageMeshWriter, share: number): void {
  if (!roomFor(mesh, 4 * 6) || !mesh.begin(slot.bucket, 'remnant')) return;
  const hw = anatomy.w / 2, hd = anatomy.d / 2;
  const t = Math.max(0.3, Math.min(0.8, slot.thicknessM > 0.05 ? slot.thicknessM * 1.6 : 0.45));
  for (let corner = 0; corner < 4; corner++) {
    const sx = corner & 1 ? 1 : -1, sz = corner & 2 ? 1 : -1;
    const height = Math.min(cap, ruinScale * share * (0.85 + rng() * 0.3));
    if (height < 0.6) continue;
    const legX = Math.min(hw, Math.max(0.8, anatomy.w * (0.16 + rng() * 0.12))), legZ = Math.min(hd, Math.max(0.8, anatomy.d * (0.16 + rng() * 0.12)));
    let h0 = -FOOT_M;
    for (let course = 0; course < 3; course++) {
      const top = height * (course === 0 ? 0.55 : course === 1 ? 0.82 : 1);
      const shrink = 1 - course * 0.28;
      const hy = (top - h0) / 2, cy = h0 + hy;
      const shade = 0.82 + rng() * 0.16;
      // the leg along x (on the z face), then the leg along z (on the x face)
      const lx = legX * shrink * (0.85 + rng() * 0.15), lz = legZ * shrink * (0.85 + rng() * 0.15);
      box(mesh, sx * (hw - lx / 2), cy, sz * (hd - t / 2), lx / 2, hy, t / 2, 0, slot.tint, shade);
      box(mesh, sx * (hw - t / 2), cy, sz * (hd - lz / 2), t / 2, hy, lz / 2, 0, slot.tint, shade);
      h0 = top;
    }
  }
  mesh.end();
}

/** Ragged wall stubs along each face between its corner piers, a breach of a fifth of the face left open in each. */
function wallStubs(anatomy: StructureDamageAnatomy, rng: () => number, slot: FractureSlot, cap: number,
  mesh: DamageMeshWriter, share: number): void {
  if (!mesh.begin(slot.bucket, 'remnant')) return;
  const hw = anatomy.w / 2, hd = anatomy.d / 2;
  const t = Math.max(0.25, Math.min(0.7, slot.thicknessM > 0.05 ? slot.thicknessM * 1.4 : 0.4));
  for (let face = 0; face < 4 && roomFor(mesh, 2); face++) {
    const alongX = face < 2, len = alongX ? anatomy.w : anatomy.d, off = alongX ? hd : hw, side = face & 1 ? 1 : -1;
    const runs = Math.max(3, Math.min(9, Math.round(len / 1.6)));
    const gap = Math.floor(rng() * runs);
    for (let k = 1; k < runs - 1 && roomFor(mesh, 1); k++) {
      if (k === gap || k === gap + 1) continue;
      const u0 = -len / 2 + (k / runs) * len, u1 = -len / 2 + ((k + 1) / runs) * len;
      const h = Math.min(cap, ruinScale * share * (0.55 + rng() * 0.6));
      if (h < 0.4) continue;
      const u = (u0 + u1) / 2, hu = (u1 - u0) / 2 * (0.9 + rng() * 0.1);
      const shade = 0.8 + rng() * 0.18;
      const cy = (h - FOOT_M) / 2, hy = (h + FOOT_M) / 2;
      if (alongX) box(mesh, u, cy, side * (off - t / 2), hu, hy, t / 2, 0, slot.tint, shade);
      else box(mesh, side * (off - t / 2), cy, u, t / 2, hy, hu, 0, slot.tint, shade);
    }
  }
  mesh.end();
}

/**
 * A standing wall fragment on a face (its `k`-th of a seeded walk round the plan): a ragged run of the wall, 1–2.5 m long,
 * two or three courses stepping down to one side, 50–80 % of the ruin's scale (never past `cap`).
 */
function wallFragment(anatomy: StructureDamageAnatomy, rng: () => number, slot: FractureSlot, cap: number,
  mesh: DamageMeshWriter, k: number): void {
  if (!roomFor(mesh, 3) || !mesh.begin(slot.bucket, 'remnant')) return;
  const hw = anatomy.w / 2, hd = anatomy.d / 2;
  const t = Math.max(0.25, Math.min(0.7, slot.thicknessM > 0.05 ? slot.thicknessM * 1.4 : 0.4));
  const face = (k + Math.floor(rng() * 4)) & 3;
  const alongX = face < 2, len = alongX ? anatomy.w : anatomy.d, off = alongX ? hd : hw, side = face & 1 ? 1 : -1;
  const run = Math.min(len * 0.45, 1 + rng() * 1.5);
  const u = (rng() - 0.5) * Math.max(0, len - run);
  const height = Math.min(cap, ruinScale * (0.5 + rng() * 0.3));
  const courses = 2 + (rng() < 0.5 ? 1 : 0);
  const lean = rng() < 0.5 ? -1 : 1;
  let y0 = -FOOT_M;
  for (let c = 0; c < courses; c++) {
    const y1 = height * ((c + 1) / courses) * (c === courses - 1 ? 1 : 0.9 + rng() * 0.1);
    const l = run * (1 - c * 0.3);
    const uc = u + lean * (run - l) / 2;
    const hy = (y1 - y0) / 2, shade = 0.8 + rng() * 0.18;
    if (alongX) box(mesh, uc, y0 + hy, side * (off - t / 2), l / 2, hy, t / 2, 0, slot.tint, shade);
    else box(mesh, side * (off - t / 2), y0 + hy, uc, t / 2, hy, l / 2, 0, slot.tint, shade);
    y0 = y1;
  }
  mesh.end();
}

/** The fallen roof's covering as slabs leaning on the heap, tipped from the eaves inward. */
function roofSlabs(anatomy: StructureDamageAnatomy, rng: () => number, mesh: DamageMeshWriter, cap: number): void {
  const roof = anatomy.roof;
  if (!roof || !roomFor(mesh, 6) || !mesh.begin(roof.covering.bucket, 'rubble')) return;
  for (let k = 0; k < 6 && roomFor(mesh, 1); k++) {
    const x = (rng() - 0.5) * anatomy.w * 0.7, z = (rng() - 0.5) * anatomy.d * 0.7;
    const base = bodyMoundHeightAt(anatomy, x, z);
    const len = Math.min(anatomy.w, anatomy.d) * (0.25 + rng() * 0.2);
    const rise = Math.min(cap, len * (0.5 + rng() * 0.4));
    const shade = 0.7 + rng() * 0.25;
    // a slab stood on its end against the heap: a thin box, tall over the mound
    box(mesh, x, base + rise / 2, z, len / 2, rise / 2, Math.max(0.08, roof.thicknessM), rng() * Math.PI, roof.covering.tint, shade);
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
  return { p90M: p90, topM: topY, minX, maxX, minZ, maxZ };
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
  collapse: (writers: DamageWriters) => R): R {
  const intact = anatomy.intact;
  // the reference: the intact form's p90 height as drawn (measured at describe), else estimated from the anatomy
  const reference = intact ? intact.p90M : intactHeightP90(anatomy);
  const top = Math.max(0.5, anatomy.h, intact ? intact.topM : 0, reference);
  ruinScale = Math.max(anatomy.h * 0.6, reference / 0.85);
  inner = out.mesh;
  writers.pieces = out.pieces;
  measuring = true;
  // the plan the ruin covers: the intact's own box (about the body's origin), else the body's footprint
  const halfW = intact ? Math.max(Math.abs(intact.minX), Math.abs(intact.maxX)) : anatomy.w / 2;
  const halfD = intact ? Math.max(Math.abs(intact.minZ), Math.abs(intact.maxZ)) : anatomy.d / 2;
  resetMeasure(top, halfW, halfD);
  let result: R;
  try {
    kitPhase = true;
    result = collapse(writers);
    kitPhase = false;
    const rng = damageRng(damageSeed(seed, 0x52554e));
    const pile = anatomy.rubble.length ? biggest(anatomy.rubble) : wallSlot(anatomy);
    const wall = wallSlot(anatomy);
    const target = RUIN_HEIGHT_SHARE * reference;
    // nothing stands past the eaves (a stub never stands over the roof line it carried)
    const cap = Math.max(1.2, reference * 0.7, anatomy.roof ? Math.min(top, anatomy.roof.eaveY) : top);
    // the plan: the interior heaped over the body's footprint, then (a row, a frame wider than its walls) the intact's box
    if (pile && planShare() < RUIN_PLAN_SHARE) fillMound(anatomy, rng, pile, measuringWriter, -anatomy.w / 2, anatomy.w / 2, -anatomy.d / 2, anatomy.d / 2);
    if (pile && intact && planShare() < RUIN_PLAN_SHARE) fillMound(anatomy, rng, pile, measuringWriter, intact.minX, intact.maxX, intact.minZ, intact.maxZ);
    // the height: the corners, then wall fragments round the plan until it stands (a heap of a great many pieces needs
    // more of them), the fallen covering's slabs once
    if (wall && heightP90() < target) cornerPiers(anatomy, rng, wall, cap, measuringWriter, 0.42 + rng() * 0.18);
    if (wall && heightP90() < target) wallStubs(anatomy, rng, wall, cap, measuringWriter, 0.32);
    if (heightP90() < target) roofSlabs(anatomy, rng, measuringWriter, cap * 0.5);
    for (let k = 0; k < 48 && wall && heightP90() < target; k++) wallFragment(anatomy, rng, wall, cap, measuringWriter, k);
  } finally {
    kitPhase = false;
    measuring = false;
    inner = null;
    writers.pieces = null as unknown as DamageWriters['pieces'];
  }
  return result;
}

/** Receipts: the last ruin's measured height (area-weighted p90) and plan share. */
export function lastRuinMeasure(): { heightP90: number; planShare: number } {
  return { heightP90: heightP90(), planShare: planShare() };
}
