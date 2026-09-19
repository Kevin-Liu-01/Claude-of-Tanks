import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackClipQuality, trackClipOptions, createTrackClipTank } from './track-clip-options.mjs';
assert.deepEqual(trackClipOptions([]), { quality: 'high', outDir: 'shots' });
assert.deepEqual(trackClipOptions(['--exact', '--strict', '--quality=low', '--out-dir=private/low']), { quality: 'low', outDir: 'private/low' });
assert.deepEqual(trackClipOptions(['--quality=high']), { quality: 'high', outDir: 'shots' });
for (const value of ['', 'HIGH', 'mobile', 'medium', null, false]) assert.throws(() => trackClipQuality(value), /Invalid/);
for (const args of [['--quality', 'low'], ['--out-dir', 'private'], ['--quality='], ['--quality=low', '--quality=high'], ['--out-dir='], ['--out-dir=a', '--out-dir=b']]) assert.throws(() => trackClipOptions(args));
const ctx = {}, sentinel = {};
for (const quality of [undefined, 'high', 'low']) {
  let calls = 0;
  assert.equal(createTrackClipTank((id, context, options) => {
    calls++; assert.equal(id, 'control'); assert.equal(context, ctx);
    assert.deepEqual(options, { camoSeed: 4242, quality: quality ?? 'high', proceduralOnly: true });
    return sentinel;
  }, 'control', ctx, quality), sentinel);
  assert.equal(calls, 1);
}
assert.throws(() => createTrackClipTank(() => assert.fail('invalid quality reached factory'), 'control', ctx, 'LOW'));
// Exercise the actual page's parameter-to-factory bridge with URLSearchParams.
const html = readFileSync(new URL('./track-clip-audit.html', import.meta.url), 'utf8');
const resolveLine = html.match(/const quality = [^;]+;/)?.[0];
const buildLine = html.match(/const tank = createTrackClipTank[^;]+;/)?.[0];
assert.ok(resolveLine && buildLine, 'actual page must route the validated quality into the shared factory bridge');
const run = new Function('params', 'trackClipQuality', 'createTrackClipTank', 'createTank', 'id', 'engineCtx', `${resolveLine}\n${buildLine}\nreturn tank;`);
for (const search of ['', 'quality=high', 'quality=low']) {
  const expected = search === 'quality=low' ? 'low' : 'high';
  assert.equal(run(new URLSearchParams(search), trackClipQuality, createTrackClipTank, (_id, _ctx, opts) => opts.quality, 'control', ctx), expected);
}
assert.throws(() => run(new URLSearchParams('quality=bogus'), trackClipQuality, createTrackClipTank, () => assert.fail(), 'control', ctx));
console.log('track-clip-options: historical HIGH default, explicit LOW forwarding, strict invalid-option rejection and actual page bridge PASS');
