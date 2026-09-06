import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { vehicleAmbientFloorHook } from './materials.ts';
import {
  setVehicleReadabilityScale, getVehicleReadabilityScale,
} from './vehicleReadability.ts';
import { createTank } from './tankFactory.ts';

function shaderFor(material) {
  const source = material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

assert.equal(getVehicleReadabilityScale(), 1, 'pristine daylight/Garage default');
const material = new THREE.MeshStandardMaterial();
material.onBeforeCompile = vehicleAmbientFloorHook;
const before = shaderFor(material);
const uniform = before.uniforms.uVehicleReadabilityScale;
assert.equal(uniform.value, 1);
// Compare the actual callback output with the pre-edit shader fingerprint.
// Removing only the three deliberate additions must recover EVERY prior
// floor expression, normal response, texture operation and lighting chunk.
const additions = [
  'uniform float uVehicleReadabilityScale;\n',
  '\t\tvehFill *= uVehicleReadabilityScale;\n',
  '\t\tvehFloorL *= uVehicleReadabilityScale;\n',
];
let daylight = before.fragmentShader;
for (const addition of additions) {
  assert.equal(daylight.split(addition).length, 2, 'each required uniform application appears exactly once');
  daylight = daylight.replace(addition, '');
}
const hash = createHash('sha256');
hash.update(daylight);
assert.equal(hash.digest('hex'), '403cad4fb9f972e6bbbbf8a7b940f0074d385438a317d3d86bc4e2bd29cbbef2',
  'default scale1 preserves all pre-change daylight/Garage shader expressions');

try {
  const materialVersion = material.version;
  const programKey = material.customProgramCacheKey();
  setVehicleReadabilityScale(.12);
  assert.equal(uniform.value, .12, 'already-compiled material sees night immediately');
  const during = shaderFor(material);
  assert.strictEqual(during.uniforms.uVehicleReadabilityScale, uniform, 'later compilation shares the same uniform');
  assert.equal(during.fragmentShader, before.fragmentShader, 'no day/night shader permutation');
  for (const invalid of [-1, 1.01, NaN, Infinity, '0.12', undefined]) {
    assert.throws(() => setVehicleReadabilityScale(invalid), /finite and in 0\.\.1/);
    assert.equal(uniform.value, .12, 'invalid input leaves existing material state untouched');
  }
  setVehicleReadabilityScale(0);
  assert.equal(uniform.value, 0, 'diagnostic no-floor endpoint is allowed');
  setVehicleReadabilityScale(1);
  assert.equal(uniform.value, 1, 'day/reset restore updates existing uniforms exactly');
  assert.equal(material.version, materialVersion, 'no needsUpdate or material relink');
  assert.equal(material.customProgramCacheKey(), programKey);
} finally {
  setVehicleReadabilityScale(1);
  material.dispose();
}

// Real first-party fleet materials, including the factory's separately
// cloned tires, wheel dishes, sprockets and track pads, consume the same hook.
// Run real rendered-material construction, NOT the geometryReceipt adapter
// (which intentionally omits base material hooks). Canvas storage below is
// CPU-only: this verifies shader ownership, never painted pixels or WebGL.
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
      measureText: text => ({ width: text.length * 8 }),
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
const restoreCanvas = installCanvasFixture();
const vehicles = [];
const bound = [];
const roles = new Set();
const materials = new Set();
try {
  for (const [id, scale] of [['m1a1', 1], ['merkava4b', .12]]) {
    setVehicleReadabilityScale(scale);
    const visual = createTank(id, null, { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
    vehicles.push(visual);
    visual.root.traverse(object => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const entry of list) {
        if (materials.has(entry) || !entry.isMeshStandardMaterial) continue;
        materials.add(entry);
        const shader = shaderFor(entry);
        if (!shader.fragmentShader.includes('float vehFill')) continue;
        assert.strictEqual(shader.uniforms.uVehicleReadabilityScale, uniform,
          `${id}/${object.name}: armor and running-gear floors share the canonical uniform`);
        assert.equal(uniform.value, scale, `${id}: materials created at night inherit the current scale`);
        assert.ok(shader.fragmentShader.includes('vehFill *= uVehicleReadabilityScale;'));
        assert.ok(shader.fragmentShader.includes('vehFloorL *= uVehicleReadabilityScale;'));
        roles.add(entry.userData.appearanceRole);
        bound.push({ material: entry, version: entry.version, key: entry.customProgramCacheKey(), shader });
      }
    });
  }
  assert.ok(bound.length >= 12, 'real vehicle material sets, not a single fake hook');
  for (const role of ['armorPaint', 'tireRubber', 'wheelPaint', 'trackPad']) {
    assert.ok(roles.has(role), `${role}: real material callback covered`);
  }
  for (const scale of [.12, 1, .12, 1]) {
    setVehicleReadabilityScale(scale);
    for (const item of bound) {
      assert.equal(item.shader.uniforms.uVehicleReadabilityScale.value, scale);
      assert.equal(item.material.version, item.version);
      assert.equal(item.material.customProgramCacheKey(), item.key);
    }
  }
} finally {
  setVehicleReadabilityScale(1);
  for (const visual of vehicles) visual.dispose();
  restoreCanvas();
}
assert.equal(getVehicleReadabilityScale(), 1);
console.log('vehicleReadability.selftest: unchanged daylight expressions, shared current/future/gear uniforms, strict input and exact reset PASS (native shading remains separate)');
