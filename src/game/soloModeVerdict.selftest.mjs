// Proof (implicit state machine audit M3, review round 1, 2026-11-03): the solo battle's mode controller hears a verdict
// it did not reach. The authority tells its controller (authoritativeMatch.ts finishMatch, server/match/matchPhase
// selftest); solo's own verdict writers (state.ts applyTimedModeResult, applyEliminationResult) set game.result while
// stepMatchMode went on stepping the controller every simStep of the 8 s ending hold: Zone Control kept scoring held
// zones, and the mode could still finish on its own and name another winner. A solo Zone Control battle decided by the
// clock keeps its score through the hold, and the controller's result is the solo verdict.
import assert from 'node:assert/strict';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});
// the staged roster (random: false) and its combat anatomy only: no vehicle builders
await ensureAuthorityFleet(TANK_IDS);
const MAP = 'steppe';
const world = createDedicatedWorldCollision(MAP);
const authored = world.heightField._layout.spawns;
const spawnAt = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
  gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
  gunDirWorld: (out) => out.set(0, 0, 1) });

const game = createGameState({ rosterSeed: 3 });
game.mapId = MAP;
spawnTanks(game, { scene: { remove() {} } });
for (const entity of game.allTanks) entity.visual = visual(entity);
const events = [];
const bus = createBus((name, payload) => events.push([name, payload]));
setupBattle(game, TANK_IDS[0], world, { gameMode: 'zone_control', random: false, arrangement: null, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
const collider = createCollider(game, world);
const controller = game.matchModeController;
assert.ok(controller && !controller.usesElimination && game.ruleset.timeLimitS != null, 'setup: Zone Control is a timed mode');

// half a second before the clock, the player's side holds a zone: it scores every step it is held
const zone = controller.state.zones[0];
game.timeS = game.ruleset.timeLimitS - 0.5;
zone.control = 1; zone.owner = 'alpha'; zone.contested = false;
for (let n = 0; n < 120 && game.result === null; n++) simStep(game, bus, world, null, collider);
assert.equal(game.resultReason, 'time_limit', `setup: the clock decided the battle (${game.result}, ${game.resultReason})`);
assert.equal(game.result, 'victory', 'setup: the held zone put the player ahead');
const atVerdict = { ...controller.state.score };
assert.ok(atVerdict.alpha > atVerdict.bravo, `setup: the zone scored before the verdict (${JSON.stringify(atVerdict)})`);

// a second of the ending hold with the zone still held
events.length = 0;
for (let n = 0; n < 60; n++) { zone.control = 1; zone.owner = 'alpha'; simStep(game, bus, world, null, collider); }
assert.deepEqual(controller.state.score, atVerdict, `the score stands through the hold (verdict ${JSON.stringify(atVerdict)}, after ${JSON.stringify(controller.state.score)})`);
assert.deepEqual(controller.step(1 / 60, game.timeS), { result: 'alpha', reason: 'time_limit' }, 'the controller\'s result is the solo verdict');
assert.equal(events.filter(([name]) => name === 'mode:completed' || name === 'battle:ended').length, 0, 'no second ending is announced');
console.log('soloModeVerdict: a solo clock verdict latches the mode controller; Zone Control scores no more through the hold');
