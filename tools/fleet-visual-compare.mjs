// Compare two deterministic tank-asset directories at the pixel level.
// Reports global SSIM, normalized absolute error, changed-pixel ratio and
// alpha-silhouette IoU for every shared tank/view pair.
//
// Usage:
//   node tools/fleet-visual-compare.mjs --before=/tmp/before --after=/tmp/after
//   node tools/fleet-visual-compare.mjs --before ... --after ... --strict
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const beforeDir = resolve(option('before'));
const afterDir = resolve(option('after'));
if (!option('before') || !option('after')) {
  console.error('Usage: node tools/fleet-visual-compare.mjs --before=<dir> --after=<dir> [--strict]');
  process.exit(2);
}
const outputPath = resolve(option('out', '.qa-device/fleet-visual-comparison.json'));
const minSsim = Number(option('min-ssim', '0.985'));
const minSilhouetteIou = Number(option('min-silhouette-iou', '0.99'));
const maxEdgeShiftPx = Number(option('max-edge-shift', '5'));
const strict = args.includes('--strict');
const selectedIds = new Set(option('ids').split(',').map((id) => id.trim()).filter(Boolean));
const selectedViews = new Set(option('views').split(',').map((view) => view.trim()).filter(Boolean));

const beforeManifest = JSON.parse(readFileSync(resolve(beforeDir, 'tank-assets.json'), 'utf8'));
const afterManifest = JSON.parse(readFileSync(resolve(afterDir, 'tank-assets.json'), 'utf8'));
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="a"></canvas><canvas id="b"></canvas>');

const dataUrl = (dir, asset) => {
  const base64 = readFileSync(resolve(dir, asset.file)).toString('base64');
  return `data:${asset.mime};base64,${base64}`;
};

const rows = [];
const ids = Object.keys(beforeManifest.tanks || {}).filter((id) =>
  afterManifest.tanks?.[id] && (!selectedIds.size || selectedIds.has(id)));
