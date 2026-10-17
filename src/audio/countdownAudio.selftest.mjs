// The battle's countdown is heard (2026-10-14, the owner: "make sure to fix audio in tank and so on not playing until
// after countdown"). Drives the real audio engine through the lazy facade, the real frame owner (its countdown, rollout
// and network edges) and the real rollout runtime, the audio graph stubbed: every fetched file "decodes" to a buffer
// named after its asset, so the loops sounding and the decode order read back by name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { createBattleFrameRuntime } from '../game/battleFrameRuntime.ts';
import { createBattleRolloutRuntime } from '../game/battleRolloutRuntime.ts';
import { advancePreBattleCountdown } from '../game/preBattleCountdown.ts';
import { createLazyAudio } from './lazyAudio.ts';
import { createAssetLibrary } from './assetLibrary.ts';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { resolveVehicleAudioIdentity } from './vehicleAudioProfiles.ts';
import { sceneForMap } from './environmentScenes.ts';
import { WEAPON_CLOSE } from './weaponAudio.ts';
import * as rulesets from '../sim/matchRuleset.ts';

globalThis.window = {};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const assetOf = (url) => String(url).replace(/^.*\/audio\/(?:sfx|voice)\/[^/]+\//, '').replace(/_\d+\.webm$/, '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const FRAME_S = 1 / 30;
const seconds = (s) => Math.round(s / FRAME_S);

/** Fetch whose files decode to buffers named after their asset; `hold(url)` files wait for release(). */
function installFetch(hold = () => false) {
  const order = [];
  const held = [];
  globalThis.fetch = (url) => {
    const href = String(url);
    order.push(href);
    const response = () => ({ ok: true, status: 200, arrayBuffer: async () => encoder.encode(href).buffer });
    if (!hold(href)) return Promise.resolve(response());
    return new Promise((resolve) => held.push({ url: href, release: () => resolve(response()) }));
  };
  return { order, held };
}

const ROSTER = ['t72b3m_2022', 'leo2a4', 'm1a1_abrams_hc'];
const MAP = 'verdant';
const scene = sceneForMap(MAP);
const family = Object.fromEntries(ROSTER.map((id) => [id, resolveVehicleAudioIdentity({ id }).engine]));
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
// Weapons and impacts: nothing of the kind may sound before the battle rolls out.
const WEAPON = /^(gun_|ac_|mg_|shell_|blast_|missile_|launch_|pen_|ricochet|nonpen|expl_|impact_|heat_|he_|bullet_|tail_|era_|case_|breech_)/;

function tank(id, specId, nation, { x = 0, z = 0, team = 'player', isPlayer = false } = {}) {
  return {
    id, team, isPlayer, specId,
    spec: { id: specId, nation, role: 'mbt', weightTons: 50, enginePowerHp: 1200, topSpeedKmh: 68, reverseSpeedKmh: 15, gun: { caliberMm: 120, shells: [{ type: 'APFSDS' }] } },
    state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
  };
}
const me = tank('me', 't72b3m_2022', 'Russia', { isPlayer: true });
const tanks = [me, tank('ally', 'leo2a4', 'Germany', { x: 30, z: 60 }), tank('foe', 'm1a1_abrams_hc', 'USA', { x: -40, z: 160, team: 'enemy' })];
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };

/**
 * One battle's composition, wired as main.ts wires it: the lazy facade, the frame owner, the rollout runtime. `list` is
 * the hulls the battle presents (game.tanks), `mode` its game mode, `getTeamRoster` main's counted roster (network).
 */
