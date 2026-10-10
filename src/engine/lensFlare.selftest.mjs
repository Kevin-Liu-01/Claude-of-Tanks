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

// 2026-10-04 (the gauntlet's wave 65 on Caldera: "a translucent circular lens-flare artifact sits directly on top of the
// mountain silhouette"): the sun above the ridge, the occlusion right; the halo's ring and the far ghost over the dark ridge
// read as the artifact — the ghosts and the halo turned down, the streak and the glow at the sun kept
{
  const flareSrc = readFileSync(new URL('./lensFlare.ts', import.meta.url), 'utf8');
  assert.match(flareSrc, /export const LENS_FLARE_PARTS = Object\.freeze\(\{ ghosts: 0\.4, halo: 0\.25, streak: 1, glow: 1 \}\);/);
  assert.match(flareSrc, /gl_FragColor = vec4\( uColor \* vis \* \( ghosts \* uParts\.x \+ halo \* uParts\.y \+ vec3\( streak \* uParts\.z \+ glow \* uParts\.w \) \), 1\.0 \);/,
    'each part takes its share');
  assert.match(flareSrc, /lightTune\('LENS_FLARE_PART_GHOSTS', LENS_FLARE_PARTS\.ghosts\)/, 'the QA reads default to the shipped shares');
}
// 2026-10-04 (the gauntlet's wave 71 on Titan Gorge: the halo's arcs drew as "a vertical rainbow" across the gorge walls
// under a closed deck): the clouds' transmittance toward the sun joins the visibility (the depth reads a deck as sky)
{
  const full = { up: 1, inFrame: 1 };
  assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full, () => 0), 0, 'a closed deck (coverage 1): no flare');
  assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full, () => 1), 1, 'a clear sky: the flare whole');
  assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full, () => 0.5), 1, 'a thin veil the sun burns through: the flare whole');
  assert.ok(near(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full, () => 0.125), 0.5), 'a veil at T 0.125: half (the gate\'s midpoint)');
  assert.equal(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full), 1, 'no cloud layer: the depth alone, as before');
  // a cloud edge across the disc: the share of the five taps that see past it
  assert.ok(near(lensFlareVisibility([0.5, 0.5], 0.02, 16 / 9, () => true, full, (u) => (u > 0.5 ? 1 : 0)), 1 / 5), 'an edge: one tap of five');
  const flareSrc = readFileSync(new URL('./lensFlare.ts', import.meta.url), 'utf8');
  assert.match(flareSrc, /float target = \( sky \/ \$\{LENS_FLARE_VIS_TAPS\.toFixed\(1\)\} \) \* clouds \* uTarget;/, 'the GPU pass multiplies the clouds in before the easing');
  assert.match(flareSrc, /clouds \+= smoothstep\( 0\.0, \$\{f\(LENS_FLARE_CLOUD_FULL\)\}, texture2D\( tClouds,/, 'through the same gate as the twin');
  assert.match(flareSrc, /export const LENS_FLARE_CLOUD_FULL = 0\.25;/);
  assert.match(flareSrc, /this\.visMaterial\.uniforms\.tClouds\.value = clouds;\s*this\.visMaterial\.uniforms\.uCloudsOn\.value = clouds && lightTune\('LENS_FLARE_CLOUD_GATE', 1\) > 0 \? 1 : 0;/, 'bound per frame from the cloud layer (QA knob, on)');
  const shaftSrc = readFileSync(new URL('./sunShafts.ts', import.meta.url), 'utf8');
  assert.match(shaftSrc, /if \( uCloudsOn > 0\.5 \) sky \*= smoothstep\( 0\.0, 0\.25, texture2D\( tClouds, vUv \)\.a \);/, 'the shafts\' mask too: a closed deck lets none through');
  const cloudSrc = readFileSync(new URL('./volumetricClouds.ts', import.meta.url), 'utf8');
  assert.match(cloudSrc, /get historyTexture\(\): THREE\.Texture \| null \{\s*return this\.active && this\.dome\.visible && this\.historyValid \? this\.domeMaterial\.uniforms\.tClouds\.value as THREE\.Texture : null;/,
    'the resolved history the dome composites (alpha: the transmittance), only while the layer draws');
}
// 2026-10-08 (fifo2 twins: with the flare on, two runs of a clip whose smoke crossed the sun differed at 2.4 % of pixels
// — the visibility eased on the wall clock, once per live render): on the Studio's export clock the visibility eases
// once per timeline step whatever the renders between steps, the first render after the clock is set (or a snap)
// jumps to its target, and released it eases on the wall clock again
{
  const THREE = await import('three');
  const { LensFlarePass } = await import('./lensFlare.ts');
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 3, -10);
  camera.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.userData.sunDirWorld = new THREE.Vector3(0, 0.3, -1).normalize();
  const pass = new LensFlarePass(camera, scene, new THREE.DepthTexture(4, 4), new THREE.WebGLRenderTarget(4, 4));
  const renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {}, setClearColor() {}, clear() {}, render() {} };
  // the CPU twin of the 1 x 1 ping-pong: v = mix(v, target, uBlend) per render (the sky taps all open)
  const targets = [0.2, 0.9, 0.9, 0.4, 0.1, 0.1, 0.7, 1, 1, 1];
  const film = (rendersPerStep) => {
    let clock = 5000;
    pass.setClock(() => clock);
    let v = 0;
    const out = [];
    for (const t of targets) {
      clock += 100;
      for (let k = 0; k < rendersPerStep; k++) {
        pass.update(true);
        pass.target = t;
        pass.render(renderer);
        v += (t - v) * pass.visMaterial.uniforms.uBlend.value;
      }
      out.push(v);
    }
    return out;
  };
  const one = film(1);
  assert.deepEqual(film(3), one, 'three live renders per step: the same visibility as one');
  assert.deepEqual(film(7), one, 'seven: the same');
  assert.equal(one[0], 0.2, 'the first render on the export clock snaps to its target (no history from the last clip)');
  const k = 1 - Math.exp(-0.1 * LENS_FLARE_EASE_RATE);
  assert.ok(near(one[1], 0.2 + (0.9 - 0.2) * k, 1e-12), 'a 100 ms step eases as 100 ms of wall time did');
  // a snap (a clip's start or a seek) jumps the next render
  pass.snap();
  pass.update(true);
  pass.target = 0.33;
  pass.render(renderer);
  assert.equal(pass.visMaterial.uniforms.uBlend.value, 1, 'a snap blends the whole way');
  // released: the wall clock (a render's dt from performance.now, capped at 0.1 s)
  pass.setClock(null);
  pass.update(true); pass.render(renderer);
  assert.equal(pass.visMaterial.uniforms.uBlend.value, 1, 'released: snaps once');
  pass.update(true); pass.render(renderer);
  const b = pass.visMaterial.uniforms.uBlend.value;
  assert.ok(b > 0 && b < 1, `then eases on the wall clock (${b})`);
  const studioSrc = readFileSync(new URL('../game/studio.ts', import.meta.url), 'utf8');
  assert.match(studioSrc, /if \(!flareOnExportClock\) \{ flareOnExportClock = true; post\.lensFlare\?\.setClock\?\.\(\(\) => clockMs\); \}/,
    'advanceFrame puts the flare on the export clock');
  assert.match(studioSrc, /restoreLoadedPresentation\(json, fxMs\);\s*\/\/[^\n]*\n\s*post\.lensFlare\?\.snap\?\.\(\);/, 'a loaded clip starts snapped');
}
console.log('lensFlare.selftest: tap disc, visibility twin, easing, frame fade, moon share, disc radius, GLSL parts and chain wiring pinned; the ghosts and the halo turned down; the clouds\' transmittance gates the flare and the shafts; the Studio export clock eases it once per step');
