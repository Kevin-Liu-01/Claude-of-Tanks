// The dev battle hold (game/devBattleHold.ts; its switch dev/battleHold.ts, `__DEBUG.battleHold`): a held solo battle stays
// alive and still for a check (track-system-audit's inspection camera, voice-smoke's minutes on the radio).
// Held here, on a seeded 7v7 Verdant battle seated by the page's own setupBattle with two hostiles on the player's flank:
// - off is the step: armed false, the battle is the battle the field was never written in, every tick's hash the same;
// - the window fights: unheld, the bots fire, and a round into the player's flank and a fire in its hull hurt it;
// - held from its first step, the bots stand and never fire, the player's hit points, modules and crew never fall and
//   the battle reaches no verdict; armed mid-battle, the hashes part at the arming tick and not before (the negative
//   control), the bots brake to a stand and fire no more, and a fire already burning costs the player nothing more;
// - a held battle whose every hostile is slain stays unsettled, and settles victory on its first step after the release;
// - the undo (losses back, gains stand), the switch's refusals (a public build, a network battle) and the wiring: the
//   step reads the hold only through game/devBattleHold.ts, __DEBUG installs the switch, and both tools arm it in place
//   of the dead godMode / freezeBots flags.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import * as detMath from '../sim/detMath.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { createShell } from '../sim/ballistics.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { DEV_BATTLE_HOLD, battleHeld, holdBattleStep, undoHeldDamage } from './devBattleHold.ts';
import { createBattleHold } from '../dev/battleHold.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---- the undo: losses back, gains stand --------------------------------------------------------------------------------
{
  const combat = () => ({
    hp: 900, maxHp: 1000, destroyed: false,
    modules: { engine: { hp: 80, maxHp: 100, state: 'yellow', repairT: 2 }, gun: { hp: 100, maxHp: 100, state: 'ok', repairT: 0 } },
    crew: { commander: true, gunner: true, driver: false },
    fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
    eraSpent: new Set(['hull_l_1']),
  });
  const input = () => ({ throttle: 1, steer: -0.5, brake: false, aimLocked: false, fire: true, actionBits: 9, auxiliaryBits: 64 });
  const player = { input: input(), combat: combat() };
  const bot = { input: input(), combat: combat() };
  const game = { devBattleHold: true, player, tanks: [player, bot] };
  assert.equal(battleHeld(game), DEV_BATTLE_HOLD, 'armed with a player seat, the step is held');
  assert.equal(battleHeld({ ...game, player: null }), false, 'a watched battle (no player seat) is never held');
  assert.equal(battleHeld({ ...game, devBattleHold: false }), false, 'unarmed, never held');
  holdBattleStep(game);
  assert.deepEqual(bot.input, { throttle: 0, steer: 0, brake: true, aimLocked: true, fire: false, actionBits: 0, auxiliaryBits: 0 },
    'a held bot stands: no drive, brakes on, its lay held, no trigger, no action');
  assert.deepEqual(player.input, input(), "the player's own controls are the player's");
  const c = player.combat;
  // the step's blows: hit points, a module, a crewman, a fire, an ERA tile, the hull itself; and its gains: a repair
  c.hp = 0; c.destroyed = true;
  c.modules.gun.hp = 10; c.modules.gun.state = 'red'; c.modules.gun.repairT = 6;
  c.modules.engine.hp = 95; c.modules.engine.state = 'ok'; c.modules.engine.repairT = 0;
  c.crew.gunner = false;
  c.fire.burning = true; c.fire.ticksLeft = 8;
  c.eraSpent.add('turret_r_2');
  undoHeldDamage(game);
  assert.equal(c.hp, 900); assert.equal(c.destroyed, false);
  assert.deepEqual(c.modules.gun, { hp: 100, maxHp: 100, state: 'ok', repairT: 0 }, 'a struck module comes back');
  assert.deepEqual(c.modules.engine, { hp: 95, maxHp: 100, state: 'ok', repairT: 0 }, 'a repair the step made stands');
  assert.deepEqual(c.crew, { commander: true, gunner: true, driver: false }, 'the crew come back; the already dead stay so');
  assert.deepEqual(c.fire, { burning: false, tickTimer: 0, ticksLeft: 0 }, 'a fire the step lit is out');
  assert.deepEqual([...c.eraSpent], ['hull_l_1'], 'ERA the step spent is back; ERA spent before stays spent');
  c.hp = 950;
  undoHeldDamage(game);
  assert.equal(c.hp, 950, 'a heal stands');
}

