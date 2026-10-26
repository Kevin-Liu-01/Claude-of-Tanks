// (battle-spikes-253) Both battle entries patch the world's structure materials for the collapse mask before they
// compile the world (effects.ts prepareWorldMaterials → attachWorld → patchStructureMaterials). Patched after (the
// opening effects' warm), every structure bucket re-keyed (|fx-structure-mask-holes) and the next real render — the MP
// entry's black watchdog — linked the twelve masked variants synchronously (nav-perf's blackglass room, 1.4 s).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const effects = read('../fx/effects.ts');
assert.match(effects, /prepareWorldMaterials\(\): void \{\s*attachWorld\(\);\s*\}/, 'the fx runtime patches the world when asked');

// the network entry: in the strict preparation's compile, before prepareSceneSteps
const main = read('../main.ts');
const compileAt = main.indexOf('compile: async (signal?: AbortSignal) => {');
assert.ok(compileAt > 0);
const compileBody = main.slice(compileAt, compileAt + 2400);
const patchAt = compileBody.indexOf('fxRuntimeAccess.current?.prepareWorldMaterials()');
assert.ok(patchAt > 0 && patchAt < compileBody.indexOf('forwardProgramWarm.prepareSceneSteps('), 'the MP compile patches the world first');
// (and the black watchdog's readback copy goes with the compile: its link at the watchdog waited behind the GPU queue)
const probeAt = compileBody.indexOf('warmSceneProbePrograms(renderer)');
assert.ok(probeAt > 0 && probeAt < compileBody.indexOf('forwardProgramWarm.prepareSceneSteps('), 'the MP compile warms the probe copy');

// (and the MP finalShadows warm draws the post chain's first frame under the cover, as the solo deployment does)
const shadowsAt = main.indexOf('finalShadows: async (signal?: AbortSignal) => {');
const shadowsBody = main.slice(shadowsAt, main.indexOf('submitPrograms: async', shadowsAt));
assert.ok(shadowsAt > 0 && shadowsBody.indexOf('post.warmFirstFrame(') > shadowsBody.indexOf('lighting.primeShadowMaps('),
  'the MP finalShadows warm draws the post chain after the shadow prime');

// the solo combat warm: before its first compileAll (the tanks', then the world's)
const warm = read('./battleWarmRuntime.ts');
const hidden = warm.indexOf('function* compileHiddenVariantsSteps(');
const body = warm.slice(hidden, warm.indexOf('\nfunction', hidden + 10));
const solo = body.indexOf('context.fx.prepareWorldMaterials?.()');
assert.ok(solo > 0 && solo < body.indexOf('yield* compileAll(entity.visual.root)') && solo < body.indexOf('yield* compileAll(world.group)'),
  'the solo combat warm patches the world before it compiles it');
console.log('worldMaterialsBeforeCompile.selftest: the fx patches the world when asked; the MP compile and the solo combat warm ask before they compile it; the probe copy warms with the MP compile; its finalShadows warms the post chain');
