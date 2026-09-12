import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HORIZON_MESA_SURFACE_FRAGMENT } from './horizonMesaSurface.ts';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (low, high, value) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, weight) => a * (1 - weight) + b * weight;
const legacyGain = (dA, dB, fixW) => 1 + (dA * 0.28 + dB * 0.30) * (1 - fixW * 0.8);

function requireIntegration(source) {
  assert.match(source, /import \{ HORIZON_MESA_SURFACE_FRAGMENT \} from '\.\.\/horizonMesaSurface\.ts';/);
  assert.match(source, /\$\{style === 'mesa' \? HORIZON_MESA_SURFACE_FRAGMENT \+ '\\n\s+diffuseColor\.rgb \*= horizonSurfaceGain;'\s*:\s*'diffuseColor\.rgb \*= 1\.0 \+ \(dA \* 0\.28 \+ dB \* 0\.30\) \* \(1\.0 - fixW \* 0\.8\);'\}/,
    'Only mesa compiles the recipe; every other style retains the exact generic GLSL');
  assert.equal((source.match(/diffuseColor\.rgb \*= horizonSurfaceGain;/g) ?? []).length, 1,
    'The caller applies the recipe exactly once');
  // The rejected Verdant watershed branch is gone (owner direction
  // 2026-09-11): Verdant compiles the same generic rolling program as every
  // other rolling map. Exercise the actual key function rather than requiring
  // Mesa to remain the first textual ternary branch.
  const cacheAssignment = source.match(/mat\.customProgramCacheKey = (\(\) => [^;]+);/);
  assert.ok(cacheAssignment, 'The material declares its custom shader cache identity');
  const cacheKey = new Function('mapId', 'style', `return (${cacheAssignment[1]})();`);
  const styleKeys = {
    mesa: 'horizon-ring-mesa-surface-r2',
    alpine: 'horizon-ring-world-surface-r3-alpine',
    rolling: 'horizon-ring-relief-r2-rolling',
    escarpment: 'horizon-ring-relief-r2-escarpment',
  };
  for (const [style, expected] of Object.entries(styleKeys)) {
    for (const mapId of ['titan_gorge', 'desert', 'winter', 'coastal', 'verdant']) {
      assert.equal(cacheKey(mapId, style), expected, 'Style cache identities remain exact and carry no map-specific branch');
    }
  }
  assert.doesNotMatch(source, /VERDANT_HORIZON_FRAGMENT|verdant-classic|horizon-verdant-watershed/,
    'The rejected Verdant-only watershed fragment, alias and cache identity stay retired');
  assert.match(source, /'#include <map_fragment>', style === 'alpine' \? ALPINE_HORIZON_MAP_FRAGMENT/,
    'Fragment dispatch is by style: alpine world-surface, then the mesa/generic recipe');
}
const integration = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
requireIntegration(integration);

