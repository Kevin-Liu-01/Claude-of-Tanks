// Receipt of the arched bridge's collision record (round 63, 2026-09-24; round 61's open item "a shell fired through
// an arch opening hits the body"): Amberford's record is a compound whose parts follow the kit's geometry — the deck
// from the crown line up (1.0 m: over the 0.9 m standable height, so a hull on the deck mounts it and is never pushed
// by its sides), the abutments and piers from the footing to the crown line, each vault as 0.3 m haunch bands
// reaching from the pier faces to the arc at the band's middle height, the parapets last — so a shell along the river
// passes through every arch up to the vault and hits the piers, the deck and the parapets; a hull low enough for the
// vault passes under the deck and a taller one is pushed by it; the structure support keeps the deck as the floor;
// and the committed dedicated shard carries the same parts (a stale shard would give the server the round-61 wall).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { dressMapExtras } from './mapKits.ts';
import { getMapConfig } from './index.ts';
import { HULL_STANDABLE_HEIGHT_M, hullPassesObstacleTop, pushHullFromObstacle, rayCollisionRecord } from '../collision.ts';
import { structureTopAt } from '../../sim/structureSupport.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const cfg = getMapConfig('autumn'), field = createHeightField(1337, cfg);
const buckets = Object.fromEntries(names.map((name) => [name, []])), obstacles = [], colliders = [];
dressMapExtras({ mapId: 'autumn', extraKits: cfg.props?.extraKits, riverLandings: cfg.props?.riverLandings, L: field._layout,
  heightField: field, rng: mulberry32(1337 ^ 0x5a17), buckets, obstacles, colliders });
for (const list of Object.values(buckets)) for (const g of list) g.dispose();
const bridges = obstacles.filter((record) => record.kind === 'bridge');
assert.equal(bridges.length, 1); assert.equal(colliders.filter((record) => record.kind === 'bridge').length, 1);
const [record] = bridges, deck = field.bridgeDecks[0];
const { x: cx, z: cz, ux, uz, halfLength, halfWidth, deckY, bedY, waterY } = deck;
const vx = -uz, vz = ux;
// the kit's arch arithmetic (mapKits.ts addArchedStoneBridge)
const bodyHalf = halfLength + 1, bottom = bedY - 0.6, top = deckY - 0.45, crownY = top - 0.55, springY = waterY + 0.3;
const wetSpan = Math.max(4, (halfLength - 3) * 2), arches = Math.max(1, Math.round(wetSpan / 11)), chord = (wetSpan - (arches - 1) * 2) / arches;
const rise = Math.max(0.4, Math.min(chord * 0.32, crownY - springY)), radius = (chord * chord / 4 + rise * rise) / (2 * rise), centreY = springY + rise - radius;
assert.equal(arches, 3, 'three arches over the narrows'); near(rise, 1.1, 1e-9, 'the rise the spandrel leaves');
const archX = (i) => -wetSpan / 2 + chord / 2 + i * (chord + 2);
const along = (offset) => [cx + ux * offset, cz + uz * offset];

