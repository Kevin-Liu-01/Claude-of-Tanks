// The dev battle hold (game/devBattleHold.ts; its switch dev/battleHold.ts, `__DEBUG.battleHold`): a held solo battle stays
// alive and still for a check (track-system-audit's inspection camera, voice-smoke's minutes on the radio).
// Held here, on a seeded 7v7 Verdant battle seated by the page's own setupBattle with a named line-up (LINE_UP, not a draw
// from the roster) and two hostiles on the player's flank:
// - off is the step: armed false, the battle is the battle the field was never written in, every tick's hash the same;
// - the window fights: unheld, the bots fire, and a round into the player's flank and a fire in its hull hurt it;
// - held from its first step, the bots stand and never fire, the player's hit points, modules and crew never fall and
//   the battle reaches no verdict; armed mid-battle, the hashes part at the arming tick and not before (the negative
//   control), the bots brake to a stand and fire no more, and a fire already burning costs the player nothing more;
// - a held battle whose every hostile is slain stays unsettled, and settles victory on its first step after the release;
// - the undo (losses back, gains stand), the switch's refusals (a public build, a network battle) and the wiring: the
//   step reads the hold only through game/devBattleHold.ts, __DEBUG installs the switch, and both tools arm it in place
//   of the dead godMode / freezeBots flags;
// - (round 8 Y1 s2-05) the hold's edges, the owner's table on stand-ins (stepBattleHold): free -> held parks every bot's
//   brain on the battle's clock, held -> free resumes each with the clock and the next shell id, held -> held and
//   free -> free are no edge, a new battle starts free, a seat with no brain and the player are never parked; the undo's
//   answers (module:state source 'hold', tank:fire burning false) are the unit block's. The same edges and answers on the
//   page's own battle (a bot hurt while it stood books no burst at the release; a held step's worse module and fire each
//   answered) are src/game/devBattleHoldEdges.selftest.mjs, MANUAL 'sims': this file's battles were already its cost.
// - (round 8 merge review r1) a bot revived while the hold holds its battle stays parked until the release
//   (holdRevivedBrain, the owner's table on stand-ins; the page's own revive hook is devBattleHoldEdges'), and a held
//   battle's bots call no airstrikes: the mode controller's own bot calls wait (a flat Air Support battle through the
//   solo step, as airSupportSolo.selftest steps one).
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
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState } from '../sim/movement.ts';
import { AIR_SUPPORT_RULES, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createMatchModeController } from '../sim/matchModes.ts';
import { DEV_BATTLE_HOLD, battleHeld, holdBattleStep, holdRevivedBrain, stepBattleHold, undoHeldDamage } from './devBattleHold.ts';
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
  const player = { id: 'me', input: input(), combat: combat() };
  const bot = { id: 'bot', input: input(), combat: combat() };
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
  const said = [];
  undoHeldDamage(game, { emit: (event, payload) => said.push({ event, ...payload }) });
  assert.equal(c.hp, 900); assert.equal(c.destroyed, false);
  assert.deepEqual(c.modules.gun, { hp: 100, maxHp: 100, state: 'ok', repairT: 0 }, 'a struck module comes back');
  assert.deepEqual(c.modules.engine, { hp: 95, maxHp: 100, state: 'ok', repairT: 0 }, 'a repair the step made stands');
  assert.deepEqual(c.crew, { commander: true, gunner: true, driver: false }, 'the crew come back; the already dead stay so');
  assert.deepEqual(c.fire, { burning: false, tickTimer: 0, ticksLeft: 0 }, 'a fire the step lit is out');
  assert.deepEqual([...c.eraSpent], ['hull_l_1'], 'ERA the step spent is back; ERA spent before stays spent');
  assert.deepEqual(said, [{ event: 'module:state', id: 'me', module: 'gun', state: 'ok', source: 'hold' },
    { event: 'tank:fire', id: 'me', burning: false }], 'the undo says what it gave back (never as a repair), and nothing else');
  c.hp = 950;
  undoHeldDamage(game, { emit: (event, payload) => said.push({ event, ...payload }) });
  assert.equal(said.length, 2, 'a step with no loss says nothing');
  assert.equal(c.hp, 950, 'a heal stands');
}

