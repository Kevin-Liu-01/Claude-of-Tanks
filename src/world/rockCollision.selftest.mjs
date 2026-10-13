// A stone's colliders from the stone itself (the hitbox lane, 2026-10-07; owner: "rock hitboxes are way too big and
// inaccurate"). The receipt holds rockCollision.ts to the stones the props draw:
//   1. a stone a hull's belly clears has no collider; one past the drive-over line has movement tiers (round 2: nested
//      columns, the first its ground outline to 0.7 m over its lowest point, each next one inside the one under it, the
//      last to its real top) and shell slabs bottom up, contiguous, from its lowest exposed point to its real top, each
//      inside the stone's own outline, narrowing toward a dome's crown, and a toe ring where the stone flares at its foot;
//   2. on the boulder forms the props build (rockDressing.ts buildBoulderForm inside the legacy hulls), placed at the
//      scatter's scales, sinks, yaws and stretches over flat and sloping ground, the colliders match the stone: the
//      movement record against the stone's own section union from the ground to 1.4 m (tools/worldColliderAudit.mjs
//      sectionRaster) and slice by slice up to the contact top (its volume, against one prism of the ground outline to
//      the stone's top, round 1's form), and horizontal rays at hull-to-turret heights against the stone's triangles; the
//      legacy collider on the same stones is measured beside them, so the receipt also records what was fixed;
//   3. deterministic: the same stone, matrix and ground give the same records, and the form's section table equals cutting
//      the stone (an upright placement reads the table, a tilted one cuts);
//   4. a formation's blocks keep their own outlines (parted or touching blocks two parts, a block inside another one)
//      and their own tiers, and the records pack to the shards' part forms ('v', 'w', 'm') the dedicated hosts read back
//      unchanged;
//   5. the tiers and a hull: on level ground a hull driven at a stone stops where the stone meets the ground; every column
//      of a record a hull can stand on is one it can stand on (a column within the step-up is a floor to the support and
//      no wall to the push, never one and not the other); on the stone a hull's floor steps as the tiers do.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import {
  HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, collisionPartSection, collisionPartTopAt, convexHull2, hullPassesObstacleTop,
  pointInsideCollisionRecord, pushHullFromObstacle, rayCollisionRecord, setConvexShape,
} from './collision.ts';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { structureTopAt } from '../sim/structureSupport.ts';
import { recordSegments } from '../dev/colliderOverlay.ts';
import { boulderKindFor, buildBoulderForm } from './rockDressing.ts';
import {
  ROCK_DRIVE_OVER_M, ROCK_TIER_FIRST_M, ROCK_TIER_FLOOR_M, applyFormationCollision, applyRockCollisionProfile, formationCollisionProfile,
  rockCollisionProfile, rockFormFrom, rockFormOf, rockStaysCrushable,
} from './rockCollision.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';
import { isSimpleShape } from '../../server/collisionManifestFormat.ts';
import {
  CONTACT_BAND, TriangleSoup, addMeshTriangles, colliderRaster, makeRegion, regionGround, sectionRaster, sliceSegments, raySegments2,
  rayClearance2, rayChord2,
} from '../../tools/worldColliderAudit.mjs';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------- 1. a sphere

