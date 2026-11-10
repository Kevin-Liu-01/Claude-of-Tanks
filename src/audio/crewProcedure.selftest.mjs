// Receipt (round 8 Y3; the 269 crew procedure's own machines, re-swept 2026-11-08): the crew's calls hang off the engine's
// declared battle mode and its edges, driven through the real engine (bus events and frames in, its say log out).
//   - s1-03, the battle scope: the pause menu silences the net (the line queued before the pause is dropped, the crew's
//     armed calls are cancelled, nothing is said behind it or late on the resume); a kill heard behind the menu (a network
//     battle goes on there) arms no cease fire for the resume, and neither a recalled drone that docks behind it nor an
//     enemy's smoke popped behind it is called at the resume (review r2); the crew keeps no battle edge of its own (it
//     subscribes to no phase change and no raw death: the engine's resetBattlePlay and death latch are its edges).
//   - s1-01, the life scope: the gun is loaded while our reload channel is ready, so a Gun Game step's fresh weapon gets its
//     fire command at once (no reload ever finished for it); a kill's cease fire and a recalled drone's recovery die with
//     our tank, so neither is said at the respawn; the life starts at each revive the engine notices, so what a dead
//     crew's round arms (a posthumous kill's cease fire) is not said at the respawn either, nor at a revive no event
//     announces (a migrated host's adoptLiveCombat: the frame shows our hull standing again), whose new life also has its
//     low-hull call armed again; and at each seat the player takes in a watched battle (review r2: game/watchSeat.ts
//     takeWatchSeat moves the player to a living bot, no revive, no event), so the last seat's cease fire, posthumous kill
//     or recalled drone is not called for the next, nor for the same hull taken back from its brain; and the seat taken
//     keeps its own hull's radio set and fire alarm (review r3): a set broken while its brain drove it sounds broken from
//     the take, a whole one clean, and the last seat's fire alarm stops while a hull taken burning sounds its own. A
//     living hull's revive (review r4: a Turbo Ball kick-off or the range reset, driven through the real controller's
//     reviveAll) puts out the fire its last life lit, which no tank:fire tells: our alarm stops with no fire_out, and no
//     revived hull's engine-deck fire crackles on at its spawn, nor any after a network battle's restart.
//   - review r2, our drone as the authority flies it (sim/aerialCombat.ts stepAerial, the real fixed-step flight): a flight
//     lost to its battery or its link gets its low-battery and weak-link calls and is never "recovered"; a recall is
//     recovered when the airframe is parked on its dock, not when the recall is accepted.
//   - round 8 amendment 6, the escort's life: an AC-130 crew calls a friendly extracted when its mode life is 'rescued'
//     (sim/matchModes.ts setLife, the hull's one life writer, driven here through the real AC-130 controller), never a
//     benched or downed one, and reads no flags of its own for it (a network seat sees no rescue: the authority stops
//     sending a hull that leaves the field).
//   - s1-02, one visibility truth: the crew names only what the player sees (src/game/playerVisibility.ts, handed to
//     audio.update as the listener's runtime does): no fire command on an enemy whose spot lingered out, one a far ally
//     lit, one revived at its spawn, or a network hull the authority stopped sending; a hidden enemy near does not hold
//     the cease fire; an enemy the player sees is still commanded; a watched battle's seat its brain drives makes none of
//     the crew's per-life or sighting calls, so the drone camera laid on an enemy the watch reveals commands nothing
//     (review r2), while the battle's mode calls, the side's news, still play there (review r3, a guard).
// Each case runs on its own battle; a case that fails is reported with the rest, so one run shows every red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createBus, watchRevealsAll } from '../game/stateCore.ts';
import { prepareWatchSeat, openWatchSeats, takeWatchSeat, leaveWatchSeat } from '../game/watchSeat.ts';
import { createMatchModeController } from '../sim/matchModes.ts';
import { initializeAerial, stepAerial } from '../sim/aerialCombat.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts';
import { stepShell } from '../sim/ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';
import { installFetch, namedContext, terrain, tank, probeOf, sounding } from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');

const ctx = namedContext();
let gameMode = 'standard';
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => gameMode, getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
await probe.libraryIdle();

// The sight looks away from every hull unless a case lays it on one.
const AWAY = Object.freeze({ x: -1, y: 0, z: 0 });
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: AWAY, kind: 'player-tank', ownerId: 'me', scoped: false };
const layOn = (hull) => {
  const d = [hull.state.pos.x - listener.pos.x, hull.state.pos.y + 1.2 - listener.pos.y, hull.state.pos.z - listener.pos.z];
  const n = Math.hypot(...d);
  listener.forward = { x: d[0] / n, y: d[1] / n, z: d[2] / n };
};
let field = [];
// what the player sees (the game's rule is src/game/playerVisibility.ts): every hull unless a case says
const EVERY_HULL = () => true;
let sees = EVERY_HULL;
// drones on the authority's own flight (droneFlight), stepped at the sim's 60 Hz before each frame
const flights = [];
const frames = (seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
    for (const flight of flights) { flight.step(); flight.step(); }
    ctx.advance(1 / 30);
    audio.update(1 / 30, listener, field, [], sees);
  }
};
/** Frames until `done()`, at most `capS` (a case that never gets there fails with its count, never loops). */
function framesUntil(done, capS, what) {
  for (let s = 0; !done(); s += 0.1) {
    if (s >= capS) throw new Error(`${what}: not within ${capS} s`);
    frames(0.1);
  }
}
const now = () => +ctx.currentTime.toFixed(3);
const asked = (id, since) => probe.sayLog.some((e) => e.t >= since && e.id === id);
const spoken = (id, since) => probe.voiceLog.some((e) => e.t >= since && e.id === id);
const said = (since) => probe.sayLog.filter((e) => e.t >= since).map((e) => `${e.id}${e.ok ? '' : `(${e.why})`}`).join(', ');
const foe = (id, z, x = 0) => tank(id, { team: 'enemy', x, z });
const spot = (id) => bus.emit('tank:spotted', { id, team: 'player', spotterId: 'me', timeS: 0 });
/** A hull's radio set damaged or destroyed, and a hull set on fire, as the sim does it: the hull's state, then the event
 *  (state.ts emitHitStateEvents). */
