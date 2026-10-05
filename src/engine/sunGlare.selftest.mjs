// sunGlare.selftest — the sun's glow as a gradient toward a visible disc (2026-10-04, the sun-bloom lane; the gauntlet's
// waves 46 and 50: on sun-facing views a quarter of the frame read flat white with no sun disc — Redrock's edge-e).
//
// Measured at the census pose (desktop high, 1600 × 900): the near-sun sky at L* 88, chroma 5.5, 6.6 % of the top-left near
// white (every channel ≥ 235); facing the sun a white blob over 37 % of the sun's region and no disc. Two causes: the bloom
// swallowed the disc in a halo fed by the compact glow and 0.5–0.9° of aureole kept HDR around it, and the dome's knee — a
// plateau at 1.45 raw that a camera at exposure 1.6 shows near white — flattened the aureole. Pinned here: only the disc
// stays HDR, the glow is part of the sky under the knee, and on the grounded rig the knee is set as the camera shows the
// dome (it eases from SKY_KNEE_EV[0] stops over the card toward SKY_KNEE_EV[1] stops more); the twin of that knee spreads the
// aureole over the range instead of a plateau and holds the exposed sky under the range's top.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATMO_SUN_DISC_COS } from './atmosphere.ts';

const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
const tuple = (name) => {
  const m = sky.match(new RegExp(`const ${name}: readonly \\[[^\\]]+\\] = \\[([^\\]]+)\\];`));
  assert.ok(m, `sky.ts declares ${name}`);
  return m[1].split(',').map((v) => v.trim());
};

// ---- 1. the dome: the glow under the knee, the exemption at the disc's own edge, the disc after
assert.match(sky, /vec3 sunGlowCol = vec3\( 1\.30, 1\.02, 0\.68 \) \* \( pow\( max\( cosSun, 0\.0 \), 240\.0 \) \* uSunGlow \* discK \);\s*skyCol \+= sunGlowCol \* uSunSpot\.z;[\s\S]{0,300}float sunSpot = smoothstep\( uSunSpot\.x, uSunSpot\.y, cosSun \);\s*skyCol = mix\( atmoKnee\( skyCol \), skyCol, sunSpot \);[\s\S]{0,400}skyCol \+= uSunTransmittance \* \( disc \* uSunDiscRadiance \* discK \);\s*skyCol \+= sunGlowCol \* \( 1\.0 - uSunSpot\.z \);/,
  'the glow\'s share under the knee before it, the rest after the disc');
// (2026-10-04, wave 62 on Titan Gorge: a hard white disc through a closed deck) under a closed deck no disc and no
// clear-air aureole: the brighter patch where the deck thins is the cloud layer's forward scatter
assert.match(sky, /float discK = 1\.0 - uDeckClosed \* uDiscDeckFade;/, 'the disc and the glow go with the closed deck');
assert.match(sky, /u\.uDiscDeckFade\.value = lightTune\('SKY_DISC_DECK_FADE', 1\);/, 'on by default (QA knob)');
assert.deepEqual(tuple('SKY_SUN_SPOT'), ['ATMO_SUN_DISC_COS - 0.00002', 'ATMO_SUN_DISC_COS'], 'only the disc keeps its HDR (the old spot kept 0.5–0.9° of aureole)');
assert.match(sky, /const SKY_GLOW_IN_KNEE = 1;/, 'the whole glow under the knee: only the disc can reach the bloom\'s threshold');
assert.match(sky, /uSunSpot: \{ value: new THREE\.Vector3\(SKY_SUN_SPOT\[0\], SKY_SUN_SPOT\[1\], SKY_GLOW_IN_KNEE\) \},/);
assert.match(sky, /\(u\.uSunSpot\.value as THREE\.Vector3\)\.set\(lightTune\('SKY_SUN_SPOT_FROM', SKY_SUN_SPOT\[0\]\), lightTune\('SKY_SUN_SPOT_TO', SKY_SUN_SPOT\[1\]\),\s*lightTune\('SKY_GLOW_IN_KNEE', SKY_GLOW_IN_KNEE\)\);/);
const spotFrom = ATMO_SUN_DISC_COS - 0.00002, spotDeg = Math.acos(spotFrom) * 180 / Math.PI, discDeg = Math.acos(ATMO_SUN_DISC_COS) * 180 / Math.PI;
assert.ok(spotDeg - discDeg < 0.15, `the exemption ends ${(spotDeg - discDeg).toFixed(3)}° past the disc's edge (it reached 0.9°)`);

// ---- 2. the knee as the camera shows the dome, on the grounded rig
const [EV_START, EV_RANGE, EV_RATE] = tuple('SKY_KNEE_EV').map(Number);
assert.ok(EV_START >= 1.5 && EV_START <= 2.2 && EV_RANGE >= 1 && EV_RANGE <= 2 && EV_RATE > 0, 'a start over the sunlit range, a range of a stop or two');
assert.match(sky, /const kneeEv = lightTune\('SKY_KNEE_EV_START', SKY_KNEE_EV\[0\]\);\s*if \(kneeEv > 0 && model\.mode === 'physical' && model\.exposure > 0\) \{\s*const scale = 0\.18 \/ \(model\.exposure \* Math\.max\(preset\.skyIntensity, 1e-3\)\);\s*const start = scale \* 2 \*\* kneeEv, range = scale \* \(2 \*\* \(kneeEv \+ lightTune\('SKY_KNEE_EV_RANGE', SKY_KNEE_EV\[1\]\)\) - 2 \*\* kneeEv\);\s*\(u\.uAtmoKnee\.value as THREE\.Vector3\)\.set\(start, range, lightTune\('SKY_KNEE_EV_RATE', SKY_KNEE_EV\[2\]\) \/ start\);\s*atmosphereState\.knee\.copy\(u\.uAtmoKnee\.value as THREE\.Vector3\);/,
  'the dome, the aerial pass\'s target and the cloud trace read the same knee');
// the twin (atmosphere.ts atmoKnee): c *= (x + y (1 − exp(−(l − x) z))) / l above x
const knee = (l, x, y, z) => (l > x ? x + y * (1 - Math.exp(-(l - x) * z)) : l);
for (const exposure of [1.2, 1.6, 2.6]) {
  const scale = 0.18 / exposure, start = scale * 2 ** EV_START, range = scale * (2 ** (EV_START + EV_RANGE) - 2 ** EV_START), z = EV_RATE / start;
  const stops = (l) => Math.log2(knee(l, start, range, z) * exposure / 0.18);
  // the aureole from 1.5 to 10 times the start spreads over most of the range (a gradient), and never past its top
  const lo = stops(1.5 * start), hi = stops(10 * start), top = stops(1e6 * start);
  assert.ok(hi - lo > 0.6 * EV_RANGE, `exposure ${exposure}: the aureole spans ${(hi - lo).toFixed(2)} of the range's ${EV_RANGE} stops (a gradient, not a plateau)`);
  assert.ok(top <= EV_START + EV_RANGE + 1e-9, `exposure ${exposure}: the exposed sky stays at or under ${EV_START + EV_RANGE} stops over the card`);
  // under the start the sky is untouched (a blue sky, the horizon on a clear day)
  assert.equal(knee(0.9 * start, start, range, z), 0.9 * start);
}

console.log(`sunGlare.selftest: only the disc HDR (the exemption ends ${(spotDeg - discDeg).toFixed(3)}° past its edge), the glow under the knee, the knee as the camera shows the dome (${EV_START} → ${EV_START + EV_RANGE} stops over the card; the aureole a gradient across it) PASS`);
