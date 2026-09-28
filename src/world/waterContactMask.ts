export interface WaterContactField {
  getWaterMaskAt?(x: number, z: number): number;
  getHeightAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  getWaterSurfaceHeightAt?(x: number, z: number): number;
}

/** Coverage only when the vehicle's contact point actually reaches the water. */
export function waterContactMaskAt(
  field: WaterContactField | null | undefined, x: number, contactY: number, z: number,
): number {
  const mask = field?.getWaterMaskAt?.(x, z) ?? 0;
  if (!(mask > 0.02) || !Number.isFinite(contactY)) return 0;
  const surfaceY = field?.getWaterSurfaceHeightAt?.(x, z)
    ?? ((field?.getHeightAt?.(x, z) ?? -Infinity) + (field?.getWaterDepthAt?.(x, z) ?? 0));
  // A few centimetres cover the contact solver/cache tolerance, not a flying
  // hull or a bridge deck. Prefer the rendered surface over analytic depth.
  return Number.isFinite(surfaceY) && contactY <= surfaceY + 0.06 ? mask : 0;
}