function compose({ network = false, list = tanks, mode = 'standard', getTeamRoster } = {}) {
  delete globalThis.window.__COT_AUDIO; // each composition's engine installs its own debug surface
  const ctx = createFakeContext({ decode: (bytes) => Object.assign(fakeBuffer(1.5), { name: assetOf(decoder.decode(bytes)) }) });
  let contexts = 0;
  const bus = createBus();
  const audio = createLazyAudio({
    loadMixer: () => import('./audioEngine.ts'),
    createContext: () => { contexts++; return ctx; },
    hasStickyActivation: () => true,
    getMapId: () => MAP,
    getGameMode: () => mode,
    getTerrain: () => terrain,
    ...(getTeamRoster ? { getTeamRoster } : {}),
  });
  audio.bindBus(bus);
  const game = { phase: 'garage', preBattleS: 0, result: null, player: me, timeS: 0 };
  const run = { steps: 0, warmPending: false, network, rollouts: [] };
  const frames = createBattleFrameRuntime({
    game,
    settings: { isOpen: () => false },
    killcam: { isActive: () => false },
    input: { poll: () => {} },
    network: { isActive: () => run.network, pump: () => {} },
    countdown: {
      isWarmPending: () => run.warmPending,
      advance: advancePreBattleCountdown,
      show: () => {},
      // main.ts's port (asserted against its source below)
      rollout: (late = false) => { run.rollouts.push(late); bus.emit('battle:rollout', late ? { late: true } : {}); },
      second: (seconds) => bus.emit('battle:countdown', { seconds }),
    },
    presentation: { captureSoloPose: () => {}, update: () => {}, updateResult: () => {} },
    getRigMode: () => 'ARCADE',
    // A stand-in simulation whose guns fire whenever it steps: the countdown must never step it.
    stepSimulation: () => {
      run.steps++;
      if (run.steps % 20 === 1) {
        bus.emit('shell:fired', { shellId: run.steps, shooterId: 'foe', muzzlePos: [-40, 2, 160], dir: [0.24, 0, -0.97], caliberMm: 120, shellType: 'APFSDS', velocityMps: 1650 });
      }
    },
    emitPause: (paused) => bus.emit('ui:pause', { on: paused }),
  });
  const rollout = createBattleRolloutRuntime({ game, bus, audio, getHud: () => null, defaultPreBattleSeconds: 3 });
  let nowMs = 0;
  // 30 frames a second: the count, the ramps and the waits are in seconds
  const frame = (dt = FRAME_S) => {
    ctx.advance(dt);
    nowMs += dt * 1000;
    frames.advance(dt, dt, nowMs, false);
    audio.update(dt, listener, list);
  };
  const enterBattle = () => {
    game.phase = 'battle';
    game.preBattleS = Infinity; // soloBattleStartRuntime: armed behind the loader, opened at the reveal
    bus.emit('phase:change', { phase: 'battle' });
  };
  const leaveBattle = () => {
    game.phase = 'garage';
    bus.emit('phase:change', { phase: 'garage' });
    frame();
  };
  return { ctx, bus, audio, game, run, frame, rollout, enterBattle, leaveBattle, contexts: () => contexts };
}

const probeOf = () => globalThis.window.__COT_AUDIO;
const mark = (probe) => probe.sfxLog.at(-1)?.seq ?? 0;
const since = (probe, seq) => probe.sfxLog.filter((e) => e.seq > seq).map((e) => e.n);
const count = (names, id) => names.filter((n) => n === id).length;
/** Recorded loops sounding now, by asset. */
const sounding = (ctx) => ctx.started.filter((n) => n.kind === 'source' && n.loop && n.buffer?.name && n.stopped == null).map((n) => n.buffer.name);
/** The level of a loop's own gain (the rig's layer, the pool's voice) as last set. */
const loopGain = (ctx, asset) => Math.max(0, ...ctx.started.filter((n) => n.kind === 'source' && n.loop && n.buffer?.name === asset && n.stopped == null)
  .map((n) => n.outputs[0]?.gain?.value ?? 0));