const flat = () => 0;
{
  const sphere = rockFormOf(mergeVertices(new THREE.IcosahedronGeometry(1, 4)));
  const at = (y) => new THREE.Matrix4().makeTranslation(0, y, 0).elements;
  assert.equal(rockCollisionProfile(sphere, at(-1 + ROCK_DRIVE_OVER_M - 0.05), flat), null, 'a stone under the drive-over line has no collider');
  const p = rockCollisionProfile(sphere, at(0.2), flat);
  assert.ok(p, 'a stone past the line has one');
  assert.ok(Math.abs(p.top - 1.2) < 0.02, `its real top (${p.top})`);
  assert.ok(Math.abs(p.exposed - 1.2) < 0.02, 'its rise');
  // the equator stands 0.2 m over the ground, at the first tier's rise floor: the footprint is the whole disc
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return Math.abs(a) / 2; };
  assert.ok(area(p.contact) > 2.9 && area(p.contact) <= Math.PI + 1e-6, `the footprint is the stone's widest section over its rise floor (ROCK_TIER_FLOOR_M) (${area(p.contact).toFixed(2)} m2)`);
  // the tiers: the footprint to 0.7 m over the stone's lowest point, then the stone above it to its top, nested
  assert.equal(p.tiers.length, 2, `a 1.2 m dome stands two tiers (${p.tiers.length})`);
  assert.equal(p.contact, p.tiers[0].points, 'the footprint is the first tier');
  assert.ok(Math.abs(p.tiers[0].y0) < 0.011 && Math.abs(p.tiers[0].y1 - ROCK_TIER_FIRST_M) < 0.011, `the first tier to ${ROCK_TIER_FIRST_M} m`);
  assert.equal(p.tiers[1].y0, p.tiers[0].y1, 'each tier from the one under it');
  assert.equal(p.tiers[p.tiers.length - 1].y1, p.top, 'the last to the stone\'s top');
  assert.ok(nestedIn(p.tiers[1].points, p.tiers[0].points), 'each tier inside the one under it');
  assert.ok(area(p.tiers[1].points) < area(p.tiers[0].points) * 0.8, 'the dome narrows over its first tier');
  assert.ok(p.bands.length >= 3, `slabs bottom up (${p.bands.length})`);
  assert.ok(Math.abs(p.bands[0].y0 - 0) < 0.011, 'from the ground line');
  for (let i = 1; i < p.bands.length; i++) assert.equal(p.bands[i].y0, p.bands[i - 1].y1, 'contiguous slabs');
  assert.equal(p.bands[p.bands.length - 1].y1, p.top, 'to the top');
  assert.ok(area(p.bands[p.bands.length - 1].points) < area(p.bands[0].points) * 0.6, 'a dome narrows toward its crown');
  for (const band of p.bands) {
    for (let i = 0; i < band.points.length; i += 2) {
      const r = Math.hypot(band.points[i], band.points[i + 1]), h = band.y0 - 0.2;
      assert.ok(r <= Math.sqrt(Math.max(0, 1 - Math.min(1, h * h))) + 0.03, `slab corner inside the sphere at its foot (${r.toFixed(3)})`);
    }
  }
  // sunk deeper, the ground cuts it under the equator: a smaller footprint, its section at the rise floor (a toe a
  // track's rounded front clears stands no wall; 2026-10-09: the toe's air read over main's footprint)
  const q = rockCollisionProfile(sphere, at(-0.3), flat);
  // (the section's circle at the rise floor as twelve corners hold it: 3 r2)
  const ground = 3 * (1 - (0.3 + ROCK_TIER_FLOOR_M) ** 2);
  assert.ok(q && Math.abs(area(q.contact) - ground) < 0.04 * ground, `a sunk stone's footprint is its section at the rise floor (${area(q.contact).toFixed(2)} of ${ground.toFixed(2)} m2)`);
  // a stone that flares at its foot (a cone sunk 10 cm): a toe ring holds the flare its lowest slab's section leaves out
  const cone = rockFormOf(mergeVertices(new THREE.ConeGeometry(1.5, 2, 24, 6).translate(0, 1, 0)));
  const flared = rockCollisionProfile(cone, at(-0.1), flat);
  assert.ok(flared.bands[0].y1 < flared.bands[1].y1 && flared.bands[0].y0 === flared.bands[1].y0, 'the toe ring under the lowest slab');
  assert.ok(area(flared.bands[0].points) > 1.05 * area(flared.bands[1].points), `it holds the flare (${area(flared.bands[0].points).toFixed(2)} against ${area(flared.bands[1].points).toFixed(2)} m2)`);
  assert.ok(Math.abs(flared.bands[0].y1 - flared.bands[0].y0 - 0.25) < 0.011, 'a quarter metre high');
  assert.ok(!p.bands.some((band, i) => i > 0 && band.y0 === p.bands[0].y0), 'a dome that does not flare has none');
  // determinism, and the section table against the stone cut level by level (a hair of tilt forces the cut)
  assert.deepEqual(rockCollisionProfile(sphere, at(0.2), flat), p, 'the same stone, the same records');
  const tilted = new THREE.Matrix4().makeRotationX(1e-7).setPosition(0, 0.2, 0).elements;
  const cut = rockCollisionProfile(sphere, tilted, flat);
  assert.ok(Math.abs(cut.bands.length - p.bands.length) <= 1, `the table cuts the slabs about where the stone does (${cut.bands.length} / ${p.bands.length})`);
  assert.ok(Math.abs(area(cut.contact) - area(p.contact)) < 0.02 * area(p.contact), 'the movement footprint never reads the table');
}

