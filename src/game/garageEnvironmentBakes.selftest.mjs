// garage-env-276 (class 1, Main's gap): each Garage pack lights and reflects with its own sky's environment.
// The open flip re-baked the environment once and every later open pack kept it: a desert yard under the winter sky's
// environment. Now each pack's environment is baked from its own sky (garageEnvironmentBakes.ts, engine/sky.ts
// prebakeEnvironment) in idle slots, kept per pack up to the device's cap, and installed by key on the pack's activation.
// 1. the cache (engine/skyEnvironmentCache.ts, real): a pre-bake is resident without installing, its install is an exact
//    hit (no bake), the cap releases the least recently used and never the installed map, leaving gives the pair back;
// 2. the bakes owner: one pack a slot, the pack's own Garage sky and enclosure, never twice, nothing behind a battle;
// 3. through the real presentation runtime: every activation installs the shown pack's own environment, across open and
//    sealed switches both ways; planted control: the old wiring (the open flip's one bake, kept) shows the wrong
//    pack's environment after the second open switch.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkyEnvironmentCache, RETAINED_ENVIRONMENTS } from '../engine/skyEnvironmentCache.ts';
import { GARAGE_VARIANTS, getGarageVariant } from './garageVariants.ts';
import { getGarageSkyPreset } from './garageSkyPresets.ts';
import { createGarageEnvironmentBakes, GARAGE_ENVIRONMENT_CAP, GARAGE_ENVIRONMENT_MIB } from './garageEnvironmentBakes.ts';
import { createGarageEnvironmentPresentationRuntime } from './garageEnvironmentPresentationRuntime.ts';

// 1. the cache
{
  const scene = new THREE.Scene(), made = [];
  const context = { isContextLost: () => false }, renderer = { info: {}, getContext: () => context };
  const cache = new SkyEnvironmentCache(renderer, scene);
  const create = () => { const t = new THREE.WebGLRenderTarget(8, 8); t.disposals = 0; t.addEventListener('dispose', () => { t.disposals++; }); made.push(t); return t; };
  cache.setCapacity(4);
  cache.install('shown', create, 0.5, () => true);
  const shown = scene.environment;
  assert.equal(cache.prebake('desert', create), true, 'a pre-bake bakes');
  assert.equal(scene.environment, shown, 'and installs nothing');
  assert.equal(cache.prebake('desert', create), false, 'a resident key never bakes twice');
  assert.ok(cache.has('desert'));
  const bakes = made.length;
  cache.install('desert', () => assert.fail('an install of a pre-baked key is an exact hit'), 0.5, () => true);
  assert.equal(made.length, bakes);
  assert.equal(scene.environment, made[1].texture, 'the pre-baked map is the one installed');
  cache.prebake('winter', create); cache.prebake('urban', create); cache.prebake('coastal', create);
  assert.ok(!cache.has('shown') && cache.has('desert'), 'past the cap the least recently used goes, never the installed map');
  cache.setCapacity(0);
  assert.ok(cache.has('desert'), 'giving the bakes back keeps the installed map');
  assert.ok([...['winter', 'urban', 'coastal']].filter((key) => cache.has(key)).length <= RETAINED_ENVIRONMENTS - 1, 'and the pair');
}

// the packs' presets as the Garage shows them (main.ts presetFor: the battlefield's sky; the weather layer is main's)
const presetFor = (variant) => ({ ...getGarageSkyPreset(variant.mapId), packOf: variant.id });
/** A sky whose keys are its presets' own (sky.ts environmentKey keys the sun, the preset and the atmosphere). */
function fakeSky() {
  const sky = { shown: null, enclosed: false, installed: null, baked: [], resident: new Set(), capacity: RETAINED_ENVIRONMENTS };
  const keyOf = (preset, enclosed) => `${preset.packOf}|${preset.sunElevationDeg}/${preset.sunAzimuthDeg}|${enclosed ? 'enclosed' : 'open'}`;
  sky.prebakeEnvironment = (preset, enclosed) => {
    const key = keyOf(preset, enclosed);
    if (!sky.resident.has(key)) { sky.baked.push(key); sky.resident.add(key); }
    return key;
  };
  sky.environmentCached = (key) => sky.resident.has(key);
  sky.setEnvironmentCapacity = (count) => { sky.capacity = Math.max(RETAINED_ENVIRONMENTS, count); };
  // bakeEnvironment: the shown sky's key, an exact hit when resident
  sky.bakeEnvironment = () => {
    const key = keyOf(sky.shown, sky.enclosed);
    if (!sky.resident.has(key)) { sky.baked.push(key); sky.resident.add(key); }
    sky.installed = key;
  };
  sky.keyOf = keyOf;
  return sky;
}

