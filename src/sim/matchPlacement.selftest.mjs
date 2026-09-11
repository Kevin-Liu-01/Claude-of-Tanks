import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMatchPlacement, matchPlacementAnchors, placementTerrainSafe } from './matchPlacement.ts';
import { createMatchModeController } from './matchModes.ts';
import { createObjectiveAccess } from './matchPlacementAccess.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { collisionFootprintContainsPoint, setObbShape } from '../world/collision.ts';
import { createBotNavigationGrid, createDryNavigationView, createNavigationReachability,
  navigationReachabilityContains, planBotRoute } from './botRoutePlanner.ts';
import { getSpec } from '../vehicles/specs.ts';
import { terrainSlopeMargin } from './terrainMobility.ts';
import { createGameState, setupBattle } from '../game/state.ts';
import { spawnTanks } from '../game/rosterState.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { MATCH_MODE_ARENA_HALF_EXTENT_M } from './matchObjectiveLayouts.ts';

const flat = { size: 1024, getHeightAt: () => 0, getNormalAt: () => ({ y: 1 }), getWaterMaskAt: () => 0 };
const anchors = { alpha: { x: 0, z: -180, yaw: 0 }, bravo: { x: 0, z: 180, yaw: Math.PI } };
function build(extra = {}, mode = 'standard') {
  return createMatchPlacement({ heightField: flat, obstacles: [], anchors, mode, ...extra });
}
const wall = { min: [-8, 0, -8], max: [8, 8, 8], crushable: false };
const plan = build({ obstacles: [wall] });
assert.equal(placementTerrainSafe({ ...flat, getWaterMaskAt: (x, z) => Math.hypot(x, z) > 9 ? 1 : 0 },
  { x: 0, z: 0 }, { radius: 12, relief: 5, normalY: .94 }), false, 'dry centre does not admit a flooded objective perimeter');
assert.equal(placementTerrainSafe({ ...flat, getHeightAt: (x) => x }, { x: 0, z: 0 },
  { radius: 4, relief: 2, normalY: .9 }), false, 'flat normal metadata cannot bypass physical footprint relief');
const first = plan.spawn({ x: 0, z: 0, yaw: .5 }, 'first', 4.6);
assert.ok(!collisionFootprintContainsPoint(wall, first.x, first.z, 4.6));
assert.equal(first.yaw, .5);
const second = plan.spawn(first, 'second', 4.6);
assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= 12.2);
assert.deepEqual(plan.spawn({ x: 0, z: 0, yaw: 1 }, 'fixture', 4.6, true), { x: 0, z: 0, yaw: 1 });
assert.deepEqual(plan.spawn({ x: 0, z: 0, yaw: 1 }, 'fixture'), { x: 0, z: 0, yaw: 1 }, 'explicit dev spawn remains explicit on respawn');
assert.throws(() => build({ heightField: { ...flat, getWaterMaskAt: () => 1 } }, 'capture_the_flag'), /No safe base/,
  'all-invalid terrain is rejected, not silently returned');
assert.equal(build({ heightField: { ...flat, getWaterMaskAt: () => 1 } }).pickup({ x: 0, z: 0 }), null);
assert.equal(build({ heightField: { ...flat, getWaterMaskAt: () => 1 } }).respawn({ x: 0, z: 0, yaw: 0 }, 'blocked', []), null,
  'an unavailable respawn defers instead of crashing or returning an unsafe point');
