// Receipt of tools/map-metrics.mjs (round 48, 2026-09-23): the three Python/PIL metrics of the AAA map program ported
// to Node must reproduce known numbers on synthetic frames that go through the real @napi-rs/canvas PNG round trip —
// a flat sky over flat ground for the skyline ratio, a stripe field of known wavelength and heading plus a seeded
// white-noise field for the FFT corduroy metric, and a two-tag capture pair with known box values for the A → B table.
// The Python parity on real frames (r43 / r47a captures) is recorded in docs/MAP-BEAUTIFICATION.md; this receipt keeps
// the semantics numpy-exact (median, percentile interpolation, hanning, fftshift, colorsys hue) without PIL.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import {
  boxStats, boxesTable, detrendPlane, fft, formatBoxesTable, formatSkylineTable, hanning, loadRgba, median,
  parseBox, percentile, powerSpectrum, resolveBoxSpec, rgbToHsv, skylineRatio, skylineTable, std, stripeMetrics,
  wallStats,
} from './map-metrics.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'cot-map-metrics-selftest-'));
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tol ${tol})`);

/** Paint a frame from a per-pixel rgb callback and write it as a real PNG. */
function writeFrame(file, width, height, rgbAt) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let y = 0, p = 0; y < height; y++) for (let x = 0; x < width; x++, p += 4) {
    const [r, g, b] = rgbAt(x, y);
    image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const target = path.join(dir, file);
  writeFileSync(target, canvas.toBuffer('image/png'));
  return target;
}

try {
  // ---------------------------------------------------------------- numpy semantics
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5, 'even count: mean of the two middle values');
  assert.ok(Number.isNaN(median([])));
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 5), 12, 'linear interpolation between order statistics');
  near(std([2, 4, 4, 4, 5, 5, 7, 9]), 2, 1e-12, 'population std');
  assert.deepEqual(hanning(1), Float64Array.of(1));
  const h5 = hanning(5);
  assert.equal(h5[0], 0); near(h5[2], 1, 1e-12, 'hann centre'); near(h5[1], 0.5, 1e-12, 'hann quarter'); near(h5[4], 0, 1e-12, 'hann end');
  const [hue, sat, val] = rgbToHsv(200 / 255, 100 / 255, 50 / 255);
  near(hue * 360, 20, 1e-9, 'colorsys hue'); near(sat, 0.75, 1e-12, 'colorsys sat'); near(val, 200 / 255, 1e-12, 'colorsys v');
  assert.deepEqual(rgbToHsv(0.3, 0.3, 0.3), [0, 0, 0.3], 'grey has hue 0');
  assert.deepEqual(parseBox('1,2,3,4'), [1, 2, 3, 4]);
  for (const bad of ['1,2,3', '3,2,1,4', '1,2,3,x', '1,2,1,4']) assert.throws(() => parseBox(bad), /box/, bad);

  // ---------------------------------------------------------------- FFT: arbitrary lengths against the direct DFT
  for (const n of [8, 12, 15, 17, 64, 97]) {
    const xr = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.7) + (i % 3) * 0.25), xi = new Float64Array(n);
    const re = Float64Array.from(xr), im = Float64Array.from(xi);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let dr = 0, di = 0;
      for (let j = 0; j < n; j++) { const a = -2 * Math.PI * j * k / n; dr += xr[j] * Math.cos(a); di += xr[j] * Math.sin(a); }
      near(re[k], dr, 1e-8, `fft n=${n} re[${k}]`); near(im[k], di, 1e-8, `fft n=${n} im[${k}]`);
    }
  }
  // fftshift places the DC bin at (h>>1, w>>1) for even and odd sizes
  for (const [h, w] of [[6, 10], [5, 7]]) {
    const flat = new Float64Array(h * w).fill(1);
    const p = powerSpectrum(flat, h, w);
    const dc = (h >> 1) * w + (w >> 1);
    near(p[dc], (h * w) ** 2, 1e-6, `dc bin ${h}x${w}`);
    let rest = 0; for (let i = 0; i < p.length; i++) if (i !== dc) rest += p[i];
    near(rest, 0, 1e-6, `no power off dc ${h}x${w}`);
  }
  // detrend removes exactly a plane
  const plane = new Float64Array(6 * 9); for (let y = 0, i = 0; y < 6; y++) for (let x = 0; x < 9; x++, i++) plane[i] = 3 + 0.5 * x - 2 * y;
  for (const v of detrendPlane(plane, 6, 9)) near(v, 0, 1e-9, 'plane residual');

  // ---------------------------------------------------------------- skyline (check 5): flat sky 200 over flat ground 100
  const skyFile = writeFrame('sky-a-sky-w.png', 800, 300, (x, y) => (y < 150 ? [200, 200, 200] : [100, 100, 100]));
  const skyImage = await loadRgba(skyFile);
  assert.equal(skyImage.width, 800); assert.equal(skyImage.rgba[0], 200, 'PNG round trip keeps the byte values');
  near(skylineRatio(skyImage), 0.5, 1e-9, 'ground/sky ratio of 100 over 200');
  // a sky darker than 60 disqualifies every column → NaN, like the Python script
  const darkFile = writeFrame('dark-a-sky-w.png', 800, 300, (x, y) => (y < 150 ? [40, 40, 40] : [10, 10, 10]));
  assert.ok(Number.isNaN(skylineRatio(await loadRgba(darkFile))), 'no qualifying column → nan');
  // the skyline is found per column: a slanted horizon still reads 0.5 where the step stays in the middle half
  const slantFile = writeFrame('slant-a-centre-far.png', 800, 300, (x, y) => (y < 120 + x / 20 ? [200, 200, 200] : [100, 100, 100]));
  near(skylineRatio(await loadRgba(slantFile)), 0.5, 1e-9, 'slanted skyline');
  const table = await skylineTable(dir, 'a', ['sky', 'dark', 'slant', 'absent'], ['sky-w', 'centre-far']);
  assert.deepEqual(table.map((r) => [r.map, Object.keys(r.ratios)]), [['sky', ['sky-w']], ['dark', ['sky-w']], ['slant', ['centre-far']], ['absent', []]]);
  assert.match(formatSkylineTable(table), /^sky {12}sky-w=0\.50\ndark {11}sky-w= nan\nslant {10}centre-far=0\.50\nabsent {9}$/m);

  // ---------------------------------------------------------------- stripe (check 8): a 256x256 stripe field with bins (12, 5)
  const stripeFile = writeFrame('stripe.png', 256, 256, (x, y) => {
    const v = Math.round(128 + 60 * Math.sin(2 * Math.PI * (12 * x + 5 * y) / 256));
    return [v, v, v];
  });
  const stripe = stripeMetrics(await loadRgba(stripeFile), [0, 0, 256, 256]);
  near(stripe.wavelengthPx, 256 / Math.hypot(12, 5), 0.05, 'stripe wavelength');
  near(stripe.angleDeg, Math.atan2(5, 12) * 180 / Math.PI, 0.05, 'stripe heading');
  assert.ok(stripe.top1Share > 0.9, `one oriented component holds the power (top1 ${stripe.top1Share})`);
  assert.ok(stripe.peakShare > 0.25, `the peak pair carries a large share (${stripe.peakShare})`);
  assert.ok(stripe.anisotropy > 4, `oriented band dominates (${stripe.anisotropy})`);
  near(stripe.stdLuma, 60 / Math.SQRT2, 0.6, 'std of a sine of amplitude 60');
  // seeded white noise: no orientation, no single component
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const noiseFile = writeFrame('noise.png', 200, 120, () => { const v = Math.round(60 + rand() * 120); return [v, v, v]; });
  const noise = stripeMetrics(await loadRgba(noiseFile), [10, 10, 190, 110]);
  assert.ok(noise.top1Share < 0.06, `noise: strongest 1 % of bins hold little (${noise.top1Share})`);
  assert.ok(noise.peakShare < 0.01, `noise: no dominant pair (${noise.peakShare})`);
  assert.ok(noise.anisotropy > 0.6 && noise.anisotropy < 1.6, `noise: isotropic (${noise.anisotropy})`);
  assert.throws(() => stripeMetrics({ width: 10, height: 10, rgba: new Uint8ClampedArray(400) }, [0, 0, 20, 10]), /exceeds/);
  // the stripe stays detectable in an odd-sized crop (Bluestein path): the peak lands on the crop's nearest frequency
  // bins (round(12/256·w)/w, round(5/256·h)/h), so the reported wavelength is that bin's, not the continuous one
  const oddW = 247, oddH = 237;
  const odd = stripeMetrics(await loadRgba(stripeFile), [3, 7, 3 + oddW, 7 + oddH]);
  const oddExpected = 1 / Math.hypot(Math.round(5 / 256 * oddH) / oddH, Math.round(12 / 256 * oddW) / oddW);
  near(odd.wavelengthPx, oddExpected, 0.05, 'odd crop wavelength on the nearest bins');
  near(odd.angleDeg, Math.atan2(Math.round(5 / 256 * oddH) / oddH, Math.round(12 / 256 * oddW) / oddW) * 180 / Math.PI, 0.05, 'odd crop heading');
  assert.ok(odd.top1Share > 0.8, `odd crop keeps the component (${odd.top1Share})`);

  // ---------------------------------------------------------------- boxes (checks 3, 4, 11): a two-tag pair with known regions
  const paint = (shaded) => (x, y) => {
    if (x >= 100 && x < 200 && y >= 100 && y < 150) return [shaded, shaded, shaded]; // shaded box
    if (x >= 300 && x < 400 && y >= 100 && y < 150) return [200, 200, 200];          // lit box
    if (x >= 500 && x < 600 && y >= 0 && y < 50) return [200, 100, 50];               // wall box
    if (y >= 200) return x < 60 ? [40, 40, 40] : [100, 100, 100];                      // ground: 10 % at 40, 90 % at 100
    return [0, 0, 0];
  };
  writeFrame('m-a-v.png', 600, 300, paint(50));
  writeFrame('m-b-v.png', 600, 300, paint(60));
  const boxes = { v: { shaded: [100, 100, 200, 150], lit: [300, 100, 400, 150], ground: [0, 200, 600, 300], wall: [500, 0, 600, 50] }, 'm/v': { lit: [300, 100, 400, 150] } };
  const spec = resolveBoxSpec(boxes, 'm', 'v');
  assert.deepEqual(spec.shaded, [100, 100, 200, 150]);
  const a = boxStats(await loadRgba(path.join(dir, 'm-a-v.png')), spec);
  near(a.shaded, 50, 1e-9, 'shaded A'); near(a.lit, 200, 1e-9, 'lit A');
  near(a.p5, 40, 1e-9, 'ground p5 inside the dark 10 %'); near(a.gmean, 94, 1e-9, 'ground mean');
  assert.equal(a.wall.text, 'rgb 200/100/50 hue 20° sat 0.75 luma 124.2');
  const wall = wallStats(await loadRgba(path.join(dir, 'm-a-v.png')), [500, 0, 600, 50]);
  near(wall.hueDeg, 20, 1e-9, 'wall hue'); near(wall.luma, 124.2, 1e-9, 'wall luma');
  const rows = await boxesTable(dir, boxes, ['m', 'z'], 'a', 'b', ['v']);
  assert.equal(rows.length, 2);
  near(rows[0].b.shaded, 60, 1e-9, 'shaded B'); assert.deepEqual(rows[1].missing, ['A', 'B']);
  const text = formatBoxesTable(rows);
  // measure.py layout: name padded to 28, then 9/9/7-wide shaded columns, 7/7/7 lit, 6/6 p5, 7/7 gmean
  const expectedRow = `${'m/v'.padEnd(28)} ${'50.0'.padStart(9)} ${'60.0'.padStart(9)} ${'+20.0%'.padStart(7)} | ${'200.0'.padStart(7)} ${'200.0'.padStart(7)} ${'+0.0%'.padStart(7)} | ${'40.0'.padStart(6)} ${'40.0'.padStart(6)} | ${'94.0'.padStart(7)} ${'94.0'.padStart(7)}`;
  assert.ok(text.split('\n').includes(expectedRow), `table row layout:\n${text}`);
  const expectedHeader = `${'map/view'.padEnd(28)} ${'shaded A'.padStart(9)} ${'shaded B'.padStart(9)} ${'d'.padStart(7)} | ${'lit A'.padStart(7)} ${'lit B'.padStart(7)} ${'d'.padStart(7)} | ${'p5 A'.padStart(6)} ${'p5 B'.padStart(6)} | ${'gmean A'.padStart(7)} ${'gmean B'.padStart(7)}`;
  assert.equal(text.split('\n')[0], expectedHeader, 'header layout');
  assert.match(text, /wall A: rgb 200\/100\/50 hue 20° sat 0\.75 luma 124\.2/);
  assert.match(text, /^z\/v: missing capture \(AB\)$/m);
  const skipped = await boxesTable(dir, { v: { shaded: [0, 0, 1, 1] } }, ['m'], 'a', 'b', ['v']);
  assert.deepEqual(skipped, [], 'a view without a ground box is skipped, as in measure.py');

  // ---------------------------------------------------------------- CLI surface
  const cli = (args) => execFileSync(process.execPath, ['tools/map-metrics.mjs', ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(cli(['--help']), /^node tools\/map-metrics\.mjs <subcommand>/);
  assert.match(cli(['skyline', dir, 'a', 'sky', 'sky-w']), /^sky {12}sky-w=0\.50/);
  const json = JSON.parse(cli(['stripe', stripeFile, '0,0,256,256', '--json']));
  assert.equal(json.length, 1); assert.equal(json[0].file, 'stripe.png'); near(json[0].wavelengthPx, stripe.wavelengthPx, 1e-9, 'cli json');
  assert.throws(() => cli(['bogus']), /Unknown subcommand/);
  assert.throws(() => cli(['stripe', stripeFile]), /pairs/);
} catch (error) {
  // 2026-09-23: one failing run of this receipt printed its assertion and then stayed alive (a sleeping process on a
  // kqueue handle); the failure path exits explicitly so a red receipt can never hold the runner.
  console.error(error);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('map-metrics.selftest: skyline 0.50 on a flat sky/ground frame, stripe (12,5)/256 recovered to 0.05 px and 0.05°, noise isotropic, boxes table A→B exact; fft n=8..97 against the direct DFT; CLI help/json/errors');
