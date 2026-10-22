// lampLightShape.selftest.mjs — (240, the coordinator: a street lamp's pooled light "washes the facade evenly up to the
// roofline") the night pool's town lamps light as lanterns in three's own point-light path: marked by their decay, the
// light kept below the glass and within a metre of it (the head's warm halo), fading up the wall above it, the pool under
// it brighter; every other point light untouched. The shaped GLSL is mirrored on the CPU below and tied to its text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { LAMP_LIGHT_DECAY, shapeLampPointLights } from './lampLightShape.ts';

const before = THREE.ShaderChunk.lights_pars_begin;
assert.ok(shapeLampPointLights(), 'the anchor is three\'s own point-light attenuation');
const after = THREE.ShaderChunk.lights_pars_begin;
assert.notEqual(after, before);
assert.ok(shapeLampPointLights() && THREE.ShaderChunk.lights_pars_begin === after, 'idempotent');
assert.equal(after.match(/cotLampUp =/g)?.length, 1, 'one lantern block, in the point light\'s path');
assert.match(after, /if \( abs\( pointLight\.decay - 2\.0040 \) < 0\.0015 \)/, 'only the marked lamp lights');
assert.ok(Math.abs(LAMP_LIGHT_DECAY - 2) > 0.0015 * 2, 'the muzzle, burst and fire lights (decay 2) are never marked');
// the night pool's building lights carry the mark; the renderer installs the shape before any compile
const runtime = readFileSync(new URL('./nightLightingRuntime.ts', import.meta.url), 'utf8');
assert.match(runtime, /new THREE\.PointLight\(0xffd79e, 0, 18, LAMP_LIGHT_DECAY\)/, 'the pool\'s lamp lights are marked');
assert.match(readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8'), /limitPointLightFalloff\(\);[\s\S]{0,200}shapeLampPointLights\(\);/);

// the CPU mirror: the factor a lamp's light takes at a point `up` metres over its glass and `out` metres off it
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const num = (re) => Number(after.match(re)[1]);
const floorCut = num(/1\.0 - ([0-9.]+) \* cotLampAbove/), halo = num(/smoothstep\( ([0-9.]+), [0-9.]+, lightDistance \)/);
const fade = num(/smoothstep\( [0-9.]+, ([0-9.]+), lightDistance \)/), pool = num(/1\.0 \+ ([0-9.]+) \* smoothstep\( 0\.55, 0\.95/);
const shape = (up, out) => {
  const d = Math.hypot(up, out), s = up / d;
  return (1 - floorCut * smooth(0.05, 0.75, s) * smooth(halo, fade, d)) * (1 + pool * smooth(0.55, 0.95, -s));
};
assert.equal(shape(-3, 1), shape(-3, 1), 'sanity');
assert.ok(Math.abs(shape(0.6, 0.6) - 1) < 0.05, `the wall within a metre of the glass keeps its light (${shape(0.6, 0.6).toFixed(2)})`);
assert.ok(shape(0, 2) === 1 && shape(-1, 3) === 1, 'level with the glass and below it: unchanged');
assert.ok(shape(4, 1.2) < 0.25, `the wall a storey over the lamp falls dark (${shape(4, 1.2).toFixed(2)})`);
assert.ok(shape(-3.9, 0.2) > 1.3, `the pavement under the lamp takes more (${shape(-3.9, 0.2).toFixed(2)})`);
console.log(`lampLightShape: the town lamps light as lanterns — the halo kept (${shape(0.6, 0.6).toFixed(2)}), a storey up ${shape(4, 1.2).toFixed(2)}, the pool ${shape(-3.9, 0.2).toFixed(2)}; every other point light untouched`);
