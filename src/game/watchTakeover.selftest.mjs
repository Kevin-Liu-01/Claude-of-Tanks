// Watch mode's Take control in every watchable mode (watch-drone-244). Each mode's watched battle opens, a seat is taken
// through the player's own input path and handed back, and the mode's own edge is driven through it:
//   every mode     the hull is unchanged by the swap both ways, the parked controller never runs while the watcher
//                  drives (no double inputs), the controller resumes on leave, control decisions follow the driver
//                  (botDriven) while role decisions keep the seat's `bot`;
//   mid-reload     a reload in progress carries over and runs out under the watcher, and back under the controller;
//   Juggernaut     the boss can be taken: it stays the boss, its hull and armour scale stay;
//   Infected       a driven survivor that falls rises infected; the watched battle's side, its mode perspective and
//                  its verdict stay the side the seat opened on even when the seat itself converts;
//   CTF            a driven hull picks up the flag, keeps it across the hand-back, and drops it when it falls;
//   respawn modes  a driven hull that falls is handed back as a wreck and its controller rides the mode's revive;
//   no-respawn     a driven wreck stays a wreck after the hand-back;
//   drone          a driven seat's FPV drone launches from the watcher's key and flies the watcher's throttle;
//   AC-130         stays out of Watch: its gunship is flown only by the human seat, so a watched one has no fight;
//   rooms          a networked match never carries Watch: the seat ledger refuses, and the room code never reaches it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from 'three';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createPlayerFrameInput } from './playerFrameInput.ts';
import { leaveWatchSeat, openWatchSeats, takeWatchSeat, watchSeatRefusal, watchViewer } from './watchSeat.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { WATCH_RULES, isWatchableMode } from '../sim/matchRuleset.ts';
import { botDriven } from '../sim/botDriven.ts';
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts';

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});

await ensureFullFleet();
const MAP = 'steppe';
function battlefield() {
  const field = createDedicatedWorldCollision(MAP);
  const authored = field.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  return field;
}
const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
  gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
  gunDirWorld: (out) => {
    const yaw = entity.state.yaw + entity.state.turretYaw, pitch = entity.state.gunPitch ?? 0;
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  } });

const hullOf = (e) => JSON.stringify({
  state: Object.fromEntries(Object.entries(e.state).map(([k, v]) => [k, v?.isVector3 ? v.toArray() : v])),
  combat: e.combat, team: e.team, bot: e.bot, specialAction: e.specialAction,
});

/** A watched battle of `gameMode`, opened, with the watcher's scripted input port and a step that drives the frame. */
function watchedBattle(gameMode, seed = 7) {
  const field = battlefield();
  const game = createGameState({ rosterSeed: seed });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual(entity);
  const events = [];
  const bus = createBus((name, payload) => events.push([name, payload]));
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode, watch: true, random: true, arrangement: null, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  const collider = createCollider(game, field);
  openWatchSeats(game);
  const script = { forward: false, back: false, left: false, right: false, handbrake: false, fire: false };
  let auxiliary = 0;
  const port = {
    onAction: () => () => {}, getState: () => script, getVirtualMove: () => false, isLocked: () => true, padActive: () => false,
    isCursorAim: () => false, virtualActive: () => false,
    consumeMouseDelta: (out) => { out.x = 0; out.y = 0; return out; }, getCursorNdc: (out) => { out.x = 0; out.y = 0; return out; },
    getSettings: () => ({ rmbMode: 'hold' }), isDown: () => false, releaseToggles() {},
  };
  const frameInput = createPlayerFrameInput({ input: port, hasAmmo: () => true, forceFire: () => false });
  const aim = new Vector3();
  const step = () => {
    frameInput.poll({ dtSeconds: 1 / 60, inBattle: true, paused: false, killcamActive: false, cameraLocked: false,
      rigMode: 'ARCADE', player: game.player });
    if (game.player) {
      const p = game.player.state;
      aim.set(p.pos.x + Math.sin(p.yaw) * 200, p.pos.y + 2, p.pos.z + Math.cos(p.yaw) * 200);
      game.player.input.aimPoint.copy(aim);
      if (auxiliary) game.player.input.auxiliaryBits = (game.player.input.auxiliaryBits ?? 0) | auxiliary;
    }
    simStep(game, bus, field, null, collider);
  };
  const run = (steps, each) => { for (let i = 0; i < steps && game.result === null; i++) { each?.(i); step(); } };
  return { game, events, field, script, run, setAuxiliary: (bits) => { auxiliary = bits; } };
}

