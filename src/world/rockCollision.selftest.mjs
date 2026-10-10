// A stone's colliders from the stone itself (the hitbox lane, 2026-10-07; owner: "rock hitboxes are way too big and
// inaccurate"). The receipt holds rockCollision.ts to the stones the props draw:
//   1. a stone a hull's belly clears has no collider; one past the drive-over line has a movement footprint (its hull
//      between the contact floor and the contact top over its own ground) and shell slabs bottom up, contiguous, from its
//      lowest exposed point to its real top, each inside the stone's own outline, narrowing toward a dome's crown;
//   2. on the boulder forms the props build (rockDressing.ts buildBoulderForm inside the legacy hulls), placed at the
//      scatter's scales, sinks, yaws and stretches over flat and sloping ground, the colliders match the stone: the
//      movement footprint's area against the stone's own section union in the contact band (tools/worldColliderAudit.mjs
//      sectionRaster), and horizontal rays at hull-to-turret heights against the stone's triangles; the legacy collider
//      on the same stones is measured beside them, so the receipt also records what was fixed;
//   3. deterministic: the same stone, matrix and ground give the same records, and the form's section table equals cutting
//      the stone (an upright placement reads the table, a tilted one cuts);
//   4. a formation's blocks keep their own outlines (parted or touching blocks two parts, a block inside another one),
//      and the records pack to the shards' part forms ('v', 'w', 'm') the dedicated hosts read back unchanged.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { convexHull2, rayCollisionRecord, setConvexShape } from './collision.ts';
import { boulderKindFor, buildBoulderForm } from './rockDressing.ts';
import {
  ROCK_CONTACT_FLOOR_M, ROCK_DRIVE_OVER_M, applyFormationCollision, applyRockCollisionProfile, formationCollisionProfile,
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
  // the contact band holds the equator (0.2 m over the ground): the footprint is the whole disc
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return Math.abs(a) / 2; };
  assert.ok(area(p.contact) > 2.9 && area(p.contact) <= Math.PI + 1e-6, `the footprint is the stone's widest section in the band (${area(p.contact).toFixed(2)} m2)`);
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
  // sunk deeper, the contact band starts above the equator: a smaller footprint
  const q = rockCollisionProfile(sphere, at(-0.3), flat);
  assert.ok(q && area(q.contact) < area(p.contact) * 0.85, 'a sunk stone stands its narrower top in the band');
  // determinism, and the section table against the stone cut level by level (a hair of tilt forces the cut)
  assert.deepEqual(rockCollisionProfile(sphere, at(0.2), flat), p, 'the same stone, the same records');
  const tilted = new THREE.Matrix4().makeRotationX(1e-7).setPosition(0, 0.2, 0).elements;
  const cut = rockCollisionProfile(sphere, tilted, flat);
  assert.ok(Math.abs(cut.bands.length - p.bands.length) <= 1, `the table cuts the slabs about where the stone does (${cut.bands.length} / ${p.bands.length})`);
  assert.ok(Math.abs(area(cut.contact) - area(p.contact)) < 0.02 * area(p.contact), 'the movement footprint never reads the table');
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
let stones = 0, driveOver = 0;
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
      const stone = sectionRaster(region, g, CONTACT_BAND, soup, tris);
      const now = colliderRaster(region, g, CONTACT_BAND, obstacle), before = colliderRaster(region, g, CONTACT_BAND, old);
      for (let k = 0; k < stone.length; k++) {
        if (now[k]) { totals.now.col++; if (!stone[k]) totals.now.ph++; }
        if (before[k]) { totals.legacy.col++; if (!stone[k]) totals.legacy.ph++; }
        if (stone[k]) { totals.now.mesh++; if (!now[k]) totals.now.leak++; }
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
  assert.equal(o.shape2.kind, 'convex');
  assert.equal(o.min[1], -0.4, 'the movement record stands from the seat (the standing rule reads the whole stone)');
  assert.ok(isSimpleShape(packCollisionRecord(o).s) && packCollisionRecord(c).s.slice(1).every(isSimpleShape), 'a stone packs');
  assert.ok(packCollisionRecord(c).s.slice(1).every((part) => part.slice(1).every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)),
    'every outline to the centimetre');
}

console.log(`rockCollision.selftest: ${stones} placed boulders (${driveOver} driven over): movement phantom ${(oldPhantom * 100).toFixed(1)} % -> `
  + `${(nowPhantom * 100).toFixed(1)} %, stone uncovered ${(nowLeak * 100).toFixed(1)} %; shell rays 10+ cm clear ${(oldRays * 100).toFixed(1)} % -> `
  + `${(nowRays * 100).toFixed(1)} %, clipping stone unstopped ${(nowRayLeak * 100).toFixed(1)} %; formations and packing`);