// ------------------------------------------------------------------ the parts
const parts = record.shape2.parts;
const bands = Math.ceil((crownY - springY) / 0.3);
assert.equal(bands, 4); assert.equal(parts.length, 1 + 2 + (arches - 1) + arches * bands * 2 + 2, 'deck, abutments, piers, vault bands, parapets');
const [deckPart, abutmentA, abutmentB, ...rest] = parts, piers = rest.slice(0, arches - 1), haunches = rest.slice(arches - 1, rest.length - 2), parapets = rest.slice(-2);
near(deckPart.y0, crownY, 1e-9, 'the deck part starts at the crown line'); assert.equal(deckPart.y1, deckY);
assert.ok(deckPart.y1 - deckPart.y0 >= HULL_STANDABLE_HEIGHT_M + 0.05, 'the deck part is a standable floor with margin');
assert.equal(hullPassesObstacleTop(deckY, deckPart.y1, deckPart.y0), true, 'a hull on the deck mounts the deck part');
assert.equal(hullPassesObstacleTop(deckY - 0.6, deckPart.y1, deckPart.y0), false, 'a hull well below the deck is pushed by it');
assert.deepEqual([deckPart.hw, deckPart.hl], [halfWidth, bodyHalf], 'the deck spans the road and the abutments');
for (const abutment of [abutmentA, abutmentB]) {
  assert.equal(abutment.y0, bottom); near(abutment.y1, crownY, 1e-9, 'abutments footed below the bed up to the crown line');
  near(abutment.hl, (bodyHalf - wetSpan / 2) / 2, 1e-9, 'an abutment fills the body past the wet span'); assert.equal(abutment.hw, halfWidth);
}
for (let i = 0; i < piers.length; i++) {
  const pier = piers[i], [px, pz] = along(-wetSpan / 2 + (i + 1) * chord + i * 2 + 1);
  near(pier.cx, px, 1e-9, `pier ${i} between the arches`); near(pier.cz, pz, 1e-9, 'pier centre');
  assert.equal(pier.hl, 1); assert.equal(pier.y0, bottom); near(pier.y1, crownY, 1e-9, 'a pier to the crown line');
}
assert.equal(haunches.length, arches * bands * 2);
for (let i = 0; i < arches; i++) for (let band = 0; band < bands; band++) {
  const y0 = springY + (crownY - springY) * band / bands, y1 = springY + (crownY - springY) * (band + 1) / bands;
  const dy = (y0 + y1) / 2 - centreY, opening = Math.sqrt(radius * radius - dy * dy);
  const [left, right] = haunches.slice((i * bands + band) * 2, (i * bands + band) * 2 + 2);
  for (const haunch of [left, right]) {
    near(haunch.y0, y0, 1e-9, 'band bottom'); near(haunch.y1, y1, 1e-9, 'band top'); assert.equal(haunch.hw, halfWidth);
    near(haunch.hl, (chord / 2 - opening) / 2, 1e-9, 'a haunch reaches from the pier face to the arc at the band middle');
  }
  const [lx, lz] = along(archX(i) - chord / 2 + left.hl), [rx, rz] = along(archX(i) + chord / 2 - right.hl);
  near(left.cx, lx, 1e-9, 'left haunch'); near(left.cz, lz, 1e-9, 'left haunch'); near(right.cx, rx, 1e-9, 'right haunch'); near(right.cz, rz, 1e-9, 'right haunch');
  if (band === 0) assert.ok(opening > 0.9 * chord / 2, 'the lowest band is nearly the full chord');
  if (band === bands - 1) assert.ok(opening < 0.45 * chord / 2, 'the crown band is narrow');
}
for (const parapet of parapets) { assert.equal(parapet.y0, deckY); near(parapet.y1, deckY + 1.1, 1e-9, 'parapet height'); assert.equal(parapet.hw, 0.25); }
assert.equal(record.min[1], bottom); near(record.max[1], deckY + 1.1, 1e-9, 'the record spans footing to parapet top');

// ------------------------------------------------------------------ shells through the openings
const normal = new THREE.Vector3();
const trace = (rec, ox, oy, oz, dx, dy, dz, max = 60) => rayCollisionRecord({ x: ox, y: oy, z: oz }, new THREE.Vector3(dx, dy, dz).normalize(), rec, max, normal);
for (let i = 0; i < arches; i++) {
  const [ax, az] = along(archX(i));
  for (const over of [0.15, 0.5, 1.0, 1.3]) assert.equal(trace(record, ax - vx * 30, waterY + over, az - vz * 30, vx, 0, vz), -1, `arch ${i}: a level shot ${over} m over the water passes`);
  for (const over of [1.6, 2.0, 2.6]) assert.ok(trace(record, ax - vx * 30, waterY + over, az - vz * 30, vx, 0, vz) > 0, `arch ${i}: ${over} m over the water hits the deck`);
  const [hx, hz] = along(archX(i) + chord / 2 - 0.6);
  assert.ok(trace(record, hx - vx * 30, waterY + 1.0, hz - vz * 30, vx, 0, vz) > 0, `arch ${i}: 0.6 m from the pier face at 1 m the haunch stands`);
  assert.equal(trace(record, hx - vx * 30, waterY + 0.15, hz - vz * 30, vx, 0, vz), -1, 'and below the spring line the opening is clear to the pier');
}
const [px, pz] = along(-wetSpan / 2 + chord + 1);
assert.ok(trace(record, px - vx * 30, waterY + 0.7, pz - vz * 30, vx, 0, vz) > 0, 'a pier centre stops a shell');
assert.ok(trace(record, cx - vx * 30, deckY - 0.2, cz - vz * 30, vx, 0, vz) > 0, 'the deck stops a shell');
assert.ok(trace(record, cx - vx * 30, deckY + 0.6, cz - vz * 30, vx, 0, vz) > 0, 'a parapet stops a shell');
assert.equal(trace(record, cx - vx * 30, deckY + 1.6, cz - vz * 30, vx, 0, vz), -1, 'over the parapets it flies on');
near(trace(record, cx, deckY + 5, cz, 0, -1, 0, 10), 5, 1e-6, 'a plunging shell meets the deck at the deck plane');
{ const [ax, az] = along(archX(1)); const ox = ax - vx * 45 + ux * 20, oz = az - vz * 45 + uz * 20;
  assert.equal(trace(record, ox, waterY + 0.5, oz, ax - ox, 0, az - oz, 120), -1, 'an oblique shot from the bank passes under the spring line');
  assert.ok(trace(record, ox, waterY + 1.0, oz, ax - ox, 0, az - oz, 120) > 0, 'the same line 1 m over the water meets the vault haunch (the arc is 2.7 m wide there)'); }

