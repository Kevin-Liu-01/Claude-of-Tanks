// Symmetric deployments (modes lane, 2026-10-08; sim/deployment.ts through sim/matchPlacement.ts): on every map both
// sides deploy in the same formation, each bravo slot the 180-degree rotation of its alpha slot about the anchors'
// midpoint — after every validity move — and every slot stands where any vehicle of the fleet can be seated as is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { collisionFootprintContainsPoint } from '../world/collision.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import {
  createMatchPlacement, deploymentClearings, deploymentGroundSafe, matchPlacementAnchors, placementTankRadius,
  placementTerrainSafe, terrainDeployment,
} from './matchPlacement.ts';
import {
  createDeployment, deploymentFrame, DEPLOYMENT_CLEARED_SLOTS, DEPLOYMENT_LATTICE_M, DEPLOYMENT_SLOT_RADIUS_M,
  DEPLOYMENT_SLOT_SPACING_M, nominalBravoSlot, resolveSlotPair, rotateAboutPivot,
} from './deployment.ts';

const SLOT = { radius: DEPLOYMENT_SLOT_RADIUS_M, relief: 2, normalY: 0.9, halfExtent: PLAYABLE_HALF_EXTENT_M };
const r1 = (value) => Math.round(value * 10) / 10;

// ---- the slot disc holds the whole fleet; the spacing seats any two vehicles side by side without a move
const radii = ALL_TANK_IDS.map((id) => placementTankRadius(getSpec(id)));
const largest = Math.max(...radii), smallest = Math.min(...radii);
assert.ok(largest <= DEPLOYMENT_SLOT_RADIUS_M, `the fleet's largest placement radius ${largest.toFixed(2)} m fits the slot`);
assert.equal(DEPLOYMENT_SLOT_SPACING_M, 2 * DEPLOYMENT_SLOT_RADIUS_M + 3, 'two slot radii and the placement gap');
const bigSpec = ALL_TANK_IDS[radii.indexOf(largest)], smallSpec = ALL_TANK_IDS[radii.indexOf(smallest)];

// ---- the pure geometry: an authored arc and a compact block
const arcPads = [
  { x: 40, z: 400 }, { x: -30, z: 380 }, { x: 110, z: 380 }, { x: -100, z: 420 }, { x: 180, z: 420 }, { x: 10, z: 440 }, { x: 70, z: 440 },
];
const arc = deploymentFrame({ player: { x: -100, z: -400 }, enemies: arcPads });
assert.equal(arc.kind, 'arc');
const padCentroid = { x: arcPads.reduce((s, p) => s + p.x, 0) / 7, z: arcPads.reduce((s, p) => s + p.z, 0) / 7 };
assert.ok(Math.hypot(arc.pivot.x - (-100 + padCentroid.x) / 2, arc.pivot.z - (-400 + padCentroid.z) / 2) < 1e-9,
  'the pivot is the anchors\' midpoint (the player pad and the enemy pads\' centroid)');
