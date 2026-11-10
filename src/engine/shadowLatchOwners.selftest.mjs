import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLighting } from './lighting.ts';
import { GarageRestoreAbandonedError, restoreGarageGpuPipeline } from './garageGpuWarmRuntime.ts';

// 2026-11-02 audit R4 (shadow refresh latches): an abandoned Garage restore still set the static-presentation latch in
// its finally, after the next phase had started, freezing every cascade on any frame path that did not re-assert it
// (the 2026-10-08 frozen-cascade incident, patched by a per-frame re-assert in mainFrameRuntime.ts). And
// farCascadeDormant meant two things: a perf latch (the far bands sleep) and "the presentation is enclosed" (the light
// model, scene.userData.lightEnclosed, the enclosure listeners). Now the restore gives the latch back only while it is
// still current, and the enclosure is its own state.

{
  // the abandoned restore leaves the latch to the phase that replaced it
  const writes = [];
  let current = true;
  await assert.rejects(restoreGarageGpuPipeline({
    renderer: {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    lighting: {
      setStaticPresentationDormant(value) { writes.push(value); },
      update() {},
      async primeShadowMaps(_renderer, _scene, _camera, options) { current = false; await options.yieldBeforeCascade(0); return [1]; },
    },
    forwardPrograms: { *initializeSteps() {}, *linkerBreathingSlices() {}, compile() {} },
    post: { render() { assert.fail('an abandoned restore renders no settle frame'); } },
    simDt: 1 / 60, resourcesReleased: false, programsNeedWarm: false,
    isCurrent: () => current,
    createYielder: () => async () => {},
  }), (error) => error instanceof GarageRestoreAbandonedError);
  assert.deepEqual(writes, [false], 'released at the start, never frozen again by the abandoned restore');
  // a current restore still hands the settled Garage its static latch
  const settled = [];
  await restoreGarageGpuPipeline({
    renderer: {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    lighting: { setStaticPresentationDormant(value) { settled.push(value); }, update() {}, async primeShadowMaps() { return [1]; } },
    forwardPrograms: { *initializeSteps() {}, *linkerBreathingSlices() {}, compile() {} },
    post: { render() {} },
    simDt: 1 / 60, resourcesReleased: false, programsNeedWarm: false,
    isCurrent: () => true,
    createYielder: () => async () => {},
  });
  assert.deepEqual(settled, [false, true]);
}

{
  // the enclosure and the far-cascade sleep are two states; the public enclosure switch moves both
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
  try {
    const telemetry = () => lighting.getShadowTelemetry();
    assert.equal(telemetry().enclosedPresentation, false);
    lighting.setEnclosedPresentation(true);
    assert.equal(telemetry().enclosedPresentation, true, 'the enclosure has its own state');
    assert.equal(telemetry().farCascadeDormancyRequested, true, 'and the far bands sleep inside it (the perf policy)');
    lighting.setFarCascadeDormant(false);
    assert.equal(telemetry().enclosedPresentation, false, 'the older name is the same switch');
    assert.equal(telemetry().farCascadeDormancyRequested, false);
    const source = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
    const rig = source.slice(source.indexOf('function applyRig(opts: SunPreset): void {'));
    assert.match(rig, /const physical = physicalRig && !enclosedPresentation/, 'the light model reads the enclosure');
    assert.doesNotMatch(rig.slice(0, rig.indexOf('\n  }\n')), /farCascadeDormant/, 'never the far-cascade sleep');
  } finally { lighting.csm.remove(); lighting.csm.dispose(); }
}

console.log('shadowLatchOwners selftest: an abandoned Garage restore never re-freezes the cascades; enclosure apart from the sleep');
