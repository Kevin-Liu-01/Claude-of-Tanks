#!/usr/bin/env node
// Watertight check for tank bodies: "pour water into the turret or hull and it must not spill out".
//
//   node tools/tank-watertight-check.mjs --ids=abramsx,leclerc [--voxel=0.025] [--exclude=<regex>] [--json=path] [--gate] [--verbose]
//
// The built tank's body triangles (running gear, decals, shadow proxies, wires and soft goods excluded) are
// voxelised conservatively; the exterior is flood-filled from the grid border; a voxel counts as DEEP INTERIOR
// when a body shell lies in all six axis directions from it (so open nooks — the turret-ring slit, deck recesses,
// the space under the belly or between skirt and hull — never qualify). Any deep-interior voxel the exterior
// flood reaches is a LEAK: the body has a gap there that water would pour through. Leaks are clustered and
// reported with their position (tank frame), volume, the shell groups around them, and the mouth (where the
// water exits). --gate exits 1 when any listed tank leaks more than --max-leak-l litres (default 0.05).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectTriangles } from './tank-surface-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const VOXEL = Number(opt('voxel', '0.025'));
const MAX_LEAK_L = Number(opt('max-leak-l', '0.05'));
// Running gear, decals, shadow proxies, wires and soft goods are not body: the owner's rule is "hull and turret,
// not tracks or fenders". Wheel/hub/sprocket names cover the source-fitted road wheels that are not in 'gear' buckets.
const EXCLUDE = new RegExp(opt('exclude', '^(gear|track|procShadow|vehicleMarking|utility|antenna|aerial|wire|cable|cloth|canvas|tarp|net|ghillie|mesh)|wheel|hub|sprocket|idler|roller|shoe|EndWheel|Skirt|skirt|Fender|fender|Mudguard|mudguard|ExternalArmor'), 'i');
const verbose = flag('verbose');
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const ids = opt('ids', 'abramsx').split(',').filter(Boolean);

/** Conservative voxelisation: every voxel a triangle passes through becomes shell (owner = first writer). */
function voxelise(tris, meshes) {
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
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      for (let j = 0; j <= n - i; j++) {
        const v = j / n, w = 1 - u - v;
        mark(t.ax * w + t.bx * u + t.cx * v, t.ay * w + t.by * u + t.cy * v, t.az * w + t.bz * u + t.cz * v, g);
      }
    }
  }
  return { shell, nx, ny, nz, origin, groups, bodyTris: body.length };
}

