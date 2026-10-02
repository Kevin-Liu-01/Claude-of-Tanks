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
// Owner 2026-10-02 ("shadows on tanks make them look a lil flat"): the floors keep the shade readable but are aimed by
// each plate's WORLD orientation as well as the lens, and the indirect light falls toward the ground along the
// vehicle's own axis. This replaces the frozen shader fingerprint with the invariants that matter: the readability
// scale still gates both floors, the legacy safeguards (high-albedo rolloff, lit gating, deep-shade hue tint, dark
// hardware) survive, both floors take the form aim, the ground occlusion and the vehicle pixel tag appear once.
const additions = [
  'uniform float uVehicleReadabilityScale;\n',
  '\t\tvehFill *= uVehicleReadabilityScale;\n',
  '\t\tvehFloorL *= uVehicleReadabilityScale;\n',
];
const wheelBranch = /\t#ifdef COT_WHEEL_PAINT_READABILITY\n[\s\S]*?\t#else\n/;
assert.ok(wheelBranch.test(before.fragmentShader));
const frag = before.fragmentShader;
for (const addition of additions) assert.equal(frag.split(addition).length, 2, 'each required uniform application appears exactly once');
const once = (needle, label) => assert.equal(frag.split(needle).length, 2, label);
once('uniform vec4 uVehGround;\n', 'the ground reference is declared once');
once('uniform vec3 uVehUp;\n', 'the ground axis is declared once');
once('float vehAim = mix( saturate( vehForm ), vehFacing, ', 'the floors aim by world orientation plus a lens share');
assert.match(frag, /float vehForm = 0\.\d+ \+ 0\.\d+ \* smoothstep\( -0\.7, 0\.85, vehWN\.y \);/, 'sky-facing plates lift most');
assert.match(frag, /vehForm \+= 0\.\d+ \* saturate\( dot\( vehWN\.xz \/ vehNH, uCotBounceSun\.xz \/ vehSunH \) \) \* vehNH;/, 'faces turned to the sun bearing lift a little');
assert.match(frag, /0\.550 \* \( 0\.400 \+ 0\.600 \* vehAim \)/, 'the indirect floor takes the form aim');
assert.match(frag, /\* \( 0\.40 \+ 0\.60 \* vehAim \+ 0\.45 \* vehRim \* vehShade \);/, 'the deep-shade floor takes the form aim');
for (const kept of ['vehFill = min( vehFill, 0.30 / vehLuma );', 'vehFill *= mix( 1.0, 0.12, smoothstep( 0.10, 0.55, vehIrrad ) );',
  'reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, material.diffuseColor * vehFill );',
  'vehFloorL *= mix( 0.30, 1.0, smoothstep( 0.025, 0.09, vehLuma ) );', 'vehTint = mix( vec3( 1.0 ), vehTint, 0.92 );']) {
  assert.ok(frag.includes(kept), `legacy readability safeguard kept: ${kept}`);
}
once('float vehHeight = dot( vehWorldPos - uVehGround.xyz, uVehUp );', 'ground occlusion measures height along the vehicle axis');
assert.match(frag, /reflectedLight\.indirectDiffuse \*= mix\( 0\.\d+, 1\.0,\s*smoothstep\( 0\.\d+, 1\.\d+, vehHeight \) \);/, 'indirect light falls toward the ground');
assert.ok(!frag.includes('uVehicleShadeModel'), 'one shade model, no A/B branch');
const unbound = before.uniforms;
assert.equal(unbound.uVehGround.value.y, -1e5, 'tooling paths with no vehicle root keep a far-below origin (no darkening)');
assert.deepEqual(unbound.uVehUp.value.toArray(), [0, 1, 0]);

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
const grounds = new Set(), groundProbe = new Map();
const roles = new Set();
const materials = new Set();
let csmCallbacks = 0;
const csmContext = {
  setupShadowMaterial(entry, hook) {
    entry.defines = { ...entry.defines, USE_CSM: 1 };
    entry.onBeforeCompile = shader => {
      csmCallbacks++;
      shader.uniforms.csmTestWitness = { value: 1 };
      hook?.(shader);
    };
  },
  releaseShadowMaterial() {},
};
try {
  for (const [id, scale] of [['m1a1', 1], ['merkava4b', .12]]) {
    setVehicleReadabilityScale(scale);
    const visual = createTank(id, id === 'merkava4b' ? csmContext : null,
      { proceduralOnly: true, quality: 'low', geometryQuality: 'high' });
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
        const wheelPaint = entry.userData.appearanceRole === 'wheelPaint';
        if (entry.defines?.COT_WHEEL_PAINT_READABILITY) {
          assert.ok(wheelPaint, `${id}/${object.name}: fixed-role clones retain ordinary gear shading`);
        }
        if (object.name.startsWith('gearRoadWheelDiscs')) {
          assert.equal(entry.defines.COT_WHEEL_PAINT_READABILITY, 1,
            `${id}/${object.name}: canonical painted road-wheel stock selects additive readability`);
        }
        if (id === 'merkava4b' && (entry.defines?.COT_WHEEL_PAINT_READABILITY || object.name === 'hull')) {
          assert.equal(entry.defines.USE_CSM, 1, `${object.name}: wheel role must preserve shadow defines`);
          assert.equal(shader.uniforms.csmTestWitness.value, 1, 'readability chains through shadow callback');
        }
        roles.add(entry.userData.appearanceRole);
        grounds.add(shader.uniforms.uVehGround);
        if (!groundProbe.has(id)) groundProbe.set(id, { object, root: visual.root, shader });
        bound.push({ material: entry, version: entry.version, key: entry.customProgramCacheKey(), shader });
      }
    });
  }
  assert.ok(bound.length >= 12, 'real vehicle material sets, not a single fake hook');
  // owner 2026-10-02: every floored material reads the one ground reference; each vehicle mesh points it at its own
  // root just before it draws and releases it after (tankFactoryCore installVehicleGroundReference)
  assert.equal(grounds.size, 1, 'every floored vehicle material reads the one ground reference');
  for (const [id, probe] of groundProbe) {
    const g = probe.shader.uniforms.uVehGround.value, up = probe.shader.uniforms.uVehUp.value;
    probe.root.position.set(12, 3, -7);
    probe.root.rotation.set(0, 0.6, 0.2);
    probe.root.updateMatrixWorld(true);
    probe.object.onBeforeRender(null, null, null, probe.object.geometry, probe.object.material, null);
    assert.deepEqual([g.x, g.y, g.z].map(v => +v.toFixed(6)), [12, 3, -7], `${id}: before a draw the reference is this tank's root origin`);
    const e = probe.root.matrixWorld.elements, n = Math.hypot(e[4], e[5], e[6]);
    assert.deepEqual([up.x, up.y, up.z].map(v => +v.toFixed(6)), [e[4] / n, e[5] / n, e[6] / n].map(v => +v.toFixed(6)), `${id}: and its up axis`);
    probe.object.onAfterRender(null, null, null, probe.object.geometry, probe.object.material, null);
    assert.equal(g.y, -1e5, `${id}: after the draw the reference idles far below (nothing else darkens)`);
  }
  assert.ok(csmCallbacks >= 6, 'shadow-hook material path exercised as well as direct tooling path');
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
console.log('vehicleReadability.selftest: form-fill floors, ground occlusion, kept safeguards, shared current/future/gear uniforms, per-draw ground reference, strict input and exact reset PASS');
