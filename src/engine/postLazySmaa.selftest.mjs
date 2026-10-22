// postLazySmaa.selftest.mjs — SMAA out of the game entry (engine/post.ts, 2026-10-13, the perf stream: three's SMAAPass
// carries its area and search images as base64, 34 KB of the entry's brotli). The pass loads as its own chunk into a
// slot the chain reserves between the output grade and the upscaler, with the same High-preset defines, and the boot's
// post stage awaits it before any frame is warmed or shown (the Studio boot too). The slot swap is exercised on three's
// own EffectComposer methods.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const post = await readFile(new URL('./post.ts', import.meta.url), 'utf8');
assert.doesNotMatch(post, /^import \{[^}]*\bSMAAPass\b[^}]*\} from 'three\/examples\/jsm\/postprocessing\/SMAAPass\.js';$/m,
  'no static import of the SMAA pass (its images would ride the entry)');
assert.match(post, /^import type \{ SMAAPass \} from 'three\/examples\/jsm\/postprocessing\/SMAAPass\.js';$/m);
const at = post.indexOf('const smaaSlot = new Pass();');
assert.ok(at > 0, 'the chain reserves the SMAA slot');
const block = post.slice(at, post.indexOf('const upscaler = new FsrUpscalePass();', at));
assert.ok(post.lastIndexOf('composer.addPass(grade);', at) > 0 && block.includes('composer.addPass(smaaSlot);'),
  'the slot follows the output grade and precedes the upscaler');
assert.match(block, /smaaSlot\.enabled = false;\s*smaaSlot\.needsSwap = false;/, 'an empty slot leaves the frame untouched');
// (2026-10-19, black-screen-228) the pass arrives through the chain's own lazy half, which re-exports three's SMAA pass
// beside the first-frame warm (one chunk, one dynamic import)
assert.match(block, /import\('\.\/postLazyPasses\.ts'\)/);
const lazy = await readFile(new URL('./postLazyPasses.ts', import.meta.url), 'utf8');
assert.match(lazy, /^export \{ SMAAPass \} from 'three\/examples\/jsm\/postprocessing\/SMAAPass\.js';$/m);
assert.match(block, /SMAA_THRESHOLD = '0\.055';/, 'the High-preset edge threshold');
assert.match(block, /SMAA_MAX_SEARCH_STEPS = '16';/, 'the High-preset search');
assert.match(block, /const at = composer\.passes\.indexOf\(smaaSlot\);\s*composer\.removePass\(smaaSlot\);\s*composer\.insertPass\(smaa, at\);/);
assert.doesNotMatch(block, /\.catch\(|, \(error/, 'a failed load stays rejected (the boot fails into the chunk recovery)');
assert.match(post, /ready: smaaReady,/, 'the runtime hands the boot the load');

// the boot awaits it first thing in its post stage, before the Studio return and the garage warm
const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const stage = main.slice(main.indexOf("await bootStage('post', async () => {"));
assert.ok(stage.length > 0);
const awaitAt = stage.indexOf('await post.ready;');
assert.ok(awaitAt > 0 && awaitAt < stage.indexOf('if (STUDIO_BOOT_INTENT) return;')
  && awaitAt < stage.indexOf('await warmGarageGpuPipeline('), 'the post stage awaits the chain before warming or the Studio');

// the swap on three's composer: the pass takes the slot's index and the composer's size, as addPass gives it
{
  const composer = Object.create(EffectComposer.prototype);
  composer.passes = [];
  composer._width = 800; composer._height = 450; composer._pixelRatio = 1.5;
  const named = (name) => { const p = new Pass(); p.name = name; p.setSize = function (w, h) { this.size = [w, h]; }; return p; };
  const grade = named('grade'), upscaler = named('upscaler');
  composer.addPass(grade);
  const slot = new Pass(); slot.enabled = false; slot.needsSwap = false;
  composer.addPass(slot);
  composer.addPass(upscaler);
  const smaa = named('smaa');
  const index = composer.passes.indexOf(slot);
  composer.removePass(slot);
  composer.insertPass(smaa, index);
  assert.deepEqual(composer.passes.map((p) => p.name), ['grade', 'smaa', 'upscaler']);
  assert.deepEqual(smaa.size, [1200, 675], 'sized to the composer like every pass');
}

console.log('postLazySmaa.selftest: SMAA loads as its own chunk into its reserved slot (same defines, same place); the boot awaits it before any frame');
