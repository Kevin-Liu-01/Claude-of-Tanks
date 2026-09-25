// Round 69 (2026-09-24): lens flare — the occlusion disc (24 golden-angle taps over the sun, the CPU twin of the
// 1 × 1 visibility pass), its easing, the in-frame fade, the moon's share under the night dome, the disc radius
// per fov, the flare's parts in the GLSL and the pass's place in the chain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LENS_FLARE_DISC_DEG, LENS_FLARE_EASE_RATE, LENS_FLARE_GAIN, LENS_FLARE_GHOSTS, LENS_FLARE_MOON, LENS_FLARE_VIS_TAPS,
  lensFlareDiscRadiusUv, lensFlareEase, lensFlareFrameFade, lensFlareTapOffsets, lensFlareVisibility,
} from './lensFlare.ts';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1. the tap disc: 24 points, inside the unit disc, radii growing along the spiral (a full-disc estimate)
const taps = lensFlareTapOffsets();
assert.equal(taps.length, LENS_FLARE_VIS_TAPS);
assert.equal(LENS_FLARE_VIS_TAPS, 24);
let lastR = 0;
for (const [x, y] of taps) {
  const r = Math.hypot(x, y);
  assert.ok(r <= 1 + 1e-12 && r >= lastR - 1e-12, 'inside the disc, radii non-decreasing');
  lastR = r;
}
assert.ok(near(taps[0][0] * taps[0][0] + taps[0][1] * taps[0][1], 0.5 / 24, 1e-12), 'the first tap sits at sqrt(0.5 / 24)');

// 2. visibility: the fraction of the disc that sees sky, × the sun-height and in-frame factors
const full = { up: 1, inFrame: 1 };
assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full), 1, 'open sky: fully visible');
assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => false, full), 0, 'behind a hull: none');
{
  const half = lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, (u) => u >= 0.5, full);
  assert.ok(half > 0.35 && half < 0.65, `a skyline through the disc's middle: about half (${half.toFixed(3)})`);
  const quarterPlane = lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, (u, v) => u >= 0.5 && v >= 0.5, full);
  assert.ok(quarterPlane > 0.15 && quarterPlane < 0.35, 'a corner of the disc');
}
assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, { up: 0, inFrame: 1 }), 0, 'a sun at the horizon\'s edge fades');
assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, { up: 1, inFrame: 0 }), 0, 'out of frame: none');
{
  // the aspect correction keeps the disc round: taps span the same uv height as width / aspect
  const seenU = [], seenV = [];
  lensFlareVisibility([0.5, 0.5], 0.05, 2, (u, v) => { seenU.push(u); seenV.push(v); return true; }, full);
  const spanU = Math.max(...seenU) - Math.min(...seenU), spanV = Math.max(...seenV) - Math.min(...seenV);
  const xs = taps.map((t) => t[0]), ys = taps.map((t) => t[1]);
  const expectedU = (Math.max(...xs) - Math.min(...xs)) * 0.05 / 2, expectedV = (Math.max(...ys) - Math.min(...ys)) * 0.05;
  assert.ok(near(spanU, expectedU, 1e-9) && near(spanV, expectedV, 1e-9), 'the disc is half as wide in uv on a 2:1 frame');
}

// 3. the easing: converges, never overshoots, the dt clamp keeps a hitch frame from snapping
assert.ok(near(lensFlareEase(0, 1, 1 / 60), 1 - Math.exp(-LENS_FLARE_EASE_RATE / 60)));
assert.ok(lensFlareEase(1, 0, 1 / 60) < 1 && lensFlareEase(1, 0, 1 / 60) > 0);
assert.ok(near(lensFlareEase(0, 1, 5), lensFlareEase(0, 1, 0.1)), 'dt is clamped to 100 ms');
{
  let v = 0;
  for (let i = 0; i < 60; i++) v = lensFlareEase(v, 1, 1 / 60);
  assert.ok(v > 0.99, 'converged within a second');
}

// 4. in-frame fade and the moon
assert.equal(lensFlareFrameFade(0.2, -0.3, true), 1);
assert.ok(near(lensFlareFrameFade(0.9, 0, true), 1), 'full to ninety percent of the frame');
assert.equal(lensFlareFrameFade(1, 0, true), 0, 'gone at the edge');
assert.ok(near(lensFlareFrameFade(0.95, 0, true), 0.5), 'half way across the last tenth');
assert.equal(lensFlareFrameFade(0, 0, false), 0, 'behind the camera');
assert.ok(LENS_FLARE_MOON <= 0.15 && LENS_FLARE_MOON > 0, 'the moon flares faintly, never like the sun');
assert.ok(LENS_FLARE_GAIN > 0 && LENS_FLARE_GAIN <= 0.08, 'restrained');

// 5. the disc radius per fov: a 1.6° disc over a 55° fov, larger when zoomed in
assert.equal(LENS_FLARE_DISC_DEG, 1.6);
const r55 = lensFlareDiscRadiusUv(55);
assert.ok(near(r55, Math.tan(0.8 * Math.PI / 180) / Math.tan(27.5 * Math.PI / 180) * 0.5, 1e-12));
assert.ok(lensFlareDiscRadiusUv(15) > r55 * 3, 'the same disc covers more of a narrow frame');

// 6. the GLSL: four ghosts on the flipped axis, one halo, one streak, a small glow; 24 depth taps; additive
const source = readFileSync(new URL('./lensFlare.ts', import.meta.url), 'utf8');
assert.equal(LENS_FLARE_GHOSTS.length, 4);
assert.ok(LENS_FLARE_GHOSTS.some((g) => g.a > 0) && LENS_FLARE_GHOSTS.some((g) => g.a < 0), 'ghosts on both sides of the image centre');
assert.ok(LENS_FLARE_GHOSTS.every((g) => g.r > 0.02 && g.r < 0.1 && g.k > 0 && g.k <= 0.6), 'small, faint ghosts');
assert.match(source, /ghosts \*= smoothstep\( 0\.03, 0\.22, length\( s \) \);/, 'the ghosts vanish onto a centred sun');
assert.match(source, /float streak = exp\( -\( q\.x \* q\.x \) \* 7\.0 \) \* exp\( -\( q\.y \* q\.y \) \* 3200\.0 \)/, 'a thin horizontal streak through the sun');
assert.match(source, /float glow = exp\( -length\( q \) \* 9\.0 \)/, 'a small glow');
assert.match(source, /smoothstep\( 0\.22, 0\.72, length\( s \) \) \* 0\.22/, 'the halo strengthens as the sun nears the edge');
assert.match(source, /sky \+= step\( 0\.9999999, texture2D\( tDepth, uSun \+ vec2\(/, 'the visibility pass samples the resolved depth over the disc');
assert.match(source, /blending: THREE\.AdditiveBlending, transparent: true/, 'the flare adds into the shared light target');
assert.match(source, /if \( vis <= 0\.001 \) \{ gl_FragColor = vec4\( 0\.0 \); return; \}/, 'an occluded sun draws nothing');
assert.match(source, /if \(this\.clearTarget\) \{/, 'the pass clears the shared target when the shafts pass did not run');
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(post, /lensFlare\.update\(lightFx\.lensFlare\);\s*lensFlare\.clearTarget = !lightFx\.sunShafts;/, 'per-frame update and the clear hand-off follow the levers');
assert.match(post, /new LensFlarePass\(camera, scene, sceneDepth, lightFxTarget\)/, 'the flare tests occlusion against the resolved scene depth');

console.log('lensFlare.selftest: tap disc, visibility twin, easing, frame fade, moon share, disc radius, GLSL parts and chain wiring pinned');