// 2. the bakes owner
{
  const sky = fakeSky(), slots = [];
  let showing = true;
  const bakes = createGarageEnvironmentBakes({ sky, presetFor, schedule: (work) => slots.push(work), isShowing: () => showing,
    capacity: GARAGE_ENVIRONMENT_CAP.desktop });
  bakes.enter();
  assert.equal(sky.capacity, GARAGE_ENVIRONMENT_CAP.desktop);
  bakes.want('desert_forward_depot'); bakes.want('desert_forward_depot'); bakes.want('alpine_service_cavern');
  assert.equal(slots.length, 1, 'one idle slot asked');
  slots.shift()();
  assert.deepEqual(sky.baked, [sky.keyOf(presetFor(getGarageVariant('desert_forward_depot')), false)], 'one pack a slot, its own sky, open');
  slots.shift()();
  assert.equal(sky.baked[1], sky.keyOf(presetFor(getGarageVariant('alpine_service_cavern')), true), 'a sealed bay bakes enclosed');
  bakes.want('desert_forward_depot');
  assert.equal(slots.length, 0, 'a resident pack is never asked again');
  assert.deepEqual(bakes.diagnostics().resident, ['desert_forward_depot', 'alpine_service_cavern']);
  assert.equal(bakes.diagnostics().residentMib, 2 * GARAGE_ENVIRONMENT_MIB);
  bakes.want('winter_repair_bunker');
  showing = false;
  slots.shift()();
  assert.equal(sky.baked.length, 2, 'nothing bakes behind a battle');
  bakes.leave();
  assert.equal(sky.capacity, RETAINED_ENVIRONMENTS, 'leaving gives the per-pack bakes back');
  assert.equal(GARAGE_ENVIRONMENT_MIB, 6, 'a 768 x 1024 half-float PMREM target is 6 MiB');
  assert.ok(GARAGE_ENVIRONMENT_CAP.desktop * GARAGE_ENVIRONMENT_MIB <= 36 && GARAGE_ENVIRONMENT_CAP.mobile * GARAGE_ENVIRONMENT_MIB <= 18);
}

// 3. through the real presentation runtime
async function garage(installs) {
  const sky = fakeSky();
  let selected = GARAGE_VARIANTS[0].id;
  const runtime = createGarageEnvironmentPresentationRuntime({
    garagePosition: new THREE.Vector3(), getSelectedVariantId: () => selected, setWorldDormant() {},
    applySkyPreset: () => { sky.shown = presetFor(getGarageVariant(selected)); },
    placeGarage() {}, setGarageSunTrim() {},
    setLightEnclosure: (enclosed) => {
      // the old wiring's one bake: the open flip re-baked once (sky.ts syncEnvironmentEnclosure), then kept it
      if (!installs && sky.enclosed && !enclosed && !sky.syncedOnce) { sky.syncedOnce = true; sky.bakeEnvironment(); }
      sky.enclosed = enclosed;
    },
    installEnvironment: installs ? () => sky.bakeEnvironment() : () => {},
    loadOpenSkyLight: async () => {}, invalidatePresentation() {}, setCameraPose() {},
  });
  return { sky, async show(id) { selected = id; await runtime.activate(id); } };
}
const order = ['verdant_motor_pool', 'desert_forward_depot', 'winter_repair_bunker', 'alpine_service_cavern', 'desert_forward_depot',
  ...GARAGE_VARIANTS.map((v) => v.id)];
const now = await garage(true);
for (const id of order) {
  await now.show(id);
  const variant = getGarageVariant(id);
  assert.equal(now.sky.installed, now.sky.keyOf(presetFor(variant), variant.enclosure === 'sealed'),
    `${id}: the installed environment is its own sky's (${now.sky.installed})`);
}
const bakedOnce = new Set(now.sky.baked);
assert.equal(bakedOnce.size, now.sky.baked.length, 'no pack\'s environment is baked twice');
// planted control: the old wiring
const old = await garage(false);
let wrong = 0;
for (const id of order) {
  await old.show(id);
  const variant = getGarageVariant(id);
  if (variant.enclosure === 'open' && old.sky.installed !== old.sky.keyOf(presetFor(variant), false)) wrong += 1;
}
assert.ok(wrong >= 7, `the old wiring shows another pack's environment on most open activations (${wrong})`);

console.log(`garageEnvironmentBakes.selftest: pre-bakes resident without installing, installs are exact hits, the cap spares the `
  + `installed map; one pack a slot from its own sky (sealed bays enclosed), none behind a battle; ${order.length} activations `
  + `install each pack's own environment (${bakedOnce.size} bakes, none twice); the old wiring is wrong on ${wrong} open `
  + `activations; ${GARAGE_ENVIRONMENT_CAP.desktop} x ${GARAGE_ENVIRONMENT_MIB} MiB desktop, ${GARAGE_ENVIRONMENT_CAP.mobile} x `
  + `${GARAGE_ENVIRONMENT_MIB} MiB mobile PASS`);
