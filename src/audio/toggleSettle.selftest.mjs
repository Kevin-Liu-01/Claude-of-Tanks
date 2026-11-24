// toggleSettle.selftest (276, gun-audio): a state toggle's sound settles on its final state (toggleSettle.ts). Pure: a
// toggle sounds once, SETTLE_S after its last change, with the state it ends on, and not at all when it ends where it
// started. Through the engine (audioEngine.ts settleToggle): rapid scope in/out/in plays one scope_in, in/out plays
// nothing, and the same edges spaced past the settle play each (the negative controls); auto-aim, the lights and the tank
// sight's zoom steps settle the same way. First-party: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TOGGLE_SETTLE_S, createToggleSettle } from './toggleSettle.ts';
import { createBus } from '../game/stateCore.ts';

const report = {};
process.on('exit', (code) => { if (code !== 0) console.error(`toggleSettle.selftest partial: ${JSON.stringify(report)}`); });

// ------------------------------------------------------------------- pure ---
{
  assert.ok(TOGGLE_SETTLE_S >= 0.1 && TOGGLE_SETTLE_S <= 0.15, 'about 120 ms');
  const s = createToggleSettle();
  s.change('scope', false, true, 0);
  assert.deepEqual(s.due(0.1), [], 'not before it settles');
  assert.deepEqual(s.due(0.12), [{ id: 'scope', state: true, from: false }], 'once it has held 120 ms');
  assert.deepEqual(s.due(1), [], 'and once');
  // in, out, in inside 0.2 s: one scope_in, from the last change
  s.change('scope', false, true, 1); s.change('scope', true, false, 1.05); s.change('scope', false, true, 1.1);
  assert.deepEqual(s.due(1.2), [], 'the last change restarts the wait');
  assert.deepEqual(s.due(1.22), [{ id: 'scope', state: true, from: false }]);
  // in, out: back where it started, nothing
  s.change('scope', false, true, 2); s.change('scope', true, false, 2.05);
  assert.deepEqual(s.due(3), [], 'a toggle that ends where it started is silent');
  assert.equal(s.pending, 0);
  // a no-change edge is no toggle; toggles apart; a cancel forgets
  s.change('lights', 1, 1, 4);
  assert.equal(s.pending, 0);
  s.change('lights', 0, 1, 4); s.change('zoom', 4, 8, 4); s.change('zoom', 8, 12, 4.05);
  s.cancel('zoom');
  assert.deepEqual(s.due(5), [{ id: 'lights', state: 1, from: 0 }]);
  s.change('a', 0, 1, 6); s.change('b', 0, 1, 6); s.cancel();
  assert.deepEqual(s.due(7), []);
}

// ------------------------------------------------------------------ engine ---
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
const { createFakeContext, fakeBuffer } = await import('./fakeAudioContext.test-support.mjs');
const { createAudio } = await import('./audioEngine.ts');
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
const TICK = 1 / 60;
const TOGGLE_IDS = new Set(['scope_in', 'scope_out', 'zoom_step', 'lock_on', 'lock_off', 'lights_on', 'switch_toggle']);

/**
 * One fresh engine in battle, our tank with its lights at `lights`; then `steps` ({ t, scoped?, zoom?, lights?, aim? }),
 * each applied on its tick, the frames running 1 s past the last. Returns the toggle sounds started, with their times.
 */
async function run(steps) {
  const ctx = createFakeContext({ decode: () => fakeBuffer(0.8) });
  const audio = createAudio({ context: ctx, getMapId: () => 'urban', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = globalThis.window.__COT_AUDIO;
  const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false, zoom: 1 };
  const me = {
    id: 'me', team: 'player', isPlayer: true, specId: 'bmp2',
    spec: { id: 'bmp2', nation: 'USSR', role: 'ifv', weightTons: 14, enginePowerHp: 300, topSpeedKmh: 65, reverseSpeedKmh: 10, gun: { caliberMm: 30, shells: [{ type: 'APFSDS' }] } },
    state: { pos: { x: 0, y: 0, z: 0 }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [50], ammoCapacity: [50], shellSlot: 0, auxiliary: { gunOn: false, lights: 0 } },
  };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['bmp2']);
  for (let i = 0; i < 10; i++) { ctx.advance(TICK); audio.update(TICK, listener, [me]); }
  await probe.libraryIdle();
  for (let i = 0; i < 60; i++) { ctx.advance(TICK); audio.update(TICK, listener, [me]); }
  const seqBefore = probe.sfxLog.at(-1)?.seq ?? 0;
  const t0 = ctx.currentTime;
  const endS = (steps.at(-1)?.t ?? 0) + 1;
  for (let tick = 0, s = 0; tick * TICK <= endS; tick++) {
    while (s < steps.length && steps[s].t <= tick * TICK + 1e-9) {
      const step = steps[s++];
      if (step.scoped != null) listener.scoped = step.scoped;
      if (step.zoom != null) listener.zoom = step.zoom;
      if (step.lights != null) me.combat.auxiliary = { ...me.combat.auxiliary, lights: step.lights };
      if (step.aim !== undefined) bus.emit('ui:autoAimState', step.aim ? { on: true, targetId: step.aim, reason: '' } : { on: false, targetId: null, reason: 'AUTO-AIM OFF' });
    }
    ctx.advance(TICK);
    audio.update(TICK, listener, [me]);
  }
  return probe.sfxLog.filter((e) => e.seq > seqBefore && TOGGLE_IDS.has(e.n)).map((e) => ({ n: e.n, t: +(e.t - t0).toFixed(3) }));
}
const names = (log) => log.map((e) => e.n);