// ------------------------------------------------------------------ 1. solo: the countdown is heard, once
{
  const c = compose();
  c.audio.update(1 / 60, listener, tanks);
  assert.equal(c.contexts(), 0, 'no audio device before the first gesture');
  installFetch();
  c.audio.resume(); // the first garage gesture
  await c.audio.warmBattleEvents(ROSTER); // the solo loader (raced at 3.5 s)
  const probe = probeOf();
  await probe.libraryIdle();
  assert.equal(c.contexts(), 1, 'the gesture made the one context');
  c.enterBattle();
  c.audio.loadingOn(false); // the reveal (soloBattleLoadingRuntime): the loader's bed off, the battle's world on
  c.audio.ambientOn(true);
  const seq = mark(probe);
  c.rollout.open(3); // openBattle: the visible count
  assert.equal(c.game.preBattleS, 3);

  let atHalf = null;
  let countdownFrames = 0;
  while (c.game.preBattleS > 0 && countdownFrames < seconds(10)) {
    c.frame();
    countdownFrames++;
    if (countdownFrames === seconds(2)) {
      atHalf = {
        rigs: probe.engineState(), loops: sounding(c.ctx), ambience: probe.ambientState(), bus: probe.busGains(),
        ownIdle: loopGain(c.ctx, `engine_${family.t72b3m_2022}_idle`), names: since(probe, seq),
      };
    }
  }
  assert.ok(atHalf, 'the count ran');
  const countdown = since(probe, seq);
  // vehicles: our rig, a near ally and a foe, engines running, our start-up once
  const rigs = Object.fromEntries(atHalf.rigs.map((r) => [r.id, r]));
  assert.equal(rigs.me?.lod, 'own', 'our hull is heard during the count');
  assert.ok(rigs.ally && rigs.foe, `the other hulls idle during the count (${Object.keys(rigs)})`);
  assert.equal(count(countdown, `engine_${family.t72b3m_2022}_start`), 1, `our engine starts once, as the count begins (${countdown})`);
  // our bank and the near ally's from idle up, the foe at 165 m on the far LOD's one band
  for (const id of [`engine_${family.t72b3m_2022}_idle`, `engine_${family.leo2a4}_idle`, `engine_${family.m1a1_abrams_hc}_mid`]) {
    assert.ok(atHalf.loops.includes(id), `${id} loops during the count (${atHalf.loops})`);
  }
  assert.ok(atHalf.ownIdle > 0.05, `and our idle is up 2 s into the count (${atHalf.ownIdle})`);
  // the world: the map's bed and the distant war
  assert.ok(atHalf.ambience.active && atHalf.ambience.loops.every((l) => l.playing), `the ambience plays (${JSON.stringify(atHalf.ambience.loops)})`);
  assert.ok(atHalf.loops.includes(scene.bed) && (scene.war <= 0 || atHalf.loops.includes('amb_distant_battle')), 'its beds are sounding');
  // the mix: the battle snapshot at the settings' master level
  assert.equal(atHalf.bus.snapshot, 'battle', 'the battle mix, not the pause or the garage');
  assert.ok(Math.abs(atHalf.bus.master - 0.8) < 1e-6, `the master is at the settings' level (${atHalf.bus.master})`);
  // the count itself: 3, 2, 1, then one horn at the rollout; nothing of a weapon before it
  assert.equal(c.run.steps, 0, 'the simulation never steps during the count');
  assert.deepEqual(countdown.filter((n) => WEAPON.test(n)), [], 'no weapon or impact sounds during the count');
  assert.equal(count(countdown, 'ui_countdown_tick'), 3, `three ticks (${countdown})`);
  assert.deepEqual(c.run.rollouts, [false], 'one rollout edge, with its cues');
  assert.equal(count(countdown, 'ui_countdown_go'), 1, 'one horn at the rollout');
  assert.ok(countdown.lastIndexOf('ui_countdown_tick') < countdown.indexOf('ui_countdown_go'), 'the ticks come before the horn');
  for (const id of ['sting_battle', 'hatch']) assert.equal(count(countdown, id), 1, `${id} once at the rollout`);
  assert.ok(probe.sayLog.some((e) => e.id === 'battle_start'), 'the crew calls the start');

  // live: nothing that started in the count starts again
  const live = mark(probe);
  for (let i = 0; i < seconds(1.5); i++) c.frame();
  const liveNames = since(probe, live);
  assert.ok(c.run.steps > 0 && liveNames.some((n) => WEAPON.test(n)), `live, the guns are heard (${liveNames})`);
  assert.equal(count(liveNames, `engine_${family.t72b3m_2022}_start`), 0, 'our engine never restarts at the rollout');
  for (const id of [scene.bed, 'amb_distant_battle', 'ui_countdown_go', 'ui_countdown_tick']) assert.equal(count(liveNames, id), 0, `${id} does not start again live`);
  const rigStarts = probe.soundLog.filter((e) => e.type === 'engine:start');
  assert.deepEqual(rigStarts.map((e) => e.id).sort(), ['ally', 'foe', 'me'], 'each rig is built once, at the count');
  // a second rollout edge (a duplicated event) never sounds the horn twice
  const again = mark(probe);
  c.bus.emit('battle:rollout', {});
  assert.deepEqual(since(probe, again).filter((n) => n === 'ui_countdown_go' || n === 'sting_battle'), [], 'one horn a battle');

  // ---------------------------------------------------------------- 2. the settings apply during the count
  c.leaveBattle();
  await c.audio.warmBattleEvents(ROSTER);
  c.enterBattle();
  c.audio.loadingOn(false);
  c.audio.ambientOn(true);
  const second = mark(probe);
  c.rollout.open(3);
  for (let i = 0; i < seconds(0.5); i++) c.frame();
  c.bus.emit('ui:volumes', { master: 0.3, engine: 0.5 });
  let gains = probe.busGains();
  assert.ok(Math.abs(gains.master - 0.3) < 1e-6, `the master follows the settings during the count (${gains.master})`);
  assert.equal(gains.chanVol.engine, 0.5, 'and the engine channel');
  c.audio.mute(true);
  assert.equal(probe.busGains().master, 0, 'mute silences the count');
  c.audio.mute(false);
  gains = probe.busGains();
  assert.ok(Math.abs(gains.master - 0.3) < 1e-6, 'and unmuting restores the level');
  while (c.game.preBattleS > 0) c.frame();
  const battle2 = since(probe, second);
  assert.equal(count(battle2, `engine_${family.t72b3m_2022}_start`), 1, 'the next battle starts our engine once more');
  assert.equal(count(battle2, 'ui_countdown_tick'), 3, 'and ticks three times');
  assert.equal(count(battle2, 'ui_countdown_go'), 1, 'and rolls out on one horn');
  assert.deepEqual(c.run.rollouts, [false, false]);

  // ---------------------------------------------------------------- 3. a held count: PREPARING never ticks
  c.leaveBattle();
  c.enterBattle();
  c.audio.ambientOn(true);
  const held = mark(probe);
  c.run.warmPending = true;
  c.rollout.open(3);
  for (let i = 0; i < seconds(2); i++) c.frame();
  assert.equal(c.game.preBattleS, 3, 'the count holds at 3 while warm work is pending');
  assert.equal(count(since(probe, held), 'ui_countdown_tick'), 0, 'PREPARING never ticks');
  assert.ok(since(probe, held).includes(`engine_${family.t72b3m_2022}_start`), 'but the hull and the world are already heard');
  c.run.warmPending = false;
  while (c.game.preBattleS > 0) c.frame();
  assert.equal(count(since(probe, held), 'ui_countdown_tick'), 3, 'the released count ticks 3, 2, 1');
  c.leaveBattle();
}

