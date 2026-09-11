import assert from 'node:assert/strict';
import { checkGarageDrawRangeReport, garageDrawRangeUrl } from './garage-draw-range-probe.mjs';

const url = garageDrawRangeUrl('http://127.0.0.1:4178/?debug=0');
for (const [key, value] of [['debug', '1'], ['nosplash', '1'], ['tier', 'desktop'], ['gfxreset', '1']]) assert.equal(url.searchParams.get(key), value);
assert.throws(() => garageDrawRangeUrl('file:///private/build'), /HTTP/);

const frame = (serial, triangles) => ({ scope: 'last-completed-post-frame', serial, calls: 4, triangles });
const pair = name => ({ name, controlDiffBytes: 0, diffBytes: 0, negativeDiffBytes: 8, glErrors: [],
  a: { frame: frame(1, 75), residency: { geometries: ['same'], gpu: { textures: 3 } }, view: { projection: [1], target: null } },
  b: { frame: frame(2, 27), residency: { geometries: ['same'], gpu: { textures: 3 } }, view: { projection: [1], target: null } },
  draws: { a: [{ completed: true, mesh: 'm', camera: 'c', count: 216, triangles: 72 }],
    b: [{ completed: true, mesh: 'm', camera: 'c', count: 72, triangles: 24 }] },
});
const report = { errors: [], hardware: { native: true }, nativeLaunch: { verified: true },
  pairs: ['default', 'edge-left', 'quarter', 'edge-right', 'rear'].map(pair) };
assert.deepEqual(checkGarageDrawRangeReport(report), []);
for (const [name, mutate] of [
  ['pixel', r => { r.pairs[0].diffBytes = 1; }],
  ['control instability', r => { r.pairs[0].controlDiffBytes = 1; }],
  ['added calls', r => { r.pairs[0].b.frame.calls++; }],
  ['residency', r => { r.pairs[0].b.residency.gpu.textures++; }],
  ['camera mismatch', r => { r.pairs[0].b.view.projection = [2]; }],
  ['GL error', r => { r.pairs[0].glErrors = [1282]; }],
  ['failed restoration', r => { r.pairs[0].restoreError = 'context lost'; }],
  ['software renderer', r => { r.hardware.native = false; }],
  ['HTTP failure', r => { r.failedResponses = [{ status: 404, url: '/required.png' }]; }],
  ['missing pose', r => { r.pairs.pop(); }],
  ['no reduction', r => { for (const p of r.pairs) p.b.frame.triangles = p.a.frame.triangles; }],
  ['no actual trimmed draw', r => { for (const p of r.pairs) p.draws.b = []; }],
  ['ineffective negative control', r => { for (const p of r.pairs) p.negativeDiffBytes = 0; }],
]) {
  const changed = structuredClone(report); mutate(changed);
  assert.ok(checkGarageDrawRangeReport(changed).length > 0, `${name} must fail closed`);
}
console.log('garage-draw-range-probe.selftest: native diagnostic acceptance and thirteen negative controls pass (no browser)');
