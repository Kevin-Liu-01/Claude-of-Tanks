// horizonPanoramaFarEarth.selftest — the skies lane (2026-10-07; the far-earth knobs' pair far3 and pano-diag, the
// coordinator's call): a high camera's view of the shell. Pins: the far earth and the high camera's apron from the column's
// near ground ship on (they took the white lip off the ring's skyline from the bird with no change at ground cameras); the
// land patches and the sea fade are gone (the fade left Nordhavn's slabs); and the ground meet — a high camera's ray down
// the wall shows what the bake eye saw where that ray meets the ground, or nothing over open water inside the game's sea
// apron — with its gates (the wall only, the law's sky published, cameras over 120 m, the meet past the shell and inside
// the strip's far country) and its arithmetic on a CPU twin (the census bird over the shell's horizon row). No GPU or art
// claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HORIZON_PANORAMA } from './horizonPanorama.ts';

const source = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');

// 1. the knobs: two on, the ground meet on, the dropped two gone
assert.ok(/const PANO_FAR_EARTH_NEAR = 1;\s*const PANO_APRON_HIGH = 1;/.test(source), 'the near ground for the far earth and the high apron ship on');
assert.ok(/const PANO_GROUND_MEET = 1;\s*const PANO_GROUND_MEET_M = 8500;/.test(source), 'the ground meet on, inside the strip\'s far country');
const camGate = Number(/const PANO_GROUND_MEET_CAMERA_M = (\d+);/.exec(source)?.[1]);
assert.ok(camGate >= 100 && camGate <= 160, `cameras over ${camGate} m only: never a ground, tank-height or establishing camera (~50 m)`);
for (const gone of ['PANO_FAR_EARTH_VARY', 'PANO_FAR_SEA_FADE', 'uPanoFarVary', 'uPanoSeaFade']) assert.ok(!source.includes(gone), `${gone} is gone`);
for (const knob of ['PANO_FAR_EARTH_NEAR', 'PANO_APRON_HIGH', 'PANO_GROUND_MEET']) {
  assert.ok(source.includes(`lightTune('${knob}', ${knob})`), `${knob} stays a QA knob`);
}

// 2. the shell fragment's ground meet
for (const [needle, what] of [
  ['if (uPanoGroundMeet > 0.5 && vPanoApron < 0.5 && uPanoHaze.w > 0.5', 'the wall only, with the law\'s sky published'],
  ['&& cameraPosition.y - uPanoHaze.z > ${PANO_GROUND_MEET_CAMERA_M.toFixed(1)} && vPanoWorld.y < cameraPosition.y) {', 'a high camera, looking down'],
  ['float meetH = (cameraPosition.y - uPanoHaze.z) * hm / max(cameraPosition.y - vPanoWorld.y, 1e-3);', 'where the ray meets the datum'],
  ['if (meetH > hm && rM > ${P.shellM.toFixed(1)} && rM < ${PANO_GROUND_MEET_M.toFixed(1)}) {', 'past the shell, inside the far country'],
  ['float eM = atan(uPanoHaze.z - uPanoEye.y, rM);', 'the meet point\'s elevation from the bake eye'],
  ['vec2 meetUv = vec2(fract(atan(mp.y, mp.x) * 0.15915494309),', 'and its own azimuth from the eye'],
  ['if (atMeet.a < 0.5) { if (rM < ${SEA_APRON_OUTER_RADIUS_M.toFixed(1)}) discard; }', 'open water inside the sea apron: the water plane shows'],
  ['else { pano = atMeet; panoUv = meetUv; e = eM; }', 'land: what the eye saw there (its cloud shade at its own place)'],
  ['az = panoUv.x * 6.2831853;', 'the far land\'s cloud shade at the texel\'s own azimuth'],
]) assert.ok(source.includes(needle), what);
const at = (needle) => source.indexOf(needle);
assert.ok(at('vec4 nearTap = ') < at('if (uPanoGroundMeet > 0.5') && at('if (uPanoGroundMeet > 0.5') < at('if (pano.a < 0.5) {'),
  'the meet decides the texel before the fill and the atlas branches read it');

// 3. the arithmetic (CPU twin): the census bird (world y 304, the datum ~0) over a wall point at the bake eye's horizon
const P = HORIZON_PANORAMA, datum = 0;
const meet = (cam, wall) => {
  const vm = [wall[0] - cam[0], wall[1] - cam[1], wall[2] - cam[2]];
  const hm = Math.hypot(vm[0], vm[2]);
  const meetH = (cam[1] - datum) * hm / Math.max(cam[1] - wall[1], 1e-3);
  const mp = [cam[0] + vm[0] * meetH / hm, cam[2] + vm[2] * meetH / hm];
  const rM = Math.hypot(mp[0], mp[1]);
  return { meetH, hm, rM, eDeg: Math.atan2(datum - P.eyeY, rM) * 180 / Math.PI };
};
{
  // looking out along the bird's own bearing: a wall point 2.6 km out at the eye's height
  const cam = [-420, 304, -420], dir = [-Math.SQRT1_2, -Math.SQRT1_2], wall = [dir[0] * P.shellM, P.eyeY, dir[1] * P.shellM];
  const m = meet(cam, wall);
  assert.ok(m.meetH > m.hm && m.rM > P.shellM && m.rM < 8500, `the bird's ray past the horizon row meets the ground ${(m.rM / 1000).toFixed(1)} km out`);
  assert.ok(m.eDeg < -0.15 && m.eDeg > -0.8, `which the bake eye saw ${m.eDeg.toFixed(2)} degrees down: the strip's near rows`);
  // the painting's own row (the eye's horizon) lies above it: the cylinder's parallax the meet undoes
  const shellDepressionDeg = Math.atan2(cam[1] - wall[1], Math.hypot(wall[0] - cam[0], wall[2] - cam[2])) * 180 / Math.PI;
  assert.ok(shellDepressionDeg > 4, `from the bird that row lies ${shellDepressionDeg.toFixed(1)} degrees under its horizon`);
}
{
  // the establishing camera (world y ~50) is under the gate; a tank-height camera too
  for (const y of [50, 3]) assert.ok(y - datum <= camGate, `a camera at ${y} m keeps the painting`);
}

console.log(`horizonPanoramaFarEarth.selftest: the near-ground far earth and high apron on, the patches and the sea fade gone, the ground meet (wall only, cameras over ${camGate} m, past the shell to 8.5 km, open water inside the sea apron discarded) and its arithmetic from the census bird PASS; no GPU/art claim`);
