// Roofs without walls (261; the owner on the Leclerc S1, S2 and SXXI: "basically they create "roofs" that imply solid
// areas but have no side plating or anything under and it jus tlooks goofy"). A panel that reads as the top or the
// underside of a solid block, with open air under it and nothing closing its sides, shows as a see-through pocket from
// the side. This finds those pockets in one rigid owner's triangles (the turret with its gun at rest, or the hull without
// its running gear), in that owner's frame. First-party tooling: Kevin B. Liu (NOTICE.md).
//
// - The owner is voxelized (VOXEL_M cells) by vertical winding: up each column, a face whose normal points down enters
//   a solid and one whose normal points up leaves it, so overlapping closed parts union cleanly; an entry never closed
//   counts as a plate one cell thick.
// - A pocket cell is air within ROOF_REACH_M under a ROOF in its own column (a solid's underside, sloped or flat), with
//   walls on both sides along x or along z within SLOT_M: a slot or hole in the body, not the open air under a bustle,
//   which runs out to one side. On the hull a FLOOR within FLOOR_GAP_M is needed too: a fender over open ground (its
//   track left out) is no pocket.
// - Only the armour body's own undersides roof a pocket (the owner's mesh, the armour paint): a stowage rack, a basket or
//   a launcher's tube bank is equipment, open by design, though it still walls and hides.
// - The roof must be a panel, not a bar: the columns MIN_PANEL_M away along one axis and half that along the other carry a
//   roof in the same band (a rail, a handle or a lifting eye is no roof; a 13 cm slot under a step is). Air within BASE_M
//   of the owner's lowest point is its seat (the turret on its ring), never a pocket.
// - Only pockets a camera sees count: the outside air reaches them (a flood fill from the frame's border through air) and a
//   straight sight line leaves through air in a typical camera direction; each connected pocket reports its plan area,
//   volume, its mouth cells on the outside air and its depth from that mouth.
import * as THREE from 'three';
import { meshTriangles, meshesUnder } from '../src/vehicles/gunHullClearance.test-support.mjs';

export const VOXEL_M = 0.02;
const MIN_GAP_M = 0.03, ROOF_REACH_M = 0.60, FLOOR_GAP_M = 0.30, SLOT_M = 0.50, MIN_PANEL_M = 0.08, BASE_M = 0.08;
/** A pocket is reported at this plan area and depth from its mouth. */
export const POCKET_MIN_AREA_M2 = 0.004, POCKET_MIN_DEPTH_M = 0.04;
const RUNNING_GEAR = /track|wheel|sprocket|idler|roller|bogie|suspension|gear|tread|link/i;
const GLASS = /Glass$/;
/** Per owner: the turret's false roofs need no floor (a slot can run to its base), and the air within 12 cm over its ring
 * plane is its seat on the hull; the hull's need a floor. */
export const OWNER_RULES = Object.freeze({ turret: { floored: false, minY: 0.12 }, hull: { floored: true } });
/** A raised turret roof stands this far over the turret's frame (its ring plane); the Leclerc's lowest false roof was 0.44. */
export const RAISED_ROOF_Y = 0.25;
/** The shrink-only ledger's classes (tools/roof-pocket-census.mjs --ledger): turret raised roofs (the Leclerc class), turret
 * base overhangs (bustle and ring undersides, measured without the hull) and the hull. */
export const POCKET_CLASSES = Object.freeze(['turretRaisedCm2', 'turretBaseCm2', 'hullCm2']);

/** One tank's pocket plan area per class (cm2) from its census pockets ({ owner, areaM2, roof }). */
export function pocketClasses(found) {
  const sum = (keep) => Math.round(found.filter(keep).reduce((t, p) => t + p.areaM2 * 1e4, 0));
  return {
    turretRaisedCm2: sum((p) => p.owner === 'turret' && p.roof[0] >= RAISED_ROOF_Y),
    turretBaseCm2: sum((p) => p.owner === 'turret' && p.roof[0] < RAISED_ROOF_Y),
    hullCm2: sum((p) => p.owner === 'hull'),
  };
}

/** The two rigid owners' triangle soups in their own frames, { tri, body }: the turret (gun at rest) and the hull without
 * its running gear, the armour body's own mesh (named for its owner: the armour-paint bucket) first, `body` triangles. */
