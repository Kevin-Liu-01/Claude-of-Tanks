#!/usr/bin/env node

/**
 * Rendered motion-stability audit for every graphics preset.
 *
 * Usage:
 *   npx vite --host 127.0.0.1
 *   agent-browser --session cot-render-stability open 'http://127.0.0.1:5173/?nosplash=1&tier=desktop&diagforce=1'
 *   node tools/render-stability-audit.mjs cot-render-stability
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const session = process.argv[2] || 'cot-render-stability';
const outPath = resolve(process.argv[3] || '.qa-dev/render-stability-audit.json');

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

if (!evaluate('window.__GAME_READY === true && !!window.__DEBUG?.lighting')) {
  throw new Error('game/render debug facade is not ready in the audit browser');
}
const deviceTier = evaluate('window.__DEBUG.telemetry().quality.tier');
const presets = deviceTier === 'mobile'
  ? ['mobile-low', 'mobile', 'mobile-high']
  : ['ultra', 'high', 'medium', 'low'];

const results = [];
const failures = [];
for (const preset of presets) {
  const result = evaluate(`(async () => {
    const D = window.__DEBUG;
    if (${JSON.stringify(deviceTier)} === 'mobile') {
      D.quality.setMobilePresetName(${JSON.stringify(preset)});
    } else {
      D.quality.setPresetName(${JSON.stringify(preset)});
    }
    await window.__SHOTS.set('battlefield');
    D.post.pinDynScale(1);
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Regression for the live-only shadow flash: the old adaptive trim path
    // switched both near cascades to half/third-rate manual updates. Static
    // screenshots remained perfect, while camera motion presented large
    // lighting steps. Force the maximum trim rung and prove cadence stays
    // continuous before running the ordinary texel/frozen-frame contracts.
    D.post.forcePerfTrim(99);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const trimTelemetry = D.telemetry();
    const trimmedNearAutoUpdate = trimTelemetry.shadows.cascades
      .slice(0, 2).map((cascade) => cascade.autoUpdate);
    D.post.forcePerfTrim(0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const camera = D.camera;
    const csm = D.lighting.csm;
    const origin = camera.position.clone().set(0, 0, 0);
    const basePos = camera.position.clone();
    const forward = camera.getWorldDirection(camera.position.clone()).normalize();
    const right = forward.clone().cross(camera.up).normalize();
    const baseLook = basePos.clone().addScaledVector(forward, 300);
    const lightToWorld = camera.matrixWorld.clone().identity().lookAt(origin, csm.lightDirection, camera.up);
    const worldToLight = lightToWorld.clone().invert();
    const offsets = [-1.2, -0.9, -0.6, -0.3, -0.12, -0.04, 0, 0.04, 0.12, 0.3, 0.6, 0.9, 1.2];
    const previous = new Array(csm.lights.length).fill(null);
    let maxAlignmentError = 0;
    let maxStepError = 0;
    let transitions = 0;

    for (const offset of offsets) {
      const delta = right.clone().multiplyScalar(offset);
      D.rig.setExternalPose(basePos.clone().add(delta), baseLook.clone().add(delta), camera.fov);
      camera.updateMatrixWorld(true);
      D.lighting.update(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      csm.lights.forEach((light, index) => {
        const shadow = light.shadow;
        const texelX = (shadow.camera.right - shadow.camera.left) / shadow.mapSize.x;
        const texelY = (shadow.camera.top - shadow.camera.bottom) / shadow.mapSize.y;
        const lightSpace = light.position.clone().applyMatrix4(worldToLight);
        const cellX = lightSpace.x / texelX;
        const cellY = lightSpace.y / texelY;
        maxAlignmentError = Math.max(
          maxAlignmentError,
          Math.abs(cellX - Math.round(cellX)),
          Math.abs(cellY - Math.round(cellY)),
        );
        if (previous[index]) {
          const stepX = cellX - previous[index].x;
          const stepY = cellY - previous[index].y;
          maxStepError = Math.max(
            maxStepError,
            Math.abs(stepX - Math.round(stepX)),
            Math.abs(stepY - Math.round(stepY)),
          );
          if (Math.abs(stepX) > 0.5 || Math.abs(stepY) > 0.5) transitions++;
        }
        previous[index] = { x: cellX, y: cellY };
      });
    }

    // Render the same wide camera sweep twice into a tiny direct-render
    // viewport: first with every cascade refreshed (ground truth), then with
    // the production far-cascade round robin. This catches filter-phase
    // changes that are invisible in a frozen shot. The scene cannot advance
    // while this synchronous block runs, so any changed pixel is rendering
    // instability, not animation.
    const motionOffsets = [0, 2, 4, 6, 8, 10, 12, 14, 16];
    const directGl = D.renderer.getContext();
    const directWidth = 160;
    const directHeight = 90;
    const directBytes = directWidth * directHeight * 4;
    const makeRect = () => ({
      x: 0, y: 0, z: 0, w: 0,
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; },
      copy(value) {
        this.x = value.x; this.y = value.y; this.z = value.z; this.w = value.w;
        return this;
      },
    });
    const savedTarget = D.renderer.getRenderTarget();
    const savedViewport = D.renderer.getViewport(makeRect());
    const savedScissor = D.renderer.getScissor(makeRect());
    const savedScissorTest = D.renderer.getScissorTest();
    const savedAutoClear = D.renderer.autoClear;
    const savedShadowDebug = window.__SHADOW_DEBUG;
    const directPos = basePos.clone();
    const directLook = baseLook.clone();
    const directDelta = right.clone();
    const directCapture = (offset, force) => {
      directDelta.copy(right).multiplyScalar(offset);
      directPos.copy(basePos).add(directDelta);
      directLook.copy(baseLook).add(directDelta);
      D.rig.setExternalPose(directPos, directLook, camera.fov);
      camera.updateMatrixWorld(true);
      D.lighting.update(force);
      D.renderer.setRenderTarget(null);
      D.renderer.setViewport(0, 0, directWidth, directHeight);
      D.renderer.setScissorTest(false);
      D.renderer.autoClear = true;
      D.renderer.clear(true, true, false);
      D.renderer.render(D.scene, camera);
      const pixels = new Uint8Array(directBytes);
      directGl.readPixels(
        0, 0, directWidth, directHeight,
        directGl.RGBA, directGl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    window.__SHADOW_DEBUG = {};
    const directReference = motionOffsets.map((offset) => directCapture(offset, true));
    directCapture(0, true); // reset every cascade to the sweep origin
    let motionChangedSamples = 0;
    let motionVisiblyChangedSamples = 0;
    let motionMaxVisiblyChangedSamplesPerFrame = 0;
    let motionMaxRgbDelta = 0;
    motionOffsets.forEach((offset, frame) => {
      const actual = directCapture(offset, false);
      const expected = directReference[frame];
      let visiblyChangedThisFrame = 0;
      for (let i = 0; i < actual.length; i += 4) {
        const delta = Math.abs(actual[i] - expected[i])
          + Math.abs(actual[i + 1] - expected[i + 1])
          + Math.abs(actual[i + 2] - expected[i + 2]);
        if (delta > 0) motionChangedSamples++;
        // A summed delta of 1-3 is one 8-bit rounding step per channel, not
        // a visible refresh. Preserve it in telemetry, but gate the phase
        // jump that caused the reported flash (measured at 62-79 RGB).
        if (delta > 3) {
          motionVisiblyChangedSamples++;
          visiblyChangedThisFrame++;
        }
        if (delta > motionMaxRgbDelta) motionMaxRgbDelta = delta;
      }
      motionMaxVisiblyChangedSamplesPerFrame = Math.max(
        motionMaxVisiblyChangedSamplesPerFrame, visiblyChangedThisFrame);
    });
    window.__SHADOW_DEBUG = savedShadowDebug;
    D.renderer.setRenderTarget(savedTarget);
    D.renderer.setViewport(
      savedViewport.x, savedViewport.y, savedViewport.z, savedViewport.w);
    D.renderer.setScissor(
      savedScissor.x, savedScissor.y, savedScissor.z, savedScissor.w);
    D.renderer.setScissorTest(savedScissorTest);
    D.renderer.autoClear = savedAutoClear;

    D.rig.setExternalPose(basePos, baseLook, camera.fov);
    camera.updateMatrixWorld(true);
    D.lighting.update(true);
    // Let the intentional GTAO reprojection history converge after the probe's
    // teleport. Low/mobile have AO disabled; higher tiers need several frames
    // before a byte-stability assertion is meaningful.
    for (let frame = 0; frame < 16; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    // A frozen contract view must present byte-identical frames. This catches
    // shadow shimmer, Z-fighting, unstable shader noise, and stray animated
    // state without trying to infer any one artifact from a screenshot.
    const gl = D.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const frameA = new Uint8Array(width * height * 4);
    const frameB = new Uint8Array(width * height * 4);
    let previousFrame = null;
    let temporalChangedSamples = 0;
    let temporalMaxRgbDelta = 0;
    for (let frame = 0; frame < 6; frame++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const pixels = frame % 2 ? frameB : frameA;
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (previousFrame) {
        let changed = 0;
        for (let i = 0; i < pixels.length; i += 16) {
          const delta = Math.abs(pixels[i] - previousFrame[i])
            + Math.abs(pixels[i + 1] - previousFrame[i + 1])
            + Math.abs(pixels[i + 2] - previousFrame[i + 2]);
          if (delta > 0) changed++;
          if (delta > temporalMaxRgbDelta) temporalMaxRgbDelta = delta;
        }
        if (changed > temporalChangedSamples) temporalChangedSamples = changed;
      }
      previousFrame = pixels;
    }

    let lods = 0;
    let zeroHysteresisLevels = 0;
    let invalidInstancedBounds = 0;
    let duplicateVisibleMeshes = 0;
    const duplicateVisibleMeshSamples = [];
    const visibleMeshKeys = new Map();
    const missingTextures = new Set();
    D.scene.updateMatrixWorld(true);
    D.scene.traverse((object) => {
      if (object.isLOD) {
        lods++;
        for (let i = 1; i < object.levels.length; i++) {
          if (!(object.levels[i].hysteresis > 0)) zeroHysteresisLevels++;
        }
      }
      if (object.isInstancedMesh && object.count > 0 && object.frustumCulled && object.boundingSphere) {
        const sphere = object.boundingSphere;
        if (!Number.isFinite(sphere.radius) || !Number.isFinite(sphere.center.lengthSq())) {
          invalidInstancedBounds++;
        }
      }
      // Exact duplicate ordinary meshes are the common accidental Z-fighting
      // path during scene/state rebuilds. Instanced/Batched meshes keep their
      // real poses in per-instance buffers, so their shared object transform
      // is intentional and excluded here.
      let worldVisible = object.visible;
      let offscreenWarmup = false;
      for (let parent = object.parent; worldVisible && parent; parent = parent.parent) {
        worldVisible = parent.visible;
        if (parent.name === 'killcamWarmup') offscreenWarmup = true;
      }
      if (object.isMesh && !object.isInstancedMesh && !object.isBatchedMesh
          && worldVisible && !offscreenWarmup && object.geometry) {
        const matrixKey = Array.from(object.matrixWorld.elements,
          (value) => Number(value).toFixed(6)).join(',');
        const key = object.geometry.uuid + '|' + matrixKey;
        const previous = visibleMeshKeys.get(key);
        if (previous) {
          duplicateVisibleMeshes++;
          if (duplicateVisibleMeshSamples.length < 8) {
            duplicateVisibleMeshSamples.push([
              previous.name || previous.parent?.name || previous.type,
              object.name || object.parent?.name || object.type,
            ]);
          }
        } else {
          visibleMeshKeys.set(key, object);
        }
      }
      const materials = object.material
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (!value?.isTexture) continue;
          const data = value.source?.data;
          if (!data || (Number.isFinite(data.width) && data.width <= 0)
            || (Number.isFinite(data.height) && data.height <= 0)) {
            missingTextures.add(value.name || value.uuid);
          }
        }
      }
    });

    const telemetry = D.telemetry();
    const glError = D.renderer.getContext().getError();
    return {
      preset: ${JSON.stringify(preset)},
      resolvedPreset: telemetry.quality.preset,
      maxAlignmentError,
      maxStepError,
      transitions,
      temporalChangedSamples,
      temporalMaxRgbDelta,
      motionChangedSamples,
      motionVisiblyChangedSamples,
      motionMaxVisiblyChangedSamplesPerFrame,
      motionMaxRgbDelta,
      trimShadowThrottle: trimTelemetry.shadows.throttle,
      trimmedNearAutoUpdate,
      lods,
      zeroHysteresisLevels,
      invalidInstancedBounds,
      duplicateVisibleMeshes,
      duplicateVisibleMeshSamples,
      missingTextures: [...missingTextures],
      glError,
      shaderErrors: telemetry.shadows.shaderErrors,
      cascades: telemetry.shadows.cascades,
      renderer: {
        calls: D.renderer.info.render.calls,
        triangles: D.renderer.info.render.triangles,
        geometries: D.renderer.info.memory.geometries,
        textures: D.renderer.info.memory.textures,
        programs: D.renderer.info.programs?.length || 0,
      },
    };
  })()`);
  results.push(result);

  const reasons = [];
  if (result.resolvedPreset !== preset) reasons.push(`resolved as ${result.resolvedPreset}`);
  if (result.maxAlignmentError > 1e-5) reasons.push(`texel alignment error ${result.maxAlignmentError}`);
  if (result.maxStepError > 1e-5) reasons.push(`non-integral texel step ${result.maxStepError}`);
  if (result.transitions < 1) reasons.push('camera sweep did not cross a texel boundary');
  if (result.temporalChangedSamples !== 0) {
    reasons.push(`${result.temporalChangedSamples} unstable frozen-frame samples`);
  }
  // One isolated low-resolution raster-edge sample can differ by a few 8-bit
  // values across repeated GPU renders (observed once, then zero on rerun).
  // A shadow refresh flash changes a contiguous region: the original bug was
  // ~2.7% of a frame. Gate at 0.01% of one frame, while retaining every exact
  // changed sample above for diagnostics.
  const motionVisibleRatio = result.motionMaxVisiblyChangedSamplesPerFrame / (160 * 90);
  if (motionVisibleRatio > 0.0001) {
    reasons.push(
      `${result.motionMaxVisiblyChangedSamplesPerFrame} visibly changed production-cadence `
      + `motion samples in one frame `
      + `differ from force-all `
      + `(max RGB delta ${result.motionMaxRgbDelta})`,
    );
  }
  if (result.trimShadowThrottle !== 0) {
    reasons.push(`adaptive trim enabled shadow throttle ${result.trimShadowThrottle}`);
  }
  if (result.trimmedNearAutoUpdate.some((enabled) => !enabled)) {
    reasons.push('adaptive trim disabled continuous near-cascade refresh');
  }
  if (result.glError !== 0) reasons.push(`WebGL error ${result.glError}`);
  if (result.shaderErrors !== 0) reasons.push(`${result.shaderErrors} shader errors`);
  if (result.zeroHysteresisLevels !== 0) reasons.push(`${result.zeroHysteresisLevels} zero-hysteresis LOD levels`);
  if (result.invalidInstancedBounds !== 0) reasons.push(`${result.invalidInstancedBounds} invalid instanced bounds`);
  if (result.duplicateVisibleMeshes !== 0) {
    reasons.push(`${result.duplicateVisibleMeshes} exact duplicate visible meshes`);
  }
  if (result.missingTextures.length) reasons.push(`${result.missingTextures.length} missing texture sources`);
  result.cascades.forEach((cascade, index) => {
    if (!cascade.allocated || cascade.allocatedSize !== cascade.size) {
      reasons.push(`cascade ${index} allocation mismatch`);
    }
  });
  if (reasons.length) failures.push({ preset, reasons });
  console.log(
    `${reasons.length ? 'FAIL' : 'PASS'} ${preset.padEnd(6)} `
    + `align=${result.maxAlignmentError.toExponential(1)} `
    + `step=${result.maxStepError.toExponential(1)} `
    + `crossings=${result.transitions} lods=${result.lods} `
    + `calls=${result.renderer.calls} tris=${Math.round(result.renderer.triangles / 1000)}k`,
  );
}

// The bug report is specifically a moving player tank, not an orbiting QA
// camera. Exercise the real input listeners, fixed-step movement, suspension,
// player shadow caster, chase rig, GTAO history and destruction/fire path in
// one live battle. The force-all sweep above is the pixel-level shadow truth;
// this contract makes sure that truth also covers the actual gameplay path.
const liveDrive = evaluate(`(async () => {
  const D = window.__DEBUG;
  D.quality.setPresetName('high');
  D.post.pinDynScale(1);
  window.__AO_EMA_OFF = false;
  await D.startBattle('m1a1', 'verdant');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const key = (type, code, value) => window.dispatchEvent(new KeyboardEvent(type, {
    code, key: value, bubbles: true,
  }));
  const playerStart = D.game.player.state.pos.clone();
  const cameraStart = D.camera.position.clone();
  const externalAtStart = D.rig.externalActive;
  const frameTimes = [];
  const frameSamples = [];
  let sampling = true;
  let previous = performance.now();
  const sampleStart = previous;
  const sample = (now) => {
    const frameMs = now - previous;
    frameTimes.push(frameMs);
    frameSamples.push({
      frameMs,
      elapsedMs: now - sampleStart,
      programs: D.renderer.info.programs?.length || 0,
      drawCalls: D.renderer.info.render.calls,
      triangles: D.renderer.info.render.triangles,
    });
    previous = now;
    if (sampling) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);

  key('keydown', 'KeyW', 'w');
  key('keydown', 'KeyD', 'd');
  D.flags.forceFire = true;
  await new Promise((resolve) => setTimeout(resolve, 2400));
  key('keyup', 'KeyD', 'd');
  key('keydown', 'KeyA', 'a');
  await new Promise((resolve) => setTimeout(resolve, 2400));
  key('keyup', 'KeyA', 'a');
  key('keydown', 'KeyD', 'd');
  await new Promise((resolve) => setTimeout(resolve, 2400));
  key('keyup', 'KeyW', 'w');
  key('keyup', 'KeyD', 'd');
  D.flags.forceFire = false;
  sampling = false;
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const playerEnd = D.game.player.state.pos;
  const cameraEnd = D.camera.position;
  const telemetry = D.telemetry();
  const glError = D.renderer.getContext().getError();
  let canopyShadowProxyCasters = 0;
  let canopyShadowProxyVertices = 0;
  let treeFoliageShadowCasters = 0;
  let treeTrunkShadowCasters = 0;
  let treeTrunkShadowReceivers = 0;
  let treeRootDecalMeshes = 0;
  let treeRootDecalReceivers = 0;
  let treeRootDecalTriangles = 0;
  let treeRootDecalCount = 0;
  let treeRootDecalAreaM2 = 0;
  let treeRootDecalMaxRadiusM = 0;
  let groundContactDecalMeshes = 0;
  let groundContactDecalReceivers = 0;
  D.scene.traverse((object) => {
    let worldVisible = object.visible;
    for (let parent = object.parent; worldVisible && parent; parent = parent.parent) {
      worldVisible = parent.visible;
    }
    if (!worldVisible) return;
    if (object.userData?.canopyShadowProxy && object.castShadow) {
      canopyShadowProxyCasters++;
      canopyShadowProxyVertices += object.geometry?.attributes?.position?.count || 0;
    }
    if (object.userData?.treeFoliage && object.castShadow) {
      treeFoliageShadowCasters++;
    }
    if (object.userData?.treeTrunk) {
      if (object.castShadow) treeTrunkShadowCasters++;
      if (object.receiveShadow) treeTrunkShadowReceivers++;
    }
    if (object.userData?.treeRootDecal) {
      treeRootDecalMeshes++;
      if (object.receiveShadow) treeRootDecalReceivers++;
      treeRootDecalTriangles += (object.geometry?.index?.count || 0) / 3;
      treeRootDecalCount += object.userData.decalCount || 0;
      treeRootDecalAreaM2 += object.userData.projectedAreaM2 || 0;
      treeRootDecalMaxRadiusM = Math.max(
        treeRootDecalMaxRadiusM, object.userData.maxRadiusM || 0);
    }
    if (object.userData?.groundContactDecal) {
      groundContactDecalMeshes++;
      if (object.receiveShadow) groundContactDecalReceivers++;
    }
  });
  frameTimes.sort((a, b) => a - b);
  frameSamples.sort((a, b) => b.frameMs - a.frameMs);
  const percentile = (q) => frameTimes[Math.min(
    frameTimes.length - 1, Math.floor(frameTimes.length * q))] || 0;
  return {
    map: D.game.mapId,
    phase: D.game.phase,
    externalAtStart,
    externalAtEnd: D.rig.externalActive,
    distanceM: playerStart.distanceTo(playerEnd),
    cameraDistanceM: cameraStart.distanceTo(cameraEnd),
    frames: frameTimes.length,
    frameMsP50: percentile(0.50),
    frameMsP95: percentile(0.95),
    frameMsP99: percentile(0.99),
    frameMsMax: percentile(1),
    framesOver33Ms: frameTimes.filter((ms) => ms > 33.4).length,
    slowestFrames: frameSamples.slice(0, 8),
    glError,
    shaderErrors: telemetry.shadows.shaderErrors,
    canopyShadowProxyCasters,
    canopyShadowProxyVertices,
    treeFoliageShadowCasters,
    treeTrunkShadowCasters,
    treeTrunkShadowReceivers,
    treeRootDecalMeshes,
    treeRootDecalReceivers,
    treeRootDecalTriangles,
    treeRootDecalCount,
    treeRootDecalAreaM2,
    treeRootDecalMaxRadiusM,
    groundContactDecalMeshes,
    groundContactDecalReceivers,
    shadowThrottle: telemetry.shadows.throttle,
    nearAutoUpdate: telemetry.shadows.cascades
      .slice(0, 2).map((cascade) => cascade.autoUpdate),
  };
})()`);

const liveDriveReasons = [];
if (liveDrive.phase !== 'battle' || liveDrive.map !== 'verdant') {
  liveDriveReasons.push(`wrong live scene ${liveDrive.phase}/${liveDrive.map}`);
}
if (liveDrive.externalAtStart || liveDrive.externalAtEnd) {
  liveDriveReasons.push('live drive used an external QA camera pose');
}
if (liveDrive.distanceM < 20) {
  liveDriveReasons.push(`tank only traveled ${liveDrive.distanceM.toFixed(1)} m`);
}
if (liveDrive.cameraDistanceM < 15) {
  liveDriveReasons.push(`chase camera only traveled ${liveDrive.cameraDistanceM.toFixed(1)} m`);
}
if (liveDrive.shadowThrottle !== 0) {
  liveDriveReasons.push(`live drive enabled shadow throttle ${liveDrive.shadowThrottle}`);
}
if (liveDrive.nearAutoUpdate.some((enabled) => !enabled)) {
  liveDriveReasons.push('live drive disabled a near-cascade refresh');
}
if (liveDrive.glError !== 0) liveDriveReasons.push(`live WebGL error ${liveDrive.glError}`);
if (liveDrive.shaderErrors !== 0) {
  liveDriveReasons.push(`${liveDrive.shaderErrors} live shader errors`);
}
if (liveDrive.canopyShadowProxyCasters < 1 || liveDrive.canopyShadowProxyVertices < 1) {
  liveDriveReasons.push('live world has no stable tree-canopy shadow proxies');
}
if (liveDrive.treeFoliageShadowCasters !== 0) {
  liveDriveReasons.push(
    `${liveDrive.treeFoliageShadowCasters} alpha-tested tree-card shadow casters remain`,
  );
}
if (liveDrive.treeTrunkShadowCasters < 1) {
  liveDriveReasons.push('live world has no tree-trunk ground-shadow casters');
}
if (liveDrive.treeTrunkShadowReceivers !== 0) {
  liveDriveReasons.push(
    `${liveDrive.treeTrunkShadowReceivers} tree-trunk meshes still receive unstable canopy/self shadows`,
  );
}
if (liveDrive.treeRootDecalMeshes !== 1 || liveDrive.treeRootDecalCount < 1) {
  liveDriveReasons.push(
    `expected one active bounded root-contact mesh, found ${liveDrive.treeRootDecalMeshes}`,
  );
}
if (liveDrive.treeRootDecalReceivers !== 0) {
  liveDriveReasons.push(
    `${liveDrive.treeRootDecalReceivers} tree-root decals still receive stacked CSM shadows`,
  );
}
if (liveDrive.treeRootDecalMaxRadiusM > 2.4 + 1e-6) {
  liveDriveReasons.push(
    `tree-root decal radius ${liveDrive.treeRootDecalMaxRadiusM.toFixed(2)}m exceeds contact scale`,
  );
}
if (liveDrive.treeRootDecalCount > 0 &&
    liveDrive.treeRootDecalTriangles / liveDrive.treeRootDecalCount > 8.01) {
  liveDriveReasons.push('tree-root contact layer rebuilt the high-overdraw multi-ring geometry');
}
if (liveDrive.groundContactDecalMeshes < 1) {
  liveDriveReasons.push('live world has no tagged prop/foundation contact layer');
}
if (liveDrive.groundContactDecalReceivers !== 0) {
  liveDriveReasons.push(
    `${liveDrive.groundContactDecalReceivers} prop contact decals still receive stacked CSM shadows`,
  );
}
if (liveDriveReasons.length) failures.push({ preset: 'live-drive', reasons: liveDriveReasons });
console.log(
  `${liveDriveReasons.length ? 'FAIL' : 'PASS'} live-drive `
  + `tank=${liveDrive.distanceM.toFixed(1)}m camera=${liveDrive.cameraDistanceM.toFixed(1)}m `
  + `frames=${liveDrive.frames} p50=${liveDrive.frameMsP50.toFixed(1)}ms `
  + `p95=${liveDrive.frameMsP95.toFixed(1)}ms`,
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  version: 5,
  capturedAt: new Date().toISOString(),
  deviceTier,
  failures,
  results,
  liveDrive,
}, null, 2));
console.log(`wrote ${outPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`${failure.preset}: ${failure.reasons.join('; ')}`);
  process.exitCode = 1;
}
