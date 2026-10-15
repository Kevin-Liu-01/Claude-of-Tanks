// Every vehicle's countdown bank is the one its rig plays (2026-10-14). The battle warm decodes each roster hull's
// engine bands first (presenceAssets), naming the hull by spec id before any hull exists; an engine family turns on the
// hull's role and weight as well as its id, so by id alone 40 of the 220 vehicles (every IFV: the CV90s, the Bradleys,
// the BMPs, Puma, Warrior, the Lynxes, Marder, AMX-10P...) warmed a heavy's diesel and their own bank sat at the back of
// the queue: silent through a slow entry's count (verifier counterexample on 28836db71). Drives the real engine through
// the lazy facade with the fleet's specs (as main.ts hands them: getVehicleSpec), the audio graph stubbed.
import assert from 'node:assert/strict';
import '../vehicles/fleetRegistration.ts';
import { TANK_SPECS, getSpec } from '../vehicles/specs.ts';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { createLazyAudio } from './lazyAudio.ts';
import { WEAPON_CLOSE } from './weaponAudio.ts';

globalThis.window = {};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const assetOf = (url) => String(url).replace(/^.*\/audio\/(?:sfx|voice)\/[^/]+\//, '').replace(/_\d+\.webm$/, '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const BANDS = ['start', 'idle', 'low', 'mid', 'high', 'stop'];
const ENGINE_BAND = new RegExp(`^engine_(.+)_(?:${BANDS.join('|')})$`);

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

/** The engine as main.ts builds it: the fleet's specs handed in (getVehicleSpec: getSpec). */
function compose() {
  delete globalThis.window.__COT_AUDIO;
  const ctx = createFakeContext({ decode: (bytes) => Object.assign(fakeBuffer(1.5), { name: assetOf(decoder.decode(bytes)) }) });
  const bus = createBus();
  const audio = createLazyAudio({
    loadMixer: () => import('./audioEngine.ts'),
    createContext: () => ctx,
    hasStickyActivation: () => true,
    getMapId: () => 'verdant',
    getGameMode: () => 'standard',
    getTerrain: () => ({ getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 }),
    getVehicleSpec: getSpec,
  });
  audio.bindBus(bus);
  return { ctx, bus, audio };
}

/** A hull as the battle presents it (solo state and the network presentation alike): its whole fleet spec. */
function hull(specId, i) {
  return {
    id: `h_${specId}`, team: 'enemy', isPlayer: false, specId, spec: TANK_SPECS[specId],
    state: { pos: { x: -30 + 10 * i, y: 0, z: 100 }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
  };
}
const camera = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'camera', ownerId: null, scoped: false };

const ids = Object.keys(TANK_SPECS);
assert.ok(ids.length >= 220, `the whole fleet is registered (${ids.length})`);

// ------------------------------------------------------------------ 1. every spec's rig: the family it plays in battle
const rigFamily = new Map();
const engine = compose();
{
  installFetch();
  engine.audio.resume();
  await engine.audio.warmBattleEvents([]);
  await globalThis.window.__COT_AUDIO.libraryIdle();
  engine.bus.emit('phase:change', { phase: 'battle' });
  // the rigs the engine builds for each hull, a few at a time inside the smallest LOD budget
  for (let at = 0; at < ids.length; at += 7) {
    const batch = ids.slice(at, at + 7).map(hull);
    engine.ctx.advance(1 / 30);
    engine.audio.update(1 / 30, camera, batch);
    const rigs = new Map(globalThis.window.__COT_AUDIO.engineState().map((rig) => [rig.id, rig.family]));
    for (const h of batch) {
      assert.ok(rigs.has(h.id), `${h.specId}: its rig is built (${[...rigs.keys()]})`);
      rigFamily.set(h.specId, rigs.get(h.id));
    }
  }
  engine.bus.emit('phase:change', { phase: 'garage' });
  const ifvs = ids.filter((id) => rigFamily.get(id) === 'diesel_ifv');
  assert.ok(ifvs.length >= 40, `the IFVs run their own diesel (${ifvs.length})`);
}
const probe = globalThis.window.__COT_AUDIO;

// ------------------------------------------------------------------ 2. a cold IFV entry decodes its own banks first
{
  const roster = ['cv90', 'bmp3', 'm2a2_bradley', 't72b3m'];
  for (const id of roster) assert.ok(TANK_SPECS[id], `${id} is in the fleet`);
  assert.equal(rigFamily.get('cv90'), 'diesel_ifv', 'the CV90 runs the IFV diesel');
  const fetches = installFetch((url) => url.includes('/audio/sfx/'));
  const c = compose();
  c.audio.resume();
  void c.audio.warmBattleEvents(roster);
  for (let i = 0; i < 20; i++) await tick();
  for (let guard = 0; guard < 5000 && fetches.held.length; guard++) { for (const file of fetches.held.splice(0)) file.release(); await tick(); }
  const sfx = fetches.order.filter((url) => url.includes('/audio/sfx/')).map(assetOf);
  const first = (asset) => sfx.indexOf(asset);
  const firstCombat = Math.min(...Object.values(WEAPON_CLOSE).map(first).filter((i) => i >= 0));
  for (const id of roster) {
    for (const band of ['start', 'idle']) {
      const asset = `engine_${rigFamily.get(id)}_${band}`;
      assert.ok(first(asset) >= 0 && first(asset) < firstCombat, `${id}: ${asset} decodes in the presence set, before the combat banks (${first(asset)} vs ${firstCombat})`);
    }
  }
  console.log(`presenceFamilies.selftest: a cold IFV entry decodes the IFV diesel's idle ${first('engine_diesel_ifv_idle')} and start `
    + `${first('engine_diesel_ifv_start')} of ${sfx.length} files; the first combat bank ${firstCombat}`);
}

// ------------------------------------------------------------------ 3. every spec: the warm's family is its rig's
{
  const mismatched = [];
  for (const id of ids) {
    const presence = probe.presence([id]);
    const families = [...new Set(presence.map((asset) => ENGINE_BAND.exec(asset)?.[1]).filter(Boolean))];
    if (families.length !== 1 || families[0] !== rigFamily.get(id)) { mismatched.push(`${id}: warm ${families.join('+') || 'none'}, rig ${rigFamily.get(id)}`); continue; }
    for (const band of BANDS) assert.ok(presence.includes(`engine_${families[0]}_${band}`), `${id}: the warm holds its ${band} band`);
  }
  assert.deepEqual(mismatched, [], `every vehicle warms the bank its rig plays (${mismatched.length} of ${ids.length} do not)`);
}

console.log(`presenceFamilies.selftest: all ${ids.length} vehicles warm the engine bank their rig plays (IFVs included) passed`);
