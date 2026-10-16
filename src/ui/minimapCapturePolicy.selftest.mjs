import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureMinimapScene, requireSceneMinimap } from './minimapCapturePolicy.ts';

const rendered = { width: 440, height: 440 };
assert.strictEqual(captureMinimapScene(true, () => rendered), rendered);
assert.equal(captureMinimapScene(false, () => { throw new Error('readback failure'); }), null,
  'normal HUD still falls back on a rendering exception');
assert.equal(captureMinimapScene(false, () => null), null);
assert.throws(() => captureMinimapScene(true, () => null), /capture failed/);
assert.throws(() => captureMinimapScene(true, () => { throw new Error('readback failure'); }),
  (error) => error.cause.message === 'readback failure');
const receipt = { source: 'scene', generation: 4, width: 440, height: 440 };
requireSceneMinimap(receipt, 4);
for (const bad of [null, { ...receipt, source: 'procedural' }, { ...receipt, source: 'asset' },
  { ...receipt, generation: 3 }, { ...receipt, width: 0 }]) {
  assert.throws(() => requireSceneMinimap(bad, 4), /fresh textured scene/);
}
const hud = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
assert.match(hud, /return captureMinimapScene\(snap\?\.requireTextured === true, \(\) =>/);
assert.match(hud, /exportMinimapBackground\([^]*?if \(requireTextured\) requireSceneMinimap\(mmCaptureReceipt, mmBuildGeneration\)/);
assert.match(hud, /mmBuildGeneration\+\+;\s*mmCaptureReceipt = null;/,
  'a failed capture cannot export a previous successful frame');
// 2026-10-14: the plate keeps no passing cloud's shadow — the shade map's switch is off for the capture and restored
const snapSource = hud.slice(hud.indexOf('  function renderTopDownSnap('), hud.indexOf('  function paintCapturedMinimapUnderlay('));
assert.match(snapSource, /const cloudShade: THREE\.Vector4 \| undefined = scene\.userData\.cloudShadeUniforms\?\.uCotCloudShade\?\.value;/);
assert.match(snapSource, /if \(cloudShade\) cloudShade\.w = 0;[\s\S]*renderer\.render\(scene, cam\);[\s\S]*finally \{[\s\S]*if \(cloudShade\) cloudShade\.w = cloudShadeOn;/,
  'the cloud shade is off while the top-down capture renders, and back on after it, failure or not');
const shade = await readFile(new URL('../engine/cloudShadeMap.ts', import.meta.url), 'utf8');
assert.match(shade, /if \( uCotCloudShade\.w < 0\.5 \|\|/, 'w is the shade map\'s on switch in the shader');

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /exclude: \[matchModeWorld\.root,/,
  'live objective markers must not be baked into the static map image');

console.log('minimapCapturePolicy.selftest: strict failures, fallback preservation, fresh scene receipts passed');