/** Is every corner of `inner` inside the convex `outer` (either winding), within a centimetre? */
function nestedIn(inner, outer) {
  let w = 0;
  for (let i = 0; i < outer.length; i += 2) { const j = (i + 2) % outer.length; w += outer[i] * outer[j + 1] - outer[j] * outer[i + 1]; }
  const sign = w >= 0 ? 1 : -1;
  for (let k = 0; k < inner.length; k += 2) {
    for (let i = 0; i < outer.length; i += 2) {
      const j = (i + 2) % outer.length, ex = outer[j] - outer[i], ez = outer[j + 1] - outer[i + 1], len = Math.hypot(ex, ez);
      if (len < 1e-9) continue;
      if (sign * (ex * (inner[k + 1] - outer[i + 1]) - ez * (inner[k] - outer[i])) / len < -0.01) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------- 2. the boulders

const noise = new SimplexNoise({ random: mulberry32(1337 + 7) });
/** The legacy boulder (props.ts buildRockVariants: a welded icosphere, the props displacement law) and its hull. */
function legacyBoulder(vi) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const ridge = 1 - Math.abs(noise.noise3d(v.x * 2.2 + vi * 31, v.y * 2.2 - 7, v.z * 2.2 + 13));
    const f = 1 + noise.noise3d(v.x * 1.4 + vi * 9, v.y * 1.4, v.z * 1.4) * 0.30 + noise.noise3d(v.x * 3.1 - vi * 17, v.y * 3.1 + 40, v.z * 3.1) * 0.13
      + noise.noise3d(v.x * 6.8 + 91, v.y * 6.8 - vi * 5, v.z * 6.8) * 0.05 - Math.pow(ridge, 5) * 0.115;
    v.multiplyScalar(f); v.y = Math.max(v.y, -0.55);
    p.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  const projected = [];
  let top = 0;
  for (let i = 0; i < p.count; i++) { projected.push([p.getX(i), p.getZ(i)]); top = Math.max(top, p.getY(i)); }
  return { hull: convexHull2(projected), top };
}
const slope = (x, z) => 0.18 * x - 0.07 * z;
const totals = { legacy: { col: 0, ph: 0, rays: 0, phr: 0 }, now: { col: 0, ph: 0, mesh: 0, leak: 0, rays: 0, phr: 0, lkr: 0 } };
/** The movement record's volume slice by slice (round 2): the tiers and round 1's one prism of the ground outline. */
const volume = { stone: 0, tiers: { col: 0, ph: 0, high: 0, leak: 0 }, prism: { col: 0, ph: 0, high: 0, leak: 0 } };
/** The movement record from the first tier's rise floor to 1.4 m over the ground, where a hull meets a stone (a toe
 * under the floor is a track's to roll over; 2026-10-09: round 2's ground band read the toe's air over main's). */
const MOVE_BAND = [ROCK_TIER_FLOOR_M, 1.4];
// (the slices over the first tier's rise floor: the toe under it is no hull's)
const SLICES = [0.05, 0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.15, 2.45, 2.75].filter((Y) => Y >= ROCK_TIER_FLOOR_M);
let stones = 0, driveOver = 0, columns = 0, drawnTops = 0;
for (const lithology of ['granite', 'sandstone', 'limestone']) {
  for (let vi = 0; vi < 3; vi++) {
    const legacy = legacyBoulder(vi);
    const form = buildBoulderForm(vi, noise, mulberry32(2002 + 60 + vi), legacy.hull, 6, legacy.top, boulderKindFor(lithology, vi), lithology);
    const rock = rockFormOf(form.geometry);
    const mesh = new THREE.Mesh(form.geometry);
    for (const [sc, sink, yaw, stretch, ground] of [[1.4, 0.22, 0.4, 1, flat], [2.2, 0.22, 2.1, 0.8, flat], [3.0, 0.3, 4.0, 1, slope], [1.9, 0.4, 5.5, 0.74, slope], [1.1, 0.6, 1.0, 1, flat]]) {
      const y = ground(0, 0) - sink * sc, scaleY = sc * 0.97;
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(sc * stretch, scaleY, sc));
      const profile = rockCollisionProfile(rock, matrix.elements, ground);
      if (!profile) { driveOver++; continue; }
      stones++;
      const obstacle = { min: [0, 0, 0], max: [0, 0, 0] }, collider = { min: [0, 0, 0], max: [0, 0, 0] };
      applyRockCollisionProfile(obstacle, collider, profile, y);
      if (obstacle.shape2?.kind === 'convex' && obstacle.shape2.tp) drawnTops++;
      for (let k = 1; k < profile.tiers.length; k++) assert.ok(nestedIn(profile.tiers[k].points, profile.tiers[k - 1].points), 'nested tiers');
      // every column a hull can stand on stands it (the record is a floor and no wall by the same rule): its own height
      // from the record's floor holds the standing height
      const parts = obstacle.shape2.kind === 'compound' ? obstacle.shape2.parts : [{ y0: obstacle.min[1], y1: obstacle.max[1] }];
      for (const part of parts) {
        columns++;
        assert.ok(part.y1 - (part.y0 ?? obstacle.min[1]) >= HULL_STANDABLE_HEIGHT_M, `a column a hull can stand on (${(part.y1 - part.y0).toFixed(2)} m)`);
      }
      const prism = setConvexShape({ min: [0, obstacle.min[1], 0], max: [0, obstacle.max[1], 0] }, profile.tiers[0].points.slice());
      // the legacy collider: the hull times the scale, from the seat to 1.1 x the scale
      const c = Math.cos(yaw), s = Math.sin(yaw), pts = [];
      for (let i = 0; i < legacy.hull.length; i += 2) {
        const lx = legacy.hull[i] * sc, lz = legacy.hull[i + 1] * sc;
        pts.push(lx * c + lz * s, -lx * s + lz * c);
      }
      const old = setConvexShape({ min: [0, y, 0], max: [0, y + sc * 1.1, 0] }, pts);
      // the stone's own section union in the contact band, cell by cell
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix);
      const soup = new TriangleSoup(4);
      addMeshTriangles(soup, mesh, 'stone');
      const tris = Array.from({ length: soup.count }, (_, t) => t);
      const r = sc * 1.6, region = makeRegion(-r, -r, r, r, 0.05), g = regionGround(region, ground);
      const stone = sectionRaster(region, g, MOVE_BAND, soup, tris);
      const now = colliderRaster(region, g, MOVE_BAND, obstacle), before = colliderRaster(region, g, CONTACT_BAND, old);
      for (let k = 0; k < stone.length; k++) {
        if (now[k]) { totals.now.col++; if (!stone[k]) totals.now.ph++; }
        if (before[k]) { totals.legacy.col++; if (!stone[k]) totals.legacy.ph++; }
        if (stone[k]) { totals.now.mesh++; if (!now[k]) totals.now.leak++; }
      }
      // the volume: slice by slice over the ground, the tiers and the one prism against the stone's own section there
      for (const Y of SLICES) {
        const band = [Y - 0.02, Y + 0.02], at = sectionRaster(region, g, band, soup, tris);
        const t = colliderRaster(region, g, band, obstacle), q = colliderRaster(region, g, band, prism);
        for (let k = 0; k < at.length; k++) {
          if (at[k]) volume.stone++;
          const high = Y > ROCK_TIER_FIRST_M;
          if (t[k]) { volume.tiers.col++; if (!at[k]) { volume.tiers.ph++; if (high) volume.tiers.high++; } } else if (at[k]) volume.tiers.leak++;
          if (q[k]) { volume.prism.col++; if (!at[k]) { volume.prism.ph++; if (high) volume.prism.high++; } } else if (at[k]) volume.prism.leak++;
        }
      }
      // shells: horizontal rays at hull-to-turret heights from eight directions, lanes 0.2 m apart
      const origin = new THREE.Vector3(), dir = new THREE.Vector3(), normal = new THREE.Vector3();
      for (const height of [0.6, 1.0, 1.4, 1.8, 2.2]) {
        const Y = ground(0, 0) + height, segments = sliceSegments(soup, tris, Y);
        for (let a = 0; a < 8; a++) {
          const th = (a / 8) * Math.PI + 0.07, dx = Math.cos(th), dz = Math.sin(th);
          for (let lane = -r; lane <= r; lane += 0.2) {
            const ox = -dz * lane - dx * (r + 1), oz = dx * lane - dz * (r + 1), len = 2 * (r + 1);
            origin.set(ox, Y, oz); dir.set(dx, 0, dz);
            const m = raySegments2(segments, ox, oz, dx, dz, len);
            for (const [key, record] of [['now', collider], ['legacy', old]]) {
              const hit = rayCollisionRecord(origin, dir, record, len, normal);
              if (hit < 0 && m < 0) continue;
              totals[key].rays++;
              if (hit >= 0 && m < 0 && rayClearance2(segments, ox, oz, dx, dz, len) > 0.1) totals[key].phr++;
              if (key === 'now' && m >= 0 && hit < 0 && rayChord2(segments, ox, oz, dx, dz, len) > 0.1) totals.now.lkr++;
            }
          }
        }
      }
    }
    form.geometry.dispose();
  }
}
const share = (a, b) => (b ? a / b : 0);
const nowPhantom = share(totals.now.ph, totals.now.col), oldPhantom = share(totals.legacy.ph, totals.legacy.col);
const nowLeak = share(totals.now.leak, totals.now.mesh), nowRays = share(totals.now.phr, totals.now.rays);
const nowRayLeak = share(totals.now.lkr, totals.now.rays), oldRays = share(totals.legacy.phr, totals.legacy.rays);
assert.ok(stones >= 30 && driveOver >= 1, `the stones measured (${stones}, ${driveOver} driven over)`);
assert.ok(oldPhantom > 0.4, `the legacy colliders stood in air (${(oldPhantom * 100).toFixed(1)} %)`);
assert.ok(nowPhantom < 0.12, `movement footprints within the stone (${(nowPhantom * 100).toFixed(1)} % phantom)`);
assert.ok(nowLeak < 0.03, `and holding it (${(nowLeak * 100).toFixed(1)} % of the stone uncovered)`);
// (the air in cells x slices: the first tier holds the ground outline as the prism does, by design; over it the tiers
// follow the stone)
const tierAir = share(volume.tiers.ph, volume.prism.ph), highAir = share(volume.tiers.high, volume.prism.high);
const tierLeak = share(volume.tiers.leak, volume.stone), prismLeak = share(volume.prism.leak, volume.stone);
// (2026-10-09: the first tier tops out 0.7 m over the highest ground a stone leaves, so a stone on a slope stands fewer
// tiers than round 2's, whose first tier the census found under the band on the uphill side)
// (2026-10-13, physics stream: a stone's movement record is one part under its own drawn top — stoneCapPlanes — in place of
// round 2's stair columns, which stood a hull up to 0.8 m over the stone it saw; every stone carries one)
assert.equal(drawnTops, stones, `every stone stands under its drawn top (${drawnTops} of ${stones})`);
assert.ok(highAir < 0.7 && tierAir < 0.85, `the tiers stand clear of the air over a dome's shoulders (${(highAir * 100).toFixed(0)} % of the prism's over the first tier, ${(tierAir * 100).toFixed(0)} % in all)`);
assert.ok(tierLeak < 0.01 && tierLeak <= prismLeak + 0.01, `and hold the stone (${(tierLeak * 100).toFixed(1)} % uncovered, the prism's ${(prismLeak * 100).toFixed(1)} %)`);
assert.ok(nowRays < 0.05 && nowRays < oldRays / 3, `shells meet the stone (${(nowRays * 100).toFixed(1)} % of rays stopped 10+ cm clear, legacy ${(oldRays * 100).toFixed(1)} %)`);
assert.ok(nowRayLeak < 0.04, `and stop on it (${(nowRayLeak * 100).toFixed(1)} % clip 10+ cm of stone unstopped)`);
assert.equal(rockStaysCrushable(1.6, false), true, 'a small stone is crushed');
assert.equal(rockStaysCrushable(1.6, true), false, 'an authored outcrop is cover');
assert.equal(rockStaysCrushable(2.4, false), false, 'a big stone is cover');