function radioHit(hull, state) {
  hull.combat.modules.radio = { state };
  bus.emit('module:state', { id: hull.id, module: 'radio', state, source: 'hit' });
}
function setFire(hull, burning) {
  hull.combat.fire = { burning };
  bus.emit('tank:fire', { id: hull.id, burning });
}
/** The crew radio's band top (crewRadio.ts: the chain's second low-pass, which feeds the presence peak): every line plays
 *  through it, 3400 Hz on a whole set, 2700 on a damaged one, 2100 on a destroyed one. */
const RADIO_BAND = Object.freeze({ ok: 3400, yellow: 2700, red: 2100 });
function radioBand() {
  const top = ctx.nodes.filter((n) => n.kind === 'filter' && n.type === 'lowpass' && n.outputs.some((o) => o.kind === 'filter' && o.type === 'peaking'));
  assert.equal(top.length, 1, 'one crew radio chain');
  return top[0].frequency.value;
}
/** Fire alarms sounding now. */
const fireAlarms = () => sounding(ctx).filter((n) => n === 'alarm_fire_loop').length;
/** Engine-deck fires sounding now (vehicleRig.ts: a burning hull's rig plays fire_small_loop). */
const deckFires = () => sounding(ctx).filter((n) => n === 'fire_small_loop').length;

/** A battle of `mode` with this field, rolled out and quiet. */
async function battle(mode, roster, visible = EVERY_HULL) {
  gameMode = mode;
  field = roster;
  sees = visible;
  flights.length = 0;
  listener.pos = { x: 0, y: 2, z: 0 };
  listener.forward = AWAY;
  listener.kind = 'player-tank';
  listener.ownerId = 'me';
  bus.emit('phase:change', { phase: 'garage' });
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents([...new Set(roster.map((t) => t.specId))]);
  frames(0.2);
  await probe.libraryIdle();
  bus.emit('battle:rollout', {});
  frames(4);
}

/**
 * Our drone on the authority's own flight (sim/aerialCombat.ts stepAerial, flown as sim/droneRecall.selftest.mjs flies it
 * from the M1A2's certified dock): its view is the object the frames hand the engine (`hull.aerial`), and its carrier's
 * combat is the hull's, so our death grounds it as the sim does.
 */
function droneFlight(hull) {
  const pilot = { id: hull.id, team: hull.team, spec: getSpec('m1a1_abrams_hc'), bot: false, isPlayer: true,
    state: { pos: new Vector3(hull.state.pos.x, 0, hull.state.pos.z), yaw: 0, turretYaw: 0, speed: 0 }, combat: hull.combat,
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(140, 22, 400), auxiliaryBits: 0 } };
  initializeAerial(pilot, matchRulesetFor('drone'));
  hull.aerial = pilot.aerial;
  const shells = [];
  let tick = 0, nextId = 1;
  const flight = {
    pilot,
    /** The drone key: a launch, or once the feed is live a recall (the authority refuses an earlier one). */
    press() { pilot.input.auxiliaryBits |= PLAYER_ACTION_BITS.DRONE; },
    step() {
      tick++;
      stepAerial(pilot, tick / 60, 1 / 60, () => nextId++, (shell) => shells.push(shell));
      const live = shells.at(-1);
      if (live && !live.dead) stepShell(live, 1 / 60);
    },
  };
  flights.push(flight);
  return flight;
}

/**
 * A watched battle (sim/matchRuleset.ts WATCH_RULES: take control, reveal all) driven through the real seat ledger
 * (game/watchSeat.ts). What the player sees is src/game/playerVisibility.ts's rule over it (pinned by its own selftest),
 * composed here from the same parts so the case also runs on a tree without that module: the watch reveals every hull
 * while nobody drives (stateCore.ts watchRevealsAll), our side shows, and an enemy shows once our side spots it (`spot`,
 * which also tells the spot's event as spotting.ts does). `seat` is the human seat; every other hull is a bot.
 */
function watchedBattle(roster, seat) {
  const brain = () => ({ park() {}, resume() {} });
  for (const hull of roster) hull.aiCtl = brain();
  const spotted = new Set();
  const game = { tanks: roster, player: seat, timeS: 0, nextShellId: 1, watch: null,
    ruleset: { watch: { takeControl: true, revealAll: true } } };
  prepareWatchSeat(game, seat);
  return {
    game, spotted,
    sees: (hull) => watchRevealsAll(game) || hull.team === seat.team || spotted.has(hull.id),
    spot(id, spotterId) { spotted.add(id); bus.emit('tank:spotted', { id, team: seat.team, spotterId, timeS: 0 }); },
  };
}

