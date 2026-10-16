// A map's pre-placed shell craters as real bowls (DST-04, 2026-10-15; docs/DESTRUCTION.md §7): the props build records
// its scars' sites; the world decides each site's bowl once on its own records (a bowl never reaches under a record but a
// tree; hard ground, water and a site under the dig radius are marks); the shards carry the decided stamps; every match
// — the solo step, the authority (fresh or prepared), a seat's mirror and the Studio — lays them into its ground first;
// the presentation lays their surfaces from the overlay it is bound to. Same stamps, same ground, everywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import {
  MAP_CRATER_DEPTH_PER_RADIUS, MAP_CRATER_MAX, MAP_CRATER_RIM_RING, mapCraterSeed, mapCraterStamps, mapCraterStampsOf,
  mapCratersOn, packMapCraterStamps, quantizeMapCraterSite, stampMapCraters, unpackMapCraterStamps,
} from './mapCraters.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { CRATER_DEFORM_MIN_RADIUS_M } from '../sim/munitionBlast.ts';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { readCollisionManifest } from '../../server/collisionManifestFormat.ts';
import { decodeCollisionManifest, encodeCollisionManifest } from '../../server/collisionManifestCodec.ts';
import { createAuthoritativeMatch, prepareAuthorityGround } from '../sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// ---- the law
{
  const ground = { getGroundType: (x) => (x > 200 ? 'hard' : 'medium'), getWaterMaskAt: (x) => (x < -200 ? 1 : 0) };
  const box = (x0, z0, x1, z1, extra = {}) => ({ min: [x0, 0, z0], max: [x1, 2, z1], ...extra });
  const records = [box(48, -1, 50, 1), box(98, -1, 100, 1, { treeIdx: 3 })];
  const sites = [
    10.123456, 20.987654, 6.2, 0.4, //  0: open ground: a bowl
    44, 0, 6, 0.3, //                    1: its bowl (R 4.2, reach 4.41) would reach the record at x 48: a mark
    100, 0, 6, 0.3, //                   2: only a tree in reach: a bowl
    250, 0, 6, 0.3, //                   3: hard ground: a mark
    -250, 0, 6, 0.3, //                  4: water: a mark
    0, 100, 2.1, 0.3, //                 5: R 1.47 < the dig radius: a mark
  ];
  const stamps = mapCraterStamps(sites, records, ground);
  assert.equal(stamps.length, 6);
  const [a] = stamps;
  assert.deepEqual([a.x, a.z], [10.12, 20.99], 'centimetre centres');
  assert.equal(a.radiusM, Math.round(6.2 * MAP_CRATER_RIM_RING * 100) / 100, 'the rim crest on the disc\'s 0.7 ring');
  assert.equal(a.depthM, Math.round(a.radiusM * MAP_CRATER_DEPTH_PER_RADIUS * 1000) / 1000, 'a weathered depth');
  assert.equal(a.rimM, 0.4);
  assert.equal(a.seed, mapCraterSeed(10.12, 20.99));
  assert.deepEqual(stamps.map((s) => s.deforms), [true, false, true, false, false, false]);
  assert.ok(stamps[5].radiusM < CRATER_DEFORM_MIN_RADIUS_M);
  // the decision is a set test: the records in another order decide the same
  assert.deepEqual(mapCraterStamps(sites, [...records].reverse(), ground), stamps, 'order-free');
  // the cap: past MAP_CRATER_MAX bowls, marks
  const many = [];
  for (let i = 0; i < MAP_CRATER_MAX + 5; i++) many.push(-400 + (i % 40) * 20, -300 + Math.floor(i / 40) * 20, 6, 0.3);
  const capped = mapCraterStamps(many, [], null);
  assert.equal(capped.filter((s) => s.deforms).length, MAP_CRATER_MAX);
  // the shard's form round-trips, seeds re-derived
  assert.deepEqual(unpackMapCraterStamps(packMapCraterStamps(stamps)), stamps, 'pack / unpack');
  assert.deepEqual(quantizeMapCraterSite(1.234567, -2.345678, 3.456, 0.45678), [1.23, -2.35, 3.46, 0.457]);

  // laying: bowls into the ground (a full bucket refuses one), remembered for the presentation until a reset
  const overlay = createTerrainDeformation();
  assert.equal(stampMapCraters(overlay, stamps), 2);
  assert.ok(overlay.offsetAt(10.12, 20.99) < -0.5, 'the bowl is dug');
  assert.equal(overlay.offsetAt(250, 0), 0, 'a mark digs nothing');
  const laid = mapCratersOn(overlay);
  assert.ok(laid && laid.stamps === stamps && laid.dug[0] === 1 && laid.dug[1] === 0);
  overlay.reset();
  assert.equal(mapCratersOn(overlay), null, 'a reset clears them for the presentation too');
  stampMapCraters(overlay, stamps);
  assert.ok(mapCratersOn(overlay).epoch > laid.epoch, 'laid anew: a new epoch');
}