// ------------------------------------------------------------------ 4. multiplayer: the network count rolls out
{
  installFetch();
  const c = compose({ network: true });
  c.audio.resume();
  await c.audio.warmBattleEvents(ROSTER);
  const probe = probeOf();
  await probe.libraryIdle();
  c.enterBattle(); // activation; the first snapshot not yet applied (Infinity)
  c.audio.ambientOn(true);
  for (let i = 0; i < 10; i++) c.frame();
  assert.deepEqual(c.run.rollouts, [], 'nothing rolls out before the first snapshot');
  const seq = mark(probe);
  c.game.preBattleS = 1.7; // joined during the authority's countdown phase, as snapshots carry it
  while (c.game.preBattleS > 0) { c.frame(); c.game.preBattleS = Math.max(0, c.game.preBattleS - FRAME_S); }
  for (let i = 0; i < seconds(0.5); i++) c.frame(); // playing: 0 from here on
  const names = since(probe, seq);
  assert.deepEqual(c.run.rollouts, [false], 'the count reaching 0 rolls the network battle out once');
  assert.equal(c.run.steps, 0, 'a network battle never steps the local simulation');
  assert.equal(count(names, 'ui_countdown_tick'), 2, `a count first seen at 1.7 s ticks what it shows, 2 and 1 (${names})`);
  assert.equal(count(names, 'ui_countdown_go'), 1, 'one horn');
  assert.ok(probe.sayLog.some((e) => e.id === 'battle_start'), 'the crew calls the start in a network battle too');
  assert.ok(probe.engineState().some((r) => r.id === 'me' && r.lod === 'own'), 'our hull is heard');

  // joined after the count (late join, rejoin, host migration): rolled out, no cues
  c.leaveBattle();
  c.enterBattle();
  c.audio.ambientOn(true);
  c.frame();
  const late = mark(probe);
  const saidBefore = probe.sayLog.filter((e) => e.id === 'battle_start').length;
  c.game.preBattleS = 0; // the first snapshot is already playing
  for (let i = 0; i < 10; i++) c.frame();
  assert.deepEqual(c.run.rollouts, [false, true], 'a battle first seen at 0 rolls out late');
  const lateNames = since(probe, late);
  for (const id of ['ui_countdown_go', 'ui_countdown_tick', 'sting_battle', 'hatch']) assert.equal(count(lateNames, id), 0, `no ${id} for a late join`);
  assert.equal(probe.sayLog.filter((e) => e.id === 'battle_start').length, saidBefore, 'and no start call');
  assert.ok(probe.soundLog.some((e) => e.type === 'battle:rollout' && e.late === true), 'the engine has rolled out (bells, team counts, quiet radio)');
  c.bus.emit('battle:rollout', {});
  assert.equal(count(since(probe, late), 'ui_countdown_go'), 0, 'a later edge in the same battle stays silent');
  c.leaveBattle();
}

