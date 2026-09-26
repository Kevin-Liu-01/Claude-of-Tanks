/**
 * cloudscapes.ts — the per-map cloudscape authoring vocabulary of the volumetric layer (round 71, 2026-09-25).
 *
 * A map authors a `clouds` block on its config (beside `ocean`): a regime — a named sky the meteorology has a
 * word for — and any of the knobs below. Everything unset comes from the regime's row here, and what the
 * regime leaves open (the base of an authored deck, the tint, the wind across the sun) from the map's sky
 * block through cloudPresets.ts, so a block can be as short as `{ regime: 'cloud-streets' }`. The resolved
 * numbers are the layer's uniforms (`CloudLayerPreset`); `sky.cloudLayer` still overrides any of them raw.
 */

export type CloudscapeRegime =
  /** Scattered cumulus humilis / mediocris in a spread of sizes, a few loose streets, a far deck on the horizon. */
  | 'fair-weather-cumulus'
  /** Rows of cumulus along the wind (the big-sky boundary-layer rolls), a far stratocumulus band. */
  | 'cloud-streets'
  /** Streets rolling in off the sea under a low base, a heavy far stratocumulus band. */
  | 'sea-streets'
  /** Humid cumulus congestus: tall towers, sheared, a little anvil on the deepest. */
  | 'towering-cumulus'
  /** A cumulonimbus front beyond a clear radius: sheared towers spreading anvils, scud under the bases, anvil cirrus. */
  | 'cumulonimbus-front'
  /** A darker, lower storm front (more coverage, a lower base, heavy scud). */
  | 'storm-front'
  /** Dry flat cumulus humilis high over the desert, cirrus veils above. */
  | 'cumulus-humilis'
  /** Smooth stationary lens caps high over the ranges, a far deck under them. */
  | 'lenticular'
  /** A lumpy stratocumulus deck with breaks of blue. */
  | 'broken-stratocumulus'
  /** A closed lumpy stratocumulus deck (a winter sky), diffuse light. */
  | 'stratocumulus-deck'
  /** An overcast stratus sheet with a few thin breaks. */
  | 'overcast-stratus'
  /** Low stratus with breaks (a white-out ceiling). */
  | 'low-stratus'
  /** Ice fog under a stratus ceiling (a polar sky). */
  | 'ice-fog-stratus'
  /** A thin milky altostratus with breaks under a warm haze (industrial and urban skies). */
  | 'hazy-altostratus'
  /** Round 76: a low closed industrial stratocumulus — cellular, a dirty warm-grey base, the sun a smear through the thin cells. */
  | 'industrial-stratocumulus'
  /** Round 76: a mid-level layer of small lumps with shaded bases and lit borders (altocumulus stratiformis perlucidus). */
  | 'altocumulus'
  /** A dense hazy overcast. */
  | 'dense-overcast'
  /** An ash veil high with cumulus under it. */
  | 'ash-veil'
  /** Cirrus only. */
  | 'high-cirrus'
  /** Thin high ice clouds (Mars' water-ice hazes) under a dust veil. */
  | 'thin-ice-clouds';

