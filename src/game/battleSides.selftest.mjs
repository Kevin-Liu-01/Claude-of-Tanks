import assert from 'node:assert/strict';
import { createGameState, setupBattle } from './state.ts';
import { planBattleParticipantIds, spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { BATTLE_FIELD_LIMIT, SIDES_PRESETS } from '../sim/matchRuleset.ts';

// Sides (owner 2026-09-18: "a switch that's default set to 7v7 but then switching it does 14v14 and you can also
// enter custom numbers of allies and enemies so you can do stuff like 1 v 20"): a solo battle of a symmetric mode
// fields exactly the arranged sides from the production catalog — unique vehicles, every one seated apart and
// inside the playable extent — on the map with the least room behind the player pad. The wave modes keep theirs.
await ensureFullFleet();
const world = createDedicatedWorldCollision('ruinspires');
const authored = world.heightField._layout.spawns;
const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
const play = (gameMode, playerSpecId, ordinal, arrangement, rosterSeed = 0) => {
  const game = createGameState({ rosterSeed }); game.mapId = 'ruinspires';
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = ordinal;
  const planned = planBattleParticipantIds(game, playerSpecId, true, [], arrangement ? arrangement.allies + arrangement.enemies : null);
  setupBattle(game, playerSpecId, world, { gameMode, random: true, arrangement, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  const fielded = game.tanks.map((entity) => ({ id: entity.specId, team: entity.team, x: entity.state.pos.x, z: entity.state.pos.z }));
  return {
    allies: fielded.filter((entry) => entry.id !== playerSpecId && entry.team === 'player'),
    enemies: fielded.filter((entry) => entry.team === 'enemy'),
    fielded,
    planned,
  };
};
const seated = (battle, label) => {
  assert.equal(new Set(battle.fielded.map((entry) => entry.id)).size, battle.fielded.length, `${label}: every vehicle is a distinct catalog entry`);
  for (const entry of battle.fielded) {
    assert.ok(Math.abs(entry.x) <= PLAYABLE_HALF_EXTENT_M && Math.abs(entry.z) <= PLAYABLE_HALF_EXTENT_M,
      `${label}: ${entry.id} seats inside the playable extent (${entry.x.toFixed(0)}, ${entry.z.toFixed(0)})`);
  }
  for (let i = 0; i < battle.fielded.length; i++) {
    for (let j = i + 1; j < battle.fielded.length; j++) {
      const a = battle.fielded[i], b = battle.fielded[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 7, `${label}: ${a.id} and ${b.id} seat 7 m apart (${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m)`);
    }
  }
};
try {
  assert.ok(world.spawnPoints.enemies.length === 7, 'the map authors seven enemy pads');
  const seven = play('standard', 'm1a2', 1, null);
  assert.equal(seven.allies.length, 6, 'the default field keeps six allied bots');
  assert.equal(seven.enemies.length, 7, 'the default field keeps seven hostiles');
  seated(seven, '7 v 7');
  const fourteen = play('standard', 'm1a2', 2, SIDES_PRESETS['14v14']);
  assert.equal(fourteen.allies.length, 13, '14 v 14 fields thirteen allied bots');
  assert.equal(fourteen.enemies.length, 14, '14 v 14 fields fourteen hostiles');
  seated(fourteen, '14 v 14');
  // Actual setup, not a replica of the balancing algorithm: fresh sessions with
  // an unchanged profile must vary both sides and preload exactly their roster.
  const lineups = new Set();
  const sidesByVehicle = new Map();
  for (let seed = 1; seed <= 16; seed++) {
    const battle = play('standard', 'm1a3', 37, SIDES_PRESETS['14v14'], seed);
    assert.deepEqual(battle.fielded.map(entry => entry.id), battle.planned);
    if (seed === 1) assert.deepEqual(play('standard', 'm1a3', 37, SIDES_PRESETS['14v14'], seed), battle,
      'explicitly seeded sessions reproduce both team assignments and spawn positions');
    assert.equal(battle.allies.length, 13);
    assert.equal(battle.enemies.length, 14);
    lineups.add(battle.allies.map(entry => entry.id).sort().join(','));
    for (const entry of [...battle.allies, ...battle.enemies]) {
      const sides = sidesByVehicle.get(entry.id) ?? new Set();
      sides.add(entry.team); sidesByVehicle.set(entry.id, sides);
    }
  }
  assert.equal(lineups.size, 16, 'different session seeds field different allied teams');
  assert.ok([...sidesByVehicle.values()].filter(sides => sides.size === 2).length >= 15,
    'vehicles rotate between allies and enemies rather than being assigned a permanent side');
  const lone = play('turbo_ball', 't90m_x', 3, { allies: 0, enemies: BATTLE_FIELD_LIMIT - 1 });
  assert.equal(lone.allies.length, 0, 'a lone player fields no allied bots');
  assert.equal(lone.enemies.length, BATTLE_FIELD_LIMIT - 1, `1 v ${BATTLE_FIELD_LIMIT - 1} fields the whole limit against the player`);
  seated(lone, `1 v ${BATTLE_FIELD_LIMIT - 1}`);
  const capped = play('capture_the_flag', 'leo2a7v', 4, { allies: 30, enemies: 30 });
  assert.equal(capped.enemies.length, 30, 'the typed enemy count is kept under the field limit');
  assert.equal(capped.allies.length, BATTLE_FIELD_LIMIT - 1 - 30, 'the allied bots yield to the field limit');
  const horde = play('endless_horde', 'm1a2', 5, { allies: 2, enemies: 14, waveSize: 5, enemyNation: 'germany' });
  assert.equal(horde.allies.length, 2, 'Horde keeps its arranged allied bots');
  assert.equal(horde.enemies.length, 14, 'Horde keeps its arranged pool');
} finally {
  world.release();
}
console.log(`battleSides.selftest: 7 v 7, 14 v 14 and 1 v ${BATTLE_FIELD_LIMIT - 1} seat distinct vehicles apart and inside the playable extent on ruinspires PASS`);