// ------------------------------------------------------------------ 5. the decode order of a cold solo entry
{
  const fetches = installFetch((url) => url.includes('/audio/sfx/'));
  const c = compose();
  c.audio.resume();
  void c.audio.warmBattleEvents(ROSTER);
  for (let i = 0; i < 20; i++) await tick();
  c.enterBattle();
  c.audio.loadingOn(false);
  c.audio.ambientOn(true);
  c.rollout.open(3);
  for (let i = 0; i < 3; i++) c.frame();
  for (let guard = 0; guard < 5000 && fetches.held.length; guard++) { for (const file of fetches.held.splice(0)) file.release(); await tick(); }
  const sfx = fetches.order.filter((url) => url.includes('/audio/sfx/')).map(assetOf);
  const first = (id) => sfx.indexOf(id);
  const firstCombat = Math.min(...Object.values(WEAPON_CLOSE).map(first).filter((i) => i >= 0));
  // the presence set as the countdown hears it, named here apart from the engine: the roster's banks, the map's beds,
  // every running-gear loop, every loop a rig can start (scanned from vehicleRig.ts), the count's cues
  const rigSource = readFileSync(new URL('./vehicleRig.ts', import.meta.url), 'utf8');
  const rigLoops = [...new Set([...rigSource.matchAll(/'([a-z_]+_loop)'/g)].map((m) => m[1]))]
    .filter((id) => id !== 'fire_small_loop' && id !== 'net_rustle_loop'); // a burning hull, a netted one moving: not the count
  assert.ok(rigLoops.length >= 10, `the rig's loops are found (${rigLoops})`);
  const presence = [
    ...ROSTER.flatMap((id) => ['start', 'idle', 'low', 'mid', 'high', 'stop'].map((band) => `engine_${family[id]}_${band}`)),
    scene.bed, ...(scene.layer ? [scene.layer.asset] : []), ...(scene.war > 0 ? ['amb_distant_battle'] : []),
    ...['light', 'heavy'].flatMap((cls) => ['earth', 'hard'].flatMap((s) => ['slow', 'fast'].map((v) => `tracks_${cls}_${s}_${v}`))),
    ...rigLoops, 'ui_countdown_tick', 'ui_countdown_go', 'sting_battle', 'hatch',
  ];
  for (const id of presence) {
    assert.ok(SFX_ASSETS[id], `${id} ships`);
    const at = sfx.lastIndexOf(id);
    assert.ok(first(id) >= 0 && at < firstCombat, `${id} decodes before the combat banks (${at} vs ${firstCombat})`);
  }
  const files = presence.reduce((n, id) => n + SFX_ASSETS[id].n, 0);
  const lastPresence = Math.max(...presence.map((id) => sfx.lastIndexOf(id)));
  assert.ok(lastPresence < files + 40, `the presence set (${files} files) is decoded within the first ${files + 40} of ${sfx.length} (${lastPresence})`);
  console.log(`countdownAudio.selftest: cold solo entry decodes ${sfx.length} files; our idle ${first(`engine_${family.t72b3m_2022}_idle`)}, `
    + `start ${first(`engine_${family.t72b3m_2022}_start`)}, the bed ${first(scene.bed)}, slow tracks ${first('tracks_heavy_earth_slow')}, `
    + `the horn ${first('ui_countdown_go')}; the first combat bank ${firstCombat}`);
}

