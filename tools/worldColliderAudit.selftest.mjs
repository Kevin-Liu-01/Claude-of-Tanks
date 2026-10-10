// The world collider audit's measures (the hitbox lane, 2026-10-07): tools/worldColliderAudit.mjs judges every collider
// against the geometry it stands for, so its own arithmetic is pinned here on solids whose answers are known.
//   - the band section: a box's footprint exactly, a sphere's widest section in the band, an open sheet nothing, two
//     overlapping boxes their union (the signed crossings), a box above the band nothing, a tilted ground cell by cell;
//   - the collider raster: a part outside the band holds no cell, a convex record its own footprint;
//   - the rays: the 2D crossings, the clearance of a miss, the chord of a hit, the terrain's reach, the record ray (the
//     game's own), and the shell fan's directions and lanes;
//   - the kind summary: shares and their quantiles.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setConvexShape } from '../src/world/collision.ts';
import {
  CONTACT_BAND, TriangleSoup, addMeshTriangles, colliderRaster, forEachShellRay, kindTotals, makeRegion, quantile, rayChord2,
  rayClearance2, rayRecords, raySegments2, rayTerrainReach, regionGround, sectionRaster, sliceSegments,
} from './worldColliderAudit.mjs';

function soupOf(...geometries) {
  const soup = new TriangleSoup(4);
  for (const geometry of geometries) {
    const mesh = new THREE.Mesh(geometry);
    addMeshTriangles(soup, mesh, 'solid');
  }
  return { soup, tris: Array.from({ length: soup.count }, (_, t) => t) };
}
const cells = (grid) => grid.reduce((n, v) => n + v, 0);
const flat = () => 0;

// the band section
{
  const h = 0.05, region = makeRegion(-3, -3, 3, 3, h), ground = regionGround(region, flat);
  const box = soupOf(new THREE.BoxGeometry(2, 1, 1).translate(0, 0.5, 0));
  assert.ok(Math.abs(cells(sectionRaster(region, ground, CONTACT_BAND, box.soup, box.tris)) * h * h - 2) < 0.02, 'a box: its footprint');
  const sphere = soupOf(mergeVertices(new THREE.IcosahedronGeometry(1, 5)).translate(0, 0.2, 0));
  const disc = cells(sectionRaster(region, ground, CONTACT_BAND, sphere.soup, sphere.tris)) * h * h;
  assert.ok(Math.abs(disc - Math.PI) < 0.08, `a sphere: its equator in the band (${disc.toFixed(3)})`);
  const sheet = soupOf(new THREE.PlaneGeometry(2, 1).translate(0, 0.8, 0));
  assert.equal(cells(sectionRaster(region, ground, CONTACT_BAND, sheet.soup, sheet.tris)), 0, 'an open sheet fills nothing');
  const pair = soupOf(new THREE.BoxGeometry(2, 1, 1).translate(0, 0.5, 0), new THREE.BoxGeometry(2, 1, 1).translate(1, 0.5, 0));
  assert.ok(Math.abs(cells(sectionRaster(region, ground, CONTACT_BAND, pair.soup, pair.tris)) * h * h - 3) < 0.03, 'two boxes: their union');
  const high = soupOf(new THREE.BoxGeometry(2, 1, 1).translate(0, 2.5, 0));
  assert.equal(cells(sectionRaster(region, ground, CONTACT_BAND, high.soup, high.tris)), 0, 'a box above the band: nothing');
  // on a slope the band follows the ground under each cell: a 0.5 m slab on ground rising 0.5 m a metre reaches the band
  // only where the ground lies under 0.3 m (x < 0.6): 1.6 of its 2 m2
  const tilt = (x) => 0.5 * x, tilted = regionGround(region, tilt);
  const step = soupOf(new THREE.BoxGeometry(2, 0.5, 1).translate(0, 0.25, 0));
  const part = cells(sectionRaster(region, tilted, CONTACT_BAND, step.soup, step.tris)) * h * h;
  assert.ok(Math.abs(part - 1.6) < 0.06, `on a slope only the stone over its own ground (${part.toFixed(2)})`);
}