// ---- the switch: armed, released, refused in a public build and a network battle ---------------------------------------
{
  const game = {};
  let network = false;
  const hold = createBattleHold({ getGame: () => game, isNetworkBattle: () => network });
  assert.equal(hold.armed, false);
  assert.equal(hold.set(true), true);
  assert.equal(game.devBattleHold, true);
  assert.equal(hold.armed, true);
  assert.equal(hold.set(false), false);
  assert.equal(hold.armed, false);
  assert.throws(() => hold.set('yes'), /true or false/);
  network = true;
  assert.throws(() => hold.set(true), /network battle is never held/);
  assert.equal(game.devBattleHold, false, 'a refused arm writes nothing');
  assert.equal(hold.set(false), false, 'a release is always allowed');
  const publicHold = createBattleHold({ getGame: () => game, isNetworkBattle: () => false, enabled: false });
  assert.throws(() => publicHold.set(true), /public build has no battle hold/);
  game.devBattleHold = true;
  assert.equal(publicHold.armed, false, 'a public build reads no hold, whatever the field says');
}

// ---- the build switch and the wiring ----------------------------------------------------------------------------------
{
  const hold = read('./devBattleHold.ts');
  assert.match(hold, /export const DEV_BATTLE_HOLD = import\.meta\.env\?\.VITE_PUBLIC_BUILD !== '1';/,
    'the public build (npm run build sets VITE_PUBLIC_BUILD=1) carries no hold');
  assert.equal(DEV_BATTLE_HOLD, true, 'the Node and dev runtimes carry it');
  assert.match(hold, /return DEV_BATTLE_HOLD && game\.devBattleHold === true && game\.player !== null;/,
    'every held read passes the build switch');
  const state = read('./state.ts');
  assert.doesNotMatch(state, /game\.devBattleHold/, 'the step never reads the field itself, only through battleHeld');
  assert.match(state, /function stepBotControllers\(game: SoloGameState\): void \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(battleHeld\(game\)\) \{ holdBattleStep\(game\); return; \}/,
    "a held step's bots stand in place of their controllers (proving targets too)");
  assert.match(state, /function stepMatchMode\(game: SoloGameState, bus: EventBus\): MatchModeResult \| null \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(battleHeld\(game\)\) undoHeldDamage\(game\);/,
    "the player's losses are undone before the mode and the verdict read them");
  assert.match(state, /if \(game\.result !== null \|\| !seat \|\| battleHeld\(game\)\) return;/, 'a held battle reaches no verdict');
  assert.match(state, /\): void \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(ent === game\.player && battleHeld\(game\)\) return;\n\s*ent\._destroyedAnnounced = true;/,
    'a held player is never announced destroyed');
  assert.match(state, /for\(const entity of game\.tanks\)\{if\(held&&entity!==game\.player\)continue;/,
    "a held bot's roof guns stand silent");
  const surface = read('../dev/debugSurface.ts');
  assert.match(surface, /battleHold: createBattleHold\(\{ getGame: \(\) => deps\.game, isNetworkBattle: deps\.isNetworkBattle \}\),/,
    '__DEBUG.battleHold is the switch');
  assert.match(read('../main.ts'), /isNetworkBattle: onlineMatchActive,/, 'the switch knows a network battle');
  const audit = read('../../tools/track-system-audit.mjs'), smoke = read('../../tools/voice-smoke.mjs');
  for (const [name, source] of [['track-system-audit', audit], ['voice-smoke', smoke]]) {
    assert.match(source, /__DEBUG\.battleHold\.set\(true\)/, `${name} holds its battle`);
    assert.doesNotMatch(source, /godMode|freezeBots/, `${name} writes no dead flag`);
  }
}

// ---- the seeded battle ------------------------------------------------------------------------------------------------
await ensureFullFleet();
const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4();
const _turret = new Matrix4(), _bore = new Vector3();
// the gun's muzzle and bore as the authority poses them (soloKernelMemoryGrowth.selftest.mjs)
function gunPose(entity, muzzleOut, dirOut) {
  const s = entity.state, armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, Number.isFinite(armor.gunBarrel?.lengthM) ? armor.gunBarrel.lengthM : 3);
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(s.modeScale ?? 1);
  _hull.compose(s.pos, _quat, _unit);
  _local.makeRotationY(s.turretYaw);
  _local.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  _bore.set(0, detMath.sin(s.gunPitch), detMath.cos(s.gunPitch)).transformDirection(_turret).normalize();
  if (dirOut) dirOut.copy(_bore);
  if (muzzleOut) muzzleOut.set(gunPivot[0], gunPivot[1], gunPivot[2]).applyMatrix4(_turret).addScaledVector(_bore, barrelM * (s.modeScale ?? 1));
}
const visualFor = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
  gunMuzzleWorld: (out) => gunPose(entity, out, null), gunDirWorld: (out) => gunPose(entity, null, out),
  gunPivotWorld: (out) => out.copy(entity.state.pos) });