/** Count a hull's controller ticks, and those made while the watcher drives it. */
function countBrain(game, entity) {
  const brain = entity.aiCtl;
  const counts = { all: 0, whileTaken: 0 };
  const update = brain.update.bind(brain);
  brain.update = (dt, t) => { counts.all++; if (game.watch.takenId === entity.id) counts.whileTaken++; update(dt, t); };
  return counts;
}

/** Take `entity`, asserting the swap changes nothing and hands the hull's control (not its role) to the watcher. */
function take(game, entity, mode) {
  assert.equal(watchSeatRefusal(game, entity), null, `${mode}: ${entity.id} can be taken`);
  const before = hullOf(entity);
  assert.equal(takeWatchSeat(game, entity), true, `${mode}: taken`);
  assert.equal(hullOf(entity), before, `${mode}: taking control changes nothing about the hull`);
  assert.equal(game.player, entity, `${mode}: the hull is the session's player`);
  assert.equal(botDriven(entity), false, `${mode}: its control is the watcher's`);
}

function leave(game, entity, mode) {
  const before = hullOf(entity);
  assert.equal(leaveWatchSeat(game), entity, `${mode}: handed back`);
  assert.equal(hullOf(entity), before, `${mode}: leaving changes nothing about the hull`);
  assert.equal(game.player, null, `${mode}: nobody drives`);
  assert.ok(entity.aiCtl, `${mode}: its controller drives it again`);
  assert.equal(botDriven(entity), entity.bot === true, `${mode}: control returns to the seat's role`);
}

/** Destroy a hull as a lethal hit would leave it (the mode controller observes the death on its next step). */
function destroy(entity) {
  entity.combat.hp = 0;
  entity.combat.destroyed = true;
}

const pickBot = (game, team) => game.tanks.find((e) => e.team === team && e.aiCtl && e.bot && !e.combat.destroyed
  && e.modeActive !== false && e.aerial?.kind !== 'gunship');

// --- every watchable mode: the round trip, no double inputs, a reload carried across both swaps -----------------------
const respawning = [];
for (const mode of WATCH_RULES.modes) {
  const battle = watchedBattle(mode);
  const { game, run, script } = battle;
  run(180);
  const target = pickBot(game, 'enemy') ?? pickBot(game, 'player');
  assert.ok(target, `${mode}: a bot's seat to take`);
  const brain = countBrain(game, target);
  // a reload in progress when the watcher takes the hull
  target.combat.reload.totalS = Math.max(target.combat.reload.totalS || 0, 4);
  target.combat.reload.t = target.combat.reload.totalS * 0.75;
  const reloadAtTake = target.combat.reload.t;
  take(game, target, mode);
  script.forward = true;
  let reloadRan = false;
  run(150, (i) => {
    script.left = i % 90 < 30;
    if (i === 60) assert.ok(target.combat.reload.t < reloadAtTake || target.combat.destroyed, `${mode}: the reload runs on under the watcher`);
    if (target.combat.reload.t === 0) reloadRan = true;
  });
  script.forward = false; script.left = false;
  assert.equal(brain.whileTaken, 0, `${mode}: the parked controller never ran while the watcher drove`);
  assert.ok(reloadRan || target.combat.destroyed || game.result !== null || target.combat.reload.t < reloadAtTake,
    `${mode}: the carried reload ran out (or on) under the watcher`);
  // and handed back mid-reload: the controller inherits it
  if (!target.combat.destroyed) {
    target.combat.reload.t = target.combat.reload.totalS * 0.5;
    const reloadAtLeave = target.combat.reload.t;
    leave(game, target, mode);
    const ticks = brain.all;
    run(60);
    assert.ok(brain.all > ticks || game.result !== null, `${mode}: the controller runs again after the hand-back`);
    assert.ok(target.combat.reload.t < reloadAtLeave || target.combat.destroyed || game.result !== null,
      `${mode}: the reload carried back runs on under the controller`);
  } else leave(game, target, mode);
  if (game.ruleset.respawnS != null) respawning.push(mode);
}
assert.ok(respawning.includes('capture_the_flag') && !respawning.includes('standard'), 'the modes split by revive as the rules say');