try {
  for (const id of ids) {
    const beforeAssets = beforeManifest.tanks[id].assets || {};
    const afterAssets = afterManifest.tanks[id].assets || {};
    for (const view of Object.keys(beforeAssets)) {
      if (!afterAssets[view] || (selectedViews.size && !selectedViews.has(view))) continue;
      const beforeAsset = beforeAssets[view];
      const afterAsset = afterAssets[view];
      const result = await page.evaluate(async (beforeUrl, afterUrl) => {
        const load = (src) => new Promise((resolveImage, reject) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => reject(new Error('image decode failed'));
          image.src = src;
        });
        const drawPixels = (canvas, image, width, height) => {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, width, height).data;
        };
        const updateBounds = (bounds, index, present, pixel, width) => {
          if (!present) return;
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          const box = bounds[index];
          box.minX = Math.min(box.minX, x);
          box.maxX = Math.max(box.maxX, x);
          box.minY = Math.min(box.minY, y);
          box.maxY = Math.max(box.maxY, y);
        };
        const comparePixels = (a, b, width, height) => {
          const bounds = [
            { minX: width, minY: height, maxX: -1, maxY: -1 },
            { minX: width, minY: height, maxX: -1, maxY: -1 },
          ];
          const totals = {
            alphaIntersection: 0, alphaUnion: 0, absError: 0, changed: 0,
            samples: 0, sumA: 0, sumB: 0, sumAA: 0, sumBB: 0, sumAB: 0,
          };
          for (let offset = 0, pixel = 0; offset < a.length; offset += 4, pixel += 1) {
            const presentA = a[offset + 3] > 8;
            const presentB = b[offset + 3] > 8;
            if (presentA || presentB) totals.alphaUnion += 1;
            if (presentA && presentB) totals.alphaIntersection += 1;
            updateBounds(bounds, 0, presentA, pixel, width);
            updateBounds(bounds, 1, presentB, pixel, width);
            let pixelError = 0;
            for (let channel = 0; channel < 4; channel += 1) {
              pixelError += Math.abs(a[offset + channel] - b[offset + channel]);
            }
            totals.absError += pixelError;
            if (pixelError / 4 > 8) totals.changed += 1;
            if (!(presentA || presentB)) continue;
            const lumA = 0.2126 * a[offset] + 0.7152 * a[offset + 1] + 0.0722 * a[offset + 2];
            const lumB = 0.2126 * b[offset] + 0.7152 * b[offset + 1] + 0.0722 * b[offset + 2];
            totals.sumA += lumA;
            totals.sumB += lumB;
            totals.sumAA += lumA * lumA;
            totals.sumBB += lumB * lumB;
            totals.sumAB += lumA * lumB;
            totals.samples += 1;
          }
          return { bounds, ...totals };
        };
        const structuralSimilarity = (stats) => {
          const meanA = stats.samples ? stats.sumA / stats.samples : 0;
          const meanB = stats.samples ? stats.sumB / stats.samples : 0;
          const varianceA = stats.samples > 1
            ? (stats.sumAA - stats.samples * meanA * meanA) / (stats.samples - 1) : 0;
          const varianceB = stats.samples > 1
            ? (stats.sumBB - stats.samples * meanB * meanB) / (stats.samples - 1) : 0;
          const covariance = stats.samples > 1
            ? (stats.sumAB - stats.samples * meanA * meanB) / (stats.samples - 1) : 0;
          const c1 = 6.5025;
          const c2 = 58.5225;
          const denominator = (meanA * meanA + meanB * meanB + c1)
            * (varianceA + varianceB + c2);
          return denominator
            ? ((2 * meanA * meanB + c1) * (2 * covariance + c2)) / denominator : 1;
        };
        const [beforeImage, afterImage] = await Promise.all([load(beforeUrl), load(afterUrl)]);
        if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
          return {
            width: beforeImage.width,
            height: beforeImage.height,
            dimensionMismatch: [afterImage.width, afterImage.height],
          };
        }
        const width = beforeImage.width;
        const height = beforeImage.height;
        const canvases = [document.getElementById('a'), document.getElementById('b')];
        const pixels = canvases.map((canvas, index) =>
          drawPixels(canvas, index ? afterImage : beforeImage, width, height));
        const [a, b] = pixels;
        const stats = comparePixels(a, b, width, height);
        const ssim = structuralSimilarity(stats);
        const edgeShiftPx = Math.max(
          Math.abs(stats.bounds[0].minX - stats.bounds[1].minX),
          Math.abs(stats.bounds[0].minY - stats.bounds[1].minY),
          Math.abs(stats.bounds[0].maxX - stats.bounds[1].maxX),
          Math.abs(stats.bounds[0].maxY - stats.bounds[1].maxY),
        );
        return {
          width,
          height,
          dimensionMismatch: null,
          ssim,
          normalizedAbsoluteError: stats.absError / (width * height * 4 * 255),
          changedPixelRatio: stats.changed / (width * height),
          silhouetteIou: stats.alphaUnion ? stats.alphaIntersection / stats.alphaUnion : 1,
          edgeShiftPx,
          beforeBounds: stats.bounds[0],
          afterBounds: stats.bounds[1],
        };
      }, dataUrl(beforeDir, beforeAsset), dataUrl(afterDir, afterAsset));
      const pass = !result.dimensionMismatch && result.ssim >= minSsim &&
        result.silhouetteIou >= minSilhouetteIou && result.edgeShiftPx <= maxEdgeShiftPx;
      rows.push({ id, view, beforeFile: beforeAsset.file, afterFile: afterAsset.file, pass, ...result });
      process.stdout.write(`\r[fleet-visual] ${rows.length} ${id}/${view}          `);
    }
  }
} finally {
  process.stdout.write('\n');
  await browser.close();
}

const failures = rows.filter((row) => !row.pass);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  beforeDir,
  afterDir,
  thresholds: { minSsim, minSilhouetteIou, maxEdgeShiftPx },
  summary: {
    comparisons: rows.length,
    passed: rows.length - failures.length,
    failed: failures.length,
    minimumSsim: Math.min(...rows.map((row) => row.ssim ?? -1)),
    minimumSilhouetteIou: Math.min(...rows.map((row) => row.silhouetteIou ?? -1)),
    maximumEdgeShiftPx: Math.max(...rows.map((row) => row.edgeShiftPx ?? Infinity)),
  },
  failures,
  rows,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[fleet-visual] ${report.summary.passed}/${report.summary.comparisons} comparisons pass -> ${outputPath}`);
if (strict && failures.length) process.exitCode = 1;
