// vehicleMaterialClone.selftest.mjs — a cloned vehicle material joins its source's cascade registration
// (materials.ts cloneVehicleMaterial, 2026-10-04, the vehicle-look lane).
//
// Material.clone() keeps none of the registration: three's MeshStandardMaterial.copy resets `defines` to { STANDARD }
// (USE_CSM, CSM_CASCADES and CSM_FADE go) and Material.copy never copies onBeforeCompile or customProgramCacheKey. The
// track shoes (every hull), the isolated gear roles (tyre rubber cut from gunmetal), a profile's track-band finish and
// the thrown-track ribbon were such clones: they lit with all four cascade suns at once (about four times the sun on a
// lit face) and wrote neither the sun state nor the vehicle tag the aerial pass reads. This receipt builds real hulls
// through a cascade-registering engine context and requires each of those materials to be registered like the paint,
// to compile the cascade chain and the readability hook, to share the fleet's program key, and to be released on
// dispose. Canvas storage is a CPU-only fixture: shader ownership is checked, never painted pixels or WebGL.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cloneVehicleMaterial, vehicleAmbientFloorHook } from './materials.ts';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { clearJuggernautVisual, prepareGarageTankEnergyVisual } from '../game/juggernautVisual.ts';
import { programVariantOrigin } from '../engine/programVariants.ts';

function installCanvasFixture() {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const pathDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Path2D');
  class PathFixture {
    moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {}
    closePath() {} rect() {} arc() {} ellipse() {} addPath() {}
  }
  function canvas() {
    const element = { width: 0, height: 0 };
    const gradient = () => ({ addColorStop() {} });
    const context = { canvas: element,
      createLinearGradient: gradient, createRadialGradient: gradient,
      isPointInPath: () => false,
      measureText: (text) => ({ width: text.length * 8 }),
      getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
      createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
      createPattern() { return {}; },
    };
    for (const name of ['arc', 'beginPath', 'clearRect', 'closePath', 'drawImage', 'fill', 'fillRect',
      'fillText', 'lineTo', 'moveTo', 'putImageData', 'restore', 'rotate', 'save', 'scale',
      'setLineDash', 'stroke', 'strokeRect', 'strokeText', 'translate', 'clip', 'ellipse',
      'quadraticCurveTo', 'bezierCurveTo', 'rect', 'setTransform', 'resetTransform']) {
      context[name] = () => {};
    }
    element.getContext = () => context;
    return element;
  }
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement(name) { assert.equal(name, 'canvas'); return canvas(); } } });
  Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: PathFixture });
  return () => {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
    if (pathDescriptor) Object.defineProperty(globalThis, 'Path2D', pathDescriptor);
    else delete globalThis.Path2D;
  };
}

