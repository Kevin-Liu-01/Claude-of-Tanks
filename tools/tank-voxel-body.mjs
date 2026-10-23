// Shared voxel body core for the tank watertight tools (tank-watertight-check.mjs, gen-interior-fills.mjs):
// conservative triangle voxelisation of the body (running gear, decals, shadow proxies, wires and soft goods
// excluded), exterior flood fill, and the "deep interior" test (shell in all six axis directions AND inside the
// hull's or turret's own vertical shell span at that column AND roofed by real body geometry over its footprint).
// 2026-09-15: ghillie meshes are named `<id>_ghillie_<carrier>_<layer>`, so `ghillie` must match anywhere — anchored,
// the M1A1 SA (Ukraine)'s cage net sealed its drone cage and the generator filled the whole cage as turret interior
// (the grey panels the owner saw covering the cage). Open-lattice buckets (drone cages, slat screens, basket
// frames) are exterior air here as they are for the standard check's continuity raster: a cage's bars never
// enclose a body volume, so the generator must not fill one.
export const DEFAULT_EXCLUDE = /^(gear|track|procShadow|vehicleMarking|utility|antenna|aerial|wire|cable|cloth|canvas|tarp|net|ghillie|mesh)|wheel|hub|sprocket|idler|roller|shoe|EndWheel|Skirt|skirt|Fender|fender|Mudguard|mudguard|ExternalArmor|ghillie|OpenLattice|^turretMissionReceiver$/;