const f64 = new Float64Array(1), f64Bytes = new Uint8Array(f64.buffer);
const feed = (hash, value) => { f64[0] = Number(value); hash.update(f64Bytes); };
const STATE = ['yaw', 'speed', 'verticalSpeed', 'yawRate', 'turretYaw', 'gunPitch', 'visualPitch', 'visualRoll', 'bloomF'];
/** Every hull's state, combat and input, the shells in flight, the verdict and the clock, as one hash. */
function tickHash(game) {
  const hash = createHash('sha256');
  for (const e of game.allTanks) {
    hash.update(e.id);
    if (!e.state) continue;
    feed(hash, e.state.pos.x); feed(hash, e.state.pos.y); feed(hash, e.state.pos.z);
    for (const key of STATE) feed(hash, e.state[key] ?? 0);
    const c = e.combat;
    feed(hash, c.hp); feed(hash, c.destroyed ? 1 : 0); feed(hash, c.reload?.t ?? 0); feed(hash, c.fire?.burning ? 1 : 0);
    for (const name of Object.keys(c.modules ?? {}).sort()) { feed(hash, c.modules[name].hp); hash.update(c.modules[name].state); }
    for (const name of Object.keys(c.crew ?? {}).sort()) feed(hash, c.crew[name] ? 1 : 0);
    feed(hash, e.input.throttle ?? 0); feed(hash, e.input.steer ?? 0); feed(hash, e.input.fire ? 1 : 0);
  }
  for (const s of game.shells) { feed(hash, s.id); feed(hash, s.pos.x); feed(hash, s.pos.y); feed(hash, s.pos.z); }
  hash.update(String(game.result));
  feed(hash, game.timeS);
  return hash.digest('hex');
}
const damageOf = (combat) => JSON.stringify({ hp: combat.hp, destroyed: combat.destroyed, crew: combat.crew,
  modules: Object.fromEntries(Object.entries(combat.modules).map(([name, m]) => [name, [m.hp, m.state]])) });

/** The blows every run takes the same: a hostile's round into the player's flank from 8 m, then a fire in its hull. */
const STRIKE_AT = 120, BURN_AT = 300;
const _from = new Vector3(), _toward = new Vector3();
function blows(tick, game, world, injected) {
  const player = game.player;
  if (tick === STRIKE_AT) {
    const foe = game.tanks.find((e) => e.team === 'enemy');
    const side = player.state.yaw + Math.PI / 2, midY = player.state.pos.y + player.spec.dims.heightM * 0.45;
    const x = player.state.pos.x + 8 * Math.sin(side), z = player.state.pos.z + 8 * Math.cos(side);
    _from.set(x, Math.max(midY, world.heightField.getHeightAt(x, z) + 0.6), z);
    _toward.set(player.state.pos.x, midY, player.state.pos.z).sub(_from).normalize();
    const shell = createShell(foe.spec.gun.shells[0], foe.id, false, _from, _toward, game.nextShellId++);
    injected.add(shell.id);
    game.shells.push(shell);
  }
  if (tick === BURN_AT) Object.assign(player.combat.fire, { burning: true, tickTimer: 0, ticksLeft: 12 });
}

/**
 * The battle stepped `ticks` ticks. `hold(tick)` returns what the field is set to before that tick's step (undefined leaves
 * it alone; the field is never written when it always does); `onTick(tick, game)` runs after the hold, before the step.
 */
function battle(ticks, { hold = () => undefined, onTick = null } = {}) {
  const world = createDedicatedWorldCollision('verdant');
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.battleCount = 1;
  setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.preBattleS = 0;
  const player = game.player;
  // two hostiles 110 m off the player's flank, facing it: the battle fights the player inside the window
  const side = player.state.yaw + Math.PI / 2;
  for (const [index, foe] of game.tanks.filter((e) => e.team === 'enemy').slice(0, 2).entries()) {
    const x = player.state.pos.x + 110 * Math.sin(side) + index * 14 * Math.cos(side);
    const z = player.state.pos.z + 110 * Math.cos(side) - index * 14 * Math.sin(side);
    foe.state.pos.set(x, world.heightField.getHeightAt(x, z) + 0.2, z);
    foe.state.yaw = side + Math.PI;
    foe.state.speed = 0;
  }
  const bus = createBus(() => {});
  const collider = createCollider(game, world);
  const hashes = [], seen = new Set(), injected = new Set(), heldBotShots = [], playerDamage = [], playerHp = [];
  const playerStart = damageOf(player.combat);
  const bots = game.tanks.filter((e) => e !== player);
  let armedAt = null, lastSecond = null, maxBotDriftM = 0, lastSecondDriftM = 0;
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      const set = hold(tick);
      if (set !== undefined) game.devBattleHold = set;
      if (set === true) armedAt = new Map(bots.map((e) => [e.id, e.state.pos.clone()]));
      if (tick === ticks - 60) lastSecond = new Map(bots.map((e) => [e.id, e.state.pos.clone()]));
      blows(tick, game, world, injected);
      onTick?.(tick, game);
      simStep(game, bus, world, null, collider);
      for (const s of game.shells) {
        if (seen.has(s.id) || injected.has(s.id)) continue;
        seen.add(s.id);
        if (s.shooterId !== player.id && game.devBattleHold) heldBotShots.push(tick);
      }
      if (damageOf(player.combat) !== playerStart) playerDamage.push(tick);
      playerHp.push(player.combat.hp);
      hashes.push(tickHash(game));
    }
    const drift = (from, e) => Math.hypot(e.state.pos.x - from.get(e.id).x, e.state.pos.z - from.get(e.id).z);
    for (const e of bots) {
      if (armedAt) maxBotDriftM = Math.max(maxBotDriftM, drift(armedAt, e));
      if (lastSecond) lastSecondDriftM = Math.max(lastSecondDriftM, drift(lastSecond, e));
    }
    return { game, hashes, botShots: seen.size, heldBotShots, playerDamage, playerHp, maxBotDriftM, lastSecondDriftM };
  } finally {
    world.release?.();
  }
}
const firstParting = (a, b) => a.findIndex((hash, i) => hash !== b[i]);

