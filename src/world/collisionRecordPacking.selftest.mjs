// A solo battle collides on the records the server does (276, sim-world-packed; Main's ruling (B), 2026-11-22). The page
// built its world collision at full precision while the dedicated server and every Node replay inflate the shards (the
// same records packed to 1/10000 m): a five-minute Verdant battle recorded on the page and verified in Node on the shard
// drifted at step 1200. world/map.ts now rounds its records in place with the shards' own packer
// (world/collisionRecordPacking.ts quantizeWorldCollision). Here, on real builds of two maps:
// - every page record's geometry and crush law is, number for number (Object.is), what the server unpacks from its
//   packed form, and every concealer's numbers the packed ones;
// - the rounding is idempotent: the rounded build packs to exactly the shard data the unrounded build packs to, so the
//   capture (which packs the page's world) and the committed shards do not move;
// - it keeps each record object, so every grid, index and runtime flag built on it holds;
// - and world/map.ts calls it on the assembled lists before its grids.
// Builds two maps: MANUAL suite 'world' (tools/selftest-tiers.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';
import { packCollisionRecord, quantizeWorldCollision, unpackCollisionRecord } from './collisionRecordPacking.ts';

const MAPS = ['verdant', 'urban'];
const sameNumber = (a, b) => Object.is(a, b);
function sameShape(a, b, where) {
  if (!a || !b) { assert.equal(a ?? null, b ?? null, `${where}: shape presence`); return; }
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${where}: shape keys`);
  for (const key of Object.keys(b)) {
    if (key === 'parts') { a.parts.forEach((part, i) => sameShape(part, b.parts[i], `${where}.parts[${i}]`)); continue; }
    if (key === 'kind') { assert.equal(a.kind, b.kind, `${where}: kind`); continue; }
    const x = a[key], y = b[key];
    if (typeof y === 'number') assert.ok(sameNumber(x, y), `${where}.${key}: ${x} vs the server's ${y}`);
    else {
      assert.equal(x.length, y.length, `${where}.${key}: length`);
      for (let i = 0; i < y.length; i++) assert.ok(sameNumber(x[i], y[i]), `${where}.${key}[${i}]: ${x[i]} vs the server's ${y[i]}`);
    }
  }
}

let records = 0, concealers = 0;
for (const mapId of MAPS) {
  const unrounded = await buildWorldCollisionData(mapId);
  let built = null;
  const rounded = await buildWorldCollisionData(mapId, { inspect: ({ flora, dressing }) => {
    const obstacles = [...dressing.obstacles, ...flora.treeObstacles], colliders = [...dressing.colliders, ...flora.treeObstacles];
    const discs = flora.concealers || [];
    const objects = [...obstacles, ...colliders];
    // the packed form of each record before it is rounded: what the shard holds for it
    const shard = new Map(objects.map((record) => [record, unpackCollisionRecord(packCollisionRecord(record))]));
    const packedDiscs = discs.map((d) => [d.x, d.z, d.r, d.add].map((v) => Math.round(v * 10000) / 10000));
    quantizeWorldCollision(obstacles, colliders, discs);
    built = { objects, shard, discs, packedDiscs, obstacles, colliders };
  } });
  // idempotent: the rounded world packs to the very shard data the unrounded one does (the capture packs the page's world)
  assert.deepEqual(rounded, unrounded, `${mapId}: the rounded records pack to the shard's data`);
  // the page's records are the server's, number for number, and the same objects
  for (const [index, record] of built.objects.entries()) {
    const server = built.shard.get(record), where = `${mapId} record ${index} (${record.kind ?? 'untyped'})`;
    for (const key of ['min', 'max']) for (let i = 0; i < 3; i++) assert.ok(sameNumber(record[key][i], server[key][i]), `${where}.${key}[${i}]: ${record[key][i]} vs the server's ${server[key][i]}`);
    sameShape(record.shape2, server.shape2, `${where}.shape2`);
    for (const key of ['crushMin', 'crushKeep']) if (server[key] != null) assert.ok(sameNumber(record[key], server[key]), `${where}.${key}`);
    records++;
  }
  built.discs.forEach((disc, i) => assert.deepEqual([disc.x, disc.z, disc.r, disc.add], built.packedDiscs[i], `${mapId} concealer ${i}`));
  concealers += built.discs.length;
  // a tree stands in both lists as one object, rounded once (idempotence makes twice harmless, but it is one record)
  assert.ok(built.colliders.some((record) => built.obstacles.includes(record)), `${mapId}: the trees are shared records`);
}

// the packer, self-contained (the capture page evaluates its source): it names nothing outside itself
{
  const source = packCollisionRecord.toString();
  const code = source.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(?:detMath|convexOutlineInPlace|unpackCollisionRecord|import)\b/, 'the packer imports and closes over nothing');
  const evaluated = new Function(`return ${source}`)();
  const record = { min: [0.123456, 0, -1.000049], max: [2.5, 3.33333, 1], shape2: { kind: 'obb', cx: 1.23456789, cz: 0, hw: 1, hl: 2, yaw: 0.7853981 }, crushable: true, kind: 'crate', propIdx: 4 };
  assert.deepEqual(evaluated(record), packCollisionRecord(record), 'its source evaluated alone packs as the module does');
}
// world/map.ts rounds the assembled lists before it builds a grid on them
{
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const call = map.indexOf('quantizeWorldCollision(obstacles, colliders, vegetation.concealers');
  assert.ok(call > 0, 'world/map.ts rounds its records');
  assert.ok(call < map.indexOf('createObstacleGrid(obstacles)') && call < map.indexOf('createObstacleGrid(colliders)'), 'before its grids');
  assert.ok(call > map.indexOf('mapCraterStamps(props.mapCraterSites, obstacles, heightField)'), 'after the craters, decided as the capture decides them');
}

console.log(`collisionRecordPacking.selftest: ${MAPS.join(', ')}: ${records} page records and ${concealers} concealers are the server's to the bit, `
  + 'and pack to the same shard data; the packer stands alone; world/map.ts rounds before its grids');