function shaderFor(material) {
  const source = material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

// --- the plain clone this replaces, pinned so a three upgrade that starts copying hooks is noticed
{
  const source = new THREE.MeshStandardMaterial();
  source.defines = { ...source.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
  source.onBeforeCompile = () => {};
  source.customProgramCacheKey = () => 'veh-ambient-floor-v5';
  const plain = source.clone();
  assert.deepEqual(plain.defines, { STANDARD: '' }, 'three: a standard material clone resets its defines');
  assert.notEqual(plain.onBeforeCompile, source.onBeforeCompile, 'three: a clone drops onBeforeCompile');
  assert.notEqual(plain.customProgramCacheKey(), 'veh-ambient-floor-v5', 'three: a clone drops its program key');
  // a material from outside the tank material set (a stub's) keeps its own hooks through cloneVehicleMaterial, and any
  // clone keeps the vehicle's own shader switches (the wheel paint's floor)
  source.defines = { ...source.defines, COT_WHEEL_PAINT_READABILITY: 1, COT_CLOUD_SHADE: '' };
  // 2026-10-17 (the wheel-band lane): a cascade-registered source the vehicle registration does not know cannot pass its
  // registration on, and says so (a dev build and the receipts; the public build stays quiet)
  const reports = [];
  const consoleError = console.error;
  console.error = (...args) => { reports.push(args.join(' ')); };
  let kept;
  try { kept = cloneVehicleMaterial(source); } finally { console.error = consoleError; }
  assert.equal(reports.length, 1, 'a clone of an unregistered cascade material is reported');
  assert.match(reports[0], /\[vehicle material\]/);
  assert.equal(kept.onBeforeCompile, source.onBeforeCompile);
  assert.equal(kept.customProgramCacheKey(), 'veh-ambient-floor-v5');
  assert.equal(kept.defines.COT_WHEEL_PAINT_READABILITY, 1, 'a clone keeps its source\'s switches');
  assert.equal(kept.defines.USE_CSM, undefined, 'and only those: the registration owns the cascade\'s defines');
  assert.equal(kept.defines.COT_CLOUD_SHADE, undefined, 'the cloud shade among them');
  source.dispose(); plain.dispose(); kept.dispose();
}

// --- real hulls through a cascade-registering context
const registered = new Set();
const released = new Set();
// three's CSM keeps the compiled shader it refreshes under the material its hook closed over (CSM.setupMaterial)
const cascadeShaders = new Map();
let cascadeCallbacks = 0;
const engineCtx = {
  anisotropy: 1,
  setupShadowMaterial(material, hook) {
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
    material.onBeforeCompile = (shader) => {
      cascadeCallbacks++;
      shader.uniforms.CSM_cascades = { value: [] };
      cascadeShaders.set(material, shader);
      hook?.(shader);
    };
    cascadeShaders.set(material, null);
    registered.add(material);
    return material;
  },
  releaseShadowMaterial(material) { released.add(material); cascadeShaders.delete(material); return true; },
};
const restoreCanvas = installCanvasFixture();
const replacedHooks = new Set();
const visuals = [];
const seenKinds = new Map();
const note = (kind, id) => seenKinds.set(kind, (seenKinds.get(kind) ?? new Set()).add(id));
const assertRegistered = (material, label) => {
  // a battle build's program-variant twin (engine/programVariants.ts) holds its original's registration
  assert.ok(registered.has(programVariantOrigin(material)), `${label}: joins the cascade registration`);
  assert.equal(material.defines.USE_CSM, 1, `${label}: compiles the cascade branch`);
  assert.equal(material.defines.CSM_CASCADES, 4, `${label}: with the cascade count`);
  assert.ok('CSM_FADE' in material.defines, `${label}: and the cascade fade`);
  assert.equal(material.customProgramCacheKey(), 'veh-ambient-floor-v5', `${label}: the fleet's program key`);
  const before = cascadeCallbacks;
  const shader = shaderFor(material);
  assert.equal(cascadeCallbacks, before + 1, `${label}: the cascade hook runs when it compiles`);
  assert.ok(shader.uniforms.CSM_cascades, `${label}: the cascade uniforms bind`);
  assert.ok(shader.fragmentShader.includes('float vehFill'), `${label}: the readability floor chains after it`);
  assert.ok(shader.fragmentShader.includes('gl_FragColor.a += 2.0;'), `${label}: and the vehicle tag`);
};
try {
  // m1a1_abrams_hc: the shoes; m60a1: a profile's track-band finish; t72b3m_2022: tyre rubber isolated from gunmetal
  // 2026-10-19: and the Abrams as the Garage pedestal and the battle build it (batchStatic), whose running gear draws
  // through program-variant twins: each twin's skin registers through its original, under its own cascade entry
  let twinSkins = 0;
  for (const [id, extra] of [['m1a1_abrams_hc', null], ['m60a1', null], ['t72b3m_2022', null], ['m1a1_abrams_hc', { batchStatic: true }]]) {
    const visual = createTank(id, engineCtx, { proceduralOnly: true, quality: 'low', geometryQuality: 'high', ...extra });
    visuals.push(visual);
    if (extra?.batchStatic) assert.ok(visual.root.userData.programVariants?.twins > 0, `${id}: the battle build splits its program variants`);
    const pads = [];
    visual.root.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        if (!material?.isMeshStandardMaterial) continue;
        if (object.name === 'gearTrackPads' || object.name === 'gearTrackPadsSimplified') {
          pads.push(material);
          assertRegistered(material, `${id}/${object.name}`);
          assert.equal(material.name, 'cot:track-pad');
          // fleet lane round 1 (2026-10-07): the palette now multiplies the shoes' own worn-steel vertex colours
          assert.equal(material.vertexColors, true, `${id}: the shoes read their worn-steel vertex colours under the palette`);
          assert.ok(object.geometry.getAttribute('color'), `${id}/${object.name}: the shoe stream carries its vertex colours`);
          note('trackPad', id);
        }
        if (material.userData?.isolatedFrom) {
          assertRegistered(material, `${id}/${object.name} (${material.userData.appearanceRole} from ${material.userData.isolatedFrom})`);
          assert.ok(!material.defines.COT_WHEEL_PAINT_READABILITY, `${id}/${object.name}: an isolated role takes the ordinary gear path`);
          note('isolated', id);
        }
        if (material.userData?.trackBandFinish) {
          assertRegistered(material, `${id}/${object.name} (track-band finish)`);
          note('trackBandFinish', id);
        }
      }
    });
    assert.equal(new Set(pads).size, 1, `${id}: both shoe streams share the one registered shoe material`);
    // 2026-10-17 (the wheel-band lane; the owner: "in garage, on all tanks, i can see this weird shadow on wheels"): the
    // Garage's dormant energy skin, on every pedestal tank, draws clones of these materials; each joins its source's
    // registration under its own cascade entry (a raw clone lost USE_CSM, the sun state and the vehicle tag, and the
    // ground occlusion took the untagged road wheels for ground), takes its own sky-light scale, and is released with
    // the skin
    const sourceOf = new Map();
    visual.root.traverse((object) => { if (object.isMesh) sourceOf.set(object, object.material); });
    prepareGarageTankEnergyVisual(visual.root, getSpec(id).dims);
    const skins = new Map();
    // (2026-10-19) a program-variant twin wears its original's skin: one skin per material, as before the split
    const skinOfOrigin = new Map();
    visual.root.traverse((object) => {
      const source = sourceOf.get(object);
      if (!object.isMesh || !source || object.material === source || Array.isArray(source)) return;
      if (!registered.has(programVariantOrigin(source))) return;
      if (!skins.has(object.material)) skins.set(object.material, programVariantOrigin(source));
      const origin = programVariantOrigin(source);
      if (origin !== source) twinSkins++;
      assert.equal(skinOfOrigin.get(origin) ?? object.material, object.material, `${id}: a twin and its original wear one skin (${origin.name})`);
      skinOfOrigin.set(origin, object.material);
    });
    let wheelPaint = 0;
    for (const [clone, source] of skins) {
      const label = `${id}: the skin over ${source.name || source.type}`;
      assert.ok(registered.has(clone), `${label}: joins the cascade registration`);
      assert.equal(clone.defines.USE_CSM, 1, `${label}: compiles the cascade branch`);
      assert.equal(clone.defines.CSM_CASCADES, 4, `${label}: with the cascade count`);
      assert.ok('CSM_FADE' in clone.defines, `${label}: and the cascade fade`);
      assert.equal(clone.customProgramCacheKey(), `${source.customProgramCacheKey()}|tank-mode-energy-preview-v1`,
        `${label}: the source's program key with the dormant skin's suffix`);
      for (const key of ['COT_WHEEL_PAINT_READABILITY', 'COT_GEAR_CAVITY']) {
        assert.equal(clone.defines[key], source.defines[key], `${label}: the source's ${key}`);
      }
      if (clone.defines.COT_WHEEL_PAINT_READABILITY) wheelPaint++;
      const sourceShader = shaderFor(source);
      // round 2 (2026-10-17): a profile's patch over a set material (the Abrams' pad grime over its track bands and
      // spare-track steel) chains after its registration (chainVehicleMaterialHook); the skin compiles that chain
      const origin = programVariantOrigin(source);
      const entry = cascadeShaders.get(origin), cascaded = entry === sourceShader;
      if (!cascaded) { replacedHooks.add(`${id}:${source.name}`); }
      const shader = shaderFor(clone);
      assert.equal(cascadeShaders.get(clone), cascaded ? shader : null, `${label}: the cascade refreshes the clone's compile under the clone`);
      assert.equal(cascadeShaders.get(origin), entry, `${label}: and leaves the source's entry as it was`);
      assert.notEqual(shader.uniforms, sourceShader.uniforms, `${label}: its own uniform map, never its source's shared one`);
      assert.equal(!!shader.uniforms.CSM_cascades, cascaded, `${label}: the cascade uniforms bind as the source's do`);
      assert.ok(shader.fragmentShader.includes('float vehFill'), `${label}: the readability floor chains after it`);
      assert.ok(shader.fragmentShader.includes('gl_FragColor.a += 2.0;'), `${label}: and the vehicle tag`);
      assert.ok(shader.fragmentShader.includes('juggernautStrength'), `${label}: under the skin's rim term`);
      if (cascaded) {
        // the set's materials trim the sky light by their own envMapIntensity (a live uniform); a profile's re-hooked
        // clone (cloneRehookedVehicleMaterial, the bare hook) keeps the scene's whole sky light, as its hand re-hook did
        const trims = !!Object.getOwnPropertyDescriptor(sourceShader.uniforms.uVehEnvScale, 'value')?.get;
        const own = source.envMapIntensity;
        clone.envMapIntensity = own + 0.125;
        assert.equal(shader.uniforms.uVehEnvScale.value, trims ? own + 0.125 : 1, `${label}: its own sky-light scale, as its source's`);
        clone.envMapIntensity = own;
      }
    }
    assert.ok(skins.size >= 8, `${id}: the skin covers the hull's registered paint (${skins.size})`);
    assert.ok(wheelPaint > 0, `${id}: the road wheels' paint among them`);
    clearJuggernautVisual(visual.root, true);
    for (const [clone, source] of skins) {
      assert.ok(released.has(clone) && !cascadeShaders.has(clone), `${id}: the released skin leaves no cascade entry (${source.name})`);
    }
    visual.root.traverse((object) => {
      if (!sourceOf.has(object)) return;
      const now = [].concat(object.material), was = [].concat(sourceOf.get(object));
      assert.ok(now.length === was.length && now.every((m, i) => m === was[i]), `${id}: the paint is restored`);
    });
    note('energySkin', id);
  }
  for (const [kind, ids] of [['trackPad', ['m1a1_abrams_hc', 'm60a1', 't72b3m_2022']], ['trackBandFinish', ['m60a1']], ['isolated', ['t72b3m_2022']],
    ['energySkin', ['m1a1_abrams_hc', 'm60a1', 't72b3m_2022']]]) {
    for (const id of ids) assert.ok(seenKinds.get(kind)?.has(id), `${id}: a ${kind} clone was covered`);
  }
  assert.ok(twinSkins > 0, `the battle build's twin-drawn meshes wear their originals' skins (${twinSkins})`);
} finally {
  for (const visual of visuals) visual.dispose();
  restoreCanvas();
}
const leaked = [...registered].filter((material) => !released.has(material));
assert.equal(leaked.length, 0, `every registered vehicle material is released on dispose (${leaked.map((m) => m.name).join(', ')})`);
assert.ok(registered.size > 40, 'real vehicle material sets, not a single fake hook');
// the hook a direct (stub) registration assigns is the readability hook itself, unchanged by this law
assert.equal(typeof vehicleAmbientFloorHook, 'function');
// round 2 (2026-10-17): no profile replaces a registered material's cascade hook any more — the Abrams' pad grime chains
// after it (profiles/abrams.ts grime: its track bands and spare-track steel drew near-black, their cascade uniforms
// never bound). An entry here is a profile dropping a registered material's cascade hook.
assert.deepEqual([...replacedHooks].sort(), [], 'profiles replacing a registered material\'s cascade hook');
console.log(`vehicleMaterialClone.selftest: shoes, isolated gear roles, band finishes and the energy skins join the cascade registration, `
  + `${registered.size} registered materials all released PASS`);