/** Conservative voxelisation: every voxel a triangle passes through becomes shell (owner = first writer). */
export function voxelise(tris, meshes, { voxel = 0.025, exclude = DEFAULT_EXCLUDE } = {}) {
  const VOXEL = voxel, EXCLUDE = exclude;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const groups = []; const groupIndex = new Map();
  const body = [];
  for (const t of tris) {
    const name = meshes[t.mesh] || 'mesh';
    if (EXCLUDE.test(name)) continue;
    body.push(t);
    for (const [x, y, z] of [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const pad = 3;
  const origin = [minX - pad * VOXEL, minY - pad * VOXEL, minZ - pad * VOXEL];
  const nx = Math.ceil((maxX - minX) / VOXEL) + 2 * pad, ny = Math.ceil((maxY - minY) / VOXEL) + 2 * pad, nz = Math.ceil((maxZ - minZ) / VOXEL) + 2 * pad;
  const shell = new Uint16Array(nx * ny * nz); // 0 = empty, else group id + 1
  const idx = (x, y, z) => (z * ny + y) * nx + x;
  // Fills to zero (2026-09-15): a closed mesh's face that lies exactly ON a lattice plane (the
  // generated interior-fill boxes are authored on the lattice; many plates sit at round metres)
  // must rasterise into the voxel on the mesh's INSIDE, so a box spanning voxels k..k1 marks
  // exactly k..k1 — the same set the generator claimed — and not a neighbour that floor() or a
  // both-sides rule happened to pick. Marking the outer neighbour widened every fill by a voxel
  // in the check alone, which lifted deepInterior's hull column spans and turned unclaimed
  // slivers into "deep" leaks the generator never saw. Each sample is therefore nudged half a
  // millimetre against the triangle's winding normal before it is binned.
  const NUDGE = VOXEL * 0.02;
  const mark = (x, y, z, g) => {
    const ix = Math.floor((x - origin[0]) / VOXEL), iy = Math.floor((y - origin[1]) / VOXEL), iz = Math.floor((z - origin[2]) / VOXEL);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    const i = idx(ix, iy, iz); if (!shell[i]) shell[i] = g + 1;
  };
  for (const t of body) {
    const name = meshes[t.mesh] || 'mesh';
    let g = groupIndex.get(name); if (g === undefined) { g = groups.length; groups.push(name); groupIndex.set(name, g); }
    // sample the triangle densely enough that no voxel it crosses is skipped (step = half a voxel along both barycentric axes)
    const e1 = Math.hypot(t.bx - t.ax, t.by - t.ay, t.bz - t.az), e2 = Math.hypot(t.cx - t.ax, t.cy - t.ay, t.cz - t.az), e3 = Math.hypot(t.cx - t.bx, t.cy - t.by, t.cz - t.bz);
    const n = Math.max(1, Math.ceil(Math.max(e1, e2, e3) / (VOXEL * 0.5)));
    // winding normal (outward for the closed bodies and the fill boxes); degenerate triangles get no nudge
    let nxv = (t.by - t.ay) * (t.cz - t.az) - (t.bz - t.az) * (t.cy - t.ay);
    let nyv = (t.bz - t.az) * (t.cx - t.ax) - (t.bx - t.ax) * (t.cz - t.az);
    let nzv = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
    const nl = Math.hypot(nxv, nyv, nzv);
    if (nl > 1e-12) { nxv *= NUDGE / nl; nyv *= NUDGE / nl; nzv *= NUDGE / nl; } else { nxv = nyv = nzv = 0; }
    // samples are also drawn a hair toward the centroid: a sample exactly on a triangle's edge that
    // lies on a lattice plane at the far side of a box (y1 + 1) would floor() into the voxel beyond it
    const EDGE = 1e-4;
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * (1 - EDGE) + EDGE / 3;
      for (let j = 0; j <= n - i; j++) {
        const v = (j / n) * (1 - EDGE) + EDGE / 3, w = 1 - u - v;
        mark(t.ax * w + t.bx * u + t.cx * v - nxv, t.ay * w + t.by * u + t.cy * v - nyv, t.az * w + t.bz * u + t.cz * v - nzv, g);
      }
    }
  }
  // coverTriangles: the body for deepInterior's exact cover-above test. Interior fill solids are never a roof: the
  // generator measures each round without them, so the watertight gate, which voxelises the shipped fills, must too.
  const coverTriangles = body.filter((t) => !/InteriorFill$/.test(meshes[t.mesh] || ''));
  return { shell, nx, ny, nz, origin, groups, bodyTris: body.length, voxel: VOXEL, coverTriangles };
}

/** Exterior flood fill (6-connected) from the grid border through empty voxels. */
export function floodExterior(grid) {
  const { shell, nx, ny, nz } = grid; const N = shell.length;
  const ext = new Uint8Array(N); const queue = new Int32Array(N); let head = 0, tail = 0;
  const push = (i) => { if (!shell[i] && !ext[i]) { ext[i] = 1; queue[tail++] = i; } };
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) push((z * ny + y) * nx + x);
  }
  while (head < tail) {
    const i = queue[head++]; const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
    if (x > 0) push(i - 1); if (x < nx - 1) push(i + 1);
    if (y > 0) push(i - nx); if (y < ny - 1) push(i + nx);
    if (z > 0) push(i - nx * ny); if (z < nz - 1) push(i + nx * ny);
  }
  return ext;
}

/** Body component of a shell group: hull-family, turret-family (gun mount/mantlet ride with the turret) or other. */
function componentOf(name) {
  if (/^turret|^gunMount|^mantlet|^gun\b|^gunDark/i.test(name)) return 2;
  if (/^hull/i.test(name)) return 1;
  return 0;
}

/**
 * Deep interior: a body shell exists in every axis direction from the voxel AND the voxel lies inside the
 * vertical shell span of one body component (hull or turret) at its own column AND real body geometry roofs its
 * whole footprint (coverAbove, below). The second test drops exterior pockets that distant shells enclose in every
 * direction — the slit under a turret bustle, the space between sponson and belly — which are outside both bodies:
 * water poured into a body never reaches them. The third drops open air that a thin rail or a plate's edge only
 * grazes in voxel space.
 */