/** Exterior flood fill (6-connected) from the grid border through empty voxels. */
function floodExterior(grid) {
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
function deepInterior(grid) {
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
  return deep;
}

/** 26-connected clusters of leak voxels with centroid, extent, mouth and surrounding shell groups. */
function clusterLeaks(grid, ext, deep) {
  const { shell, nx, ny, nz, origin, groups } = grid; const N = shell.length;
  const leak = new Uint8Array(N); let leakCount = 0;
  for (let i = 0; i < N; i++) if (ext[i] && deep[i]) { leak[i] = 1; leakCount++; }
  const seen = new Uint8Array(N); const queue = new Int32Array(Math.max(1, leakCount)); const clusters = [];
  const world = (i) => { const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0; return [origin[0] + (x + 0.5) * VOXEL, origin[1] + (y + 0.5) * VOXEL, origin[2] + (z + 0.5) * VOXEL]; };
  for (let s = 0; s < N; s++) {
    if (!leak[s] || seen[s]) continue;
    let head = 0, tail = 0; queue[tail++] = s; seen[s] = 1;
    let sum = [0, 0, 0], n = 0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const tally = new Map(); let mouth = [0, 0, 0], mouthN = 0, mouthIdx = -1; const mouthVoxels = [];
    while (head < tail) {
      const i = queue[head++]; const p = world(i); n++;
      for (let a = 0; a < 3; a++) { sum[a] += p[a]; if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
      const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
      let touchesOpen = false;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const X = x + dx, Y = y + dy, Z = z + dz; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const j = (Z * ny + Y) * nx + X;
        if (shell[j]) { const g = groups[shell[j] - 1]; tally.set(g, (tally.get(g) || 0) + 1); continue; }
        if (leak[j]) { if (!seen[j]) { seen[j] = 1; queue[tail++] = j; } }
        else if (ext[j]) touchesOpen = true; // exterior voxel that is not deep: the water exits here
      }
      if (touchesOpen) { mouth[0] += p[0]; mouth[1] += p[1]; mouth[2] += p[2]; mouthN++; if (mouthIdx < 0) mouthIdx = i; mouthVoxels.push(i); }
    }
    // which axis directions are open (no body shell) from an exterior voxel next to the mouth: the water's way out
    let openDirs = [];
    if (mouthIdx >= 0) {
      const x = mouthIdx % nx, y = ((mouthIdx / nx) | 0) % ny, z = (mouthIdx / (nx * ny)) | 0;
      const probe = (dx, dy, dz, label) => { let X = x + dx, Y = y + dy, Z = z + dz; while (X >= 0 && Y >= 0 && Z >= 0 && X < nx && Y < ny && Z < nz) { if (shell[(Z * ny + Y) * nx + X]) return; X += dx; Y += dy; Z += dz; } openDirs.push(label); };
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue; const X = x + dx, Y = y + dy, Z = z + dz; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const j = (Z * ny + Y) * nx + X; if (ext[j] && !deep[j] && !shell[j]) { // an exterior non-deep neighbour: test its six axis rays
          const px = X, py = Y, pz = Z; const ray = (ddx, ddy, ddz, label) => { let a = px + ddx, b = py + ddy, c = pz + ddz; while (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz) { if (shell[(c * ny + b) * nx + a]) return; a += ddx; b += ddy; c += ddz; } if (!openDirs.includes(label)) openDirs.push(label); };
          ray(1, 0, 0, '+x'); ray(-1, 0, 0, '-x'); ray(0, 1, 0, '+y'); ray(0, -1, 0, '-y'); ray(0, 0, 1, '+z'); ray(0, 0, -1, '-z');
          dz = dy = dx = 2; // one neighbour is enough
        }
      }
      void probe;
    }
    const exitsAt = (i) => {
      const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0; const dirs = [];
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue; const X = x + dx, Y = y + dy, Z = z + dz; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const j = (Z * ny + Y) * nx + X; if (!(ext[j] && !deep[j] && !shell[j])) continue;
        const ray = (ddx, ddy, ddz, label) => { let a = X + ddx, b = Y + ddy, c = Z + ddz; while (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz) { if (shell[(c * ny + b) * nx + a]) return; a += ddx; b += ddy; c += ddz; } if (!dirs.includes(label)) dirs.push(label); };
        ray(1, 0, 0, '+x'); ray(-1, 0, 0, '-x'); ray(0, 1, 0, '+y'); ray(0, -1, 0, '-y'); ray(0, 0, 1, '+z'); ray(0, 0, -1, '-z');
        return dirs;
      }
      return dirs;
    };
    const mouthSet = new Set(mouthVoxels); const mouthSeen = new Set(); const mouths = [];
    for (const start of mouthVoxels) {
      if (mouthSeen.has(start)) continue;
      const q = [start]; mouthSeen.add(start); let c = [0, 0, 0], m = 0, mlo = [Infinity, Infinity, Infinity], mhi = [-Infinity, -Infinity, -Infinity];
      while (q.length) {
        const i = q.pop(); const p = world(i); m++; for (let a = 0; a < 3; a++) { c[a] += p[a]; if (p[a] < mlo[a]) mlo[a] = p[a]; if (p[a] > mhi[a]) mhi[a] = p[a]; }
        const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy && !dz) continue; const X = x + dx, Y = y + dy, Z = z + dz; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
          const j = (Z * ny + Y) * nx + X; if (mouthSet.has(j) && !mouthSeen.has(j)) { mouthSeen.add(j); q.push(j); }
        }
      }
      mouths.push({ voxels: m, centre: c.map((v) => +(v / m).toFixed(2)), extent: mhi.map((v, a) => +(v - mlo[a] + VOXEL).toFixed(2)), exits: exitsAt(start).join('') || '?' });
    }
    mouths.sort((u, v) => v.voxels - u.voxels);
    clusters.push({ mouths: mouths.slice(0, 3), voxels: n, litres: +(n * VOXEL ** 3 * 1000).toFixed(2), centre: sum.map((v) => +(v / n).toFixed(2)), extent: hi.map((v, a) => +(v - lo[a] + VOXEL).toFixed(2)),
      mouth: mouthN ? mouth.map((v) => +(v / mouthN).toFixed(2)) : null, openDirs, groups: [...tally.entries()].sort((u, v) => v[1] - u[1]).slice(0, 4).map(([g, c]) => `${g}:${c}`) });
  }
  clusters.sort((u, v) => v.voxels - u.voxels);
  let enclosed = 0, deepTotal = 0; for (let i = 0; i < N; i++) { if (!shell[i] && !ext[i]) enclosed++; if (deep[i]) deepTotal++; }
  return { leakCount, clusters, enclosedL: +(enclosed * VOXEL ** 3 * 1000).toFixed(1), deepL: +(deepTotal * VOXEL ** 3 * 1000).toFixed(1) };
}

const report = []; let failures = 0;
for (const id of ids) {
  const started = performance.now();
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); failures++; continue; }
  const { tris, meshes } = collectTriangles(tank.root);
  const grid = voxelise(tris, meshes);
  const ext = floodExterior(grid);
  const deep = deepInterior(grid);
  const { leakCount, clusters, enclosedL, deepL } = clusterLeaks(grid, ext, deep);
  const leakL = +(leakCount * VOXEL ** 3 * 1000).toFixed(2);
  const watertight = leakL <= MAX_LEAK_L;
  if (!watertight) failures++;
  report.push({ id, watertight, leakL, enclosedL, deepL, bodyTris: grid.bodyTris, grid: [grid.nx, grid.ny, grid.nz], clusters: clusters.slice(0, 12) });
  console.log(`${id}: ${watertight ? 'WATERTIGHT' : 'LEAKING'} — ${leakL} L reaches the deep interior (${clusters.length} gap${clusters.length === 1 ? '' : 's'}); enclosed ${enclosedL} L of ${deepL} L deep interior; ${grid.bodyTris} body tris, grid ${grid.nx}x${grid.ny}x${grid.nz} @ ${VOXEL} m (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  for (const c of clusters.slice(0, verbose ? 40 : 8)) {
    console.log(`   gap ${c.litres} L at (${c.centre.join(', ')}) extent (${c.extent.join('x')}) near ${c.groups.join(' ')}`);
    for (const m of c.mouths) console.log(`      enters at (${m.centre.join(', ')}) extent (${m.extent.join('x')}) ${m.voxels} vox, open toward ${m.exits}`);
  }
  tank.dispose?.();
}
const jsonPath = opt('json', '');
if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), voxel: VOXEL, maxLeakL: MAX_LEAK_L, report }, null, 1)); }
if (flag('gate') && failures) { console.log(`watertight check: ${failures} tank(s) leak`); process.exit(1); }