assert.equal(arc.base.length, 7);
assert.ok(arc.base.every((slot) => Number.isFinite(slot.yaw)));
const lateral = (slot) => (slot.x - arc.anchors.bravo.x) * arc.forward.z - (slot.z - arc.anchors.bravo.z) * arc.forward.x;
for (let k = 1; k < 7; k++) assert.ok(Math.abs(lateral(arc.base[k - 1])) <= Math.abs(lateral(arc.base[k])) + 1e-9, 'slot order: most central first');
for (const slot of arc.base) {
  const back = rotateAboutPivot(arc.pivot, rotateAboutPivot(arc.pivot, slot));
  assert.ok(Math.hypot(back.x - slot.x, back.z - slot.z) < 1e-9 && Math.abs(Math.cos(back.yaw - slot.yaw) - 1) < 1e-12, 'the rotation is an involution');
}
const extra = nominalBravoSlot(arc, 7), from = arc.base[0];
assert.ok(Math.abs(Math.hypot(extra.x - from.x, extra.z - from.z) - DEPLOYMENT_SLOT_SPACING_M) < 1e-9, 'slot 7 stands one spacing behind slot 0');
const block = deploymentFrame({ player: { x: 0, z: -400 }, enemies: [
  { x: 12, z: 395 }, { x: 4, z: 395 }, { x: -4, z: 395 }, { x: -12, z: 395 }, { x: 8, z: 405 }, { x: 0, z: 405 }, { x: -8, z: 405 },
] });
assert.equal(block.kind, 'block', 'compact pads keep the block');
for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
  assert.ok(Math.hypot(block.base[i].x - block.base[j].x, block.base[i].z - block.base[j].z) >= DEPLOYMENT_SLOT_SPACING_M - 1e-6, 'block slots are a spacing apart');
}
for (const slot of block.base) assert.ok(Math.abs(Math.sin(slot.yaw - Math.atan2(block.anchors.alpha.x - slot.x, block.anchors.alpha.z - slot.z))) < 0.2, 'bravo\'s block faces alpha');

// ---- the joint move: a slot invalid on one side moves both sides by rotated displacements; no common move = asymmetric
const pair = { alpha: rotateAboutPivot(arc.pivot, arc.base[0]), bravo: arc.base[0] };
const hole = (team, point) => team !== 'alpha' || Math.hypot(point.x - pair.alpha.x, point.z - pair.alpha.z) > 9;
const moved = resolveSlotPair(pair.alpha, pair.bravo, hole, { alpha: [], bravo: [] });
assert.ok(moved.symmetric && moved.moveM > 9 && moved.moveM < 14, `a 9 m hole on alpha's side moves the pair ${r1(moved.moveM)} m`);
assert.ok(Math.hypot(moved.alpha.x + moved.bravo.x - 2 * arc.pivot.x, moved.alpha.z + moved.bravo.z - 2 * arc.pivot.z) < 1e-9, 'the moved pair is still a rotation');
assert.ok(Math.abs(moved.alpha.x / DEPLOYMENT_LATTICE_M - Math.round(moved.alpha.x / DEPLOYMENT_LATTICE_M)) < 1e-9, 'a moved slot stands on the lattice');
// alpha needs dx > 30, bravo (moved by -d) needs -dx > 30: no displacement serves both
const lonely = resolveSlotPair(pair.alpha, pair.bravo, (team, point) => team === 'alpha' ? point.x > pair.alpha.x + 30 : point.x > pair.bravo.x + 30, { alpha: [], bravo: [] });
assert.equal(lonely.symmetric, false, 'no common displacement: each side searches alone and says so');
assert.ok(lonely.alpha.x > pair.alpha.x + 30 && lonely.bravo.x > pair.bravo.x + 30, 'each side still finds its own valid ground');
const lazy = createDeployment(arc, () => true);
assert.deepEqual(lazy.slots('bravo', 3).map((slot) => [slot.x, slot.z]), arc.base.slice(0, 3).map((slot) => [slot.x, slot.z]), 'valid nominal slots stand as authored');

