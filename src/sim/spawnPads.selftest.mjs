import assert from 'node:assert/strict';
import {
  ALLY_PAD_SLOTS, SPAWN_PAD_REUSE_OFFSETS, allyPadSlot, allySpawnPoint, reuseSpawnPad, spawnPadReuseOffset,
} from './spawnPads.ts';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { createLayout } from '../world/terrain.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { BATTLE_FIELD_LIMIT } from './matchRuleset.ts';

// Sides (owner 2026-09-18: 7v7 / 14v14 / custom "1 v 20"): a side larger than its pads seats without stacking —
// the authored 7v7 wedge stays, further allied bots take lateral / forward slots (the southern-spawn maps have no
// room behind the player pad), re-used enemy pads step onto a compact ring, and every seat of a full field stays
// inside the playable extent on every map.
assert.deepEqual(ALLY_PAD_SLOTS.slice(0, 6).map((slot) => [...slot]),
  [[26, 0], [-26, 0], [52, 8], [-52, 8], [20, 30], [-20, 30]], 'the 7v7 wedge is the first six slots, unchanged');
const allySlots = Array.from({ length: 60 }, (_, index) => allyPadSlot(index));
for (let i = 0; i < allySlots.length; i++) {
  const [lat, back] = allySlots[i];
  assert.ok(Math.abs(lat) <= 80 && back <= 30, `ally slot ${i} (${lat}, ${back}) stays within the lateral room and never behind the wedge`);
  assert.ok(Math.hypot(lat, back) >= 12, `ally slot ${i} clears the player pad`);
  for (let j = i + 1; j < allySlots.length; j++) {
    assert.ok(Math.hypot(lat - allySlots[j][0], back - allySlots[j][1]) >= 12, `ally slots ${i} and ${j} sit 12 m apart`);
  }
}
const rings = Array.from({ length: 16 }, (_, reuse) => spawnPadReuseOffset(reuse));
assert.deepEqual([...rings[0]], [0, 0], 'ring 0 is the pad itself');
assert.equal(SPAWN_PAD_REUSE_OFFSETS.length, 9, 'nine table rings seat 63 hostiles on seven pads');
for (let i = 0; i < rings.length; i++) {
  const [right, back] = rings[i];
  if (i < SPAWN_PAD_REUSE_OFFSETS.length) {
    assert.ok(Math.abs(right) <= 13, `ring ${i} keeps 13 m of lateral reach (pads sit 39 m apart on the tightest map)`);
  }
  assert.ok(back <= 16, `ring ${i} never steps more than 16 m behind the pad (coastal / ruinspires / reservoir room)`);
  for (let j = i + 1; j < rings.length; j++) {
    assert.ok(Math.hypot(right - rings[j][0], back - rings[j][1]) >= 12, `rings ${i} and ${j} sit 12 m apart`);
  }
}
// frames: a pad facing -z (toward a southern player) steps to +z when re-used; the player's right is +x at yaw 0
const pad = { x: 100, z: 300, yaw: Math.PI };
assert.equal(reuseSpawnPad(pad, 0), pad, 'the first use is the pad object itself');
const stepped = reuseSpawnPad(pad, 1);
assert.ok(Math.abs(stepped.x - 100) < 1e-9 && Math.abs(stepped.z - 312) < 1e-9 && stepped.yaw === Math.PI,
  `a re-used pad steps away from the opposing side (${stepped.x.toFixed(2)}, ${stepped.z.toFixed(2)})`);
const player = { x: 0, z: -300, yaw: 0 };
const first = allySpawnPoint(player, 0);
assert.deepEqual([first.x, first.z, first.yaw], [26, -300, 0], 'the first allied slot is 26 m to the player\'s right');
const forward = allySpawnPoint(player, 14);
assert.ok(Math.abs(forward.x - 14) < 1e-9 && Math.abs(forward.z - -288) < 1e-9, 'the forward rank sits 12 m ahead of the player');
// every map: a full field (BATTLE_FIELD_LIMIT − 1 allied bots, or as many hostiles) keeps every seat inside the playable extent
const seats = BATTLE_FIELD_LIMIT - 1;
let checked = 0;
for (const mapId of MAP_IDS) {
  const { spawns } = createLayout(getMapConfig(mapId));
  const inside = (point, what) => assert.ok(Math.abs(point.x) <= PLAYABLE_HALF_EXTENT_M - 2 && Math.abs(point.z) <= PLAYABLE_HALF_EXTENT_M - 2,
    `${mapId}: ${what} (${point.x.toFixed(0)}, ${point.z.toFixed(0)}) stays inside the playable extent`);
  for (let index = 0; index < seats; index++) inside(allySpawnPoint(spawns.player, index), `allied slot ${index}`);
  for (let index = 0; index < seats; index++) {
    const base = spawns.enemies[index % spawns.enemies.length];
    inside(reuseSpawnPad({ x: base.x, z: base.z, yaw: base.yaw ?? Math.PI }, Math.floor(index / spawns.enemies.length)), `hostile seat ${index}`);
  }
  checked++;
}
console.log(`spawnPads: 60 allied slots and 16 pad rings 12 m apart; a ${BATTLE_FIELD_LIMIT}-vehicle field seats inside the playable extent on ${checked} maps PASS`);