const TICKS = 1500;
const plain = battle(TICKS);
assert.ok(plain.botShots >= 6, `the window fights (${plain.botShots} rounds fired)`);
assert.equal(plain.playerDamage[0], STRIKE_AT, `unheld, the round into the flank hurts the player (first loss at tick ${plain.playerDamage[0]})`);
assert.ok(plain.playerHp[BURN_AT + 120] < plain.playerHp[BURN_AT - 2], 'unheld, the fire costs the player hit points');
assert.equal(plain.game.result, null, 'the window ends before any verdict');

const off = battle(TICKS, { hold: (tick) => (tick === 1 ? false : undefined) });
assert.equal(firstParting(off.hashes, plain.hashes), -1, 'off, the step is the step: every tick byte for byte the unwritten battle');

const held = battle(TICKS, { hold: (tick) => (tick === 1 ? true : undefined) });
assert.deepEqual(held.heldBotShots, [], 'held from its first step, no bot fires');
assert.deepEqual(held.playerDamage, [], "held, the round and the fire cost the player nothing: hit points, modules and crew");
assert.ok(held.maxBotDriftM < 0.05, `held from its first step, the bots stand where they were seated (${held.maxBotDriftM.toFixed(3)} m)`);
assert.equal(held.game.result, null);

// armed mid-battle: the hashes part at the arming tick and not before (the negative control), no bot fires from then on,
// the bots brake to a stand, and the fire already in the player's hull costs it nothing more
const AT = 400;
const late = battle(AT + 300, { hold: (tick) => (tick === AT ? true : undefined) });
assert.equal(firstParting(late.hashes, plain.hashes), AT - 1, 'armed mid-battle, the battle parts at the arming tick, and not before');
assert.deepEqual(late.heldBotShots, [], 'armed mid-battle, no bot fires from then on');
assert.ok(plain.playerHp[AT + 120] < plain.playerHp[AT - 2], 'the fire still burns past the arming tick unheld');
assert.equal(Math.min(...late.playerHp.slice(AT - 1)), late.playerHp[AT - 2], 'held, the burning hull loses no more');
assert.ok(late.lastSecondDriftM < 0.1, `armed mid-battle, the bots come to a stand (${late.lastSecondDriftM.toFixed(3)} m in the last second)`);

// the verdict waits: every hostile slain under the hold, no victory until the release
const slain = battle(12, {
  hold: (tick) => (tick === 1 ? true : tick === 10 ? false : undefined),
  onTick: (tick, game) => {
    if (tick === 3) for (const e of game.tanks) if (e.team === 'enemy') { e.combat.hp = 0; e.combat.destroyed = true; }
    if (tick === 9) assert.equal(game.result, null, 'a held battle with no hostile left reaches no verdict');
  },
});
assert.equal(slain.game.result, 'victory', 'released, the battle settles on its next step');
assert.equal(slain.game.resultReason, 'elimination');

console.log(`devBattleHold selftest passed: off byte-identical over ${TICKS} ticks; unheld ${plain.botShots} rounds, the player hurt `
  + `from tick ${plain.playerDamage[0]}; held 0 bot rounds, no player loss, bots within ${held.maxBotDriftM.toFixed(3)} m, no verdict; `
  + `armed at tick ${AT} the battle parts there, the bots stand (${late.lastSecondDriftM.toFixed(3)} m in the last second) and the `
  + 'fire costs nothing; the verdict waits for the release; undo, switch and wiring held');
process.exit(0);