// ------------------------------------------------------------------ 6. the front lane: a sound wanted now jumps the bulk
{
  const fetches = installFetch(() => true);
  const ctx = createFakeContext({ decode: (bytes) => Object.assign(fakeBuffer(1), { name: assetOf(decoder.decode(bytes)) }) });
  const library = createAssetLibrary({ context: ctx, base: '/', fetchImpl: globalThis.fetch, createDecoder: () => ctx });
  await library.ready;
  const bulk = [...new Set(Object.values(WEAPON_CLOSE))].slice(0, 12);
  void library.load(bulk);
  for (let i = 0; i < 5; i++) await tick();
  const inFlight = fetches.order.length;
  assert.equal(inFlight, 6, 'six decode slots');
  assert.equal(library.pick('amb_field', () => 0), null, 'a loop asked for before it decodes is silent');
  void library.load(['hatch'], { front: true });
  const lastBulk = bulk.at(-1);
  assert.equal(library.pick(lastBulk, () => 0), null);
  for (let guard = 0; guard < 500 && fetches.held.length; guard++) { for (const file of fetches.held.splice(0)) file.release(); await tick(); }
  const after = fetches.order.slice(inFlight).map(assetOf);
  // the front lane: the queued bulk asset play asked for (moved up), then the loop asked for and the front load; then the bulk
  const wanted = new Set([lastBulk, 'amb_field', 'hatch']);
  const frontFiles = [...wanted].reduce((n, id) => n + SFX_ASSETS[id].n, 0);
  assert.ok(after.slice(0, frontFiles).every((id) => wanted.has(id)), `the asked-for sounds decode next (${after.slice(0, frontFiles + 2)})`);
  assert.ok(after.slice(frontFiles).every((id) => !wanted.has(id)), 'and the bulk follows, in its order');
  const rest = [...new Set(after.slice(frontFiles))];
  assert.deepEqual(rest, bulk.filter((id) => rest.includes(id)), 'the bulk keeps its queue order');
  assert.ok(library.has('amb_field') && library.has('hatch') && bulk.every((id) => library.has(id)), 'and everything still decodes');
}

// ------------------------------------------------------------------ 7. a cold start-up waits briefly for its recording
/** The warm has run and every load but our start-up's (its files held) has settled. */
async function settledButStart(fetches) {
  for (let i = 0; i < 2000; i++) {
    const probe = probeOf();
    if (probe?.library && fetches.held.length && probe.library().pending === 1) return probe;
    await tick();
  }
  throw new Error('the warm never settled');
}
{
  const startAsset = `engine_${family.t72b3m_2022}_start`;
  let holdStart = true;
  const fetches = installFetch((url) => holdStart && assetOf(url) === startAsset);
  const c = compose();
  c.audio.resume();
  void c.audio.warmBattleEvents(ROSTER);
  const probe = await settledButStart(fetches);
  assert.equal(probe.library().pending, 1, 'everything but our start-up decoded');
  c.enterBattle();
  c.audio.ambientOn(true);
  const seq = mark(probe);
  c.rollout.open(3);
  for (let i = 0; i < seconds(0.35); i++) c.frame();
  assert.equal(count(since(probe, seq), startAsset), 0, 'the start-up is still decoding');
  assert.equal(loopGain(c.ctx, `engine_${family.t72b3m_2022}_idle`), 0, 'and the bank waits for it');
  holdStart = false;
  for (const file of fetches.held.splice(0)) file.release();
  for (let i = 0; i < 10; i++) await tick();
  for (let i = 0; i < seconds(2); i++) c.frame();
  assert.equal(count(since(probe, seq), startAsset), 1, 'it fires once decoded, inside the wait');
  assert.ok(loopGain(c.ctx, `engine_${family.t72b3m_2022}_idle`) > 0.05, 'and the idle comes up under it');
  while (c.game.preBattleS > 0) c.frame();
  for (let i = 0; i < seconds(1); i++) c.frame();
  assert.equal(count(since(probe, seq), startAsset), 1, 'once a battle');
}
{
  // never decoded inside the wait: the bank comes up without it, and a late decode never fires a start mid-count
  const startAsset = `engine_${family.t72b3m_2022}_start`;
  const fetches = installFetch((url) => assetOf(url) === startAsset);
  const c = compose();
  c.audio.resume();
  void c.audio.warmBattleEvents(ROSTER);
  const probe = await settledButStart(fetches);
  c.enterBattle();
  c.audio.ambientOn(true);
  const seq = mark(probe);
  c.rollout.open(3);
  for (let i = 0; i < seconds(1.7); i++) c.frame(); // past the 1 s wait
  for (const file of fetches.held.splice(0)) file.release();
  for (let i = 0; i < 10; i++) await tick();
  for (let i = 0; i < seconds(1); i++) c.frame();
  assert.equal(count(since(probe, seq), startAsset), 0, 'a start-up decoded after the wait never fires');
  assert.ok(loopGain(c.ctx, `engine_${family.t72b3m_2022}_idle`) > 0.05, 'the idle came up without it');
}

