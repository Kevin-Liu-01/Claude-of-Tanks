// shotCadence.selftest (release 272, fire-fx-debounce): a fast gun's presentation stays bounded, a slow gun's is as before.
// The cadence (game/shotCadence.ts) and the consumers that read it: the audio's report (audioEngine fireWeapon), the
// effects' muzzle flash and light (effects.ts muzzleFlash), the network seat's camera kick (combatFeedbackRuntime). Each
// consumer is driven twice on fresh, identically seeded instances: once with the round's simulation clock (the cadence)
// and once without it (no clock: the pre-272 path, which the code keeps for replays and probes). At 1,200 rounds a minute
// for 3 s the clocked run's voices, audio nodes, flashes, particles, light strikes and shake stay bounded; at a tank's
// 6-8 s reload the two runs are identical. First-party: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import {
  SHAKE_SUSTAIN_TRAUMA_PER_S, SHOT_CADENCE_WINDOW_S, SHOT_FLOOR_S, SHOT_SLOW_S, createShotCadence, shotShakeScale,
  sustainedGrainS,
} from './shotCadence.ts';
import { createBus } from './stateCore.ts';

const TICK = 1 / 60;
const BURST_S = 3;
/** The rounds of a gun firing every `everyTicks` 60 Hz ticks for `seconds`, each at its exact simulation time. */
function rounds(everyTicks, seconds, startS = 0) {
  const out = [];
  for (let tick = 0; tick * TICK < seconds - 1e-9; tick += everyTicks) out.push(startS + tick * TICK);
  return out;
}
const report = { seconds: BURST_S };
process.on('exit', (code) => { if (code !== 0) console.error(`shotCadence.selftest partial: ${JSON.stringify(report)}`); });