/** A map's authored cloudscape (the `clouds` block of its config); every field is optional. */
export interface CloudscapeConfig {
  regime?: CloudscapeRegime;
  /** Fraction 0..1 of the equalised weather field admitted as cloud. */
  coverage?: number;
  /** Cloud base altitude (m). */
  baseM?: number;
  /** Slab thickness (m). */
  thicknessM?: number;
  /** 0..1: how far columns rise as towers above the type profile. */
  towers?: number;
  /** 0..1: anvils on the deepest columns (cumulonimbus). */
  anvil?: number;
  /** 0..1: billowy (0) → wispy (1) erosion of the edges. */
  wispiness?: number;
  /** Direction the wind blows TOWARD, degrees from +X toward +Z in world XZ (as `ocean.windDirDeg`). */
  windDirDeg?: number;
  /** Drift speed (m/s). */
  windSpeed?: number;
  /** 0..1: the horizontal lean of a column across the slab's height, in slab thicknesses. */
  shear?: number;
  /** 0..1: share of the street-aligned weather field (rows of cloud along the wind). */
  streets?: number;
  /** 0..1: cirrus coverage of the high layer. */
  cirrus?: number;
  /** Streak direction of the cirrus (degrees, as windDirDeg); default the wind plus a quarter turn's third. */
  cirrusAngleDeg?: number;
  /** Cirrus altitude (m). */
  cirrusAltM?: number;
  /** Albedo tint (sRGB hex); default the sky block's cloudTintHex perceptually halved. */
  tintHex?: number;
  /** Multiplier on the sun's contribution (1 = physical). */
  sunGain?: number;
  /** Multiplier on the sky / ground ambient (1 = the summary's irradiance). */
  ambientScale?: number;
  /** A front keeps the sky over the camera open: no tower within this horizontal radius (m). */
  clearRadiusM?: number;
  /** 0..1: the far horizon band of stratocumulus. */
  farBand?: number;
  /** 0..1: ragged low fragments under the base. */
  scud?: number;
  /** Extinction coefficient (1/m) of the densest cloud. */
  density?: number;
  /** The cloud type range the weather's vigour maps between: 0 stratus, 0.5 cumulus, 1 cumulonimbus. */
  type?: readonly [number, number];
  /** 0..1: stratiform (sheet, diffuse-lit) against cumuliform (domed, sun-modelled). */
  stratiform?: number;
  /** 0..1: the weather field the coverage cuts — the cell-carried cumuliform one (0) or the broad one (1: big masses, few small cells). */
  fieldMix?: number;
  /** Whether the layer casts real cloud shadows through the CSM. */
  shadow?: boolean;
  /**
   * Round 76 (the deck pass): 0..1 cellular structure of a deck — each column's thickness follows the inverted-Worley
   * cells at the deck scale (thick cores hanging a little lower, thin borders that open where the coverage is
   * marginal); 0 = round 71's uniform sheet.
   */
  cells?: number;
  /** Round 76: the deck cells' diameter (m). */
  cellM?: number;
  /**
   * Round 76: 0..1 share of the deck lighting — the underside lit by what the column above it transmits (the
   * diffusion law on the column's optical depth: thick cores dark, thin borders bright, the sun a glow through the
   * thin parts) in place of the sky-mean floor; 0 = round 71's floor-lit sheet.
   */
  deckLight?: number;
  /** Round 76: 0..1 wave bands across a deck's thickness from the wind-frame rolls (undulatus). */
  undulatus?: number;
  /**
   * Round 76: 0..1 an interior density octave inside the cumuliform masses (the coarse detail lumps survive the
   * density remap) and a detailed first light tap, so the lit face reads as cauliflower and not only the outline.
   */
  interior?: number;
}

/** A regime's row: every knob the map need not author. */
interface CloudscapeRegimeRow {
  coverage: number;
  /** Base altitude (m); null = the sky block's authored deck altitude or the fair-weather default. */
  baseM: number | null;
  thicknessM: number;
  towers: number;
  anvil: number;
  wispiness: number;
  windSpeed: number;
  shear: number;
  streets: number;
  cirrus: number;
  cirrusAltM: number;
  stratiform: number;
  /** 0..1: the weather field the coverage cuts — the cell-carried cumuliform one (0) or the broad stratiform one (1). */
  fieldMix: number;
  density: number;
  farBand: number;
  scud: number;
  type: readonly [number, number];
  sunGain: number;
  ambientScale: number;
  clearRadiusM: number;
  shadow: boolean;
  /** Round 76: the deck knobs (cloudscapes.ts CloudscapeConfig). */
  cells: number;
  cellM: number;
  deckLight: number;
  undulatus: number;
  interior: number;
}

const row = (r: CloudscapeRegimeRow): CloudscapeRegimeRow => Object.freeze(r);