const failures = [];
async function check(name, run) {
  try { await run(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}

// ---- s1-03: the battle scope is the engine's.
await check('s1-03 the crew keeps no battle edge of its own', async () => {
  const source = readFileSync(new URL('./crewProcedure.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /'phase:change'/, 'the crew subscribes to no phase change (the engine\'s resetBattlePlay starts its battle)');
  assert.doesNotMatch(source, /'tank:destroyed'/, 'the crew subscribes to no raw death (the engine\'s death latch tells it each death once a life)');
});

await check('s1-03 the pause menu silences the net and cancels the calls armed before it', async () => {
  const me = tank('me', { isPlayer: true });
  // the kill's target and a far enemy (beyond the cease fire's range) for the control after the resume
  const near = foe('f1', 600), far = foe('f2', 3000);
  await battle('standard', [me, near, far]);
  spot('f1');
  spot('f2');
  frames(8);
  const since = now();
  // a line on the air (the loader's), and the kill call queued behind it, when the menu opens
  bus.emit('ui:magazineReloadStarted', {});
  frames(0.3);
  const onAir = ctx.started.filter((n) => n.kind === 'source' && n.buffer?.name === 'reloading' && n.started.at >= since);
  assert.equal(onAir.length, 1, `the loader's line is on the air (asked ${said(since)}; heard ${probe.voiceLog.filter((e) => e.t >= since - 6).map((e) => `${e.id}@${e.t}`)} now ${now()})`);
  near.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  bus.emit('ui:pause', { on: true });
  assert.ok(onAir[0].stopped != null, 'the line on the air is cut as the menu opens');
  frames(4);
  assert.ok(!spoken('target_destroyed', since), `the kill call queued before the pause is not heard behind it (heard ${probe.voiceLog.filter((e) => e.t >= since).map((e) => e.id)})`);
  assert.ok(!asked('cease_fire', since), `no cease fire behind the pause menu (asked ${said(since)})`);
  // a network battle goes on behind the menu: its moments ask, the net takes none
  const behind = now();
  bus.emit('ui:magazineReloadStarted', {});
  frames(1);
  assert.ok(probe.sayLog.some((e) => e.t >= behind && e.id === 'reloading' && !e.ok && e.why === 'paused'), `the net takes no line while paused (asked ${said(behind)})`);
  bus.emit('ui:pause', { on: false });
  frames(5);
  assert.ok(!asked('cease_fire', since), `the cease fire armed before the pause is cancelled, not said late on the resume (asked ${said(since)})`);
  // the control: the same kill with no pause calls it
  const control = now();
  far.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f2', killerId: 'me', pos: [0, 0, 3000], cause: 'shot' });
  frames(4);
  assert.ok(asked('cease_fire', control), `a kill with no pause still calls the cease fire (asked ${said(control)})`);
});

await check('s1-03 a kill heard behind the pause menu arms no cease fire for the resume', async () => {
  const me = tank('me', { isPlayer: true });
  const near = foe('f1', 600);
  await battle('standard', [me, near]);
  spot('f1');
  frames(8);
  bus.emit('ui:pause', { on: true });
  frames(1);
  // a network battle goes on behind the menu (battleFrameRuntime pumps it): our round in flight kills there
  const killed = now();
  near.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  frames(20);
  bus.emit('ui:pause', { on: false });
  frames(4);
  assert.ok(!asked('cease_fire', killed), `no cease fire behind the menu, nor at the resume for a kill heard 20 s before it (asked ${said(killed)})`);
});

await check('s1-03 an enemy\'s smoke popped behind the pause menu is not called at the resume', async () => {
  const me = tank('me', { isPlayer: true });
  const smoker = foe('f1', 400);
  await battle('standard', [me, smoker, foe('f2', 2500, 300)]);
  spot('f1');
  frames(2);
  // behind the menu (a network battle goes on there) f1 pops smoke; the screens change again after the resume (another
  // hull's launch out of our range, or a screen expiring: the presentation tells every change)
  const paused = now();
  bus.emit('ui:pause', { on: true });
  frames(1);
  const behind = { born: 50, source: ['t72b3m_2022', 0, 2, 400] };
  bus.emit('auxiliary:smokeScreens', { screens: [behind] });
  frames(6);
  bus.emit('ui:pause', { on: false });
  frames(1);
  const far = { born: 58, source: ['t72b3m_2022', 300, 2, 2500] };
  bus.emit('auxiliary:smokeScreens', { screens: [behind, far] });
  frames(2);
  assert.ok(!asked('enemy_smoke', paused), `no call at the resume for smoke popped behind the menu (asked ${said(paused)})`);
  // the control: f1's next screen, popped now, is called
  const popped = now();
  bus.emit('auxiliary:smokeScreens', { screens: [behind, far, { born: 70, source: ['t72b3m_2022', 0, 2, 400] }] });
  frames(1);
  assert.ok(asked('enemy_smoke', popped), `smoke popped in play is called (asked ${said(popped)})`);
});

await check('s1-03 a recalled drone that docks behind the pause menu is not called recovered at the resume', async () => {
  const me = tank('me', { isPlayer: true });
  await battle('drone', [me, foe('f1', 3000)]);
  const drone = droneFlight(me);
  // the control: a short menu while the recalled drone flies home; it is still flying home at the resume, so its
  // recovery is armed again and called at the dock
  drone.press();
  frames(4);
  const first = now();
  drone.press();
  frames(0.2);
  assert.ok(!me.aerial.active && me.aerial.returnS > 1, `the recall is accepted, the airframe flies home (returnS ${me.aerial.returnS})`);
  bus.emit('ui:pause', { on: true });
  frames(0.5);
  bus.emit('ui:pause', { on: false });
  framesUntil(() => !(me.aerial.returnS > 0), 60, 'the first recall parked');
  const docked = now();
  frames(1);
  const calls = probe.sayLog.filter((e) => e.t >= first && e.id === 'drone_recovered').map((e) => +(e.t - first).toFixed(2));
  assert.ok(calls.length === 1 && calls[0] >= docked - first - 0.15,
    `a recall still flying home at the resume is recovered once, at its dock ${(docked - first).toFixed(2)} s after the recall (asked at ${calls.join(', ') || 'never'} s)`);
  // a network battle goes on behind the menu: recalled as the menu opens, the drone docks behind it; 20 s on, the resume
  framesUntil(() => !(me.aerial.cooldownS > 0), 60, 'the next launch ready');
  drone.press();
  frames(4);
  const recalled = now();
  drone.press();
  frames(0.2);
  assert.ok(!me.aerial.active && me.aerial.returnS > 1, 'the second recall is accepted');
  bus.emit('ui:pause', { on: true });
  frames(20);
  assert.ok(!(me.aerial.returnS > 0), 'the drone docked behind the menu');
  bus.emit('ui:pause', { on: false });
  frames(3);
  assert.ok(!asked('drone_recovered', recalled), `no recovery called behind the menu or at the resume for a drone that docked behind it (asked ${said(recalled)})`);
});

// ---- s1-01: the life scope is our tank's life.
await check('s1-01 a Gun Game step\'s fresh weapon is loaded at once', async () => {
  const me = tank('me', { isPlayer: true });
  me.combat.reload = { t: 0, totalS: 3.5, kind: 'ready' };
  const target = foe('f1', 600);
  await battle('gun_game', [me, target]);
  spot('f1');
  // fired, the gun mid-reload: no fire command while the breech is empty
  me.combat.reload = { t: 1.75, totalS: 3.5, kind: 'shell' };
  bus.emit('player:reload', { total: 3.5, kind: 'shell', caliberMm: 125, t: 1.75, progress: 0.5 });
  const reloading = now();
  layOn(target);
  frames(1);
  listener.forward = AWAY;
  assert.ok(!probe.sayLog.some((e) => e.t >= reloading && e.id.startsWith('fire_command_')), `no fire command with the gun reloading (asked ${said(reloading)})`);
  // the kill advanced the ladder: a new gun, its reload fresh and ready (sim/modeLoadout.ts), and no done event ever comes
  me.spec = { ...me.spec, gun: { caliberMm: 105, shells: [{ type: 'APFSDS' }] } };
  me.combat.reload = { t: 0, totalS: 3.5, kind: 'ready' };
  bus.emit('mode:weapon_advanced', { id: 'me', stage: 1, name: '105 mm' });
  frames(3);
  const since = now();
  layOn(target);
  frames(1);
  listener.forward = AWAY;
  assert.ok(asked('fire_command_kinetic', since), `the new weapon's fire command, with no reload done event (asked ${said(since)})`);
});

await check('s1-01 a kill\'s cease fire dies with our tank', async () => {
  const me = tank('me', { isPlayer: true });
  const only = foe('f1', 600);
  await battle('capture_the_flag', [me, only]);
  spot('f1');
  frames(2);
  const since = now();
  only.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  frames(0.5);
  // killed ourselves inside the cease fire's 2.4 s, dead 6 s, back at the spawn
  me.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'me', killerId: 'x', pos: [0, 0, 0], cause: 'shot' });
  frames(6);
  me.combat.destroyed = false;
  bus.emit('mode:respawn', { id: 'me', team: 'alpha' });
  frames(1);
  assert.ok(!asked('cease_fire', since), `no stale cease fire at the respawn (asked ${said(since)})`);
});

await check('s1-01 a posthumous kill arms no cease fire for the next life', async () => {
  const me = tank('me', { isPlayer: true });
  const only = foe('f1', 600);
  await battle('capture_the_flag', [me, only]);
  spot('f1');
  frames(2);
  const since = now();
  // killed first; our round still in flight kills the only enemy (state.ts credits a shell's kill to its shooter)
  me.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'me', killerId: 'f1', pos: [0, 0, 0], cause: 'shot' });
  frames(0.5);
  only.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  frames(6);
  me.combat.destroyed = false;
  bus.emit('mode:respawn', { id: 'me', team: 'alpha' });
  frames(4);
  assert.ok(!asked('cease_fire', since), `no cease fire in the next life for a kill made after our death (asked ${said(since)})`);
});

