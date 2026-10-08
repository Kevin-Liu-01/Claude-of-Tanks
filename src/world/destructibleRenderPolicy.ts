interface DestructibleRenderMetadata {
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

/**
 * (b37; the whole-PR census: moving-camera shadow casters +9 to +150 draws over main, from prop and vegetation casters)
 * The cascades a caster of a height takes, as a cascade bit mask (renderLayers.ts setShadowCasterCascades): low content
 * (under 2 m — fences, wall modules, sandbags, wire, bales, stooks, low dressing) the near two, where its shadow is more
 * than a few texels; a man's height to a lorry's (under 4 m) the near three; anything taller every cascade (null). The
 * far cascades redraw as the camera moves. Every props caster takes it by its tallest part (props.ts): the destructible
 * families, the merged material buckets (the regional kits' with the rest, no opt-in), the baked instances, the rock
 * formations, the wreck shadows.
 */
export function shadowCascadesForHeight(heightM: number | null | undefined): number | null {
  const h = heightM ?? Infinity;
  if (!(h < 4)) return null;
  return h < 2 ? 0b0011 : 0b0111;
}

/** A casting destructible family's cascades: by its record's height; a toppling actor's every cascade (its shadow
 * sweeps as it falls). */
export function destructibleShadowCascades(metadata: DestructibleRenderMetadata): number | null {
  if (metadata.cls === 'topple') return null;
  return shadowCascadesForHeight(metadata.h ?? 0);
}
