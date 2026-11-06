// earthLandReask.selftest.mjs — the Moon's land mask chunk is asked again under the one lazy-chunk policy, never per
// sky apply (2026-11-02 audit R6, round 3 A4 / U35). Copyright © 2026 Kevin B. Liu.
//
// A sky that draws the Earth (the Moon's) binds its land mask through sky.ts earthLandTexture, which asks
// earthLandAccess.ts loadEarthLand while the module has not loaded. The world build loads it first, but a failed transfer
// lets the Moon build with the placeholder (map.ts createMapAsync), and the Studio then applies the sky once per sun-dial
// or slider move (studioLightRuntime.ts apply: a new plan key per move -> main.ts applySky -> sky.applyPreset ->
// configureSkyUniforms). The mask's memo was cleared on a failure, so every apply asked the chunk again at once: no
// backoff, offline too, and a removed deployment's 404 on every move. Now it is an app/lazyChunk.ts chunk: asked again at
// once after one failure, then past the backoff (2, 4, 8 ... s), never offline, and at once when the browser is back.
//
// The applies run sky.ts's own configureSkyUniforms through its exported horizon sampler (the same uniform setup the
// dome's applyPreset runs; each new sun direction is a new sample), on a stand-in renderer. A chunk "fails" the way a
// browser's import does when the network drops: its resolve throws.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

let clock = 1000;
performance.now = () => clock; // the lazy chunk's default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const MASK = './earthLandMask.ts';
let networkUp = false;
let asks = 0;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === MASK && (context.parentURL ?? '').endsWith('/src/engine/earthLandAccess.ts')) {
      asks += 1;
      if (!networkUp) throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
    }
    return next(specifier, context);
  },
});

/** A renderer stand-in: what the horizon sampler's render and readback touch (a mid-grey sky). */
function renderer() {
  let bound = { target: null, face: 0, mip: 0 };
  return {
    info: {}, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace, xr: { isPresenting: false },
    getContext: () => ({ isContextLost: () => false }),
    getRenderTarget: () => bound.target, getActiveCubeFace: () => bound.face, getActiveMipmapLevel: () => bound.mip,
    setRenderTarget(target, face = 0, mip = 0) { bound = { target, face, mip }; },
    render() {},
    readRenderTargetPixels(_target, _x, _y, _width, _height, row) {
      for (let index = 0; index < row.length; index += 4) row.set([60, 80, 100, 255], index);
    },
  };
}

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
try {
  const { DEFAULT_SKY_PRESET, sampleHorizonColor } = await import('./sky.ts');
  const { loadedEarthLandTexture } = await import('./earthLandAccess.ts');
  const { getMapConfig } = await import('../world/maps/index.ts');
  const moon = { ...DEFAULT_SKY_PRESET, ...getMapConfig('moon').sky };
  assert.ok(moon.earth > 0.5, 'the Moon\'s sky draws the Earth');
  const gpu = renderer();
  let bearing = 0;
  /** One sun-dial move: a new sun bearing, so a new sample of the Moon's sky (its uniforms set up as the dome's). */
  const apply = async (moves = 1) => {
    for (let i = 0; i < moves; i++) {
      bearing += 0.05;
      sampleHorizonColor(gpu, new THREE.Vector3(Math.cos(bearing), 0.4, Math.sin(bearing)).normalize(), moon);
      await settle();
    }
  };

  // the world build's ask failed (the Moon built with the placeholder): the first apply asks again, at once
  await apply();
  assert.equal(asks, 1);
  await apply();
  assert.equal(asks, 2, 'asked again at once after one failure');

  // 1. a sun-dial drag inside the backoff: no apply asks
  await apply(40);
  assert.equal(asks, 2, `forty dial applies inside the backoff ask nothing (${asks} asks: the memo cleared on failure was `
    + 'asked again by every apply)');

  // 2. offline: no apply asks, however long since the last failure
  onLine = false;
  clock += 60_000;
  await apply(20);
  assert.equal(asks, 2, `no ask while the browser is offline (${asks} asks)`);

  // 3. back online past the backoff: one ask per backoff window, then the mask loads and nothing asks again
  onLine = true;
  await apply();
  assert.equal(asks, 3, 'online and past the backoff: asked again');
  await apply(10);
  assert.equal(asks, 3, 'inside the next backoff (4 s): no ask');
  networkUp = true;
  clock += 4000;
  await apply();
  assert.equal(asks, 4, 'past it: asked again, and the mask loads');
  assert.ok(loadedEarthLandTexture(), 'loaded, the raster is synchronous');
  await apply(10);
  assert.equal(asks, 4, 'a loaded mask is never asked again');
} finally {
  hook.deregister();
}
console.log('earthLandReask.selftest: OK (the Moon\'s land mask is asked again under the lazy-chunk policy, never per sky apply)');
