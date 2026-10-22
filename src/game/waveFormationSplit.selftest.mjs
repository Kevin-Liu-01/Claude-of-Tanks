import assert from 'node:assert/strict';
import { createGameState, setupBattle } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { getSpec } from '../vehicles/specs.ts';
import { ENEMY_NATION_OPTIONS } from './teamArrangement.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// Same-nation waves (owner 2026-09-17: "frontline and endless horde need to have waves where tanks of similar
// nations … still unsolved"; 2026-09-18 root cause): the roster picker leads the field with the enemy pool —
// `formationLead` seats of ONE nation — but the solo team split balanced tiers over the whole field, so formation
// vehicles became allies and the fillers fought as hostiles (production: 13 UK + 1 Russian defender). The split now
// takes exactly the formation seats for the enemy side; the allied bots come from the seats behind them.
const blocOf = (id) => ENEMY_NATION_OPTIONS.find((option) => option.specNations.includes(getSpec(id).nation))?.id ?? getSpec(id).nation;
const world = createDedicatedWorldCollision('steppe');
const authored = world.heightField._layout.spawns;
const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
const play = (gameMode, playerSpecId, ordinal, arrangement = null) => {
  const game = createGameState(); game.mapId = 'steppe';
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = ordinal;
  setupBattle(game, playerSpecId, world, { gameMode, random: true, arrangement, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  const bots = game.tanks.filter((entity) => entity.specId !== playerSpecId);
  return {
    allies: bots.filter((entity) => entity.team === 'player').map((entity) => entity.specId),
    enemies: bots.filter((entity) => entity.team === 'enemy').map((entity) => entity.specId),
    leadTeams: game.tanks.slice(1).map((entity) => entity.team),
    teams: game.teamNations,
  };
};
// TEAM NATIONS (gameplay-modes-228): a MONO side is its country plus the fills its notes name
const allowed = (teams, side) => new Set([side === 'bravo' ? teams.enemy : teams.allied,
  ...teams.notes.filter((note) => note.side === side).map((note) => note.country)]);
try {
  const hordeBlocs = new Set();
  // the Horde's split is the ruleset's (2026-10-17: four allies, a twenty-strong pool)
  const { allies: hordeAllies, enemies: hordePool } = matchRulesetFor('endless_horde');
  for (const ordinal of [0, 1, 2, 3]) {
    const battle = play('endless_horde', 'm1a3', ordinal);
    assert.equal(battle.enemies.length, hordePool, `horde ordinal ${ordinal}: ${hordePool} hostiles`);
    assert.equal(battle.allies.length, hordeAllies, `horde ordinal ${ordinal}: ${hordeAllies} allied bots`);
    const blocs = new Set(battle.enemies.map(blocOf));
    const ok = allowed(battle.teams, 'bravo');
    assert.ok([...blocs].every((bloc) => ok.has(bloc)), `horde ordinal ${ordinal}: every hostile from the enemy country or a listed fill (${[...blocs].join(',')})`);
    assert.ok(battle.enemies.filter((id) => blocOf(id) === battle.teams.enemy).length > hordePool / 2, `horde ordinal ${ordinal}: the enemy country leads`);
    assert.notEqual(battle.teams.enemy, blocOf('m1a3'), `horde ordinal ${ordinal}: never the player's own country`);
    assert.ok(battle.allies.every((id) => allowed(battle.teams, 'alpha').has(blocOf(id))), `horde ordinal ${ordinal}: the allies are the player's country (or its fills)`);
    assert.deepEqual(battle.leadTeams.slice(0, hordePool), Array(hordePool).fill('enemy'), `horde ordinal ${ordinal}: the formation seats are the enemy side`);
    hordeBlocs.add(battle.teams.enemy);
  }
  assert.ok(hordeBlocs.size >= 2, `consecutive Horde sorties meet different armies (${[...hordeBlocs].join(',')})`);
  for (const ordinal of [0, 5]) {
    const battle = play('frontline_assault', 'm1a1_abrams_hc', ordinal);
    assert.equal(battle.enemies.length, 12, `frontline ordinal ${ordinal}: twelve defenders`);
    assert.equal(battle.allies.length, 3, `frontline ordinal ${ordinal}: three allied bots`);
    const blocs = new Set(battle.enemies.map(blocOf));
    assert.ok([...blocs].every((bloc) => allowed(battle.teams, 'bravo').has(bloc)), `frontline ordinal ${ordinal}: one nation defends, filled only as noted (${[...blocs].join(',')})`);
  }
  {
    const arranged = play('endless_horde', 'm1a1_abrams_hc', 2, { allies: 2, enemies: 14, waveSize: 5, enemyNation: 'germany' });
    assert.equal(arranged.enemies.length, 14);
    assert.ok(arranged.enemies.every((id) => getSpec(id).nation === 'Germany'), 'an arranged nation fields every hostile from that nation');
  }
  {
    const standard = play('standard', 'm1a1_abrams_hc', 1);
    assert.equal(standard.enemies.length, 7, 'standard battles keep the 7 hostiles');
    assert.equal(standard.allies.length, 6, 'standard battles keep the 6 allies');
  }
  {
    // RANDOM: the pool is genuinely mixed, the wave modes included (an explicit opt-out of the same-nation waves)
    const mixed = new Set();
    for (const ordinal of [0, 1, 2]) for (const id of play('endless_horde', 'm1a3', ordinal, { teamNations: 'random' }).enemies) mixed.add(blocOf(id));
    assert.ok(mixed.size >= 3, `RANDOM Horde pools mix nations (${[...mixed].join(',')})`);
  }
} finally {
  world.release();
}
console.log('waveFormationSplit.selftest: Horde and Frontline field one-nation enemy pools with the allies drawn from the seats behind the formation');
