// round 8 Y4, ROUND8.md amendment 4: a couch battle's Battle Again stays a couch battle across battle-core's clear. A couch
// battle seated by the page's own setupBattle (opts.couch) and recorded by main's own recordIntent binding; the Garage
// return (clearBattleAfterExit, then main's own phase:change 'garage' handler: the intent rebuilt, clearMatchSession); then
// Battle Again's replay (battleEntryIntent.ts replayBattleEntry) with the phones here now, seated by setupBattle again
// through the real couchSeats.ts and stateCore.ts. Before s3-04 the record had no couch and the rematch was a keyboard
// battle (game.couch null, the phones "waiting for battle").
// Written against battle-core's couch session owner (item/sm-fix8-battle-core f76212eac8: couchSeats.ts
// beginCouchSession/endCouchSession, clearMatchSession ending the session): its two assertions (the session and the seats'
// names end at the Garage return) are the last ones, and pass once Y11 lands battle-core (landing order: battle-core
// first); everything before them is this cluster's and passes on its own branch.
// A page import (state.ts), a world and a fleet: MANUAL suite 'sims' (tools/selftest-tiers.mjs).
import assert from 'node:assert/strict';
import { createGameState, setupBattle } from './state.ts';
import { clearMatchSession } from './stateCore.ts';
import { clearBattleAfterExit } from './garageTankLifecycle.ts';
import { transitionAppPhase } from './appLifecycle.ts';
import * as battleEntryIntentModule from './battleEntryIntent.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import { mainStatement, runMainStatements, mainSource } from '../app/mainComposition.test-support.mjs';

await ensureAuthorityFleet([...TANK_IDS, 'm1a1_abrams_hc']);
const world = createDedicatedWorldCollision('ruinspires');
const authored = world.heightField._layout.spawns;
const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
const visual = () => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {} });

const game = createGameState({ rosterSeed: 5 });
game.mapId = 'ruinspires';
spawnTanks(game, { scene: { remove() {} } });
game.battleCount = 2;
const { createBattleEntryIntent, replayBattleEntry } = battleEntryIntentModule;
const intent = createBattleEntryIntent();

// main's own bindings: the entry's recordIntent and the Garage phase's handler
const recordSource = mainSource.match(/\n {2}recordIntent: (\(options\) => battleEntryIntent\.begin\(\{[\s\S]*?\n {2}\}\)),\n/)?.[1];
assert.ok(recordSource, "main binds the solo entry's recordIntent");
const recordIntent = runMainStatements(`const recordIntent = ${recordSource};`, { battleEntryIntent: intent, terrainVariantFor }, 'recordIntent');
let onPhase = null;
runMainStatements(mainStatement("bus.on('phase:change', () => {"), {
  bus: { on: (type, listener) => { if (type === 'phase:change') onPhase = listener; } },
  game, battleEntryIntent: intent, clearMatchSession, frameLoop: { restart() {} },
}, 'null');
assert.equal(typeof onPhase, 'function');

/** A solo entry as the Garage's press starts it (soloBattleStartRuntime: the intent, setupBattle, then the phase). */
function enter(options) {
  recordIntent(options);
  for (const entity of game.allTanks) entity.visual ??= visual(); // (the return released the hulls' visuals)
  setupBattle(game, 'm1a1_abrams_hc', world, {
    gameMode: options.gameMode, random: false, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true,
    arrangement: { allies: 3, enemies: 3 }, ...(options.couch ? { couch: options.couch } : {}),
  });
  transitionAppPhase(game, 'battle', { reason: 'solo-battle' });
}

// couch battle 1: seats 1 and 2 on two sides
enter({ gameMode: 'standard', couch: { seats: [1, 2], sides: 'teams', names: ['Seat 1', 'Seat 2'] } });
const first = game.couch;
// (every assertion compares primitives: an AssertionError carrying a session would print the whole battle's object graph)
assert.equal(!!first && first.seats.length === 2 && !!game.ruleset.couch, true, 'setupBattle seated the phones under the couch rules');
const firstTanks = first.seats.map(({ entity }) => entity);
assert.deepEqual(intent.couch, { sides: 'teams' }, "main's recordIntent recorded the couch");

// the Garage return (Battle Again's own enter): the battle's teardown, then main's phase:change 'garage' handler
transitionAppPhase(game, 'garage', { reason: 'garage-return' });
clearBattleAfterExit({ game });
onPhase({ phase: 'garage' });
const afterClear = { ended: game.couch === null, names: firstTanks.map((entity) => entity.displayName ?? null) };
assert.deepEqual(intent.couch, { sides: 'teams' }, 'the Garage phase keeps the couch for Battle Again');

// Battle Again: the phones here now are seats 1 and 3 (seat 2's phone left, seat 3's joined between battles)
assert.equal(typeof replayBattleEntry, 'function', "Battle Again's replay rule (before: a click on '.cot-battle')");
const closed = [];
const outcome = replayBattleEntry(intent, {
  replay: (entry) => { enter({ gameMode: 'standard', watch: entry.watch, ...(entry.couch ? { couch: entry.couch } : {}) }); return true; },
  couch: () => ({ seatsInPlay: () => [1, 3], startBattle: (launch) => { closed.push('joins'); return launch([1, 3]); } }),
  openCouchLobby: () => assert.fail('phones are here: no lobby'),
  seatName: (seat) => `Seat ${seat}`,
});
assert.equal(outcome, 'started');
assert.deepEqual(closed, ['joins'], 'the join window closed before the rematch');
const second = game.couch;
assert.equal(!!second && second !== first, true, 'the rematch is a couch battle with a new session (before: game.couch null)');
assert.equal(!!game.ruleset.couch, true, 'under the couch rules');
assert.equal(second.sides, 'teams', 'its sides are the entry\'s');
assert.deepEqual(second.seats.map(({ seat }) => seat), [1, 3], 'its seats are the phones here now');
assert.deepEqual(second.seats.map(({ entity }) => entity.displayName), ['Seat 1', 'Seat 3'], 'each wearing its seat\'s name');
for (const entity of firstTanks) {
  if (!second.seats.some((seat) => seat.entity === entity)) assert.equal(entity.displayName ?? null, null, 'a tank no seat drives now has its own name');
}
assert.deepEqual(intent.couch, { sides: 'teams' }, 'and the record is still the couch battle\'s');

// battle-core's half (Y11): nothing of the couch battle outlives the Garage return's clearMatchSession
assert.equal(afterClear.ended, true, 'the Garage return ended the couch session (battle-core endCouchSession)');
assert.deepEqual(afterClear.names, firstTanks.map(() => null), 'and the seats\' tanks had their own names back');

world.release?.();
console.log('couchRematch.selftest: a couch battle\'s Battle Again, through main\'s intent and Garage handler and setupBattle, is a couch battle with the phones here now, and nothing of the last one outlives the return PASS');
process.exit(0);