// --- Juggernaut: the boss can be taken and stays the boss --------------------------------------------------------------
{
  const { game, run } = watchedBattle('juggernaut');
  run(60);
  const bossId = game.matchModeState?.boss?.id;
  const boss = game.tanks.find((e) => e.id === bossId);
  assert.ok(boss, 'juggernaut: a boss');
  const maxHp = boss.combat.maxHp;
  take(game, boss, 'juggernaut');
  run(120);
  assert.equal(game.matchModeState.boss.id, boss.id, 'juggernaut: the driven boss is still the boss');
  assert.equal(boss.combat.maxHp, maxHp, 'juggernaut: its boss hull stays');
  assert.equal(boss.state.modeScale, 1.12, 'juggernaut: and its boss scale');
  leave(game, boss, 'juggernaut');
  run(30);
  assert.equal(game.matchModeState.boss.id, boss.id, 'juggernaut: still the boss under its controller');
}

// --- Infected: a driven survivor rises infected; the watched battle's side never moves --------------------------------
{
  const { game, run } = watchedBattle('infected');
  run(60);
  const seat = game.tanks.find((e) => e.id === game.watch.seatId);
  assert.equal(seat.team, 'player', 'infected: the human seat opens a survivor');
  take(game, seat, 'infected');
  run(30);
  destroy(seat);
  run(4);
  assert.notEqual(seat.team, 'player', 'infected: the driven survivor that fell rose infected');
  assert.equal(game.watch.team, 'player', 'infected: the watched battle stays on the side the seat opened on');
  leave(game, seat, 'infected');
  run(4);
  const viewer = watchViewer(game);
  assert.ok(viewer && viewer.team === 'player', 'infected: the mode reads the battle from a survivor, not the converted seat');
  assert.equal(game.matchModeState.perspectiveTeam, 'alpha', 'infected: the spectator\'s perspective stays Alpha');
  run(60 * 6);
  assert.ok(!seat.combat.destroyed || game.result !== null, 'infected: the converted seat rises under its controller');
  // the verdict: an outbreak is Bravo's win even with the seat now infected
  for (const entity of game.tanks) if (entity.team === 'player') destroy(entity);
  run(120);
  assert.ok(game.result === 'defeat', `infected: the outbreak reads as Bravo's win for the watched battle (${game.result})`);
}

// --- CTF: a driven hull takes the flag, keeps it across the hand-back, drops it when it falls --------------------------
{
  const { game, run } = watchedBattle('capture_the_flag');
  run(60);
  const runner = pickBot(game, 'enemy');
  const flags = game.matchModeController.state.flags;
  const flag = flags.find((f) => f.team === 'alpha');
  take(game, runner, 'ctf');
  let carried = false;
  run(240, () => {
    if (flag.carrierId === runner.id) { carried = true; return; }
    runner.state.pos.set(flag.x, runner.state.pos.y, flag.z); // the watcher drives onto Alpha's flag
  });
  assert.ok(carried, 'ctf: the driven hull picked up the flag');
  leave(game, runner, 'ctf');
  run(10);
  assert.equal(flag.carrierId, runner.id, 'ctf: the flag stays with the hull across the hand-back');
  destroy(runner);
  run(4);
  assert.notEqual(flag.carrierId, runner.id, 'ctf: a carrier that falls drops the flag');
}