await check('s1-01 a revive no event announces starts the next life', async () => {
  const me = tank('me', { isPlayer: true });
  const only = foe('f1', 600);
  await battle('capture_the_flag', [me, only]);
  spot('f1');
  frames(2);
  // the last life's low-hull call, made
  const hurt = now();
  bus.emit('shell:hit', { shellId: 9101, pos: [0, 1.5, 2], kind: 'pen', targetId: 'me', attackerId: 'f1', damage: 800, caliberMm: 125,
    targetMaxHp: 1000, targetHpAfter: 200, modulesHit: [], crewHit: [] });
  frames(3);
  assert.ok(asked('low_hp', hurt), `the last life's low-hull call (asked ${said(hurt)})`);
  const since = now();
  me.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'me', killerId: 'f1', pos: [0, 0, 0], cause: 'shot' });
  frames(0.5);
  only.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  frames(6);
  // a migrated host's adoptLiveCombat (sim/matchModes.ts): our hull stands again with no mode_respawn, the frame tells it
  me.combat.destroyed = false;
  me.combat.hp = 1000;
  frames(4);
  assert.ok(!asked('cease_fire', since), `no cease fire in a life no event announced, for a kill made after our death (asked ${said(since)})`);
  const again = now();
  bus.emit('shell:hit', { shellId: 9102, pos: [0, 1.5, 2], kind: 'pen', targetId: 'me', attackerId: 'f1', damage: 800, caliberMm: 125,
    targetMaxHp: 1000, targetHpAfter: 200, modulesHit: [], crewHit: [] });
  frames(3);
  assert.ok(asked('low_hp', again), `the new life's low-hull call is armed again (asked ${said(again)})`);
});

await check('s1-01 a recalled drone flying home when our tank dies is not recovered by our next life', async () => {
  const me = tank('me', { isPlayer: true });
  await battle('drone', [me, foe('f1', 3000)]);
  const drone = droneFlight(me);
  // the control: a recall the authority accepts, flown home and parked while we live, is recovered at its dock (review
  // r2: not when the recall is accepted, seconds before it is back aboard)
  drone.press();
  frames(4);
  assert.ok(me.aerial.active, 'the drone flies');
  const recalled = now();
  drone.press();
  frames(0.2);
  assert.ok(!me.aerial.active && me.aerial.returnS > 1, `the recall is accepted, the airframe flies home (returnS ${me.aerial.returnS})`);
  framesUntil(() => !(me.aerial.returnS > 0), 60, 'the recall parked');
  const docked = now();
  frames(1);
  const calls = probe.sayLog.filter((e) => e.t >= recalled && e.id === 'drone_recovered').map((e) => +(e.t - recalled).toFixed(2));
  assert.ok(calls.length === 1 && calls[0] >= docked - recalled - 0.15,
    `recovered once, at the dock ${(docked - recalled).toFixed(2)} s after the recall (asked at ${calls.join(', ') || 'never'} s)`);
  // recalled again, and our tank dies while it flies home (the sim grounds a dead carrier's drone); the next life starts
  // with the drone docked
  framesUntil(() => !(me.aerial.cooldownS > 0), 60, 'the next launch ready');
  drone.press();
  frames(4);
  drone.press();
  frames(0.5);
  assert.ok(!me.aerial.active && me.aerial.returnS > 0, 'recalled again, flying home');
  const since = now();
  me.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'me', killerId: 'f1', pos: [0, 0, 0], cause: 'shot' });
  frames(3);
  me.combat.destroyed = false;
  bus.emit('mode:respawn', { id: 'me', team: 'alpha' });
  frames(2);
  assert.ok(!asked('drone_recovered', since), `the last life's drone is not "recovered" in the next (asked ${said(since)})`);
});

