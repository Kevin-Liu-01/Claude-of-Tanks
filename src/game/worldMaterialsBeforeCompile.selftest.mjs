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
const compileBody = main.slice(compileAt, compileAt + 3600);
const patchAt = compileBody.indexOf('fxRuntimeAccess.current?.prepareWorldMaterials()');
assert.ok(patchAt > 0 && patchAt < compileBody.indexOf('forwardProgramWarm.prepareSceneSteps('), 'the MP compile patches the world first');
// (and the black watchdog's readback copy goes with the compile: its link at the watchdog waited behind the GPU queue)
const probeAt = compileBody.indexOf('warmSceneProbePrograms(renderer)');
assert.ok(probeAt > 0 && probeAt < compileBody.indexOf('forwardProgramWarm.prepareSceneSteps('), 'the MP compile warms the probe copy');
// (and bakes the far trees' impostor atlas, as the solo loading does: the room's world skips activation's precompile)
const impostorsAt = compileBody.indexOf('await world.warmImpostorsAsync(');
assert.ok(impostorsAt > 0 && impostorsAt < compileBody.indexOf('forwardProgramWarm.prepareSceneSteps('), 'the MP compile bakes the impostors');

// (and the MP finalShadows warm draws the post chain's first frame under the cover, as the solo deployment does)
const shadowsAt = main.indexOf('finalShadows: async (signal?: AbortSignal) => {');
const shadowsBody = main.slice(shadowsAt, main.indexOf('submitPrograms: async', shadowsAt));
assert.ok(shadowsAt > 0 && shadowsBody.indexOf('post.warmFirstFrame(') > shadowsBody.indexOf('lighting.primeShadowMaps('),
  'the MP finalShadows warm draws the post chain after the shadow prime');

// (and its opening effects' covered composer render draws no shadow pass: that pass made every far caster's depth
// program in one 1.6 s task ahead of the shadow prime's batches, nav-perf's root-r room)
// (262, the solo sim Worker's pacing option: the signature spans lines, so the anchor stops at its parenthesis)
const openingAt = main.indexOf('openingEffects: async (');
const openingBody = main.slice(openingAt, main.indexOf('shotCards:', openingAt));
assert.ok(openingAt > 0 && /renderWithoutShadowUpdates\(lighting\.csm\?\.lights \?\? \[\], \(\) => \{\s*const rendered = renderCoveredComposerWarm\(post\.composer\);/.test(openingBody),
  'the MP opening warm renders without shadow updates');
// (2026-10-26, the 257 rooms census: its one render uploaded the battlefield's textures and buffers, a 1.5 s entry task)
// the battlefield draws a cohort at a time, a frame between cohorts, before that render
const cohorts = openingBody.indexOf('createDeploymentForwardWarmBatches({');
assert.ok(cohorts > 0 && cohorts < openingBody.indexOf('renderCoveredComposerWarm(post.composer)')
  // (2026-10-26, the room-stalls lane: each cohort's buffers uploaded with zero draw counts ahead of its draws, a frame
  // between draw batches, the GPU caught up after every batch)
  // (262, da18bcdd48: the solo sim Worker's covered pacing yields as the page's solo deployment warm, a painted frame at
  // most every 32 ms; the room's GPU pacing keeps a frame per batch)
  && /const batchYield = gpuPaced \? forwardYield : createOpaqueLoadingYielder\(12, 32\);/.test(openingBody)
  && /\(batch\.phase === 'upload' \? uploadBatches : forwardBatches\)\.push\(batch\.ms\);\s*signal\?\.throwIfAborted\(\);\s*if \(batch\.phase !== 'upload'\) await batchYield\(true\);\s*if \(gpuPaced\) catchUpFrames \+= await waitForGpuCatchUp\(catchUp\);/.test(openingBody),
'the MP opening warm draws the battlefield in cohorts between frames before its composer render');

// the solo combat warm: before its first compileAll (the tanks', then the world's)
const warm = read('./battleWarmRuntime.ts');
const hidden = warm.indexOf('function* compileHiddenVariantsSteps(');
const body = warm.slice(hidden, warm.indexOf('\nfunction', hidden + 10));
const solo = body.indexOf('context.fx.prepareWorldMaterials?.()');
assert.ok(solo > 0 && solo < body.indexOf('yield* compileAll(entity.visual.root)') && solo < body.indexOf('yield* compileAll(world.group)'),
  'the solo combat warm patches the world before it compiles it');
console.log('worldMaterialsBeforeCompile.selftest: the fx patches the world when asked; the MP compile and the solo combat warm ask before they compile it; the probe copy and the impostor bake go with the MP compile; its opening warm draws no shadow pass; its finalShadows warms the post chain');
