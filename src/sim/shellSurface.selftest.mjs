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
assert.match(state, /import \{ classifyShellSurface, shellHitsWater, shellIncidenceDeg \} from '\.\.\/sim\/shellSurface\.ts';/);
assert.match(state, /surfaceKind: classifyShellSurface\(world, hit\),/, 'shell:expired carries the water surface kind');
assert.match(state, /hitWater: shellHitsWater\(world, hit\),/, 'shell:expired carries the water flag');
const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
assert.match(fx, /function waterSplash\(/, 'FX owns a water splash');
// the destruction-fx lane's burst (fx/blastRecipes.ts) takes the same water flag: a water burst, else the ground's
// (2026-11-02 audit U31, round 2: the ground hit also takes the round's noBurst flag, and a round whose hull drew its burst
// draws no fallback plume); (impact-materials-269) a graze skims its own ground or water forward instead (grazeSprayLow
// reads the same flag)
assert.match(fx, /if \(e\.hitTerrain\) \{\s*const water = !!e\.hitWater \|\| shellPointOnWater\(_v3\);[\s\S]{0,800}?if \(mediaGroundHit\(_v3, [^,]+, water, arrival, 0, burstDrawn, graze\)\) \{[^}]*\}\s*if \(burstDrawn\) return;\s*if \(graze && arrival\) grazeSprayLow\(_v3, arrival, e\.caliberMm \|\| 76, water\);\s*else if \(water\) waterSplash\(_v3, e\.caliberMm \|\| 76, false\);\s*else dirtPlume\(_v3, e\.caliberMm \|\| 76, false\);/,
  'expired shells on water splash instead of throwing dirt');
assert.match(fx, /case 'terrain':\s*if \(mediaGroundHit\(pos, [^,]+, shellPointOnWater\(pos\), null\)\) break;\s*if \(shellPointOnWater\(pos\)\) waterSplash\(pos, caliberMm, caliberMm >= 105\);\s*else dirtPlume\(pos, caliberMm, caliberMm >= 105\);/,
  'direct terrain impacts respect the water mask');
const audio = readFileSync(new URL('../audio/audioEngine.ts', import.meta.url), 'utf8');
assert.match(audio, /event\.surfaceKind === 'water'/, 'audio plays a splash for water expiries');
// (impact-materials-269) a water expiry strikes the water's material, and the resolver splashes it by calibre; off the
// water a round strikes the ground or the structure it hit
assert.match(audio, /const material: StruckMaterial = water \? 'water' :/, 'expiries keep the water mask');
const { impactLayers } = await import('../audio/impactMaterials.ts');
assert.equal(impactLayers('water', 'stop', 'bullet')[0].id, 'bullet_water', 'small arms splash in open water');
assert.equal(impactLayers('water', 'stop', 'autocannon')[0].id, 'water_small', 'an autocannon round splashes small');
assert.equal(impactLayers('water', 'stop', 'cannon')[0].id, 'water_big', 'a shell splashes big');
console.log('shellSurface.selftest: water classification, shore feather, prop/record precedence and the three consumers pass');
