// gunFaceSplit.selftest.mjs — a forward turret face only partly over a mantlet or gun-notch plate reads, at each point,
// the plate it lies over (265; the balance lane's FAIRNESS-265 §3, Main's ruling: fleet-wide, release 266). A slice's
// convex cell lays one triangle across a cheek and the gun on 221 vehicles; its centre picked one plate for all of it, so
// the M1A2's cell 7 front (x -1.52..0.22, 53% of it in front of the mantlet, its centre 13 mm outside) read the 850 mm
// cheek where the SEPv2's identical plates read the 350 mm mantlet. combatAnatomy.ts now cuts such a plane's faces at
// the gun plates' windows (sim/gunFaceSplit.ts). This receipt holds the fleet to it:
// - every forward turret facet (sim/convexCellFacets.ts: the surface a round can meet on a cell's plane) that is partly
//   inside a window (x range; height +-0.1 m; 0.35 m of depth, as gunFacePlates.selftest.mjs) carries a split on each
//   of its faces, whose pieces tile it;
// - inside a window a point reads a gun plate (at a piece's centroid the nearest, as gunFacePlate a face centre), off
//   every window none, and the point read (gunFaceSplitPlate, the authority's) is its piece's plate;
// - through traceTank the M1A2 and the SEPv2 read the same plates across their gun face, the mantlet over the gun.
// Negative control: the M1A2 with its splits taken off is found by the census and reads its cheek over the gun again.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { convexCellFacets } from '../sim/convexCellFacets.ts';
import { gunFaceSplitPlate } from '../sim/gunFaceSplit.ts';

const GUN_FACE_PLATE = /mantlet|gun_notch/i;
const bounds = (points) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  return { min, max };
};
const windowOf = (plate) => {
  const { min, max } = bounds(plate.verts);
  return { plate, min, max, lo: [min[0], min[1] - 0.1, min[2] - 0.35], hi: [max[0], max[1] + 0.1, max[2] + 0.35] };
};
const inside = (p, w) => p[0] >= w.lo[0] && p[0] <= w.hi[0] && p[1] >= w.lo[1] && p[1] <= w.hi[1] && p[2] >= w.lo[2] && p[2] <= w.hi[2];
const gap = (p, w) => Math.hypot(...[0, 1, 2].map((k) => (p[k] < w.min[k] ? w.min[k] - p[k] : p[k] > w.max[k] ? p[k] - w.max[k] : 0)));
const area = (points) => {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0], b = points[i], c = points[i + 1];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    x += u[1] * v[2] - u[2] * v[1]; y += u[2] * v[0] - u[0] * v[2]; z += u[0] * v[1] - u[1] * v[0];
  }
  return Math.hypot(x, y, z) / 2;
};
const clipAxis = (points, axis, value, keepAbove) => {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const inA = keepAbove ? a[axis] >= value : a[axis] <= value, inB = keepAbove ? b[axis] >= value : b[axis] <= value;
    if (inA) out.push(a);
    if (inA !== inB) { const t = (value - a[axis]) / (b[axis] - a[axis]); out.push(a.map((c, k) => c + (b[k] - c) * t)); }
  }
  return out;
};
/** The share of a convex outline's area inside a window (its box clip). */
const shareInside = (outline, w) => {
  let part = outline;
  for (let axis = 0; axis < 3 && part.length >= 3; axis++) part = clipAxis(clipAxis(part, axis, w.lo[axis], true), axis, w.hi[axis], false);
  return part.length >= 3 ? area(part) / area(outline) : 0;
};
const centroidOf = (points) => [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length);

