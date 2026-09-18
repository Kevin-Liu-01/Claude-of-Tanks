import assert from 'node:assert/strict';
import { createGameState, setupBattle } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { getSpec } from '../vehicles/specs.ts';
import { ENEMY_NATION_OPTIONS } from './teamArrangement.ts';
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
  };
};
try {
  const hordeBlocs = new Set();
  for (const ordinal of [0, 1, 2, 3]) {
    const battle = play('endless_horde', 'm1a3', ordinal);
    assert.equal(battle.enemies.length, 14, `horde ordinal ${ordinal}: fourteen hostiles`);
    assert.equal(battle.allies.length, 2, `horde ordinal ${ordinal}: two allied bots`);
    const blocs = new Set(battle.enemies.map(blocOf));
    assert.equal(blocs.size, 1, `horde ordinal ${ordinal}: every hostile from one nation bloc (${[...blocs].join(',')})`);
    assert.deepEqual(battle.leadTeams.slice(0, 14), Array(14).fill('enemy'), `horde ordinal ${ordinal}: the formation seats are the enemy side`);
    hordeBlocs.add([...blocs][0]);
  }
  assert.ok(hordeBlocs.size >= 2, `consecutive Horde sorties meet different armies (${[...hordeBlocs].join(',')})`);
  for (const ordinal of [0, 5]) {
    const battle = play('frontline_assault', 'm1a2', ordinal);
    assert.equal(battle.enemies.length, 10, `frontline ordinal ${ordinal}: ten defenders`);
    assert.equal(battle.allies.length, 3, `frontline ordinal ${ordinal}: three allied bots`);
    const blocs = new Set(battle.enemies.map(blocOf));
    assert.equal(blocs.size, 1, `frontline ordinal ${ordinal}: one nation defends (${[...blocs].join(',')})`);
  }
  {
    const arranged = play('endless_horde', 'm1a2', 2, { allies: 2, enemies: 14, waveSize: 5, enemyNation: 'germany' });
    assert.equal(arranged.enemies.length, 14);
    assert.ok(arranged.enemies.every((id) => getSpec(id).nation === 'Germany'), 'an arranged nation fields every hostile from that nation');
  }
  {
    const standard = play('standard', 'm1a2', 1);
    assert.equal(standard.enemies.length, 7, 'standard battles keep the 7 hostiles');
    assert.equal(standard.allies.length, 6, 'standard battles keep the 6 allies');
  }
} finally {
  world.release();
}
console.log('waveFormationSplit.selftest: Horde and Frontline field one-nation enemy pools with the allies drawn from the seats behind the formation');
