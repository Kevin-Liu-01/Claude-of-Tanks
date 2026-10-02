import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createParticleSystem } from './particles.ts';

// 2026-10-01: the committed atlas checksums live in a generated ledger (src/fx/particleAtlases.ledger.json) that the
// browser bake (`npm run fx:textures:bake`) rewrites with the PNGs; `COT_UPDATE_LEDGER=1` rewrites it from the
// committed files. This receipt checks the committed PNGs against it.
const ledgerUrl = new URL('./particleAtlases.ledger.json', import.meta.url);
const ledger = JSON.parse(await readFile(ledgerUrl, 'utf8'));
const expected = ledger.atlases;
if (process.env.COT_UPDATE_LEDGER === '1') {
  for (const name of Object.keys(expected)) {
    const png = await readFile(new URL(`../../public/fx/particles-${name}.png`, import.meta.url));
    expected[name] = [png.readUInt32BE(16), png.readUInt32BE(20), createHash('sha256').update(png).digest('hex')];
  }
  await writeFile(ledgerUrl, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log('particleTextureAssets: ledger rewritten from the committed atlases');
}
assert.deepEqual(Object.keys(expected).sort(), ['dust', 'fire', 'flash', 'jet', 'prop', 'smoke'], 'every particle atlas has a ledger row');

for (const [name, [width, height, sha256]] of Object.entries(expected)) {
  const png = await readFile(new URL(`../../public/fx/particles-${name}.png`, import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10],
    `${name}: committed atlas is a PNG`);
  assert.equal(png.readUInt32BE(16), width, `${name}: deterministic atlas width`);
  assert.equal(png.readUInt32BE(20), height, `${name}: deterministic atlas height`);
  assert.ok(png.length > 1000, `${name}: atlas is not an empty placeholder`);
  assert.equal(createHash('sha256').update(png).digest('hex'), sha256,
    `${name}: committed atlas matches its ledger row (re-bake with npm run fx:textures:bake)`);
}

// No native Canvas/WebGL substrate is installed in the Node suite. Retain the
// actual generated pixel buffers and seeded Canvas commands; this compares the
// real generator's sync/chunk scheduling, not browser rasterization or upload.
function canvasProbe() {
  const canvas = { width: 0, height: 0, pixels: null, commands: [] };
  const record = (name) => (...args) => canvas.commands.push([name, ...args]);
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    getImageData: (_x, _y, width, height) => ({
      data: canvas.pixels?.slice() ?? new Uint8ClampedArray(width * height * 4).fill(255),
    }),
    putImageData: (image) => { canvas.pixels = image.data.slice(); },
    createRadialGradient: (...args) => {
      record('gradient')(...args);
      return { addColorStop: record('colorStop') };
    },
  };
  for (const name of ['clearRect', 'fillRect', 'save', 'restore', 'translate',
    'rotate', 'scale', 'beginPath', 'arc', 'fill']) context[name] = record(name);
  return Object.assign(canvas, { getContext: () => context });
}

function fixture() {
  const images = [];
  const systems = [];
  const priorDocument = globalThis.document;
  const priorImage = globalThis.Image;
  globalThis.document = { createElement: canvasProbe };
  globalThis.Image = class {
    constructor() { images.push(this); }
    decode() { return Promise.resolve(); }
  };
  return {
    images,
    system() {
      const system = createParticleSystem({}, { seed: 5000 });
      systems.push(system);
      return system;
    },
    async loadImages() {
      await Promise.all(images.map((image) => image.onload()));
    },
    restore() {
      for (const system of systems) {
        for (const pool of Object.values(system.pools)) {
          pool.geometry.dispose();
          pool.mesh.material.dispose();
        }
        for (const texture of textures(system)) texture.dispose();
      }
      if (priorDocument === undefined) delete globalThis.document;
      else globalThis.document = priorDocument;
      if (priorImage === undefined) delete globalThis.Image;
      else globalThis.Image = priorImage;
    },
  };
}

function textures(system) {
  return ['smoke', 'fire', 'psmoke', 'dust', 'flash', 'jet']
    .map((name) => system.pools[name].mesh.material.uniforms.uMap.value);
}

function generatedOutput(system) {
  return textures(system).map(({ image }) => ({
    width: image.width, height: image.height,
    pixels: createHash('sha256').update(image.pixels).digest('hex'),
    commands: image.commands,
  }));
}

const flushMicrotasks = async () => { for (let step = 0; step < 8; step++) await Promise.resolve(); };

