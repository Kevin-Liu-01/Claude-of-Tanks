import type { TrackSurface } from './trackSurface.ts';
import { createDeformedHeightField, type DeformableHeightField, type TerrainDeformation } from '../sim/terrainDeformation.ts';

interface HeightFieldLike<Normal> {
  size: number;
  minY: number;
  maxY: number;
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
  getNormalAt(x: number, z: number): Normal;
  getGroundType(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
  getWaterMaskAt(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  getWaterSurfaceHeightAt?(x: number, z: number): number;
  getTrackSurfaceAt?(x: number, z: number): TrackSurface;
  getRoadPaveAt?(x: number, z: number): number;
}

interface HeightFieldWorld<Normal> {
  heightField: HeightFieldLike<Normal>;
}

interface LiveHeightFieldProxy<Normal> {
  getHeightAt(x: number, z: number): number;
  getContactHeightAt(x: number, z: number): number;
  getHeightAtFast(x: number, z: number): number;
  getHeightAtExact(x: number, z: number): number;
  getNormalAt(x: number, z: number): Normal;
  getGroundType(x: number, z: number): string;
  getDriveGroundType(x: number, z: number): string;
  getWaterMaskAt(x: number, z: number): number;
  getWaterDepthAt(x: number, z: number): number;
  getWaterSurfaceHeightAt(x: number, z: number): number;
  getTrackSurfaceAt(x: number, z: number): TrackSurface;
  /** The paved share of a carriageway (roadPave.ts); 0 on an older or mock field. */
  getRoadPaveAt(x: number, z: number): number;
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
    getContactHeightAt(x, z) {
      const heightField = field();
      return heightField ? (heightField.getContactHeightAt?.(x, z) ?? fastHeight(heightField, x, z)) : 0;
    },
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
    getDriveGroundType(x, z) {
      const heightField = field();
      return heightField?.getDriveGroundType?.(x, z) ?? heightField?.getGroundType(x, z) ?? 'hard';
    },
    getWaterMaskAt(x, z) {
      return field()?.getWaterMaskAt(x, z) ?? 0;
    },
    getWaterDepthAt(x, z) {
      return field()?.getWaterDepthAt?.(x, z) ?? 0;
    },
    getWaterSurfaceHeightAt(x, z) {
      const heightField = field();
      if (!heightField) return 0;
      return heightField.getWaterSurfaceHeightAt?.(x, z)
        ?? heightField.getHeightAt(x, z) + (heightField.getWaterDepthAt?.(x, z) ?? 0);
    },
    getTrackSurfaceAt(x, z) {
      return field()?.getTrackSurfaceAt?.(x, z) ?? 0;
    },
    getRoadPaveAt(x, z) {
      return field()?.getRoadPaveAt?.(x, z) ?? 0;
    },
    get size() { return field()?.size ?? 1000; },
    get minY() { return field()?.minY ?? 0; },
    get maxY() { return field()?.maxY ?? 0; },
  };
}

/**
 * The live ground as the battle (or the Studio) has dug it (DST-04, 2026-10-15; docs/DESTRUCTION.md §7): the world's
 * bound overlay added as the simulation adds it (sim/terrainDeformation.ts createDeformedHeightField: heights plus
 * `offsetAt`, the contact surface plus `contactOffsetAt`, the dug ground's normal), so the presentation's running gear
 * and the Studio's hulls ride the craters and heaps the simulation's hulls ride. Every other member reads through to
 * `base`. One wrapper per bound overlay (rebuilt when the world binds another); no allocation per query.
 */
export function createDugHeightFieldProxy<P extends DeformableHeightField>(
  base: P,
  overlayOf: () => TerrainDeformation | null,
): P {
  let bound: TerrainDeformation | null = null;
  let dug: P = base;
  const current = (): P => {
    const overlay = overlayOf();
    if (overlay !== bound) {
      bound = overlay;
      dug = overlay ? createDeformedHeightField(base, overlay) : base;
    }
    return dug;
  };
  const proxy = Object.create(base) as P;
  Object.defineProperties(proxy, {
    getHeightAt: { value: (x: number, z: number): number => current().getHeightAt(x, z), configurable: true },
    getHeightAtFast: {
      value: (x: number, z: number): number => {
        const field = current();
        return field.getHeightAtFast ? field.getHeightAtFast(x, z) : field.getHeightAt(x, z);
      },
      configurable: true,
    },
    getContactHeightAt: {
      value: (x: number, z: number): number => {
        const field = current();
        return field.getContactHeightAt ? field.getContactHeightAt(x, z) : field.getHeightAt(x, z);
      },
      configurable: true,
    },
    getNormalAt: { value: (x: number, z: number) => current().getNormalAt?.(x, z), configurable: true },
    maxY: { get: () => current().maxY ?? 0, configurable: true },
  });
  return proxy;
}
