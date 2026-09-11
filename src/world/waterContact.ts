/** Shallow presentation water; the authored drivable bed remains authoritative. */
export interface WaterContactProfile {
  kind: 'coast' | 'lake' | 'river' | 'marsh';
  depthM: number;
  color: number;
  opacity: number;
  roughness: number;
  flowX: number;
  flowZ: number;
}

const COAST: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'coast', depthM: 0.72, color: 0x507f86, opacity: 0.42, roughness: 0.30,
  flowX: 0.012, flowZ: 0.008,
});
const LAKE: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'lake', depthM: 0.58, color: 0x608780, opacity: 0.34, roughness: 0.23,
  flowX: 0.004, flowZ: 0.003,
});
const RIVER: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'river', depthM: 0.64, color: 0x777e62, opacity: 0.48, roughness: 0.34,
  flowX: 0.016, flowZ: 0.005,
});
const MARSH: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'marsh', depthM: 0.43, color: 0x77714f, opacity: 0.58, roughness: 0.40,
  flowX: 0.002, flowZ: 0.003,
});
// Polder drainage lakes retain shallow muddy-bed physics, but their surface
// needs a cooler reflection tint to remain distinct from the warm farm soil.
const POLDER: Readonly<WaterContactProfile> = Object.freeze({
  ...MARSH, color: 0x3d625b, opacity: 0.62, roughness: 0.30,
});

export function waterContactProfile(mapId: string): Readonly<WaterContactProfile> {
  switch (mapId) {
    case 'coastal': case 'saltwind': case 'fjord': return COAST;
    case 'mangrove': return MARSH;
    case 'polders': return POLDER;
    case 'delta': case 'monsoon': case 'autumn': return RIVER;
    default: return LAKE;
  }
}

/** Coverage comes from the existing wet mask, including dry roads/pads and ice. */
export function shallowWaterDepth(coverage: number, depthM: number): number {
  const wet = Math.max(0, Math.min(1, coverage));
  return depthM * wet * wet * (3 - 2 * wet);
}
