import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';

export const SOURCE_COMPOSITION_PROTOCOL = 'urban-sourced-image-first-composition-v1';

/** Evaluate only the existing source plan: no image IO, Canvas or renderer. */
export async function urbanCompositionCases(source) {
  const withoutImports = source.replace(/^import[^\n]*;\s*$/gm, '').replace(/^export /gm, '');
  const script = stripTypeScriptTypes(withoutImports) + `
    const cases = [];
    sourceJob = async (target, set, layer, options) => {
      cases.push({ id: target.replaceAll(' ', '-').replaceAll('/', '-'),
        kind: target.startsWith('terrain ') ? 'terrain' : 'building',
        set, images: SETS[set], options });
      return { target, applied: true, failures: [] };
    };
    const layer = { albedo: {}, normal: {}, surface: {} };
    await applySourcedTerrain('urban', { G: layer, D: layer, R: layer, M: layer });
    await applySourcedBuildings({ plaster: layer, roof: layer, wood: layer, stone: layer }, 'urban');
    return cases;
  `;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const rows = await new AsyncFunction('THREE', 'texSize', script)({}, size => size);
  assert.deepEqual(rows.map(row => row.set), ['grass', 'dirt', 'cobble', 'plaster', 'wood', 'brick'],
    'Unsupported urban source plan; review the experiment corpus explicitly');
  for (const row of rows) {
    assert.deepEqual(Object.keys(row.images).sort(), ['ao', 'color', 'normal', 'rough']);
    assert.ok(Object.values(row.images).every(url => /^\/textures\/(terrain|buildings)\/[\w.-]+\.jpg$/.test(url)));
  }
  return rows;
}

export function compositionPlan(cases, pairs) {
  assert.ok(Number.isInteger(pairs) && pairs >= 2 && pairs <= 4 && pairs % 2 === 0);
  return Array.from({ length: pairs }, (_, round) => cases.flatMap(input =>
    (round % 2 === 0 ? ['onload', 'decode'] : ['decode', 'onload'])
      .map(policy => ({ round, caseId: input.id, policy })))).flat();
}

export function compareRgba(before, after) {
  assert.equal(before.length, after.length, 'RGBA dimensions differ');
  assert.equal(before.length % 4, 0, 'Invalid RGBA length');
  let changedChannels = 0, maxAbsDiff = 0;
  for (let index = 0; index < before.length; index++) {
    const difference = Math.abs(before[index] - after[index]);
    if (difference) changedChannels++;
    maxAbsDiff = Math.max(maxAbsDiff, difference);
  }
  return { exact: changedChannels === 0, changedChannels, maxAbsDiff, bytes: before.length };
}

export function validateCompositionTrial(row) {
  assert.equal(row.status, 'complete');
  assert.ok(['onload', 'decode'].includes(row.policy));
  assert.ok(['terrain', 'building'].includes(row.kind));
  assert.deepEqual(row.quality, { tier: 'desktop', preset: 'high', textureSize: 1024 });
  assert.equal(row.size, 1024, 'The approved urban corpus composes at the authored 1K desktop size');
  assert.equal(row.images.length, 4);
  assert.equal(new Set(row.images.map(image => image.url)).size, 4);
  for (const image of row.images) {
    assert.ok(image.width > 0 && image.height > 0);
    assert.ok(Number.isFinite(image.requestedAt) && Number.isFinite(image.onloadAt) && image.onloadAt >= image.requestedAt);
    assert.ok(Number.isFinite(image.readyAt) && image.readyAt >= image.onloadAt && image.readyAt <= row.readyAt);
    if (row.policy === 'decode') {
      assert.equal(image.decodeStatus, 'fulfilled', 'Decode arm did not actually decode');
      assert.ok(image.decodeStartedAt >= image.onloadAt && image.decodeEndedAt >= image.decodeStartedAt
        && image.readyAt >= image.decodeEndedAt);
    } else assert.equal(image.decodeStatus, 'not-requested');
  }
  assert.deepEqual(row.measurements.map(value => value.stage), ['first', 'delayed-reuse']);
  for (const measure of row.measurements) {
    assert.ok(measure.readbacks.length === 3, 'Exact runtime composition reads color, AO and roughness once each');
    assert.ok(measure.readbacks.every(value => value.width === row.size && value.height === row.size));
    assert.ok(measure.startedAt >= row.readyAt && measure.endedAt >= measure.startedAt);
    assert.ok(measure.readbacks.every(value => Number.isFinite(value.durationMs) && value.durationMs >= 0
      && value.startMs >= measure.startedAt && value.startMs + value.durationMs <= measure.endedAt + 0.01));
    for (const key of ['compositionMs', 'readbackMs', 'readyToCompositionMs', 'requestToCompositionEndMs']) {
      assert.ok(Number.isFinite(measure[key]) && measure[key] >= 0, `Invalid ${key}`);
    }
    assert.ok(measure.readbackMs <= measure.compositionMs + 0.01);
    assert.deepEqual(measure.outputs.map(value => value.role), row.kind === 'terrain' ? ['albedo'] : ['albedo', 'surface']);
    for (const output of measure.outputs) {
      assert.equal(output.width, row.size); assert.equal(output.height, row.size);
      assert.equal(output.byteLength, row.size * row.size * 4);
    }
  }
  assert.ok(row.measurements[1].startedAt - row.measurements[0].endedAt >= row.reuseDelayMs - 1);
  assert.ok(row.graphics?.nativeObserved && !row.graphics.contextLost, 'Native graphics unavailable');
}