// ---- (round 8 Y1 s2-05) the hold's edges: the owner's table on stand-ins ------------------------------------------------
{
  const calls = [];
  const brain = (id) => ({ park: (timeS) => calls.push(`${id} park ${timeS}`), resume: (timeS, shellId) => calls.push(`${id} resume ${timeS} ${shellId}`) });
  const hull = (id, aiCtl) => ({ id, aiCtl, input: { throttle: 1, steer: 0.5, brake: false, aimLocked: false, fire: true, actionBits: 3, auxiliaryBits: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, eraSpent: new Set() } });
  const player = hull('me', brain('me'));
  const bots = [hull('b1', brain('b1')), hull('b2', brain('b2'))];
  const seat = hull('seat-2', null); // a couch phone's seat: no brain
  const game = { devBattleHold: true, player, tanks: [player, ...bots, seat], timeS: 0.5, nextShellId: 40, battleCount: 1 };
  assert.equal(stepBattleHold(game), true, 'a battle begun armed is held from its first step');
  assert.deepEqual(calls, ['b1 park 0.5', 'b2 park 0.5'], 'free -> held parks every bot\'s brain on the battle\'s clock, never the player\'s');
  assert.deepEqual([bots[0].input.throttle, bots[0].input.fire, seat.input.brake], [0, false, true], 'and the held step stands them');
  calls.length = 0;
  game.timeS = 1;
  stepBattleHold(game);
  stepBattleHold(game);
  assert.deepEqual(calls, [], 'held -> held is no edge');
  game.devBattleHold = false;
  game.timeS = 2;
  game.nextShellId = 57;
  assert.equal(stepBattleHold(game), false);
  assert.deepEqual(calls, ['b1 resume 2 57', 'b2 resume 2 57'], 'held -> free resumes each with the battle\'s clock and its next shell id');
  calls.length = 0;
  stepBattleHold(game);
  assert.deepEqual(calls, [], 'free -> free is no edge');
  game.devBattleHold = true;
  stepBattleHold(game);
  calls.length = 0;
  game.battleCount = 2;
  game.devBattleHold = false;
  stepBattleHold(game);
  assert.deepEqual(calls, [], 'a new battle starts free: the last battle\'s hold is no release');
  game.devBattleHold = true;
  game.timeS = 3;
  stepBattleHold(game);
  assert.deepEqual(calls, ['b1 park 3', 'b2 park 3'], 'and is parked when it is held');
  calls.length = 0;
  const watched = { ...game, player: null, tanks: bots, devBattleHold: true, battleCount: 3 };
  assert.equal(stepBattleHold(watched), false, 'a watched battle (no player seat) is never held');
  assert.deepEqual(calls, [], 'so its brains are never parked');
}

