// garage-env-276 (class 1): the Garage's light follows the shown pack's declared enclosure (garageVariants.ts
// GarageVariant.enclosure). The battle-vs-Garage sheets showed every open yard flat and shadowless: the Garage phase took
// the sealed bay's authored rig whichever pack it showed. Through the real presentation runtime
// (garageEnvironmentPresentationRuntime.ts activate) and the real lighting (engine/lighting.ts) under an atmosphere with
// the grounded model installed:
// 1. every pack's light is its declared enclosure's: an open yard the grounded model (a shadow-casting sun, the
//    environment light), a sealed bay the authored rig, through every flip between them;
// 2. leaving the Garage opens the presentation (the battle's light), and a far-band sleep is apart from the enclosure;
// 3. planted control: the old wiring (the enclosure set once on entry, never per pack) fails the same check on every
//    open yard; main.ts wires the runtime to the lighting's enclosure switch, and its boot sets the persisted pack's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from './garageVariants.ts';
import { getGarageSkyPreset } from './garageSkyPresets.ts';
import { createGarageEnvironmentPresentationRuntime } from './garageEnvironmentPresentationRuntime.ts';
import { createLighting } from '../engine/lighting.ts';
import { importGroundedLightModel } from '../engine/lightModelCore.ts';
import { skyPresetToAtmosphere } from '../engine/atmosphere.ts';
import { DEFAULT_SKY_PRESET } from '../engine/sky.ts';

const sealedIds = GARAGE_VARIANTS.filter((v) => v.enclosure === 'sealed').map((v) => v.id);
assert.deepEqual(sealedIds, ['verdant_motor_pool', 'alpine_service_cavern'], 'the sealed bays: the Verdant hall and the alpine cavern');
assert.ok(GARAGE_VARIANTS.every((v) => v.enclosure === 'open' || v.enclosure === 'sealed'), 'every pack declares its enclosure');

await importGroundedLightModel();

/** A Garage over the real lighting; `perPack` false is the old wiring (the enclosure set once, on entry). */
function garage(perPack) {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(1, 1, 1).normalize();
  const atmosphere = { active: true, skyView: new THREE.Texture(), params: null, irradianceRaw: new THREE.Color(0.05, 0.08, 0.14) };
  scene.userData.atmosphere = atmosphere;
  const lighting = createLighting(scene, new THREE.PerspectiveCamera(), sunDir);
  let selected = GARAGE_VARIANTS[0].id;
  let preset = null;
  const runtime = createGarageEnvironmentPresentationRuntime({
    garagePosition: new THREE.Vector3(),
    getSelectedVariantId: () => selected,
    setWorldDormant() {},
    applySkyPreset: () => {
      // the sky the Garage shows (main.ts applySkyPreset): the pack's battlefield's, its atmosphere integrated
      preset = { ...DEFAULT_SKY_PRESET, ...getGarageSkyPreset(GARAGE_VARIANTS.find((v) => v.id === selected).mapId) };
      atmosphere.params = skyPresetToAtmosphere(preset);
      sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - preset.sunElevationDeg), THREE.MathUtils.degToRad(preset.sunAzimuthDeg));
    },
    placeGarage() {},
    setGarageSunTrim: (active) => { if (active) lighting.setSun(sunDir, preset); },
    setLightEnclosure: perPack ? (enclosed) => lighting.setEnclosedPresentation(enclosed) : () => {},
    loadOpenSkyLight: () => importGroundedLightModel(),
    invalidatePresentation() {},
    setCameraPose() {},
  });
  // the Garage is up: the far bands sleep (main.ts boot, garageReturnRuntime); the old wiring also sealed it here
  lighting.setFarCascadeDormant(true);
  if (!perPack) lighting.setEnclosedPresentation(true);
  return {
    scene, lighting,
    async show(id) { selected = id; await runtime.activate(id); },
    dispose() { lighting.csm.remove(); lighting.csm.dispose(); },
  };
}