/** The regime table: the meteorology of each named sky as the layer's numbers. */
export const CLOUDSCAPE_REGIMES: Readonly<Record<CloudscapeRegime, CloudscapeRegimeRow>> = Object.freeze({
  'fair-weather-cumulus': row({ coverage: 0.34, baseM: null, thicknessM: 820, towers: 0.15, anvil: 0, wispiness: 0.35, windSpeed: 6, shear: 0.15, streets: 0.35, cirrus: 0.12, cirrusAltM: 9500, stratiform: 0.08, fieldMix: 0, density: 0.10, farBand: 0.25, scud: 0, type: [0.3, 0.62], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'cloud-streets': row({ coverage: 0.40, baseM: null, thicknessM: 660, towers: 0.1, anvil: 0, wispiness: 0.3, windSpeed: 9, shear: 0.2, streets: 0.85, cirrus: 0.15, cirrusAltM: 10000, stratiform: 0.05, fieldMix: 0, density: 0.10, farBand: 0.35, scud: 0, type: [0.3, 0.6], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'sea-streets': row({ coverage: 0.32, baseM: 1100, thicknessM: 600, towers: 0.1, anvil: 0, wispiness: 0.35, windSpeed: 8, shear: 0.15, streets: 0.75, cirrus: 0.08, cirrusAltM: 9500, stratiform: 0.08, fieldMix: 0, density: 0.10, farBand: 0.6, scud: 0, type: [0.3, 0.55], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'towering-cumulus': row({ coverage: 0.38, baseM: 1200, thicknessM: 1500, towers: 0.6, anvil: 0.15, wispiness: 0.3, windSpeed: 5, shear: 0.3, streets: 0.15, cirrus: 0.1, cirrusAltM: 11000, stratiform: 0.05, fieldMix: 0.45, density: 0.10, farBand: 0.3, scud: 0, type: [0.45, 0.9], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'cumulonimbus-front': row({ coverage: 0.4, baseM: 1000, thicknessM: 3000, towers: 1, anvil: 1, wispiness: 0.3, windSpeed: 11, shear: 0.4, streets: 0.1, cirrus: 0.25, cirrusAltM: 11500, stratiform: 0.1, fieldMix: 0.9, density: 0.11, farBand: 0.4, scud: 0.5, type: [0.65, 1.0], sunGain: 1, ambientScale: 1, clearRadiusM: 2500, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'storm-front': row({ coverage: 0.55, baseM: 700, thicknessM: 2800, towers: 1, anvil: 1, wispiness: 0.4, windSpeed: 12, shear: 0.4, streets: 0.1, cirrus: 0.3, cirrusAltM: 11500, stratiform: 0.15, fieldMix: 0.9, density: 0.12, farBand: 0.5, scud: 0.8, type: [0.6, 1.0], sunGain: 0.8, ambientScale: 0.85, clearRadiusM: 1800, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'cumulus-humilis': row({ coverage: 0.16, baseM: 1700, thicknessM: 380, towers: 0, anvil: 0, wispiness: 0.3, windSpeed: 5, shear: 0.1, streets: 0.3, cirrus: 0.45, cirrusAltM: 10500, stratiform: 0.05, fieldMix: 0, density: 0.10, farBand: 0.15, scud: 0, type: [0.3, 0.5], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'lenticular': row({ coverage: 0.16, baseM: 2400, thicknessM: 450, towers: 0, anvil: 0, wispiness: 0, windSpeed: 0, shear: 0, streets: 0, cirrus: 0.3, cirrusAltM: 10000, stratiform: 0.6, fieldMix: 1, density: 0.09, farBand: 0.45, scud: 0, type: [0.05, 0.3], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'broken-stratocumulus': row({ coverage: 0.62, baseM: 900, thicknessM: 500, towers: 0, anvil: 0, wispiness: 0.2, windSpeed: 7, shear: 0.1, streets: 0.3, cirrus: 0.1, cirrusAltM: 9000, stratiform: 0.5, fieldMix: 0.35, density: 0.12, farBand: 0.5, scud: 0, type: [0.15, 0.45], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: true, cells: 0.7, cellM: 1000, deckLight: 1, undulatus: 0.2, interior: 0.5 }),
  'stratocumulus-deck': row({ coverage: 0.86, baseM: 700, thicknessM: 420, towers: 0, anvil: 0, wispiness: 0.15, windSpeed: 6, shear: 0.05, streets: 0.2, cirrus: 0, cirrusAltM: 9000, stratiform: 0.55, fieldMix: 0.45, density: 0.11, farBand: 0.6, scud: 0, type: [0.1, 0.4], sunGain: 1, ambientScale: 2.0, clearRadiusM: 0, shadow: false, cells: 0.85, cellM: 1100, deckLight: 1, undulatus: 0.25, interior: 0 }),
  'overcast-stratus': row({ coverage: 0.94, baseM: null, thicknessM: 330, towers: 0, anvil: 0, wispiness: 0.1, windSpeed: 4, shear: 0, streets: 0, cirrus: 0, cirrusAltM: 9000, stratiform: 0.85, fieldMix: 1, density: 0.06, farBand: 0.5, scud: 0, type: [0, 0.2], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0.35, cellM: 1600, deckLight: 1, undulatus: 0.3, interior: 0 }),
  'low-stratus': row({ coverage: 0.9, baseM: null, thicknessM: 300, towers: 0, anvil: 0, wispiness: 0.15, windSpeed: 4, shear: 0, streets: 0, cirrus: 0, cirrusAltM: 9000, stratiform: 0.8, fieldMix: 1, density: 0.04, farBand: 0.5, scud: 0.2, type: [0, 0.25], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'ice-fog-stratus': row({ coverage: 0.92, baseM: 250, thicknessM: 280, towers: 0, anvil: 0, wispiness: 0.2, windSpeed: 3, shear: 0, streets: 0, cirrus: 0, cirrusAltM: 9000, stratiform: 0.9, fieldMix: 1, density: 0.05, farBand: 0.7, scud: 0.4, type: [0, 0.15], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0.25, cellM: 1400, deckLight: 1, undulatus: 0.2, interior: 0 }),
  'hazy-altostratus': row({ coverage: 0.7, baseM: 2600, thicknessM: 500, towers: 0, anvil: 0, wispiness: 0.5, windSpeed: 6, shear: 0.1, streets: 0.1, cirrus: 0.3, cirrusAltM: 9500, stratiform: 0.7, fieldMix: 0.7, density: 0.05, farBand: 0.35, scud: 0, type: [0.05, 0.3], sunGain: 1, ambientScale: 1.05, clearRadiusM: 0, shadow: false, cells: 0.45, cellM: 1500, deckLight: 1, undulatus: 0.3, interior: 0 }),
  // round 76: a low closed industrial stratocumulus (Foundry, Railyard): a cellular deck under a smoggy horizon, the
  // dirty warm-grey base carried by the deck and not by a whole-frame haze; the thin cells let the sun through as a smear
  'industrial-stratocumulus': row({ coverage: 0.88, baseM: 850, thicknessM: 520, towers: 0, anvil: 0, wispiness: 0.2, windSpeed: 5, shear: 0.05, streets: 0.15, cirrus: 0, cirrusAltM: 9000, stratiform: 0.6, fieldMix: 0.55, density: 0.11, farBand: 0.55, scud: 0, type: [0.08, 0.38], sunGain: 1, ambientScale: 1.05, clearRadiusM: 0, shadow: false, cells: 0.9, cellM: 1200, deckLight: 1, undulatus: 0.3, interior: 0 }),
  // round 76: a mid-level layer of small lumps (altocumulus stratiformis perlucidus) — a broad field cut into elements
  // of a few hundred metres with shaded bases and lit borders, blue between them (Urban)
  'altocumulus': row({ coverage: 0.5, baseM: 2800, thicknessM: 380, towers: 0, anvil: 0, wispiness: 0.35, windSpeed: 7, shear: 0.1, streets: 0.1, cirrus: 0.3, cirrusAltM: 9500, stratiform: 0.4, fieldMix: 0.75, density: 0.1, farBand: 0.35, scud: 0, type: [0.15, 0.45], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0.8, cellM: 340, deckLight: 1, undulatus: 0.3, interior: 0.4 }),
  'dense-overcast': row({ coverage: 0.96, baseM: 450, thicknessM: 500, towers: 0, anvil: 0, wispiness: 0.15, windSpeed: 5, shear: 0, streets: 0, cirrus: 0, cirrusAltM: 9000, stratiform: 0.8, fieldMix: 1, density: 0.09, farBand: 0.6, scud: 0.1, type: [0, 0.25], sunGain: 0.9, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0.6, cellM: 1300, deckLight: 1, undulatus: 0.3, interior: 0 }),
  'ash-veil': row({ coverage: 0.55, baseM: 800, thicknessM: 450, towers: 0, anvil: 0, wispiness: 0.6, windSpeed: 5, shear: 0.15, streets: 0.2, cirrus: 0.5, cirrusAltM: 8500, stratiform: 0.5, fieldMix: 0.5, density: 0.07, farBand: 0.4, scud: 0, type: [0.1, 0.5], sunGain: 0.85, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0.5, cellM: 1200, deckLight: 1, undulatus: 0.2, interior: 0.3 }),
  'high-cirrus': row({ coverage: 0, baseM: 1500, thicknessM: 300, towers: 0, anvil: 0, wispiness: 0.5, windSpeed: 6, shear: 0, streets: 0, cirrus: 0.6, cirrusAltM: 10500, stratiform: 0.1, fieldMix: 0, density: 0.08, farBand: 0, scud: 0, type: [0.3, 0.5], sunGain: 1, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
  'thin-ice-clouds': row({ coverage: 0.06, baseM: 2500, thicknessM: 400, towers: 0, anvil: 0, wispiness: 0.9, windSpeed: 4, shear: 0.2, streets: 0.2, cirrus: 0.45, cirrusAltM: 12000, stratiform: 0.3, fieldMix: 0, density: 0.04, farBand: 0, scud: 0, type: [0.1, 0.3], sunGain: 0.9, ambientScale: 1, clearRadiusM: 0, shadow: false, cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0 }),
});

export const CLOUDSCAPE_REGIME_NAMES = Object.freeze(Object.keys(CLOUDSCAPE_REGIMES) as CloudscapeRegime[]);

export function isCloudscapeRegime(value: string): value is CloudscapeRegime {
  return Object.prototype.hasOwnProperty.call(CLOUDSCAPE_REGIMES, value);
}
