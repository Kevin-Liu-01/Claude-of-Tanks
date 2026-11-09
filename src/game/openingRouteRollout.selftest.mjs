// The bots' opening routes at the rollout (round 8 Y1 s2-02; game/state.ts drainOpeningRoutes): a battle's bots leave on
// their opening routes from its first live step, whatever the device. The page's deferred warm plans the routes a leg a
// step from its countdown on (battle-spikes-253), and a device whose warm is behind (a slow phone, a large roster, a warm
// that stopped before its route stage) reached the count's end with routes still pending: those bots built an auto-patrol
// from their controllers' streams and drove it until their route landed, on a tick the frame rate chose, so one seed played
// differently on two devices and differently from the authority, which plans every leg at its creation. The step now
// plans whatever is still pending before its first live step, as the authority does.
// Proof on the page's own step (verdant, the staged Standard roster, the player and seven bots, on the openingRouteLegs
// stub world): the battle set up eagerly, stepped 90 ticks, against the same battle with its routes deferred, one leg
// planned by the warm, then 30 live ticks, the rest drained (the warm catching up), 60 more: every hull's pose, every
// bot's route and its controller's view are the same, and no route is pending at the first live step.
// Cost (review r1): the staged roster's combat anatomy only (ensureAuthorityFleet, no vehicle builders) keeps it near 4 s
// of CPU, the page import (state.ts, about 2 s) its floor: the drain lives in the page's step, so no lighter guard exists.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createBus, createCollider, createGameState, prepareNextOpeningRoute, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// the staged roster (random: false), its combat anatomy only: no vehicle builders
await ensureAuthorityFleet(TANK_IDS);
const _dir = new Vector3(0, 0, 1);
const visualFor = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {},
  setDestroyed() {}, resetDestroyed() {}, gunMuzzleWorld: (out) => out.copy(entity.state.pos), gunDirWorld: (out) => out.copy(_dir),
  gunPivotWorld: (out) => out.copy(entity.state.pos) });

/** One seeded Standard battle on its own world, its routes planned eagerly or queued for the deferred warm. */
function battle(deferOpeningRoutes) {
  const world = createDedicatedWorldCollision('verdant');
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 11 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visualFor(entity);
  game.battleCount = 3;
  setupBattle(game, 'm1a1_abrams_hc', world, {
    gameMode: 'standard', random: false, brain: null, arrangement: { allies: 3, enemies: 4 }, deferVisuals: true, deferCamoRepaint: true,
    ...(deferOpeningRoutes ? { deferOpeningRoutes: true } : {}),
  });
  for (const entity of game.allTanks) entity.visual = visualFor(entity);
  game.preBattleS = 0;
  return { game, world, bus: createBus(() => {}), collider: createCollider(game, world) };
}
const step = ({ game, bus, world, collider }) => simStep(game, bus, world, null, collider);
const r = (value) => Math.round(value * 1e6) / 1e6;
/** Every hull's pose and every bot's route and controller view, as plain data. */
function field(game) {
  return game.tanks.map((entity) => ({
    id: entity.id,
    pose: [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z, entity.state.yaw, entity.state.speed].map(r),
    route: entity.isPlayer ? null : JSON.stringify(entity._openingRoute ?? null),
    brain: entity.aiCtl ? JSON.stringify(entity.aiCtl.debugInfo()) : null,
  }));
}

const eager = battle(false);
const deferred = battle(true);
try {
  const queued = deferred.game.openingRouteJobs.length;
  assert.ok(queued >= 6, `the bots' routes are queued for the warm (${queued})`);
  // the warm plans one leg before the count ends, then falls behind (a slow device; or a warm that stopped there)
  assert.equal(prepareNextOpeningRoute(deferred.game), true);
  step(deferred);
  const pendingAtFirstStep = deferred.game.openingRouteJobs.length;
  for (let tick = 1; tick < 30; tick++) step(deferred);
  // the warm catches up a second later
  while (prepareNextOpeningRoute(deferred.game)) { /* the warm's remaining legs */ }
  for (let tick = 0; tick < 60; tick++) step(deferred);
  for (let tick = 0; tick < 90; tick++) step(eager);
  const a = field(eager.game), b = field(deferred.game);
  const parted = a.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(b[index]));
  assert.equal(parted, -1, `every hull drives as in the eager battle (the first to part: ${parted < 0 ? 'none'
    : `${a[parted].id} ${JSON.stringify(a[parted].pose)} vs ${JSON.stringify(b[parted].pose)}`})`);
  assert.equal(pendingAtFirstStep, 0, 'no route is pending at the first live step');
  console.log(`openingRouteRollout.selftest: ${queued} routes queued, one leg planned before the rollout; the first live step `
    + 'planned the rest and 90 ticks match the eager battle hull for hull PASS');
} finally {
  eager.world.release?.();
  deferred.world.release?.();
}
process.exit(0);
