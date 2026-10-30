// textureUploadStaging.selftest — (2026-10-26, the room-stalls lane) the textures a scene's draws bind are staged one at
// a time under a frame budget before its first draw: the materials' maps, the compiled programs' sampler uniforms and a
// ShaderMaterial's own, each texture once, never a render target's attachments; and the room's opening warm stages them
// before its cohort draws (main.ts openingEffects).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DataTexture, DepthTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, Texture, WebGLRenderTarget,
} from 'three';
import { collectDrawnTextures, stageTextureUploads, textureUploadBytes, waitForGpuCatchUp } from './textureUploadStaging.ts';

const geometry = new PlaneGeometry(1, 1);
const albedo = new Texture(), normal = new Texture(), shared = new Texture(), splat = new DataTexture(new Uint8Array(4), 1, 1);
const lut = new Texture(), arrayA = new Texture(), arrayB = new Texture();
const target = new WebGLRenderTarget(4, 4);
target.depthTexture = new DepthTexture(4, 4);

const terrain = new MeshStandardMaterial({ map: albedo, normalMap: normal });
const prop = new MeshStandardMaterial({ map: shared });
const other = new MeshStandardMaterial({ map: shared });
const custom = new ShaderMaterial({ uniforms: { uLut: { value: lut }, uLayers: { value: [arrayA, arrayB] }, uScale: { value: 2 } } });
const reflective = new MeshStandardMaterial({ map: target.texture, aoMap: target.depthTexture });

const root = new Group();
root.add(new Mesh(geometry, terrain), new Mesh(geometry, [prop, other]), new Mesh(geometry, custom), new Mesh(geometry, reflective));
const nested = new Group();
nested.add(new Mesh(geometry, prop));
root.add(nested);

// the compiled programs' uniforms (three's renderer.properties after onBeforeCompile): the terrain's splat sampler lives
// only there, as a kit's terrain, water and foliage samplers do
const compiled = new Map([[terrain, { uniforms: { map: { value: albedo }, uSplat: { value: splat }, uTint: { value: [1, 1, 1] } } }]]);
const initialized = [];
const renderer = {
  initTexture(texture) { initialized.push(texture); },
  properties: { get: (object) => compiled.get(object) },
};

const found = collectDrawnTextures(renderer, [root, null]);
assert.deepEqual(new Set(found), new Set([albedo, normal, splat, shared, lut, arrayA, arrayB]),
  'the maps, the compiled sampler uniforms and a ShaderMaterial\'s uniforms, each once; no render-target or depth texture');

// staged one at a time, a budget check after each, every texture handed to initTexture once
let yields = 0, clock = 0;
const result = await stageTextureUploads(renderer, [root], async () => { yields++; }, { now: () => (clock += 3) });
assert.equal(result.textures, 7);
assert.equal(initialized.length, 7, 'every texture is staged');
assert.equal(new Set(initialized).size, 7, 'each texture once');
assert.equal(yields, 7, 'the budget is asked after every upload');
assert.ok(result.maxMs >= 0 && result.totalMs >= result.maxMs, 'the longest upload and the stage\'s total');

// an upload that throws is left to its first draw; the stage goes on
const failing = { initTexture(texture) { if (texture === normal) throw new Error('lost'); initialized.push(texture); }, properties: renderer.properties };
initialized.length = 0;
const partial = await stageTextureUploads(failing, [root], async () => {});
assert.equal(partial.textures, 7);
assert.equal(initialized.length, 6, 'the others are still staged');

// an aborted entry stops staging
const abort = new AbortController();
abort.abort();
await assert.rejects(stageTextureUploads(renderer, [root], async () => {}, { signal: abort.signal }), { name: 'AbortError' });

// a renderer without compiled-material state (a fake, a lost context) stages the materials' own textures
assert.equal(collectDrawnTextures({ initTexture() {} }, [root]).has(splat), false);
assert.equal(collectDrawnTextures({ initTexture() {} }, [root]).has(albedo), true);

