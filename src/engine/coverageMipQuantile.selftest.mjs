// coverageMipQuantile.selftest.mjs — the coverage-preserving mip correction finds its alpha quantile with a histogram
// (2026-10-24, lockdown-251) and writes exactly what the sorted version wrote.
//
// lighting.ts correctMipCoverage remaps a mip level's alpha around the quantile that keeps level 0's share of texels
// past the cutoff. It found that quantile by sorting every texel's alpha in a number array (a million values at 1024²:
// a tank switch's longest task in the spike census); a 256-bin histogram gives the same value in one pass with no
// allocation. This receipt runs the shipped function from lighting.ts's source beside the sorted reference over
// random, banded and degenerate levels, every byte compared.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
const pick = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `lighting.ts carries ${start}`);
  return source.slice(from, to);
};
const shipped = new Function(stripTypeScriptTypes(
  pick('function alphaCoverage(', 'function downsampleCoverageMip(')
  + pick('const COVERAGE_HISTOGRAM', '/**\n * Build a coverage-preserving mip chain'),
) + '\nreturn correctMipCoverage;')();

/** The sorted version this replaces, verbatim but for its types. */
function alphaCoverage(data, cutoff) {
  let passing = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] >= cutoff) passing++;
  return passing / (data.length / 4);
}
function sortedCorrectMipCoverage(image, targetCoverage, cutoff) {
  if (targetCoverage <= 0 || image.width < 2) return;
  const data = image.data;
  const currentCoverage = alphaCoverage(data, cutoff);
  if (currentCoverage >= targetCoverage * 0.7 && currentCoverage <= targetCoverage * 1.3) return;
  const alphas = [];
  for (let index = 3; index < data.length; index += 4) alphas.push(data[index]);
  alphas.sort((a, b) => b - a);
  const quantileIndex = Math.min(alphas.length - 1, Math.max(0, Math.round(targetCoverage * alphas.length) - 1));
  const quantile = Math.max(1, alphas[quantileIndex]);
  for (let index = 3; index < data.length; index += 4) {
    const alpha = cutoff + (data[index] - quantile) * 3;
    data[index] = Math.max(0, Math.min(255, alpha));
  }
}

let seed = 0x5eed;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const level = (size, alpha) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = i & 255; data[i * 4 + 3] = alpha(i, size); }
  return { width: size, height: size, data };
};
const kinds = {
  random: () => Math.floor(random() * 256),
  sparse: () => (random() < 0.08 ? 255 : Math.floor(random() * 40)),
  dense: () => (random() < 0.9 ? 200 + Math.floor(random() * 56) : 0),
  banded: (i, size) => ((i % size) < size / 3 ? 255 : (i % size) < size / 2 ? 128 : 0),
  flat: () => 77,
  empty: () => 0,
};
let corrected = 0;
for (const [name, alpha] of Object.entries(kinds)) {
  for (const size of [2, 4, 32, 128]) {
    for (const target of [0.02, 0.1, 0.35, 0.6, 0.95, 1]) {
      for (const cutoff of [1, 64, 128, 200]) {
        seed = 0x5eed + size * 31 + Math.round(target * 100) * 7 + cutoff;
        const a = level(size, alpha);
        seed = 0x5eed + size * 31 + Math.round(target * 100) * 7 + cutoff;
        const b = level(size, alpha);
        const before = a.data.slice();
        shipped(a, target, cutoff);
        sortedCorrectMipCoverage(b, target, cutoff);
        assert.deepEqual(a.data, b.data, `${name} ${size}² target ${target} cutoff ${cutoff}: the same alpha remap`);
        if (a.data.some((value, index) => value !== before[index])) corrected++;
      }
    }
  }
}
assert.ok(corrected > 40, `the cases reach the remap itself, not only its early returns (${corrected})`);
assert.doesNotMatch(pick('function correctMipCoverage(', '/**\n * Build a coverage-preserving mip chain'), /\.sort\(|\.push\(/,
  'no per-texel array and no sort in the correction');
console.log(`coverageMipQuantile.selftest: the histogram quantile writes the sorted version's alphas (${corrected} remapped levels) PASS`);
