/**
 * The tactical map's water, split the way the world draws it (owner 2026-10-14, Kestrel Airfield: "fix the map and how it
 * shows a bunch of water spots by spawn even though you can't actually see any water").
 *
 * A battlefield's lake and marsh discs (layout.lakes + layout.marshes) are terrain features, not water: the world draws a
 * liquid sheet only on a map with one (terrain.ts `liquidWater`: splat.seaLake without frozen marshes) and only where
 * heightField.getWaterMaskAt is above zero. Everywhere else the same disc is a bog, a salt pan, a takyr flat or ice. Each
 * disc is sampled inside its own shoreline contour — the centre, then staggered rings out to 0.94 of the local radius,
 * about every 8 m, at most 337 samples — and is liquid at the first wet sample. Node-runnable and allocation-light: the
 * world memoises the split, and the battle's audio reads the same features mid-fight (audioEngine.ts landmarks).
 */
import { shorelineRadiusAt, type ShorelineDisc } from './shoreline.ts';

const TAU = Math.PI * 2;
/** Ring radii in units of the local shoreline radius; the centre is sampled first. */
const RING_FRACTIONS = [0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 0.94] as const;
const SAMPLE_SPACING_M = 8;
const MIN_RING_SAMPLES = 8;
const MAX_RING_SAMPLES = 48;

/** True when the world draws liquid water anywhere inside the disc's shoreline (a bounded sample, first wet wins). */
function discHoldsLiquid(disc: ShorelineDisc, waterMaskAt: (x: number, z: number) => number): boolean {
  if (waterMaskAt(disc.x, disc.z) > 0) return true;
  for (let ring = 0; ring < RING_FRACTIONS.length; ring++) {
    const fraction = RING_FRACTIONS[ring];
    const count = Math.min(MAX_RING_SAMPLES,
      Math.max(MIN_RING_SAMPLES, Math.ceil(TAU * disc.r * fraction / SAMPLE_SPACING_M)));
    const stagger = (ring & 1) * 0.5; // alternate rings sit between their neighbours' spokes
    for (let i = 0; i < count; i++) {
      const angle = (i + stagger) / count * TAU;
      const radius = shorelineRadiusAt(disc, angle) * fraction;
      if (waterMaskAt(disc.x + Math.cos(angle) * radius, disc.z + Math.sin(angle) * radius) > 0) return true;
    }
  }
  return false;
}

/** A battlefield's discs in their authored order, split into the ones holding liquid and the dry (or frozen) rest. */
interface MinimapWaterSplit<Disc extends ShorelineDisc> {
  readonly liquid: readonly Disc[];
  readonly soft: readonly Disc[];
}

/**
 * Split the discs by the world's own liquid mask (`heightField.getWaterMaskAt`, 0 everywhere on a map without a liquid
 * sheet). The HUD minimap and the Studio's plan paint only `liquid` as water; `soft` reads as ground, or as ice where the
 * map's wet layer is ice (splat.iceLake).
 */
export function splitMinimapWater<Disc extends ShorelineDisc>(
  discs: readonly Disc[],
  waterMaskAt: (x: number, z: number) => number,
): MinimapWaterSplit<Disc> {
  const liquid: Disc[] = [], soft: Disc[] = [];
  for (const disc of discs) (discHoldsLiquid(disc, waterMaskAt) ? liquid : soft).push(disc);
  return { liquid, soft };
}
