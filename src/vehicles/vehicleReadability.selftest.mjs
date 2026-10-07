import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { vehicleAmbientFloorHook, VEHICLE_FIELD_WEAR_GARAGE, vehicleSootSources } from './materials.ts';
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
// scale still gates both floors, the legacy safeguards (high-albedo rolloff, lit gating, dark hardware) survive, both
// floors take the form aim, the ground occlusion and the vehicle pixel tag appear once. Owner 2026-10-02 ("the camo and
// colours on the tank look so weird and not crisp"): the deep-shade floor lifts received light, so a camouflage keeps
// its light/dark contrast instead of every texel converging on one luminance.
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
  'vehFloorL *= mix( 0.30, 1.0, smoothstep( 0.025, 0.09, vehLuma ) );']) {
  assert.ok(frag.includes(kept), `legacy readability safeguard kept: ${kept}`);
}
// the deep-shade floor: the map's last mip is the paint reference, each texel lands in proportion to its own paint and
// the lift runs along the albedo; the old one-luminance hue lift is gone
assert.match(frag, /#ifdef USE_MAP\n\t\tvehRefL = max\( dot\( textureLod\( map, vMapUv, 16\.0 \)\.rgb \* diffuse, /, 'a painted map references its mean paint');
once('float vehTargetL = vehFloorL * vehLuma / vehRefL;', 'each texel lands in proportion to its paint');
once('reflectedLight.indirectDiffuse += material.diffuseColor * ( ( vehTargetL - vehOutL ) / vehLuma );', 'the lift runs along the albedo');
assert.ok(!frag.includes('vehTint'), 'no one-luminance hue lift');
// the same law on the CPU: desert dark / base / pale tones (linear luma) under the 0.21 canopy floor
const deepShade = (texelL, meanL, floorL = 0.21) => floorL * texelL / meanL;
const desert = [0.11, 0.27, 0.41].map(l => deepShade(l, 0.25));
assert.ok(desert[2] / desert[0] > 3.5, `the pale tone stays ${(desert[2] / desert[0]).toFixed(1)}x the dark tone (it was 1x)`);
assert.ok(Math.abs(deepShade(0.25, 0.25) - 0.21) < 1e-9, 'the mean paint lands where every texel used to');
once('float vehHeight = dot( vehWorldPos - uVehGround.xyz, uVehUp );', 'ground occlusion measures height along the vehicle axis');
assert.match(frag, /reflectedLight\.indirectDiffuse \*= mix\( 0\.\d+, 1\.0,\s*smoothstep\( 0\.\d+, 1\.\d+, vehHeight \) \);/, 'indirect light falls toward the ground');
assert.ok(!frag.includes('uVehicleShadeModel'), 'one shade model, no A/B branch');
const unbound = before.uniforms;
assert.equal(unbound.uVehGround.value.y, -1e5, 'tooling paths with no vehicle root keep a far-below origin (no darkening)');
assert.deepEqual(unbound.uVehUp.value.toArray(), [0, 1, 0]);
// 2026-10-07 field wear (tank-accessories lane round 3; materials.ts VEHICLE_FIELD_WEAR_GARAGE): the dust, mud and soot
// are one switched block that colours the paint after the normal and before any light reads it, the pattern rides each
// mesh's own vertex frame, and the strength rides the ground reference's w (0 without a vehicle root).
once('#ifdef COT_FIELD_WEAR\nuniform vec4 uVehSoot[ 8 ];\n', 'the wear header is declared once, behind its switch');
once('if ( uVehGround.w > 0.0 ) {', 'one wear block, gated by the reference strength');
{
  const at = frag.indexOf('if ( uVehGround.w > 0.0 ) {');
  assert.ok(frag.indexOf('#include <normal_fragment_maps>') < at && at < frag.indexOf('#include <lights_physical_fragment>'),
    'the wear colours the paint after the normal and before any light reads it');
  assert.equal(before.vertexShader.split('vCotWearPos = transformed;').length, 2, 'the wear pattern rides the mesh frame');
  assert.match(before.vertexShader, /#ifdef COT_FIELD_WEAR\n\tvCotWearPos = transformed;\n#endif/, 'behind the same switch');
  assert.equal(unbound.uVehSoot.value.length, 8, 'four soot sources, two vectors each');
  assert.equal(unbound.uVehGround.value.w, 0, 'no field wear without a vehicle root');
}

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
  // field wear on the real fleet: the switch per role, battle and Garage strength on the per-draw reference, and the
  // smoke-discharger banks' soot placed with the draw
  {
    const modeOf = new Map();
    for (const item of bound) {
      const role = item.material.userData.appearanceRole;
      if (!modeOf.has(role)) modeOf.set(role, new Set());
      modeOf.get(role).add(item.material.defines?.COT_FIELD_WEAR ?? 0);
    }
    assert.deepEqual([...modeOf.get('armorPaint')], [1], 'camouflaged armour wears the bodywork dust and mud');
    assert.ok(modeOf.get('wheelPaint').has(2) && modeOf.get('tireRubber').has(2), 'wheels and tyres wear the running-gear wear');
    const visual = vehicles[0], probe = groundProbe.get('m1a1');
    const g = probe.shader.uniforms.uVehGround.value, soot = probe.shader.uniforms.uVehSoot.value;
    const draw = () => probe.object.onBeforeRender({ info: { render: { frame: 7 } } }, null, null, probe.object.geometry, probe.object.material, null);
    const done = () => probe.object.onAfterRender(null, null, null, probe.object.geometry, probe.object.material, null);
    draw();
    assert.equal(g.w, 1, 'a battle build wears the full field wear');
    const sources = vehicleSootSources(visual.root);
    assert.ok(sources.length >= 2 && sources.every((source) => source.owner !== visual.root),
      `m1a1: its discharger banks publish soot (${sources.length})`);
    // three's Object3D.copy deep-copies userData through JSON (the thumbnail masks clone the root): the live sources stay
    // out of it, only the strength number rides there
    assert.ok(Object.values(visual.root.userData).every((value) => !value?.isObject3D && !value?.sources),
      'the soot sources live beside the root, not in its userData');
    const mouth = sources[0].mouth.clone().applyMatrix4(sources[0].owner.matrixWorld);
    assert.ok(Math.hypot(soot[0].x - mouth.x, soot[0].y - mouth.y, soot[0].z - mouth.z) < 1e-4 && soot[0].w > 0,
      'the first bank is placed at its mouth in the world');
    done();
    visual.resetForGaragePresentation();
    draw();
    assert.equal(g.w, VEHICLE_FIELD_WEAR_GARAGE, 'the Garage showroom wears it lighter');
    done();
    visual.prepareForSimulation();
    draw();
    assert.equal(g.w, 1, 'and a showroom visual lent to battle wears it in full');
    done();
    assert.equal(g.w, 0, 'after the draw nothing else wears it');
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
console.log('vehicleReadability.selftest: form-fill floors, ground occlusion, field wear (switch per role, battle/Garage strength, discharger soot), kept safeguards, shared current/future/gear uniforms, per-draw ground reference, strict input and exact reset PASS');
