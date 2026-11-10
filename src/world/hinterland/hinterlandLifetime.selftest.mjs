// hinterlandLifetime.selftest.mjs — (2026-11-02 audit R1) the Hinterland source's life, driven through its real prefetch
// (prefetch.ts startHinterlandBuild) with a worker port the test answers and the real pipeline's wire:
// 1. a world released before the worker answers gets nothing attached (before: the late attach built the land into the
//    released world's root, and nothing ever stopped the source of a completed build);
// 2. the answer that arrives in time attaches the land into the root, once;
// 3. a worker that fails after the root was handed over builds the terrain's fallback (the old ring) in slices; one that
//    failed before reports it (`failed`), so the terrain builds the ring itself; a released world runs no fallback;
// 4. a supply builds one root (a second build of it drew an empty one);
// 5. the wiring: the world build hands its terrain build its own supplies (no process-wide slot keyed by map and variant),
//    the world's dispose stops its Hinterland, the terrain falls back to the ring for a failed one, and the near trees'
//    impostor atlas is one render target whose texture a re-bake never replaces (the quads keep sampling the live one).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

const { buildHinterlandWire } = await import('./worker.ts');
const { startHinterlandBuild } = await import('./prefetch.ts');
const { wire } = buildHinterlandWire({ mapId: 'polders', terrainVariant: null, fieldSeed: 1337, search: '?hinterland=1', tier: 'desktop' });

const turn = () => new Promise((resolve) => setImmediate(resolve));
let serial = 0;
function port() {
  const p = { posted: [], terminated: false, onmessage: null, onerror: null,
    postMessage(job) { p.posted.push(job); }, terminate() { p.terminated = true; } };
  return p;
}
// each case its own request (the source keeps the last answer for a rematch on the same key)
const request = () => ({ mapId: 'polders', terrainVariant: null, fieldSeed: 1337, search: `?hinterland=1&case=${++serial}`, tier: 'desktop' });
const answer = (p) => p.onmessage?.({ data: { id: 1, ok: true, wire, ms: 5 } });
const drain = (steps) => { let step = steps.next(); while (!step.done) step = steps.next(); return step.value; };
const context = (fallback) => ({ engineCtx: {}, heightField: {}, ground: null, ...(fallback ? { fallback } : {}) });

// ---- 1. released before the answer: nothing attaches
{
  const p = port();
  const source = startHinterlandBuild(request(), () => p, () => 0);
  const root = drain(source.buildSteps(context()));
  assert.equal(root.children.length, 0, 'the root fills later');
  source.dispose(); // the world was released (its dispose)
  assert.equal(p.terminated, true, 'the released world stops its worker');
  answer(p);
  await turn();
  assert.equal(root.children.length, 0, 'an answer after the release attaches nothing');
  assert.equal(source.stats.attachedMs, -1);
}

// ---- 2. answered in time: the land attaches, once
{
  const p = port();
  const source = startHinterlandBuild(request(), () => p, () => 0);
  const root = drain(source.buildSteps(context()));
  answer(p);
  await turn();
  assert.equal(root.children.length, 1, 'the land attaches into its root when the worker answers');
  assert.equal(root.children[0].name, 'hinterland');
  assert.ok(source.stats.attachedMs >= 0);
  assert.throws(() => drain(source.buildSteps(context())), /is built once/, 'a supply builds one root');
}

// ---- 3. failures: late, early, and after a release
{
  const p = port();
  const source = startHinterlandBuild(request(), () => p, () => 0);
  let steps = 0, finished = false;
  const root = drain(source.buildSteps(context(function* () { for (let i = 0; i < 4; i++) { steps++; yield; } finished = true; })));
  p.onerror?.({ message: 'out of memory' });
  for (let i = 0; i < 4 && !finished; i++) await turn();
  assert.equal(source.failed, true);
  assert.ok(finished && steps === 4, 'a worker failing after the root was handed over builds the ring in the land\'s place');
  assert.equal(root.children.length, 0);
}
{
  const p = port();
  const source = startHinterlandBuild(request(), () => p, () => 0);
  p.onmessage?.({ data: { id: 1, ok: false, message: 'the pipeline threw' } });
  assert.equal(source.failed, true, 'a failure known before the terrain build reaches the land is reported');
  let ran = false;
  drain(source.buildSteps(context(function* () { ran = true; })));
  await turn();
  assert.equal(ran, false, 'the terrain builds the ring itself then; the source runs no fallback');
}
{
  const p = port();
  const source = startHinterlandBuild(request(), () => p, () => 0);
  let ran = false;
  drain(source.buildSteps(context(function* () { ran = true; })));
  source.dispose();
  p.onerror?.({ message: 'late' });
  await turn();
  assert.equal(ran, false, 'a released world builds no fallback ring');
}

