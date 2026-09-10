#!/usr/bin/env node
// Opt-in isolated native Canvas2D A/B; never builds or loads the game.
// node tools/height-canvas-readback-probe.mjs --out=/absolute/fresh-directory
//   [--quality=high] [--seed=24301] [--warmups=1] [--repetitions=3]
//   [--finish=modern|bolted|zimmerit-modern|zimmerit-bolted] [--timeout-ms=120000]
// Timings include the actual height painter + normal generator, not albedo,
// roughness, final normal-canvas copy, texture upload, or end-to-end frames.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { materialTextureDimensions } from '../src/vehicles/materials.ts';
import { createCaptureLock } from './capture-lock.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const hint = 'canvas2d(canvas, { willReadFrequently: true })';
const finishes = {
  modern: { modernWelds: true, zimmerit: false },
  bolted: { modernWelds: false, zimmerit: false },
  'zimmerit-modern': { modernWelds: true, zimmerit: true },
  'zimmerit-bolted': { modernWelds: false, zimmerit: true },
};

export function parseHeightProbeOptions(args) {
  const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
  const quality = option('quality', 'high'), finish = option('finish', 'modern');
  if (!['low', 'ai', 'preview', 'high'].includes(quality)) throw new Error('Invalid quality');
  if (!Object.hasOwn(finishes, finish)) throw new Error('Invalid finish');
  const integer = (name, fallback, min, max) => {
    const value = Number(option(name, String(fallback)));
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
    return value;
  };
  const out = option('out', '');
  if (!out) throw new Error('Required: --out=/absolute/fresh-directory');
  return { out: resolve(out), quality, size: materialTextureDimensions(quality).map,
    finish, visual: finishes[finish], seed: integer('seed', 0x5eed, 0, 0xffffffff),
    warmups: integer('warmups', 1, 0, 3), repetitions: integer('repetitions', 3, 1, 12),
    timeoutMs: integer('timeout-ms', 120000, 1000, 300000) };
}

export function extractHeightProbeOwners(source) {
  const slice = (first, next) => {
    const start = source.indexOf(first), end = source.indexOf(next, start + first.length);
    if (start < 0 || end <= start) throw new Error(`Missing actual owner: ${first}`);
    return source.slice(start, end);
  };
  const owners = [
    slice('export function fillHeightNormalRows(', 'export function applyPatchRoughnessPixels('),
    slice('  function canvas2d(', '  function hexToRgb('),
    slice('  const _grainTiles =', '  function paintCamo('),
    slice('  function paintSteelHeightUndulation(', '  function paintRoughness('),
  ].join('\n').replace('export function fillHeightNormalRows', 'function fillHeightNormalRows');
  // Keep the rejected candidate reproducible when production retains its
  // original default context. Toggle ONLY paintHeight, never other canvases.
  const heightStart = owners.indexOf('  function paintHeight(');
  const heightEnd = owners.indexOf('  function* heightToNormalSteps(', heightStart);
  if (heightStart < 0 || heightEnd <= heightStart) throw new Error('Missing actual paintHeight function');
  const height = owners.slice(heightStart, heightEnd);
  const baselineHeight = height.replace(hint, 'canvas2d(canvas)');
  const baselineContext = 'const ctx = canvas2d(canvas);';
  if (baselineHeight.split(baselineContext).length !== 2) {
    throw new Error('Expected exactly one default first-context height acquisition');
  }
  const candidateHeight = baselineHeight.replace(baselineContext, `const ctx = ${hint};`);
  const before = owners.replace(height, baselineHeight);
  const after = owners.replace(height, candidateHeight);
  // Same injected HTML-canvas factory as the shared painter's synchronous
  // owner. Numeric/painter bodies above come from materialPainter.ts verbatim.
  const prefix = `function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }\n`;
  const suffix = '\nreturn { makeCanvas, mulberry32, genPlateFeatures, paintHeight, heightToNormalSteps };';
  return { before: prefix + stripTypeScriptTypes(before) + suffix,
    after: prefix + stripTypeScriptTypes(after) + suffix };
}

