// The load card's teams before the world (rosterState.planBattleSeats; the owner, 2026-10-26: "fix team lists in loading
// state"): the plan a solo entry draws on the card's first frame is the battle setupBattle then seats — every seat's
// identity, vehicle, side and order, the card's rows (callsigns included) and the TEAM NATIONS record — over the battle
// modes, MONO and RANDOM nations, 7v7 and 14v14, several players and successive battles. A watched battle plans nothing.
import assert from 'node:assert/strict';
import { createGameState, setupBattle } from './state.ts';
import { planBattleSeats, spawnTanks } from './rosterState.ts';
import { createRosterPresentation } from './rosterPresentation.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { getSpec } from '../vehicles/specs.ts';
import { SIDES_PRESETS } from '../sim/matchRuleset.ts';
import { tankTier } from '../vehicles/tier.ts';

await ensureFullFleet();
const world = createDedicatedWorldCollision('ruinspires');
const authored = world.heightField._layout.spawns;
const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
const roster = createRosterPresentation({ getVehicleName: (id) => getSpec(id).name, getTier: (id) => String(tankTier(id)), getNation: (id) => getSpec(id).nation });

const game = createGameState({ rosterSeed: 7 });
game.mapId = 'ruinspires';
spawnTanks(game, { scene: { add() {}, remove() {} } });
// (no DOM: every vehicle wears a stand-in visual, re-issued before each battle as the last one's are released)
const stubVisuals = () => { for (const entity of game.allTanks) entity.visual ??= { root: { userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }; };
stubVisuals();

const seatOf = (entity) => [entity.id, entity.specId, entity.team, !!entity.isPlayer];
const MODES = ['standard', 'zone_control', 'capture_the_flag', 'mars', 'juggernaut', 'gun_game', 'drone', 'ac130', 'endless_horde', 'frontline_assault'];
const ARRANGEMENTS = [undefined, { ...SIDES_PRESETS['14v14'], teamNations: 'random' }, { ...SIDES_PRESETS['14v14'] }];
const PLAYERS = ['m1a1_abrams_hc', 't90m', 'leopard_2a7v', 'type_99a'].filter((id) => game.tankById.has(id));
assert.ok(PLAYERS.length >= 2, 'the receipt plays at least two vehicles');
let battles = 0;
for (const gameMode of MODES) {
  for (const arrangement of gameMode === 'standard' ? ARRANGEMENTS : [undefined]) {
    for (const playerSpecId of PLAYERS) {
      const label = `${gameMode} ${arrangement ? JSON.stringify(arrangement) : 'default'} ${playerSpecId} #${game.battleCount + 1}`;
      const plan = planBattleSeats(game, playerSpecId, { randomRoster: true, gameMode, arrangement });
      assert.ok(plan && plan.seats.length > 1, `${label}: a plan with bots`);
      stubVisuals();
      setupBattle(game, playerSpecId, world, { gameMode, random: true, arrangement, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
      battles++;
      assert.deepEqual(plan.seats.map(seatOf), game.tanks.map(seatOf), `${label}: the planned seats are the seated battle's, in its order`);
      for (const team of ['player', 'enemy']) {
        assert.deepEqual(roster.battleRows(plan.seats, team), roster.battleRows(game.tanks, team), `${label}: the card's ${team} rows`);
      }
      assert.deepEqual(plan.teamNations, game.teamNations ?? null, `${label}: the TEAM NATIONS record`);
      assert.ok(plan.seats.some((seat) => seat.team === 'enemy'), `${label}: an enemy side`);
    }
  }
}
assert.equal(planBattleSeats(game, PLAYERS[0], { gameMode: 'standard', watch: true }), null, 'a watched battle plans nothing');
assert.equal(planBattleSeats(game, 'no_such_tank', { gameMode: 'standard' }), null, 'nor does an unknown vehicle');

console.log(`battleSeatPlan.selftest: ${battles} battles over ${MODES.length} modes, MONO and RANDOM nations, 7v7 and 14v14 — the card's planned teams (seats, order, sides, rows, callsigns, nations) are the seated battle's`);