// ---------------------------------------------------------------- the cadence ---
{
  const channels = Object.keys(SHOT_CADENCE_WINDOW_S);
  assert.equal(SHOT_CADENCE_WINDOW_S.report, SHOT_FLOOR_S, 'the crack and the core flicker keep the floor (20 a second)');
  for (const channel of channels) {
    const w = SHOT_CADENCE_WINDOW_S[channel];
    assert.ok(w >= SHOT_FLOOR_S && w <= SHOT_SLOW_S && SHOT_SLOW_S < 0.5, `${channel}: its window sits between the floor and half a second (${w})`);
  }
  for (const channel of ['body', 'flash', 'shake', 'tail']) {
    const k = Math.round(SHOT_CADENCE_WINDOW_S[channel] / SHOT_FLOOR_S);
    assert.ok(k % 2 === 1 && Math.abs(k * SHOT_FLOOR_S - SHOT_CADENCE_WINDOW_S[channel]) < 1e-9,
      `${channel}: an odd number of floor rounds, so a twin gun's barrels take turns (${k})`);
  }

  // a tank at its 6 and 8 s reload, a 2 s autoloader's clip, and a gun just past the slowest window: every channel takes
  // every round, alone
  for (const reloadS of [6, 8, 2, SHOT_SLOW_S]) {
    const cadence = createShotCadence();
    for (const t of [0, reloadS, 2 * reloadS, 3 * reloadS, 4 * reloadS]) {
      for (const channel of channels) assert.equal(cadence.admit(channel, 't1', 'gun', t), 1, `${reloadS} s reload: ${channel} at ${t}`);
      assert.equal(sustainedGrainS(cadence.gapS), null, 'a slow gun rings in full');
      assert.equal(shotShakeScale(1, 0.27), 1, 'and kicks as it always did');
    }
  }

  // 1,200 rounds a minute (every third tick) for 3 s
  const fast = rounds(3, BURST_S);
  const taken = Object.fromEntries(channels.map((c) => [c, []]));
  {
    const cadence = createShotCadence();
    for (const t of fast) for (const channel of channels) {
      const n = cadence.admit(channel, 'gepard', '35mm', t);
      if (n > 0) taken[channel].push(n);
    }
    assert.equal(fast.length, 60, '60 rounds');
    assert.equal(taken.report.length, 60, 'every round at the floor cracks');
    assert.ok(taken.report.every((n) => n === 1));
    for (const channel of ['body', 'flash', 'shake']) {
      assert.equal(taken[channel].length, 20, `${channel}: one in three (${taken[channel].length})`);
      // the burst's last two rounds fold into a round that never comes (its burst ended): the 20 taken stand for 58
      assert.equal(taken[channel].reduce((a, b) => a + b, 0), 58, `${channel}: the taken rounds stand for all but the last two`);
    }
    assert.equal(taken.tail.length, 7, 'the echo once in nine rounds');
    assert.equal(taken.impact.length, 30, 'the strikes once a tenth');
    assert.equal(cadence.weapons, 1, 'one weapon, one track: nothing allocated per round');
    // the camera's trauma under the rig's decay (engine/cameraRig.ts TRAUMA_DECAY_PER_S, read from its source)
    const rigSource = readFileSync(new URL('../engine/cameraRig.ts', import.meta.url), 'utf8');
    const decay = Number(/const TRAUMA_DECAY_PER_S = ([\d.]+);/.exec(rigSource)?.[1]);
    assert.ok(decay > SHAKE_SUSTAIN_TRAUMA_PER_S, `the sustained trauma (${SHAKE_SUSTAIN_TRAUMA_PER_S}/s) sits under the rig's decay (${decay}/s)`);
    for (const caliberMm of [30, 35, 57]) {
      const perRound = 0.10 + Math.max(0, Math.min(1, (caliberMm - 30) / 122)) * 0.20;
      const integrate = (kicks) => {
        let trauma = 0, most = 0, last = 0;
        for (const [t, amount] of kicks) { trauma = Math.max(0, trauma - decay * (t - last)); last = t; trauma = Math.min(1, trauma + amount); most = Math.max(most, trauma); }
        return most;
      };
      const before = integrate(fast.map((t) => [t, perRound]));
      const shake = createShotCadence();
      const after = integrate(fast.flatMap((t) => { const n = shake.admit('shake', 'me', caliberMm, t); return n > 0 ? [[t, perRound * shotShakeScale(n, perRound)]] : []; }));
      assert.equal(before, 1, `${caliberMm} mm: one kick a round ratchets the camera to its full shake`);
      assert.ok(after < 0.45, `${caliberMm} mm: the cadence holds it at ${after.toFixed(2)}`);
      report[`trauma_${caliberMm}mm`] = { before: +before.toFixed(3), after: +after.toFixed(3) };
    }
  }
  // the M163's Vulcan at one round a tick (the rotary floor of item/m163-rotary-270): its in-between rounds fold, as
  // sim/fireCycleFloor.ts createRotaryShotThinning keeps them (every third round in full)
  {
    const cadence = createShotCadence();
    const vulcan = rounds(1, BURST_S);
    const cracks = vulcan.filter((t) => cadence.admit('report', 'm163', 'vulcan', t) > 0);
    assert.equal(vulcan.length, 180);
    assert.equal(cracks.length, 60, 'one crack in three at one round a tick: the floor\'s density');
    assert.deepEqual(cracks, vulcan.filter((_, i) => i % 3 === 0), 'exactly the rounds the M163 lane\'s thinning keeps');
    const full = vulcan.filter((t) => cadence.admit('flash', 'm163', 'vulcan', t) > 0);
    assert.equal(full.length, 20, 'one full flash in nine');
    assert.ok(Math.abs(shotShakeScale(9, 0.1) - SHAKE_SUSTAIN_TRAUMA_PER_S * SHOT_CADENCE_WINDOW_S.shake / 0.1) < 1e-12,
      'nine rounds in a kick: capped by the sustained trauma');
  }
  // a burst's folded tail never rides the next burst's first round; a clock that runs back starts over; weapons apart
  {
    const cadence = createShotCadence();
    assert.equal(cadence.admit('shake', 'a', 'gun', 0), 1);
    assert.equal(cadence.admit('shake', 'a', 'gun', 0.05), 0);
    assert.equal(cadence.admit('shake', 'a', 'gun', 0.1), 0);
    assert.equal(cadence.admit('shake', 'a', 'gun', 5), 1, 'a new burst opens alone');
    assert.equal(cadence.admit('shake', 'a', 'gun', 5.05), 0);
    assert.equal(cadence.admit('shake', 'a', 'gun', 1), 1, 'a new battle\'s clock starts over');
    assert.equal(cadence.gapS, Infinity);
    assert.equal(cadence.admit('shake', 'a', 'coax', 1.01), 1, 'the coax is its own weapon');
    assert.equal(cadence.admit('shake', 'b', 'gun', 1.01), 1, 'another tank is its own');
    assert.equal(cadence.admit('shake', 'a', 'gun', Number.NaN), 1, 'a round with no clock passes');
    assert.equal(cadence.weapons, 3);
    cadence.clear();
    assert.equal(cadence.weapons, 0);
  }
}

