// Receipt (round 8 Y3; the 269 crew procedure's own machines, re-swept 2026-11-08): the crew's calls hang off the engine's
// declared battle mode and its edges, driven through the real engine (bus events and frames in, its say log out).
//   - s1-03, the battle scope: the pause menu silences the net (the line queued before the pause is dropped, the crew's
//     armed calls are cancelled, nothing is said behind it or late on the resume); the crew keeps no battle edge of its
//     own (it subscribes to no phase change and no raw death: the engine's resetBattlePlay and death latch are its edges).
//   - s1-01, the life scope: the gun is loaded while our reload channel is ready, so a Gun Game step's fresh weapon gets its
//     fire command at once (no reload ever finished for it); a kill's cease fire and a recalling drone's recovery die with
//     our tank, so neither is said at the respawn.
//   - round 8 amendment 6, the escort's life: an AC-130 crew calls a friendly extracted when its mode life is 'rescued'
//     (sim/matchModes.ts setLife, the hull's one life writer), never a benched or downed one, and reads no flags of its
//     own for it (a network seat sees no rescue: the authority stops sending a hull that leaves the field).
//   - s1-02, one visibility truth: the crew names only what the player sees (src/game/playerVisibility.ts, handed to
//     audio.update as the listener's runtime does): no fire command on an enemy whose spot lingered out, one a far ally
//     lit, one revived at its spawn, or a network hull the authority stopped sending; a hidden enemy near does not hold
//     the cease fire; an enemy the player sees is still commanded.
// Each case runs on its own battle; a case that fails is reported with the rest, so one run shows every red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, probeOf } from './engineHarness.test-support.mjs';

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
const frames = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { ctx.advance(1 / 30); audio.update(1 / 30, listener, field, [], sees); } };
const now = () => +ctx.currentTime.toFixed(3);
const asked = (id, since) => probe.sayLog.some((e) => e.t >= since && e.id === id);
const spoken = (id, since) => probe.voiceLog.some((e) => e.t >= since && e.id === id);
const said = (since) => probe.sayLog.filter((e) => e.t >= since).map((e) => `${e.id}${e.ok ? '' : `(${e.why})`}`).join(', ');
const foe = (id, z, x = 0) => tank(id, { team: 'enemy', x, z });
const spot = (id) => bus.emit('tank:spotted', { id, team: 'player', spotterId: 'me', timeS: 0 });

/** A battle of `mode` with this field, rolled out and quiet. */
async function battle(mode, roster, visible = EVERY_HULL) {
  gameMode = mode;
  field = roster;
  sees = visible;
  listener.forward = AWAY;
  bus.emit('phase:change', { phase: 'garage' });
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents([...new Set(roster.map((t) => t.specId))]);
  frames(0.2);
  await probe.libraryIdle();
  bus.emit('battle:rollout', {});
  frames(4);
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

await check('s1-01 a recalling drone is not recovered by our next life', async () => {
  const me = tank('me', { isPlayer: true });
  await battle('drone', [me, foe('f1', 3000)]);
  // the control: a recall that lands while we live is recovered
  me.aerial = { kind: 'drone', active: true, x: 0, y: 30, z: 60, batteryS: 40, recallS: 2 };
  frames(1);
  const landed = now();
  me.aerial = { kind: 'drone', active: false };
  frames(2);
  assert.ok(asked('drone_recovered', landed), `a recall that lands is recovered (asked ${said(landed)})`);
  frames(4);
  // recalling again when our tank dies; the next life starts with the drone docked
  me.aerial = { kind: 'drone', active: true, x: 0, y: 30, z: 60, batteryS: 40, recallS: 2 };
  frames(1);
  const since = now();
  me.combat.destroyed = true;
  me.aerial = { kind: 'drone', active: false };
  bus.emit('tank:destroyed', { id: 'me', killerId: 'f1', pos: [0, 0, 0], cause: 'shot' });
  frames(3);
  me.combat.destroyed = false;
  bus.emit('mode:respawn', { id: 'me', team: 'alpha' });
  frames(1);
  assert.ok(!asked('drone_recovered', since), `the last life's drone is not "recovered" at the respawn (asked ${said(since)})`);
});

// ---- amendment 6: the escort's life is the mode's.
await check('amendment 6 an escort extracted is the mode\'s rescued life', async () => {
  const source = readFileSync(new URL('./crewProcedure.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /modeActive/, 'the crew reads the mode life, never re-derives it from the field flags');
  const me = tank('me', { isPlayer: true, aerial: { kind: 'gunship', active: true, x: 0, y: 240, z: 90 } });
  const rescued = tank('a1', { x: 40, z: 300 }), benched = tank('a2', { x: -40, z: 300 }), downed = tank('a3', { x: 0, z: 320 });
  for (const ally of [rescued, benched, downed]) { ally.modeLife = 'alive'; ally.modeActive = true; }
  await battle('ac130', [me, rescued, benched, downed, foe('f1', 3000)]);
  const since = now();
  // as setLife leaves each: rescued (off the field, alive), benched (off the field, destroyed), down (on it, destroyed)
  Object.assign(rescued, { modeLife: 'rescued', modeActive: false });
  Object.assign(benched, { modeLife: 'benched', modeActive: false });
  benched.combat.destroyed = true;
  downed.modeLife = 'down';
  downed.combat.destroyed = true;
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

assert.deepEqual(failures, [], `crewProcedure.selftest:\n  ${failures.join('\n  ')}`);
console.log('crewProcedure.selftest: the pause silences the net and cancels armed calls, the crew\'s battle is the engine\'s, a fresh weapon is loaded, a kill\'s cease fire and a drone\'s recovery die with our tank, the crew names only what the player sees passed');
