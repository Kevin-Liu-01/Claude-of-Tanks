// horizonPanoramaFarAir.selftest — the skies lane (2026-10-07; the gauntlet's wave 200 on Glacier and Nordhavn: "far snow
// peaks crisper than nearer ridges", "peaks floating over a fog band"): the regional air's floor over the far path past
// the shell. Pins: the knob (0 on every character and region but the alpine mountains', so Saltwind's pinned far ridge
// and every rolling, coastal and desert country keep their bake), the maps it reaches through the bake's own character
// path, the strip's mix and its uniform, and the worked transmittances on a CPU twin of the bake's split (the aerial pass
// over the shell's depth, the bake past it): a far summit recedes behind the ring's ridges while the low far ground keeps
// its haze. And the near band's press (2026-10-07: the flat top of Glacier's white band is its level line): QA knobs read at
// each bake, at rest the press as it shipped. No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HORIZON_PANORAMA, HORIZON_PANORAMA_CHARACTERS, HORIZON_PANORAMA_REGIONAL, HORIZON_PANORAMA_SHADERS, resolveHorizonPanoramaCharacter,
} from './horizonPanorama.ts';
import { resolveHorizonReliefCharacter } from './horizonRelief.ts';
import { HAZE_LAYER_SCALE_M, HAZE_SIGMA_PER_FOG } from '../engine/hazeLaw.ts';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/mapIds.ts';

// 1. the floor: the alpine mountains' only
for (const [name, c] of Object.entries(HORIZON_PANORAMA_CHARACTERS)) {
  if (name === 'alpine') assert.ok(c.farAirFloor > 0 && c.farAirFloor < 0.5, 'the alpine mountains take a floor under half the ground\'s density');
  else assert.equal(c.farAirFloor, 0, `${name}: no floor`);
}
for (const [name, c] of Object.entries(HORIZON_PANORAMA_REGIONAL)) assert.equal(c.farAirFloor, 0, `${name} (regional): no floor`);

// 2. the maps it reaches, through the bake's own path (maps/horizon.ts: the relief character, the panorama's overrides)
const floorOf = (id) => {
  const H = getMapConfig(id).horizon;
  if (!H || H.panorama === false) return null;
  return resolveHorizonPanoramaCharacter(resolveHorizonReliefCharacter(H, id), typeof H.panorama === 'object' ? H.panorama : undefined).farAirFloor;
};
const reached = MAP_IDS.filter((id) => (floorOf(id) ?? 0) > 0).sort();
assert.deepEqual(reached, ['alpine', 'fjord'], `the floor reaches Glacier and Nordhavn only (${reached.join(', ')})`);
assert.equal(floorOf('saltwind'), 0, 'Saltwind\'s far ridge (the bake receipt\'s pin) keeps its bake');

// 3. the strip: the mix between the layer's mean and the far path's transmittance; the uniform carries the knob
const strip = HORIZON_PANORAMA_SHADERS.strip;
const at = (needle) => { const i = strip.indexOf(needle); assert.ok(i >= 0, `the strip holds: ${needle}`); return i; };
const layerAt = at('float layer = hazeLayerMean(max(uFrame.w - uHaze.z, 0.0) * uHaze.y, max(wp.y - uHaze.z, 0.0) * uHaze.y);');
const mixAt = at('layer = mix(layer, 1.0, uAir.w);');
const pathAt = at('vec3 T = hazeTransmittance(uHaze.x * uAir.x, max(0.0, rr - uFrame.z), layer, uHazeChroma);');
assert.ok(layerAt < mixAt && mixAt < pathAt, 'the floor mixes the layer\'s mean before the far path\'s transmittance');
const source = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');
assert.ok(source.includes("uAir: { value: new THREE.Vector4(ch.air, ch.fillLaw, ch.rockFloor, lightTune('PANO_FAR_AIR_FLOOR', ch.farAirFloor)) },"),
  'uAir.w carries the character\'s floor (a QA knob over it, read at each bake)');

