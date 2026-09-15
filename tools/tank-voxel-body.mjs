// Shared voxel body core for the tank watertight tools (tank-watertight-check.mjs, gen-interior-fills.mjs):
// conservative triangle voxelisation of the body (running gear, decals, shadow proxies, wires and soft goods
// excluded), exterior flood fill, and the "deep interior" test (shell in all six axis directions AND inside the
// hull's or turret's own vertical shell span at that column).
export const DEFAULT_EXCLUDE = /^(gear|track|procShadow|vehicleMarking|utility|antenna|aerial|wire|cable|cloth|canvas|tarp|net|ghillie|mesh)|wheel|hub|sprocket|idler|roller|shoe|EndWheel|Skirt|skirt|Fender|fender|Mudguard|mudguard|ExternalArmor/;

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
  return { shell, nx, ny, nz, origin, groups, bodyTris: body.length, voxel: VOXEL };
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
 * vertical shell span of one body component (hull or turret) at its own column. The second test drops exterior
 * pockets that distant shells enclose in every direction — the slit under a turret bustle, the space between
 * sponson and belly — which are outside both bodies: water poured into a body never reaches them.
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
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = (z * ny + y) * nx + x; if (shell[i]) { deep[i] = 0; continue; } if (!deep[i]) continue;
    const k = z * nx + x;
    const inHull = minY[1][k] < y && y < maxY[1][k], inTurret = minY[2][k] < y && y < maxY[2][k];
    if (!inHull && !inTurret) deep[i] = 0;
  }
  grid.spans = { comp, minY, maxY };
  return deep;
}

