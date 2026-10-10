// Symmetric deployments (modes lane, 2026-10-08): a solo battle and a hosted one deploy alike. On every map the solo
// sim (setupBattle: the player, then the allied bots, then the hostiles) and the authority (a side's vehicles in
// order) seat each side's k-th vehicle on the same deployment slot — one placement call (sim/deployment.ts through
// sim/matchPlacement.ts), no second policy (the 104 x 30 m solo wedge and the authority's 24 m block are gone).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, setupBattle } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createMatchPlacement, matchPlacementAnchors } from '../sim/matchPlacement.ts';
import { MAP_IDS } from '../world/maps/index.ts';

const solo = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
assert.match(solo, /context\.placement\.deploymentSlot\(team, team === 'alpha' \? context\.allyIndex\+\+ : context\.enemyIndex\+\+\)/,
  'the solo sim seats both sides through the placement\'s deployment slots');
assert.doesNotMatch(solo, /allySpawnPoint|reuseSpawnPad|spawnPoints\.enemies\[/, 'no solo wedge or pad policy left');

await ensureFullFleet();
const near = (entity, slot) => Math.hypot(entity.state.pos.x - slot.x, entity.state.pos.z - slot.z);
let checked = 0, worst = 0;
for (const mapId of MAP_IDS) {
  const world = createDedicatedWorldCollision(mapId);
  const authored = world.heightField._layout.spawns;
  const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
  const placement = createMatchPlacement({ mapId, heightField: world.heightField, obstacles: world.getObstacles(), queryObstacles: world.queryObstacles,
    anchors: matchPlacementAnchors(authored), mode: 'standard' });
  // the solo battle: the player and six allied bots against seven
  const game = createGameState({ rosterSeed: 3 }); game.mapId = mapId;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
  game.battleCount = 1;
  setupBattle(game, 'm1a2', world, { gameMode: 'standard', random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  const soloSides = { alpha: game.tanks.filter((entity) => entity.team === 'player'), bravo: game.tanks.filter((entity) => entity.team === 'enemy') };
  assert.equal(soloSides.alpha[0], game.tanks[0], `${mapId}: the player leads the allied side`);
  // the hosted battle: seven a side, the same hulls in the same slots
  const players = [...soloSides.alpha.map((entity, i) => ({ id: `a${i}`, specId: entity.specId, team: 'alpha', bot: i > 0 })),
    ...soloSides.bravo.map((entity, i) => ({ id: `b${i}`, specId: entity.specId, team: 'bravo', bot: true }))];
  const match = createAuthoritativeMatch({ mapId, gameMode: 'standard', seed: 11, countdownS: 0, worldCollision: world, players });
  const hosted = { alpha: match.entities.filter((entity) => entity.team === 'alpha'), bravo: match.entities.filter((entity) => entity.team === 'bravo') };
  for (const team of ['alpha', 'bravo']) {
    assert.equal(soloSides[team].length, 7, `${mapId}: seven a side solo`);
    for (let k = 0; k < 7; k++) {
      const slot = placement.deploymentSlot(team, k);
      const s = near(soloSides[team][k], slot), h = near(hosted[team][k], slot);
      worst = Math.max(worst, s, h);
      assert.ok(s < 0.5, `${mapId} ${team} ${k}: solo seats on the slot (${s.toFixed(2)} m)`);
      assert.ok(h < 0.5, `${mapId} ${team} ${k}: the host seats on the slot (${h.toFixed(2)} m)`);
      assert.ok(Math.hypot(soloSides[team][k].state.pos.x - hosted[team][k].state.pos.x, soloSides[team][k].state.pos.z - hosted[team][k].state.pos.z) < 0.5,
        `${mapId} ${team} ${k}: solo and host agree`);
      checked++;
    }
  }
  world.release?.();
}
console.log(`deploymentParity.selftest: ${MAP_IDS.length} maps, ${checked} seats — solo and host on the same deployment slot (worst ${worst.toFixed(2)} m off its slot after the settle)`);