export function ownerSoups(tank) {
  tank.root.updateMatrixWorld(true);
  const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
  const soup = (owner, meshes, frame) => {
    const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), body = meshes.filter((m) => m.name === owner);
    const a = meshTriangles(body, inv).tri, b = meshTriangles(meshes.filter((m) => m.name !== owner), inv).tri;
    const tri = new Float64Array(a.length + b.length); tri.set(a); tri.set(b, a.length);
    // the owner's glass (sight and vision panes, `*Glass` meshes): a recess with glass in it is a window, not a false roof
    const glass = meshTriangles(meshes.filter((m) => GLASS.test(m.name)), inv).tri;
    return { tri, body: a.length / 9, glass };
  };
  const out = {};
  if (turret) out.turret = soup('turret', meshesUnder(turret), turret);
  if (hull) {
    out.hull = soup('hull', meshesUnder(hull, turret ? [turret] : []).filter((m) => {
      for (let p = m; p && p !== hull; p = p.parent) if (RUNNING_GEAR.test(p.name || '')) return false;
      return true;
    }), hull);
  }
  return out;
}

/** The exposed pockets in one soup (Float64Array, 9 per triangle), largest plan area first. */
export function roofPockets(tri, { voxel = VOXEL_M, all = false, floored = false, body = Infinity, minY = -Infinity, cells: withCells = false, glass = null } = {}) {
  const n = tri.length / 9;
  if (!n) return [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], tri[i + k]); hi[k] = Math.max(hi[k], tri[i + k]); }
  for (let k = 0; k < 3; k++) { lo[k] -= 3 * voxel; hi[k] += 3 * voxel; }
  const NX = Math.ceil((hi[0] - lo[0]) / voxel), NY = Math.ceil((hi[1] - lo[1]) / voxel), NZ = Math.ceil((hi[2] - lo[2]) / voxel);
  if (NX * NY * NZ > 4e7) throw new RangeError(`roof-pocket grid of ${NX}x${NY}x${NZ}`);
  const cx = (i) => lo[0] + (i + 0.5) * voxel, cz = (k) => lo[2] + (k + 0.5) * voxel;
  // triangles binned by plan box into columns
  const start = new Int32Array(NX * NZ + 1), boxes = new Int32Array(n * 4);
  const visit = (t, fn) => {
    const o = t * 9;
    const x0 = Math.min(tri[o], tri[o + 3], tri[o + 6]), x1 = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const z0 = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), z1 = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    const i0 = Math.max(0, Math.ceil((x0 - lo[0]) / voxel - 0.5)), i1 = Math.min(NX - 1, Math.floor((x1 - lo[0]) / voxel - 0.5));
    const k0 = Math.max(0, Math.ceil((z0 - lo[2]) / voxel - 0.5)), k1 = Math.min(NZ - 1, Math.floor((z1 - lo[2]) / voxel - 0.5));
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) fn(i * NZ + k);
  };
  for (let t = 0; t < n; t++) visit(t, (c) => start[c + 1]++);
  for (let c = 0; c < NX * NZ; c++) start[c + 1] += start[c];
  const fill = start.slice(0, NX * NZ), list = new Int32Array(start[NX * NZ]);
  for (let t = 0; t < n; t++) visit(t, (c) => { list[fill[c]++] = t; });
  void boxes;
  // per column: crossings -> solid intervals -> voxel occupancy, and each cell's roof / floor
  const solid = new Uint8Array(NX * NY * NZ), roofY = new Float32Array(NX * NY * NZ).fill(NaN);
  const idx = (i, j, k) => (i * NY + j) * NZ + k;
  const ys = [], dirs = [], ofBody = [];
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
    const c = i * NZ + k, px = cx(i), pz = cz(k);
    ys.length = 0; dirs.length = 0; ofBody.length = 0;
    for (let e = start[c]; e < start[c + 1]; e++) {
      const o = list[e] * 9;
      const ax = tri[o], ay = tri[o + 1], az = tri[o + 2], bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5], qx = tri[o + 6], qy = tri[o + 7], qz = tri[o + 8];
      const ux = bx - ax, uz = bz - az, vx = qx - ax, vz = qz - az, den = ux * vz - uz * vx;
      if (Math.abs(den) < 1e-12) continue;                                     // vertical face: never crossed by a column
      const wx = px - ax, wz = pz - az, s = (wx * vz - wz * vx) / den, r = (ux * wz - uz * wx) / den;
      if (s < 0 || r < 0 || s + r > 1) continue;
      ys.push(ay + s * (by - ay) + r * (qy - ay));
      // normal y = (b-a) x (c-a) . y = uz*vx - ux*vz = -den: a face facing down (normal y < 0) enters the solid going up
      dirs.push(-den < 0 ? 1 : -1);
      ofBody.push(list[e] < body);
    }
    if (!ys.length) continue;
    const order = ys.map((_, e) => e).sort((a, b) => ys[a] - ys[b] || dirs[b] - dirs[a]);
    const bodyUnderside = (y) => ys.some((v, e) => ofBody[e] && dirs[e] > 0 && Math.abs(v - y) < 0.002);
    const intervals = [];
    let w = 0, open = null;
    for (const e of order) {
      const before = w;
      w = Math.max(0, w + dirs[e]);
      if (before === 0 && w > 0) open = ys[e];
      else if (before > 0 && w === 0) { intervals.push([open, ys[e], bodyUnderside(open)]); open = null; }
    }
    if (open !== null) intervals.push([open, open + voxel, bodyUnderside(open)]);                    // an entry never closed: a plate one cell thick
    for (const [y0, y1] of intervals) {
      const j0 = Math.max(0, Math.floor((y0 - lo[1]) / voxel)), j1 = Math.min(NY - 1, Math.floor((y1 - lo[1]) / voxel));
      for (let j = j0; j <= j1; j++) solid[idx(i, j, k)] = 1;
    }
    // the air under each solid's underside, down to the solid below (or ROOF_REACH_M) is roofed by that underside; with
    // `floored` only between two solids FLOOR_GAP_M apart or less (the hull: a fender over open ground is no pocket)
    for (let m = floored ? 1 : 0; m < intervals.length; m++) {
      if (!intervals[m][2]) continue;                                       // only the armour body's own undersides roof a pocket
      const roof = intervals[m][0], below = m ? intervals[m - 1][1] : -Infinity;
      if (floored && roof - below > FLOOR_GAP_M) continue;
      const floor = Math.max(below, roof - ROOF_REACH_M);
      if (roof - floor < MIN_GAP_M) continue;
      const j0 = Math.max(0, Math.floor((floor - lo[1]) / voxel) + 1), j1 = Math.floor((roof - lo[1]) / voxel) - 1;
      for (let j = j0; j <= j1; j++) roofY[idx(i, j, k)] = roof;
    }
  }
  // a roof is a panel: the columns MIN_PANEL_M away in x and in z (either side) roof the same cell's band; and the air
  // under it is a slot in the body: walls on both sides along x, or along z, within SLOT_M (under a bustle or a fender
  // the air runs out to one side)
  const reach = Math.max(1, Math.round(MIN_PANEL_M / voxel)), narrow = Math.max(1, Math.round(reach / 2)), wallReach = Math.round(SLOT_M / voxel);
  // the air within BASE_M over the owner's lowest point is its seat (the turret on its ring, the hull's belly)
  const baseCells = Math.ceil((3 * voxel + BASE_M) / voxel);
  const wall = (i, j, k, di, dk) => {
    for (let s = 1; s <= wallReach; s++) {
      const ii = i + di * s, kk = k + dk * s;
      if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) return false;
      if (solid[idx(ii, j, kk)]) return true;
    }
    return false;
  };
  const pocket = new Uint8Array(NX * NY * NZ);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
    const p = idx(i, j, k), r = roofY[p];
    if (Number.isNaN(r) || solid[p]) continue;
    const roofed = (ii, kk) => ii >= 0 && kk >= 0 && ii < NX && kk < NZ && Math.abs(roofY[idx(ii, j, kk)] - r) < 0.06;
    const along = (r1, di, dk) => roofed(i - di * r1, k - dk * r1) || roofed(i + di * r1, k + dk * r1);
    if (!((along(reach, 1, 0) && along(narrow, 0, 1)) || (along(reach, 0, 1) && along(narrow, 1, 0)))) continue;
    if (j < baseCells || lo[1] + (j + 0.5) * voxel < minY) continue;
    if ((wall(i, j, k, 1, 0) && wall(i, j, k, -1, 0)) || (wall(i, j, k, 0, 1) && wall(i, j, k, 0, -1))) pocket[p] = 1;
  }
  // the outside air: a flood fill through air from the frame's border
  const outside = new Uint8Array(NX * NY * NZ), queue = new Int32Array(NX * NY * NZ);
  let head = 0, tail = 0;
  const seed = (p) => { if (!solid[p] && !outside[p]) { outside[p] = 1; queue[tail++] = p; } };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) { seed(idx(i, j, 0)); seed(idx(i, j, NZ - 1)); }
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) { seed(idx(i, 0, k)); seed(idx(i, NY - 1, k)); }
  for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) { seed(idx(0, j, k)); seed(idx(NX - 1, j, k)); }
  const steps = [NY * NZ, -NY * NZ, NZ, -NZ, 1, -1];
  while (head < tail) {
    const p = queue[head++], i = Math.floor(p / (NY * NZ)), j = Math.floor(p / NZ) % NY, k = p % NZ;
    for (let s = 0; s < 6; s++) {
      if ((s === 0 && i === NX - 1) || (s === 1 && i === 0) || (s === 2 && j === NY - 1) || (s === 3 && j === 0) || (s === 4 && k === NZ - 1) || (s === 5 && k === 0)) continue;
      seed(p + steps[s]);
    }
  }
  // seen: a straight sight line from the cell leaves the frame through air in one of the typical camera directions (16
  // bearings at -15, 0, +15 and +30 deg), never down through the owner's seat (the hull under a turret, the ground
  // under a hull): a pocket the outside reaches only through a crack or from below is not one anyone sees
  const sights = [];
  for (let a = 0; a < 16; a++) for (const e of [-15, 0, 15, 30]) {
    const az = a * Math.PI / 8, el = e * Math.PI / 180;
    sights.push([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
  }
  const seen = new Uint8Array(NX * NY * NZ), stepM = voxel * 0.5;
  const clearAlong = (p, [dx, dy, dz]) => {
    const i0 = Math.floor(p / (NY * NZ)), j0 = Math.floor(p / NZ) % NY, k0 = p % NZ;
    const x0 = cx(i0), y0 = lo[1] + (j0 + 0.5) * voxel, z0 = cz(k0);
    for (let t = stepM; ; t += stepM) {
      const i = Math.floor((x0 + dx * t - lo[0]) / voxel), j = Math.floor((y0 + dy * t - lo[1]) / voxel), k = Math.floor((z0 + dz * t - lo[2]) / voxel);
      if (j < baseCells) return false;                                          // down through the seat: the hull hides it
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return true;
      if (solid[idx(i, j, k)]) return false;
    }
  };
  for (let p = 0; p < pocket.length; p++) {
    if (!pocket[p] || !outside[p]) continue;
    for (const dir of sights) if (clearAlong(p, dir)) { seen[p] = 1; break; }
  }
  // glass within two cells of a pocket's air makes it a window (a sight's or vision block's recess, glazed at its back)
  const glassCell = new Set();
  if (glass) for (let o = 0; o < glass.length; o += 9) {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
      const x = glass[o] + u * (glass[o + 3] - glass[o]) + v * (glass[o + 6] - glass[o]);
      const y = glass[o + 1] + u * (glass[o + 4] - glass[o + 1]) + v * (glass[o + 7] - glass[o + 1]);
      const z = glass[o + 2] + u * (glass[o + 5] - glass[o + 2]) + v * (glass[o + 8] - glass[o + 2]);
      const i = Math.floor((x - lo[0]) / voxel), j = Math.floor((y - lo[1]) / voxel), k = Math.floor((z - lo[2]) / voxel);
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) for (let dk = -2; dk <= 2; dk++) {
        const ii = i + di, jj = j + dj, kk = k + dk;
        if (ii >= 0 && jj >= 0 && kk >= 0 && ii < NX && jj < NY && kk < NZ) glassCell.add(idx(ii, jj, kk));
      }
    }
  }
  // connected seen pockets: plan area, volume, mouth (faces onto outside non-pocket air) and depth from the mouth
  const comp = new Int32Array(NX * NY * NZ).fill(-1), pockets = [];
  for (let p0 = 0; p0 < pocket.length; p0++) {
    if (!pocket[p0] || !seen[p0] || comp[p0] >= 0) continue;
    const id = pockets.length, cells = [p0];
    comp[p0] = id;
    for (let h = 0; h < cells.length; h++) {
      const p = cells[h], i = Math.floor(p / (NY * NZ)), j = Math.floor(p / NZ) % NY, k = p % NZ;
      for (let s = 0; s < 6; s++) {
        if ((s === 0 && i === NX - 1) || (s === 1 && i === 0) || (s === 2 && j === NY - 1) || (s === 3 && j === 0) || (s === 4 && k === NZ - 1) || (s === 5 && k === 0)) continue;
        const q = p + steps[s];
        if (pocket[q] && seen[q] && comp[q] < 0) { comp[q] = id; cells.push(q); }
      }
    }
    // depth: breadth-first from the mouth cells inward through the pocket
    const dist = new Map(), frontier = [];
    for (const p of cells) {
      const i = Math.floor(p / (NY * NZ)), j = Math.floor(p / NZ) % NY, k = p % NZ;
      let mouth = false;
      for (let s = 0; s < 6 && !mouth; s++) {
        if ((s === 0 && i === NX - 1) || (s === 1 && i === 0) || (s === 2 && j === NY - 1) || (s === 3 && j === 0) || (s === 4 && k === NZ - 1) || (s === 5 && k === 0)) continue;
        const q = p + steps[s];
        if (s < 2 || s > 3) mouth = outside[q] && !pocket[q];                    // sideways only: a pocket opens to the side
      }
      if (mouth) { dist.set(p, 0); frontier.push(p); }
    }
    for (let h = 0; h < frontier.length; h++) {
      const p = frontier[h], d = dist.get(p);
      for (const s of steps) { const q = p + s; if (comp[q] === id && !dist.has(q)) { dist.set(q, d + 1); frontier.push(q); } }
    }
    const columns = new Set(), box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let depth = 0, roofLo = Infinity, roofHi = -Infinity;
    for (const p of cells) {
      const i = Math.floor(p / (NY * NZ)), j = Math.floor(p / NZ) % NY, k = p % NZ;
      columns.add(i * NZ + k);
      const x = cx(i), y = lo[1] + (j + 0.5) * voxel, z = cz(k);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.min(box[2], z);
      box[3] = Math.max(box[3], x); box[4] = Math.max(box[4], y); box[5] = Math.max(box[5], z);
      depth = Math.max(depth, dist.get(p) ?? 0);
      roofLo = Math.min(roofLo, roofY[p]); roofHi = Math.max(roofHi, roofY[p]);
    }
    // its census camera: the typical direction that sees the most of it (a sample of up to 400 cells), toward the camera
    const sample = cells.filter((_, h) => h % Math.ceil(cells.length / 400) === 0);
    let sight = sights[0], seenFrac = -1;
    for (const dir of sights) {
      const f = sample.reduce((t, p) => t + (clearAlong(p, dir) ? 1 : 0), 0) / sample.length;
      if (f > seenFrac + 1e-9) { sight = dir; seenFrac = f; }
    }
    pockets.push({
      areaM2: columns.size * voxel * voxel, volumeL: cells.length * voxel ** 3 * 1000, mouthCells: frontier.length ? [...dist.values()].filter((d) => d === 0).length : 0,
      depthM: depth * voxel, box: box.map((v) => +v.toFixed(3)), roof: [+roofLo.toFixed(3), +roofHi.toFixed(3)],
      sight: sight.map((v) => +v.toFixed(4)), seenFrac: +seenFrac.toFixed(3), glazed: cells.some((p) => glassCell.has(p)),
      // with `cells`, the pocket's air cell centres (x, y, z flat, at most 30000 cells, evenly thinned), for probes
      ...(withCells ? { cells: cells.filter((_, h) => h % Math.ceil(cells.length / 30000) === 0).flatMap((p) => {
        const i = Math.floor(p / (NY * NZ)), j = Math.floor(p / NZ) % NY, k = p % NZ;
        return [+cx(i).toFixed(3), +(lo[1] + (j + 0.5) * voxel).toFixed(3), +cz(k).toFixed(3)];
      }) } : {}),
    });
  }
  return pockets.filter((p) => all || (p.areaM2 >= POCKET_MIN_AREA_M2 && p.depthM >= POCKET_MIN_DEPTH_M))
    .sort((a, b) => b.areaM2 - a.areaM2);
}