// -------------------------------------------------------------------- audio ---
const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^\//, '');
  try {
    const bytes = await readFile(new URL(path, publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = globalThis.window ?? {};
const { createFakeContext, fakeBuffer } = await import('../audio/fakeAudioContext.test-support.mjs');
const { createAudio } = await import('../audio/audioEngine.ts');
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
function audioTank(id, x, z, team, isPlayer = false) {
  return {
    id, team, isPlayer, specId: 'bmp2',
    spec: { id: 'bmp2', nation: 'USSR', role: 'ifv', weightTons: 14, enginePowerHp: 300, topSpeedKmh: 65, reverseSpeedKmh: 10, gun: { caliberMm: 30, shells: [{ type: 'APFSDS' }] } },
    state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [500], ammoCapacity: [500], shellSlot: 0 },
  };
}
/**
 * One fresh audio engine (same seed every time), a listener in our hull, a foe 60 m off; then the events, each emitted on
 * the tick of its time `t`. Returns what the mix did over them.
 */
async function runAudioEvents(events) {
  const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
  const audio = createAudio({ context: ctx, getMapId: () => 'urban', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = globalThis.window.__COT_AUDIO;
  const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
  const tanks = [audioTank('me', 0, 0, 'player', true), audioTank('foe', -20, 57, 'enemy')];
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['bmp2']);
  for (let i = 0; i < 10; i++) { ctx.advance(TICK); audio.update(TICK, listener, tanks); }
  await probe.libraryIdle();
  for (let i = 0; i < 120; i++) { ctx.advance(TICK); audio.update(TICK, listener, tanks); }
  const idle = probe.activeVoices();
  const startsBefore = ctx.started.length, nodesBefore = ctx.nodes.length;
  const seqBefore = probe.sfxLog.at(-1)?.seq ?? 0;
  const t0 = ctx.currentTime;
  let most = 0;
  const endS = events.at(-1).t + 1;
  for (let tick = 0, s = 0; tick * TICK <= endS; tick++) {
    const now = tick * TICK;
    while (s < events.length && events[s].t <= now + 1e-9) { const event = events[s++]; bus.emit(event.type, event.payload); }
    ctx.advance(TICK);
    audio.update(TICK, listener, tanks);
    most = Math.max(most, probe.activeVoices());
  }
  const log = probe.sfxLog.filter((e) => e.seq > seqBefore).map((e) => ({ n: e.n, t: +(e.t - t0).toFixed(6), g: e.g, r: e.r, d: e.d, b: e.b }));
  return { starts: ctx.started.length - startsBefore, nodes: ctx.nodes.length - nodesBefore, mostVoices: most - idle, idleVoices: idle, log };
}
/** The shots, each at its own simulation time (`clocked`) or with none (the pre-272 path). */
function runAudio(shots, clocked) {
  return runAudioEvents(shots.map((shot, i) => ({ t: shot.t, type: 'shell:fired', payload: { shellId: i + 1, shooterId: shot.shooterId,
    isPlayer: shot.shooterId === 'me', muzzlePos: shot.muzzlePos, dir: shot.dir, caliberMm: shot.caliberMm, shellType: 'APFSDS',
    weaponSound: shot.weaponSound, velocityMps: 1000, ...(clocked ? { timeS: shot.t } : {}) } })));
}
const foeShot = (t, caliberMm = 30, weaponSound = '2a42') => ({ t, shooterId: 'foe', muzzlePos: [-20, 2.5, 57], dir: [0.33, 0, -0.94], caliberMm, weaponSound });
const ownShot = (t, caliberMm = 30, weaponSound = '2a42') => ({ t, shooterId: 'me', muzzlePos: [0, 2.5, 3], dir: [0, 0, 1], caliberMm, weaponSound });
{
  // slow fire: a 120 mm and a 125 mm at their 6 and 8 s reloads, and our own 30 mm single shots: identical, voice for voice
  const slow = [
    ...[0, 6, 12, 18].map((t) => foeShot(t, 120, undefined)),
    ...[1, 9, 17].map((t) => ownShot(t, 125, undefined)),
    ...[2.5, 4.5, 7.5].map((t) => ownShot(t)),
  ].sort((a, b) => a.t - b.t);
  const before = await runAudio(slow, false);
  const after = await runAudio(slow, true);
  assert.ok(before.log.length > 20, `the slow shots were heard (${before.log.length} voices)`);
  assert.deepEqual(after.log, before.log, 'a slow gun is heard exactly as before: every voice, its time, gain, rate and bus');
  assert.equal(after.nodes, before.nodes, 'and builds the same audio graph');
  report.audioSlow = { voices: after.log.length, identical: true };

  // fast fire: our own and a foe's 30 mm at 1,200 rounds a minute for 3 s
  for (const [who, make] of [['foe', foeShot], ['own', ownShot]]) {
    const burst = rounds(3, BURST_S).map((t) => make(t));
    const b = await runAudio(burst, false);
    const a = await runAudio(burst, true);
    report[`audio_${who}_1200rpm`] = {
      before: { voiceStarts: b.starts, audioNodes: b.nodes, gunVoicesMost: b.mostVoices, idleVoices: b.idleVoices },
      after: { voiceStarts: a.starts, audioNodes: a.nodes, gunVoicesMost: a.mostVoices, idleVoices: a.idleVoices },
    };
    assert.ok(a.starts <= b.starts * 0.75, `${who}: fewer voices started (${b.starts} -> ${a.starts})`);
    assert.ok(a.nodes <= b.nodes * 0.75, `${who}: fewer audio nodes built (${b.nodes} -> ${a.nodes})`);
    // (the crack's grains, the punch, the echoes and the rounds' flybys, which the saturated pool used to cull)
    assert.ok(a.mostVoices <= 24 && a.mostVoices < b.mostVoices, `${who}: the gun holds at most ${a.mostVoices} voices over the idle mix (was ${b.mostVoices})`);
    // every round still cracks: one close (or own) report per round at the floor
    const cracks = a.log.filter((e) => /^ac_30_(close|own)$/.test(e.n)).length;
    const cracksBefore = b.log.filter((e) => /^ac_30_(close|own)$/.test(e.n)).length;
    assert.ok(cracks > 0 && cracks >= cracksBefore * 0.9 - 2, `${who}: the burst keeps its rounds' cracks (${cracksBefore} -> ${cracks}; the log keeps 256)`);
  }
  // the Vulcan at one round a tick (the M163 lane's rotary floor): two of three rounds silent, as its thinning had them
  {
    const vulcan = rounds(1, BURST_S).map((t) => foeShot(t, 20, 'rh202'));
    const b = await runAudio(vulcan, false);
    const a = await runAudio(vulcan, true);
    report.audio_vulcan_3600rpm = { before: { voiceStarts: b.starts, gunVoicesMost: b.mostVoices }, after: { voiceStarts: a.starts, gunVoicesMost: a.mostVoices } };
    assert.ok(a.starts <= b.starts * 0.5, `the Vulcan starts a fraction of the voices (${b.starts} -> ${a.starts})`);
  }
}

// --------------------------------------------- audio: the audit's other bursts ---
{
  // a fast gun's rounds on the ground: with their shooter (the cadence's key) or without (the pre-272 path)
  const ground = (withShooter, caliberMm, every, seconds) => rounds(every, seconds).map((t, i) => ({ t, type: 'shell:expired', payload: {
    shellId: 500 + i, ...(withShooter ? { shooterId: 'foe' } : {}), pos: [-12 + (i % 7), 0, 30 + (i % 5)], hitTerrain: true, hitKind: 'terrain',
    surfaceKind: 'terrain', caliberMm, shellType: caliberMm < 60 ? 'HE' : 'APFSDS' } }));
  const b = await runAudioEvents(ground(false, 30, 3, BURST_S));
  const a = await runAudioEvents(ground(true, 30, 3, BURST_S));
  report.audio_ground_30mm_1200rpm = { before: { voiceStarts: b.starts, voicesMost: b.mostVoices }, after: { voiceStarts: a.starts, voicesMost: a.mostVoices } };
  assert.ok(a.starts > 0 && a.starts <= b.starts * 0.65, `a burst's ground strikes start fewer voices (${b.starts} -> ${a.starts})`);
  const slowB = await runAudioEvents(ground(false, 120, 360, 13));
  const slowA = await runAudioEvents(ground(true, 120, 360, 13));
  assert.deepEqual(slowA.log, slowB.log, 'a main gun\'s rounds land exactly as before');
  // an airstrike's strafe, credited to its caller, lands in full (its rounds named by mode:strike_round first)
  const strafe = (withShooter) => ground(withShooter, 30, 2, 1.5).flatMap((event) => [
    { t: event.t, type: 'mode:strike_round', payload: { kind: 'strafe', strikeId: 7, shellId: event.payload.shellId, x: -12, y: 40, z: 30 } },
    event]);
  const strafeB = await runAudioEvents(strafe(false));
  const strafeA = await runAudioEvents(strafe(true));
  assert.deepEqual(strafeA.log, strafeB.log, 'an airstrike\'s strafe lands exactly as before');
  report.audio_strafe = { identical: true, voices: strafeA.log.length };

  // a trigger held on an empty gun raises ammo:empty every tick: one dry click a press
  const empty = [...rounds(1, 0.5).map((t) => ({ t, type: 'ammo:empty', payload: { id: 'me', slot: 0 } })),
    ...rounds(1, 0.3, 1.5).map((t) => ({ t, type: 'ammo:empty', payload: { id: 'me', slot: 0 } }))];
  const dry = (await runAudioEvents(empty)).log.filter((e) => e.n === 'dry_fire').length;
  assert.equal(dry, 2, `two presses, two clicks (${dry})`);

  // one prop break reported twice in a frame (the world's prop:destroyed, the step's prop:crushed): its layers once
  const breakOf = (twice) => [
    { t: 0.5, type: 'prop:destroyed', payload: { kind: 'windpump', pos: [-10, 0, 20], h: 8 } },
    ...(twice ? [{ t: 0.5, type: 'prop:crushed', payload: { kind: 'windpump', pos: [-10, 0, 20], h: 8 } }] : []),
    { t: 3, type: 'prop:destroyed', payload: { kind: 'windpump', pos: [10, 0, 25], h: 8 } }];
  const once = (await runAudioEvents(breakOf(false))).log.map((e) => e.n);
  const doubled = (await runAudioEvents(breakOf(true))).log.map((e) => e.n);
  assert.ok(once.includes('debris_metal'), `the wind pump's break carries its metal debris (${once})`);
  assert.deepEqual(doubled, once, 'a break reported twice plays once');
}

// ------------------------------------------------------------------ effects ---
{
  const { createFx } = await import('../fx/effects.ts');
  const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
  try {
    /** One fresh effects runtime (seed 91), a camera 30 m off the gun, then the shots; per-pool emits counted by slot. */
    /** The shots as `shell:fired` (with the round's clock or without), or any events as given ({ t, type, payload }). */
    const runFx = (shots, clocked, events = null) => {
      const timeline = events ?? shots.map((shot, i) => ({ t: shot.t, type: 'shell:fired', payload: { shellId: i + 1, shooterId: 'aa',
        shellType: 'HE', caliberMm: shot.caliberMm, weaponSound: shot.weaponSound, muzzlePos: [0, 2.5, 5], dir: [0, 0.6, 0.8],
        muzzleIndex: shot.muzzleIndex ?? 0, ...(clocked ? { timeS: shot.t } : {}) } }));
      const handlers = new Map();
      const bus = { on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, emit(type, payload) { handlers.get(type)?.(payload); } };
      const scene = new THREE.Scene();
      const fx = createFx({ anisotropy: 1, scene }, { getHeightAt: () => 0 }, { seed: 91 });
      fx.bindBus(bus);
      scene.add(fx.group);
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(-25, 6, -12); camera.lookAt(0, 2, 4); camera.updateMatrixWorld();
      const shooter = { visual: {}, state: { pos: new THREE.Vector3(), yaw: 0, speed: 0, yawRate: 0, verticalSpeed: 0 } };
      const resolve = (id) => (id === 'aa' ? shooter : null);
      const pools = new Map();
      let pointLights = 0, light = null;
      fx.group.traverse((o) => {
        // every pooled emitter: the particle pools, and the media layer's volumes and chunks (a ground strike's dust and clods)
        if (o.geometry?.attributes?.aPB) pools.set(o.name?.startsWith('particles:') ? o.name.slice(10) : o.name, o.geometry.attributes.aPB);
        if (o.isPointLight) pointLights++;
        if (o.name === 'fx:muzzleLight') light = o;
      });
      const emitted = Object.fromEntries([...pools.keys()].map((k) => [k, 0]));
      const snapshot = new Map([...pools].map(([k, a]) => [k, Float32Array.from(a.array)]));
      const count = () => {
        for (const [k, a] of pools) {
          const prev = snapshot.get(k), cur = a.array, stride = a.itemSize || 4;
          for (let i = 0; i < cur.length; i += stride) {
            for (let j = 0; j < stride; j++) if (cur[i + j] !== prev[i + j]) { emitted[k]++; break; }
          }
          prev.set(cur);
        }
      };
      fx.update(TICK, [], camera, resolve);
      count();
      for (const k of Object.keys(emitted)) emitted[k] = 0;
      const lightSamples = [];
      const endS = timeline.at(-1).t;
      for (let tick = 0, s = 0; tick * TICK <= endS + 1e-9; tick++) {
        while (s < timeline.length && timeline[s].t <= tick * TICK + 1e-9) { const event = timeline[s++]; bus.emit(event.type, event.payload); }
        fx.update(TICK, [], camera, resolve);
        count();
        lightSamples.push(light.intensity);
      }
      const lit = lightSamples.filter((v) => v > 0);
      return { emitted, total: Object.values(emitted).reduce((a, b) => a + b, 0), pointLights,
        light: { mean: lit.reduce((a, b) => a + b, 0) / Math.max(1, lightSamples.length), dark: lightSamples.length - lit.length, frames: lightSamples.length } };
    };
    // slow: a 125 mm at its 6 and 8 s reload: the same particles in every pool, the same light
    const slow = [0, 6, 14].map((t) => ({ t, caliberMm: 125, weaponSound: undefined }));
    const before = runFx(slow, false);
    const after = runFx(slow, true);
    assert.ok(before.total > 100, `the 125 mm flashes (${before.total} particles)`);
    assert.deepEqual(after.emitted, before.emitted, 'a slow gun flashes exactly as before, pool by pool');
    assert.deepEqual(after.light, before.light, 'and lights its muzzle exactly as before');
    report.fxSlow = { particles: after.total, identical: true };
    // fast: a 35 mm twin at 1,200 rounds a minute (barrels in turn) for 3 s
    const burst = rounds(3, BURST_S).map((t, i) => ({ t, caliberMm: 35, weaponSound: '35mm', muzzleIndex: i % 2 }));
    const b = runFx(burst, false);
    const a = runFx(burst, true);
    report.fx_twin35_1200rpm = { before: { particles: b.total, byPool: b.emitted, light: b.light }, after: { particles: a.total, byPool: a.emitted, light: a.light },
      pointLights: a.pointLights };
    assert.equal(a.pointLights, b.pointLights, 'the same pooled lights (no light is ever made per round)');
    assert.ok(a.total <= b.total * 0.45, `the burst emits under half the particles (${b.total} -> ${a.total})`);
    // the muzzle's smoke: the propellant pool on the phone tier, the media layer's volumes on the others
    const smoke = (r) => (r.emitted.psmoke ?? 0) + (r.emitted['fx-volume-media'] ?? 0);
    assert.ok(smoke(b) > 0 && smoke(a) <= smoke(b) / 2.5, `its muzzle smoke stays inside its pool (${smoke(b)} -> ${smoke(a)})`);
    assert.ok((a.emitted.flash ?? 0) > 0 && (a.emitted.flash ?? 0) >= (b.emitted.flash ?? 0) / 3, `every round still flickers at its barrel (${b.emitted.flash} -> ${a.emitted.flash})`);
    assert.equal(a.light.dark, 0, 'the held light never goes dark mid-burst');
    assert.ok(a.light.mean <= b.light.mean * 1.6, `nor floods the hull (${b.light.mean.toFixed(1)} -> ${a.light.mean.toFixed(1)} mean)`);

    // the audit's strikes: a fast gun's rounds on one hull by one shooter (the cadence keys on the target and the attacker),
    // and on the ground by one shooter; without the key, the pre-272 path
    const hullHits = (keyed, caliberMm, every, seconds) => rounds(every, seconds).map((t, i) => ({ t, type: 'shell:hit', payload: {
      shellId: 900 + i, kind: 'nonpen', caliberMm, shellType: caliberMm < 60 ? 'AP' : 'APFSDS', pos: [2, 1.5, 30], normal: [0, 0, -1],
      attackerId: 'aa', ...(keyed ? { targetId: 'tgt', timeS: t } : {}) } }));
    const hb = runFx(null, false, hullHits(false, 30, 3, BURST_S));
    const ha = runFx(null, false, hullHits(true, 30, 3, BURST_S));
    report.fx_hull_strikes_30mm_1200rpm = { before: { particles: hb.total }, after: { particles: ha.total } };
    assert.ok(ha.total > 0 && ha.total <= hb.total * 0.6, `a burst's strikes on one hull draw fewer particles (${hb.total} -> ${ha.total})`);
    assert.deepEqual(runFx(null, false, hullHits(true, 120, 360, 13)).emitted, runFx(null, false, hullHits(false, 120, 360, 13)).emitted,
      'a main gun\'s hits strike exactly as before');
    const groundHits = (keyed, every, seconds, strike = false) => rounds(every, seconds).flatMap((t, i) => [
      ...(strike ? [{ t, type: 'shell:fired', payload: { shellId: 700 + i, shooterId: null, shellType: 'AP', caliberMm: 30, airStrike: 'strafe',
        muzzlePos: [0, 60, -200], dir: [0, -0.3, 0.95] } }] : []),
      { t, type: 'shell:expired', payload: { shellId: 700 + i, ...(keyed ? { shooterId: 'aa' } : {}), pos: [-6 + (i % 7), 0, 40 + (i % 5)],
        hitTerrain: true, hitKind: 'terrain', surfaceKind: 'terrain', caliberMm: 30, shellType: 'AP' } }]);
    const gb = runFx(null, false, groundHits(false, 3, BURST_S));
    const ga = runFx(null, false, groundHits(true, 3, BURST_S));
    report.fx_ground_strikes_30mm_1200rpm = { before: { particles: gb.total }, after: { particles: ga.total } };
    assert.ok(ga.total > 0 && ga.total <= gb.total * 0.75, `a burst's ground strikes draw fewer particles (${gb.total} -> ${ga.total})`);
    assert.deepEqual(runFx(null, false, groundHits(true, 2, 1.5, true)).emitted, runFx(null, false, groundHits(false, 2, 1.5, true)).emitted,
      'an airstrike\'s strafe, credited to its caller, lands exactly as before');
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
  }
}

// ------------------------------------------------------- network camera kick ---
{
  const { createCombatFeedbackRuntime } = await import('./combatFeedbackRuntime.ts');
  const run = (shots, clocked) => {
    const bus = createBus();
    const kicks = [];
    const player = { id: 'me', spec: { gun: { caliberMm: 30, shells: [{ name: '3UBR8', type: 'APFSDS', caliberMm: 30 }] } } };
    const runtime = createCombatFeedbackRuntime({
      bus, game: { player, tankById: new Map([['me', player]]) },
      rig: { addTrauma: (amount) => kicks.push(amount), recoilKick: () => {} },
      getFx: () => null, hasNetworkMatch: () => true, shotRecoilScale: () => 1,
      setDestroyedEventSink: () => {}, trimGarageTanks: () => {}, getDeviceTier: () => 'desktop',
    });
    for (const t of shots) bus.emit('shell:fired', { isPlayer: true, shooterId: 'me', shellName: '3UBR8', shellType: 'APFSDS', caliberMm: 30, weaponSound: '2a42', ...(clocked ? { timeS: t } : {}) });
    runtime.dispose();
    return kicks;
  };
  const slow = [0, 6.5, 13];
  assert.deepEqual(run(slow, true), run(slow, false), 'a slow gun kicks the camera exactly as before');
  const burst = rounds(3, BURST_S);
  const b = run(burst, false), a = run(burst, true);
  assert.equal(b.length, 60);
  assert.equal(a.length, 20, 'one kick a shake window');
  assert.ok(a.reduce((x, y) => x + y, 0) < b.reduce((x, y) => x + y, 0) * 0.65, 'carrying less trauma than one a round');
  report.camera_30mm_1200rpm = { before: { kicks: b.length }, after: { kicks: a.length } };
}

// ------------------------------------------------------ camera shake from hits ---
{
  const { createCombatFeedbackRuntime } = await import('./combatFeedbackRuntime.ts');
  const run = (hits) => {
    const bus = createBus();
    const kicks = [];
    const player = { id: 'me', spec: { gun: { caliberMm: 120, shells: [] } } };
    const runtime = createCombatFeedbackRuntime({
      bus, game: { player, tankById: new Map([['me', player]]) },
      rig: { addTrauma: (amount) => kicks.push(amount), recoilKick: () => {} },
      getFx: () => null, hasNetworkMatch: () => false, shotRecoilScale: () => 1,
      setDestroyedEventSink: () => {}, trimGarageTanks: () => {}, getDeviceTier: () => 'desktop',
    });
    for (const hit of hits) bus.emit('shell:hit', hit);
    runtime.dispose();
    return kicks;
  };
  const hail = (caliberMm, every, seconds) => rounds(every, seconds).map((t) => ({ targetId: 'me', attackerId: 'aa', kind: 'pen', damage: 40,
    caliberMm, shellType: caliberMm < 60 ? 'AP' : 'APFSDS', timeS: t }));
  const slow = hail(120, 400, 20);
  assert.deepEqual(run(slow), slow.map((h) => Math.min(0.62, 0.24 + h.damage / 2400 + h.caliberMm / 1200)), 'a main gun\'s hits shake exactly as before');
  const burst = hail(30, 3, BURST_S);
  const kicks = run(burst);
  const rigSource = readFileSync(new URL('../engine/cameraRig.ts', import.meta.url), 'utf8');
  const decay = Number(/const TRAUMA_DECAY_PER_S = ([\d.]+);/.exec(rigSource)?.[1]);
  const peak = (amounts, times) => { let trauma = 0, most = 0, last = 0;
    amounts.forEach((amount, i) => { trauma = Math.max(0, trauma - decay * (times[i] - last)); last = times[i]; trauma = Math.min(1, trauma + amount); most = Math.max(most, trauma); });
    return most; };
  const perHit = Math.min(0.62, 0.24 + 40 / 2400 + 30 / 1200);
  const before = peak(burst.map(() => perHit), burst.map((h) => h.timeS));
  const kickTimes = burst.map((h) => h.timeS).filter((_, i) => i % 3 === 0);
  const after = peak(kicks, kickTimes);
  assert.equal(kicks.length, 20, 'a 30 mm hail shakes once a shake window');
  assert.equal(before, 1, 'one shake a hit pinned the camera at its full shake');
  assert.ok(after < 0.6, `the hail holds it at ${after.toFixed(2)}`);
  report.camera_hit_hail_30mm = { before: { shakes: burst.length, peakTrauma: before }, after: { shakes: kicks.length, peakTrauma: +after.toFixed(3) } };
}

console.log(`shotCadence.selftest: ${JSON.stringify(report)}`);
