export interface DestructibleRenderMetadata {
  castShadow?: boolean;
  cls?: string;
  h?: number;
  r?: number;
  collider?: boolean;
  wall?: boolean;
  fence?: boolean;
}
/**
 * Decide whether a destructible family deserves a cascaded shadow draw.
 *
 * Small ground clutter is already grounded by direct lighting, GTAO and its
 * received world shadow. Submitting every bucket, can and crate as a separate
 * draw to each cascade costs more than the object itself. Large silhouettes,
 * cover, walls, fences and topple actors retain authored dynamic shadows.
 */
export function destructibleCastsShadow(
  metadata: DestructibleRenderMetadata,
): boolean {
  if (typeof metadata.castShadow === 'boolean') return metadata.castShadow;
  return metadata.collider === true
    || metadata.wall === true
    || metadata.fence === true
    || metadata.cls === 'topple'
    || (metadata.h ?? 0) >= 1.15
    || (metadata.r ?? 0) >= 1.0;
}
