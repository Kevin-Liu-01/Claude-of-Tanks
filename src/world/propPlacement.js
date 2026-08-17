// Renderer-free authored-prop placement helpers. These run only while a map is
// assembled, so every visual instance and its collision record share the same
// terrain support and compound dimensions without adding work to the frame loop.

const TAU = Math.PI * 2;

function heightAt(heightField, x, z) {
  return heightField.getHeightAt(x, z);
}

/** Lowest terrain support under a circular footprint, including its center. */
export function sampleDiscGround(heightField, x, z, radius, sink = 0) {
  let min = heightAt(heightField, x, z);
  let max = min;
  const r = Math.max(0, radius);
  for (let index = 0; index < 8; index++) {
    const angle = index * TAU / 8;
    const y = heightAt(heightField, x + Math.cos(angle) * r, z + Math.sin(angle) * r);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { y: min - Math.max(0, sink), min, max, spread: max - min };
}

/** Lowest terrain support under a rotated box footprint, corners and edges. */
export function sampleObbGround(heightField, x, z, halfWidth, halfLength, yaw = 0, sink = 0) {
  const hw = Math.max(0, halfWidth);
  const hl = Math.max(0, halfLength);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  let min = heightAt(heightField, x, z);
  let max = min;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      if (ix === 0 && iz === 0) continue;
      const lx = ix * hw;
      const lz = iz * hl;
      const y = heightAt(heightField, x + lx * c + lz * s, z - lx * s + lz * c);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return { y: min - Math.max(0, sink), min, max, spread: max - min };
}

/**
 * Collision slabs matching the three visibly crossed steel beams of one
 * anti-tank hedgehog. Each pitched beam gets its own narrow OBB and vertical
 * range instead of one oversized cylinder around all of the empty space.
 */
export function hedgehogBeamSpecs(x, baseY, z, yaw, scale, yawOffsets = [0, 0, 0]) {
  const halfWidth = 0.08 * scale;
  const halfLength = 1.05 * scale;
  const halfThickness = 0.08 * scale;
  const centerY = baseY + 0.62 * scale;
  const tilts = [0.62, -0.62, 0.02];
  return tilts.map((tilt, index) => {
    const sinTilt = Math.abs(Math.sin(tilt));
    const cosTilt = Math.abs(Math.cos(tilt));
    const verticalHalf = sinTilt * halfLength + cosTilt * halfThickness;
    const projectedHalfLength = cosTilt * halfLength + sinTilt * halfThickness;
    return {
      x,
      z,
      yaw: yaw + index * TAU / 3 + (yawOffsets[index] || 0),
      tilt,
      halfWidth,
      halfLength: projectedHalfLength,
      minY: centerY - verticalHalf,
      maxY: centerY + verticalHalf,
    };
  });
}
