/** Shallow presentation water; the authored drivable bed remains authoritative. */
export interface WaterContactProfile {
  kind: 'coast' | 'lake' | 'river' | 'marsh';
  depthM: number;
  color: number;
  opacity: number;
  roughness: number;
  flowX: number;
  flowZ: number;
  shoreColor: number;
  waveScale: number;
  waveStrength: number;
  /** Water 2026-09-12: bank-side tint the deep colour rises out of (sunlit bed). */
  shallowColor: number;
  /** Water 2026-09-12: shoreline foam and crest strength (0 disables). */
  foam: number;
}

const COAST: Readonly<WaterContactProfile> = Object.freeze({
  // water pass 3 (2026-09-12): lit once (cascade setup) the sea takes a lighter
  // teal and stronger wave relief; the 1049e4e bay's lively texture is the target.
  kind: 'coast', depthM: 0.72, color: 0x1d5266, opacity: 0.72, roughness: 0.24,
  shallowColor: 0x3d8a86, foam: 0.85,
  flowX: 0.012, flowZ: 0.008, shoreColor: 0x607770, waveScale: 0.064, waveStrength: 1.6,
});
// water pass 3 (2026-09-12): every profile's wave relief rose ~45 % — the sheet is lit
// once now (cascade setup) and the old values read as one flat sheet.
const LAKE: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'lake', depthM: 0.58, color: 0x1f4443, opacity: 0.70, roughness: 0.28,
  shallowColor: 0x4f8a72, foam: 0.35,
  flowX: 0.004, flowZ: 0.003, shoreColor: 0x60705c, waveScale: 0.052, waveStrength: 0.8,
});
const RIVER: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'river', depthM: 0.64, color: 0x2a4a40, opacity: 0.72, roughness: 0.34,
  shallowColor: 0x6b8a58, foam: 0.45,
  flowX: 0.016, flowZ: 0.005, shoreColor: 0x6c6950, waveScale: 0.072, waveStrength: 0.9,
});
const MARSH: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'marsh', depthM: 0.43, color: 0x373a25, opacity: 0.74, roughness: 0.46,
  shallowColor: 0x6a6f3e, foam: 0.15,
  flowX: 0.002, flowZ: 0.003, shoreColor: 0x696344, waveScale: 0.043, waveStrength: 0.5,
});
const POLDER: Readonly<WaterContactProfile> = Object.freeze({
  ...MARSH, color: 0x1f3835, opacity: 0.73, roughness: 0.40,
  shoreColor: 0x66715d, waveScale: 0.048, waveStrength: 0.6,
});
const FJORD: Readonly<WaterContactProfile> = Object.freeze({
  ...COAST, color: 0x143548, opacity: 0.76, roughness: 0.22, shallowColor: 0x3f7f86, foam: 0.7,
  shoreColor: 0x5c747c, flowX: 0.009, flowZ: 0.006, waveScale: 0.057, waveStrength: 1.0,
});
const SALTWIND: Readonly<WaterContactProfile> = Object.freeze({
  ...COAST, color: 0x22484f, opacity: 0.74, roughness: 0.34, shallowColor: 0x5a8f88, foam: 1.0,
  shoreColor: 0x737561, waveScale: 0.070, waveStrength: 1.2,
});
const RESERVOIR: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x173a4d, opacity: 0.75, roughness: 0.22, shallowColor: 0x3f8082, foam: 0.3,
  shoreColor: 0x596e6d, waveScale: 0.046, waveStrength: 0.7,
});
const OASIS: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x185a4e, opacity: 0.70, roughness: 0.26, shallowColor: 0x5faf98, foam: 0.25,
  shoreColor: 0x827758, waveScale: 0.058, waveStrength: 0.75,
});
const MONSOON: Readonly<WaterContactProfile> = Object.freeze({
  ...RIVER, color: 0x414132, opacity: 0.75, roughness: 0.43,
  shoreColor: 0x73664d, flowX: 0.013, flowZ: 0.007, waveScale: 0.063, waveStrength: 0.52,
});
const AUTUMN: Readonly<WaterContactProfile> = Object.freeze({
  ...RIVER, color: 0x383520, opacity: 0.73, roughness: 0.42,
  shoreColor: 0x6a593d, flowX: 0.010, flowZ: 0.004, waveScale: 0.052, waveStrength: 0.44,
});

export function waterContactProfile(mapId: string): Readonly<WaterContactProfile> {
  switch (mapId) {
    case 'fjord': return FJORD;
    case 'saltwind': return SALTWIND;
    case 'coastal': return COAST;
    case 'reservoir': return RESERVOIR;
    case 'oasis': return OASIS;
    case 'monsoon': return MONSOON;
    case 'autumn': return AUTUMN;
    case 'mangrove': return MARSH;
    case 'polders': return POLDER;
    case 'delta': return RIVER;
    default: return LAKE;
  }
}

/** Coverage comes from the existing wet mask, including dry roads/pads and ice. */
export function shallowWaterDepth(coverage: number, depthM: number): number {
  const wet = Math.max(0, Math.min(1, coverage));
  return depthM * wet * wet * (3 - 2 * wet);
}
