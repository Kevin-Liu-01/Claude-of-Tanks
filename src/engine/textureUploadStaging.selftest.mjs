// textureUploadStaging.selftest — (2026-10-26, the room-stalls lane) the textures a scene's draws bind are staged one at
// a time under a frame budget before its first draw: the materials' maps, the compiled programs' sampler uniforms and a
// ShaderMaterial's own, each texture once, never a render target's attachments; and the room's opening warm stages them
// before its cohort draws (main.ts openingEffects).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DataTexture, DepthTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, Texture, WebGLRenderTarget,
} from 'three';
import { collectDrawnTextures, stageTextureUploads } from './textureUploadStaging.ts';

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
const staged = opening.indexOf('await stageTextureUploads(renderer, [scene], createFrameBudgetYielder(8), { signal })');
const cohorts = opening.indexOf('createDeploymentForwardWarmBatches({');
assert.ok(staged > 0 && cohorts > staged, 'the opening warm stages the textures before the cohorts draw');
assert.ok(opening.includes('return { ...timing, textureStaging, deploymentForward };'), 'the opening warm reports the stage');

console.log('textureUploadStaging.selftest: the maps, compiled sampler uniforms and ShaderMaterial uniforms, each once, no attachments; one upload a budget check; a failing upload left to its draw; the room opening stages before its cohorts');
