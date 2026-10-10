import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// Ground lane (2026-10-05, Longleaf's wave: "a mirror-like specular streak baked into the centre of every dirt road
// regardless of viewing angle"; mr4 traced it to the ruts' puddles, gRoadPuddle at a mirror's roughness 0.12, on every
// vegetated map's dirt roads): a map's share of the puddles and their mud (splat.roadPuddles, default 1 — today's), and
// the puddle's mirror only near the camera — past ~20 m it is wet ground, a damp matte by ~36 m. Pins: the uniform and
// its default, the share on the puddles and the mud, the roughness ramp and its numbers, every map's share in range.
// No GPU or art claim.

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ');
for (const line of [
  'uniform float uRoadPuddle;',
  'shader.uniforms.uRoadPuddle = { value: S.roadPuddles ?? 1 };',
  'float wet = rut * dW * (1.0 - farM * 0.6) * uRoadPuddle;',
  'gRoadPuddle = wet * pool;',
  'float mud = wet * smoothstep(0.52, 0.66, nzq(uv, 0.071, vec2(0.83, 0.11)).x + hollow * 0.18) * (1.0 - gRoadPuddle);',
  'gSplatRough = mix(gSplatRough, mix(0.12, 0.62, smoothstep(16.0, 36.0, camDist)), gRoadPuddle);',
]) assert.ok(source.includes(line.replace(/\s+/g, ' ')), `the material: ${line}`);
assert.ok(!source.includes('gSplatRough = mix(gSplatRough, 0.12, gRoadPuddle);'), 'no puddle mirrors at every distance');

// the ramp: a mirror to ~16 m, wet ground's matte by 36 m
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rough = (d) => 0.12 + (0.62 - 0.12) * smooth(16, 36, d);
assert.equal(rough(8), 0.12);
assert.equal(rough(16), 0.12);
assert.ok(Math.abs(rough(26) - 0.37) < 1e-9, 'halfway at 26 m');
assert.equal(rough(36), 0.62);
assert.equal(rough(300), 0.62);

// every map's share: absent (today's 1) or a share in [0, 1]
for (const id of MAP_IDS) {
  const v = getMapConfig(id).splat?.roadPuddles;
  assert.ok(v === undefined || (Number.isFinite(v) && v >= 0 && v <= 1), `${id}: roadPuddles ${v}`);
}

console.log('roadPuddleGloss: the map\'s share of the puddles and their mud (default today\'s), the mirror near the camera only (16–36 m ramp), every map\'s share in range PASS; no GPU/art claim');