// ---- the shard carries the decided stamps; the headless world hands them out; the codec keeps them
{
  const rows = [[10.12, 20.99, 4.34, 1.215, 0.4, 1], [44, 0, 4.2, 1.176, 0.3, 0]];
  const manifest = readCollisionManifest({ obstacles: [], colliders: [], concealers: [], craters: rows });
  assert.deepEqual(manifest.craters, rows);
  assert.throws(() => readCollisionManifest({ obstacles: [], colliders: [], craters: [[1, 2, 3]] }), /craters are invalid/);
  assert.throws(() => readCollisionManifest({ obstacles: [], colliders: [], craters: [[1, 2, 3, 4, 5, 2]] }), /craters are invalid/);
  assert.deepEqual(decodeCollisionManifest(encodeCollisionManifest(manifest)).craters, rows, 'the codec keeps them');
  assert.equal(readCollisionManifest({ obstacles: [], colliders: [] }).craters, undefined, 'an older shard has none');
  const flat = { maxY: 0, getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new Vector3(0, 1, 0) };
  const world = createHeadlessCollisionWorld({ mapId: 'flat', heightField: flat, manifest });
  assert.deepEqual(world.getMapCraters(), unpackMapCraterStamps(rows));
  assert.deepEqual(mapCraterStampsOf(world), world.getMapCraters());
  assert.deepEqual(mapCraterStampsOf(null), []);
}

// ---- every match lays them first: the authority (fresh and prepared) on a shard's world
{
  const real = createDedicatedWorldCollision('verdant', { retain: true });
  const stamps = real.getMapCraters();
  if (stamps.some((s) => s.deforms)) {
    const bowl = stamps.find((s) => s.deforms);
    const down = new Vector3(0, -1, 0);
    const base = real.heightField.getHeightAtFast(bowl.x, bowl.z);
    const players = [{ id: 'a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -150, z: -150, yaw: 0 } },
      { id: 'b', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 150, z: 200, yaw: Math.PI } }];
    createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: real, players });
    const fresh = real.raycast(new Vector3(bowl.x, base + 6, bowl.z), down, 20);
    assert.ok(fresh && fresh.point.y < base - 0.3, `the authority's ground holds the map's bowl (${(fresh?.point.y - base).toFixed(2)} m)`);
    prepareAuthorityGround(real);
    createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: real, players });
    const prepared = real.raycast(new Vector3(bowl.x, base + 6, bowl.z), down, 20);
    assert.ok(Math.abs(prepared.point.y - fresh.point.y) < 1e-9, 'a standby host\'s prepared ground lays the same bowl');
  } else {
    console.log('mapCraters selftest: the verdant shard carries no bowls yet (captured before DST-04): the authority half skipped');
  }
  real.release();
}

// ---- the seams, read from source: props records sites (no flat disc), every match lays them first
{
  const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const props = src('./props.ts');
  assert.match(props, /mapCraterSites\.push\(x, z, r, rim\);/, 'props records each crater scar as a site');
  assert.ok(!/craterDiscs\.push\(conformedDisc\(x, z, r, \[0\.03, 0\.02, rim, 0\.02\]\)\)/.test(props), 'no flat crater disc');
  assert.match(src('./map.ts'), /const mapCraters = mapCraterStamps\(props\.mapCraterSites, obstacles, heightField\);/,
    'the world decides them on its own records');
  assert.match(src('../game/state.ts'), /ground\.overlay\.reset\(\);\s*\/\/[^\n]*\n\s*stampMapCraters\(ground\.overlay, mapCraterStampsOf\(world\)\);/,
    'solo: laid first, every battle');
  const authority = src('../sim/authoritativeMatch.ts');
  assert.match(authority, /const ground = preparedGround\?\.ground \?\? freshMatchGround\(worldCollision\);/, 'authority: a fresh match');
  assert.match(authority, /const ground = freshMatchGround\(worldCollision\);\s*const heightField = createDeformedHeightField\(base, ground\);/,
    'authority: a standby host\'s prepared ground');
  assert.match(src('../mp/presentation/destructionMirror.ts'), /const ground = createTerrainDeformation\(\);\s*\/\/[^\n]*\n\s*stampMapCraters\(ground,/,
    'a seat\'s mirror: laid first');
  assert.match(src('../game/studio.ts'), /stampMapCraters\(studioGround, mapCraterStampsOf\(w\)\);/, 'the Studio: every scene');
  assert.match(src('../fx/effects.ts'), /mapCratersOn\(/, 'the presentation lays their surfaces from the bound ground');
}

console.log('mapCraters selftest: PASS — sites to stamps (bowls clear of every record but trees; hard, wet and small sites marks; the cap), the shard round trip, laid first by every match');
