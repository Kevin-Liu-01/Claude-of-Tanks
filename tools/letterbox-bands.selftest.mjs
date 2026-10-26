// The letterbox-band judge (tools/letterbox-bands.mjs) on synthetic frames: the bars a contain fit or an overlay draws
// are found, a dark picture is not. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

import { letterboxBands } from './letterbox-bands.mjs';

/** An RGBA frame: `paint(x, y)` gives each pixel's colour. */
const frame = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
};
// a picture: a busy, deterministic texture of mid tones
const noise = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const picture = (x, y) => [60 + (noise(x, y) % 120), 70 + ((noise(y, x) >> 3) % 100), 50 + ((noise(x + 7, y) >> 5) % 90)];
const SCRIM = [5, 8, 11];
const judge = ({ data, width, height }) => letterboxBands(data, width, height);

assert.deepEqual(judge(frame(320, 180, picture)), [], 'a full picture has no bands');
// a 4:3 picture fitted whole into a 16:9 box: pillars left and right
assert.deepEqual(judge(frame(320, 180, (x, y) => (x < 40 || x >= 280 ? SCRIM : picture(x, y)))),
  [{ axis: 'left and right', sizes: [40, 40], colour: SCRIM }]);
// a 21:9 picture fitted into a 16:9 box: bars above and below
assert.deepEqual(judge(frame(320, 180, (x, y) => (y < 22 || y >= 158 ? SCRIM : picture(x, y)))),
  [{ axis: 'top and bottom', sizes: [22, 22], colour: SCRIM }]);
// the battle load's cinematic bars laid over its art (5.5vh at 1080: 59 px)
assert.equal(judge(frame(1920, 1080, (x, y) => (y < 59 || y >= 1021 ? [7, 9, 12] : picture(x, y))))[0]?.axis, 'top and bottom');
// a night scene: dark, but neither uniform nor mirrored
assert.deepEqual(judge(frame(320, 180, (x, y) => [4 + (noise(x, y) % 24), 6 + (noise(y, x) % 20), 10 + (noise(x, y) % 26)])), [], 'a dark picture is no band');
// a dark sky on one edge only, and hairline edges, are not letterboxing
assert.deepEqual(judge(frame(320, 180, (x, y) => (y < 30 ? SCRIM : picture(x, y)))), [], 'one edge is not a pair');
assert.deepEqual(judge(frame(320, 180, (x, y) => (y < 2 || y >= 178 ? SCRIM : picture(x, y)))), [], 'under 4 px is a border, not a band');
// a light band (a page's paper) is not scrim
assert.deepEqual(judge(frame(320, 180, (x, y) => (y < 22 || y >= 158 ? [240, 240, 236] : picture(x, y)))), [], 'only near-black bands');

console.log('letterbox-bands.selftest: pillars, bars and overlays are found; dark pictures, one-sided skies and hairlines are not');