// ------------------------------------------------------------------ hulls under, on and beside the span
const push = { x: 0, z: 0 };
const pushed = (x, z, spanTop) => { push.x = 0; push.z = 0; return pushHullFromObstacle({ x, z }, vx, vz, ux, uz, 3.4, 1.7, record, push, bedY, bedY + spanTop); };
{ const [ax, az] = along(archX(1));
  assert.equal(pushed(ax, az, 1.5), false, 'a 1.5 m body under the middle arch passes beneath the vault');
  assert.equal(pushed(ax, az, 2.2), true, 'a 2.2 m body is stopped by the deck part');
  assert.equal(pushed(px, pz, 1.5), true, 'a low hull against a pier is pushed'); }
{ push.x = 0; push.z = 0;
  assert.equal(pushHullFromObstacle({ x: cx, z: cz }, ux, uz, -vx, -vz, 3.4, 1.7, record, push, deckY, deckY + 2.3), false, 'a hull on the deck centre is not pushed');
  push.x = 0; push.z = 0;
  assert.equal(pushHullFromObstacle({ x: cx + vx * (halfWidth - 1.2), z: cz + vz * (halfWidth - 1.2) }, ux, uz, -vx, -vz, 3.4, 1.7, record, push, deckY, deckY + 2.3), true, 'a hull over the parapet line is pushed back'); }
near(structureTopAt([record], 1, cx, cz, deckY + 0.2), deckY, 1e-9, 'the deck is the floor at the centre');
near(structureTopAt([record], 1, ...along(halfLength - 1), deckY + 0.2), deckY, 1e-9, 'and over the abutment');
assert.equal(structureTopAt([record], 1, ...along(archX(1)), bedY + 0.2), -Infinity, 'a hull under the arch has no floor above its belly');

// ------------------------------------------------------------------ the dedicated shard carries the same parts
const world = createDedicatedWorldCollision('autumn');
const shard = world.getObstacles().filter((rec) => rec.kind === 'bridge');
assert.equal(shard.length, 1, 'one bridge record in the committed shard');
assert.equal(shard[0].shape2.parts.length, parts.length, 'the shard carries every part (recapture the shard on this tree if not)');
for (let i = 0; i < parts.length; i++) for (const key of ['cx', 'cz', 'hw', 'hl', 'y0', 'y1']) near(shard[0].shape2.parts[i][key], parts[i][key], 1e-3, `shard part ${i} ${key}`);
{ const [ax, az] = along(archX(1));
  const low = world.raycast(new THREE.Vector3(ax - vx * 30, waterY + 0.5, az - vz * 30), new THREE.Vector3(vx, 0, vz), 60);
  assert.ok(!low || low.record?.kind !== 'bridge', 'the server: a shot through the middle arch is not stopped by the bridge');
  const high = world.raycast(new THREE.Vector3(ax - vx * 30, waterY + 2.0, az - vz * 30), new THREE.Vector3(vx, 0, vz), 60);
  assert.equal(high?.record?.kind, 'bridge', 'the server: the deck stops the high shot'); }
world.release?.();
console.log(`archedBridgeCollision.selftest: ${parts.length} parts (deck ${(deckY - crownY).toFixed(2)} m from the crown line, 2 abutments, ${piers.length} piers, ${haunches.length} vault haunches in ${bands} bands, 2 parapets); shells pass every arch up to 1.3 m over the water and meet the haunches, piers, deck and parapets; a 1.5 m body passes under the middle arch, a 2.2 m body is stopped; the deck is the floor; the committed shard matches`);