export function deepInterior(grid) {
  const { shell, nx, ny, nz, groups } = grid; const N = shell.length;
  const comp = new Uint8Array(groups.length + 1); for (let g = 0; g < groups.length; g++) comp[g + 1] = componentOf(groups[g]);
  // per column (x,z) and component: lowest / highest shell voxel
  const minY = [null, new Int16Array(nx * nz).fill(32767), new Int16Array(nx * nz).fill(32767)];
  const maxY = [null, new Int16Array(nx * nz).fill(-1), new Int16Array(nx * nz).fill(-1)];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const g = shell[(z * ny + y) * nx + x]; if (!g) continue; const c = comp[g]; if (!c) continue;
    const k = z * nx + x; if (y < minY[c][k]) minY[c][k] = y; if (y > maxY[c][k]) maxY[c][k] = y;
  }
  const deep = new Uint8Array(N).fill(1); // cleared when any direction is open
  const scan = (count, stride, lineStarts) => {
    for (const start of lineStarts) {
      // forward: shell seen so far along the line
      let seen = 0;
      for (let k = 0, i = start; k < count; k++, i += stride) { if (shell[i]) seen = 1; else if (!seen) deep[i] = 0; }
      seen = 0;
      for (let k = count - 1, i = start + (count - 1) * stride; k >= 0; k--, i -= stride) { if (shell[i]) seen = 1; else if (!seen) deep[i] = 0; }
    }
  };
  const xs = [], ys = [], zs = [];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) xs.push((z * ny + y) * nx);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) ys.push(z * ny * nx + x);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) zs.push(y * nx + x);
  scan(nx, 1, xs); scan(ny, nx, ys); scan(nz, nx * ny, zs);
  const covered = grid.coverTriangles && (grid.coverRule ?? COVER_RULE) !== 'shell' ? coverAbove(grid, grid.coverRule ?? COVER_RULE) : null;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = (z * ny + y) * nx + x; if (shell[i]) { deep[i] = 0; continue; } if (!deep[i]) continue;
    const k = z * nx + x;
    const inHull = minY[1][k] < y && y < maxY[1][k], inTurret = minY[2][k] < y && y < maxY[2][k];
    if (!inHull && !inTurret) { deep[i] = 0; continue; }
    if (covered && !covered(x, y, z)) deep[i] = 0;
  }
  grid.spans = { comp, minY, maxY };
  return deep;
}

// Exact cover above (2026-10-08). The scan above takes ANY shell voxel overhead as a roof, so a 3 mm rail grazing a
// 2.5 cm column made the open air under it "deep" and the fill generator filled it: on the M3A3's front deck fills
// stood up to 19 cm above the glacis in the open. A deep voxel now needs real body geometry over its whole footprint.
// Rules (grid.coverRule, for experiments; the generator and the watertight gate both use COVER_RULE):
//   'slot'   every one of nine footprint samples (corners inset 0.5 mm, edge midpoints, centre) has a body triangle
//            above it, or sits in a slot that body geometry above closes from both sides within COVER_SLOT_M along x
//            or z: grille louvres, the ring between a hatch lid and its rim. A footprint only partly under a plate's
//            edge is not covered, so no fill reaches past the edge of the geometry that roofs it.
//   'all'    every sample has a body triangle above it (no slots).
//   'centre' the centre sample, or three of the centre and the four quadrant centres.
//   'shell'  the scan alone (the rule before 2026-10-08).
const COVER_RULE = 'slot';
const COVER_SLOT_M = 0.025;

