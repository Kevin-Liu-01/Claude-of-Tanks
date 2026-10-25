// The bots' opening routes, a leg a step (battle-spikes-253; game/state.ts planOpeningRouteSteps and
// prepareNextOpeningRoute; docs/PERF-SPIKES.md): the deferred warm advances the oldest route one leg at a time, where a
// bot's whole route was one job (the countdown's 30-290 ms bursts in the census). The same battle set up eagerly and
// deferred gives every bot the same route, waypoint for waypoint; the deferred queue takes more steps than it has bots
// (a step is a leg), finishes a bot's route before it begins the next, and is empty when every route is set.
import assert from 'node:assert/strict';
import { createGameState, prepareNextOpeningRoute, setupBattle } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

await ensureFullFleet();
const world = createDedicatedWorldCollision('verdant');
const authored = world.heightField._layout.spawns;
const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };

/** The same battle, its routes planned eagerly or queued for the deferred warm. */
function battle(deferOpeningRoutes) {
  const game = createGameState({ rosterSeed: 11 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = 3;
  setupBattle(game, 'm1a1_abrams_hc', world, {
    gameMode: 'standard', random: true, arrangement: { allies: 6, enemies: 7 }, deferVisuals: true, deferCamoRepaint: true,
    ...(deferOpeningRoutes ? { deferOpeningRoutes: true } : {}),
  });
  return game;
}

const routes = (game) => game.tanks.filter((entity) => !entity.isPlayer).map((entity) => JSON.stringify(entity._openingRoute ?? null));

const eager = battle(false);
const deferred = battle(true);
const bots = deferred.openingRouteJobs.length;
assert.ok(bots >= 10, `the bots' routes are queued (${bots})`);
assert.ok(deferred.tanks.filter((entity) => !entity.isPlayer).every((entity) => !entity._openingRoute), 'no route is set before its legs are planned');

let steps = 0;
let finished = 0;
while (prepareNextOpeningRoute(deferred)) {
  steps++;
  const set = deferred.tanks.filter((entity) => !entity.isPlayer && entity._openingRoute).length;
  assert.ok(set === finished || set === finished + 1, 'one route at a time: a bot\'s route is whole before the next is begun');
  finished = set;
  assert.ok(steps < 10000, 'the queue drains');
}
assert.equal(deferred.openingRouteJobs.length, 0, 'the queue is empty once every route is set');
assert.ok(steps > bots, `a step is a leg: ${steps} steps for ${bots} routes`);
assert.deepEqual(routes(deferred), routes(eager), 'every bot\'s route is the one the eager setup plans, waypoint for waypoint');
console.log(`openingRouteLegs.selftest: ${bots} routes planned a leg a step (${steps} steps), each the eager route exactly PASS`);