/** The census of one vehicle: forward facets partly inside a window without a split, and each split's misreads. */
function census(id) {
  const armor = getSpec(id).armor;
  const windows = (armor.turretPlates ?? []).filter((p) => (p.kind || 'main') === 'main' && GUN_FACE_PLATE.test(p.name) && p.verts?.length >= 3).map(windowOf);
  const gunPlates = new Set(windows.map((w) => w.plate));
  const unsplit = [], wrong = [];
  let splits = 0, pieces = 0;
  if (!windows.length) return { windows, unsplit, wrong, splits, pieces };
  for (const [index, cell] of (armor.collisionShells?.turret ?? []).entries()) {
    // the plane's facet is the surface a round can meet there (sim/convexCellFacets.ts); its first face is the one it is given
    const seen = new Map();
    for (const facet of convexCellFacets(cell).facets) {
      const face = facet.faces[0];
      if (face.normal[2] < 0.2 || facet.faces.every((member) => member.internal) || area(facet.points) < 1e-5) continue;
      const partly = windows.some((w) => { const share = shareInside(facet.points, w); return share > 0.001 && share < 0.999; });
      if (partly && !face.gunSplit) unsplit.push(`cell ${index} (${face.plate.name}, centre x ${face.center[0].toFixed(3)})`);
      if (face.gunSplit) {
        if (facet.faces.some((member) => member.gunSplit !== face.gunSplit)) wrong.push(`cell ${index}: the faces of one plane carry different splits`);
        seen.set(face.gunSplit, (seen.get(face.gunSplit) ?? 0) + area(facet.points));
      }
    }
    for (const [split, facetArea] of seen) {
      splits++;
      const pieceArea = split.pieces.reduce((sum, piece) => sum + area(piece.points), 0);
      if (Math.abs(pieceArea - facetArea) > Math.max(2e-4, facetArea * 0.005)) wrong.push(`cell ${index}: pieces ${pieceArea.toFixed(4)} m² of a ${facetArea.toFixed(4)} m² facet`);
      for (const piece of split.pieces) {
        pieces++;
        const centre = centroidOf(piece.points);
        const samples = [centre, ...piece.points.map((p) => p.map((c, k) => centre[k] + (c - centre[k]) * 0.6))];
        for (const p of samples) {
          const over = windows.filter((w) => inside(p, w));
          if (gunPlates.has(piece.plate) !== over.length > 0) wrong.push(`cell ${index}: ${piece.plate.name} at (${p.map((n) => n.toFixed(3)).join(', ')}) ${over.length ? 'inside' : 'off'} the gun windows`);
          const read = gunFaceSplitPlate(split, p[0], p[1], p[2]);
          if (read !== piece.plate) wrong.push(`cell ${index}: the point read ${read.name} in a ${piece.plate.name} piece`);
        }
        const over = windows.filter((w) => inside(centre, w));
        if (over.length) {
          const nearest = over.reduce((a, b) => (gap(centre, b) < gap(centre, a) ? b : a));
          if (nearest.plate !== piece.plate) wrong.push(`cell ${index}: ${piece.plate.name} where ${nearest.plate.name} is nearer`);
        }
      }
    }
  }
  return { windows, unsplit, wrong, splits, pieces };
}

let vehicles = 0, splitVehicles = 0, splitCount = 0, pieceCount = 0;
const failures = [];
for (const id of PRODUCTION_TANK_IDS) {
  const result = census(id);
  if (!result.windows.length || !getSpec(id).armor.collisionShells?.turret?.length) continue;
  vehicles++;
  if (result.splits) splitVehicles++;
  splitCount += result.splits;
  pieceCount += result.pieces;
  const problems = [...result.unsplit.map((line) => `unsplit ${line}`), ...result.wrong];
  if (problems.length) failures.push(`${id}: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3})` : ''}`);
}
assert.deepEqual(failures, [], 'every forward turret facet partly over a gun plate is split, and each point reads the plate it lies over');
assert.ok(vehicles > 150, `the census covers the fleet's turreted vehicles (${vehicles})`);
assert.ok(splitVehicles > 150, `the split is fleet-wide (${splitVehicles} vehicles)`);

// the named pair: identical plates, so a level row across the gun face reads the same plates, the mantlet over the gun
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pose = tankPoseFromState({ pos: V(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const row = (id) => {
  const armor = getSpec(id).armor, pivot = armor.turretPivot;
  const reads = new Map();
  for (let step = -9; step <= 8; step++) {
    const x = step / 10, y = 0.28;
    const first = traceTank(V(x + pivot[0], y + pivot[1], 12), V(x + pivot[0], y + pivot[1], -12), pose, armor).find((h) => h.kind === 'plate');
    reads.set(x, first?.plate?.name ?? '(miss)');
  }
  return reads;
};
const abrams = row('m1a2_abrams'), sep = row('m1a2_abrams_sepv2');
assert.deepEqual([...abrams], [...sep], 'the M1A2 and the SEPv2 read the same plates across the gun face');
for (const [x, name] of abrams) {
  if (x >= -0.3 && x <= 0.2) assert.equal(name, 'mantlet', `m1a2_abrams: a level round at x ${x} meets the mantlet`);
  if (x <= -0.4) assert.equal(name, 'turret_cheek_L', `m1a2_abrams: a level round at x ${x} meets the left cheek`);
}

// negative control: the M1A2's splits taken off are found, and its gun face reads the cheek again
const stripped = [];
for (const cell of getSpec('m1a2_abrams').armor.collisionShells.turret) for (const face of cell.faces) if (face.gunSplit) { stripped.push([face, face.gunSplit]); delete face.gunSplit; }
try {
  const control = census('m1a2_abrams');
  assert.ok(control.unsplit.length > 0, 'the control: the M1A2 without its splits is found by the census');
  const before = row('m1a2_abrams');
  assert.ok([...before].some(([x, name]) => x >= -0.3 && x <= 0.2 && name !== 'mantlet'), 'the control: without its splits the M1A2 reads another plate over its gun');
} finally {
  for (const [face, split] of stripped) face.gunSplit = split;
}
console.log(`gunFaceSplit.selftest: ${splitCount} split planes (${pieceCount} pieces) on ${splitVehicles} of ${vehicles} turreted vehicles; `
  + 'every point inside a gun window reads a gun plate and none off them; the M1A2 reads its SEPv2 twin across the gun face; '
  + 'the control without its splits is found');
