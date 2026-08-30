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

async function waitForEvaluation(script, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = evaluate(script);
      if (result?.error) throw new Error(result.error);
      if (result?.ready) return result;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error('browser evaluation did not become ready');
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
    // Marketing-shot staging deliberately freezes completed shadow maps. This
    // audit exercises moving gameplay, so release that presentation-only latch
    // before checking live cascade cadence.
    D.lighting.setStaticPresentationDormant(false);
    // Releasing a dormant presentation intentionally spends two covered force
    // frames before normal scheduling resumes. Shot mode is event-driven and
    // may not present those frames by itself, so advance the scheduler here.
    D.lighting.update(false);
    D.lighting.update(false);
    D.lighting.update(false);

    // Regression for the live-only shadow flash: the old adaptive trim path
    // changed cascade ownership and presented large lighting steps. The
    // current scheduler deliberately keeps every native shadow auto-update
    // disabled and submits mutually exclusive near/far pairs itself. Force
    // the maximum trim rung and prove that ownership remains manual before
    // running the ordinary texel/frozen-frame contracts.
    D.post.forcePerfTrim(99);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const trimTelemetry = D.telemetry();
    const trimmedCascadeAutoUpdate = trimTelemetry.shadows.cascades
      .map((cascade) => cascade.autoUpdate);
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
    // the production far-cascade cadence. This catches filter-phase changes
    // that are invisible in a frozen shot. The scene cannot advance while
    // this synchronous block runs, so any changed pixel is rendering
    // instability, not animation. Adjacent far maps are also required to
    // refresh as one cohort because CSM fade samples them in the same pixel.
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
    const motionSchedule = [];
    motionOffsets.forEach((offset, frame) => {
      const actual = directCapture(offset, false);
      const shadowState = D.lighting.getShadowTelemetry();
      const motionFrameState = {
        offset,
        scheduledMask: shadowState.scheduledMask,
        fitChangedMask: shadowState.fitChangedMask,
        visiblyChangedSamples: 0,
        maxRgbDelta: 0,
      };
      motionSchedule.push(motionFrameState);
      const expected = directReference[frame];
      let visiblyChangedThisFrame = 0;
      for (let i = 0; i < actual.length; i += 4) {
        const delta = Math.abs(actual[i] - expected[i])
          + Math.abs(actual[i + 1] - expected[i + 1])
          + Math.abs(actual[i + 2] - expected[i + 2]);
        // Frame zero is the explicit reset/prime at an unchanged camera pose.
        // Ultra's 4096² depth targets can produce a handful of edge-raster
        // differences when rerendered twice, but that is not a motion-cadence
        // defect and the frozen-frame contract below owns static stability.
        const isMotionFrame = frame > 0;
        if (delta > 0 && isMotionFrame) motionChangedSamples++;
        // A summed delta of 1-3 is one 8-bit rounding step per channel, not
        // a visible refresh. Preserve it in telemetry, but gate the phase
        // jump that caused the reported flash (measured at 62-79 RGB).
        if (delta > 3 && isMotionFrame) {
          motionVisiblyChangedSamples++;
          visiblyChangedThisFrame++;
        }
        if (isMotionFrame && delta > motionMaxRgbDelta) motionMaxRgbDelta = delta;
        if (delta > motionFrameState.maxRgbDelta) motionFrameState.maxRgbDelta = delta;
      }
      motionFrameState.visiblyChangedSamples = visiblyChangedThisFrame;
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

    // Raw CSM stability is only half of the final image. High uses half-res
    // GTAO with temporal reprojection, and stale dark history used to trail
    // camera motion around overlapping trees/structures even while the shadow
    // maps themselves were byte-stable. Compare the ordinary temporally
    // composed output against current-frame AO with every CSM cascade forced
    // current. A healthy resolver may retain a narrow band of brighter history
    // to suppress a transient dark pulse, but must not leave either a dark
    // trail or a bright flash. Capture the identical pose once more as well:
    // the old binary moved/still weight snapped from 85% history to 100% current
    // on that repeated frame. High is the default desktop path and therefore
    // owns this full-resolution release gate; the scalar policy has a focused
    // unit test and the remaining presets retain the raw/frozen CSM contracts.
    const auditTemporalAo = ${JSON.stringify(preset === 'high')};
    let aoTemporalComparedSamples = 0;
    let aoTemporalVisibleSamples = 0;
    let aoTemporalDarkerSamples = 0;
    let aoTemporalStrongDarkSamples = 0;
    let aoTemporalMaxStrongDarkSamplesPerFrame = 0;
    let aoTemporalBrighterSamples = 0;
    let aoTemporalStrongBrightSamples = 0;
    let aoTemporalMaxStrongBrightSamplesPerFrame = 0;
    let aoTemporalMaxRgbDelta = 0;
    let aoTemporalRgbDeltaSum = 0;
    let aoRepeatComparedSamples = 0;
    let aoRepeatStrongSamples = 0;
    let aoRepeatMaxStrongSamplesPerFrame = 0;
    let aoRepeatMaxRgbDelta = 0;
    if (auditTemporalAo) {
      const aoGl = D.renderer.getContext();
      const aoWidth = aoGl.drawingBufferWidth;
      const aoHeight = aoGl.drawingBufferHeight;
      const aoBytes = aoWidth * aoHeight * 4;
      const aoPoses = [
        { offset: 0 },
        ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2]
          .map((offset) => ({ offset })),
        ...[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
          .map((yawDeg) => ({ yawDeg })),
      ];
      const aoPos = basePos.clone();
      const aoLook = baseLook.clone();
      const aoDelta = right.clone();
      const aoRelativeLook = baseLook.clone().sub(basePos);
      const savedAoEmaOff = window.__AO_EMA_OFF;
      const setAoPose = (pose) => {
        if (Number.isFinite(pose.yawDeg)) {
          const yaw = pose.yawDeg * Math.PI / 180;
          const cosYaw = Math.cos(yaw);
          const sinYaw = Math.sin(yaw);
          const lookX = aoRelativeLook.x * cosYaw + aoRelativeLook.z * sinYaw;
          const lookZ = -aoRelativeLook.x * sinYaw + aoRelativeLook.z * cosYaw;
          aoPos.copy(basePos);
          aoLook.copy(basePos).add(aoRelativeLook);
          aoLook.x = basePos.x + lookX;
          aoLook.z = basePos.z + lookZ;
        } else {
          aoDelta.copy(right).multiplyScalar(pose.offset);
          aoPos.copy(basePos).add(aoDelta);
          aoLook.copy(baseLook).add(aoDelta);
        }
        D.rig.setExternalPose(aoPos, aoLook, camera.fov);
        camera.updateMatrixWorld(true);
        D.lighting.update(true);
      };
      const captureAo = () => {
        D.post.render(1 / 60);
        const pixels = new Uint8Array(aoBytes);
        aoGl.readPixels(
          0, 0, aoWidth, aoHeight,
          aoGl.RGBA, aoGl.UNSIGNED_BYTE, pixels);
        return pixels;
      };

      window.__AO_EMA_OFF = false;
      setAoPose(aoPoses[0]);
      for (let frame = 0; frame < 8; frame++) captureAo();
      for (let frame = 1; frame < aoPoses.length; frame++) {
        setAoPose(aoPoses[frame]);
        window.__AO_EMA_OFF = true;
        const current = captureAo();
        window.__AO_EMA_OFF = false;
        const temporal = captureAo();
        const repeated = captureAo();
        let strongDarkThisFrame = 0;
        let strongBrightThisFrame = 0;
        let strongRepeatThisFrame = 0;
        // Quarter-density readback analysis keeps the audit cheap while still
        // sampling hundreds of thousands of pixels over the camera sweep.
        for (let i = 0; i < aoBytes; i += 16) {
          const signed = (temporal[i] - current[i])
            + (temporal[i + 1] - current[i + 1])
            + (temporal[i + 2] - current[i + 2]);
          const delta = Math.abs(temporal[i] - current[i])
            + Math.abs(temporal[i + 1] - current[i + 1])
            + Math.abs(temporal[i + 2] - current[i + 2]);
          aoTemporalComparedSamples++;
          aoTemporalRgbDeltaSum += delta;
          if (delta > 6) aoTemporalVisibleSamples++;
          if (signed < -6) aoTemporalDarkerSamples++;
          if (signed < -24) {
            aoTemporalStrongDarkSamples++;
            strongDarkThisFrame++;
          }
          if (signed > 6) aoTemporalBrighterSamples++;
          if (signed > 24) {
            aoTemporalStrongBrightSamples++;
            strongBrightThisFrame++;
          }
          aoTemporalMaxRgbDelta = Math.max(aoTemporalMaxRgbDelta, delta);

          const repeatDelta = Math.abs(repeated[i] - temporal[i])
            + Math.abs(repeated[i + 1] - temporal[i + 1])
            + Math.abs(repeated[i + 2] - temporal[i + 2]);
          aoRepeatComparedSamples++;
          if (repeatDelta > 24) {
            aoRepeatStrongSamples++;
            strongRepeatThisFrame++;
          }
          aoRepeatMaxRgbDelta = Math.max(aoRepeatMaxRgbDelta, repeatDelta);
        }
        aoTemporalMaxStrongDarkSamplesPerFrame = Math.max(
          aoTemporalMaxStrongDarkSamplesPerFrame, strongDarkThisFrame);
        aoTemporalMaxStrongBrightSamplesPerFrame = Math.max(
          aoTemporalMaxStrongBrightSamplesPerFrame, strongBrightThisFrame);
        aoRepeatMaxStrongSamplesPerFrame = Math.max(
          aoRepeatMaxStrongSamplesPerFrame, strongRepeatThisFrame);
      }
      window.__AO_EMA_OFF = savedAoEmaOff;
    }

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
      motionSchedule,
      aoTemporalComparedSamples,
      aoTemporalVisibleSamples,
      aoTemporalDarkerSamples,
      aoTemporalStrongDarkSamples,
      aoTemporalMaxStrongDarkSamplesPerFrame,
      aoTemporalBrighterSamples,
      aoTemporalStrongBrightSamples,
      aoTemporalMaxStrongBrightSamplesPerFrame,
      aoTemporalMaxRgbDelta,
      aoTemporalMeanRgbDelta: aoTemporalRgbDeltaSum
        / Math.max(1, aoTemporalComparedSamples),
      aoRepeatComparedSamples,
      aoRepeatStrongSamples,
      aoRepeatMaxStrongSamplesPerFrame,
      aoRepeatMaxRgbDelta,
      trimShadowThrottle: trimTelemetry.shadows.throttle,
      trimmedCascadeAutoUpdate,
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
  const cascadeCount = result.cascades.length;
  const allCascadeMask = (2 ** cascadeCount) - 1;
  const nearCascadeMask = (2 ** Math.min(2, cascadeCount)) - 1;
  const farCascadeMask = allCascadeMask & ~nearCascadeMask;
  const missingNearFrame = result.motionSchedule.find((frame) =>
    (frame.scheduledMask & nearCascadeMask) !== nearCascadeMask);
  if (missingNearFrame) {
    reasons.push(
      `near cascades were withheld at offset ${missingNearFrame.offset} `
      + `(mask ${missingNearFrame.scheduledMask.toString(2)})`,
    );
  }
  const splitFarFrame = result.motionSchedule.find((frame) => {
    const scheduledFar = frame.scheduledMask & farCascadeMask;
    return scheduledFar !== 0 && scheduledFar !== farCascadeMask;
  });
  if (splitFarFrame) {
    reasons.push(
      `far cascades split across frames at offset ${splitFarFrame.offset} `
      + `(mask ${splitFarFrame.scheduledMask.toString(2)})`,
    );
  }
  // Baseline before the responsive release was 8,149 strongly over-darkened
  // samples / 1,661,760 compared (0.49%). The release policy targets zero.
  // Gate at 0.2%: this remains well below the reproduced failure while allowing
  // the two independently rendered GTAO samples to differ at thin raster edges
  // after a live Ultra -> High sampling/resolution transition.
  const aoStrongDarkRatio = result.aoTemporalStrongDarkSamples
    / Math.max(1, result.aoTemporalComparedSamples);
  if (result.aoTemporalComparedSamples > 0 && aoStrongDarkRatio > 0.002) {
    reasons.push(
      `${result.aoTemporalStrongDarkSamples} strongly over-darkened temporal AO samples `
      + `(${(aoStrongDarkRatio * 100).toFixed(3)}%, max frame `
      + `${result.aoTemporalMaxStrongDarkSamplesPerFrame})`,
    );
  }
  const aoStrongBrightRatio = result.aoTemporalStrongBrightSamples
    / Math.max(1, result.aoTemporalComparedSamples);
  if (result.aoTemporalComparedSamples > 0 && aoStrongBrightRatio > 0.002) {
    reasons.push(
      `${result.aoTemporalStrongBrightSamples} strongly over-bright temporal AO samples `
      + `(${(aoStrongBrightRatio * 100).toFixed(3)}%, max frame `
      + `${result.aoTemporalMaxStrongBrightSamplesPerFrame})`,
    );
  }
  const aoRepeatStrongRatio = result.aoRepeatStrongSamples
    / Math.max(1, result.aoRepeatComparedSamples);
  // The reproduced binary moved/still snap changed 10-11% of samples. The
  // responsive resolver leaves only isolated SMAA threshold pixels while its
  // bounded history converges. Gate at 0.1% so any regional flash still fails
  // with two orders of magnitude of margin.
  if (result.aoRepeatComparedSamples > 0 && aoRepeatStrongRatio > 0.001) {
    reasons.push(
      `${result.aoRepeatStrongSamples} strongly changed temporal AO samples on `
      + `an identical repeated pose (${(aoRepeatStrongRatio * 100).toFixed(3)}%, `
      + `max frame ${result.aoRepeatMaxStrongSamplesPerFrame}, `
      + `max RGB delta ${result.aoRepeatMaxRgbDelta})`,
    );
  }
  if (result.trimShadowThrottle !== 0) {
    reasons.push(`adaptive trim enabled shadow throttle ${result.trimShadowThrottle}`);
  }
  if (result.trimmedCascadeAutoUpdate.some(Boolean)) {
    reasons.push('adaptive trim escaped the coherent manual-cascade scheduler');
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
    if (cascade.normalBias < 0.045 - 1e-9 || cascade.normalBias > 0.28 + 1e-9) {
      reasons.push(`cascade ${index} normal bias ${cascade.normalBias} is outside its bound`);
    }
    if (index > 0 && cascade.normalBias + 1e-9 < result.cascades[index - 1].normalBias) {
      reasons.push(`cascade ${index} normal bias regressed with distance`);
    }
  });
  if (reasons.length) failures.push({ preset, reasons });
  console.log(
    `${reasons.length ? 'FAIL' : 'PASS'} ${preset.padEnd(6)} `
    + `align=${result.maxAlignmentError.toExponential(1)} `
    + `step=${result.maxStepError.toExponential(1)} `
    + `crossings=${result.transitions} lods=${result.lods} `
    + (result.aoTemporalComparedSamples > 0
      ? `aoDark=${result.aoTemporalStrongDarkSamples} `
        + `aoBright=${result.aoTemporalStrongBrightSamples} `
        + `aoRepeat=${result.aoRepeatStrongSamples} `
      : '')
    + `calls=${result.renderer.calls} tris=${Math.round(result.renderer.triangles / 1000)}k`,
  );
}

// The preset sweep intentionally enters deterministic shot mode. A real
// battle must begin from the ordinary boot lifecycle: shot mode owns a frozen
// world and cannot be promoted into player authority. Reopen the same URL in
// this isolated session before the live-drive phase instead of coupling the
// two mutually exclusive presentation owners.
const liveAuditUrl = new URL(evaluate('location.href'));
liveAuditUrl.searchParams.set('_shadowAuditLive', String(Date.now()));
execFileSync('agent-browser', [
  '--session', session,
  'open', liveAuditUrl.href,
], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
await waitForEvaluation(`(() => ({
  ready: window.__GAME_READY === true && !!window.__DEBUG?.lighting,
  error: '',
}))()`);

evaluate(`(() => {
  const D = window.__DEBUG;
  if (${JSON.stringify(deviceTier)} === 'mobile') {
    D.quality.setMobilePresetName('mobile-high');
  } else {
    D.quality.setPresetName('high');
  }
  D.post.pinDynScale(1);
  window.__AO_EMA_OFF = false;
  const status = { ready: false, error: '' };
  window.__COT_RENDER_STABILITY_BATTLE = status;
  // Enter through the ordinary demand-loaded path. The older startBattle
  // debug helper imports the full fleet and no longer represents production.
  Promise.resolve(D.beginSoloBattle({
    specId: D.selectedSpecId,
    mapId: 'fjord',
    randomRoster: false,
  }))
    .then(() => { status.ready = D.game?.phase === 'battle'; })
    .catch((error) => { status.error = error?.stack || error?.message || String(error); });
  return true;
})()`);
await waitForEvaluation(`(() => ({
  ready: window.__COT_RENDER_STABILITY_BATTLE?.ready === true
    && window.__DEBUG?.game?.phase === 'battle',
  error: window.__COT_RENDER_STABILITY_BATTLE?.error
    || document.querySelector('.cot-error-overlay:not([hidden])')?.textContent || '',
}))()`);

// Run the force-all comparison again inside the real forest battlefield for
// every preset on this device tier. The staged sweep above is deliberately
// deterministic, but it does not contain the dense canopy-shadow field from
// the user report. Keeping the world frozen while replaying identical camera
// poses makes any changed pixel a cascade-cadence defect rather than motion.
const livePresetMotion = evaluate(`(async () => {
  const D = window.__DEBUG;
  const renderer = D.renderer;
  const camera = D.camera;
  const gl = renderer.getContext();
  const width = 320;
  const height = 180;
  const bytes = width * height * 4;
  const makeRect = () => ({
    x: 0, y: 0, z: 0, w: 0,
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; },
    copy(value) {
      this.x = value.x; this.y = value.y; this.z = value.z; this.w = value.w;
      return this;
    },
  });
  const savedTarget = renderer.getRenderTarget();
  const savedViewport = renderer.getViewport(makeRect());
  const savedScissor = renderer.getScissor(makeRect());
  const savedScissorTest = renderer.getScissorTest();
  const savedAutoClear = renderer.autoClear;
  const savedShadowDebug = window.__SHADOW_DEBUG;
  const base = camera.position.clone();
  const forward = camera.getWorldDirection(camera.position.clone()).normalize();
  const right = forward.clone().cross(camera.up).normalize();
  const look = base.clone().addScaledVector(forward, 300);
  const pos = base.clone();
  const target = look.clone();
  const offsets = [
    0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.8,
    3.15, 3.5, 3.85, 4.2, 4.55, 4.9, 5.25, 5.6,
  ];
  const capture = (offset, force) => {
    pos.copy(base).addScaledVector(right, offset);
    target.copy(look).addScaledVector(right, offset);
    D.rig.setExternalPose(pos, target, camera.fov);
    camera.updateMatrixWorld(true);
    D.lighting.update(force, 1 / 60);
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.autoClear = true;
    renderer.clear(true, true, false);
    renderer.render(D.scene, camera);
    const pixels = new Uint8Array(bytes);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const livePresets = ${JSON.stringify(presets)};
  const liveResults = [];
  window.__SHADOW_DEBUG = {};
  try {
    for (const preset of livePresets) {
      if (${JSON.stringify(deviceTier)} === 'mobile') {
        D.quality.setMobilePresetName(preset);
      } else {
        D.quality.setPresetName(preset);
      }
      D.rig.setExternalPose(base, look, camera.fov);
      for (let frame = 0; frame < 12; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const reference = offsets.map((offset) => capture(offset, true));
      capture(0, true);
      const frames = [];
      let visiblyChangedSamples = 0;
      let stronglyChangedSamples = 0;
      let maxVisiblyChangedSamplesPerFrame = 0;
      let maxRgbDelta = 0;
      offsets.forEach((offset, frame) => {
        const actual = capture(offset, false);
        const expected = reference[frame];
        let visibleThisFrame = 0;
        let strongThisFrame = 0;
        let frameMaxRgbDelta = 0;
        for (let i = 0; i < bytes; i += 4) {
          const delta = Math.abs(actual[i] - expected[i])
            + Math.abs(actual[i + 1] - expected[i + 1])
            + Math.abs(actual[i + 2] - expected[i + 2]);
          // Frame zero is the explicit all-cascade reset at an unchanged pose.
          // A live preset switch can still retire one old-size render target on
          // that draw; the moving frames below own cadence stability.
          if (delta > 3 && frame > 0) {
            visiblyChangedSamples++;
            visibleThisFrame++;
          }
          if (delta > 24 && frame > 0) {
            stronglyChangedSamples++;
            strongThisFrame++;
          }
          if (frame > 0) {
            frameMaxRgbDelta = Math.max(frameMaxRgbDelta, delta);
            maxRgbDelta = Math.max(maxRgbDelta, delta);
          }
        }
        const shadowState = D.lighting.getShadowTelemetry();
        frames.push({
          offset,
          scheduledMask: shadowState.scheduledMask,
          visibleThisFrame,
          strongThisFrame,
          maxRgbDelta: frameMaxRgbDelta,
        });
        maxVisiblyChangedSamplesPerFrame = Math.max(
          maxVisiblyChangedSamplesPerFrame, visibleThisFrame);
      });
      liveResults.push({
        preset,
        resolvedPreset: D.telemetry().quality.preset,
        visiblyChangedSamples,
        stronglyChangedSamples,
        maxVisiblyChangedSamplesPerFrame,
        maxRgbDelta,
        frames,
      });
    }
  } finally {
    D.rig.setExternalPose(base, look, camera.fov);
    camera.updateMatrixWorld(true);
    D.lighting.update(true, 1 / 60);
    renderer.setRenderTarget(savedTarget);
    renderer.setViewport(
      savedViewport.x, savedViewport.y, savedViewport.z, savedViewport.w);
    renderer.setScissor(
      savedScissor.x, savedScissor.y, savedScissor.z, savedScissor.w);
    renderer.setScissorTest(savedScissorTest);
    renderer.autoClear = savedAutoClear;
    window.__SHADOW_DEBUG = savedShadowDebug;
    D.rig.release();
  }
  return liveResults;
})()`);

for (const result of livePresetMotion) {
  const reasons = [];
  if (result.resolvedPreset !== result.preset) {
    reasons.push(`resolved as ${result.resolvedPreset}`);
  }
  const visibleRatio = result.maxVisiblyChangedSamplesPerFrame / (320 * 180);
  if (visibleRatio > 0.0001) {
    reasons.push(
      `${result.maxVisiblyChangedSamplesPerFrame} live forest samples changed in one frame `
      + `against force-all (max RGB delta ${result.maxRgbDelta})`,
    );
  }
  const cascadeCount = deviceTier === 'mobile' ? 3 : 4;
  const nearMask = (2 ** Math.min(2, cascadeCount)) - 1;
  const missingNearFrame = result.frames.find((frame) =>
    (frame.scheduledMask & nearMask) !== nearMask);
  if (missingNearFrame) {
    reasons.push(
      `live forest near cascades withheld at offset ${missingNearFrame.offset} `
      + `(mask ${missingNearFrame.scheduledMask.toString(2)})`,
    );
  }
  if (reasons.length) failures.push({ preset: `live-${result.preset}`, reasons });
  console.log(
    `${reasons.length ? 'FAIL' : 'PASS'} live-${result.preset.padEnd(11)} `
    + `visible=${result.visiblyChangedSamples} strong=${result.stronglyChangedSamples} `
    + `maxFrame=${result.maxVisiblyChangedSamplesPerFrame} maxRgb=${result.maxRgbDelta}`,
  );
}

// The bug report is specifically a moving player tank, not an orbiting QA
// camera. Exercise the real input listeners, fixed-step movement, suspension,
// player shadow caster, chase rig, GTAO history and destruction/fire path in
// one live battle. The force-all sweep above is the pixel-level shadow truth;
// this contract makes sure that truth also covers the actual gameplay path.
evaluate(`(async () => {
  const D = window.__DEBUG;
  if (${JSON.stringify(deviceTier)} === 'mobile') {
    D.quality.setMobilePresetName('mobile-high');
  } else {
    D.quality.setPresetName('high');
  }
  for (let frame = 0; frame < 12; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return true;
})()`);

evaluate(`(() => {
  const D = window.__DEBUG;

  const key = (type, code, value) => window.dispatchEvent(new KeyboardEvent(type, {
    code, key: value, bubbles: true,
  }));
  const state = {
    key,
    playerStart: D.game.player.state.pos.clone(),
    cameraStart: D.camera.position.clone(),
    externalAtStart: D.rig.externalActive,
    frameTimes: [],
    frameSamples: [],
    sampling: true,
    previous: performance.now(),
    sampleStart: performance.now(),
  };
  state.sample = (now) => {
    const frameMs = now - state.previous;
    state.frameTimes.push(frameMs);
    state.frameSamples.push({
      frameMs,
      elapsedMs: now - state.sampleStart,
      programs: D.renderer.info.programs?.length || 0,
      drawCalls: D.renderer.info.render.calls,
      triangles: D.renderer.info.render.triangles,
    });
    state.previous = now;
    if (state.sampling) requestAnimationFrame(state.sample);
  };
  window.__COT_RENDER_STABILITY_DRIVE = state;
  requestAnimationFrame(state.sample);
  key('keydown', 'KeyW', 'w');
  key('keydown', 'KeyD', 'd');
  D.flags.forceFire = true;
  return true;
})()`);

evaluate(`(async () => {
  const state = window.__COT_RENDER_STABILITY_DRIVE;
  await new Promise((resolve) => setTimeout(resolve, 2400));
  state.key('keyup', 'KeyD', 'd');
  state.key('keydown', 'KeyA', 'a');
  return true;
})()`);

evaluate(`(async () => {
  const state = window.__COT_RENDER_STABILITY_DRIVE;
  await new Promise((resolve) => setTimeout(resolve, 2400));
  state.key('keyup', 'KeyA', 'a');
  state.key('keydown', 'KeyD', 'd');
  return true;
})()`);

evaluate(`(async () => {
  const D = window.__DEBUG;
  const state = window.__COT_RENDER_STABILITY_DRIVE;
  await new Promise((resolve) => setTimeout(resolve, 2400));
  state.key('keyup', 'KeyW', 'w');
  state.key('keyup', 'KeyD', 'd');
  D.flags.forceFire = false;
  state.sampling = false;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return true;
})()`);

const liveDrive = evaluate(`(() => {
  const D = window.__DEBUG;
  const state = window.__COT_RENDER_STABILITY_DRIVE;
  const playerEnd = D.game.player.state.pos;
  const cameraEnd = D.camera.position;
  const telemetry = D.telemetry();
  const glError = D.renderer.getContext().getError();
  let canopyShadowProxyCasters = 0;
  let canopyShadowProxyVertices = 0;
  let treeFoliageShadowCasters = 0;
  let treeTrunkShadowCasters = 0;
  let treeTrunkShadowReceivers = 0;
  let treeShadowLodFadeCasters = 0;
  let treeShadowLodFadeMissing = 0;
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
    if ((object.userData?.canopyShadowProxy || object.userData?.treeTrunk)
        && object.castShadow) {
      if (object.customDepthMaterial?.userData?.lodShadowFade
          && object.userData?.lodShadowFadeCaster
          && object.geometry?.getAttribute?.('aLodF')) {
        treeShadowLodFadeCasters++;
      } else {
        treeShadowLodFadeMissing++;
      }
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
  state.frameTimes.sort((a, b) => a - b);
  state.frameSamples.sort((a, b) => b.frameMs - a.frameMs);
  const percentile = (q) => state.frameTimes[Math.min(
    state.frameTimes.length - 1, Math.floor(state.frameTimes.length * q))] || 0;
  const result = {
    map: D.game.mapId,
    phase: D.game.phase,
    externalAtStart: state.externalAtStart,
    externalAtEnd: D.rig.externalActive,
    distanceM: state.playerStart.distanceTo(playerEnd),
    cameraDistanceM: state.cameraStart.distanceTo(cameraEnd),
    frames: state.frameTimes.length,
    frameMsP50: percentile(0.50),
    frameMsP95: percentile(0.95),
    frameMsP99: percentile(0.99),
    frameMsMax: percentile(1),
    framesOver33Ms: state.frameTimes.filter((ms) => ms > 33.4).length,
    slowestFrames: state.frameSamples.slice(0, 8),
    glError,
    shaderErrors: telemetry.shadows.shaderErrors,
    canopyShadowProxyCasters,
    canopyShadowProxyVertices,
    treeFoliageShadowCasters,
    treeTrunkShadowCasters,
    treeTrunkShadowReceivers,
    treeShadowLodFadeCasters,
    treeShadowLodFadeMissing,
    treeRootDecalMeshes,
    treeRootDecalReceivers,
    treeRootDecalTriangles,
    treeRootDecalCount,
    treeRootDecalAreaM2,
    treeRootDecalMaxRadiusM,
    groundContactDecalMeshes,
    groundContactDecalReceivers,
    shadowThrottle: telemetry.shadows.throttle,
    cascadeAutoUpdate: telemetry.shadows.cascades
      .map((cascade) => cascade.autoUpdate),
  };
  delete window.__COT_RENDER_STABILITY_DRIVE;
  return result;
})()`);

// Hold the presentation camera fixed while moving only the vegetation LOD
// observer far enough to demote a dense ring of trees. This turns the user's
// intermittent forest-light flash into a deterministic frame boundary. All
// cascades are current and instance culling is disabled, so the first frame
// whose proxy population drops measures only the near-tree caster handoff.
const treeLodShadowTransition = evaluate(`(() => {
  const D = window.__DEBUG;
  const renderer = D.renderer;
  const camera = D.camera;
  const gl = renderer.getContext();
  const width = 320;
  const height = 180;
  const bytes = width * height * 4;
  const savedTarget = renderer.getRenderTarget();
  const makeRect = () => ({
    x: 0, y: 0, z: 0, w: 0,
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; },
    copy(value) {
      this.x = value.x; this.y = value.y; this.z = value.z; this.w = value.w;
      return this;
    },
  });
  const savedViewport = renderer.getViewport(makeRect());
  const savedScissor = renderer.getScissor(makeRect());
  const savedScissorTest = renderer.getScissorTest();
  const savedAutoClear = renderer.autoClear;
  const savedShadowDebug = window.__SHADOW_DEBUG;
  camera.updateMatrixWorld(true);
  const base = camera.position.clone();
  const forward = camera.getWorldDirection(camera.position.clone()).normalize();
  const look = base.clone().addScaledVector(forward, 300);
  const shifted = base.clone().add({ x: 350, y: 0, z: 0 });
  D.rig.setExternalPose(base, look, camera.fov);
  window.__SHADOW_DEBUG = { forceAll: true, noCull: true };

  const proxyCount = () => {
    let count = 0;
    D.scene.traverse((object) => {
      if (object.userData?.canopyShadowProxy) count += object.count || 0;
    });
    return count;
  };
  const capture = () => {
    D.lighting.update(true, 1 / 60);
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.autoClear = true;
    renderer.clear(true, true, false);
    renderer.render(D.scene, camera);
    const pixels = new Uint8Array(bytes);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const diff = (previous, current) => {
    let changedSamples = 0;
    let visiblyChangedSamples = 0;
    let maxRgbDelta = 0;
    for (let i = 0; i < current.length; i += 4) {
      const delta = Math.abs(previous[i] - current[i])
        + Math.abs(previous[i + 1] - current[i + 1])
        + Math.abs(previous[i + 2] - current[i + 2]);
      if (delta > 0) changedSamples++;
      if (delta > 12) visiblyChangedSamples++;
      maxRgbDelta = Math.max(maxRgbDelta, delta);
    }
    return { changedSamples, visiblyChangedSamples, maxRgbDelta };
  };

  let proxyCountBefore = 0;
  let proxyCountPeak = 0;
  let proxyCountAfter = 0;
  let removalFrame = -1;
  let removalChangedSamples = 0;
  let removalVisiblyChangedSamples = 0;
  let removalMaxRgbDelta = 0;
  try {
    D.world.update(0, base, forward, null);
    D.world.update(0, base, forward, null);
    let previousPixels = capture();
    let previousProxyCount = proxyCount();
    proxyCountBefore = previousProxyCount;
    proxyCountPeak = previousProxyCount;
    for (let frame = 0; frame < 30; frame++) {
      D.world.update(1 / 60, shifted, forward, null);
      const currentPixels = capture();
      const currentProxyCount = proxyCount();
      proxyCountPeak = Math.max(proxyCountPeak, currentProxyCount);
      if (removalFrame < 0 && currentProxyCount < previousProxyCount) {
        const frameDiff = diff(previousPixels, currentPixels);
        removalFrame = frame;
        removalChangedSamples = frameDiff.changedSamples;
        removalVisiblyChangedSamples = frameDiff.visiblyChangedSamples;
        removalMaxRgbDelta = frameDiff.maxRgbDelta;
      }
      previousPixels = currentPixels;
      previousProxyCount = currentProxyCount;
    }
    proxyCountAfter = proxyCount();
  } finally {
    D.world.update(0, base, forward, null);
    D.world.update(0, base, forward, null);
    D.lighting.update(true, 1 / 60);
    renderer.setRenderTarget(savedTarget);
    renderer.setViewport(
      savedViewport.x, savedViewport.y, savedViewport.z, savedViewport.w);
    renderer.setScissor(
      savedScissor.x, savedScissor.y, savedScissor.z, savedScissor.w);
    renderer.setScissorTest(savedScissorTest);
    renderer.autoClear = savedAutoClear;
    window.__SHADOW_DEBUG = savedShadowDebug;
    D.rig.release();
  }
  return {
    proxyCountBefore,
    proxyCountPeak,
    proxyCountAfter,
    removalFrame,
    removalChangedSamples,
    removalVisiblyChangedSamples,
    removalMaxRgbDelta,
  };
})()`);

const liveDriveReasons = [];
if (liveDrive.phase !== 'battle' || liveDrive.map !== 'fjord') {
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
if (liveDrive.cascadeAutoUpdate.some(Boolean)) {
  liveDriveReasons.push('live drive escaped the coherent manual-cascade scheduler');
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
if (liveDrive.treeShadowLodFadeCasters < 1 || liveDrive.treeShadowLodFadeMissing !== 0) {
  liveDriveReasons.push(
    `${liveDrive.treeShadowLodFadeMissing} live tree casters ignore the LOD shadow dissolve`,
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
if (treeLodShadowTransition.removalFrame < 0) {
  liveDriveReasons.push('tree LOD stress did not exercise a canopy-caster removal');
} else if (treeLodShadowTransition.removalVisiblyChangedSamples > 800) {
  liveDriveReasons.push(
    `tree LOD caster removal changed ${treeLodShadowTransition.removalVisiblyChangedSamples} visible samples`,
  );
}
if (liveDriveReasons.length) failures.push({ preset: 'live-drive', reasons: liveDriveReasons });
console.log(
  `${liveDriveReasons.length ? 'FAIL' : 'PASS'} live-drive `
  + `tank=${liveDrive.distanceM.toFixed(1)}m camera=${liveDrive.cameraDistanceM.toFixed(1)}m `
  + `frames=${liveDrive.frames} p50=${liveDrive.frameMsP50.toFixed(1)}ms `
  + `p95=${liveDrive.frameMsP95.toFixed(1)}ms `
  + `treeLodRemoval=${treeLodShadowTransition.removalVisiblyChangedSamples}`,
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  version: 9,
  capturedAt: new Date().toISOString(),
  deviceTier,
  failures,
  results,
  livePresetMotion,
  liveDrive,
  treeLodShadowTransition,
}, null, 2));
console.log(`wrote ${outPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`${failure.preset}: ${failure.reasons.join('; ')}`);
  process.exitCode = 1;
}