// the scope: rapid in/out/in plays one scope_in; in/out plays nothing
{
  const inOutIn = await run([{ t: 0, scoped: true }, { t: 0.05, scoped: false }, { t: 0.1, scoped: true }]);
  assert.deepEqual(names(inOutIn), ['scope_in'], `rapid in/out/in: one scope_in (${JSON.stringify(inOutIn)})`);
  assert.ok(inOutIn[0].t >= 0.1 + TOGGLE_SETTLE_S - 1e-6 && inOutIn[0].t <= 0.1 + TOGGLE_SETTLE_S + 2 * TICK + 0.01, `it sounds once the state has settled (${inOutIn[0].t} s)`);
  // negative control: the same three edges spaced past the settle are three sounds
  const spaced = await run([{ t: 0, scoped: true }, { t: 0.3, scoped: false }, { t: 0.6, scoped: true }]);
  assert.deepEqual(names(spaced), ['scope_in', 'scope_out', 'scope_in'], `spaced in/out/in: each heard (${names(spaced)})`);
  const inOut = await run([{ t: 0, scoped: true }, { t: 0.06, scoped: false }]);
  assert.deepEqual(names(inOut), [], `rapid in/out: nothing (${names(inOut)})`);
  // negative control: a lone in is heard
  const lone = await run([{ t: 0, scoped: true }]);
  assert.deepEqual(names(lone), ['scope_in'], 'a lone scope in is heard');
  // three toggles inside the old 0.2 s cooldown end on the right one: in, out, in, out lands on out from in
  const fromIn = await run([{ t: 0, scoped: true }, { t: 0.5, scoped: false }, { t: 0.55, scoped: true }, { t: 0.6, scoped: false }]);
  assert.deepEqual(names(fromIn), ['scope_in', 'scope_out'], `in, then out/in/out inside 0.2 s: the final out (${names(fromIn)})`);
  report.scope = { inOutIn: names(inOutIn), spaced: names(spaced), inOut: names(inOut), lone: names(lone), fromIn: names(fromIn) };
}
// the tank sight's zoom steps: one soft tick once the magnification settles; none out of the sight; none when it returns
{
  const steps = await run([{ t: 0, scoped: true, zoom: 4 }, { t: 0.5, zoom: 6 }, { t: 0.55, zoom: 8 }, { t: 0.6, zoom: 10 }]);
  assert.deepEqual(names(steps), ['scope_in', 'zoom_step'], `three quick steps: one tick (${names(steps)})`);
  const back = await run([{ t: 0, scoped: true, zoom: 4 }, { t: 0.5, zoom: 6 }, { t: 0.55, zoom: 4 }]);
  assert.deepEqual(names(back), ['scope_in'], `a step and back: no tick (${names(back)})`);
  const slow = await run([{ t: 0, scoped: true, zoom: 4 }, { t: 0.5, zoom: 6 }, { t: 1, zoom: 8 }]);
  assert.deepEqual(names(slow), ['scope_in', 'zoom_step', 'zoom_step'], `two settled steps: two ticks (${names(slow)})`);
  const outside = await run([{ t: 0, zoom: 4 }, { t: 0.5, zoom: 6 }]);
  assert.deepEqual(names(outside), [], 'no tick out of the sight');
  report.zoom = { quick: names(steps), back: names(back), slow: names(slow), outside: names(outside) };
}
// auto-aim and the lights settle the same way
{
  const aim = await run([{ t: 0, aim: 'foe' }, { t: 0.05, aim: null }, { t: 0.1, aim: 'foe' }]);
  assert.deepEqual(names(aim), ['lock_on'], `lock, drop, lock: one lock_on (${names(aim)})`);
  const aimBack = await run([{ t: 0, aim: 'foe' }, { t: 0.05, aim: null }]);
  assert.deepEqual(names(aimBack), [], 'lock and drop at once: nothing');
  const aimSpaced = await run([{ t: 0, aim: 'foe' }, { t: 0.4, aim: null }]);
  assert.deepEqual(names(aimSpaced), ['lock_on', 'lock_off'], 'negative control: spaced, both');
  const lights = await run([{ t: 0, lights: 1 }, { t: 0.05, lights: 0 }, { t: 0.1, lights: 1 }]);
  assert.deepEqual(names(lights), ['lights_on'], `lights on/off/on: one clunk (${names(lights)})`);
  const lightsBack = await run([{ t: 0, lights: 1 }, { t: 0.05, lights: 0 }]);
  assert.deepEqual(names(lightsBack), [], 'lights on and off at once: nothing');
  const lightsSpaced = await run([{ t: 0, lights: 1 }, { t: 0.4, lights: 0 }]);
  assert.deepEqual(names(lightsSpaced), ['lights_on', 'switch_toggle'], 'negative control: spaced, both');
  report.others = { aim: names(aim), aimBack: names(aimBack), aimSpaced: names(aimSpaced), lights: names(lights), lightsBack: names(lightsBack), lightsSpaced: names(lightsSpaced) };
}
console.log(`toggleSettle.selftest: ${JSON.stringify(report)}`);