/** What is wrong with the light shown for this pack (empty: it is its enclosure's). */
function mismatches(g, variant) {
  const out = [];
  const model = g.scene.userData.lightModel, sealed = variant.enclosure === 'sealed';
  if (g.scene.userData.lightEnclosed !== sealed) out.push(`lightEnclosed ${g.scene.userData.lightEnclosed}`);
  if (g.lighting.getShadowTelemetry().enclosedPresentation !== sealed) out.push('the lighting\'s enclosure');
  if (model?.mode !== (sealed ? 'legacy' : 'physical')) out.push(`light model ${model?.mode}`);
  if (!sealed) {
    const sun = g.lighting.csm.lights;
    if (!sun.length || !sun.every((light) => light.castShadow && light.intensity > 0)) out.push('no shadow-casting sun');
    if (!(g.scene.environmentIntensity > 0) || !(model?.envIntensity > 0)) out.push('no environment light');
    if (!(model?.exposure > 0)) out.push('no exposure from the model');
  }
  return out;
}

// 1. every pack, and the flips between sealed and open both ways
const g = garage(true);
const rows = [];
try {
  const order = [...GARAGE_VARIANTS, GARAGE_VARIANTS[7], GARAGE_VARIANTS[1], GARAGE_VARIANTS[0], GARAGE_VARIANTS[4]];
  for (const variant of order) {
    await g.show(variant.id);
    assert.deepEqual(mismatches(g, variant), [], `${variant.id} (${variant.enclosure}): the light is its enclosure's`);
    rows.push(`${variant.mapId} ${g.scene.userData.lightModel.mode}`);
  }
  // 2. leaving the Garage from a sealed bay opens the presentation; the far-band sleep is apart from the enclosure
  await g.show('alpine_service_cavern');
  assert.equal(g.lighting.getShadowTelemetry().farCascadeDormancyRequested, true, 'the Garage sleeps the far bands, sealed or open');
  g.lighting.setFarCascadeDormant(false);
  assert.equal(g.scene.userData.lightEnclosed, false, 'leaving the Garage opens the presentation');
  assert.equal(g.scene.userData.lightModel.mode, 'physical', 'the battle lights with the grounded model');
} finally { g.dispose(); }

// 3. the planted control: the old wiring leaves every open yard on the sealed bay's rig, and the check sees each one
const old = garage(false);
let flagged = 0;
try {
  for (const variant of GARAGE_VARIANTS) {
    await old.show(variant.id);
    if (mismatches(old, variant).length) flagged += 1;
  }
} finally { old.dispose(); }
const open = GARAGE_VARIANTS.filter((v) => v.enclosure === 'open').length;
assert.equal(flagged, open, `the old wiring fails the check on every open yard (${flagged} of ${open})`);

const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /setLightEnclosure: \(enclosed\) => lighting\.setEnclosedPresentation\(enclosed\),\s*loadOpenSkyLight: loadGroundedLightModel,/,
  'main.ts wires the Garage runtime to the lighting\'s enclosure switch and the grounded model\'s chunk');
// the boot sets its pack's enclosure itself: a Verdant boot never calls activate, and its hall must stay sealed
assert.match(main, /if \(!STUDIO_BOOT_INTENT\) lighting\.setFarCascadeDormant\(true\);\n[^\n]*\nif \(!STUDIO_BOOT_INTENT\) lighting\.setEnclosedPresentation\(getGarageVariant\(loadGarageVariantId\(\)\)\.enclosure === 'sealed'\);/,
  'the boot\'s light is its persisted pack\'s enclosure');

console.log(`garageEnclosure.selftest: ${GARAGE_VARIANTS.length} packs light as declared through ${rows.length} activations `
  + `(${sealedIds.length} sealed bays on the authored rig; open yards on the grounded model with a shadow-casting sun, `
  + `environment and exposure); leaving the Garage opens it; the old wiring fails ${flagged} of ${open} open yards PASS`);
