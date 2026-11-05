// Round 2 (U18) of the 2026-11-02 audit M7: a revived bot's brain resumes from its new hull. A mode's revive (both drivers'
// revive hooks, which the mode controller calls) builds a new hull at the spawn and leaves the same controller driving
// it, and the controller was not stepped while its hull lay dead: what it measures from one tick to the next read the
// teleport from the wreck to the spawn as one tick of its own (a progress spike), and its legs, spot and mission route
// were the last life's. ai.ts resume() is the controller's hand-back entry point (Watch mode's Leave uses it too).
// Reproduced on 50197fdf43: neither revive hook called it, and on the first tick of the new life the bot's progress rate
// read hundreds of metres a second. Pins: on the authority and on the solo battle, every revive hands the brain back
// with the battle's clock, and the first tick of the new life reads no progress spike.
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { SIM_DT } from '../sim/movement.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

/** Count the resumes a hull's brain hears, with the clock each one carries. */
function spyResume(entity) {
  const calls = [];
  const ctl = entity.aiCtl;
  const original = typeof ctl.resume === 'function' ? ctl.resume.bind(ctl) : null;
  ctl.resume = (timeS, firstShellId) => { calls.push(timeS); original?.(timeS, firstShellId); };
  return calls;
}

/** Kill `entity` 150 m off its spawn, step until a revive raises it, then one step of the new life. */
function reviveOnce(entity, step, clock, label) {
  const calls = spyResume(entity);
  entity.state.pos.x += 150;
  entity.state.pos.z += 40;
  step(); // the brain drives one tick where the wreck will lie
  entity.combat.destroyed = true;
  entity.combat.hp = 0;
  const oldCombat = entity.combat;
  let ticks = 0;
  while (ticks++ < 1200 && (entity.combat === oldCombat || entity.combat.destroyed)) step();
  const revived = entity.combat !== oldCombat && !entity.combat.destroyed;
  const atRevive = clock();
  step(); // the first tick of the new life
  const info = entity.aiCtl.debugInfo();
  ok(revived, `${label}: the mode revives the bot (${ticks} ticks)`);
  ok(calls.length === 1 && Math.abs(calls[0] - atRevive) < 1e-9,
    `${label}: the revive hands the brain back once, on the battle's clock (${calls.length} call(s)${calls.length ? ` at ${calls[0].toFixed(2)} s, revive at ${atRevive.toFixed(2)} s` : ''})`);
  ok(info.progressRate < 5, `${label}: no progress spike on the first tick of the new life (progressRate ${info.progressRate} m/s)`);
}

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});
await ensureFullFleet();

console.log('[1] the authority\'s revive hands the brain back');
{
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 321, countdownS: 0, gameMode: 'capture_the_flag',
    players: [
      { id: 'a1', specId: 'm1a1_abrams_hc', team: 'alpha', bot: true, spawn: { x: 0, z: -200, yaw: 0 } },
      { id: 'a2', specId: 't90am', team: 'alpha', bot: true, spawn: { x: 24, z: -200, yaw: 0 } },
      { id: 'b1', specId: 't90am', team: 'bravo', bot: true, spawn: { x: 6, z: 200, yaw: Math.PI } },
      { id: 'b2', specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, spawn: { x: 30, z: 200, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  const inputs = new Map();
  const step = () => match.step({ dt: SIM_DT, inputs });
  for (let i = 0; i < 60; i++) step();
  const bot = match.entities.find((entity) => entity.id === 'a2');
  reviveOnce(bot, step, () => match.timeS, 'authority');
}

console.log('[2] the solo battle\'s revive hands the brain back');
{
  const MAP = 'steppe';
  const field = createDedicatedWorldCollision(MAP);
  const authored = field.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
    gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
    gunDirWorld: (out) => {
      const yaw = entity.state.yaw + entity.state.turretYaw, pitch = entity.state.gunPitch ?? 0;
      return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    } });
  const game = createGameState({ rosterSeed: 11 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual(entity);
  const bus = createBus(() => {});
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode: 'capture_the_flag', watch: false, random: true, arrangement: null, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  const collider = createCollider(game, field);
  const step = () => simStep(game, bus, field, null, collider);
  for (let i = 0; i < 60; i++) step();
  const bot = game.tanks.find((entity) => entity.aiCtl && !entity.isPlayer && entity.team === 'player')
    ?? game.tanks.find((entity) => entity.aiCtl && !entity.isPlayer);
  ok(!!bot, `a bot to revive (${bot?.id})`);
  if (bot) reviveOnce(bot, step, () => game.timeS, 'solo');
}

if (failures) { console.error(`ai.reviveResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.reviveResume.selftest: both drivers hand a revived bot\'s brain back through resume()');