function requireSourceContract(fragment) {
  const source = fragment.replace(/\/\/[^\n]*/g, '').trim();
  assert.ok(source.startsWith('float horizonSurfaceGain = 1.0 + (dA * 0.28 + dB * 0.30) * (1.0 - fixW * 0.8);'),
    'The generic response remains exactly the existing expression');
  assert.doesNotMatch(source, /\b(?:texture\w*|uniform|sampler\w*|varying|attribute|discard|for|while|if|diffuseColor|gl_\w*)\b/,
    'No new samples, resources, control loops, output writes or conditional derivative execution');
  const declarations = [...source.matchAll(/\bfloat\s+(\w+)/g)].map(match => match[1]);
  const allowed = new Set([...declarations, 'float', 'smoothstep', 'clamp', 'mix', 'sin', 'fwidth',
    'dA', 'dB', 'fixW', 'hnW0', 'y', 'uCapFix', 'horizonMarine', 'vHPos']);
  for (const identifier of source.match(/\b[A-Za-z_]\w*\b/g)) {
    assert.ok(allowed.has(identifier), `Unexpected shader input or operation: ${identifier}`);
  }
  assert.equal((source.match(/fwidth\(/g) ?? []).length, 2);
  assert.match(source, /fwidth\(mesaBedPhase\)/);
  assert.match(source, /fwidth\(mesaPatchField\)/);
  assert.match(source, /mesaWallGain = clamp\(mesaWallGain, 0\.74, 1\.14\)/);
  return source;
}

// Execute this exact scalar recipe, not a separately maintained approximation.
// fwidth inputs are explicit synthetic pixel footprints: this checks bounded
// arithmetic and fade policy, NOT GPU derivatives, compilation or native art.
function compileRecipe(fragment) {
  const source = requireSourceContract(fragment).replace(/\bfloat\s+/g, 'let ');
  return new Function('dA', 'dB', 'fixW', 'hnW0', 'uCapFix', 'horizonMarine', 'vHPos',
    'smoothstep', 'clamp', 'mix', 'sin', 'fwidth', `${source}\nreturn horizonSurfaceGain;`);
}
const recipe = compileRecipe(HORIZON_MESA_SURFACE_FRAGMENT);
function gain({ dA = 0, dB = 0, fixW = 0, normalY = 0.45, cap = 1, marine = 0,
  height = 100, bedFootprint = 0.01, patchFootprint = 0.001 } = {}) {
  let derivative = 0;
  const result = recipe(dA, dB, fixW, { y: normalY }, cap, marine, { y: height },
    smoothstep, clamp, mix, Math.sin, () => [bedFootprint, patchFootprint][derivative++]);
  assert.equal(derivative, 2, 'Both derivative operations stay unconditional');
  assert.ok(Number.isFinite(result));
  return result;
}

let minimum = Infinity, maximum = -Infinity, altered = 0;
for (let a = -10; a <= 10; a++) for (let b = -10; b <= 10; b++) {
  const dA = a / 20, dB = b / 20;
  for (const fixW of [0, 0.3, 1]) {
    const expected = legacyGain(dA, dB, fixW);
    assert.equal(gain({ dA, dB, fixW, cap: 0 }), expected, 'Non-mesa response is bit-identical');
    assert.equal(gain({ dA, dB, fixW, marine: 1 }), expected, 'Sea response is bit-identical');
    for (const normalY of [0.95, 0.97, 1]) {
      assert.equal(gain({ dA, dB, fixW, normalY }), expected, 'Caps and shallow surfaces stay exact');
    }
  }
  assert.equal(gain({ dA, dB, fixW: 1 }), legacyGain(dA, dB, 1), 'Full cap repair retains its original response');
  for (let height = 0; height <= 640; height += 4) {
    const result = gain({ dA, dB, height });
    assert.ok(result >= 0.74 && result <= 1.14, 'Fully weighted mesa gain is bounded');
    minimum = Math.min(minimum, result); maximum = Math.max(maximum, result);
    if (Math.abs(result - legacyGain(dA, dB, 0)) > 0.01) altered++;
    const wide = gain({ dA, dB, height, bedFootprint: 1.2, patchFootprint: 0.23 });
    assert.equal(wide, 1 + dA * 0.08 + dB * 0.10, 'Unresolved detail fades to broad pigment only');
  }
}
assert.ok(altered > 10000 && minimum < 0.90 && maximum > 1.03,
  'The bounded recipe makes an actual varied change, not a disabled or constant patch');

const closed = Array.from({ length: 256 }, (_, i) => gain({ dA: -0.3, dB: 0, height: i }));
assert.equal(new Set(closed).size, 1, 'Bed breaks remove the entire line in closed surface patches');
const open = Array.from({ length: 256 }, (_, i) => gain({ dA: 0.2, dB: 0.1, height: i }));
assert.ok(Math.max(...open) - Math.min(...open) > 0.10, 'Open patches retain height-dependent sediment beds');
assert.notDeepEqual(open, Array.from({ length: 256 }, (_, i) => gain({ dA: 0.2, dB: 0.2, height: i })),
  'The sampled surface fields warp and interrupt beds instead of drawing universal contour bars');
const midpoint = gain({ dA: 0.2, dB: 0.1, normalY: 0.88 });
const base = legacyGain(0.2, 0.1, 0), wall = gain({ dA: 0.2, dB: 0.1 });
assert.ok(midpoint > Math.min(base, wall) && midpoint < Math.max(base, wall), 'Slope transition blends continuously');

// Median interpolated normalY values measured from the immutable R3 Titan
// EN/WN scope camera ray grids. Those real supported walls were almost wholly
// excluded by the former .18..52 mask despite passing steep synthetic tests.
for (const normalY of [0.8075352293304353, 0.7833]) {
  assert.equal(gain({ dA: 0.2, dB: 0.1, normalY }), wall,
    'Recorded mesa sidewall slopes receive the full recipe, not a near-zero mask');
}

assert.throws(() => requireSourceContract(HORIZON_MESA_SURFACE_FRAGMENT + '\nfloat hidden = texture2D(map, uv).r;'),
  { code: 'ERR_ASSERTION' }, 'Resource budget oracle rejects another texture sample');
assert.throws(() => requireSourceContract(HORIZON_MESA_SURFACE_FRAGMENT.replace('fwidth(mesaBedPhase)', '0.0')),
  { code: 'ERR_ASSERTION' }, 'Derivative fade cannot silently disappear');
assert.throws(() => requireSourceContract(HORIZON_MESA_SURFACE_FRAGMENT.replace('0.74, 1.14', '0.10, 2.0')),
  { code: 'ERR_ASSERTION' }, 'Contrast bounds cannot be weakened unnoticed');
assert.throws(() => requireIntegration(integration.replace("${style === 'mesa' ? HORIZON_MESA_SURFACE_FRAGMENT",
  '${true ? HORIZON_MESA_SURFACE_FRAGMENT')), { code: 'ERR_ASSERTION' }, 'Unrelated styles cannot inherit the added ALU');
assert.throws(() => requireIntegration(integration.replace('horizon-ring-mesa-surface-r2', 'horizon-ring-relief-r2-mesa')),
  { code: 'ERR_ASSERTION' }, 'Stale shader cache identity is rejected');
assert.throws(() => requireIntegration(integration.replace("'#include <map_fragment>', style === 'alpine' ? ALPINE_HORIZON_MAP_FRAGMENT",
  "'#include <map_fragment>', mapId === 'verdant' ? ALPINE_HORIZON_MAP_FRAGMENT : style === 'alpine' ? ALPINE_HORIZON_MAP_FRAGMENT")),
{ code: 'ERR_ASSERTION' }, 'A map-specific fragment branch cannot silently return');
console.log('horizonMesaSurface: existing-input-only recipe, exact non-mesa/cap/sea paths, bounded broken beds, derivative fade, mesa-only integration/cache and negative controls PASS',
  JSON.stringify({ minimum, maximum, altered, nativeVisualAcceptance: 'not measured by this CPU test' }));
