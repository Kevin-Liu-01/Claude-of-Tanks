// accessoryMaterials.selftest.mjs — vehicle accessories light like the vehicle (tank-accessories lane, 2026-10-05).
//
// The ghillie suits cloned the vehicle's canvas with Material.clone() and re-hooked it by hand. A plain clone keeps
// none of the cascade registration (three resets `defines`, and never copies onBeforeCompile or the program key), so
// every suit lit with all four cascade suns at once — about four times the sun on a lit face — which is why the suits
// read pale and flat in battle. Suit cloth and garnish now clone through cloneVehicleMaterial, and the alpha-cut
// garnish sets its map and cut in the `configure` callback, before registration, so the cascade setup sees an
// alpha-tested foliage material (and builds its coverage-preserving mips, lighting.ts). This receipt builds real
// suited hulls and a decorated hull through a cascade-registering engine context and requires every suit and decor
// material to be registered like the paint, the garnish to carry its map and cut at registration, and every
// registration to be released on dispose. Canvas storage is a CPU fixture: shader ownership only, never pixels.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { cloneVehicleMaterial } from './materials.ts';

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

// --- negative control: the plain clone the suits used is unregistered
{
  const source = new THREE.MeshStandardMaterial();
  source.defines = { ...source.defines, USE_CSM: 1, CSM_CASCADES: 4 };
  const plain = source.clone();
  assert.equal(plain.defines.USE_CSM, undefined, 'three: a plain clone drops the cascade defines (the old suit cloth)');
  // `configure` runs before registration, on the clone only
  let seen = null;
  const configured = cloneVehicleMaterial(source, (clone) => { seen = clone; clone.alphaTest = 0.4; });
  assert.equal(seen, configured, 'configure receives the clone that is returned');
  assert.equal(configured.alphaTest, 0.4, 'configure edits the clone');
  assert.equal(source.alphaTest, 0, 'and never the source');
  source.dispose(); plain.dispose(); configured.dispose();
}

const registered = new Set();
const released = new Set();
const atRegistration = new Map();
const engineCtx = {
  anisotropy: 1,
  setupShadowMaterial(material, hook) {
    material.defines = { ...material.defines, USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
    material.onBeforeCompile = (shader) => { shader.uniforms.CSM_cascades = { value: [] }; hook?.(shader); };
    registered.add(material);
    atRegistration.set(material, { alphaTest: material.alphaTest, map: material.map, side: material.side });
    return material;
  },
  releaseShadowMaterial(material) { released.add(material); return true; },
};
const assertRegistered = (material, label) => {
  assert.ok(registered.has(material), `${label}: joins the cascade registration`);
  assert.equal(material.defines.USE_CSM, 1, `${label}: compiles the cascade branch`);
  assert.equal(material.defines.CSM_CASCADES, 4, `${label}: with the cascade count`);
};

const restoreCanvas = installCanvasFixture();
const visuals = [];
let suitMeshes = 0, leafMeshes = 0, decorMeshes = 0;
try {
  // a leafy suit (birch sprays), the ULCANS multispectral cover (painted garnish), a spruce suit
  for (const id of ['pt91_twardy', 'm1a2_sepv3', 'strv103']) {
    const visual = createTank(id, engineCtx, { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
    visuals.push(visual);
    visual.root.traverse((object) => {
      if (!object.isMesh || !/_ghillie_/.test(object.name)) return;
      suitMeshes++;
      assertRegistered(object.material, `${id}/${object.name}`);
      assert.equal(object.material.customProgramCacheKey(), 'veh-ambient-floor-v5', `${id}/${object.name}: the fleet's program key`);
      assert.equal(object.material.side, THREE.DoubleSide, `${id}/${object.name}: cloth and garnish are seen from both sides`);
      if (/_leaves$/.test(object.name)) {
        leafMeshes++;
        const at = atRegistration.get(object.material);
        assert.ok(at.map, `${id}/${object.name}: the garnish atlas is set before registration`);
        assert.ok(at.alphaTest > 0.3, `${id}/${object.name}: the alpha cut is set before registration (coverage mips)`);
        assert.equal(object.material.vertexColors, true, `${id}/${object.name}: per-card tint`);
        assert.ok(object.geometry.getAttribute('uv') && object.geometry.getAttribute('color'),
          `${id}/${object.name}: spray cards carry atlas UVs and tints`);
      }
    });
  }
  // the decor layer on a dressed hull goes through the same registration (decorations.ts buildDecorMaterials)
  const dressed = createTank('leo2a6', engineCtx, { quality: 'low', geometryQuality: 'high', decor: true });
  visuals.push(dressed);
  dressed.root.traverse((object) => {
    if (!object.isMesh || !object.userData.__decor) return;
    decorMeshes++;
    assertRegistered(object.material, `leo2a6/${object.name}`);
    // cosmetic stowage is dressing that distance detail may drop; working smoke banks stay resident
    const expected = object.userData.smokeSockets?.length ? 'equipment' : object.parent?.parent?.userData?.decorFunctional ? 'equipment' : 'nonArmor';
    assert.equal(object.userData.combatHitboxRole, expected, `leo2a6/${object.name}: ${expected} role`);
  });
} finally {
  for (const visual of visuals) visual.dispose();
  restoreCanvas();
}
assert.ok(suitMeshes >= 9, `suit meshes were covered (${suitMeshes})`);
assert.ok(leafMeshes >= 5, `garnish meshes were covered (${leafMeshes})`);
assert.ok(decorMeshes >= 4, `decor meshes were covered (${decorMeshes})`);
const leaked = [...registered].filter((material) => !released.has(material));
assert.equal(leaked.length, 0, `every registered accessory material is released on dispose (${leaked.map((m) => m.name).join(', ')})`);
console.log(`accessoryMaterials.selftest: ${suitMeshes} suit meshes (${leafMeshes} garnish) and ${decorMeshes} decor meshes `
  + `join the cascade registration; ${registered.size} registrations all released PASS`);
