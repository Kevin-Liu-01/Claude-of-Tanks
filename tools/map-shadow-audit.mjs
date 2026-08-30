#!/usr/bin/env node

/**
 * Rendered live shadow/contact-health audit for every battlefield.
 *
 * Usage:
 *   npx vite --host 127.0.0.1
 *   agent-browser --session cot-shadow-audit open 'http://127.0.0.1:5173/?nosplash=1&tier=desktop&diagforce=1'
 *   node tools/map-shadow-audit.mjs cot-shadow-audit
 *   node tools/map-shadow-audit.mjs cot-shadow-audit .qa-dev/delta.json --maps=delta
 *
 * Evidence is transient by design and lands in .qa-dev/map-shadow-audit.json.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { MAP_IDS } from '../src/world/maps/index.ts';

const session = process.argv[2] || 'cot-shadow-audit';
const outPath = resolve(process.argv[3] || '.qa-dev/map-shadow-audit.json');
const mapsArg = process.argv.find((arg) => arg.startsWith('--maps='));
const requestedMapIds = mapsArg
  ? mapsArg.slice('--maps='.length).split(',').map((id) => id.trim()).filter(Boolean)
  : MAP_IDS;
const unknownMapIds = requestedMapIds.filter((mapId) => !MAP_IDS.includes(mapId));
if (unknownMapIds.length) throw new Error(`unknown map id(s): ${unknownMapIds.join(', ')}`);
const logicalCpus = os.cpus().length;
const contentionLoadLimit = logicalCpus * 0.5;
const load1Start = os.loadavg()[0];

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
const deviceTier = evaluate('window.__DEBUG.telemetry().quality.tier');
const expectedCascadeCount = deviceTier === 'mobile' ? 3 : 4;

const results = [];
const failures = [];
const performanceFindings = [];
for (const mapId of requestedMapIds) {
  const result = evaluate(`(async () => {
    const D = window.__DEBUG;
    D.quality.setPresetName('high');
    D.post.pinDynScale(1);
    D.post.forcePerfTrim(0);
    window.__AO_EMA_OFF = false;
    await D.startBattle('m1a1', ${JSON.stringify(mapId)}, { randomRoster: false });
    await new Promise((resolve) => setTimeout(resolve, 900));
    const heapStartBytes = performance.memory?.usedJSHeapSize || 0;

    const dispatchKey = (type, code, value) => window.dispatchEvent(new KeyboardEvent(type, {
      code, key: value, bubbles: true,
    }));
    // The synchronous debug battle seam intentionally bypasses the covered
    // player-entry warm. Trigger common weapon/impact variants, then require
    // the program set to stay unchanged before measuring map/shadow cost.
    const warmStartedAt = performance.now();
    const warmProgramsBefore = D.renderer.info.programs?.length || 0;
    D.flags.forceFire = true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    D.flags.forceFire = false;
    let lastWarmPrograms = D.renderer.info.programs?.length || 0;
    let stableSince = performance.now();
    while (performance.now() - warmStartedAt < 4500) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const programs = D.renderer.info.programs?.length || 0;
      if (programs !== lastWarmPrograms) {
        lastWarmPrograms = programs;
        stableSince = performance.now();
      }
      if (performance.now() - stableSince >= 700) break;
    }
    const warmMs = performance.now() - warmStartedAt;
    const warmProgramsAfter = D.renderer.info.programs?.length || 0;

    const playerStart = D.game.player.state.pos.clone();
    const cameraStart = D.camera.position.clone();
    const frameTimes = [];
    const frameSamples = [];
    let sampling = true;
    let previous = performance.now();
    let previousPrograms = D.renderer.info.programs?.length || 0;
    const sampleStartedAt = previous;
    const sampleFrame = (now) => {
      const frameMs = now - previous;
      const programs = D.renderer.info.programs?.length || 0;
      frameTimes.push(frameMs);
      frameSamples.push({
        frameMs,
        elapsedMs: now - sampleStartedAt,
        programs,
        programChanged: programs !== previousPrograms,
      });
      previous = now;
      previousPrograms = programs;
      if (sampling) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);

    // Exercise the actual chase camera, tank suspension, GTAO history and
    // continuously refreshed near cascades. The reversing turn crosses
    // trunk/prop contact layers from both screen directions instead of only
    // testing a frozen establishing shot.
    try {
      dispatchKey('keydown', 'KeyW', 'w');
      dispatchKey('keydown', 'KeyD', 'd');
      await new Promise((resolve) => setTimeout(resolve, 900));
      dispatchKey('keyup', 'KeyD', 'd');
      dispatchKey('keydown', 'KeyA', 'a');
      await new Promise((resolve) => setTimeout(resolve, 900));
      dispatchKey('keyup', 'KeyA', 'a');
      dispatchKey('keydown', 'KeyD', 'd');
      await new Promise((resolve) => setTimeout(resolve, 900));
    } finally {
      dispatchKey('keyup', 'KeyW', 'w');
      dispatchKey('keyup', 'KeyA', 'a');
      dispatchKey('keyup', 'KeyD', 'd');
    }
    sampling = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const perf = window.__PERF_HUD.stats();
    const heapEndBytes = performance.memory?.usedJSHeapSize || 0;
    const contribution = await D.sampleShadowContribution();
    const telemetry = D.telemetry();
    const glError = D.renderer.getContext().getError();
    const playerEnd = D.game.player.state.pos;
    const cameraEnd = D.camera.position;
    const contact = {
      treeRootDecalMeshes: 0,
      treeRootDecalReceivers: 0,
      treeRootDecalTriangles: 0,
      treeRootDecalCount: 0,
      treeRootDecalAreaM2: 0,
      treeRootDecalMaxRadiusM: 0,
      groundContactDecalMeshes: 0,
      groundContactDecalReceivers: 0,
      canopyShadowProxyCasters: 0,
      treeFoliageShadowCasters: 0,
      treeTrunkShadowCasters: 0,
      treeShadowLodFadeCasters: 0,
      treeShadowLodFadeMissing: 0,
      treeShadowLodAttributeMissing: 0,
      terrainDecalKinds: {},
    };
    D.world.group.traverse((object) => {
      let worldVisible = object.visible;
      for (let parent = object.parent; worldVisible && parent; parent = parent.parent) {
        worldVisible = parent.visible;
      }
      if (!worldVisible) return;
      const triangleCount = object.geometry?.index
        ? object.geometry.index.count / 3
        : (object.geometry?.attributes?.position?.count || 0) / 3;
      if (object.userData?.treeRootDecal) {
        contact.treeRootDecalMeshes++;
        if (object.receiveShadow) contact.treeRootDecalReceivers++;
        contact.treeRootDecalTriangles += triangleCount;
        contact.treeRootDecalCount += object.userData.decalCount || 0;
        contact.treeRootDecalAreaM2 += object.userData.projectedAreaM2 || 0;
        contact.treeRootDecalMaxRadiusM = Math.max(
          contact.treeRootDecalMaxRadiusM, object.userData.maxRadiusM || 0);
      }
      if (object.userData?.groundContactDecal) {
        contact.groundContactDecalMeshes++;
        if (object.receiveShadow) contact.groundContactDecalReceivers++;
      }
      if (object.userData?.treeFoliage && object.castShadow) {
        contact.treeFoliageShadowCasters++;
      }
      if (object.userData?.treeTrunk && object.castShadow) {
        contact.treeTrunkShadowCasters++;
      }
      if (object.userData?.canopyShadowProxy && object.castShadow) {
        contact.canopyShadowProxyCasters++;
      }
      if ((object.userData?.treeTrunk || object.userData?.canopyShadowProxy)
          && object.castShadow) {
        if (!object.geometry?.getAttribute?.('aLodF')) {
          contact.treeShadowLodAttributeMissing++;
        }
        if (object.userData?.lodShadowFadeCaster
            && object.customDepthMaterial?.userData?.lodShadowFade) {
          contact.treeShadowLodFadeCasters++;
        } else {
          contact.treeShadowLodFadeMissing++;
        }
      }
      if (object.userData?.terrainDecal) {
        const kind = object.userData.terrainDecalKind || 'surface';
        const row = contact.terrainDecalKinds[kind] ||= {
          meshes: 0, parts: 0, receivers: 0, triangles: 0,
        };
        row.meshes++;
        row.parts += object.userData.decalParts || 0;
        row.triangles += triangleCount;
        if (object.receiveShadow) row.receivers++;
      }
    });

    frameTimes.sort((a, b) => a - b);
    const compileAffectedFrames = new Set();
    frameSamples.forEach((sample, index) => {
      if (!sample.programChanged) return;
      for (let offset = -1; offset <= 2; offset++) {
        const affected = index + offset;
        if (affected >= 0 && affected < frameSamples.length) compileAffectedFrames.add(affected);
      }
    });
    const steadyFrameTimes = frameSamples
      .filter((_, index) => !compileAffectedFrames.has(index))
      .map((sample) => sample.frameMs)
      .sort((a, b) => a - b);
    frameSamples.sort((a, b) => b.frameMs - a.frameMs);
    const percentile = (samples, q) => samples[Math.min(
      samples.length - 1, Math.floor(samples.length * q))] || 0;
    return {
      mapId: ${JSON.stringify(mapId)},
      telemetry,
      contribution,
      perf,
      glError,
      contact,
      heapStartBytes,
      heapEndBytes,
      heapGrowthBytes: Math.max(0, heapEndBytes - heapStartBytes),
      warmMs,
      warmProgramsBefore,
      warmProgramsAfter,
      playerDistanceM: playerStart.distanceTo(playerEnd),
      cameraDistanceM: cameraStart.distanceTo(cameraEnd),
      frames: frameTimes.length,
      steadyFrames: steadyFrameTimes.length,
      compileAffectedFrames: compileAffectedFrames.size,
      frameMsP50: percentile(frameTimes, 0.50),
      frameMsP95: percentile(frameTimes, 0.95),
      frameMsP99: percentile(frameTimes, 0.99),
      frameMsMax: percentile(frameTimes, 1),
      steadyFrameMsP50: percentile(steadyFrameTimes, 0.50),
      steadyFrameMsP95: percentile(steadyFrameTimes, 0.95),
      steadyFrameMsP99: percentile(steadyFrameTimes, 0.99),
      steadyFrameMsMax: percentile(steadyFrameTimes, 1),
      framesOver33Ms: frameTimes.filter((ms) => ms > 33.4).length,
      slowestFrames: frameSamples.slice(0, 5),
    };
  })()`);
  results.push(result);

  const shadow = result.telemetry?.shadows || {};
  const sample = result.contribution || {};
  const contact = result.contact || {};
  const reasons = [];
  const performanceReasons = [];
  if (!shadow.enabled) reasons.push(`shadows disabled (${shadow.rescue || 'no rescue reason'})`);
  if (!Array.isArray(shadow.cascades) || shadow.cascades.length !== expectedCascadeCount) {
    reasons.push(`expected ${expectedCascadeCount} CSM cascades for ${deviceTier}`);
  }
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
  if (result.playerDistanceM < 3 || result.cameraDistanceM < 2.5) {
    reasons.push(
      `live drive did not move through the scene `
      + `(tank ${result.playerDistanceM.toFixed(1)}m, camera ${result.cameraDistanceM.toFixed(1)}m)`,
    );
  }
  if (result.steadyFrames < 60) {
    performanceReasons.push(`only ${result.steadyFrames} shader-stable live frames were sampled`);
  }
  if (result.steadyFrameMsP95 > 33.4) {
    performanceReasons.push(
      `shader-stable live p95 ${result.steadyFrameMsP95.toFixed(1)}ms exceeds one 30 FPS frame`,
    );
  }
  if (result.steadyFrameMsP99 > 66.8) {
    performanceReasons.push(
      `shader-stable live p99 ${result.steadyFrameMsP99.toFixed(1)}ms exceeds two 30 FPS frames`,
    );
  }
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
  if (contact.treeRootDecalMeshes > 1 ||
      (contact.treeRootDecalCount > 0 && contact.treeRootDecalMeshes !== 1)) {
    reasons.push(
      `expected at most one active tree-root layer, found ${contact.treeRootDecalMeshes}`,
    );
  }
  if (contact.treeRootDecalReceivers !== 0) {
    reasons.push(`${contact.treeRootDecalReceivers} tree-root layers still receive CSM shadows`);
  }
  if (contact.treeRootDecalMaxRadiusM > 2.4 + 1e-6) {
    reasons.push(
      `tree-root radius ${contact.treeRootDecalMaxRadiusM.toFixed(2)}m exceeds contact scale`,
    );
  }
  if (contact.treeRootDecalCount > 0 &&
      contact.treeRootDecalTriangles / contact.treeRootDecalCount > 8.01) {
    reasons.push('tree-root layer rebuilt the high-overdraw multi-ring geometry');
  }
  if (contact.groundContactDecalReceivers !== 0) {
    reasons.push(
      `${contact.groundContactDecalReceivers} prop contact layers still receive CSM shadows`,
    );
  }
  const activeTreeShadowCasters = contact.treeTrunkShadowCasters
    + contact.canopyShadowProxyCasters;
  if (activeTreeShadowCasters < 1) {
    reasons.push('no active stable tree-shadow casters');
  }
  if (contact.treeFoliageShadowCasters !== 0) {
    reasons.push(
      `${contact.treeFoliageShadowCasters} alpha-tested tree-card shadow casters remain`,
    );
  }
  if (contact.treeShadowLodFadeMissing !== 0
      || contact.treeShadowLodFadeCasters !== activeTreeShadowCasters) {
    reasons.push(
      `${contact.treeShadowLodFadeMissing} of ${activeTreeShadowCasters} tree casters `
      + 'bypass the shared LOD shadow fade',
    );
  }
  if (contact.treeShadowLodAttributeMissing !== 0) {
    reasons.push(
      `${contact.treeShadowLodAttributeMissing} tree casters lack per-instance LOD fade data`,
    );
  }
  if (performanceReasons.length) performanceFindings.push({ mapId, reasons: performanceReasons });
  if (reasons.length) failures.push({ mapId, reasons });
  const status = reasons.length ? 'FAIL' : performanceReasons.length ? 'PERF' : 'PASS';
  console.log(
    `${status} ${mapId.padEnd(9)} ` +
    `delta=${sample.meanAbsLumaDelta?.toFixed(3) ?? '—'} ` +
    `active=${sample.meanChangedLumaDelta?.toFixed(1) ?? '—'} ` +
    `changed=${sample.changedPixelRatio != null ? `${(sample.changedPixelRatio * 100).toFixed(1)}%` : '—'} ` +
    `p95=${result.steadyFrameMsP95.toFixed(1)}ms p99=${result.steadyFrameMsP99.toFixed(1)}ms ` +
    `compileFrames=${result.compileAffectedFrames} ` +
    `roots=${contact.treeRootDecalCount ?? '—'} contactRx=${contact.groundContactDecalReceivers ?? '—'} `
    + `treeFade=${contact.treeShadowLodFadeCasters}/${activeTreeShadowCasters}`,
  );
}

const load1End = os.loadavg()[0];
const machineContended = load1Start > contentionLoadLimit
  || load1End > contentionLoadLimit + 5;
const performanceWarnings = machineContended ? performanceFindings : [];
if (!machineContended) {
  for (const finding of performanceFindings) {
    const existing = failures.find((failure) => failure.mapId === finding.mapId);
    if (existing) existing.reasons.push(...finding.reasons);
    else failures.push(finding);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  version: 5,
  capturedAt: new Date().toISOString(),
  maps: requestedMapIds,
  machine: {
    logicalCpus,
    contentionLoadLimit,
    load1Start,
    load1End,
    contended: machineContended,
    performanceCertification: machineContended ? 'REFUSED' : 'VALID',
  },
  thresholds: {
    changedPixelRatio: 0.003,
    darkenedPixelRatio: 0.003,
    meanChangedLumaDelta: 4,
    relativeChangedLuma: 0.15,
    steadyFrameMsP95: 33.4,
    steadyFrameMsP99: 66.8,
    treeRootDecalMaxRadiusM: 2.4,
    treeRootTrianglesPerDecal: 8.01,
  },
  failures,
  performanceWarnings,
  results,
}, null, 2));
console.log(`wrote ${outPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`${failure.mapId}: ${failure.reasons.join('; ')}`);
  process.exitCode = 1;
}
if (machineContended && performanceWarnings.length) {
  console.error(
    `performance certification refused: host load1 ${load1Start.toFixed(2)} -> `
    + `${load1End.toFixed(2)} on ${logicalCpus} cores (limit ${contentionLoadLimit.toFixed(2)})`,
  );
  for (const warning of performanceWarnings) {
    console.error(`${warning.mapId} (uncertified): ${warning.reasons.join('; ')}`);
  }
}
