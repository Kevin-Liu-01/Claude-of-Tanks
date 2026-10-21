// The Horde's zombies play a bot difficulty tier down (owner 2026-10-17: "all the zombies actually have low hp ... make
// this more fun"; matchRuleset.ts `horde.hostileDifficultyStep`). zombieBalance.selftest pins the pure step; this
// receipt pins the two places that build a bot with it: the network authority (sim/authoritativeMatch.ts
// initializeBot, the seat's difficulty) and the solo battle (game/state.ts createBattleBot, the stored setting). Each
// reads the tier the AI controller was actually built with (`aiCtl.difficulty`), so dropping the ruleset call from
// either builder fails here. Allies and every other mode keep the tier they were given.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { matchRulesetFor, rulesetBotDifficulty } from '../sim/matchRuleset.ts';
import { createGameState, setupBattle } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

assert.equal(matchRulesetFor('endless_horde').horde.hostileDifficultyStep, 1, 'the Horde steps its hostiles one tier down');

// --- the authority: a seat's difficulty, stepped down on bravo in the Horde ------------------------------------------
const seats = [
  { id: 'pilot', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -60, yaw: 0 } },
  { id: 'ally', specId: 'm1a1_abrams_hc', team: 'alpha', bot: true, difficulty: 'normal', spawn: { x: 20, z: -70, yaw: 0 } },
  { id: 'zEasy', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, difficulty: 'easy', spawn: { x: -20, z: 90, yaw: Math.PI } },
  { id: 'zNormal', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, difficulty: 'normal', spawn: { x: 0, z: 90, yaw: Math.PI } },
  { id: 'zHard', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, difficulty: 'hard', spawn: { x: 20, z: 90, yaw: Math.PI } },
];
const authorityTiers = (gameMode) => {
  const match = createAuthoritativeMatch({ gameMode, countdownS: 0, mapId: 'verdant', seed: 31, players: seats.map((seat) => ({ ...seat })) });
  return Object.fromEntries(seats.filter((seat) => seat.bot).map((seat) => [seat.id, match.entityById.get(seat.id).aiCtl.difficulty]));
};
assert.deepEqual(authorityTiers('endless_horde'), { ally: 'normal', zEasy: 'easy', zNormal: 'easy', zHard: 'normal' },
  'authority Horde: each zombie seat plays one tier below its own (never under easy); the allied bot keeps its tier');
assert.deepEqual(authorityTiers('standard'), { ally: 'normal', zEasy: 'easy', zNormal: 'normal', zHard: 'hard' },
  'authority Standard: every seat keeps its tier');

// --- the solo battle: the stored setting, stepped down on the enemy side in the Horde ----------------------------------
const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});
const world = createDedicatedWorldCollision('steppe');
try {
  const authored = world.heightField._layout.spawns;
  const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
  const soloTiers = (gameMode, stored) => {
    settings.set('cot.settings.v1', JSON.stringify({ aiDifficulty: stored }));
    const game = createGameState({ rosterSeed: 5 }); game.mapId = 'steppe';
    spawnTanks(game, { scene: { remove() {} } });
    for (const entity of game.allTanks) entity.visual = { root: {}, setVisible() {}, syncFromState() {}, dispose() {} };
    game.battleCount = 1;
    setupBattle(game, 'm1a3', world, { gameMode, random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
    const bots = game.tanks.filter((entity) => !entity.isPlayer);
    const tiers = (team) => [...new Set(bots.filter((entity) => entity.team === team).map((entity) => entity.aiCtl?.difficulty))];
    assert.ok(bots.length && bots.every((entity) => entity.aiCtl), `${gameMode}: every bot is built with a controller`);
    return { allies: tiers('player'), enemies: tiers('enemy'), ruleset: game.ruleset };
  };
  for (const [stored, stepped] of [['hard', 'normal'], ['normal', 'easy'], ['easy', 'easy']]) {
    const horde = soloTiers('endless_horde', stored);
    assert.deepEqual(horde.enemies, [stepped], `solo Horde on ${stored}: every zombie plays ${stepped}`);
    assert.deepEqual(horde.allies, [stored], `solo Horde on ${stored}: the allied bots keep the setting`);
    assert.equal(rulesetBotDifficulty(horde.ruleset, 'enemy', stored), stepped, 'the solo tier is the ruleset\'s');
  }
  const standard = soloTiers('standard', 'normal');
  assert.deepEqual([standard.allies, standard.enemies], [['normal'], ['normal']], 'solo Standard: both sides keep the setting');
} finally {
  world.release();
  delete globalThis.localStorage;
}

console.log('zombieBotTier.selftest: the Horde\'s zombies play a tier down in the authority (per seat) and the solo battle (per setting); allies and Standard keep theirs');
