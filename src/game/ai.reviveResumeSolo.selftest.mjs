// Round 2 (U18) of the 2026-11-02 audit M7, the solo battle's half of ai.reviveResume: a mode's revive in the solo step
// (state.ts's revive hook, which the mode controller calls) builds a new hull at the spawn and leaves the same controller
// driving it; the hook hands the brain back (ai.ts resume) on the battle's clock, so the teleport from the wreck to the
// spawn is no tick of the bot's own. Reproduced on 50197fdf43: the hook never called resume(), and on the first tick of
// the new life the bot's progress rate read 776 m/s. Pins: the revive hands the brain back once, on game.timeS, and the
// first tick of the new life reads no progress spike.
// Round 3 (B17): split from ai.reviveResume (14 s of CPU with both drivers, most of it the whole fleet's combat anatomy
// and this battle's import graph); the fleet is narrowed to the battle's participants (ensureAuthorityFleet).
// Round 4 (F10), its tier: the battle is narrowed to three hulls (the player, the allied bot the mode revives, one
// enemy), which cuts the setup, the fleet and every step: 3.8-4.8 s user against 4.6-6.5 s at load 30-40, and the rest is
// state.ts's import graph (2-3.4 s of CPU alone), the floor of every solo-step receipt in the default tier (watchSeat
// 15.8 s user, battleSides 12.2 s). It stays in the default tier: it is the only default-tier receipt of the solo
// revive hook (state.ts setupBattle's revive: ent.aiCtl?.resume?.(game.timeS)), and npm test keeps it covered.
import { SIM_DT } from '../sim/movement.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});

console.log('[1] the solo battle\'s revive hands the brain back');
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
  // three hulls (the player, one allied bot to revive, one enemy): the revive hook is per hull, and the default roster's
  // eleven more cost CPU in the battle's setup, its fleet and every step (round 4 F10)
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode: 'capture_the_flag', watch: false, random: true, arrangement: { allies: 1, enemies: 1 }, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  // the battle's own vehicles' combat anatomy (shell hits read it), not the whole fleet's
  await ensureAuthorityFleet(game.tanks.map((entity) => entity.specId));
  const collider = createCollider(game, field);
  const step = () => simStep(game, bus, field, null, collider);
  for (let i = 0; i < 60; i++) step();
  const bot = game.tanks.find((entity) => entity.aiCtl && !entity.isPlayer && entity.team === 'player')
    ?? game.tanks.find((entity) => entity.aiCtl && !entity.isPlayer);
  ok(!!bot, `a bot to revive (${bot?.id})`);
  if (bot) {
    const calls = [];
    const ctl = bot.aiCtl;
    const original = ctl.resume.bind(ctl);
    ctl.resume = (timeS, firstShellId) => { calls.push(timeS); original(timeS, firstShellId); };
    // killed 150 m off its spawn: the brain drives one tick where the wreck will lie
    bot.state.pos.x += 150;
    bot.state.pos.z += 40;
    step();
    bot.combat.destroyed = true;
    bot.combat.hp = 0;
    const oldCombat = bot.combat;
    let ticks = 0;
    while (ticks++ < 1200 && (bot.combat === oldCombat || bot.combat.destroyed)) step();
    const revived = bot.combat !== oldCombat && !bot.combat.destroyed;
    const atRevive = game.timeS;
    step(); // the first tick of the new life
    const info = bot.aiCtl.debugInfo();
    ok(revived, `the mode revives the bot (${ticks} ticks)`);
    ok(calls.length === 1 && Math.abs(calls[0] - atRevive) < 1e-9,
      `the revive hands the brain back once, on the battle's clock (${calls.length} call(s)${calls.length ? ` at ${calls[0].toFixed(2)} s, revive at ${atRevive.toFixed(2)} s` : ''})`);
    ok(info.progressRate < 5, `no progress spike on the first tick of the new life (progressRate ${info.progressRate} m/s)`);
  }
}

if (failures) { console.error(`ai.reviveResumeSolo.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.reviveResumeSolo.selftest: the solo battle hands a revived bot\'s brain back through resume()');
