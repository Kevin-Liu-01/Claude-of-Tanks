// Tank hero cards: the policy and compositor invariants, CPU only (no WebGL, no capture lock).
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { GARAGE_CAMERA_AZIMUTH_RAD, GARAGE_CAMERA_PITCH_RAD } from '../src/game/garagePresentationPose.ts';
import { HERO_CAMERA, HERO_FLAG, HERO_FLAG_MASK, HERO_CARD_SIZES } from './hero-card-policy.mjs';
import {
  CARD_LAYOUT, applyFlagMask, drawTank, flagMaskStops, heroFlagMaskCss, measureCore, renderFlagLayer,
} from './hero-cards-compose.mjs';

const deg = (rad) => rad * 180 / Math.PI;

// 1. The card shows the tank much as the showroom does: bow to screen-left (the roster convention, owner
//    2026-09-20), the camera on the Garage camera's flank, within 10 deg of its azimuth (the r4 pick leans toward
//    the owner's more side-on reference) and 2 deg of its pitch.
assert.equal(HERO_CAMERA.facing, 'left', 'hero cards face the Garage hero (bow toward screen-left)');
assert.ok(Math.abs(HERO_CAMERA.azimuthDeg - deg(GARAGE_CAMERA_AZIMUTH_RAD)) <= 10, `hero azimuth ${HERO_CAMERA.azimuthDeg} within 10 deg of the Garage camera`);
assert.ok(HERO_CAMERA.azimuthDeg > 0 && HERO_CAMERA.azimuthDeg < 90, 'front three-quarter: the glacis and the flank both show');
assert.ok(Math.abs(HERO_CAMERA.elevationDeg - deg(GARAGE_CAMERA_PITCH_RAD)) <= 2, `hero elevation ${HERO_CAMERA.elevationDeg} within 2 deg of the Garage pitch`);

// 2. One mask, two renderers: the CSS string carries the compositor's stops and mirrors with the facing.
const stops = flagMaskStops();
assert.deepEqual(stops[0], [0, 1]);
assert.equal(stops.at(-1)[0], 1);
assert.equal(stops.at(-1)[1], 0);
for (let i = 1; i < stops.length; i++) assert.ok(stops[i][1] <= stops[i - 1][1], 'mask alpha falls monotonically');
const css = heroFlagMaskCss();
const pct = (ratio) => Number((ratio * 100).toFixed(2));
assert.ok(css.startsWith(`radial-gradient(ellipse ${pct(HERO_FLAG_MASK.radiusX)}% ${pct(HERO_FLAG_MASK.radiusY)}% at ${pct(HERO_FLAG_MASK.anchorX)}% 0%`), css);
for (const [t, a] of stops) assert.ok(css.includes(`rgba(0,0,0,${a}) ${(t * 100).toFixed(1)}%`), `css stop ${t}`);
assert.ok(heroFlagMaskCss(HERO_FLAG_MASK, 'right').includes(` at ${pct(1 - HERO_FLAG_MASK.anchorX)}% 0%`), 'mask mirrors for facing right');

// 3. The compositor mask: opaque at the rear-top corner, clear toward the gun side and the floor.
{
  const w = 200, h = 120;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  applyFlagMask(ctx, w, h, { opacity: 1 });
  const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  assert.ok(alpha(Math.round(w * HERO_FLAG_MASK.anchorX) - 1, 1) > 245, 'opaque at the anchor');
  assert.equal(alpha(2, h - 2), 0, 'clear at the gun-side floor corner');
  assert.ok(alpha(w - 2, 2) > alpha(w / 2, 2) && alpha(w / 2, 2) >= alpha(w * 0.2, 2), 'fades toward the gun');
}

// 4. Cards never cut the gun: a synthetic layer (hull block + a long barrel to the left) fits every layout.
{
  const lw = 400, lh = 250;
  const layer = createCanvas(lw, lh);
  const lctx = layer.getContext('2d');
  lctx.fillStyle = '#7a7a62';
  lctx.fillRect(120, 120, 220, 90); // hull + turret mass (the dense core)
  lctx.fillRect(10, 140, 120, 6); // the barrel, muzzle at x = 10
  const core = measureCore(layer);
  assert.ok(core.full.x0 <= 11 && core.full.x1 >= 339, 'full silhouette spans the barrel and the hull');
  assert.ok(core.x0 > 60, 'the dense core ignores the thin barrel');
  for (const [kind, layout] of Object.entries(CARD_LAYOUT)) {
    const size = HERO_CARD_SIZES[kind];
    const w = size.width * 2, h = size.height * 2, artH = h - size.nameBandPx * 2;
    const card = createCanvas(w, h);
    const { scale, dx } = drawTank(card.getContext('2d'), layer, core, {
      w, artH, baseline: artH, coreShare: layout.coreShare, coreHeight: layout.coreHeight, centerX: layout.centerX,
    });
    const muzzle = dx + core.full.x0 * scale, rear = dx + core.full.x1 * scale;
    assert.ok(muzzle >= w * 0.035 - 0.5 && rear <= w * 0.965 + 0.5, `${kind}: whole tank inside the card (${muzzle.toFixed(1)}..${rear.toFixed(1)} of ${w})`);
  }
}

// 5. The flag is the obverse: the hoist (FR blue) lies toward the gun, the fly (FR red) toward the rear edge,
//    and the fly runs off the layer's far edge (no visible end).
{
  const w = 320, h = 200;
  const flag = await renderFlagLayer('fr', HERO_FLAG, { width: w, height: h });
  const fctx = flag.getContext('2d');
  const row = Math.round(h * 0.35);
  const px = fctx.getImageData(0, row, w, 1).data;
  let first = -1;
  for (let x = 0; x < w; x++) if (px[x * 4 + 3] > 200) { first = x; break; }
  assert.ok(first > w * (HERO_FLAG.hoistX - 0.05), `the hoist sits near hoistX (first cloth at ${first})`);
  const at = (x) => [px[x * 4], px[x * 4 + 1], px[x * 4 + 2]];
  const [hr, , hb] = at(first + Math.round(w * 0.05));
  const [fr, , fb] = at(w - 3);
  assert.ok(hb > hr, 'hoist band is blue (obverse, toward the gun)');
  assert.ok(fr > fb, 'fly band is red (toward the rear edge)');
  assert.ok(px[(w - 1) * 4 + 3] > 200, 'the fly runs off the far edge');
}

console.log('hero-cards selftest: ok');