// --- respawn and no-respawn: a driven hull that falls is handed back as a wreck --------------------------------------
for (const [mode, revives] of [['zone_control', true], ['standard', false], ['realistic', false]]) {
  const { game, run } = watchedBattle(mode);
  run(60);
  const hull = pickBot(game, 'enemy');
  take(game, hull, mode);
  run(30);
  destroy(hull);
  run(30);
  assert.equal(game.player, hull, `${mode}: the fallen hull is still the watcher's until the hand-back`);
  leave(game, hull, mode);
  run(60 * ((game.ruleset.respawnS ?? 0) + 3));
  if (revives) assert.ok(!hull.combat.destroyed, `${mode}: the mode revives the handed-back hull under its controller`);
  else assert.ok(hull.combat.destroyed, `${mode}: no revive: the handed-back wreck stays`);
}

// --- drone: a driven seat's FPV drone is the watcher's to launch and fly -----------------------------------------------
{
  const battle = watchedBattle('drone');
  const { game, run, script } = battle;
  run(60 * 9); // the launch opens 8 s in
  const pilot = game.tanks.find((e) => e.aerial?.kind === 'drone' && e.aiCtl && !e.combat.destroyed && !e.aerial.active);
  assert.ok(pilot, 'drone: a carrier with its drone docked');
  take(game, pilot, 'drone');
  battle.setAuxiliary(PLAYER_ACTION_BITS.DRONE);
  run(2);
  battle.setAuxiliary(0);
  assert.ok(pilot.aerial.active || pilot.aerial.launching, 'drone: the watcher\'s key launched it');
  const shell = game.shells.find((s) => s.shooterId === pilot.id && !s.dead);
  assert.ok(shell, 'drone: its airframe is in flight');
  run(60 * 2.6); // past the launch climb
  script.forward = false;
  const from = shell.pos.clone();
  run(60);
  const idle = shell.pos.distanceTo(from);
  script.forward = true;
  const go = shell.pos.clone();
  run(60);
  const flown = shell.pos.distanceTo(go);
  // a bot's drone flies at full speed whatever its stick; the watcher's hovers off the throttle and flies on it
  assert.ok(idle < 12 && flown > 20, `drone: it flies the watcher's throttle (1 s idle ${idle.toFixed(1)} m, 1 s throttle ${flown.toFixed(1)} m)`);
  leave(game, pilot, 'drone');
}

// --- AC-130 stays out of Watch ----------------------------------------------------------------------------------------
assert.equal(isWatchableMode('ac130'), false,
  'the AC-130 is not watchable: only the human seat flies the gunship (sim/aerialCombat.ts initializeAerial), so a watched one has no gunship and no fight');

// --- rooms never carry Watch -------------------------------------------------------------------------------------------
{
  const room = { player: null, tanks: [], ruleset: { watch: null }, watch: null };
  assert.equal(watchSeatRefusal(room, null), 'no-watch', 'a networked match has no seat ledger: Take control refuses');
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (/\.ts$/.test(name)) files.push(path); } };
  const root = new URL('../../', import.meta.url).pathname;
  walk(join(root, 'src/mp'));
  walk(join(root, 'server'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/watchSeat|watchRulesetFor|watchController/.test(text), `${file}: room code never reaches Watch`);
  }
  const garage = readFileSync(join(root, 'src/ui/garage.ts'), 'utf8');
  assert.match(garage, /setupWatch\.disabled = !solo \|\|/, 'the Watch button is off outside a solo battle');
}

console.log(`watchTakeover selftest: PASS (${WATCH_RULES.modes.length} modes round-trip with a reload across both swaps; the boss, ` +
  'an infected convert, a flag carrier, revives and wrecks, a drone; AC-130 and rooms refuse)');
