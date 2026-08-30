export interface ShadowFitInputs {
  cameraWorld: ArrayLike<number>;
  projection: ArrayLike<number>;
  lightDirection: ArrayLike<number>;
}

export interface ShadowFitCache {
  changed(inputs: ShadowFitInputs, force?: boolean): boolean;
  invalidate(): void;
}

const CAMERA_MATRIX_ELEMENTS = 16;
const PROJECTION_MATRIX_ELEMENTS = 16;
const LIGHT_DIRECTION_ELEMENTS = 3;
const SNAPSHOT_ELEMENTS = CAMERA_MATRIX_ELEMENTS
  + PROJECTION_MATRIX_ELEMENTS
  + LIGHT_DIRECTION_ELEMENTS;

function finiteElement(values: ArrayLike<number>, index: number): number {
  const value = Number(values[index]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Track the exact inputs that determine a CSM light-camera fit.
 *
 * Moving casters require fresh depth submissions, but they do not change the
 * cascade projection. Keeping that distinction explicit avoids repeating all
 * four frustum transforms on a stationary camera while retaining the same
 * shadow maps, cadence, resolution, and caster set.
 */
export function createShadowFitCache(): ShadowFitCache {
  const snapshot = new Float64Array(SNAPSHOT_ELEMENTS);
  let valid = false;

  const changed = ({
    cameraWorld,
    projection,
    lightDirection,
  }: ShadowFitInputs, force = false): boolean => {
    let different = force || !valid;
    let offset = 0;
    for (let index = 0; index < CAMERA_MATRIX_ELEMENTS; index++, offset++) {
      const value = finiteElement(cameraWorld, index);
      if (snapshot[offset] !== value) different = true;
      snapshot[offset] = value;
    }
    for (let index = 0; index < PROJECTION_MATRIX_ELEMENTS; index++, offset++) {
      const value = finiteElement(projection, index);
      if (snapshot[offset] !== value) different = true;
      snapshot[offset] = value;
    }
    for (let index = 0; index < LIGHT_DIRECTION_ELEMENTS; index++, offset++) {
      const value = finiteElement(lightDirection, index);
      if (snapshot[offset] !== value) different = true;
      snapshot[offset] = value;
    }
    valid = true;
    return different;
  };

  return {
    changed,
    invalidate() { valid = false; },
  };
}