// ---- review r2: our drone as the authority flies it. `recallS` is the recall's gate at launch (every flight starts
// with it), never a recall: read as one, no flight's battery or link was ever called and every loss was "recovered".
await check('review r2 a drone lost to its battery or its link is called low and weak, never recovered', async () => {
  const me = tank('me', { isPlayer: true });
  await battle('drone', [me, foe('f1', 3000)]);
  const drone = droneFlight(me);
  const since = now();
  drone.press();
  frames(1);
  assert.ok(me.aerial.active && me.aerial.recallS > 0, 'launched, inside the recall\'s gate');
  // it hovers by its dock until the battery is spent (sim: lost at 40 s)
  framesUntil(() => !me.aerial.active, 60, 'the battery spent');
  frames(2);
  assert.ok(asked('drone_battery_low', since), `the battery's warning on a flight that runs it down (asked ${said(since)})`);
  assert.ok(!asked('drone_recovered', since), `a drone lost to its battery is not "recovered" (asked ${said(since)})`);
  // a fresh battle's flight, flown straight out until the link is lost
  const me2 = tank('me', { isPlayer: true });
  await battle('drone', [me2, foe('f1', 3000)]);
  const out = droneFlight(me2);
  const away = now();
  out.press();
  frames(1);
  out.pilot.input.throttle = 1;
  out.pilot.input.aimPoint = new Vector3(0, 30, 1e5);
  framesUntil(() => !me2.aerial.active, 60, 'the link lost');
  frames(2);
  assert.ok(asked('drone_link_weak', away), `the link's warning on a flight that runs out to its edge (asked ${said(away)})`);
  assert.ok(!asked('drone_recovered', away), `a drone lost past its link is not "recovered" (asked ${said(away)})`);
});

// ---- review r2: a seat the player takes in a watched battle is a new life.
/** A watched battle: the human seat `seat` drives through the reveal, then the battle opens (nobody drives) and the
 *  watcher takes `first`; the listener is the driven hull's. */
async function watchedTake(mode, roster, seat, first) {
  const watch = watchedBattle(roster, seat);
  await battle(mode, roster, watch.sees);
  openWatchSeats(watch.game);
  listener.kind = 'camera';
  listener.ownerId = null;
  frames(1);
  assert.ok(takeWatchSeat(watch.game, first), `the watcher takes ${first.id}`);
  listener.kind = 'player-tank';
  listener.ownerId = first.id;
  frames(1);
  return watch;
}
/** The seat dies and the death flow hands it back (watchController drivenHandoff: takenDeathS 3.5 s), the drone camera
 *  flies a while, and the watcher takes `next`, a living bot (no revive, no event). */
function nextSeat(watch, next) {
  frames(3.6);
  leaveWatchSeat(watch.game);
  listener.kind = 'camera';
  listener.ownerId = null;
  frames(5);
  assert.ok(takeWatchSeat(watch.game, next), `the watcher takes ${next.id}`);
  listener.kind = 'player-tank';
  listener.ownerId = next.id;
  return now();
}

await check('s1-01 a kill\'s cease fire is not called for the next seat the watcher takes', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 }), w2 = tank('w2', { x: 80 });
  const near = foe('f1', 600), far = foe('f9', 4000);
  const watch = await watchedTake('standard', [seat, w1, w2, near, far], seat, w1);
  watch.spot('f1', 'w1');
  frames(2);
  // w1 kills the only near enemy, and is killed inside the cease fire's 2.4 s
  near.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'w1', pos: [0, 0, 600], cause: 'shot' });
  frames(0.5);
  w1.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'w1', killerId: 'f9', pos: [40, 0, 0], cause: 'shot' });
  const taken = nextSeat(watch, w2);
  frames(3);
  assert.ok(!asked('cease_fire', taken), `no cease fire on the next seat for the last seat's kill (asked ${said(taken)})`);
});

await check('s1-01 the last seat\'s posthumous kill arms nothing for the next seat', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 }), w2 = tank('w2', { x: 80 });
  const near = foe('f1', 600), far = foe('f9', 4000);
  const watch = await watchedTake('standard', [seat, w1, w2, near, far], seat, w1);
  watch.spot('f1', 'w1');
  frames(2);
  w1.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'w1', killerId: 'f1', pos: [40, 0, 0], cause: 'shot' });
  frames(0.5);
  // w1's round still in flight kills the only near enemy (state.ts credits a shell's kill to its shooter)
  near.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'w1', pos: [0, 0, 600], cause: 'shot' });
  const taken = nextSeat(watch, w2);
  frames(3);
  assert.ok(!asked('cease_fire', taken), `no cease fire on the next seat for a kill the last seat made dead (asked ${said(taken)})`);
});

await check('s1-01 the last seat\'s recalled drone is not recovered by the next', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 }), w2 = tank('w2', { x: 80 });
  const roster = [seat, w1, w2, foe('f9', 4000)];
  // in Drone every hull carries a drone (each its own flight); w2's stays docked
  const watch = watchedBattle(roster, seat);
  await battle('drone', roster, watch.sees);
  const drone = droneFlight(w1);
  droneFlight(w2);
  openWatchSeats(watch.game);
  frames(1);
  assert.ok(takeWatchSeat(watch.game, w1), 'the watcher takes w1');
  listener.ownerId = 'w1';
  drone.press();
  frames(4);
  drone.press();
  frames(0.5);
  assert.ok(!w1.aerial.active && w1.aerial.returnS > 0, 'w1\'s drone recalled, flying home');
  const since = now();
  w1.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'w1', killerId: 'f9', pos: [40, 0, 0], cause: 'shot' });
  nextSeat(watch, w2);
  frames(3);
  assert.ok(!asked('drone_recovered', since), `w1's drone is not "recovered" for w2 (asked ${said(since)})`);
});