const divided = createObjectiveAccess({ heightField: { ...flat, getWaterMaskAt: (_x, z) => Math.abs(z) < 20 ? 1 : 0 }, obstacles: [] }, anchors);
assert.equal(divided.reachable({ x: 0, z: 200 }), false, 'a clear island across an unbridged liquid belt is not a valid shared objective');
const blockedNavigation = createObjectiveAccess({ heightField: flat, obstacles: [] }, anchors);
blockedNavigation.alpha.fill(0);
assert.equal(blockedNavigation.reachable({ x: 0, z: 0 }), false, 'connectivity corruption cannot be accepted by the footprint check');
const narrow = setObbShape({ min: [-30, 0, -30], max: [30, 8, 30] }, 0, 0, 1, 30, Math.PI / 4);
const clearBesideRotated = { x: 25, z: 0, yaw: 0 };
assert.deepEqual(build({ obstacles: [narrow] }).spawn(clearBesideRotated, 'clear', 3.5), clearBesideRotated,
  'actual narrow-phase footprint permits the empty part of a broad AABB');

function entity(id, team, x, z) {
  return { id, team, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [10], ammoCapacity: [10] } };
}
for (const mode of ['capture_the_flag', 'zone_control', 'turbo_ball']) {
  const small = [entity('a', 'alpha', 40, -200), entity('b', 'bravo', -60, 180)];
  const large = [...small.map(e => structuredClone(e)), entity('extra', 'alpha', 300, -120)];
  const make = entities => createMatchModeController({ mode, entities, placement: build({}, mode), revive() {} });
  const a = make(small).state, b = make(large).state;
  assert.deepEqual(a.flags, b.flags); assert.deepEqual(a.zones, b.zones);
  assert.deepEqual(a.goals, b.goals); assert.deepEqual(a.ball, b.ball);
}

// Real controller ticks exercise failure throttling, not just a source-string
// assertion. Pending death must survive the cooldown and eventually revive.
{
  const alpha = entity('cooldown-a', 'alpha', 0, -180), bravo = entity('cooldown-b', 'bravo', 0, 180);
  let calls = 0, revives = 0, available = false;
  const placement = { ...build({}, 'capture_the_flag'), respawn(spawn) { calls++; return available ? spawn : null; } };
  const controller = createMatchModeController({ mode: 'capture_the_flag', entities: [alpha, bravo], placement,
    revive(target) { revives++; target.combat.destroyed = false; } });
  alpha.combat.destroyed = true;
  for (let tick = 0; tick <= 360; tick++) controller.step(1 / 60, tick / 60);
  assert.equal(calls, 1, 'first due tick attempts the blocked placement once');
  for (let tick = 361; tick < 420; tick++) controller.step(1 / 60, tick / 60);
  assert.equal(calls, 1, '59 additional simulation ticks do not repeat the search');
  controller.step(1 / 60, 7);
  assert.equal(calls, 2, 'still blocked: retry at the explicit one-second deadline');
  available = true;
  for (let tick = 421; tick <= 480; tick++) controller.step(1 / 60, tick / 60);
  assert.equal(calls, 3); assert.equal(revives, 1); assert.equal(alpha.combat.destroyed, false);
}

{
  const human = entity('horde-human', 'alpha', 0, -180);
  const enemies = [0, 1, 2].map(i => ({ ...entity(`horde-${i}`, 'bravo', i * 20, 180), bot: true }));
  let calls = 0, available = false;
  const healthScales = [];
  const placement = { ...build({}, 'endless_horde'), respawn(spawn) { calls++; return available ? spawn : null; } };
  const controller = createMatchModeController({ mode: 'endless_horde', entities: [human, ...enemies], placement,
    revive(target, _spawn, scale) { healthScales.push(scale); target.combat.destroyed = false; } });
  assert.equal(calls, 3);
  assert.ok(enemies.every(e => e.modeActive === false), 'unplaced Horde enemies never become live at an unsafe old position');
  for (let tick = 0; tick < 60; tick++) controller.step(1 / 60, tick / 60);
  assert.equal(calls, 3); assert.equal(controller.state.horde.wave, 1);
  controller.step(1 / 60, 1); assert.equal(calls, 6);
  available = true; controller.step(1 / 60, 2);
  assert.equal(calls, 9); assert.ok(enemies.every(e => e.modeActive && !e.combat.destroyed));
  for (const enemy of enemies) enemy.combat.destroyed = true;
  controller.step(1 / 60, 3);
  available = false; controller.step(1 / 60, 9);
  assert.equal(controller.state.horde.wave, 2); assert.equal(calls, 12);
  controller.step(1 / 60, 9.5); assert.equal(calls, 12);
  available = true; controller.step(1 / 60, 10);
  assert.equal(calls, 15); assert.deepEqual(healthScales, [1, 1, 1, 1.16, 1.16, 1.16],
    'inactive Horde activation retries preserve the pending wave health scale');
}