// ---------------------------------------------------------------------------------------------- 4. formations and packing

{
  const block = (x, z, w, h, d) => new THREE.BoxGeometry(w, h, d, 2, 2, 2).translate(x, h / 2 - 0.3, z);
  const parted = formationCollisionProfile([block(0, 0, 2, 3, 2), block(3, 0, 2, 2.4, 2)], flat);
  assert.equal(parted.contact.length, 2, 'parted blocks keep their own outlines');
  const touching = formationCollisionProfile([block(0, 0, 2, 3, 2), block(2.02, 0, 2, 3, 2)], flat);
  assert.equal(touching.contact.length, 2, 'touching blocks keep their own outlines (the gap between them is no stone)');
  const nested = formationCollisionProfile([block(0, 0, 3, 3, 3), block(0.2, 0.1, 1.2, 2.4, 1.2)], flat);
  assert.equal(nested.contact.length, 1, 'a block inside another adds no outline');
  assert.ok(Math.abs(parted.top - 2.7) < 0.011 && parted.low < 0.011, 'the formation spans its exposed stone');
  assert.equal(formationCollisionProfile([block(0, 0, 3, 0.6, 3)], flat), null, 'a slab under the drive-over line publishes nothing');
  const obstacle = { min: [0, 0, 0], max: [0, 0, 0] }, collider = { min: [0, 0, 0], max: [0, 0, 0] };
  applyFormationCollision(obstacle, collider, parted, -0.5);
  assert.equal(obstacle.shape2.kind, 'compound');
  assert.ok(collider.shape2.parts.every((part) => part.y0 !== undefined && part.y1 > part.y0), 'ranged shell parts');
  const packedShell = packCollisionRecord(collider), packedMove = packCollisionRecord(obstacle);
  assert.equal(packedShell.s[0], 'm');
  assert.ok(packedShell.s.slice(1).every((part) => isSimpleShape(part) && (part[0] === 'w' || part[0] === 'v')), 'the shards\' part forms');
  assert.ok(isSimpleShape(packedMove.s[1]), 'the movement parts pack');
  const sphere = rockFormFrom(Float64Array.from(rockFormOf(mergeVertices(new THREE.IcosahedronGeometry(1, 3))).positions),
    rockFormOf(mergeVertices(new THREE.IcosahedronGeometry(1, 3))).edges);
  const stone = rockCollisionProfile(sphere, new THREE.Matrix4().makeTranslation(5, 0, 5).elements, flat);
  const o = { min: [0, 0, 0], max: [0, 0, 0] }, c = { min: [0, 0, 0], max: [0, 0, 0] };
  applyRockCollisionProfile(o, c, stone, -0.4);
  // (2026-10-13, physics stream) one part over the stone's footprint, from the seat (the standing rule reads the whole
  // stone) to its top, under its drawn top (stoneCapPlanes: world/collision.ts collisionPartTopAt)
  assert.ok(o.shape2.kind === 'convex' && Array.isArray(o.shape2.tp) && o.shape2.tp.length >= 5, 'a stone\'s movement part carries its drawn top');
  assert.ok(o.shape2.y0 === -0.4 && o.shape2.y1 === stone.top, 'from the seat to the stone\'s top');
  assert.equal(o.min[1], -0.4, 'the movement record stands from the seat');
  const packedStone = packCollisionRecord(o).s;
  assert.ok(packedStone[0] === 'p' && isSimpleShape(packedStone) && packCollisionRecord(c).s.slice(1).every(isSimpleShape),
    'a stone packs (its drawn top tagged p)');
  // the shard's record reads the same top as the built one (the planes keep their millimetres through the packing)
  const flatField = { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), maxY: 10 };
  const shard = createHeadlessCollisionWorld({ heightField: flatField, manifest: { obstacles: [packCollisionRecord(o)], colliders: [] } }).getObstacles()[0];
  let worst = 0;
  for (let x = 4; x <= 6; x += 0.25) for (let z = 4; z <= 6; z += 0.25) {
    if (!pointInsideCollisionRecord(o, o.shape2, x, z)) continue;
    worst = Math.max(worst, Math.abs(collisionPartTopAt(shard, shard.shape2, x, z) - collisionPartTopAt(o, o.shape2, x, z)));
  }
  assert.ok(worst < 2e-3, `the shard's drawn top is the built one's (${(worst * 1000).toFixed(2)} mm)`);
  assert.ok(obstacle.shape2.parts.length === 2 && obstacle.shape2.parts.every((part) => part.tp),
    `each block one part under its own drawn top (${obstacle.shape2.parts.length})`);
  assert.ok(packCollisionRecord(c).s.slice(1).every((part) => part.slice(1).every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)),
    'every outline to the centimetre');
}