{
  const f = fixture();
  try {
    const system = f.system();
    const preload = system.preloadTextures(); // Deliberately unresolved network.
    assert.equal(f.images.length, 6);
    let checkpoints = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const warm = system.warmTexturesChunked(async () => {
      if (++checkpoints === 1) await gate;
    }, { assets: 'ready-only' });
    await flushMicrotasks();
    assert.equal(checkpoints, 1, 'ready-only starts its generator without waiting for pending assets');
    assert.equal(f.images.length, 6, 'ready-only starts no extra asset requests');
    release();
    await warm;
    assert.equal(checkpoints, 69, 'the same four flipbooks and final atlas checkpoints yield');
    const before = textures(system).map((texture) => ({ texture, image: texture.image, version: texture.version }));
    await f.loadImages();
    await preload;
    await system.warmTexturesChunked(() => assert.fail('cached warm must not yield'), { assets: 'ready-only' });
    await system.warmTexturesChunked(() => assert.fail('cached default warm must not yield'));
    system.warmTextures();
    textures(system).forEach((texture, index) => {
      assert.equal(texture, before[index].texture);
      assert.equal(texture.image, before[index].image, 'late decoded assets cannot replace completed output');
      assert.equal(texture.version, before[index].version, 'cached warm does not re-upload or replace textures');
    });
    const sync = f.system();
    sync.warmTextures();
    assert.deepEqual(generatedOutput(system), generatedOutput(sync),
      'chunked fallback preserves exact seeded pixels and Canvas commands from synchronous baking');
  } finally { f.restore(); }
}

{
  const f = fixture();
  try {
    const system = f.system();
    let checkpoints = 0;
    await system.warmTexturesChunked(async () => {
      checkpoints++;
      // A synchronous compatibility caller can finish the same generator
      // while the chunked owner is suspended at its first checkpoint.
      system.warmTextures();
    }, { assets: 'ready-only' });
    assert.equal(checkpoints, 1, 'a completed shared generator cannot restart after a yield');
    assert.equal(f.images.length, 0, 'ready-only starts no image requests even without an existing preload');
    assert.ok(textures(system).every((texture) => !!texture.image.pixels));
  } finally { f.restore(); }
}

{
  const f = fixture();
  try {
    const system = f.system();
    const original = textures(system);
    const preload = system.preloadTextures();
    await f.loadImages();
    assert.equal(await preload, true);
    await system.warmTexturesChunked(() => assert.fail('decoded assets need no procedural checkpoints'),
      { assets: 'ready-only' });
    textures(system).forEach((texture, index) => {
      assert.equal(texture, original[index], 'asset installation reuses existing texture wrappers');
      assert.equal(texture.image, f.images[index], 'ready-only uses the already-decoded asset');
    });
    assert.equal(f.images.length, 6);
  } finally { f.restore(); }
}

{
  const f = fixture();
  try {
    const system = f.system();
    let completed = false;
    const warm = system.warmTexturesChunked(() => assert.fail('successful default preload must not bake'))
      .then(() => { completed = true; });
    await flushMicrotasks();
    assert.equal(f.images.length, 6, 'Studio/default path still preloads its six assets');
    assert.equal(completed, false, 'default behavior still awaits decode');
    await f.loadImages();
    await warm;
    textures(system).forEach((texture, index) => assert.equal(texture.image, f.images[index]));
  } finally { f.restore(); }
}

{
  const f = fixture();
  try {
    const system = f.system();
    const waiting = system.warmTexturesChunked(async () => {});
    let checkpoints = 0;
    const chunked = system.warmTexturesChunked(async () => {
      if (++checkpoints === 1) {
        await f.loadImages();
        await flushMicrotasks();
        assert.ok(textures(system).every((texture) => !f.images.includes(texture.image)),
          'asset arrival cannot steal ownership from an in-progress procedural bake');
      }
    }, { assets: 'ready-only' });
    await Promise.all([waiting, chunked]);
    assert.ok(textures(system).every((texture) => !!texture.image.pixels),
      'joined warm callers finish one procedural output, not mixed asset/bake ownership');
  } finally { f.restore(); }
}

for (const concurrent of [true, false]) {
  const f = fixture();
  try {
    const system = f.system();
    const schedulingError = new Error('scheduler rejected its yield');
    let rejectYield;
    const failedYield = new Promise((_, reject) => { rejectYield = reject; });
    const failed = system.warmTexturesChunked(() => failedYield, { assets: 'ready-only' });
    const rejection = assert.rejects(failed, (error) => error === schedulingError,
      'the rejecting caller retains its exact scheduling error');
    let resumeWaiter;
    let waiter;
    if (concurrent) {
      const heldYield = new Promise((resolve) => { resumeWaiter = resolve; });
      waiter = system.warmTexturesChunked(() => heldYield, { assets: 'ready-only' });
    }
    rejectYield(schedulingError);
    await rejection;
    if (concurrent) {
      resumeWaiter();
      await waiter;
    } else {
      await system.warmTexturesChunked(async () => {}, { assets: 'ready-only' });
    }
    assert.ok(textures(system).every((texture) => !!texture.image.pixels),
      `${concurrent ? 'concurrent waiter' : 'retry'} cannot report success with incomplete textures`);
    const reference = f.system();
    reference.warmTextures();
    assert.deepEqual(generatedOutput(system), generatedOutput(reference),
      `${concurrent ? 'concurrent waiter' : 'retry'} resumes the original seeded bake after scheduling rejection`);
  } finally { f.restore(); }
}

console.log('particleTextureAssets.selftest: prebuilt assets, bounded fallback, ownership and seeded parity passed');