// ---- (round 8 merge review r1) a bot revived while held stays parked until the release --------------------------------
// The mode's revive hook resumes the revived bot's brain on the battle's clock (game/state.ts, round 2 U18). Under the
// hold that resume ended the park the free -> held edge began, so the release's resume found no park: the bot's record
// clocks (its last round, its last penetration) never moved over the held time after the revive, and the stalemate push,
// the search gate and the passive press read it as the bot's own silence. The hold's answer to a revive parks the brain
// again at once while the edge holds. The brain books its park as ai.ts does (park sets the clock, resume reads and
// clears it).
{
  const booked = [];
  const brain = (id) => {
    let parkedAt = NaN;
    return {
      park: (timeS) => { parkedAt = timeS; booked.push(`${id} park ${timeS}`); },
      resume: (timeS) => {
        booked.push(`${id} resume ${timeS} from ${Number.isFinite(parkedAt) ? parkedAt : 'none'}`);
        parkedAt = NaN;
      },
    };
  };
  const hull = (id, aiCtl) => ({ id, aiCtl,
    input: { throttle: 0, steer: 0, brake: false, aimLocked: false, fire: false, actionBits: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
      eraSpent: new Set() } });
  const player = hull('me', brain('me')), bot = hull('b1', brain('b1')), seat = hull('seat-2', null);
  const game = { devBattleHold: true, player, tanks: [player, bot, seat], timeS: 10, nextShellId: 5, battleCount: 1 };
  /** The revive hook's two lines (game/state.ts): the resume every revive makes, then the hold's answer. */
  const revive = (entity) => { entity.aiCtl?.resume?.(game.timeS); holdRevivedBrain(game, entity); };
  stepBattleHold(game);
  game.timeS = 20;
  revive(bot);
  for (const timeS of [30, 40, 50]) { game.timeS = timeS; stepBattleHold(game); }
  game.devBattleHold = false;
  game.timeS = 60;
  stepBattleHold(game);
  assert.deepEqual(booked, ['b1 park 10', 'b1 resume 20 from 10', 'b1 park 20', 'b1 resume 60 from 20'],
    "revived under the hold, the brain is parked again at once, and the release's resume books the held time after the revive");
  booked.length = 0;
  game.timeS = 70;
  revive(bot);
  assert.deepEqual(booked, ['b1 resume 70 from none'], 'a revive in a free battle is a revive: no park');
  booked.length = 0;
  game.devBattleHold = true;
  game.timeS = 80;
  stepBattleHold(game);
  game.timeS = 90;
  revive(player);
  revive(seat);
  assert.deepEqual(booked, ['b1 park 80', 'me resume 90 from none'], 'the player and a seat with no brain are never parked');
  booked.length = 0;
  game.battleCount = 2;
  revive(bot);
  assert.deepEqual(booked, ['b1 resume 90 from 80'], "a new battle's first revive before its first step reads no last battle's hold");
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
  // (269 integration) 268's stepHullControls runs every hull's controls, actions and consumables in one roster pass
  // (round 8 Y1 s2-05) the held step's one owner opens the controls: its edges park and resume the brains, then the bots stand
  assert.match(state, /function stepHullControls\(game: SoloGameState, bus: EventBus, world: SoloWorld\): void \{\n(?:\s*\/\/[^\n]*\n)*\s*const held = stepBattleHold\(game\);/,
    "a held step's bots stand in place of their controllers (proving targets too)");
  assert.match(state, /if \(entity\.modeActive === false\) continue;\n(?:\s*\/\/[^\n]*\n)*\s*if \(held && entity !== game\.player\) continue;/,
    "a held bot takes no controls, actions or consumables");
  // (round 8 merge review r1) the step's held also reaches the mode controller: its own bot calls wait with its bots
  assert.match(state, /function stepMatchMode\(game: SoloGameState, bus: EventBus\): MatchModeResult \| null \{\n(?:\s*\/\/[^\n]*\n)*\s*const held = battleHeld\(game\);\n\s*if \(held\) undoHeldDamage\(game, bus\);\n\s*const outcome = game\.matchModeController\?\.step\(SIM_DT, game\.timeS, held\) \|\| null;/,
    "the player's losses are undone before the mode and the verdict read them, the undo answers on the bus, and the mode's bot calls are held");
  assert.match(state, /ent\.aiCtl\?\.resume\?\.\(game\.timeS\);\n(?:\s*\/\/[^\n]*\n)*\s*holdRevivedBrain\(game, ent\);/,
    "the mode's revive hook hands the revived bot's brain to the hold right after its resume (round 8 merge review r1)");
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
  if (tick === BURN_AT) {
    // the fire burns its twelve ticks: its self-out roll (damage.ts tickFire, still drawn) never wins, so the controls past
    // the arming tick do not ride the seeded stream that every roster change re-deals (release 271: the lane's seven new
    // ids put an Lvkv 9040 in this draw and the fire went out at its third tick, before the arming tick)
    player.combat.equipMults = { ...player.combat.equipMults, extinguish: 0 };
    Object.assign(player.combat.fire, { burning: true, tickTimer: 0, ticksLeft: 12 });
  }
}

/**
 * The battle's line-up, named (271): a battle drawn from the roster moved whenever a lane added tanks (the 152 mm line's
 * four turned seed 3's draw to a line-up whose fire went out before the arming tick). These are the 13 seed 3 drew for the
 * Leopard 2A4 on main 1b10803a6b's 299, seated through the debug roster (rosterState.forcedBattleCandidates, exact) with
 * their allied seats, so the roster's size never moves the battle.
 */
const LINE_UP = ['cv90_mk4_concept', 'strv122', 'cv9040c', 'cv90', 'strv121', 'cv90_mk4', 'strv105', 'leo2a6m', 'leo2a3_b4',
  'gepard_1a2', 'leo2a5m', 'leo2_improved', 'leo2_revolution'];
const ALLIES = ['leo2a6m', 'leo2a3_b4', 'gepard_1a2', 'leo2a5m', 'leo2_improved', 'leo2_revolution'];
function seatNamed(seat) {
  const debug = globalThis.__DEBUG;
  globalThis.__DEBUG = { ...debug, flags: { ...debug?.flags, forceRoster: LINE_UP, rosterExact: true, forceAllies: ALLIES } };
  try { seat(); } finally { if (debug === undefined) delete globalThis.__DEBUG; else globalThis.__DEBUG = debug; }
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
  seatNamed(() => setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true }));
  assert.deepEqual(game.tanks.map((e) => e.id), ['leo2a4', ...LINE_UP], 'the named line-up is the battle');
  assert.deepEqual(game.tanks.filter((e) => e.team !== 'enemy' && e !== game.player).map((e) => e.id), ALLIES, 'its allied seats too');
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
  let armedAt = null, armTick = 0, lastSecond = null, maxBotDriftM = 0, lastSecondDriftM = 0;
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      const set = hold(tick);
      if (set !== undefined) game.devBattleHold = set;
      if (set === true) { armTick = tick; armedAt = new Map(bots.map((e) => [e.id, e.state.pos.clone()])); }
      // (269 integration) the drift is read from half a second after the arming: on the 268 roster (seed 3) a hull seated
      // into the ground climbs out over its first ticks (type10_tk_x, 0.4 m in ticks 2-5), which is the world's support,
      // not a controller; a bot that drove would still be metres off by the window's end
      if (armedAt && tick === armTick + 30) armedAt = new Map(bots.map((e) => [e.id, e.state.pos.clone()]));
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

// ---- (round 8 merge review r1) a held battle's bots call no airstrikes ---------------------------------------------------
// Air Support's bots call in from the mode controller's own step (sim/airSupport.ts botCall, every decideEveryS), which the
// hold's controls gate never reached: a held Air Support battle's bots called recon passes and strikes (their rounds hurt
// allies and bots; only the player's damage is undone). The solo step (simStep -> stepMatchMode -> the controller ->
// air.step) on a flat field, as airSupportSolo.selftest steps it: the player and a wingman 12 m apart, two hostile bots
// 350 m off with the ledger's cap in points; held from the first step, no bot calls in 6 s (three decide windows);
// released, they call within 3 s.
const airCalls = [];
{
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const flatCollider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  const crew = (id, team, x, z, isPlayer) => {
    const spec = getSpec('m1a1_abrams_hc'), combat = createCombatState(spec);
    combat.equipMults = {};
    const input = { throttle: 0, steer: 0, brake: true, fire: false, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 100, actionBits: 0,
      aimPoint: new Vector3(x, 0, z), auxiliaryBits: 0 };
    return { id, specId: spec.id, spec, isPlayer, bot: !isPlayer, team, combat, input, seat: [x, z],
      state: createTankState(spec, new Vector3(x, 0, z), 0),
      visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(x, 3, z + 4), gunDirWorld: (out) => out.set(0, 0, 1), recoilKick() {} } };
  };
  const game = createGameState();
  game.ruleset = matchRulesetFor('air_support');
  const pilot = crew('pilot', 'player', 0, -200, true);
  game.tanks = [pilot, crew('wing', 'player', 12, -200, false), crew('e1', 'enemy', 0, 150, false), crew('e2', 'enemy', 12, 150, false)];
  game.allTanks = game.tanks;
  game.player = pilot;
  for (const t of game.tanks) game.tankById.set(t.id, t);
  game.matchModeController = createMatchModeController({ mode: 'air_support', entities: game.tanks, seed: 3, ruleset: game.ruleset,
    revive() {}, terrainHeight: () => 0, emit: (type, payload) => game.modeEvents.push({ type, payload }) });
  game.matchModeState = game.matchModeController.serialize('pilot');
  const air = game.matchModeController.airSupport;
  const saved = air.capture();
  saved.points = [['pilot', 0], ['wing', 0], ['e1', AIR_SUPPORT_RULES.points.cap], ['e2', AIR_SUPPORT_RULES.points.cap]];
  air.restore(saved);
  let tick = 0;
  const bus = createBus((event, payload) => { if (event === 'mode:strike_called') airCalls.push({ tick, callerId: payload.callerId, kind: payload.kind }); });
  const step = () => {
    tick++;
    simStep(game, bus, { heightField: flat, raycast: () => null }, null, flatCollider);
    for (const t of game.tanks) t.state.pos.set(t.seat[0], 0, t.seat[1]);
  };
  const HELD_TICKS = 360;
  game.devBattleHold = true;
  for (let n = 0; n < HELD_TICKS; n++) step();
  assert.deepEqual(airCalls, [], `held, no bot calls an airstrike (${JSON.stringify(airCalls.slice(0, 3))})`);
  game.devBattleHold = false;
  for (let n = 0; n < 180; n++) step();
  const botCalls = airCalls.filter((call) => call.callerId === 'e1' || call.callerId === 'e2');
  assert.ok(botCalls.length > 0 && botCalls[0].tick > HELD_TICKS, `released, the bots call in again (${JSON.stringify(airCalls)})`);
}

console.log(`devBattleHold selftest passed: off byte-identical over ${TICKS} ticks; unheld ${plain.botShots} rounds, the player hurt `
  + `from tick ${plain.playerDamage[0]}; held 0 bot rounds, no player loss, bots within ${held.maxBotDriftM.toFixed(3)} m, no verdict; `
  + `armed at tick ${AT} the battle parts there, the bots stand (${late.lastSecondDriftM.toFixed(3)} m in the last second) and the `
  + 'fire costs nothing; the verdict waits for the release; the hold\'s edges park and resume the brains once each, per battle; '
  + `a brain revived while held stays parked until the release; held, no bot calls an airstrike, released ${airCalls.length} call(s) `
  + `from ${airCalls[0]?.callerId} at tick ${airCalls[0]?.tick}; undo, switch and wiring held`);
process.exit(0);