await check('s1-01 a seat taken back from its brain is a new life', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 });
  const near = foe('f1', 600), far = foe('f9', 4000);
  const watch = await watchedTake('standard', [seat, w1, near, far], seat, w1);
  watch.spot('f1', 'w1');
  frames(2);
  // w1's kill arms the cease fire; the watcher leaves the seat at once (w1 lives on, its brain drives it) and takes it
  // back 5 s later
  const killed = now();
  near.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f1', killerId: 'w1', pos: [0, 0, 600], cause: 'shot' });
  frames(0.2);
  leaveWatchSeat(watch.game);
  listener.kind = 'camera';
  listener.ownerId = null;
  frames(5);
  assert.ok(takeWatchSeat(watch.game, w1), 'the watcher takes w1 back');
  listener.kind = 'player-tank';
  listener.ownerId = 'w1';
  frames(3);
  assert.ok(!asked('cease_fire', killed), `no cease fire for a seat its brain drove, nor at the take back (asked ${said(killed)})`);
});

await check('review r3 a seat taken keeps its own hull\'s radio set, not the last seat\'s', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 }), w2 = tank('w2', { x: 80 }), w3 = tank('w3', { x: 120 });
  const watch = await watchedTake('standard', [seat, w1, w2, w3, foe('f9', 4000)], seat, w1);
  assert.equal(radioBand(), RADIO_BAND.ok, 'w1\'s whole set');
  // the reading's control: our seat's set destroyed while the watcher drives it
  radioHit(w1, 'red');
  frames(0.5);
  assert.equal(radioBand(), RADIO_BAND.red, 'w1\'s destroyed set narrows the band');
  // w2's set is damaged while its brain drives it; the watcher leaves w1 and takes w2
  radioHit(w2, 'yellow');
  nextSeat(watch, w2);
  frames(1);
  assert.equal(radioBand(), RADIO_BAND.yellow, 'w2\'s set, damaged while its brain drove it, sounds damaged from the take');
  // w2 left, its set destroyed under its brain, taken back
  leaveWatchSeat(watch.game);
  listener.kind = 'camera';
  listener.ownerId = null;
  frames(1);
  radioHit(w2, 'red');
  frames(1);
  assert.ok(takeWatchSeat(watch.game, w2), 'the watcher takes w2 back');
  listener.kind = 'player-tank';
  listener.ownerId = 'w2';
  frames(1);
  assert.equal(radioBand(), RADIO_BAND.red, 'w2\'s set, destroyed while its brain drove it, sounds destroyed from the take back');
  // a whole hull taken sounds whole: the last seat's set does not carry
  nextSeat(watch, w3);
  frames(1);
  assert.equal(radioBand(), RADIO_BAND.ok, 'w3\'s whole set sounds whole, not w2\'s');
});

await check('review r3 a seat taken sounds its own hull\'s fire alarm, not the last seat\'s', async () => {
  const seat = tank('me', { isPlayer: true }), w1 = tank('w1', { x: 40 }), w2 = tank('w2', { x: 80 }), w3 = tank('w3', { x: 120 });
  const watch = await watchedTake('standard', [seat, w1, w2, w3, foe('f9', 4000)], seat, w1);
  setFire(w1, true);
  frames(0.5);
  assert.equal(fireAlarms(), 1, 'w1 burning: its fire alarm sounds');
  // w3 catches fire under its brain: another hull's fire, no alarm of ours
  setFire(w3, true);
  frames(0.5);
  assert.equal(fireAlarms(), 1, 'w3\'s fire is not ours');
  // the watcher leaves w1 burning and takes w2, which does not burn
  nextSeat(watch, w2);
  frames(1);
  assert.equal(fireAlarms(), 0, 'the last seat\'s fire alarm stops at the take (w2 does not burn)');
  // w1's fire goes out and w1 dies: another hull's events now
  setFire(w1, false);
  frames(0.5);
  w1.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'w1', killerId: 'f9', pos: [40, 0, 0], cause: 'shot' });
  frames(1);
  assert.equal(fireAlarms(), 0, 'nothing sounds for w2 when w1\'s fire goes out or w1 dies');
  // a hull taken burning sounds its own alarm, and its fire going out stops it
  nextSeat(watch, w3);
  frames(1);
  assert.equal(fireAlarms(), 1, 'w3 taken burning: its alarm sounds');
  const out = now();
  setFire(w3, false);
  frames(1);
  assert.equal(fireAlarms(), 0, 'w3\'s fire out: its alarm stops');
  assert.ok(asked('fire_out', out), `w3's fire out is called (asked ${said(out)})`);
});

/** A new life's combat state, as sim/damage.ts createCombatState makes it: whole, its fire out. */
const freshCombat = (hull) => ({ ...tank(hull.id, { team: hull.team }).combat, fire: { burning: false } });