// the room's opening warm stages the battlefield's textures before its cohort draws, and reports the stage
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const opening = main.slice(main.indexOf('openingEffects: async'), main.indexOf('shotCards:', main.indexOf('openingEffects: async')));
const staged = opening.indexOf('await stageTextureUploads(renderer, [scene], createFrameBudgetYielder(8), { signal, catchUp })');
const cohorts = opening.indexOf('createDeploymentForwardWarmBatches({');
assert.ok(staged > 0 && cohorts > staged, 'the opening warm stages the textures before the cohorts draw');
// (core-two-drivers-265: the covered pacing went with the solo sim Worker that asked for it; the warm is GPU-paced)
assert.ok(opening.includes('return { ...timing, textureStaging, deploymentForward };'), 'the opening warm reports the stage');
// (a room's opening warm, the only caller since the solo sim Worker's sortie went: every room stages, and paces by the GPU)
assert.ok(/const textureStaging = await stageTextureUploads\(/.test(opening), 'the room\'s warm stages the textures');
const loop = opening.slice(cohorts, opening.indexOf('const deploymentForward', cohorts));
assert.ok(loop.includes('catchUpFrames += await waitForGpuCatchUp(catchUp);'), 'each cohort draw lets the GPU catch up before the next (a room)');

// (the room A/B) a large upload waits for the GPU to finish what was issued before it; a small one does not wait
{
  const big = new DataTexture(new Uint8Array(1 << 20), 512, 512), small = new DataTexture(new Uint8Array(4096), 32, 32);
  assert.equal(textureUploadBytes(big), 1 << 20);
  assert.equal(textureUploadBytes(new Texture({ width: 1024, height: 512 })), 1024 * 512 * 4, 'an image: four bytes a texel');
  assert.equal(textureUploadBytes(new Texture()), 0);
  const scene = new Group();
  scene.add(new Mesh(geometry, new MeshStandardMaterial({ map: big })), new Mesh(geometry, new MeshStandardMaterial({ map: small })));
  const gates = [];
  const createGate = () => {
    const gate = { calls: 0, disposed: false, caughtUp() { this.calls += 1; return this.calls > 3; }, beginDrain() {}, dispose() { this.disposed = true; } };
    gates.push(gate);
    return gate;
  };
  let frames = 0;
  const order = [];
  const uploads = { initTexture(texture) { order.push(texture === big ? 'big' : 'small'); }, properties: { get: () => undefined } };
  const result = await stageTextureUploads(uploads, [scene], async () => {},
    { catchUp: { gl: {}, waitFrame: async () => { frames += 1; }, createGate } });
  assert.equal(gates.length, 1, 'only the large texture waits');
  assert.equal(frames, 3, 'until its fence signalled');
  assert.equal(result.catchUpFrames, 3);
  assert.ok(gates.every((gate) => gate.disposed), 'every gate is disposed');
  assert.deepEqual(order.sort(), ['big', 'small']);
  // the wait is bounded: a fence that never signals costs at most maxWaitFrames
  const stuck = await waitForGpuCatchUp({ gl: {}, waitFrame: async () => {}, maxWaitFrames: 5,
    createGate: () => ({ caughtUp: () => false, beginDrain() {}, dispose() {} }) });
  assert.equal(stuck, 5);
  // a context without fences answers caught up at once (gpuCatchUp.ts)
  assert.equal(await waitForGpuCatchUp({ gl: { isContextLost: () => false }, waitFrame: async () => assert.fail('no fences: no wait') }), 0);
}

console.log('textureUploadStaging.selftest: the maps, compiled sampler uniforms and ShaderMaterial uniforms, each once, no attachments; one upload a budget check; a failing upload left to its draw; the room opening stages before its cohorts; a large upload and each cohort wait for the GPU, bounded');