// ---------------------------------------------------------------------------------------------- 5. the drawn top and a hull

let stops = 0, climbable = 0;
{
  // a 1.4 m ball, its equator 0.4 m over level ground, seated 0.3 m under it: its flank is steep from the ground up
  const sphere = rockFormOf(mergeVertices(new THREE.IcosahedronGeometry(1, 4)));
  const stone = rockCollisionProfile(sphere, new THREE.Matrix4().makeTranslation(0, 0.4, 0).elements, flat);
  const rec = { min: [0, 0, 0], max: [0, 0, 0] }, col = { min: [0, 0, 0], max: [0, 0, 0] };
  applyRockCollisionProfile(rec, col, stone, -0.3);
  const part = rec.shape2;
  assert.ok(part.kind === 'convex' && part.tp, 'one part under its drawn top');
  // the drawn top follows the ball: within a few centimetres of its upper surface over the footprint, never under it
  let over = 0, under = 0;
  for (let x = -1; x <= 1; x += 0.1) for (let z = -1; z <= 1; z += 0.1) {
    if (!pointInsideCollisionRecord(rec, part, x, z) || x * x + z * z > 0.95) continue;
    const err = collisionPartTopAt(rec, part, x, z) - (0.4 + Math.sqrt(1 - x * x - z * z));
    over = Math.max(over, err); under = Math.min(under, err);
  }
  // (a ball is the convex form planes fit worst: its every bearing is a face; 12 of them hold it to a quarter metre, the
  // coordinator's bound for a hull's floor over the stone it sees)
  assert.ok(over < 0.25 && under > -0.015, `the top follows the ball (${(under * 100).toFixed(1)} to +${(over * 100).toFixed(1)} cm)`);
  // level ground: a hull driven at it from eight sides stops where the ball rises a step over its tracks (its section
  // HULL_STEP_UP_M up, collisionPartSection), never short of it or into it
  const halfL = 3.4, halfW = 1.75, wall = [];
  assert.ok(collisionPartSection(part, HULL_STEP_UP_M, wall), 'the ball stands a step over level ground');
  for (let a = 0; a < 8; a++) {
    const th = (a / 8) * Math.PI * 2 + 0.1, fx = Math.cos(th), fz = Math.sin(th);
    let reach = -Infinity;
    for (let i = 0; i < wall.length; i += 2) reach = Math.max(reach, -(wall[i] * fx + wall[i + 1] * fz));
    let stop = null;
    for (let d = 6; d > halfL - 1; d -= 0.005) {
      const push = { x: 0, z: 0 };
      if (pushHullFromObstacle({ x: -fx * d, z: -fz * d }, fx, fz, fz, -fx, halfL, halfW, rec, push, 0, 2.4, 0)) { stop = d; break; }
    }
    assert.ok(stop !== null && Math.abs(stop - halfL - reach) < 0.012, `side ${a}: the hull meets the ball where it rises a step (${(stop - halfL).toFixed(3)} / ${reach.toFixed(3)} m)`);
    stops++;
  }
  // wall or floor, never both: over the ball at every underside height, a point the push holds a hull off (inside the
  // section a step over it) is no floor to the support, and every point it lets a hull stand over is its floor, at the
  // drawn top there
  let checked = 0;
  const section = [];
  for (let k = 0; k <= 50; k++) {
    const h = -0.5 + k * 0.05;
    const walled = collisionPartSection(part, h + HULL_STEP_UP_M, section);
    const probe = { min: [0, 0, 0], max: [0, 0, 0] };
    for (let x = -0.9; x <= 0.9; x += 0.3) for (let z = -0.9; z <= 0.9; z += 0.3) {
      if (!pointInsideCollisionRecord(rec, part, x, z)) continue;
      const top = collisionPartTopAt(rec, part, x, z);
      if (h > top + 0.5) continue; // (a hull flying over it)
      const isWall = walled && pointInsideCollisionRecord(probe, { kind: 'convex', cx: 0, cz: 0, points: section }, x, z);
      const floor = structureTopAt([rec], 1, x, z, h);
      assert.ok(!(isWall && floor === top), `no point is a wall to the push and a floor to the support (top ${top.toFixed(2)}, underside ${h.toFixed(2)})`);
      if (!isWall) assert.ok(Math.abs(floor - top) < 1e-9, `a point a hull stands over is its floor (top ${top.toFixed(2)}, underside ${h.toFixed(2)}, floor ${floor})`);
      checked++;
    }
  }
  assert.ok(checked > 200, `points checked at every underside height (${checked})`);
  assert.equal(structureTopAt([rec], 1, 0, 0, 0), -Infinity, 'no floor on level ground: the ball\'s top is past the step');
  assert.ok(Math.abs(structureTopAt([rec], 1, 0, 0, stone.top - 0.1) - collisionPartTopAt(rec, part, 0, 0)) < 1e-9, 'on its crown its drawn top');
  // a low dome a hull climbs: the ball flattened to 0.5 m and spread 3.2 m across stands no wall over level ground, and its
  // flank is a floor from the ground
  const dome = rockCollisionProfile(sphere, new THREE.Matrix4().compose(new THREE.Vector3(0, -0.1, 0), new THREE.Quaternion(),
    new THREE.Vector3(1.6, 0.6, 1.6)).elements, flat);
  const low = { min: [0, 0, 0], max: [0, 0, 0] }, lowCol = { min: [0, 0, 0], max: [0, 0, 0] };
  applyRockCollisionProfile(low, lowCol, dome, -0.3);
  assert.ok(!collisionPartSection(low.shape2, HULL_STEP_UP_M, section), 'a 0.5 m dome rises no step over level ground');
  for (const r of [0.6, 0.9, 1.2]) {
    const top = collisionPartTopAt(low, low.shape2, r, 0);
    assert.ok(Math.abs(structureTopAt([low], 1, r, 0, 0) - top) < 1e-9, `its flank is a floor from the ground (${r} m out, top ${top.toFixed(2)})`);
    climbable++;
  }
  const pushLow = { x: 0, z: 0 };
  assert.ok(!pushHullFromObstacle({ x: -4.4, z: 0 }, 1, 0, 0, -1, halfL, halfW, low, pushLow, 0, 2.4, 0), 'a hull is not held off it');
  // the collider overlay draws the ball's foot and its drawn top's edge, rising and falling with the stone
  const segments = [];
  recordSegments(rec, () => 0, segments);
  const ys = new Set();
  for (let i = 1; i < segments.length; i += 3) ys.add(Math.round(segments[i] * 100) / 100);
  assert.ok(ys.has(0) && ys.size > 6, `the overlay draws the foot and the top's rise (${ys.size} heights)`);
}

console.log(`rockCollision.selftest: ${stones} placed boulders (${driveOver} driven over): movement phantom ${(oldPhantom * 100).toFixed(1)} % -> `
  + `${(nowPhantom * 100).toFixed(1)} %, stone uncovered ${(nowLeak * 100).toFixed(1)} %; the tiers' air ${(tierAir * 100).toFixed(0)} % of one prism's `
  + `(${(highAir * 100).toFixed(0)} % over the first tier), ${(tierLeak * 100).toFixed(1)} % of the stone uncovered (the prism ${(prismLeak * 100).toFixed(1)} %), `
  + `${columns} parts (${drawnTops} drawn tops); shell rays 10+ cm clear ${(oldRays * 100).toFixed(1)} % -> ${(nowRays * 100).toFixed(1)} %, clipping stone unstopped `
  + `${(nowRayLeak * 100).toFixed(1)} %; formations and packing; a hull meets the ball a step up from ${stops} sides, climbs a low dome's flank at ${climbable} points`);