// The objective flood must not overwrite the original bots' optional water
// policy or typed grid. Deliberately use a liquid belt on a legacy-policy map.
{
  const field = { ...flat, getWaterMaskAt: (_x, z) => Math.abs(z) < 10 ? 1 : 0 };
  const original = createBotNavigationGrid({ heightField: field, getObstacles: () => [] });
  const before = { heights: original.heights.slice(), blocked: original.blocked.slice(), groundTypes: original.groundTypes.slice() };
  const dry = createDryNavigationView(original, field, () => true);
  assert.equal(original.navigationWaterPolicy, undefined);
  assert.equal(original.waterBlockedEdges, undefined);
  for (const key of ['heights', 'blocked', 'groundTypes']) assert.deepEqual(original[key], before[key]);
  assert.equal(dry.heights, original.heights); assert.equal(dry.groundTypes, original.groundTypes);
  assert.notEqual(dry.blocked, original.blocked);
  assert.equal(dry.blocked.byteLength, 1681); assert.equal(dry.waterBlockedEdges.byteLength, 1681);
  assert.equal(createDryNavigationView(dry, field, () => true), dry, 'already-dry view adds no duplicate grid');
  const local = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < .01;
  const mask = createNavigationReachability(dry, getSpec('m1a2'), [{ x: 0, z: -125 }], local);
  assert.equal(mask.byteLength, 1681);
  assert.equal(navigationReachabilityContains(dry, mask, { x: 0, z: 125 }, local), false);
  assert.equal(navigationReachabilityContains(dry, mask, { x: 0, z: -125 }, local), true);
  assert.equal(createNavigationReachability(dry, getSpec('m1a2'), [{ x: 0, z: 0 }], () => false).some(Boolean), false,
    'blocked authored pad cannot silently seed a nearest open cell across an obstacle');
  // Isolated diagonal neighbours cannot cross two blocked orthogonal cells.
  const blocked = new Uint8Array(1681).fill(1), center = 20 * 41 + 20;
  blocked[center] = 0; blocked[center + 42] = 0;
  const isolated = { heights: new Float32Array(1681), groundTypes: new Uint8Array(1681), blocked };
  const diagonal = createNavigationReachability(isolated, getSpec('m1a2'), [{ x: 0, z: 0 }], local);
  assert.equal(diagonal[center], 1); assert.equal(diagonal[center + 42], 0);
  blocked[center + 1] = 0; blocked[center + 41] = 0;
  const open = createNavigationReachability(isolated, getSpec('m1a2'), [{ x: 0, z: 0 }], local);
  assert.equal(open[center + 42], 1, 'opening both orthogonal cells permits the diagonal');
  blocked[center] = 1;
  assert.equal(navigationReachabilityContains(isolated, open, { x: 5, z: 5 }, () => true), false,
    'a flag beside a connected cell is invalid if its rounded return-route start is blocked');
  blocked[center] = 0;
  assert.equal(navigationReachabilityContains(isolated, open, { x: 5, z: 5 }, () => false), false,
    'a reachable rounded cell still needs an actual clear connector to the objective');
  assert.equal(navigationReachabilityContains(isolated, open, { x: 5, z: 5 }, () => true), true);
  isolated.heights[center + 42] = 300;
  const cliff = createNavigationReachability(isolated, getSpec('m1a2'), [{ x: 0, z: 0 }], local);
  assert.equal(cliff[center + 42], 0, 'impassable signed ascent is not included in the component');
  // This weak vehicle can descend a 10% grade but cannot return uphill. The
  // old one-direction component would mark the neighbouring valley reachable.
  const weak = { enginePowerHp: 100, weightTons: 60, terrainResistance: { hard: 1, medium: 1.2, soft: 1.8 } };
  assert.ok(terrainSlopeMargin(weak, 'hard', -.1) > 0);
  assert.equal(terrainSlopeMargin(weak, 'hard', .1), 0);
  blocked.fill(1); blocked[center] = 0; blocked[center + 1] = 0;
  isolated.heights.fill(0); isolated.heights[center + 1] = -2.5;
  const roundTrip = createNavigationReachability(isolated, weak, [{ x: 0, z: 0 }], local);
  assert.equal(roundTrip[center + 1], 0, 'one-way downhill access cannot qualify an objective');
}

