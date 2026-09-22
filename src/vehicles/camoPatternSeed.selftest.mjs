import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
import { camoPatternStreamSeed, resolveCamoVisual } from './materials.ts';

// Round 32 (owner 2026-09-21): "when i switch tanks the camo seeding literally changes, which is wasteful". The noise
// stream a pattern paints with is keyed by the visible recipe and the pattern id — never by the hull — so one shared
// preset lays out identically on every vehicle and a re-bake of the same pattern is byte-comparable.
const abrams = getSpec('m1a2'), t90m = getSpec('t90m'), leo = getSpec('leo2a6m');
const patternHash = 0x51f15e;
// shared presets resolve to one recipe on every hull, so they must paint from one stream; the hull-relative base
// patterns (winter whitewash over the authored coat, etc.) differ by recipe and therefore by stream — by design
for (const patternId of ['service_usa_desert', 'sig_abramsx', 'national_de', 'paint_tiger1', 'service_soviet_ww2']) {
  const seeds = [abrams, t90m, leo].map((spec) => camoPatternStreamSeed(resolveCamoVisual(spec, patternId), patternHash));
  assert.equal(new Set(seeds).size, 1, `${patternId}: the same pattern paints from the same stream on every hull (${seeds.join(', ')})`);
  assert.ok(Number.isInteger(seeds[0]) && seeds[0] >= 0 && seeds[0] <= 0xffffffff, `${patternId}: an unsigned 32-bit seed`);
}
// different patterns and different pattern ids paint from different streams
const desert = resolveCamoVisual(abrams, 'service_usa_desert');
assert.notEqual(camoPatternStreamSeed(desert, patternHash), camoPatternStreamSeed(resolveCamoVisual(abrams, 'winter'), patternHash));
assert.notEqual(camoPatternStreamSeed(desert, patternHash), camoPatternStreamSeed(desert, patternHash ^ 1));
// every recipe field that changes the visible paint changes the stream; knobs that do not are ignored
const base = { scheme: 'nato', base: '#49543c', weather: '#525f45', patches: ['#23261f', '#4a3a2c'], camoScale: 1 };
assert.equal(camoPatternStreamSeed(base, 7), camoPatternStreamSeed({ ...base, patchK: 0.4, digitalCellK: 3, solidWeatheringIntensity: 0.2 }, 7));
for (const change of [{ base: '#49543d' }, { weather: '#525f46' }, { patches: ['#23261f', '#4a3a2d'] }, { camoScale: 1.1 }, { scheme: 'digital' }]) {
  assert.notEqual(camoPatternStreamSeed(base, 7), camoPatternStreamSeed({ ...base, ...change }, 7), JSON.stringify(change));
}
// source pins: both paint calls seed from the pattern stream, never from the per-hull texture seed
const source = readFileSync(fileURLToPath(new URL('./materials.ts', import.meta.url)), 'utf8');
const paintCalls = source.match(/paintCamo\([^;]*\);/g) || [];
assert.ok(paintCalls.length >= 2, `paintCamo call sites (${paintCalls.length})`);
for (const call of paintCalls) assert.match(call, /mulberry32\(camoPatternStreamSeed\(/, `pattern-keyed stream: ${call}`);
assert.ok(!/paintCamo\([^;]*entry\.seed \^/.test(source), 'no paint call mixes the hull texture seed into the pattern stream');
// Round 35: the FIRST bake (materialPainter.bakeBaseSteps) paints from the same stream — the request carries it
assert.match(source, /camoStreamSeed: camoPatternStreamSeed\(vis, camoPatternIdHash\(entry\.patternId\)\)/,
  'the shared paint request carries the pattern stream seed');
const painterSource = readFileSync(fileURLToPath(new URL('./materialPainter.ts', import.meta.url)), 'utf8');
assert.match(painterSource, /request\.camoStreamSeed != null \? mulberry32\(request\.camoStreamSeed\) : rng/,
  'bakeBaseSteps paints the camo from the pattern stream when the request carries one');
console.log('camoPatternSeed.selftest: shared patterns paint from one hull-independent stream');