// ---- the authority's nominal policy IS the deployment: one code path (the solo sim: src/game/deploymentParity.selftest.mjs)
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
assert.match(authority, /const slot = placement\.deploymentSlot\(team, index\);/, 'spawnFor reads the placement\'s deployment slot');
assert.doesNotMatch(authority, /spawns\.enemies\[|layout\.spawns\.player\.formation|reuseSpawnPad/, 'no second spawn policy in the authority');

// ---- every map: symmetric after the moves, clear of the world, seated as is
const report = [];
let worstRotation = 0, worstNearest = 0;
for (const mapId of MAP_IDS) {
  const world = createDedicatedWorldCollision(mapId);
  const field = world.heightField, spawns = field._layout.spawns;
  const placement = createMatchPlacement({ mapId, heightField: field, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
    anchors: matchPlacementAnchors(spawns), mode: 'standard' });
  const deployment = placement.deployment(), ground = terrainDeployment(field, spawns), frame = deployment.frame;
  assert.deepEqual([frame.anchors.alpha.x, frame.anchors.alpha.z], [placement.anchors.alpha.x, placement.anchors.alpha.z], `${mapId}: one anchor law`);
  assert.ok(Math.hypot(frame.anchors.bravo.x - placement.anchors.bravo.x, frame.anchors.bravo.z - placement.anchors.bravo.z) < 1e-9, `${mapId}: bravo anchor`);
  const moves = [];
  for (let k = 0; k < DEPLOYMENT_CLEARED_SLOTS; k++) {
    const pairK = deployment.pair(k), a = pairK.alpha, b = pairK.bravo;
    const rotation = Math.hypot(a.x + b.x - 2 * frame.pivot.x, a.z + b.z - 2 * frame.pivot.z);
    worstRotation = Math.max(worstRotation, rotation);
    assert.ok(pairK.symmetric && rotation <= 0.5, `${mapId} slot ${k}: the sides are rotations within 0.5 m (${r1(rotation)} m)`);
    assert.ok(Math.abs(Math.cos(a.yaw - b.yaw) + 1) < 1e-9, `${mapId} slot ${k}: opposite facings`);
    const nominal = nominalBravoSlot(frame, k);
    moves.push(r1(Math.hypot(b.x - nominal.x, b.z - nominal.z)));
    for (const [team, slot] of [['alpha', a], ['bravo', b]]) {
      const label = `${mapId} ${team} slot ${k}`;
      assert.ok(placementTerrainSafe(field, slot, SLOT), `${label}: dry, firm, level ground for the largest hull`);
      for (const obstacle of world.queryObstacles(slot.x - 8, slot.z - 8, slot.x + 8, slot.z + 8, [])) {
        if (obstacle.crushed || obstacle.dead) continue;
        const floor = field.getHeightAt(slot.x, slot.z);
        if (obstacle.max[1] < floor - 0.5 || obstacle.min[1] > floor + 5) continue;
        assert.ok(!collisionFootprintContainsPoint(obstacle, slot.x, slot.z, DEPLOYMENT_SLOT_RADIUS_M), `${label}: no obstacle in the slot (${obstacle.kind})`);
      }
      for (let j = 0; j < k; j++) {
        const other = deployment.pair(j)[team];
        assert.ok(Math.hypot(slot.x - other.x, slot.z - other.z) >= DEPLOYMENT_SLOT_SPACING_M - 1e-6, `${label}: no overlap with slot ${j}`);
      }
      // the cached ground test is the placement's own law (on this slot, and a metre and a lattice step off it)
      for (const [dx, dz] of [[0, 0], [1, 0], [0, -DEPLOYMENT_LATTICE_M], [7, 3]]) {
        const point = { x: slot.x + dx, z: slot.z + dz };
        assert.equal(deploymentGroundSafe(field, spawns, team, point), placementTerrainSafe(field, point, SLOT), `${label}: the cached ground test`);
      }
    }
    // the ground stage moved the pair onto ground; the match stage only off the world's solids, still symmetric
    const g = ground.pair(k);
    assert.ok(g.symmetric, `${mapId} slot ${k}: the ground stage is symmetric`);
  }
  // the placement seats the largest and the smallest hull on every slot without a move
  for (const spec of [bigSpec, smallSpec]) {
    const seat = createMatchPlacement({ mapId, heightField: field, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
      anchors: matchPlacementAnchors(spawns), mode: 'standard' });
    for (let k = 0; k < DEPLOYMENT_CLEARED_SLOTS; k++) for (const team of ['alpha', 'bravo']) {
      const slot = seat.deploymentSlot(team, k), placed = seat.spawn(slot, `${team}-${k}`, placementTankRadius(getSpec(spec)));
      assert.ok(placed.x === slot.x && placed.z === slot.z && placed.yaw === slot.yaw, `${mapId} ${team} slot ${k}: ${spec} seats on its slot`);
    }
  }
  // nearest to the pivot: equal for the default and the 14 v 14 sides
  for (const count of [7, DEPLOYMENT_CLEARED_SLOTS]) {
    const near = (team) => Math.min(...deployment.slots(team, count).map((slot) => Math.hypot(slot.x - frame.pivot.x, slot.z - frame.pivot.z)));
    const gap = Math.abs(near('alpha') - near('bravo'));
    worstNearest = Math.max(worstNearest, gap);
    assert.ok(gap <= 2, `${mapId}: nearest-to-centre distances equal within 2 m at ${count} a side (${r1(gap)} m)`);
  }
  // the world keeps its spawn clearings round both sides' first fourteen ground-stage slots: no tree within 26 m (the pads'
  // rule, vegetation.ts), the scatter destructibles and boulders off them (props.ts; checked by the census's causes)
  const clearings = deploymentClearings(field);
  assert.equal(clearings.length, 2 * DEPLOYMENT_CLEARED_SLOTS, `${mapId}: one clearing a slot`);
  for (const team of ['alpha', 'bravo']) for (const slot of ground.slots(team, DEPLOYMENT_CLEARED_SLOTS)) {
    assert.ok(clearings.some((point) => point.x === slot.x && point.z === slot.z), `${mapId}: a clearing on ${team}'s ground-stage slot`);
    for (const tree of world.queryObstacles(slot.x - 26, slot.z - 26, slot.x + 26, slot.z + 26, [])) {
      if (tree.treeIdx == null) continue;
      const cx = (tree.min[0] + tree.max[0]) / 2, cz = (tree.min[2] + tree.max[2]) / 2;
      assert.ok(Math.hypot(cx - slot.x, cz - slot.z) >= 26, `${mapId}: no tree in ${team}'s slot clearing (${r1(Math.hypot(cx - slot.x, cz - slot.z))} m)`);
    }
  }
  report.push(`${mapId} ${frame.kind} moves ${moves.join('/')}`);
  world.release?.();
}

// ---- the authority deploys exactly there: a side's k-th vehicle on its k-th slot (an explicit spawn still precedes)
{
  const mapId = 'badlands', world = createDedicatedWorldCollision(mapId);
  const players = [];
  for (let i = 0; i < 14; i++) players.push({ id: `p${i}`, specId: [bigSpec, 'm1a2', 't90m', smallSpec][i % 4], team: i < 7 ? 'alpha' : 'bravo', bot: true });
  players[3] = { ...players[3], spawn: { x: 12, z: -40, yaw: 0.25 } };
  const match = createAuthoritativeMatch({ mapId, gameMode: 'standard', seed: 7, countdownS: 0, worldCollision: world, players });
  const placement = createMatchPlacement({ mapId, heightField: world.heightField, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
    anchors: matchPlacementAnchors(world.heightField._layout.spawns), mode: 'standard' });
  const index = { alpha: 0, bravo: 0 };
  for (const entity of match.entities) {
    const k = index[entity.team]++;
    if (entity.id === 'p3') { assert.ok(Math.hypot(entity.state.pos.x - 12, entity.state.pos.z + 40) < 0.5, 'an explicit spawn precedes the deployment'); continue; }
    const slot = placement.deploymentSlot(entity.team, k);
    assert.ok(Math.hypot(entity.state.pos.x - slot.x, entity.state.pos.z - slot.z) < 0.5, `${entity.id}: the authority seats ${entity.team} slot ${k}`);
  }
  world.release?.();
}

console.log(`deployment.selftest: ${MAP_IDS.length} maps x ${DEPLOYMENT_CLEARED_SLOTS} slot pairs symmetric (worst ${r1(worstRotation)} m, nearest-to-centre gap ${r1(worstNearest)} m), clear, spaced and seated as is for ${bigSpec} (${largest.toFixed(2)} m) and ${smallSpec}; moves from the nominal slot per map:\n  ${report.join('\n  ')}`);
