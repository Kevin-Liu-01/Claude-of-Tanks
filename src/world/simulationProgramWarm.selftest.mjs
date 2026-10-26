// (battle-spikes-253) The world's GPU simulations submit their pass programs with no draw under a covered entry
// (engine/fullscreenProgramWarm.ts): the FFT ocean, the water ripples and the ground pressure run their passes only on
// a frame that advances time, the covered presentation updates the world at dt 0, and their eight programs linked in the
// first live frame (nav-perf's root-u room: one 353 ms task after the reveal). Each pass's material is compiled against
// the target it renders to, nothing is drawn, the previous target is restored; both entries call the world's warm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { compileFullscreenPrograms } from '../engine/fullscreenProgramWarm.ts';
import { createGroundPressureField } from './groundPressure.ts';
import { createWaterRippleField } from './waterRipples.ts';
import { createOceanField } from './oceanFft.ts';
import { buildOceanSpectrum, resolveOceanState } from './oceanSpectrum.ts';

function recordingRenderer() {
  const log = [];
  let target = null;
  return {
    log, autoClear: true,
    extensions: { has: (name) => name === 'EXT_color_buffer_float' },
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; },
    render(root) { log.push(['render', root.material?.name]); },
    compile(scene, camera) {
      assert.ok(camera.isCamera);
      const meshes = [];
      scene.traverse((object) => { if (object.isMesh) meshes.push(object); });
      assert.equal(meshes.length, 1, 'one pass a compile');
      log.push(['compile', meshes[0].material.name, target?.texture?.name ?? null]);
    },
  };
}

// the helper: each pass against its own target, the previous target back, nothing drawn; no compile, nothing submitted
{
  const renderer = recordingRenderer();
  const prior = new THREE.WebGLRenderTarget(1, 1); prior.texture.name = 'prior';
  const a = new THREE.WebGLRenderTarget(1, 1); a.texture.name = 'a';
  const b = new THREE.WebGLRenderTarget(1, 1); b.texture.name = 'b';
  const one = new THREE.ShaderMaterial(); one.name = 'one';
  const two = new THREE.ShaderMaterial(); two.name = 'two';
  renderer.setRenderTarget(prior);
  assert.equal(compileFullscreenPrograms(renderer, [{ material: one, target: a }, { material: two, target: b }]), 2);
  assert.deepEqual(renderer.log, [['compile', 'one', 'a'], ['compile', 'two', 'b']]);
  assert.equal(renderer.getRenderTarget(), prior, 'the previous target restored');
  assert.equal(compileFullscreenPrograms({ getRenderTarget: () => null, setRenderTarget() {} }, [{ material: one, target: a }]), 0,
    'a stub renderer without compile submits nothing');
  assert.equal(compileFullscreenPrograms(null, [{ material: one, target: a }]), 0);
}

// the fields: their reset and step (the ocean: reset and every transform pass) on the targets they render to
for (const [name, create] of [
  ['groundPressure', (renderer) => createGroundPressureField(renderer, { tier: 'desktop' })],
  ['waterRipples', (renderer) => createWaterRippleField(renderer, { tier: 'desktop' })],
]) {
  const renderer = recordingRenderer();
  const field = create(renderer);
  assert.ok(field, name);
  renderer.log.length = 0;
  assert.equal(field.compilePrograms(), 2);
  assert.deepEqual(renderer.log, [['compile', `${name}:reset`, `${name}.a`], ['compile', `${name}:step`, `${name}.b`]],
    `${name}: reset and step against their state targets, nothing drawn`);
  field.dispose();
  assert.equal(field.compilePrograms(), 0, `${name}: a disposed field submits nothing`);
}
{
  const renderer = recordingRenderer();
  const state = resolveOceanState('coast', { amplitude: 0.7 });
  const field = createOceanField(renderer, buildOceanSpectrum(state, 16, 1), state, { tier: 'desktop', preset: 'high' });
  assert.ok(field);
  renderer.log.length = 0;
  const submitted = field.compilePrograms();
  assert.ok(submitted >= 3, 'the reset and the transform passes');
  assert.equal(renderer.log.filter(([kind]) => kind === 'render').length, 0, 'nothing drawn');
  const compiles = renderer.log.filter(([kind]) => kind === 'compile');
  // (the targets carry two attachments: their first texture is named <target>.a)
  assert.deepEqual(compiles[0], ['compile', 'ocean:reset', 'ocean.maps0.a']);
  for (const [, material, target] of compiles.slice(1)) {
    assert.equal(target, material.endsWith(':maps') ? 'ocean.maps0.a' : 'ocean.ping1.a', `${material}: compiled against its target`);
  }
  assert.ok(compiles.at(-1)[1].endsWith(':maps'), 'the last pass writes the maps');
  field.update(1 / 60);
  assert.equal(field.grid.w, 1, 'the simulation runs as before after the warm');
  field.dispose();
}

// the wiring: the map sums the terrain's water and the tall grass's pressure; both covered entries ask the world
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const map = read('./map.ts');
assert.match(map, /warmSimulationPrograms: \(\) => \(terrain\.userData\.compileWaterPrograms\?\.\(\) \?\? 0\) \+ tallGrass\.compilePrograms\(\),/);
assert.match(read('./terrain.ts'), /group\.userData\.compileWaterPrograms = \(\): number => \(ripples\?\.compilePrograms\(\) \?\? 0\) \+ \(ocean\?\.compilePrograms\(\) \?\? 0\);/);
assert.match(read('./tallGrass.ts'), /compilePrograms: \(\) => \(pressure\?\.compilePrograms\(\) \?\? 0\) \+ \(pressureFine\?\.compilePrograms\(\) \?\? 0\),/);
const main = read('../main.ts');
const compileAt = main.indexOf('compile: async (signal?: AbortSignal) => {');
const compileBody = main.slice(compileAt, main.indexOf('forwardProgramWarm.prepareSceneSteps(', compileAt));
assert.ok(compileAt > 0 && compileBody.includes('currentWorld()?.warmSimulationPrograms?.()'), 'the network compile warms them before its strict preparation');
assert.match(read('../game/soloBattleLoadingRuntime.ts'), /trace\.simulationPrograms = getWorld\(\)\.warmSimulationPrograms\?\.\(\) \?\? 0;/, 'the solo loading warms them');
console.log('simulationProgramWarm.selftest: the GPU simulations\' pass programs compiled against their targets with no draw (ground pressure, ripples, the ocean), wired into both covered entries');