{
  const hinted = build({ mapId: 'steppe', obstacles: [{ min: [-46, 0, -26], max: [-30, 8, -10] }] }, 'zone_control');
  assert.notDeepEqual(hinted.zones[0], { x: -38, z: -18 }, 'authored hints still relocate when their clearing is invalidated');
}

// Execute both real battle-composition owners. Only renderer-facing visuals
// are inert; roster selection, warm start, authority setup and mode wiring run.
for (const mapId of ['ruinspires', 'desert', 'delta']) {
  const world = createDedicatedWorldCollision(mapId), authored = world.heightField._layout.spawns;
  const spawn = p => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
  for (const mode of ['capture_the_flag', 'zone_control', 'turbo_ball']) {
    const game = createGameState(); game.mapId = mapId;
    spawnTanks(game, { scene: { remove() {} } });
    for (const e of game.allTanks) e.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
    setupBattle(game, 'm1a2', world, { gameMode: mode, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
    const authority = createAuthoritativeMatch({ mapId, worldCollision: world, gameMode: mode, players: [
      { id: 'duplicate-a', team: 'alpha', specId: 'm1a2' }, { id: 'duplicate-b', team: 'bravo', specId: 'm1a2' },
    ] });
    for (const key of ['flags', 'zones', 'goals', 'ball']) {
      assert.deepEqual(game.matchModeState[key], authority.modeController.state[key], `${mapId}/${mode}/${key}: real solo/server layout parity`);
    }
  }
  world.release();
}

// Independent Cartesian probes, rather than calling the implementation's
// predicate as its own oracle. Manifest shapes are the production
// dedicated collision inputs, not renderer-free guessed building rectangles.
function assertFootprint(world, point, radius, relief, normalY, label, solidOnly = true) {
  let low = Infinity, high = -Infinity;
  for (let dz = -radius; dz <= radius; dz += 2) for (let dx = -radius; dx <= radius; dx += 2) {
    if (dx * dx + dz * dz > radius * radius) continue;
    const x = point.x + dx, z = point.z + dz, field = world.heightField;
    assert.ok(field.getWaterMaskAt(x, z) <= .05, `${label}: full footprint stays dry at ${x},${z}`);
    assert.notEqual(field.getGroundType(x, z), 'soft', `${label}: firm ground`);
    assert.ok(field.getNormalAt(x, z).y >= normalY, `${label}: independently sampled slope`);
    const height = field.getHeightAt(x, z); low = Math.min(low, height); high = Math.max(high, height);
  }
  assert.ok(high - low <= relief, `${label}: independently sampled relief ${high - low}`);
  const candidates = world.queryObstacles(point.x - radius, point.z - radius, point.x + radius, point.z + radius, []);
  for (const obstacle of candidates) {
    if (obstacle.crushed || obstacle.dead || (solidOnly && obstacle.crushable)) continue;
    const y = world.heightField.getHeightAt(point.x, point.z);
    if (obstacle.max[1] < y - .5 || obstacle.min[1] > y + 5) continue;
    assert.ok(!collisionFootprintContainsPoint(obstacle, point.x, point.z, radius), `${label}: actual obstacle clearance`);
  }
}

function assertLocalConnector(world, start, end, label) {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  assert.ok(distance <= 40, `${label}: only local same-cell connections bypass route output`);
  for (let s = 0, count = Math.max(1, Math.ceil(distance)); s <= count; s++) {
    const x = start.x + (end.x - start.x) * s / count, z = start.z + (end.z - start.z) * s / count;
    assert.ok(world.heightField.getWaterMaskAt(x, z) <= .05, `${label}: exact local connector remains dry`);
    assert.ok(world.heightField.getNormalAt(x, z).y >= .85, `${label}: local connector grade`);
    for (const obstacle of world.queryObstacles(x - 3.5, z - 3.5, x + 3.5, z + 3.5, [])) {
      if (obstacle.crushed || obstacle.dead || obstacle.crushable) continue;
      assert.ok(!collisionFootprintContainsPoint(obstacle, x, z, 3.5), `${label}: connector has hull clearance`);
    }
  }
}

const routes = [], receipt = [], construction = [];
for (const mapId of MAP_IDS) {
  const world = createDedicatedWorldCollision(mapId);
  const authored = world.heightField._layout.spawns;
  const worldOptions = { mapId, heightField: world.heightField, obstacles: world.getObstacles(),
    queryObstacles: world.queryObstacles, anchors: matchPlacementAnchors(authored) };
  const field = world.heightField;
  const independentNavigation = createBotNavigationGrid({ heightField: {
    navigationWaterPolicy: 'avoid-liquid', getHeightAt: (x, z) => field.getHeightAt(x, z),
    getGroundType: (x, z) => field.getGroundType(x, z), getWaterMaskAt: (x, z) => field.getWaterMaskAt(x, z),
  }, queryObstacles: world.queryObstacles, getObstacles: world.getObstacles });
  for (const mode of ['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'endless_horde']) {
    let heightReads = 0, normalReads = 0, obstacleQueries = 0;
    const measuredField = { size: field.size, navigationWaterPolicy: field.navigationWaterPolicy,
      getHeightAt(x, z) { heightReads++; return field.getHeightAt(x, z); },
      getNormalAt(x, z) { normalReads++; return field.getNormalAt(x, z); },
      getWaterMaskAt: (x, z) => field.getWaterMaskAt(x, z), getGroundType: (x, z) => field.getGroundType(x, z) };
    const layout = createMatchPlacement({ ...worldOptions, mode, heightField: measuredField,
      queryObstacles(...args) { obstacleQueries++; return world.queryObstacles(...args); } });
    // Fixed operation ceilings, not noisy wall-time thresholds. These include
    // the reused original bot grid and private objective connectivity setup.
    assert.ok(heightReads <= 65536 && normalReads <= 32768 && obstacleQueries <= 6000,
      `${mapId}/${mode}: bounded construction reads ${heightReads}/${normalReads}/${obstacleQueries}`);
    construction.push({ mapId, mode, heightReads, normalReads, obstacleQueries });
    const objectives = mode === 'zone_control' ? layout.zones.map(p => [p, 30, 7])
      : mode === 'capture_the_flag' ? Object.values(layout.centers).map(p => [p, 12, 5])
        : mode === 'turbo_ball' ? [...Object.values(layout.centers).map(p => [p, 18, 5]), [layout.middle, 12, 3]] : [];
    for (const [point, radius, relief] of objectives) {
      assertFootprint(world, point, radius, relief, .94, `${mapId}/${mode}`);
      if (mode === 'turbo_ball') assert.ok(Math.max(Math.abs(point.x), Math.abs(point.z)) + radius <= MATCH_MODE_ARENA_HALF_EXTENT_M,
        `${mapId}: complete goal/kickoff disc remains inside actual ball-physics bounds`);
      for (const team of ['alpha', 'bravo']) {
        assert.equal(layout.navigation.navigationWaterPolicy, world.heightField.navigationWaterPolicy,
          'objective safety never changes the original bot water policy');
        let reached = false;
        for (const start of layout.anchors.deployments[team]) {
          const route = planBotRoute({ navigation: independentNavigation, start, goal: point,
            spec: getSpec('m1a2'), rng: () => .5, useRoleDetour: false });
          const end = route.at(-1);
          if (end && Math.hypot(end[0] - point.x, end[1] - point.z) <= 1) {
            const reverse = planBotRoute({ navigation: independentNavigation, start: point, goal: start,
              spec: getSpec('m1a2'), rng: () => .5, useRoleDetour: false });
            const returnEnd = reverse.at(-1);
            if (returnEnd && Math.hypot(returnEnd[0] - start.x, returnEnd[1] - start.z) <= 1) { reached = true; break; }
          }
          if (Math.hypot(start.x - point.x, start.z - point.z) <= 40) {
            assertLocalConnector(world, start, point, `${mapId}/${mode}/${team}`);
            reached = true; break;
          }
        }
        assert.ok(reached, `${mapId}/${mode}/${team}: actual dry bot route from an authored deployment`);
        routes.push(reached);
      }
    }
    if (mode === 'turbo_ball') {
      // Isolate the real arena/goal physics from respawn search already tested
      // above. Both goals must still score after the ball's boundary clamp.
      const targets = [entity('score-a', 'alpha', 470, 470), entity('score-b', 'bravo', -470, -470)];
      const controller = createMatchModeController({ mode, entities: targets,
        placement: { ...layout, respawn: spawn => spawn },
        terrainHeight: (x, z) => field.getHeightAt(x, z), revive() {} });
      for (const goal of controller.state.goals) {
        Object.assign(controller.state.ball, { x: goal.x, y: goal.y + 2.2, z: goal.z, vx: 0, vy: 0, vz: 0 });
        const scoringTeam = goal.team === 'alpha' ? 'bravo' : 'alpha';
        const before = controller.state.score[scoringTeam];
        controller.step(1 / 60, 1);
        assert.equal(controller.state.score[scoringTeam], before + 1, `${mapId}: goal remains scoreable under actual ball containment`);
      }
    }
    const spawns = [];
    for (let team = 0; team < 2; team++) for (let slot = 0; slot < 7; slot++) {
      const base = team ? authored.enemies[slot % authored.enemies.length] : authored.player;
      const preferred = team ? base : { ...base, x: base.x + (slot % 4 - 1.5) * 8, z: base.z - Math.floor(slot / 4) * 10 };
      const placed = layout.spawn({ ...preferred, yaw: base.yaw ?? 0 }, `${team}:${slot}`, 4.6);
      assertFootprint(world, placed, 4.6, 2, .9, `${mapId}/${mode}/spawn`, false);
      spawns.push(placed);
    }
    receipt.push({ mapId, mode, centers: layout.centers, middle: layout.middle, zones: layout.zones, spawns });
  }
  world.release();
}
console.log('matchPlacement all30/all5 modes/2100 spawns PASS', JSON.stringify({
  placementSHA256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
  sourceSHA256: createHash('sha256').update(readFileSync(new URL('./matchPlacement.ts', import.meta.url))).digest('hex'),
  validatedBothTeamRoutes: routes.length,
  constructorMaximum: { heightReads: Math.max(...construction.map(r => r.heightReads)),
    normalReads: Math.max(...construction.map(r => r.normalReads)), obstacleQueries: Math.max(...construction.map(r => r.obstacleQueries)) },
  inputSHA256: createHash('sha256').update(readFileSync(new URL('../../server/world-collision-manifests/index.json', import.meta.url))).digest('hex'),
  constructorSHA256: createHash('sha256').update(JSON.stringify(construction)).digest('hex'),
}));