function coverAbove(grid, rule) {
  const { nx, origin } = grid, V = grid.voxel ?? 0.025;
  const top = grid.coverTop ??= highestCrossing(grid); // cached: the generator re-measures the same body every round
  const h = V / 2 - 0.0005, q = V / 4;
  const offsets = rule === 'centre'
    ? [[0, 0], [-q, -q], [q, -q], [-q, q], [q, q]]
    : [[0, 0], [-h, -h], [0, -h], [h, -h], [-h, 0], [h, 0], [-h, h], [0, h], [h, h]];
  const reach = []; for (let d = q; d <= COVER_SLOT_M + 1e-9; d += q) reach.push(d);
  // per-column samples do not depend on height or on the fills placed so far: kept on the grid across rounds
  const cache = (grid.coverColumns ??= {})[rule] ??= new Map();
  const column = (x, z) => {
    const k = z * nx + x; let c = cache.get(k); if (c) return c;
    const px = origin[0] + (x + 0.5) * V, pz = origin[2] + (z + 0.5) * V;
    c = { px, pz, tops: offsets.map(([dx, dz]) => top(px + dx, pz + dz)), sides: [] };
    cache.set(k, c); return c;
  };
  // the highest cover within COVER_SLOT_M of a sample on each side: -x, +x, -z, +z
  const sides = (c, s) => {
    let r = c.sides[s]; if (r) return r;
    const sx = c.px + offsets[s][0], sz = c.pz + offsets[s][1];
    r = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (const d of reach) {
      r[0] = Math.max(r[0], top(sx - d, sz)); r[1] = Math.max(r[1], top(sx + d, sz));
      r[2] = Math.max(r[2], top(sx, sz - d)); r[3] = Math.max(r[3], top(sx, sz + d));
    }
    return (c.sides[s] = r);
  };
  return (x, y, z) => {
    const c = column(x, z), t = c.tops;
    if (rule === 'centre') {
      const yc = origin[1] + (y + 0.5) * V; if (t[0] > yc) return true;
      let n = 0; for (const v of t) if (v > yc) n++; return n >= 3;
    }
    // measured at the voxel's top face (less 1 mm, so a plate lying on that lattice plane still roofs it): a fill box
    // must lie wholly under the geometry that roofs or closes it
    const yt = origin[1] + (y + 1) * V - 0.001;
    for (let s = 0; s < t.length; s++) {
      if (t[s] > yt) continue;
      if (rule === 'all') return false;
      const r = sides(c, s);
      if (!((r[0] > yt && r[1] > yt) || (r[2] > yt && r[3] > yt))) return false;
    }
    return true;
  };
}

/** The highest body-triangle crossing of the vertical line at (px, pz), or -Infinity; triangles bucketed by xz cell. */
function highestCrossing(grid) {
  const { nx, nz, origin, coverTriangles: tris } = grid, V = grid.voxel ?? 0.025;
  const CELL = 4, cx = Math.ceil(nx / CELL), cz = Math.ceil(nz / CELL), buckets = Array.from({ length: cx * cz }, () => []);
  for (const t of tris) {
    const x0 = Math.floor((Math.min(t.ax, t.bx, t.cx) - origin[0]) / V / CELL), x1 = Math.floor((Math.max(t.ax, t.bx, t.cx) - origin[0]) / V / CELL);
    const z0 = Math.floor((Math.min(t.az, t.bz, t.cz) - origin[2]) / V / CELL), z1 = Math.floor((Math.max(t.az, t.bz, t.cz) - origin[2]) / V / CELL);
    for (let bz = Math.max(0, z0); bz <= Math.min(cz - 1, z1); bz++) for (let bx = Math.max(0, x0); bx <= Math.min(cx - 1, x1); bx++) buckets[bz * cx + bx].push(t);
  }
  return (px, pz) => {
    const bx = Math.floor((px - origin[0]) / V / CELL), bz = Math.floor((pz - origin[2]) / V / CELL);
    if (bx < 0 || bz < 0 || bx >= cx || bz >= cz) return -Infinity;
    let best = -Infinity;
    for (const t of buckets[bz * cx + bx]) {
      // barycentric of (px, pz) in the triangle's xz projection; edges count as inside
      const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz); if (Math.abs(d) < 1e-14) continue;
      const a = ((t.bz - t.cz) * (px - t.cx) + (t.cx - t.bx) * (pz - t.cz)) / d;
      const b = ((t.cz - t.az) * (px - t.cx) + (t.ax - t.cx) * (pz - t.cz)) / d, c = 1 - a - b;
      if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
      const y = a * t.ay + b * t.by + c * t.cy; if (y > best) best = y;
    }
    return best;
  };
}