// ------------------------------------------------------------------ 8. the loader keeps its bed to the reveal
{
  installFetch();
  const c = compose();
  c.audio.resume();
  await c.audio.warmBattleEvents(ROSTER);
  await probeOf().libraryIdle();
  c.audio.loadingOn(true); // the Battle click's loader
  const bed = () => c.ctx.started.filter((n) => n.kind === 'source' && n.buffer?.name === 'loading_bed_loop');
  assert.equal(bed().length, 1, 'the loader plays its bed');
  c.enterBattle(); // startBattle behind the loader
  assert.equal(bed()[0].stopped, null, 'the battle phase edge leaves the loader its bed');
  c.audio.loadingOn(false); // the reveal
  assert.notEqual(bed()[0].stopped, null, 'the reveal ends it');
}

// ------------------------------------------------------------------ 9. multiplayer: the crew counts sides by the roster
// A network seat is sent only the hulls its team spots (battlePresentation publishRoster: game.tanks holds the spotted and
// the destroyed). The network rollout turns the crew's side counts on, and counted off that list the first enemy spotted
// read as "last enemy" with four alive and hidden (verifier counterexample, 2026-10-14, on 28836db71). The count is the
// lobby roster with the authority's deaths (every seat is sent every destroyed hull), and only where a death is final.
/** A hull as battlePresentation presents it: every actor carries networkVisible; the viewer's side reads 'player'. */
function actor(id, specId, nation, options = {}) {
  return Object.assign(tank(id, specId, nation, options), { networkVisible: options.team !== 'enemy' });
}
/** One network battle's field: the viewer and three allies; five enemies on the authority, none spotted yet. */
function networkField() {
  const own = [actor('me', 't72b3m_2022', 'Russia', { isPlayer: true }), actor('a1', 'leo2a4', 'Germany', { x: 20 }),
    actor('a2', 'm1a1_abrams_hc', 'USA', { x: 40 }), actor('a3', 'leo2a4', 'Germany', { x: 60 })];
  const foes = [1, 2, 3, 4, 5].map((i) => actor(`e${i}`, 'm1a1_abrams_hc', 'USA', { x: -100 + 40 * i, z: 400, team: 'enemy' }));
  const spotted = [...own]; // game.tanks
  return {
    roster: [...own, ...foes], // game.rosterTanks: the lobby's hulls, each death as the authority sends it
    foes,
    spotted,
    spot(foe) { foe.networkVisible = true; spotted.push(foe); },
    // a destroyed hull is observable to every seat: its death reaches this one, spotted or not
    kill(foe, bus) {
      foe.combat.destroyed = true;
      foe.networkVisible = true;
      if (!spotted.includes(foe)) spotted.push(foe);
      bus.emit('tank:destroyed', { id: foe.id, killerId: 'a1', pos: [foe.state.pos.x, 0, foe.state.pos.z], cause: 'shot' });
    },
  };
}
/** main.ts's getTeamRoster (its source is asserted in 10): the roster where a death is final, else none. */
const mainTeamRoster = (net) => () => (net.rosterTanks && rulesets.deathsAreFinal(rulesets.matchRulesetFor(net.mode)) ? net.rosterTanks : null);
const TEAM_CALLS = ['last_enemy', 'last_tank', 'outnumbered'];
const teamCalls = (probe) => probe.sayLog.map((e) => e.id).filter((id) => TEAM_CALLS.includes(id));
/** A network battle through its count and 12 s of live play (the start call over, the net quiet), nothing spotted. */
async function networkBattle({ mode = 'standard', wireRoster = true } = {}) {
  installFetch();
  const field = networkField();
  const net = { rosterTanks: field.roster, mode };
  const c = compose({ network: true, list: field.spotted, mode, ...(wireRoster ? { getTeamRoster: mainTeamRoster(net) } : {}) });
  c.audio.resume();
  await c.audio.warmBattleEvents(ROSTER);
  const probe = probeOf();
  await probe.libraryIdle();
  c.enterBattle();
  c.audio.ambientOn(true);
  for (let i = 0; i < 5; i++) c.frame();
  c.game.preBattleS = 3; // the authority's countdown, as snapshots carry it
  while (c.game.preBattleS > 0) { c.frame(); c.game.preBattleS = Math.max(0, c.game.preBattleS - FRAME_S); }
  for (let i = 0; i < seconds(12); i++) c.frame();
  assert.deepEqual(c.run.rollouts, [false], 'the network count rolls out');
  return { c, field, probe };
}
{
  // Standard, wired as main.ts wires it: the first enemy spotted is not the last; the real last is called once
  const standard = await networkBattle();
  standard.field.spot(standard.field.foes[0]);
  for (let i = 0; i < seconds(4); i++) standard.c.frame();
  assert.deepEqual(teamCalls(standard.probe), [], `one enemy spotted, five alive: no side call (${standard.probe.sayLog.map((e) => e.id)})`);
  // the spotted enemy and three hidden ones fall; the fifth lives on out of sight
  for (const foe of standard.field.foes.slice(0, 4)) standard.field.kill(foe, standard.c.bus);
  for (let i = 0; i < seconds(3); i++) standard.c.frame();
  assert.deepEqual(teamCalls(standard.probe), ['last_enemy'], 'the last enemy, hidden and alive, is called once, from the deaths the authority sent');
  standard.c.leaveBattle();

  // a respawn mode: the roster cannot count a side (a return out of sight is never sent), so nothing is called
  const flags = await networkBattle({ mode: 'capture_the_flag' });
  flags.field.spot(flags.field.foes[0]);
  for (const foe of flags.field.foes.slice(1, 4)) flags.field.kill(foe, flags.c.bus);
  for (let i = 0; i < seconds(4); i++) flags.c.frame();
  assert.deepEqual(teamCalls(flags.probe), [], `where hulls return, a network seat calls no side count (${flags.probe.sayLog.map((e) => e.id)})`);
  flags.c.leaveBattle();

  // no roster wired at all: a spotted list is never counted (fails closed)
  const bare = await networkBattle({ wireRoster: false });
  bare.field.spot(bare.field.foes[0]);
  for (let i = 0; i < seconds(4); i++) bare.c.frame();
  for (const foe of bare.field.foes.slice(0, 4)) bare.field.kill(foe, bare.c.bus);
  for (let i = 0; i < seconds(3); i++) bare.c.frame();
  assert.deepEqual(teamCalls(bare.probe), [], 'a network list without a roster is never counted');
  bare.c.leaveBattle();

  // a death is final in a Standard battle; where hulls return (respawns, waves) no seat can count a side
  assert.equal(rulesets.deathsAreFinal(rulesets.matchRulesetFor('standard')), true);
  for (const mode of ['capture_the_flag', 'zone_control', 'endless_horde', 'frontline_assault', 'juggernaut', 'infected', 'gun_game', 'drone']) {
    assert.equal(rulesets.deathsAreFinal(rulesets.matchRulesetFor(mode)), false, `${mode}: a destroyed hull comes back`);
  }
}

