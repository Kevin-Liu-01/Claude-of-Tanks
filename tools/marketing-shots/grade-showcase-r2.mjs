// Image-level quality gate for the 40-frame R2 showcase. Composition still
// receives contact-sheet review; this gate rejects incomplete, blank, clipped,
// flat, undersized, or incorrectly dimensioned masters.

import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const rawDir = resolve(option('raw', join(ROOT, 'shots/showcase-r2/raw')));
const outFile = resolve(option('out', join(ROOT, 'shots/showcase-r2/quality-report.json')));
const config = JSON.parse(readFileSync(join(HERE, 'showcase-r2.json'), 'utf8'));

const pngSize = (buffer) => {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="canvas" width="320" height="180"></canvas>');

const rows = [];
for (const shot of config.shots) {
  const file = join(rawDir, shot.source);
  const buffer = readFileSync(file);
  const dimensions = pngSize(buffer);
  const expected = shot.sourceType === 'mobile'
    ? { width: 860, height: 1864 }
    : config.sourceDimensions;
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
    for (let index = 0, pixel = 0; index < rgba.length; index += 4, pixel += 1) {
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
      const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      luma[pixel] = value;
      sum += value;
      if (red < 8 && green < 8 && blue < 8) dark += 1;
      if (red > 247 && green > 247 && blue > 247) bright += 1;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      saturation += max === 0 ? 0 : (max - min) / max;
    }
    const sorted = Array.from(luma).sort((a, b) => a - b);
    let edgeSum = 0;
    let edgeCount = 0;
    for (let y = 1; y < canvas.height; y += 1) {
      for (let x = 1; x < canvas.width; x += 1) {
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
  }, `data:image/png;base64,${buffer.toString('base64')}`);

  const isInterface = ['garage', 'interface'].includes(shot.kind);
  const limits = isInterface
    ? { minLuma: 18, blackMax: 0.38, saturationMin: 0.03, edgeMin: 2.2 }
    : { minLuma: 24, blackMax: 0.28, saturationMin: 0.045, edgeMin: 2.8 };
  const failures = [];
  if (!dimensions || dimensions.width !== expected.width || dimensions.height !== expected.height) {
    failures.push(`dimensions ${dimensions?.width || 0}x${dimensions?.height || 0}`);
  }
  if (statSync(file).size < expected.width * expected.height * 0.045) failures.push('compressed/blank file size');
  if (metrics.meanLuma < limits.minLuma || metrics.meanLuma > 232) {
    failures.push(`mean luma ${metrics.meanLuma.toFixed(1)}`);
  }
  if (metrics.p95 - metrics.p05 < 48) failures.push(`dynamic range ${(metrics.p95 - metrics.p05).toFixed(1)}`);
  if (metrics.clippedBlack > limits.blackMax) failures.push(`black clip ${(metrics.clippedBlack * 100).toFixed(1)}%`);
  if (metrics.clippedWhite > 0.24) failures.push(`white clip ${(metrics.clippedWhite * 100).toFixed(1)}%`);
  if (metrics.meanSaturation < limits.saturationMin) failures.push(`saturation ${metrics.meanSaturation.toFixed(3)}`);
  if (metrics.edgeMean < limits.edgeMin) failures.push(`detail/edge score ${metrics.edgeMean.toFixed(2)}`);
  rows.push({
    id: shot.id,
    kind: shot.kind,
    file: shot.source,
    bytes: statSync(file).size,
    dimensions,
    metrics: Object.fromEntries(Object.entries(metrics)
      .map(([key, value]) => [key, Number(value.toFixed(4))])),
    passed: failures.length === 0,
    failures,
  });
}

await browser.close();
const failures = rows.filter((row) => !row.passed);
const report = {
  generatedAt: new Date().toISOString(),
  expectedCount: config.expectedCount,
  totals: { images: rows.length, passed: rows.length - failures.length, failed: failures.length },
  rows,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[grade-showcase-r2] ${report.totals.passed}/${report.totals.images} passed -> ${outFile}`);
for (const row of failures) console.error(`FAIL ${row.id}: ${row.failures.join(', ')}`);
process.exit(failures.length ? 1 : 0);