/** Self-contained browser operation. No additional RPC/frame gap at readiness. */
export async function measureSourceComposition({ input, policy, reuseDelayMs, imageTimeoutMs }) {
  const report = window.__SOURCE_COMPOSITION = { policy, caseId: input.id, kind: input.kind,
    status: 'running', images: [], measurements: [], reuseDelayMs, startedAt: performance.now() };
  const ownedCanvases = [];
  const activeTimers = new Set();
  const pendingImages = new Set();
  const images = new Map();
  const now = () => performance.now();
  function load(url) {
    if (images.has(url)) return images.get(url);
    const value = new Promise((resolve, reject) => {
      const image = new Image();
      pendingImages.add(image);
      const receipt = { url, requestedAt: now(), onloadAt: null, decodeStatus: 'not-requested' };
      report.images.push(receipt);
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer); activeTimers.delete(timer);
        image.onload = image.onerror = null;
        pendingImages.delete(image);
        if (error) reject(error); else resolve(image);
      };
      const timer = setTimeout(() => finish(new Error(`Image/decode deadline: ${url}`)), imageTimeoutMs);
      activeTimers.add(timer);
      image.onerror = () => finish(new Error(`Image load failed: ${url}`));
      image.onload = async () => {
        receipt.onloadAt = now(); receipt.width = image.naturalWidth; receipt.height = image.naturalHeight;
        if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return finish(new Error(`Empty image: ${url}`));
        if (policy === 'decode') {
          receipt.decodeStartedAt = now();
          try {
            if (typeof image.decode !== 'function') throw new Error('decode unavailable');
            await image.decode();
            if (settled) return;
            receipt.decodeStatus = 'fulfilled';
          } catch (error) {
            if (settled) return;
            // Retain the usable legacy fallback, but never admit it as decode evidence.
            receipt.decodeStatus = 'fallback'; receipt.decodeError = String(error);
          }
          receipt.decodeEndedAt = now();
        }
        receipt.readyAt = now(); finish();
      };
      image.src = url;
    });
    images.set(url, value); return value;
  }
  function measure(owner, loaded, stage) {
    const readbacks = [];
    const prototype = CanvasRenderingContext2D.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getImageData');
    const original = descriptor.value;
    const wrapper = function (...args) {
      const start = now();
      try { return Reflect.apply(original, this, args); }
      finally { readbacks.push({ startMs: start, durationMs: now() - start, width: args[2], height: args[3] }); }
    };
    Object.defineProperty(prototype, 'getImageData', { ...descriptor, value: wrapper });
    const startedAt = now();
    let albedo, surface;
    try {
      albedo = owner.composeAlbedo(loaded.color, input.kind === 'terrain' ? loaded.ao : null,
        loaded.rough, input.options);
      ownedCanvases.push(albedo);
      if (input.kind === 'building') {
        surface = owner.composeSurface(loaded.ao, loaded.rough, report.size, input.options.roughMul ?? 1);
        ownedCanvases.push(surface);
      }
    } finally {
      if (prototype.getImageData === wrapper) Object.defineProperty(prototype, 'getImageData', descriptor);
    }
    const endedAt = now();
    const outputs = [{ role: 'albedo', canvas: albedo }, ...(surface ? [{ role: 'surface', canvas: surface }] : [])];
    report.measurements.push({ stage, startedAt, endedAt, compositionMs: endedAt - startedAt,
      readbackMs: readbacks.reduce((sum, item) => sum + item.durationMs, 0), readbacks,
      readyToCompositionMs: startedAt - report.readyAt,
      requestToCompositionEndMs: endedAt - report.requestedAt, outputs: [] });
    return outputs;
  }
  function pack(canvas, role) {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    for (let offset = 0; offset < pixels.length; offset += 32768) {
      binary += String.fromCharCode(...pixels.subarray(offset, offset + 32768));
    }
    return { role, width: canvas.width, height: canvas.height, byteLength: pixels.length, rgbaBase64: btoa(binary) };
  }
  try {
    const owner = await import('/src/world/sourcedTextures.ts');
    const quality = await import('/src/engine/quality.ts');
    quality.resolveDeviceTier(); quality.setPresetName('high');
    report.quality = { tier: quality.getDeviceTier(), preset: quality.resolvePresetName(), textureSize: quality.texSize(1024) };
    report.requestedAt = now();
    const entries = await Promise.all(Object.entries(input.images).map(async ([role, url]) => [role, await load(url)]));
    const loaded = Object.fromEntries(entries);
    report.readyAt = now(); report.size = Math.min(loaded.color.width, quality.texSize(1024));
    const first = measure(owner, loaded, 'first');
    await new Promise(resolve => setTimeout(resolve, reuseDelayMs));
    const reused = measure(owner, loaded, 'delayed-reuse');
    // All diagnostic output readbacks/serialization occur after BOTH timed phases.
    report.measurements[0].outputs = first.map(({ canvas, role }) => pack(canvas, role));
    report.measurements[1].outputs = reused.map(({ canvas, role }) => pack(canvas, role));
    report.status = 'complete';
  } catch (error) { report.status = 'failed'; report.error = String(error); }
  finally {
    for (const timer of activeTimers) clearTimeout(timer);
    for (const image of pendingImages) image.onload = image.onerror = null;
    for (const canvas of ownedCanvases) canvas.width = canvas.height = 0;
  }
  return report;
}
