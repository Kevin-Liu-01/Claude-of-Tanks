// crushRecords.selftest.mjs — one crush transition for a destructible's collision records (2026-11-02 audit M9).
//
// A broken prop's cover opens through collision.ts setCrushedRecords in both worlds: the page world (props.ts
// breakRecord, crushableClutter.ts) and the headless authority's world (headlessCollisionWorld.ts crushObstacle). The
// page world used to set a shell record's `dead` only and the headless world `crushed` and `dead`; and in solo only
// presentation code (breakRecord) wrote the collider's flag, with the rule that cosmetic paths never open cover held by
// each caller's own skip. Here:
//   - the transition: movement records ghost (`crushed`), shell records ghost and out of the casts; restored, all stand;
//   - the headless world crushes every record of the prop (a clutter's several) through it;
//   - props.ts routes every write through it, refuses a cosmetic break of cover inside breakRecord, and refuses a loose
//     physics kind with cover records at build (the page world's behaviour is pinned on the production runtime in
//     destructibleAuthority.selftest: the guard, and the page and headless flags record for record).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { setCrushedRecords } from './collision.ts';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';

// ---- the transition
const ob = { min: [0, 0, 0], max: [1, 1, 1], crushable: true, crushed: false, propIdx: 4 };
const col = { ...ob, min: [...ob.min], max: [...ob.max], dead: false };
setCrushedRecords([ob], [col], true);
assert.deepEqual([ob.crushed, ob.dead, col.crushed, col.dead], [true, undefined, true, true], 'crushed: the obstacle ghost, the collider ghost and dead');
setCrushedRecords([ob], [col], false);
assert.deepEqual([ob.crushed, col.crushed, col.dead], [false, false, false], 'restored: every record stands');
const trunk = { min: [0, 0, 0], max: [1, 5, 1], crushable: true, treeIdx: 2 };
setCrushedRecords([trunk], [trunk], true);
assert.deepEqual([trunk.crushed, trunk.dead], [true, true], 'a record in both lists (a page world trunk) ends ghost and dead');

// ---- the headless world: every record of the prop, a clutter's several, through the same transition
const { packCollisionRecord } = await import('../../tools/headlessWorldCollision.mjs');
const rec = (x, p) => ({ min: [x, 0, 0], max: [x + 1, 1, 1], crushable: true, crushed: false, kind: 'rubble', propIdx: p });
const world = createHeadlessCollisionWorld({ mapId: 'crush-records', heightField: { getHeightAt: () => 0, getNormalAt: () => new Vector3(0, 1, 0) },
  manifest: { obstacles: [rec(0, 7), rec(2, 7), rec(5, 8)].map(packCollisionRecord), colliders: [rec(0, 7), rec(2, 7)].map(packCollisionRecord), concealers: [] } });
assert.ok(world.crushObstacle(world.getObstacles()[0]), 'the authority crushes the clutter');
assert.deepEqual(world.getObstacles().map((r) => !!r.crushed), [true, true, false], 'both of its movement records ghost, the next prop stands');
assert.deepEqual(world.getColliders().map((r) => [!!r.crushed, !!r.dead]), [[true, true], [true, true]], 'both of its shell records ghost and dead');
assert.equal(world.crushObstacle(world.getObstacles()[1]), false, 'a crushed prop crushes once');

// ---- props.ts: every flag write through the transition; the cosmetic guard inside breakRecord; the build guard
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const runtime = props.slice(props.indexOf('  const D_CELL = 8;'), props.indexOf('\n  return { group, obstacles, colliders,'));
assert.ok(!/\brec\.(ob|col)\.(crushed|dead) = /.test(runtime), 'the props runtime writes no cover flag by hand');
assert.match(runtime, /if \(!authority && \(rec\.ob \|\| rec\.col\)\) \{/, 'breakRecord refuses a cosmetic break of cover');
assert.match(runtime, /return breakRecord\(propIdx, dx, dz, speed, cause, settled, true\);/, 'only the crushObstacle seam is the authority');
assert.match(props, /if \(meta\.cls === 'physics'\) throw new Error\(`world\/props: \$\{record\.kind\} is a loose physics kind with cover records/,
  'a loose physics kind with cover records is refused at build');
const clutter = readFileSync(new URL('./crushableClutter.ts', import.meta.url), 'utf8');
assert.match(clutter, /setCrushedRecords\(this\.obstacles, this\.colliders, crushed\);/, 'the clutter crushes its records through the transition');

console.log('crushRecords.selftest: one crush transition in both worlds, the cosmetic guard and the build guard in place');
