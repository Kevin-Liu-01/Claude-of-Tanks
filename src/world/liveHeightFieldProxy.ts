interface HeightFieldLike<Normal> {
  size: number;
  minY: number;
  maxY: number;
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt(x: number, z: number): Normal;
  getGroundType(x: number, z: number): string;
  getWaterMaskAt(x: number, z: number): number;
}

interface HeightFieldWorld<Normal> {
  heightField: HeightFieldLike<Normal>;
}

export interface LiveHeightFieldProxy<Normal> {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast(x: number, z: number): number;
  getHeightAtExact(x: number, z: number): number;
  getNormalAt(x: number, z: number): Normal;
  getGroundType(x: number, z: number): string;
  getWaterMaskAt(x: number, z: number): number;
  readonly size: number;
  readonly minY: number;
  readonly maxY: number;
}

interface LiveHeightFieldProxyOptions<Normal> {
  getWorld(): HeightFieldWorld<Normal> | null;
  useExactHeight(): boolean;
  upNormal: Normal;
}

/**
 * Stable terrain-query boundary shared by presentation systems. Ordinary live
 * queries use the warmed cache; deterministic authoring modes can request the
 * analytic surface without teaching every camera/FX consumer about world
 * lifetime or cache selection.
 */
export function createLiveHeightFieldProxy<Normal>({
  getWorld,
  useExactHeight,
  upNormal,
}: LiveHeightFieldProxyOptions<Normal>): LiveHeightFieldProxy<Normal> {
  if (typeof getWorld !== 'function' || typeof useExactHeight !== 'function') {
    throw new TypeError('live height proxy requires world and mode providers');
  }

  const field = (): HeightFieldLike<Normal> | null => getWorld()?.heightField ?? null;
  const fastHeight = (heightField: HeightFieldLike<Normal>, x: number, z: number): number =>
    heightField.getHeightAtFast
      ? heightField.getHeightAtFast(x, z)
      : heightField.getHeightAt(x, z);

  return {
    getHeightAt(x, z) {
      const heightField = field();
      if (!heightField) return 0;
      return useExactHeight()
        ? heightField.getHeightAt(x, z)
        : fastHeight(heightField, x, z);
    },
    getHeightAtFast(x, z) {
      const heightField = field();
      return heightField ? fastHeight(heightField, x, z) : 0;
    },
    getHeightAtExact(x, z) {
      return field()?.getHeightAt(x, z) ?? 0;
    },
    getNormalAt(x, z) {
      return field()?.getNormalAt(x, z) ?? upNormal;
    },
    getGroundType(x, z) {
      return field()?.getGroundType(x, z) ?? 'hard';
    },
    getWaterMaskAt(x, z) {
      return field()?.getWaterMaskAt(x, z) ?? 0;
    },
    get size() { return field()?.size ?? 1000; },
    get minY() { return field()?.minY ?? 0; },
    get maxY() { return field()?.maxY ?? 0; },
  };
}