// the collider raster
{
  const h = 0.05, region = makeRegion(-3, -3, 3, 3, h), ground = regionGround(region, flat);
  const record = setConvexShape({ min: [0, -0.5, 0], max: [0, 1.0, 0] }, [-1, -0.5, 1, -0.5, 1, 0.5, -1, 0.5]);
  assert.ok(Math.abs(cells(colliderRaster(region, ground, CONTACT_BAND, record)) * h * h - 2) < 0.02, 'a convex record: its footprint');
  const low = setConvexShape({ min: [0, -0.5, 0], max: [0, 0.15, 0] }, [-1, -0.5, 1, -0.5, 1, 0.5, -1, 0.5]);
  assert.equal(cells(colliderRaster(region, ground, CONTACT_BAND, low)), 0, 'a record under the band holds no cell');
  const banded = { min: [-1, -0.5, -0.5], max: [1, 2, 0.5], shape2: { kind: 'compound', cx: 0, cz: 0, parts: [
    { kind: 'convex', cx: 0, cz: 0, points: [-1, -0.5, 1, -0.5, 1, 0.5, -1, 0.5], y0: -0.5, y1: 0.1 },
    { kind: 'convex', cx: 0, cz: 0, points: [-0.5, -0.25, 0.5, -0.25, 0.5, 0.25, -0.5, 0.25], y0: 0.1, y1: 2 },
  ] } };
  assert.ok(Math.abs(cells(colliderRaster(region, ground, CONTACT_BAND, banded)) * h * h - 0.5) < 0.02, 'only the parts in the band');
}

// the rays
{
  const square = [-1, -1, 1, -1, 1, -1, 1, 1, 1, 1, -1, 1, -1, 1, -1, -1];
  assert.ok(Math.abs(raySegments2(square, -5, 0, 1, 0, 10) - 4) < 1e-9, 'the first crossing');
  assert.equal(raySegments2(square, -5, 3, 1, 0, 10), -1, 'a miss');
  assert.ok(Math.abs(rayClearance2(square, -5, 3, 1, 0, 10) - 2) < 1e-9, 'a miss clears by its distance');
  assert.ok(Math.abs(rayChord2(square, -5, 0.5, 1, 0, 10) - 2) < 1e-9, 'a hit\'s chord');
  assert.ok(Math.abs(rayTerrainReach((x) => (x > 3 ? 5 : 0), -5, 1, 0, 1, 0, 20) - 8) < 0.01, 'the terrain stops a ray');
  assert.equal(rayTerrainReach(flat, 0, 1, 0, 1, 0, 20), 20, 'a ray over flat ground runs on');
  const record = setConvexShape({ min: [0, 0, 0], max: [0, 1, 0] }, [-1, -1, 1, -1, 1, 1, -1, 1]);
  assert.ok(Math.abs(rayRecords([record], -5, 0.5, 0, 1, 0, 0, 10) - 4) < 1e-9, 'the game\'s ray on a record');
  assert.equal(rayRecords([record], -5, 1.5, 0, 1, 0, 0, 10), -1, 'over its top');
  const box = soupOf(new THREE.BoxGeometry(2, 1, 2).translate(0, 0.5, 0));
  assert.ok(Math.abs(raySegments2(sliceSegments(box.soup, box.tris, 0.5), -5, 0, 1, 0, 10) - 4) < 1e-6, 'a slice\'s segments');
  let rays = 0;
  const heights = new Set();
  forEachShellRay(0, 0, 1, 0, (ox, oy, oz, dx, dz, len) => { rays++; heights.add(oy); assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9 && len > 2); }, [0.6, 1.4], 4);
  assert.ok(rays === heights.size * 4 * (Math.round(3.2 / 0.2) + 1) && heights.size === 2, `the fan's lanes (${rays})`);
}

// the kind summary
{
  const rows = [
    { kind: 'boulder', colliderM2: 10, phantomM2: 6, meshM2: 4, leakM2: 0, rays: 10, phantomRays: 5, leakRays: 0, earlyRays: 1, colliderTopM: 2, meshTopM: 1.5 },
    { kind: 'boulder', colliderM2: 10, phantomM2: 2, meshM2: 8, leakM2: 1, rays: 10, phantomRays: 1, leakRays: 1, earlyRays: 0, colliderTopM: 1, meshTopM: 1.1 },
  ];
  const [k] = kindTotals(rows);
  assert.equal(k.n, 2);
  assert.equal(k.phantomShare, 0.4);
  assert.equal(k.leakShare, +(1 / 12).toFixed(3));
  assert.equal(k.rayPhantomShare, 0.3);
  assert.equal(k.topErrM, 0.2);
  assert.equal(quantile([0.1, 0.5, 0.9], 0.5), 0.5);
}
console.log('worldColliderAudit.selftest: band sections (box, sphere, sheet, union, slope), collider rasters, rays and kind totals');