// ---- review r4: a living hull's revive (sim/matchModes.ts: "alive -> alive is a living hull's revive", a Turbo Ball
// goal's kick-off or the range reset) puts out the fire its last life lit. The driver's revive writes a fresh combat (fire
// out) and tells no tank:fire; the controller then tells mode_respawn, which the game relays as mode:respawn (state.ts).
await check('review r4 a living hull\'s revive puts out its last life\'s fire: our alarm and each hull\'s engine-deck fire', async () => {
  const me = tank('me', { isPlayer: true }), f1 = foe('f1', 40);
  const roster = [me, f1];
  const mode = createMatchModeController({ mode: 'turbo_ball', entities: roster,
    // the drivers' revive hook (state.ts revive, authoritativeMatch.ts reviveForMode): a fresh combat, its fire out
    revive(hull) { hull.combat = freshCombat(hull); },
    emit: (type, payload) => bus.emit(type.replace(/^mode_/, 'mode:'), payload) });
  await battle('turbo_ball', roster);
  setFire(me, true);
  setFire(f1, true);
  frames(1);
  await probe.libraryIdle();
  frames(1);
  assert.equal(fireAlarms(), 1, 'our hull burning: its fire alarm sounds');
  assert.equal(deckFires(), 2, 'both hulls burning: each engine deck crackles');
  const since = now();
  // every hull back on its spawn, alive -> alive (the controller's revive, as a goal's kick-off line-up revives them)
  mode.reviveAll();
  assert.deepEqual([me.modeLife ?? 'alive', f1.modeLife ?? 'alive', me.combat.fire.burning], ['alive', 'alive', false], 'the controller revived both hulls alive, fire out');
  frames(2);
  assert.equal(fireAlarms(), 0, 'our revived hull does not burn: its alarm stops (it looped on before fix-up r3)');
  assert.equal(deckFires(), 0, 'neither revived hull burns: no engine-deck fire crackles on at its spawn');
  assert.ok(!asked('fire_out', since), `a revive puts no fire out for the crew to call (asked ${said(since)})`);
  // the new life's own fire is heard as any fire
  setFire(me, true);
  frames(1);
  assert.equal(fireAlarms(), 1, 'the new life\'s fire sounds its alarm');
  const out = now();
  setFire(me, false);
  frames(1);
  assert.equal(fireAlarms(), 0, 'the new life\'s fire out: its alarm stops');
  assert.ok(asked('fire_out', out), `the new life's fire out is called (asked ${said(out)})`);
});

await check('review r4 a network battle\'s restart puts out every hull\'s engine-deck fire', async () => {
  const me = tank('me', { isPlayer: true }), f1 = foe('f1', 40);
  await battle('standard', [me, f1]);
  setFire(me, true);
  setFire(f1, true);
  frames(1);
  await probe.libraryIdle();
  frames(1);
  assert.equal(deckFires(), 2, 'both hulls burning: each engine deck crackles');
  // the presentation's restart (battlePresentation.ts resetSettledWorld): every actor's new life, fire out, then the event
  for (const hull of [me, f1]) hull.combat = freshCombat(hull);
  bus.emit('battle:restarted', {});
  frames(2);
  assert.equal(fireAlarms(), 0, 'our alarm goes with the old hull');
  assert.equal(deckFires(), 0, 'no hull of the restarted battle crackles on at its spawn');
});

// ---- amendment 6: the escort's life is the mode's.
await check('amendment 6 an escort extracted is the mode\'s rescued life', async () => {
  const source = readFileSync(new URL('./crewProcedure.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /modeActive/, 'the crew reads the mode life, never re-derives it from the field flags');
  const me = tank('me', { isPlayer: true, aerial: { kind: 'gunship', active: true, x: 0, y: 240, z: 90 } });
  // the convoy (bots of our side, sim/gunshipEscort.ts) and a hostile, the same objects the frames hand the engine; each
  // escort's life is moved by the real AC-130 controller, the life's one writer (sim/matchModes.ts setLife)
  const rescued = tank('a1', { x: 40, z: 300 }), benched = tank('a2', { x: -40, z: 300 }), downed = tank('a3', { x: 0, z: 320 });
  for (const ally of [rescued, benched, downed]) ally.bot = true;
  const roster = [me, rescued, benched, downed, foe('f1', 3000)];
  const mode = createMatchModeController({ mode: 'ac130', entities: roster,
    setActive(target, active) { target.modeActive = active; }, revive() {} });
  await battle('ac130', roster);
  const since = now();
  // a1 reaches the extraction point (the escort's rescue: setLife 'rescued'); a3's hull is destroyed (the controller's
  // death observer: 'down')
  rescued.state.pos.x = mode.state.escort.x;
  rescued.state.pos.z = mode.state.escort.z;
  downed.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'a3', killerId: 'f1', pos: [0, 0, 320], cause: 'shot' });
  mode.step(1 / 60, 1);
  // a2 benched: the AC-130 controller benches an escort only through a migrated host's restore (the old host's word)
  const saved = mode.captureCheckpoint(1);
  mode.restoreCheckpoint({ ...saved, lives: saved.lives.map(([id, life]) => [id, id === 'a2' ? 'benched' : life]) });
  assert.deepEqual([rescued.modeLife, benched.modeLife, downed.modeLife], ['rescued', 'benched', 'down'], 'the controller moved each escort\'s life');
  frames(3);
  const calls = probe.sayLog.filter((e) => e.t >= since && e.id === 'gunship_friendly_extracted').length;
  assert.equal(calls, 1, `one extraction call, for the rescued escort alone (asked ${said(since)})`);
});

// ---- s1-02: the crew names only what the player sees.
/** A battle where the player sees our side and the enemies in `shown` (a case takes one out as the game would hide it). */
async function seenBattle(roster, shown) {
  await battle('standard', roster, (hull) => hull.team === 'player' || shown.has(hull.id));
}
const fireCommanded = (since) => probe.sayLog.some((e) => e.t >= since && e.id.startsWith('fire_command_'));
async function laidFor(hull, seconds = 1) {
  const since = now();
  layOn(hull);
  frames(seconds);
  listener.forward = AWAY;
  return since;
}

await check('s1-02 an enemy whose spot lingered out is not commanded', async () => {
  const shown = new Set(['f1']);
  const target = foe('f1', 800);
  await seenBattle([tank('me', { isPlayer: true }), target], shown);
  spot('f1');
  frames(1);
  shown.delete('f1'); // behind the ridge: the spot lingers out (spotting.ts emits nothing), the hull stays where it is
  const since = await laidFor(target);
  assert.ok(!fireCommanded(since), `no fire command on a hull the player no longer sees (asked ${said(since)})`);
});

await check('s1-02 an enemy a far ally lit is not commanded', async () => {
  const target = foe('f2', 700);
  await seenBattle([tank('me', { isPlayer: true }), target], new Set());
  // the team's spot (the event ignores the receiver): beyond the radio share, the player's seat never sees it
  bus.emit('tank:spotted', { id: 'f2', team: 'player', spotterId: 'a9', timeS: 0 });
  frames(1);
  const since = await laidFor(target);
  assert.ok(!fireCommanded(since), `no fire command on a hull only a far ally sees (asked ${said(since)})`);
});

