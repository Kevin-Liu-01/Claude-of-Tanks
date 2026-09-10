import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { SOURCE_COMPOSITION_PROTOCOL, urbanCompositionCases, compositionPlan,
  compareRgba, validateCompositionTrial, measureSourceComposition } from './sourced-image-composition.mjs';
import { parseCompositionOptions, bounded, closeOwnedBrowser } from './sourced-image-composition-probe.mjs';

const source = await readFile(new URL('../src/world/sourcedTextures.ts', import.meta.url), 'utf8');
const cases = await urbanCompositionCases(source);
assert.equal(SOURCE_COMPOSITION_PROTOCOL, 'urban-sourced-image-first-composition-v1');
assert.deepEqual(cases.map(row => [row.id, row.set]), [
  ['terrain-urban-G', 'grass'], ['terrain-urban-D', 'dirt'], ['terrain-urban-R', 'cobble'],
  ['building-urban-plaster', 'plaster'], ['building-urban-wood', 'wood'], ['building-urban-stone', 'brick'],
]);
assert.equal(new Set(cases.flatMap(row => Object.values(row.images))).size, 24);
assert.ok(cases.filter(row => row.kind === 'terrain').every(row => row.options.roughInAlpha === true));
assert.ok(cases.filter(row => row.kind === 'building').every(row => row.options.roughInAlpha === false));
assert.equal(cases.some(row => row.id.includes('roof')), false, 'Do not reintroduce removed sourced roofs');
await assert.rejects(() => urbanCompositionCases(source.replace("R: { set: 'cobble'", "R: { set: 'rock'")));

const plan = compositionPlan(cases, 2);
assert.equal(plan.length, 24);
assert.deepEqual(plan.slice(0, 2).map(row => row.policy), ['onload', 'decode']);
assert.deepEqual(plan.slice(12, 14).map(row => row.policy), ['decode', 'onload']);
assert.equal(compositionPlan(cases, 4).length, 48);
for (const invalid of [0, 1, 3, 5, 2.1, NaN]) assert.throws(() => compositionPlan(cases, invalid));
for (const row of cases) for (const round of [0, 1]) {
  assert.equal(plan.filter(value => value.caseId === row.id && value.round === round).length, 2);
}

const required = ['--out=/private/tmp/sourced-image-selftest-unused', '--dependency-root=/private/tmp/dependencies'];
assert.equal(parseCompositionOptions(required).pairs, 2);
assert.equal(parseCompositionOptions(required).reuseDelayMs, 1000);
for (const extra of ['--pairs=3', '--pairs=0', '--reuse-delay-ms=0', '--timeout-ms=999', '--unknown=1']) {
  assert.throws(() => parseCompositionOptions([...required, extra]));
}
assert.throws(() => parseCompositionOptions([...required, '--pairs=2', '--pairs=4']));
assert.throws(() => parseCompositionOptions(['--out=relative', required[1]]));
assert.throws(() => parseCompositionOptions([`--out=${fileURLToPath(new URL('./outputs', import.meta.url))}`, required[1]]));
assert.deepEqual(compareRgba(Uint8Array.of(0, 20, 30, 255), Uint8Array.of(0, 20, 30, 255)),
  { exact: true, changedChannels: 0, maxAbsDiff: 0, bytes: 4 });
assert.deepEqual(compareRgba(Uint8Array.of(0, 20, 30, 255), Uint8Array.of(1, 20, 28, 255)),
  { exact: false, changedChannels: 2, maxAbsDiff: 2, bytes: 4 });
assert.throws(() => compareRgba(Uint8Array.of(1), Uint8Array.of(1)));
assert.throws(() => compareRgba(new Uint8Array(4), new Uint8Array(8)));

