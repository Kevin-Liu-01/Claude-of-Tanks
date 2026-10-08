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
  const kept = cloneVehicleMaterial(source);
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
let cascadeCallbacks = 0;
const engineCtx = {
  anisotropy: 1,
  setupShadowMaterial(material, hook) {
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
    material.onBeforeCompile = (shader) => {
      cascadeCallbacks++;
      shader.uniforms.CSM_cascades = { value: [] };
      hook?.(shader);
    };
    registered.add(material);
    return material;
  },
  releaseShadowMaterial(material) { released.add(material); return true; },
};
const restoreCanvas = installCanvasFixture();
const visuals = [];
const seenKinds = new Map();
const note = (kind, id) => seenKinds.set(kind, (seenKinds.get(kind) ?? new Set()).add(id));
const assertRegistered = (material, label) => {
  assert.ok(registered.has(material), `${label}: joins the cascade registration`);
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
  // m1a2: the shoes; m60a1: a profile's track-band finish; t72b3m: tyre rubber isolated from gunmetal
  for (const id of ['m1a2', 'm60a1', 't72b3m']) {
    const visual = createTank(id, engineCtx, { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
    visuals.push(visual);
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
  }
  for (const [kind, ids] of [['trackPad', ['m1a2', 'm60a1', 't72b3m']], ['trackBandFinish', ['m60a1']], ['isolated', ['t72b3m']]]) {
    for (const id of ids) assert.ok(seenKinds.get(kind)?.has(id), `${id}: a ${kind} clone was covered`);
  }
} finally {
  for (const visual of visuals) visual.dispose();
  restoreCanvas();
}
const leaked = [...registered].filter((material) => !released.has(material));
assert.equal(leaked.length, 0, `every registered vehicle material is released on dispose (${leaked.map((m) => m.name).join(', ')})`);
assert.ok(registered.size > 40, 'real vehicle material sets, not a single fake hook');
// the hook a direct (stub) registration assigns is the readability hook itself, unchanged by this law
assert.equal(typeof vehicleAmbientFloorHook, 'function');
console.log(`vehicleMaterialClone.selftest: shoes, isolated gear roles and band finishes join the cascade registration, `
  + `${registered.size} registered materials all released PASS`);
