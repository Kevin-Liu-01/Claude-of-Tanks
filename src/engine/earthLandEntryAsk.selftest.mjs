// earthLandEntryAsk.selftest.mjs — a battle entered on the Moon binds the Earth's land mask whatever backoff a Studio drag
// raised (2026-11-02 audit R6, round 4 F2 review). Copyright © 2026 Kevin B. Liu.
//
// The Moon's land mask (earthLandAccess.ts, chunk earthLandMask.ts) is an app/lazyChunk.ts chunk (round 3 A4): a failure
// is asked again at once after one failure, then past a backoff that doubles to a minute, never offline. On the Moon the
// Studio applies the sky once per sun-dial or slider move, and each apply asks the mask while it has not loaded
// (sky.ts earthLandTexture), so a drag through an outage raises that backoff to the minute's cap. A Moon battle entered
// inside it got the kept failure: its sky bound the one-texel placeholder, an all-sea Earth, and no battle sky applies
// again, so the Earth had no continents for the whole battle. Now a battle's entry (battleAtmosphereAccess.ts prepare,
// `{ entry: true }`) whose sky draws the Earth asks the mask at once whatever the backoff (never offline) and waits for it
// before the runtime applies the sky, so the sky binds the raster as it applies.
//
// The Studio's applies and the battle's run sky.ts's own configureSkyUniforms through its exported horizon sampler (the
// same uniform setup the dome's applyPreset runs), on a stand-in renderer; the battle's apply comes from the real battle
// atmosphere runtime the access loads. A chunk "fails" the way a browser's import does when the network drops: its
// resolve throws. The light model's and the cloudscapes' chunks arrive as stand-ins (battleAtmosphereEntryAsk drives them).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

let clock = 1000;
performance.now = () => clock; // the lazy chunks' default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const MASK = './earthLandMask.ts';
const STANDINS = new Map([
  ['./lightModel.ts', ['/src/engine/lightModelCore.ts', 'export function groundedLightModel() { return () => null; }']],
  ['./cloudscapeLayer.ts', ['/src/engine/cloudPresets.ts', 'export function cloudscapeLayer() { return (legacy) => legacy; }']],
]);
let networkUp = false;
let asks = 0;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === MASK && (context.parentURL ?? '').endsWith('/src/engine/earthLandAccess.ts')) {
      asks += 1;
      if (!networkUp) throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
    }
    const standin = STANDINS.get(specifier);
    if (standin && (context.parentURL ?? '').endsWith(standin[0])) {
      return { url: `data:text/javascript,${encodeURIComponent(standin[1])}`, shortCircuit: true };
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
const problems = [];
try {
  const { DEFAULT_SKY_PRESET, sampleHorizonColor } = await import('./sky.ts');
  const { loadEarthLand, loadedEarthLandTexture } = await import('./earthLandAccess.ts');
  const { getMapConfig } = await import('../world/maps/index.ts');
  const { createBattleAtmosphereAccess } = await import('./battleAtmosphereAccess.ts');
  const moon = { ...DEFAULT_SKY_PRESET, ...getMapConfig('moon').sky };
  assert.ok(moon.earth > 0.5, 'the Moon\'s sky draws the Earth');
  const gpu = renderer();
  let bearing = 0;
  /** One sky apply: a new sun bearing, so a new sample of the sky (its uniforms set up as the dome's). */
  const applySky = (preset) => {
    bearing += 0.05;
    sampleHorizonColor(gpu, new THREE.Vector3(Math.cos(bearing), 0.4, Math.sin(bearing)).normalize(), preset);
  };
  // the battle: the real battle atmosphere runtime applies the map's authored sky through main.ts's applyPreset port
  let authored = getMapConfig('moon').sky;
  const applied = [];
  const access = createBattleAtmosphereAccess(() => ({
    getAuthoredPreset: () => authored,
    applyPreset: (preset) => {
      applied.push(loadedEarthLandTexture() !== null); // what sky.ts earthLandTexture binds at once: the raster, or the sea
      applySky({ ...DEFAULT_SKY_PRESET, ...preset });
    },
  }));
  const ENTRY = { entry: true };

  // the Moon's world build asks the mask in an outage, and it fails (map.ts createMapAsync: the Earth a sea until it lands)
  await loadEarthLand().catch(() => undefined);
  assert.equal(asks, 1);
  // a Studio drag on the Moon through the outage: 600 sun-dial moves, one per 300 ms (three minutes); each apply asks
  // the mask as the policy allows
  for (let i = 0; i < 600; i++) { clock += 300; applySky(moon); await settle(); }
  const dragAsks = asks;
  assert.ok(dragAsks >= 5 && dragAsks <= 9, `the drag asks at the backoff points (${dragAsks} asks)`);

  // an entry on a map whose sky draws no Earth never asks the mask
  authored = getMapConfig('verdant').sky;
  await access.prepare(1, 'verdant', ['day'], ENTRY);
  assert.equal(asks, dragAsks, 'a sky without the Earth asks no mask');
  // offline, a Moon entry asks nothing, and a mask that cannot load never fails the entry (the sky keeps the sea)
  authored = getMapConfig('moon').sky;
  onLine = false;
  await access.prepare(2, 'moon', ['day'], ENTRY);
  assert.equal(asks, dragAsks, 'offline: no ask');
  assert.equal(applied.at(-1), false, 'the offline entry\'s sky binds the placeholder');
  onLine = true;

  // the network is back; one second later (inside the minute's backoff the drag raised) a Moon battle is entered
  networkUp = true;
  clock += 1000;
  const before = asks;
  await access.prepare(3, 'moon', ['day'], ENTRY);
  await settle();
  if (applied.at(-1) !== true) {
    problems.push(`a Moon battle entered inside the backoff a Studio drag raised drew the Earth as a sea (${asks - before} mask asks; its sky bound the placeholder and no battle sky applies again)`);
  } else {
    assert.equal(asks - before, 1, 'the entry asked the mask once, at once');
    assert.ok(loadedEarthLandTexture(), 'loaded, the raster is synchronous');
  }
} finally {
  hook.deregister();
}
assert.deepEqual(problems, [], `the Moon's land mask at a battle entry:\n  ${problems.join('\n  ')}`);
console.log('earthLandEntryAsk.selftest: OK (a Moon battle entry asks the Earth\'s land mask at once whatever the backoff a Studio drag raised, and its sky binds the raster as it applies)');