// ------------------------------------------------------------------ 10. main.ts wires the frame owner's edges to the bus
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(main, /rollout: \(late = false\) => bus\.emit\('battle:rollout', late \? \{ late: true \} : \{\}\)/, 'main emits the rollout (late) edge');
  assert.match(main, /second: \(seconds: number\) => bus\.emit\('battle:countdown', \{ seconds \}\)/, 'main emits the count\'s whole seconds');
  // the crew's side counts: the network roster where a death is final (section 9 drives this getter), and the warm's
  // powertrains from each hull's whole spec (presenceFamilies.selftest.mjs)
  assert.match(main, /getTeamRoster: \(\) => \{\s*if \(!game\.rosterTanks\) return null;\s*const mode = normalizeGameMode\(game\.gameMode\);\s*return deathsAreFinal\(game\.ruleset\?\.mode === mode \? game\.ruleset : matchRulesetFor\(mode\)\) \? game\.rosterTanks : null;\s*\}/,
    'main counts a network battle\'s sides by its roster, where a death is final');
  assert.match(main, /getVehicleSpec: getSpec\b/, 'main hands the audio the fleet\'s specs');
  const composition = readFileSync(new URL('../mp/session/browserComposition.ts', import.meta.url), 'utf8');
  assert.match(composition, /load\.audio\.warmBattleEvents\?\.\(rosterSpecs\)/, 'a network round warms its roster\'s sounds while it loads');
}

console.log('countdownAudio.selftest: the hull, the other tanks and the world sound from the count, once; mute and volume apply; no weapon before the rollout; 3-2-1 ticks and one horn, solo and network; a late join rolls out silently; the presence set decodes first; asked-for sounds jump the bulk; the start-up waits for its recording; the loader keeps its bed; '
  + 'a network seat counts sides by the roster where a death is final, never by what it spots passed');
