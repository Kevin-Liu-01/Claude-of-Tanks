import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyShellSurface, shellHitsWater } from './shellSurface.ts';

const world = (mask) => ({ heightField: { getWaterMaskAt: () => mask } });
const hit = (kind, record = null) => ({ kind, point: { x: 1, z: 2 }, record });

assert.equal(shellHitsWater(world(0.9), hit('terrain')), true, 'open water under a terrain hit');
assert.equal(shellHitsWater(world(0.5), hit('terrain')), false, 'the shore feather at exactly half stays dirt');
assert.equal(shellHitsWater(world(0.2), hit('terrain')), false);
assert.equal(shellHitsWater(world(0.9), hit('prop')), false, 'prop hits are never water');
assert.equal(shellHitsWater(world(NaN), hit('terrain')), false, 'a broken mask reads as dirt');
assert.equal(shellHitsWater({ heightField: {} }, hit('terrain')), false, 'maps without a water mask stay dirt');
assert.equal(shellHitsWater(null, hit('terrain')), false);
assert.equal(classifyShellSurface(world(0.9), hit('terrain')), 'water');
assert.equal(classifyShellSurface(world(0.1), hit('terrain')), 'terrain');
assert.equal(classifyShellSurface(world(0.9), hit('prop', { kind: 'fenceplank' })), 'fenceplank', 'record kind wins for props');
assert.equal(classifyShellSurface(world(0.1), hit(undefined)), 'terrain');

// The three consumers read the same classification.
const state = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
assert.match(state, /import \{ classifyShellSurface, shellHitsWater \} from '\.\.\/sim\/shellSurface\.ts';/);
assert.match(state, /surfaceKind: classifyShellSurface\(world, hit\),/, 'shell:expired carries the water surface kind');
assert.match(state, /hitWater: shellHitsWater\(world, hit\),/, 'shell:expired carries the water flag');
const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
assert.match(fx, /function waterSplash\(/, 'FX owns a water splash');
assert.match(fx, /if \(e\.hitTerrain\) \{\s*if \(e\.hitWater \|\| shellPointOnWater\(_v3\)\) waterSplash\(_v3, e\.caliberMm \|\| 76, false\);\s*else dirtPlume\(_v3, e\.caliberMm \|\| 76, false\);/,
  'expired shells on water splash instead of throwing dirt');
assert.match(fx, /case 'terrain':\s*if \(shellPointOnWater\(pos\)\) waterSplash\(pos, caliberMm, caliberMm >= 105\);\s*else dirtPlume\(pos, caliberMm, caliberMm >= 105\);/,
  'direct terrain impacts respect the water mask');
const audio = readFileSync(new URL('../audio/audio.ts', import.meta.url), 'utf8');
assert.match(audio, /event\.surfaceKind === 'water'/, 'audio plays a splash for water expiries');
assert.match(audio, /function synthWaterImpact\(/);
console.log('shellSurface.selftest: water classification, shore feather, prop/record precedence and the three consumers pass');
