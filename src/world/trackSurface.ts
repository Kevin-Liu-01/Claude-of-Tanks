/** Presentation only: these values share the existing track-print attribute. */
export type TrackSurface = 0 | 2 | 3;
export type TrackSurfacePolicy = 'earth' | 'sand' | 'snow' | 'shore';

/** Pass the resolved SOURCED terrain palette, not the props/horizon palette. */
export function trackSurfacePolicy(palette: string): TrackSurfacePolicy {
  if (palette === 'desert' || palette === 'badlands') return 'sand';
  if (palette === 'winter' || palette === 'alpine') return 'snow';
  return palette === 'coastal' ? 'shore' : 'earth';
}

function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * No pixel readback or new material grid. Keep powder outside the existing
 * 14 m road/shoulder paint support (including hardstands in that same grid).
 * Frozen sheet coverage stays ordinary, even where it has snowy drift paint.
 * Mixed coasts require the actual dry beach blend, never inland worn turf.
 */
export function trackSurfaceAt(
  policy: TrackSurfacePolicy,
  roadDistance: number,
  sheetWetness: number,
  waterRampStart: number,
  waterRampEnd: number,
): TrackSurface {
  if (policy === 'earth' || roadDistance < 14) return 0;
  if (policy === 'snow') return sheetWetness > 0 ? 0 : 3;
  const water = smooth(waterRampStart, waterRampEnd, sheetWetness);
  if (water > 0.02) return 0;
  if (policy === 'sand') return 2;
  const beach = smooth(0.02, waterRampStart, sheetWetness) * (1 - water);
  return beach > 0.5 ? 2 : 0;
}
