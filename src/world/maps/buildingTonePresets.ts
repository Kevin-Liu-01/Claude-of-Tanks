export type BuildingTone = (
  hue: number,
  saturation: number,
  lightness: number,
) => readonly [number, number, number];

export interface RealisticCityToneOptions {
  value?: number;
  saturation?: number;
  soot?: number;
  roofValue?: number;
  coolAccent?: number;
}

export interface RealisticCityBuildingTones {
  [bucket: string]: BuildingTone | null;
  plaster: BuildingTone;
  plaster2: BuildingTone;
  plaster3: BuildingTone;
  stone: BuildingTone;
  roof: BuildingTone;
  wood: null;
  straw: null;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Shared city material family based on Steinburg's restrained real-world mix:
 * lime render, ochre render, weathered green-grey, warm masonry, and clay or
 * oxidized sheet roofs. Maps can grade the value and soot while retaining
 * actual material color instead of collapsing every elevation to blue-grey.
 */
export function makeRealisticCityBuildingTones({
  value = 1,
  saturation = 1,
  soot = 0,
  roofValue = value,
  coolAccent = 0,
}: RealisticCityToneOptions = {}): RealisticCityBuildingTones {
  const light = (source: number, scale: number, lift = 0): number => (
    clamp01(source * scale * value + lift - soot)
  );
  const sat = (source: number, scale: number, floor: number): number => (
    clamp01((source * scale + floor) * saturation)
  );
  return {
    plaster: (_h, s, l) => [0.10, sat(s, 0.42, 0.10), light(l, 0.90, 0.015)],
    plaster2: (_h, s, l) => [0.068, sat(s, 0.40, 0.16), light(l, 0.84, 0.01)],
    plaster3: (_h, s, l) => [0.20 + coolAccent, sat(s, 0.28, 0.075), light(l, 0.80)],
    stone: (_h, s, l) => [0.065, sat(s, 0.52, 0.07), light(l, 0.86)],
    roof: (_h, s, l) => [0.032 + coolAccent * 0.15,
      clamp01((s * 0.35 + 0.13) * saturation),
      clamp01(l * 0.68 * roofValue - soot * 0.45)],
    wood: null,
    straw: null,
  };
}