await check('s1-02 an enemy revived at its spawn is not commanded', async () => {
  const shown = new Set(['f3']);
  const target = foe('f3', 500);
  await seenBattle([tank('me', { isPlayer: true }), target], shown);
  spot('f3');
  frames(1);
  target.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f3', killerId: 'a9', pos: [0, 0, 500], cause: 'shot' });
  frames(1);
  // its contact retired with its death (spotting.ts retireContact): back at its spawn, unseen
  shown.delete('f3');
  target.combat.destroyed = false;
  target.state.pos.x = 30;
  target.state.pos.z = 900;
  bus.emit('mode:respawn', { id: 'f3', team: 'bravo' });
  frames(1);
  const since = await laidFor(target);
  assert.ok(!fireCommanded(since), `no fire command on a revived hull the player has not seen (asked ${said(since)})`);
});

await check('s1-02 a network hull the authority stopped sending is not commanded', async () => {
  const target = foe('f4', 650);
  const me = tank('me', { isPlayer: true });
  await seenBattle([me, target], new Set(['f4']));
  spot('f4');
  frames(1);
  // hidden now: the actor leaves the seat's list (battlePresentation keeps its last pose), the sight on that pose
  field = [me];
  const since = await laidFor(target);
  assert.ok(!fireCommanded(since), `no fire command on a hull missing from this frame (asked ${said(since)})`);
});

await check('s1-02 a hidden enemy near does not hold the cease fire', async () => {
  const shown = new Set(['f5', 'f6']);
  const hidden = foe('f5', 800, 200), victim = foe('f6', 600);
  await seenBattle([tank('me', { isPlayer: true }), hidden, victim], shown);
  spot('f5');
  spot('f6');
  frames(8);
  shown.delete('f5');
  const since = now();
  victim.combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'f6', killerId: 'me', pos: [0, 0, 600], cause: 'shot' });
  frames(4);
  assert.ok(asked('cease_fire', since), `the cease fire: no enemy the player sees stands near (asked ${said(since)})`);
});

await check('s1-02 an enemy the player sees is commanded', async () => {
  const target = foe('f7', 600);
  await seenBattle([tank('me', { isPlayer: true }), target], new Set(['f7']));
  spot('f7');
  frames(1);
  const since = await laidFor(target);
  assert.ok(asked('fire_command_kinetic', since), `the fire command on a hull the player sees (asked ${said(since)})`);
});

await check('s1-02 a watched battle\'s seat its brain drives makes no sighting call (the drone camera on a revealed enemy)', async () => {
  const seat = tank('me', { isPlayer: true }), w2 = tank('w2', { x: 80 });
  const target = foe('f1', 600);
  const watch = watchedBattle([seat, w2, target], seat);
  await battle('standard', [seat, w2, target], watch.sees);
  // the battle opens: the human seat's brain drives it and nobody is the player; the watch reveals every hull
  openWatchSeats(watch.game);
  assert.ok(!seat.isPlayer && watch.sees(target) && !watch.spotted.has('f1'), 'nobody drives, the enemy shows though no side spotted it');
  listener.kind = 'camera';
  listener.ownerId = null;
  listener.pos = { x: 0, y: 30, z: -100 };
  frames(2);
  // the drone camera holds on the enemy, the seat's gun loaded
  const since = await laidFor(target, 1.5);
  assert.ok(!fireCommanded(since), `no fire command for a seat nobody drives (asked ${said(since)})`);
  // the control: the watcher takes a bot whose side has the enemy spotted; its crew commands it
  assert.ok(takeWatchSeat(watch.game, w2), 'the watcher takes w2');
  watch.spot('f1', 'w2');
  listener.kind = 'player-tank';
  listener.ownerId = 'w2';
  listener.pos = { x: 80, y: 2, z: 0 };
  frames(1);
  const driven = await laidFor(target);
  assert.ok(asked('fire_command_kinetic', driven), `the seat the watcher drives commands the enemy it sees (asked ${said(driven)})`);
});

await check('s1-02 a watched battle\'s seat its brain drives still hears the battle\'s mode calls (review r3, a guard)', async () => {
  // the boundary of the driven gate: the crew's per-life and sighting calls are the driven seat's, the battle's mode calls
  // (onMode, gated on inBattle) are the side's news, heard with nobody driving as the engine's own mode calls are
  const seat = tank('me', { isPlayer: true }), ally = tank('a1', { x: 20 });
  const roster = [seat, ally, foe('f9', 3000)];
  const watch = watchedBattle(roster, seat);
  await battle('endless_horde', roster, watch.sees);
  openWatchSeats(watch.game);
  assert.ok(!seat.isPlayer, 'nobody drives');
  listener.kind = 'camera';
  listener.ownerId = null;
  frames(2);
  const since = now();
  bus.emit('mode:wave_started', { wave: 2, special: 'runner' });
  frames(5);
  assert.ok(spoken('wave_incoming', since), `the engine's wave call (heard ${probe.voiceLog.filter((e) => e.t >= since).map((e) => e.id)})`);
  assert.ok(spoken('wave_runners', since), `the crew's runner call (asked ${said(since)}; heard ${probe.voiceLog.filter((e) => e.t >= since).map((e) => e.id)})`);
});

assert.deepEqual(failures, [], `crewProcedure.selftest:\n  ${failures.join('\n  ')}`);
console.log('crewProcedure.selftest: the pause silences the net and cancels armed calls on both edges (a recalled drone docked behind it too), the crew\'s battle is the engine\'s, a fresh weapon is loaded, a kill\'s cease fire and a drone\'s recovery die with our tank, each revive and each seat the watcher takes starts a life (a posthumous kill arms nothing for it) with the taken hull\'s own radio set and fire alarm, a living hull\'s revive puts its fire out, our drone is called as the authority flies it, an escort the controller rescues is extracted, the crew names only what the player sees, its per-life calls are the driven seat\'s and the battle\'s mode calls the side\'s passed');