// ---- 5. the real world build (map.ts createMapAsync, its subsystem builders injected): a completed world owns its
// Hinterland (before, only a failed or cancelled build stopped it, and the world kept no handle to it)
{
  const mapSource = readFileSync(new URL('../map.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('map.ts', mapSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createMapAsync');
  const code = stripTypeScriptTypes(declaration.getText(ast)).replace('export ', '');
  const build = async (fail) => {
    const field = { _layout: { spawns: { player: { x: 0, z: 0 } } } };
    const config = { id: 'polders', sky: {}, splat: {} };
    const source = { stats: {}, disposed: 0, dispose() { this.disposed++; } };
    let handed = null, terrain = null;
    const deps = {
      getMapConfig: () => config, preloadPropModels: () => Promise.resolve(), prepareSourcedTerrain: () => ({}),
      worldBuildConfig: () => config, getDeviceTier: () => 'desktop',
      startHorizonRingBuild: () => assert.fail('a migrated map starts no ring'), finishHorizonRingAsync: async () => {},
      selectHinterland: () => true, startHinterlandBuild: () => source,
      skyDrawsEarth: () => false, loadEarthLand: () => Promise.resolve(),
      createHeightField: () => field, createHeightFieldAsync: async () => field, requireTerrainRoot: (value) => value,
      async buildTerrainMeshesAsync(_field, _engine, _config, _tick, _fine, streamOpts) {
        handed = streamOpts;
        terrain = { userData: {} };
        return terrain;
      },
      async createVegetationAsync() { return { group: new THREE.Group(), dispose() {} }; },
      async createPropsAsync() { if (fail) throw new Error('cancelled'); return { group: new THREE.Group() }; },
      async assembleWorldPaced() { return { group: new THREE.Group() }; },
      startPlannedWreckBakes: () => null, startSurfacePaints: () => null, plannedSurfacePaints: () => [],
      loadMapKits: () => Promise.resolve(), disposeObject3DResources: () => {},
    };
    const run = new Function(...Object.keys(deps), code + '\nreturn createMapAsync;')(...Object.values(deps));
    const result = await run({ scene: new THREE.Scene() }, { mapId: 'polders' }, null, { abandon() {} }).then(() => null, (error) => error);
    return { source, handed, terrain, result };
  };
  const done = await build(false);
  assert.equal(done.result, null);
  assert.equal(done.handed.hinterlandSupply, done.source, 'the build hands its terrain build its own Hinterland');
  assert.equal(done.source.disposed, 0, 'a completed build leaves the worker answering for the world');
  assert.equal(typeof done.terrain.userData.disposeHinterland, 'function', 'the world keeps the handle');
  done.terrain.userData.disposeHinterland();
  assert.equal(done.source.disposed, 1, 'and its release stops the Hinterland');
  const cancelled = await build(true);
  assert.ok(cancelled.result, 'the cancellation stays the rejection');
  assert.equal(cancelled.source.disposed, 1, 'a cancelled build stops it at once');
}

// ---- 6. the wiring
{
  const map = readFileSync(new URL('../map.ts', import.meta.url), 'utf8');
  const terrain = readFileSync(new URL('../terrain.ts', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../hinterlandHook.ts', import.meta.url), 'utf8');
  const impostors = readFileSync(new URL('../treeImpostors.ts', import.meta.url), 'utf8');
  assert.match(map, /horizonRingSupply: ringSource,\s*hinterlandSupply: hinterlandSource,/, 'the world build hands its terrain build its own supplies');
  assert.doesNotMatch(hook, /const supplied = new Map/, 'no process-wide slot keyed by map and variant');
  assert.match(terrain, /const hinterlandSource = streamOpts\?\.hinterlandSupply \?\? null;/);
  assert.match(map, /terrain\.userData\.disposeHinterland = \(\) => hinterlandSource\.dispose\(\);/, 'a completed world owns its Hinterland');
  assert.match(map, /vegetation\.dispose\(\);\s*terrain\.userData\.disposeHinterland\?\.\(\);/, 'and its dispose stops it');
  assert.match(terrain, /if \(hinterlandSource && !hinterlandSource\.failed\) \{ yield\* hinterlandStage\(\); return; \}\s*yield\* ringStage\(\);/,
    'a Hinterland already failed: the terrain builds the old ring in its place');
  assert.match(terrain, /fallback: \(\) => ringStage\(\)/, 'and hands the land the ring for a later failure');
  // the impostor atlas: one render target each, never reassigned; a suspension's re-bake draws into the same target, so
  // the texture the Hinterland's quads bound at assembly is the live atlas
  assert.match(impostors, /const albedo = makeAtlasTarget\(width, height, anisotropy, 'treeImpostorAlbedo'\);/);
  assert.doesNotMatch(impostors, /albedo\.texture\s*=|albedo\s*=\s*makeAtlasTarget[\s\S]*albedo\s*=\s*makeAtlasTarget/);
  assert.match(impostors, /target\.texture\.addEventListener\('dispose', \(\) => \{ baked = false; target\.dispose\(\); \}\);/);
  const target = new THREE.WebGLRenderTarget(4, 4);
  const texture = target.texture;
  texture.dispose(); target.dispose();
  assert.equal(target.texture, texture, 'a disposed render target keeps its texture object for the next bake');
}

console.log('hinterlandLifetime.selftest: a released world attaches nothing and stops its worker, a timely answer attaches once, a late failure builds the ring fallback in slices (an early one is reported, a released world runs none), one root a supply, the explicit hand-off and the atlas identity PASS');