// Self-contained for page.evaluate. All image comparisons happen AFTER timed
// work. The height pixels are the exact existing normal-generator readback;
// there is no second height read or forced GPU finish inside the measurement.
export async function compareHeightCanvases({ sources, settings }) {
  const canvases = [];
  const ownedDocument = { createElement(tag) {
    if (tag !== 'canvas') throw new Error('Unexpected painter element');
    const canvas = document.createElement(tag);
    canvases.push(canvas);
    return canvas;
  } };
  const owners = Object.fromEntries(Object.entries(sources)
    .map(([name, source]) => [name, new Function('document', source)(ownedDocument)]));
  const checkpoint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  function measure(owner, policy) {
    const rng = owner.mulberry32(settings.seed);
    const features = owner.genPlateFeatures(rng), featuresBefore = JSON.stringify(features);
    let heightPixels, readbackMs = 0, readbackCalls = 0, normal;
    const started = performance.now();
    const height = owner.makeCanvas(settings.size, settings.size);
    owner.paintHeight(height, settings.visual, rng, features, settings.seed);
    const painted = performance.now();
    const context = height.getContext('2d');
    const attributes = context.getContextAttributes();
    if (attributes.willReadFrequently !== (policy === 'after')) {
      throw new Error(`First context policy not observed: ${policy}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(context, 'getImageData');
    const originalRead = context.getImageData;
    context.getImageData = function (...args) {
      const start = performance.now();
      try {
        const image = originalRead.apply(this, args);
        heightPixels = image.data;
        return image;
      }
      finally { readbackMs += performance.now() - start; readbackCalls++; }
    };
    const normalStarted = performance.now();
    try {
      const generator = owner.heightToNormalSteps(height, 2.6);
      let result = generator.next();
      while (!result.done) result = generator.next();
      normal = result.value;
    } finally {
      if (descriptor) Object.defineProperty(context, 'getImageData', descriptor);
      else delete context.getImageData;
    }
    const finished = performance.now();
    if (readbackCalls !== 1 || !heightPixels) throw new Error('Missing exact height readback');
    if (featuresBefore !== JSON.stringify(features)) throw new Error('Painter mutated shared features');
    // Untimed, explicit output readback: byte comparisons are diagnostic work.
    const normalPixels = normal.getContext('2d').getImageData(0, 0, settings.size, settings.size).data;
    const normalTotalMs = finished - normalStarted;
    const rngContinuation = Array.from({ length: 8 }, () => rng());
    return { policy, attributes, featuresBefore, rngContinuation, heightPixels, normalPixels,
      timing: { totalMs: painted - started + normalTotalMs, paintMs: painted - started, readbackMs,
        normalMs: normalTotalMs - readbackMs, normalIncludingReadbackMs: normalTotalMs,
        instrumentationMs: normalStarted - painted, observedSpanMs: finished - started },
      dispose() { height.width = height.height = normal.width = normal.height = 0; } };
  }

  function comparePixels(before, after) {
    if (before.length !== after.length) throw new Error('Pixel dimensions differ');
    let changedChannels = 0, changedPixels = 0, maxAbsDiff = 0, sumAbsDiff = 0;
    for (let pixel = 0; pixel < before.length; pixel += 4) {
      let changed = false;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(before[pixel + channel] - after[pixel + channel]);
        if (delta) { changedChannels++; changed = true; }
        maxAbsDiff = Math.max(maxAbsDiff, delta); sumAbsDiff += delta;
      }
      if (changed) changedPixels++;
    }
    return { channels: before.length, pixels: before.length / 4, changedChannels,
      changedPixels, maxAbsDiff, meanAbsDiff: sumAbsDiff / before.length,
      exact: changedChannels === 0 };
  }

  const rows = [], warmups = [];
  try {
    for (let round = 0; round < settings.warmups + settings.repetitions; round++) {
      const order = round % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
      const pair = {};
      try {
        for (const policy of order) {
          await checkpoint();
          pair[policy] = measure(owners[policy], policy);
        }
        const { before, after } = pair;
        if (before.featuresBefore !== after.featuresBefore
          || JSON.stringify(before.rngContinuation) !== JSON.stringify(after.rngContinuation)) {
          throw new Error('A/B feature or RNG mismatch');
        }
        const row = { order, before: before.timing, after: after.timing,
          attributes: { before: before.attributes, after: after.attributes },
          matchingFeaturesAndRngContinuation: true, rngContinuation: before.rngContinuation,
          height: comparePixels(before.heightPixels, after.heightPixels),
          normal: comparePixels(before.normalPixels, after.normalPixels) };
        (round < settings.warmups ? warmups : rows).push(row);
      } finally {
        for (const value of Object.values(pair)) value.dispose();
      }
    }
    return { rows, warmups };
  } finally {
    // Includes cached grain tiles and any canvas allocated by a failed pass.
    for (const canvas of canvases) canvas.width = canvas.height = 0;
  }
}

export function summarizeHeightProbe(rows) {
  if (!rows.length) throw new Error('No completed measured pairs');
  const summary = {};
  for (const policy of ['before', 'after']) {
    summary[policy] = {};
    for (const key of ['totalMs', 'paintMs', 'readbackMs', 'normalMs']) {
      const values = rows.map(row => row[policy][key]).sort((a, b) => a - b);
      if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid timing');
      const middle = Math.floor(values.length / 2);
      summary[policy][key] = { min: values[0], max: values.at(-1),
        median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 };
    }
  }
  return { ...summary,
    medianTotalDeltaMs: summary.after.totalMs.median - summary.before.totalMs.median,
    exactHeightPixels: rows.every(row => row.height.exact),
    exactNormalPixels: rows.every(row => row.normal.exact) };
}

async function readNativeGraphics(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable for native renderer receipt');
    try {
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
      return { unmasked: !!extension, renderer, contextLost: gl.isContextLost(),
        nativeObserved: !!renderer && !/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(renderer) };
    } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  });
}

export async function runHeightProbe(args) {
  const settings = parseHeightProbeOptions(args);
  const sourcePath = '../src/vehicles/materialPainter.ts';
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8');
  const sources = extractHeightProbeOwners(source);
  await mkdir(settings.out); // Never overwrite earlier measurements or failures.
  const report = { schemaVersion: 1, mode: 'standalone-local-height-canvas-ab', settings,
    sourcePath, sourceSha256: hash(source), extractedSha256: { before: hash(sources.before), after: hash(sources.after) },
    acquisitionSha256: hash(await readFile(new URL(import.meta.url))),
    browserArgs: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
    startedAt: new Date().toISOString(), errors: [], cleanupErrors: [],
    caveats: [
      'Microbenchmark only: no production scene, frame cadence or end-to-end speedup proof.',
      'Native WebGL identity is observed; Canvas2D policy is observed, not its internal raster backend.',
      'Exact local painters; fresh seeded RNG then shared features then height, not the preceding albedo RNG stream.',
      'Normal generator is drained synchronously to isolate work; gameplay scheduling is unchanged and not measured.',
      'Grain caches are independent per policy and retained across explicit warmups/repetitions; no forced GC.',
      'Pixel comparisons/output readbacks and checkpoints occur outside timed work; no parity tolerance is hidden.',
    ] };
  const lock = createCaptureLock();
  let browser, refresher;
  try {
    await lock.acquire(45 * 60 * 1000);
    refresher = setInterval(() => lock.refresh(), 30000); refresher.unref();
    browser = await puppeteer.launch({ headless: 'new', protocolTimeout: settings.timeoutMs,
      args: report.browserArgs });
    report.browserVersion = await browser.version();
    const page = await browser.newPage();
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', entry => { if (entry.type() === 'error') report.errors.push(entry.text()); });
    report.graphics = await readNativeGraphics(page);
    if (!report.graphics.nativeObserved || report.graphics.contextLost) throw new Error('Native graphics not observed');
    const measured = await page.evaluate(compareHeightCanvases, { sources, settings });
    report.measurements = measured;
    if (measured.rows.length !== settings.repetitions) throw new Error('Incomplete A/B pairs');
    report.summary = summarizeHeightProbe(measured.rows);
  } catch (error) { report.errors.push(String(error)); }
  finally {
    if (browser) await browser.close().catch(error => report.cleanupErrors.push(String(error)));
    clearInterval(refresher);
    try { lock.release(); } catch (error) { report.cleanupErrors.push(String(error)); }
    report.finishedAt = new Date().toISOString();
    report.completed = !!report.summary && report.errors.length === 0 && report.cleanupErrors.length === 0;
    report.exactPixelParity = report.completed && report.summary.exactHeightPixels && report.summary.exactNormalPixels;
    await writeFile(resolve(settings.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.completed) process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runHeightProbe(process.argv.slice(2));
}
