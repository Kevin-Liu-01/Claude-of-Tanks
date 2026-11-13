// volumeCardBody.selftest.mjs — dust-orient-271 (the owner 2026-11-09, looking down on a track's dust: "theyre all like
// parallel with each other"): a media card's aspect is its body's shape in the world, never the screen's. A wide card is
// a flat ellipsoid on its own seeded bearing and a tall one a column; the card drawn is that body's silhouette from the
// camera. The law below mirrors VOLUME_VERT's lines (asserted present) and checks what it draws: a round puff unchanged,
// a skirt wide and low from the chase as before, and from above a field of ellipses with no shared orientation.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVolumeMedia, VOLUME_FLAT_SHORT, VOLUME_FLAT_THIN_MIN } from './volumeMedia.ts';
import { trackSkirt, dustSurge } from './blastRecipes.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { mulberry32 } from './particles.ts';
import { makeChunkPiece } from './debrisChunks.ts';

const soft = { uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) }, uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 } };
const mat = createVolumeMedia({ soft, now: () => 0, capacity: 16 }).group.children[0].material;
const vs = mat.vertexShader;
assert.ok(!/float px = position\.x \* aspect;/.test(vs), 'no card is stretched along the screen\'s own x axis');
assert.match(vs, /vec3 bh = fract\( \( aPB\.xyz \+ aVL\.xyz \* 1\.7 \+ vec3\( aVL\.w \* 3\.1 \) \) \* 0\.1031 \);/,
  'the body\'s bearing and shape are seeded by its own birth place, launch and life (never the clock a rebase shifts)');
assert.match(vs, /vec2 bodyC = mat2\( sxx \+ sDet, sxy, sxy, syy \+ sDet \) \* position\.xy \* sNorm;/, 'the silhouette: the square root of the projected body');
assert.match(vs, /float bodyThin = clamp\( sqrt\( aspect \/ sDet \), 0\.70, 1\.0 \);/, 'the thinning: the square root of the growth, floored');
assert.match(vs, /aCA\.w \* fadeIn \* near \* \( 1\.0 - 0\.75 \* big \) \* bodyThin \);/, 'a body seen across its flat side is thinner');

const fract = (x) => x - Math.floor(x);
/** VOLUME_VERT's body law in JS: the card's corner offsets (card units, before rotation and size) and the opacity scale. */
function silhouette(p, right, up) {
  const aspect = Math.max(Math.abs(p.aspect), 0.25);
  let b = [p.x + p.vx * 1.7 + p.life * 3.1, p.y + p.vy * 1.7 + p.life * 3.1, p.z + p.vz * 1.7 + p.life * 3.1].map((v) => fract(v * 0.1031));
  const d = b[0] * (b[1] + 33.33) + b[1] * (b[2] + 33.33) + b[2] * (b[0] + 33.33);
  b = b.map((v) => v + d);
  const yaw = fract((b[0] + b[1]) * b[2]) * Math.PI * 2;
  const wide = aspect >= 1;
  let rS = 1 + (aspect - 1) * (VOLUME_FLAT_SHORT.min + (VOLUME_FLAT_SHORT.max - VOLUME_FLAT_SHORT.min) * fract((b[0] + b[2]) * b[1]));
  const rK = wide ? aspect / Math.sqrt(0.5 * (aspect * aspect + rS * rS)) : 1;
  const rL = wide ? aspect * rK : aspect;
  rS = wide ? rS * rK : aspect;
  const ax = [Math.cos(yaw), Math.sin(yaw)];
  const pL = [(right[0] * ax[0] + right[2] * ax[1]) * rL, (up[0] * ax[0] + up[2] * ax[1]) * rL];
  const pS = [(right[2] * ax[0] - right[0] * ax[1]) * rS, (up[2] * ax[0] - up[0] * ax[1]) * rS];
  const pV = [right[1], up[1]];
  const sxx = pL[0] ** 2 + pS[0] ** 2 + pV[0] ** 2, sxy = pL[0] * pL[1] + pS[0] * pS[1] + pV[0] * pV[1], syy = pL[1] ** 2 + pS[1] ** 2 + pV[1] ** 2;
  const sDet = Math.sqrt(Math.max(sxx * syy - sxy * sxy, 1e-6)), sNorm = 1 / Math.sqrt(Math.max(sxx + syy + 2 * sDet, 1e-6));
  const m = [(sxx + sDet) * sNorm, sxy * sNorm, (syy + sDet) * sNorm];
  // the silhouette's long axis on the card plane (radians, mod pi) and its half-axes
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const tr = sxx + syy, disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 / 4 + sxy * sxy));
  return { m, ang, major: Math.sqrt(tr / 2 + disc), minor: Math.sqrt(Math.max(0, tr / 2 - disc)), thin: Math.min(1, Math.max(VOLUME_FLAT_THIN_MIN, Math.sqrt(aspect / sDet))) };
}
const camera = (pitchDeg, yawDeg = 0) => {
  const p = (pitchDeg * Math.PI) / 180, y = (yawDeg * Math.PI) / 180;
  const fwd = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
  const right = [Math.cos(y), 0, -Math.sin(y)].map((v) => -v); // forward x up
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { right, up };
};

