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
const presets = ['ultra', 'high', 'medium', 'low', 'mobile'];

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

const results = [];
const failures = [];
for (const preset of presets) {
  const result = evaluate(`(async () => {
    const D = window.__DEBUG;
    D.quality.setPresetName(${JSON.stringify(preset)});
    window.__SHOTS.set('battlefield');
    D.post.pinDynScale(1);
    await new Promise((resolve) => setTimeout(resolve, 700));

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
    const missingTextures = new Set();
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
      lods,
      zeroHysteresisLevels,
      invalidInstancedBounds,
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
  if (result.glError !== 0) reasons.push(`WebGL error ${result.glError}`);
  if (result.shaderErrors !== 0) reasons.push(`${result.shaderErrors} shader errors`);
  if (result.zeroHysteresisLevels !== 0) reasons.push(`${result.zeroHysteresisLevels} zero-hysteresis LOD levels`);
  if (result.invalidInstancedBounds !== 0) reasons.push(`${result.invalidInstancedBounds} invalid instanced bounds`);
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

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  version: 1,
  capturedAt: new Date().toISOString(),
  failures,
  results,
}, null, 2));
console.log(`wrote ${outPath}`);

if (failures.length) {
  for (const failure of failures) console.error(`${failure.preset}: ${failure.reasons.join('; ')}`);
  process.exitCode = 1;
}