function fixture(kind = 'terrain', policy = 'decode') {
  const roles = kind === 'terrain' ? ['albedo'] : ['albedo', 'surface'];
  return { kind, policy, status: 'complete', size: 1024, readyAt: 10, reuseDelayMs: 1000,
    quality: { tier: 'desktop', preset: 'high', textureSize: 1024 },
    graphics: { nativeObserved: true, contextLost: false },
    images: ['color', 'normal', 'ao', 'rough'].map(url => ({ url, width: 1024, height: 1024,
      requestedAt: 1, onloadAt: 5, readyAt: 9, decodeStartedAt: 6, decodeEndedAt: 8,
      decodeStatus: policy === 'decode' ? 'fulfilled' : 'not-requested' })),
    measurements: ['first', 'delayed-reuse'].map((stage, index) => {
      const startedAt = index === 0 ? 10 : 1020;
      return { stage, startedAt, endedAt: startedAt + 10, compositionMs: 10, readbackMs: 3,
        readyToCompositionMs: startedAt - 10, requestToCompositionEndMs: startedAt + 9,
        readbacks: [1, 2, 3].map(offset => ({ startMs: startedAt + offset, durationMs: 1, width: 1024, height: 1024 })),
        outputs: roles.map(role => ({ role, width: 1024, height: 1024, byteLength: 1024 * 1024 * 4 })) };
    }) };
}
for (const kind of ['terrain', 'building']) for (const policy of ['onload', 'decode']) validateCompositionTrial(fixture(kind, policy));
const bad = mutate => { const row = fixture(); mutate(row); assert.throws(() => validateCompositionTrial(row)); };
bad(row => { row.status = 'failed'; });
bad(row => { row.images[0].decodeStatus = 'fallback'; });
bad(row => { row.images[0].decodeStartedAt = 0; });
bad(row => { row.images[0].readyAt = NaN; });
bad(row => { row.images[0].url = row.images[1].url; });
bad(row => { row.quality.textureSize = 512; });
bad(row => { row.size = 512; });
bad(row => { row.measurements[0].readbacks.pop(); });
bad(row => { row.measurements[0].readbacks[0].durationMs = NaN; });
bad(row => { row.measurements[0].readbacks[0].startMs = 0; });
bad(row => { row.measurements[0].outputs[0].byteLength--; });
bad(row => { row.measurements[0].compositionMs = NaN; });
bad(row => { row.measurements[1].startedAt = 500; });
bad(row => { row.graphics.nativeObserved = false; });
bad(row => { row.graphics.contextLost = true; });

assert.equal(await bounded(() => 7, 20, 'success'), 7);
await assert.rejects(() => bounded(() => { throw new Error('original'); }, 20, 'failure'), /original/);
await assert.rejects(() => bounded(() => new Promise(() => {}), 2, 'test'), /test deadline/);
function ownedBrowser(mode) {
  const child = new EventEmitter();
  child.exitCode = null; child.signalCode = null; child.signals = [];
  const exit = signal => { child.signalCode = signal; child.emit('exit'); };
  child.kill = signal => { child.signals.push(signal); if (signal === 'SIGKILL' || mode === 'term') exit(signal); };
  return { child, process: () => child, close: async () => {
    if (mode === 'normal') { child.exitCode = 0; child.emit('exit'); }
    else if (mode === 'reject') throw new Error('close rejected');
    else return new Promise(() => {});
  } };
}
for (const [mode, expectedSignals] of [['normal', []], ['term', ['SIGTERM']], ['reject', ['SIGTERM', 'SIGKILL']]]) {
  const browser = ownedBrowser(mode), errors = [];
  assert.equal(await closeOwnedBrowser(browser, errors, { closeMs: 2, exitMs: 2 }), true);
  assert.deepEqual(browser.child.signals, expectedSignals);
  assert.equal(browser.child.listenerCount('exit'), 0, 'No retained deadline listeners');
  assert.equal(errors.length, mode === 'normal' ? 0 : 1, 'Recovered cleanup remains a failed acquisition');
}
const missingErrors = [];
assert.equal(await closeOwnedBrowser({ process: () => null }, missingErrors), false);
assert.equal(missingErrors.length, 1);

// The browser measurement must stay self-contained and use actual exports.
// These guards prevent moving diagnostics across the first/reuse timing edge.
const measurement = measureSourceComposition.toString();
assert.ok(measurement.includes("await import('/src/world/sourcedTextures.ts')"));
assert.ok(measurement.includes("input.kind === 'terrain' ? loaded.ao : null"));
assert.ok(measurement.indexOf("measure(owner, loaded, 'first')") < measurement.indexOf('await new Promise(resolve => setTimeout'));
assert.ok(measurement.indexOf("measure(owner, loaded, 'delayed-reuse')") < measurement.indexOf('first.map('));
assert.ok(!/requestAnimationFrame|AudioContext|readPixels/.test(measurement));
assert.ok(measurement.includes('prototype.getImageData === wrapper'));
console.log('sourced-image-composition: source corpus, AB/BA, exact parity, admission and owned cleanup tests passed');