// a round puff is a sphere: its card is the old one at every view
{
  const puff = { ...makeVolumePuff(), x: 3.2, y: 0.4, z: -7.1, vx: 1, vy: 2, vz: 0.5, life: 3, aspect: 1 };
  for (const [pitch, yaw] of [[0, 0], [-35, 40], [-65, 200], [-89, 10]]) {
    const { right, up } = camera(pitch, yaw), s = silhouette(puff, right, up);
    assert.ok(Math.abs(s.m[0] - 1) < 1e-6 && Math.abs(s.m[1]) < 1e-6 && Math.abs(s.m[2] - 1) < 1e-6 && s.thin === 1, `round puff unchanged at ${pitch}°`);
  }
}

// the track's skirt bodies, as the trail lays them (one track, 40 m of travel)
const skirts = [];
{
  const rand = mulberry32(271);
  const media = [];
  const ctx = { rand, groundY: () => 0, media: (p) => media.push({ ...p }), distBoost: () => 1, tier: 1, m: makeVolumePuff(), k: makeChunkPiece() };
  for (let i = 0; i < 40; i++) trackSkirt(ctx, 0.3 * Math.sin(i * 0.2), 0, i * 1.2, 0, 1, 0.9, 'sand', 1.6, -i * 0.08);
  const sm = [];
  const sctx = { ...ctx, media: (p) => sm.push({ ...p }) };
  dustSurge(sctx, 0, 0, 0, 1.2, 'sand', 0);
  skirts.push(...media, ...sm);
}
assert.ok(skirts.length >= 50 && skirts.every((p) => p.aspect >= 2), 'wide cards: the skirt and the surge');

// from the chase (level to -12°) a skirt stays a wide, low card: on average the old width, never taller than wide
for (const pitch of [0, -12]) {
  const { right, up } = camera(pitch, 0);
  let ratio2 = 0;
  for (const p of skirts) {
    const s = silhouette(p, right, up);
    assert.ok(s.m[0] > s.m[2] * 1.2, `chase ${pitch}°: a skirt body reads wider than tall`);
    ratio2 += (s.m[0] / p.aspect) ** 2;
  }
  const rms = Math.sqrt(ratio2 / skirts.length);
  assert.ok(rms > 0.85 && rms < 1.15, `chase ${pitch}°: the skirt's width holds the old card's on average (rms ${rms.toFixed(3)})`);
}

// from above (-65° and straight down) the skirt is a field of ellipses with no shared orientation: the long axes spread
// over every bearing (no 30° sector holds over a quarter of them), the shapes vary, and each is thinner than edge-on
for (const pitch of [-65, -89]) {
  for (const yaw of [0, 37]) {
    const { right, up } = camera(pitch, yaw);
    const bins = new Array(6).fill(0);
    const elong = [];
    for (const p of skirts) {
      const s = silhouette(p, right, up);
      bins[Math.floor(((s.ang + Math.PI / 2) / Math.PI) * 6) % 6]++;
      elong.push(s.major / Math.max(s.minor, 1e-6));
      assert.ok(s.thin >= VOLUME_FLAT_THIN_MIN && s.thin <= 1, 'the thinning is bounded');
    }
    const top = Math.max(...bins) / skirts.length;
    assert.ok(top < 0.3, `top ${pitch}°/${yaw}°: the long axes share no orientation (largest 30° sector ${(top * 100).toFixed(0)} %)`);
    elong.sort((a, b) => a - b);
    assert.ok(elong[Math.floor(elong.length * 0.9)] / elong[Math.floor(elong.length * 0.1)] > 1.15, `top ${pitch}°: the bodies' shapes vary`);
    assert.ok(elong.at(-1) < 3, `top ${pitch}°: no body is a long sliver from above`);
  }
}

// a tall card (an ejecta jet) is a column: from the side the old tall card, from straight above a small round blob
{
  const jet = { ...makeVolumePuff(), x: 1, y: 0.5, z: 2, vx: 0.4, vy: 9, vz: -0.2, life: 1.2, aspect: 0.6 };
  const side = silhouette(jet, ...Object.values(camera(0, 0)));
  assert.ok(Math.abs(side.m[0] - 0.6) < 1e-6 && Math.abs(side.m[2] - 1) < 1e-6, 'a jet from the side: the old tall card');
  const down = silhouette(jet, ...Object.values(camera(-89.9, 0)));
  assert.ok(down.major < 0.62 && down.major / down.minor < 1.05 && down.thin === 1, 'a jet from straight above: a small round blob, no thicker');
}
console.log(`volumeCardBody selftest: ok (${skirts.length} skirt and surge bodies)`);
