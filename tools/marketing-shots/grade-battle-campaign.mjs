// tools/marketing-shots/grade-battle-campaign.mjs
//
// Deterministic image-level gate for the 60-frame battle campaign. Scene
// structure is enforced by gen-battle-campaign.mjs; this pass verifies the
// actual exported PNGs are complete, correctly sized, non-blank, non-clipped,
// contrast-bearing, and detailed enough to reject blurred/flat captures.
// Manual contact-sheet review remains the subject-visibility/composition gate.
//
//   node tools/marketing-shots/grade-battle-campaign.mjs \
//     --action shots/marketing-battles-r3/action-4k \
//     --foreground shots/marketing-battles-r3/foreground-4k \
//     --width 3840 \
//     --out shots/marketing-battles-r3/quality-report.json

import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const actionDir = resolve(opt('action', 'shots/marketing-battles-r3/action-4k'));
const foregroundDir = resolve(opt('foreground', 'shots/marketing-battles-r3/foreground-4k'));
const expectedWidth = Number(opt('width', '3840'));
const expectedHeight = Math.round(expectedWidth * 9 / 16);
const outFile = resolve(opt('out', 'shots/marketing-battles-r3/quality-report.json'));

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function categoryFiles(category, dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => ({ category, dir, file }));
}

const entries = [
  ...categoryFiles('action', actionDir),
  ...categoryFiles('foreground', foregroundDir),
];
if (entries.filter((entry) => entry.category === 'action').length !== 30) {
  throw new Error('action export must contain exactly 30 PNGs');
}
if (entries.filter((entry) => entry.category === 'foreground').length !== 30) {
  throw new Error('foreground export must contain exactly 30 PNGs');
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="canvas" width="320" height="180"></canvas>');

const rows = [];
for (const entry of entries) {
  const path = join(entry.dir, entry.file);
  const buffer = readFileSync(path);
  const dimensions = pngSize(buffer);
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
  const metrics = await page.evaluate(async (src) => {
    const image = new Image();
    await new Promise((resolveImage, rejectImage) => {
      image.onload = resolveImage;
      image.onerror = rejectImage;
      image.src = src;
    });
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luma = new Float32Array(canvas.width * canvas.height);
    let sum = 0;
    let dark = 0;
    let bright = 0;
    let saturation = 0;
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma[p] = y;
      sum += y;
      if (r < 8 && g < 8 && b < 8) dark++;
      if (r > 247 && g > 247 && b > 247) bright++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      saturation += max === 0 ? 0 : (max - min) / max;
    }
    const sorted = Array.from(luma).sort((a, b) => a - b);
    let edgeSum = 0;
    let edgeCount = 0;
    for (let y = 1; y < canvas.height; y++) {
      for (let x = 1; x < canvas.width; x++) {
        const index = y * canvas.width + x;
        edgeSum += Math.abs(luma[index] - luma[index - 1]);
        edgeSum += Math.abs(luma[index] - luma[index - canvas.width]);
        edgeCount += 2;
      }
    }
    const count = luma.length;
    return {
      meanLuma: sum / count,
      p05: sorted[Math.floor(count * 0.05)],
      p95: sorted[Math.floor(count * 0.95)],
      clippedBlack: dark / count,
      clippedWhite: bright / count,
      meanSaturation: saturation / count,
      edgeMean: edgeSum / edgeCount,
    };
  }, dataUrl);

  const failures = [];
  if (!dimensions || dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    failures.push(`dimensions ${dimensions?.width || 0}x${dimensions?.height || 0}`);
  }
  if (statSync(path).size < expectedWidth * expectedHeight * 0.08) failures.push('compressed/blank file size');
  if (metrics.meanLuma < 28 || metrics.meanLuma > 232) failures.push(`mean luma ${metrics.meanLuma.toFixed(1)}`);
  if (metrics.p95 - metrics.p05 < 52) failures.push(`dynamic range ${(metrics.p95 - metrics.p05).toFixed(1)}`);
  if (metrics.clippedBlack > 0.18) failures.push(`black clip ${(metrics.clippedBlack * 100).toFixed(1)}%`);
  if (metrics.clippedWhite > 0.24) failures.push(`white clip ${(metrics.clippedWhite * 100).toFixed(1)}%`);
  if (metrics.meanSaturation < 0.055) failures.push(`saturation ${metrics.meanSaturation.toFixed(3)}`);
  if (metrics.edgeMean < 3.2) failures.push(`detail/edge score ${metrics.edgeMean.toFixed(2)}`);
  rows.push({
    category: entry.category,
    file: entry.file,
    bytes: statSync(path).size,
    dimensions,
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(4))])),
    passed: failures.length === 0,
    failures,
  });
}

await browser.close();
const failures = rows.filter((row) => !row.passed);
const report = {
  generatedAt: new Date().toISOString(),
  expectedDimensions: { width: expectedWidth, height: expectedHeight },
  totals: { images: rows.length, passed: rows.length - failures.length, failed: failures.length },
  thresholds: {
    meanLuma: [28, 232], dynamicRange: 52, clippedBlackMax: 0.18,
    clippedWhiteMax: 0.24, meanSaturationMin: 0.055, edgeMeanMin: 3.2,
  },
  rows,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[grade-battle-campaign] ${report.totals.passed}/${report.totals.images} passed -> ${outFile}`);
for (const row of failures) console.error(`FAIL ${row.file}: ${row.failures.join(', ')}`);
process.exit(failures.length ? 1 : 0);
