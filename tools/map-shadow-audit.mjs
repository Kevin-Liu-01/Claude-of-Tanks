#!/usr/bin/env node

/**
 * Rendered shadow-health audit for every battlefield.
 *
 * Usage:
 *   npx vite --host 127.0.0.1
 *   agent-browser --session cot-shadow-audit open 'http://127.0.0.1:5173/?nosplash=1&tier=desktop'
 *   node tools/map-shadow-audit.mjs cot-shadow-audit
 *
 * Evidence is transient by design and lands in .qa-dev/map-shadow-audit.json.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MAP_IDS } from '../src/world/maps/index.js';

const session = process.argv[2] || 'cot-shadow-audit';
const outPath = resolve(process.argv[3] || '.qa-dev/map-shadow-audit.json');
const VIEW_BY_MAP = Object.fromEntries(MAP_IDS.map((mapId) => [
  mapId,
  mapId === 'verdant' ? 'battlefield' : `battlefield_${mapId}`,
]));

function evaluate(script) {
  const raw = execFileSync('agent-browser', [
    '--session', session,
    '--json',
    'eval',
    script,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const envelope = JSON.parse(raw);
  if (!envelope.success) throw new Error(envelope.error || 'browser evaluation failed');
  return envelope.data.result;
}

if (!evaluate('window.__GAME_READY === true && !!window.__DEBUG?.sampleShadowContribution')) {
  throw new Error('game/shadow debug facade is not ready in the audit browser');
}

const results = [];
const failures = [];
for (const mapId of MAP_IDS) {
  const view = VIEW_BY_MAP[mapId];
  const result = evaluate(`(async () => {
    window.__SHOTS.set(${JSON.stringify(view)});
    window.__DEBUG.post.pinDynScale(1);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = window.__DEBUG.telemetry();
    const sample = await window.__DEBUG.sampleShadowContribution();
    const after = window.__DEBUG.telemetry();
    const perf = window.__PERF_HUD.stats();
    const glError = window.__DEBUG.renderer.getContext().getError();
    return { mapId: ${JSON.stringify(mapId)}, view: ${JSON.stringify(view)}, before, after, sample, perf, glError };
  })()`);
  results.push(result);

  const shadow = result.after?.shadows || {};
  const sample = result.sample || {};
  const reasons = [];
  if (!shadow.enabled) reasons.push(`shadows disabled (${shadow.rescue || 'no rescue reason'})`);
  if (!Array.isArray(shadow.cascades) || shadow.cascades.length !== 4) reasons.push('expected four CSM cascades');
  else {
    shadow.cascades.forEach((cascade, index) => {
      if (!cascade.allocated) reasons.push(`cascade ${index} has no shadow target`);
      if (cascade.allocatedSize !== cascade.size) reasons.push(`cascade ${index} allocation/size mismatch`);
    });
  }
  if (shadow.shaderErrors) reasons.push(`${shadow.shaderErrors} shader error(s)`);
  if (shadow.casters < 1 || shadow.receivers < 1) reasons.push('no visible shadow casters/receivers');
  if (result.glError !== 0) reasons.push(`WebGL error ${result.glError}`);
  if (!result.perf || result.perf.calls < 1 || result.perf.programs < 1) reasons.push('invalid render telemetry');
  if (sample.skipped) reasons.push(`sample skipped (${sample.reason})`);
  if (!sample.skipped && sample.changedPixelRatio < 0.003) {
    reasons.push(`shadow delta touches only ${(sample.changedPixelRatio * 100).toFixed(2)}% of pixels`);
  }
  if (!sample.skipped && sample.darkenedPixelRatio < 0.003) {
    reasons.push(`shadow darkening touches only ${(sample.darkenedPixelRatio * 100).toFixed(2)}% of pixels`);
  }
  const relativeShadowContrast = sample.meanChangedLumaDelta
    / Math.max(1, sample.meanLumaWithoutShadows);
  if (!sample.skipped && sample.meanChangedLumaDelta < 4 && relativeShadowContrast < 0.15) {
    reasons.push(
      `changed-pixel shadow contrast is too low `
      + `(${sample.meanChangedLumaDelta.toFixed(2)} luma, ${(relativeShadowContrast * 100).toFixed(1)}%)`,
    );
  }
  if (reasons.length) failures.push({ mapId, reasons });
  console.log(
    `${reasons.length ? 'FAIL' : 'PASS'} ${mapId.padEnd(9)} ` +
    `delta=${sample.meanAbsLumaDelta?.toFixed(3) ?? '—'} ` +
    `active=${sample.meanChangedLumaDelta?.toFixed(1) ?? '—'} ` +
    `changed=${sample.changedPixelRatio != null ? `${(sample.changedPixelRatio * 100).toFixed(1)}%` : '—'} ` +
    `casters=${shadow.casters ?? '—'} receivers=${shadow.receivers ?? '—'} ` +
    `calls=${result.perf?.calls ?? '—'} tris=${result.perf ? Math.round(result.perf.tris / 1000) : '—'}k`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  version: 2,
  capturedAt: new Date().toISOString(),
  thresholds: {
    changedPixelRatio: 0.003,
    darkenedPixelRatio: 0.003,
    meanChangedLumaDelta: 4,
    relativeChangedLuma: 0.15,
  },
  failures,
  results,
}, null, 2));
console.log(`wrote ${outPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`${failure.mapId}: ${failure.reasons.join('; ')}`);
  process.exitCode = 1;
}
