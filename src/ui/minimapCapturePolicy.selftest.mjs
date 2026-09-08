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
console.log('minimapCapturePolicy.selftest: strict failures, fallback preservation, fresh scene receipts passed');
