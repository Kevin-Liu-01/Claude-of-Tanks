// battleCachesRelease.selftest (battle-retention-279): a solo battle's world is not kept by the page's one game object
// once the next battle is set up. state.ts keys per-battle caches by the game (it lives for the page): the hull actions'
// host (soloActionHosts) and Air Support's fire context (_airFireContexts) each kept the battle's world and bus in a ref
// refreshed only when a later battle stepped them, Air Support's only by a later Air Support battle. On desktop 278 the
// desert world of an Air Support battle stayed alive at the Garage behind a Standard battle on verdant (heap snapshot:
// __DEBUG.game -> a WeakMap entry keyed by the game -> {ref: {world}} -> the world's group). Here: an Air Support battle
// on world A with a strike in flight (both caches made), then a Standard battle set up on world B; world A is collected.
// Real setupBattle and simStep on the dedicated collision world, no vehicle builders, no GPU. And the class closed by a
// census (Main 2026-11-27): every game-keyed WeakMap or Map in src is made by state.ts battleCache (the registry
// resetBattleSession clears); a planted unlisted cache is the census's control.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';
import vm from 'node:vm';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { AIR_SUPPORT_RULES as R } from '../sim/matchRuleset.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// the census: a WeakMap or Map keyed by the solo game state made anywhere but state.ts battleCache
const GAME_KEYED = /new\s+(?:Weak)?Map\s*<\s*(?:SoloGameState|GameState)\b/g;
const REGISTRY_SITE = 'const cache = new WeakMap<SoloGameState, V>();';
function gameKeyedCaches(path, text) {
  const out = [];
  for (const line of text.split('\n')) {
    GAME_KEYED.lastIndex = 0;
    if (!GAME_KEYED.test(line)) continue;
    if (path === 'src/game/state.ts' && line.trim() === REGISTRY_SITE) continue;
    out.push(`${path}: ${line.trim().slice(0, 120)}`);
  }
  return out;
}
const root = fileURLToPath(new URL('../..', import.meta.url));
const sources = readdirSync(join(root, 'src'), { recursive: true }).map(String)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')).map((file) => `src/${file.split('\\').join('/')}`);
assert.ok(sources.includes('src/game/state.ts') && sources.length > 500, `census: src listed (${sources.length} files)`);
const unlisted = sources.flatMap((path) => gameKeyedCaches(path, readFileSync(join(root, path), 'utf8')));
assert.deepEqual(unlisted, [], 'census: every game-keyed cache in src is made by battleCache (resetBattleSession clears it)');
const stateText = readFileSync(join(root, 'src/game/state.ts'), 'utf8');
assert.equal(stateText.split(REGISTRY_SITE).length - 1, 1, 'census: the registry makes its caches at one site');
assert.match(stateText, /for \(const cache of battleCaches\) cache\.delete\(game\);/, 'census: resetBattleSession clears every battle cache');
// the control: an unlisted game-keyed cache planted in a source is found
assert.equal(gameKeyedCaches('src/game/planted.ts', 'const planted = new WeakMap<SoloGameState, { world: object }>();').length, 1,
  'census control: a planted unlisted game-keyed cache is found');
assert.equal(gameKeyedCaches('src/game/planted.ts', 'const planted = new Map<GameState, number>();').length, 1,
  'census control: a planted game-keyed Map is found');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});
await ensureAuthorityFleet(TANK_IDS);
const MAP = 'steppe';
const makeWorld = () => {
  const world = createDedicatedWorldCollision(MAP);
  const authored = world.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  return world;
};
const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
  gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
  gunDirWorld: (out) => out.set(0, 0, 1) });
const options = (gameMode) => ({ gameMode, random: false, arrangement: null, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });

const game = createGameState({ rosterSeed: 3 });
game.mapId = MAP;
spawnTanks(game, { scene: { remove() {} } });
for (const entity of game.allTanks) entity.visual = visual(entity);
const bus = createBus(() => {});

// battle 1: Air Support on world A, a strike called and in flight while the step runs (its fire context is made)
const worldA = (() => {
  const world = makeWorld();
  setupBattle(game, TANK_IDS[0], world, options('air_support'));
  const air = game.matchModeController?.airSupport;
  assert.ok(air, 'setup: Air Support has its controller');
  const saved = air.capture();
  saved.points = game.tanks.map((t) => [t.id, t === game.player ? R.points.cap : 0]);
  air.restore(saved);
  const collider = createCollider(game, world);
  const p = game.player.state.pos;
  const accepted = air.requestStrike(game.player.id, 'artillery', p.x + 60, p.z + 60, game.timeS);
  assert.ok(accepted, 'setup: the player\'s artillery call is accepted');
  let inFlight = 0;
  for (let n = 0; n < 30; n++) { if (air.strikes.length) inFlight++; simStep(game, bus, world, null, collider); }
  assert.ok(inFlight > 0, 'setup: the strike was in flight while the battle stepped (Air Support\'s fire context made)');
  return new WeakRef(world);
})();

// battle 2: Standard on world B (the next battle on the same page game)
{
  const world = makeWorld();
  setupBattle(game, TANK_IDS[0], world, options('standard'));
  const collider = createCollider(game, world);
  for (let n = 0; n < 5; n++) simStep(game, bus, world, null, collider);
  globalThis.__worldB = world;
}

// collections in fresh jobs, the WeakRef read once after them (a deref keeps its target alive to the end of its job)
for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); gc(); }
await new Promise((resolve) => setImmediate(resolve));
assert.ok(worldA.deref() === undefined, 'the Air Support battle\'s world is collected once the next battle is set up (no per-game cache keeps it)');
delete globalThis.__worldB;
console.log(`battleCachesRelease.selftest: an Air Support battle's world is released by the page game when the next battle is set up; every game-keyed cache in src (${sources.length} files) is made by battleCache`);
