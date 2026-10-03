// One watertight measurement, shared by tools/tank-watertight-check.mjs and the fleet gate
// (src/vehicles/watertightAudit.test-support.mjs) so the CLI and npm test can never measure differently.
//
// The body is what the tank's interior fill generation bounds (2026-10-02): tools/gen-interior-fills.mjs fills
// the primary-body and launcher hulls of tools/interior-fill-body-policy.mjs against their authored boundary only,
// leaving the air of external optics, cages, cargo and launchers open on purpose, and keeps the Barak's measured
// rear bay as air (tools/barak-rear-bay-fill-policy.mjs). Measuring those hulls against every body mesh read that
// deliberate air as leaks (t72b3m 145.6 L, merkava4_trophy 276.6 L) and hid real drift among them. The check now
// voxelises the same boundary the generator filled plus the shipped fill solids, and reports retained air apart,
// as it reports track-lane air; tank-watertight-check --full-body restores the all-mesh measurement.
import { voxelise, floodExterior, deepInterior, DEFAULT_EXCLUDE } from './tank-voxel-body.mjs';
import { trackLaneVoxelMask } from './track-lane-boxes.mjs';
import { interiorFillBoundaryTriangles } from './interior-fill-body-policy.mjs';
import { barakBayIntersectsCell } from './barak-rear-bay-fill-policy.mjs';

export const WATERTIGHT_VOXEL = 0.025;
export const WATERTIGHT_MAX_LEAK_L = 0.05;

/** The generator's authored fill boundary for this tank plus every shipped `<component>InteriorFill` solid. */
export function watertightBody(id, tris, meshes) {
  const fill = (t) => /InteriorFill$/.test(meshes[t.mesh] || '');
  const authored = tris.filter((t) => !fill(t));
  const boundary = interiorFillBoundaryTriangles(id, authored, meshes);
  if (boundary === authored) return tris;
  const kept = new Set(boundary);
  return tris.filter((t) => fill(t) || kept.has(t));
}

/** Voxel predicate for the air the generator deliberately keeps (only the Barak's rear bay), or null. */
export function retainedSourceAir(id) {
  if (id !== 'merkava4_barak') return null;
  return ({ nx, ny, origin, voxel }) => (i) => {
    const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
    const min = [origin[0] + x * voxel, origin[1] + y * voxel, origin[2] + z * voxel];
    return barakBayIntersectsCell(min, min.map((v) => v + voxel));
  };
}

/** 26-connected clusters of leak voxels with centroid, extent, mouth and surrounding shell groups. Deep-interior
 * water inside a track lane box (lane mask, may be null) is tallied as lane volume and never becomes a leak voxel;
 * deep-interior water in air the fill generator deliberately retains (`retains(i)`, may be null) is tallied apart too. */
function clusterLeaks(grid, ext, deep, lane, retains, VOXEL) {
  const { shell, nx, ny, nz, origin, groups } = grid; const N = shell.length;
  const leak = new Uint8Array(N); let leakCount = 0, laneCount = 0, retainedCount = 0;
  for (let i = 0; i < N; i++) {
    if (!(ext[i] && deep[i])) continue;
    if (lane && lane[i]) { laneCount++; continue; }
    if (retains && retains(i)) { retainedCount++; continue; }
    leak[i] = 1; leakCount++;
  }
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
  return { leakCount, laneCount, retainedCount, clusters, enclosedL: +(enclosed * VOXEL ** 3 * 1000).toFixed(1), deepL: +(deepTotal * VOXEL ** 3 * 1000).toFixed(1) };
}

/** Voxelise body triangles, flood the exterior and split the deep-interior water into leak, track-lane and
 * retained-air volume. */
export function measureWatertight(tris, meshes, laneBoxes, { voxel = WATERTIGHT_VOXEL, exclude = DEFAULT_EXCLUDE,
  maxLeakL = WATERTIGHT_MAX_LEAK_L, retainedAir = null } = {}) {
  const grid = voxelise(tris, meshes, { voxel, exclude });
  const ext = floodExterior(grid);
  const deep = deepInterior(grid);
  const lane = laneBoxes.length ? trackLaneVoxelMask(laneBoxes, grid) : null;
  const retains = retainedAir ? retainedAir({ ...grid, voxel }) : null;
  const { leakCount, laneCount, retainedCount, clusters, enclosedL, deepL } = clusterLeaks(grid, ext, deep, lane, retains, voxel);
  const litres = (n) => +(n * voxel ** 3 * 1000).toFixed(2);
  return { grid, clusters, enclosedL, deepL, leakL: litres(leakCount), trackLaneL: litres(laneCount),
    retainedL: litres(retainedCount), laneBoxes: laneBoxes.length, watertight: litres(leakCount) <= maxLeakL };
}