// 3b. the near band's press (2026-10-07): QA knobs read at each bake, at rest the press as it shipped (a cap 0.03 under the
// ring's skyline, a seventh of the excess kept, no wander), the wander only where asked
const height = HORIZON_PANORAMA_SHADERS.height;
assert.ok(/const PANO_NEAR_CAP = 0\.03;\s*const PANO_NEAR_SQUASH = 0\.15;\s*const PANO_NEAR_WANDER = 0;/.test(source), 'the press at rest: 0.03, 0.15, no wander');
assert.ok(source.includes("uNearBand: { value: new THREE.Vector4(lightTune('PANO_NEAR_CAP', PANO_NEAR_CAP), lightTune('PANO_NEAR_SQUASH', PANO_NEAR_SQUASH),")
  && source.includes("lightTune('PANO_NEAR_WANDER', PANO_NEAR_WANDER), 0) },"), 'the knobs reach the height pass at each bake');
for (const needle of [
  'uniform vec4 uNearBand;',
  'if (uNearBand.z > 0.0) {',
  'float nearCap = uFrame.w + r * (edge.a - uNearBand.x + capWander);',
  'if (h > nearCap) h = mix(h, nearCap + (h - nearCap) * uNearBand.y, nearW);',
]) assert.ok(height.includes(needle), `the height pass: ${needle}`);

// 4. the worked numbers on Glacier's air: the bake's split (the aerial pass over the shell's depth from the bake eye,
// the layer's mean between the eye and the ray's height at the shell; the bake over the rest, the layer's mean between the
// eye and the point, mixed with the floor), the datum at 0
const sigma = getMapConfig('alpine').sky.fogDensity * HAZE_SIGMA_PER_FOG;
const H = HAZE_LAYER_SCALE_M, { shellM, eyeY } = HORIZON_PANORAMA;
const mean = (a0, a1) => (Math.abs(a0 - a1) < 1e-3 ? Math.exp(-0.5 * (a0 + a1)) : (Math.exp(-a1) - Math.exp(-a0)) / (a0 - a1));
const T = (d, h, floor) => {
  const near = Math.min(d, shellM), hs = eyeY + (h - eyeY) * (near / d);
  const post = Math.exp(-sigma * near * mean(eyeY / H, hs / H));
  if (d <= shellM) return post;
  const m = mean(eyeY / H, h / H) * (1 - floor) + floor;
  return post * Math.exp(-sigma * (d - shellM) * m);
};
const floor = HORIZON_PANORAMA_CHARACTERS.alpine.farAirFloor;
const ridge = T(2000, 200, floor);                                   // the ring's ridge, 200 m up at 2 km (the aerial pass only)
const summit0 = T(8500, 2000, 0), summit = T(8500, 2000, floor);    // a far summit 2 km up at 8.5 km
const foot0 = T(8500, 300, 0), foot = T(8500, 300, floor);          // its foot, 300 m up
assert.equal(ridge, T(2000, 200, 0), 'the ring\'s own ridges keep their haze (inside the shell: the aerial pass only)');
assert.ok(summit < summit0 * 0.8, `a far summit recedes: T ${summit0.toFixed(3)} -> ${summit.toFixed(3)}`);
assert.ok(summit < ridge * 0.65, `a far summit well behind the ring's ridge (${summit.toFixed(3)} against ${ridge.toFixed(3)})`);
assert.ok(foot > foot0 * 0.85, `the low far ground keeps its haze (T ${foot0.toFixed(3)} -> ${foot.toFixed(3)})`);
assert.ok(summit / foot < 0.85 * (summit0 / foot0), `less of a summit floating over its hazed foot (${(summit0 / foot0).toFixed(2)} -> ${(summit / foot).toFixed(2)})`);

console.log(`horizonPanoramaFarAir.selftest: the floor ${floor} on the alpine mountains only (${reached.join(', ')}; Saltwind 0), the strip's mix before the far path's transmittance and its uniform, and on Glacier's air a far summit at T ${summit0.toFixed(2)} -> ${summit.toFixed(2)} behind the ring's ridge at ${ridge.toFixed(2)}, its foot ${foot0.toFixed(3)} -> ${foot.toFixed(3)}; the near band's press knobs at rest as shipped PASS; no GPU/art claim`);
