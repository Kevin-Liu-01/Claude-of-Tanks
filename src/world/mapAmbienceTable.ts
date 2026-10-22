// src/world/mapAmbienceTable.ts — 2026-10-22 (the owner: "add better map ambience like particles or leaves or petals or
// other of this kind of things in the air depending on map"): what floats in the air over each battlefield.
//
// Presentation only and data only: no three, no DOM, no clocks. The runtime (mapAmbience.ts, demand-loaded behind the
// covered battle entry) draws each layer as one instanced draw that wraps in a volume round the camera and animates in
// its vertex shader; nothing here reaches the simulation, the spotting, the traction or the wire.
//
// Each map takes at most two layers (two draws), chosen from the place and season its config authors (the `Reference:`
// header of every src/world/maps/*.ts): Verdant's July fields at Prokhorovka shed thistle down by day and light fireflies
// at night; Amberford's October ford drops red and gold leaves; Suzhou Creek is Shanghai in the autumn of 1937, its plane
// trees letting go over ash blown across from burning Zhabei; the Chouf is August, so its petals are the village
// bougainvillea and oleander, not a spring blossom; Nordhavn is Narvik in May, a fortnight after the snow, so it gets sea
// mist and birch fluff rather than snowfall; Glacier Pass is the Mont-Cenis in April under a clear sky, so its snow is
// spindrift off the snowfields and glinting ice crystals; the Moon has no air to carry anything.

import type { MapId } from './maps/mapIds.ts';

export type AmbienceTime = 'day' | 'sunset' | 'night';
export const AMBIENCE_TIMES: readonly AmbienceTime[] = Object.freeze(['day', 'sunset', 'night']);

/** How a kind moves: `drift` camera-facing specks, `tumble` flat cards turning in 3D, `streak` motion-stretched ribbons. */
export type AmbienceMotion = 'drift' | 'tumble' | 'streak';
/** The procedural sprite the fragment shader cuts (no textures). */
export type AmbienceShape = 'disc' | 'fluff' | 'flake' | 'leaf' | 'petal' | 'sliver' | 'streak';
/** Light response: `none` steady, `flicker` a cooling ember, `pulse` a firefly's flash, `glint` an ice crystal's sparkle. */
export type AmbienceBlink = 'none' | 'flicker' | 'pulse' | 'glint';

export interface AmbienceKindDef {
  readonly motion: AmbienceMotion;
  readonly shape: AmbienceShape;
  /** Instances at the full tier (QualityPreset.ambience 1) for a density of 1. */
  readonly count: number;
  /** Half width of the wrap box round the camera (m): a kind read only up close (a leaf, a petal) packs its count into a
   * small box, so the frame shows a few near cards rather than confetti in the distance. */
  readonly radiusM: number;
  /** Height band above the ground under the camera (m). */
  readonly bandM: readonly [number, number];
  /** The clear zone round the lens (m): gone at the first, full at the second (scaled by the lens's zoom). A streak
   * starts metres out, so blown snow and sand skim the ground ahead rather than raking past the camera. */
  readonly nearM: readonly [number, number];
  /** Card size (m): a speck's diameter (an emissive speck's glow, its hot core a fifth of it), a tumbling card's length,
   * a streak's width. */
  readonly sizeM: readonly [number, number];
  /** Tumbling cards: width over length. */
  readonly aspect: number;
  /** Streaks: the trail behind the head, in seconds of travel. */
  readonly streakS: number;
  /** Fall speed (m/s); negative rises. */
  readonly fallMps: number;
  /** Share of the map's surface wind the kind drifts with. */
  readonly windShare: number;
  /** Along-wind floor (m/s) for blown kinds (spindrift and sand only move once the wind lifts them). */
  readonly minWindMps: number;
  /** Sway (m) and its rate (Hz). */
  readonly wobbleM: number;
  readonly wobbleHz: number;
  /** Tumbling cards: turns per second. */
  readonly spinHz: number;
  /** Erratic flight (m; insects). */
  readonly jitterM: number;
  /** Members per swarm (insects); 0 spreads them evenly. */
  readonly cluster: number;
  readonly alpha: number;
  /** Brightening toward the sun (translucent down, petals, dust catching the light). */
  readonly scatter: number;
  /** Brightness over the shared card gain: a coloured card (a leaf, a petal) sits lower so the tone curve keeps its hue. */
  readonly gain: number;
  /** Self-light in HDR units at night (embers, fireflies); faded by day. */
  readonly emissive: number;
  readonly blink: AmbienceBlink;
  readonly additive: boolean;
}

const kind = (def: Partial<AmbienceKindDef> & Pick<AmbienceKindDef, 'motion' | 'shape' | 'count' | 'bandM' | 'sizeM'>): AmbienceKindDef =>
  Object.freeze({
    radiusM: 32, nearM: [0.6, 2] as const, aspect: 1, streakS: 0, fallMps: 0, windShare: 0.6, minWindMps: 0, wobbleM: 0.3, wobbleHz: 0.2, spinHz: 0,
    jitterM: 0, cluster: 0, alpha: 1, scatter: 0, gain: 1, emissive: 0, blink: 'none' as const, additive: false, ...def,
  });

// the counts and sizes read in a gameplay frame (the owner, 2026-10-22, on the first pass: "for all of these i can
// barely see ambience"): a few near cards always in view, the far ones still a visible speck
export const AMBIENCE_KINDS = Object.freeze({
  /** Thistle, dandelion and feather-grass down, catkin fluff: slow, buoyant, bright against the sun. */
  fluff: kind({ motion: 'drift', shape: 'fluff', count: 1500, radiusM: 24, bandM: [0.3, 10], sizeM: [0.06, 0.11], fallMps: 0.07,
    windShare: 0.85, wobbleM: 0.45, wobbleHz: 0.2, alpha: 0.95, scatter: 2.2 }),
  /** Broadleaf leaves: rocking, turning cards that fall a metre a second. */
  leaf: kind({ motion: 'tumble', shape: 'leaf', count: 900, radiusM: 18, bandM: [0, 12], sizeM: [0.09, 0.14], aspect: 0.66,
    fallMps: 0.85, windShare: 0.6, wobbleM: 0.7, wobbleHz: 0.32, spinHz: 0.55, alpha: 1, scatter: 1.1, gain: 0.55 }),
  /** Petals: small, slow, fluttering. */
  petal: kind({ motion: 'tumble', shape: 'petal', count: 900, radiusM: 16, bandM: [0, 9], sizeM: [0.06, 0.09], aspect: 0.78,
    fallMps: 0.42, windShare: 0.75, wobbleM: 0.5, wobbleHz: 0.42, spinHz: 0.85, alpha: 0.95, scatter: 1.8, gain: 0.7 }),
  /** Conifer needles: thin slivers spinning down fast. */
  needle: kind({ motion: 'tumble', shape: 'sliver', count: 800, radiusM: 18, bandM: [0, 12], sizeM: [0.1, 0.17], aspect: 0.09,
    fallMps: 1.1, windShare: 0.5, wobbleM: 0.25, wobbleHz: 0.5, spinHz: 1.3, alpha: 1, scatter: 0.6, gain: 0.6 }),
  /** Straw chaff and sawdust flecks off the harvest and the mill: golden slivers carried far. */
  chaff: kind({ motion: 'tumble', shape: 'sliver', count: 1100, radiusM: 20, bandM: [0, 9], sizeM: [0.05, 0.09], aspect: 0.2,
    fallMps: 0.33, windShare: 0.95, wobbleM: 0.5, wobbleHz: 0.3, spinHz: 1.1, alpha: 0.95, scatter: 1.6, gain: 0.75 }),
  /** Light snowfall. */
  snow: kind({ motion: 'drift', shape: 'flake', count: 9500, radiusM: 30, bandM: [-1, 22], sizeM: [0.04, 0.07], fallMps: 0.95,
    windShare: 0.55, wobbleM: 0.35, wobbleHz: 0.24, alpha: 1, scatter: 0.8 }),
  /** Diamond dust: ice crystals hanging in clear cold air, glinting as they turn. */
  crystal: kind({ motion: 'drift', shape: 'disc', count: 2600, radiusM: 20, bandM: [0, 10], sizeM: [0.014, 0.024], fallMps: 0.16,
    windShare: 0.5, wobbleM: 0.3, wobbleHz: 0.18, alpha: 0.9, scatter: 4, blink: 'glint', additive: true }),
  /** Spindrift: snow blown low off the snowfields. */
  spindrift: kind({ motion: 'streak', shape: 'streak', count: 2200, radiusM: 28, bandM: [0, 1.3], nearM: [3.5, 8], sizeM: [0.025, 0.045], streakS: 0.15,
    fallMps: 0.12, windShare: 2.2, minWindMps: 5, wobbleM: 0.25, wobbleHz: 0.6, alpha: 0.3, scatter: 0.8 }),
  /** Dust motes: tiny specks that hang in the air and catch the sun. */
  dust: kind({ motion: 'drift', shape: 'disc', count: 3000, radiusM: 18, bandM: [0, 9], sizeM: [0.012, 0.022], fallMps: 0.015,
    windShare: 0.55, wobbleM: 0.35, wobbleHz: 0.14, alpha: 0.9, scatter: 3.2 }),
  /** Blown sand and grit skimming the ground. */
  sand: kind({ motion: 'streak', shape: 'streak', count: 2800, radiusM: 24, bandM: [0, 1.8], nearM: [2.5, 6], sizeM: [0.016, 0.03], streakS: 0.12,
    fallMps: 0, windShare: 2.1, minWindMps: 4.5, wobbleM: 0.18, wobbleHz: 0.9, alpha: 0.4, scatter: 1 }),
  /** Ash and soot flecks, turning slowly as they settle. */
  ash: kind({ motion: 'tumble', shape: 'disc', count: 2000, radiusM: 22, bandM: [0, 14], sizeM: [0.024, 0.045], aspect: 0.8,
    fallMps: 0.28, windShare: 0.7, wobbleM: 0.5, wobbleHz: 0.24, spinHz: 0.45, alpha: 0.85, scatter: 0.3, gain: 0.6 }),
  /** Drifting embers: hot specks rising and cooling. */
  ember: kind({ motion: 'drift', shape: 'disc', count: 700, radiusM: 26, bandM: [0, 14], sizeM: [0.05, 0.085], fallMps: -0.55,
    windShare: 0.8, wobbleM: 0.6, wobbleHz: 0.4, alpha: 1, emissive: 10, blink: 'flicker', additive: true }),
  /** Fireflies: slow wandering flashes low over the grass. */
  firefly: kind({ motion: 'drift', shape: 'disc', count: 900, bandM: [0.6, 3.6], sizeM: [0.06, 0.09], fallMps: 0,
    windShare: 0.05, wobbleM: 1.4, wobbleHz: 0.08, alpha: 1, emissive: 14, blink: 'pulse', additive: true }),
  /** Mist and humid motes: droplets glinting in damp air. */
  mote: kind({ motion: 'drift', shape: 'disc', count: 2400, radiusM: 18, bandM: [0, 8], sizeM: [0.018, 0.035], fallMps: 0.01,
    windShare: 0.35, wobbleM: 0.4, wobbleHz: 0.12, alpha: 0.7, scatter: 3 }),
  /** Midges and gnats: dark specks dancing in swarms. */
  insect: kind({ motion: 'drift', shape: 'disc', count: 600, radiusM: 22, bandM: [0.5, 3], sizeM: [0.008, 0.013], fallMps: 0,
    windShare: 0.1, wobbleM: 0.45, wobbleHz: 0.18, jitterM: 0.3, cluster: 10, alpha: 0.9, scatter: 0.4 }),
  /** Light drizzle: thin falling streaks. */
  drizzle: kind({ motion: 'streak', shape: 'streak', count: 6000, radiusM: 24, bandM: [-1, 16], nearM: [1.5, 4], sizeM: [0.006, 0.01], streakS: 0.05,
    fallMps: 5.5, windShare: 0.5, wobbleM: 0.05, wobbleHz: 0.3, alpha: 0.4, scatter: 0.8 }),
  /** Salt spray: fine bright droplets carried inland on the sea wind. */
  spray: kind({ motion: 'drift', shape: 'disc', count: 2000, radiusM: 20, bandM: [0, 8], sizeM: [0.015, 0.028], fallMps: 0.03,
    windShare: 1, wobbleM: 0.5, wobbleHz: 0.2, alpha: 0.75, scatter: 3 }),
} satisfies Record<string, AmbienceKindDef>);

export type AmbienceKind = keyof typeof AMBIENCE_KINDS;

export interface AmbienceLayer {
  readonly kind: AmbienceKind;
  /** Three sRGB colours each particle picks from. */
  readonly palette: readonly [number, number, number];
  /** Count multiplier over the kind's own (1 when absent). */
  readonly density?: number;
  /** Times of day the layer shows (every time when absent). */
  readonly times?: readonly AmbienceTime[];
}

const L = (kindId: AmbienceKind, palette: readonly [number, number, number], extra: Omit<AmbienceLayer, 'kind' | 'palette'> = {}): AmbienceLayer =>
  Object.freeze({ kind: kindId, palette: Object.freeze([...palette]) as unknown as readonly [number, number, number], ...extra });

const DAYLIGHT: readonly AmbienceTime[] = Object.freeze(['day', 'sunset']);
const NIGHT: readonly AmbienceTime[] = Object.freeze(['night']);

// palettes (sRGB)
const DOWN = [0xf4efe2, 0xe9e1cb, 0xfffaf0] as const;
const FIREFLY = [0xc6ff5c, 0xe4ff7e, 0xa6f264] as const;
const SNOW = [0xffffff, 0xf1f5ff, 0xe6edf8] as const;
const SPRAY = [0xf4f8fa, 0xe4edf1, 0xffffff] as const;
const MIDGE = [0x2a2620, 0x3a342a, 0x1e1c18] as const;
const MIST = [0xeef2f2, 0xe2eae8, 0xf8fafa] as const;

/**
 * Each battlefield's air (at most two layers). Times of day gate the night-only fireflies and the down that only
 * flies in daylight; everything else stays round the clock and takes the hour's light.
 */
export const MAP_AMBIENCE: Readonly<Record<MapId, readonly AmbienceLayer[]>> = Object.freeze({
  // Kursk's black-earth fields in July: thistle and dandelion down by day, fireflies over the grass at night
  verdant: [L('fluff', DOWN, { times: DAYLIGHT }), L('firefly', FIREFLY, { times: NIGHT })],
  // the Dahar wadi: sand skimming the floor, fine dust hanging in the light
  desert: [L('sand', [0xd9b47a, 0xc89c62, 0xe6c79a]), L('dust', [0xe2c290, 0xd4ae7a, 0xf0dcb4])],
  // a Carpathian winter valley under its closed deck: light snowfall
  winter: [L('snow', SNOW)],
  // a Franconian hill town under fire: plaster dust and drifting ash
  urban: [L('dust', [0xcfc6b8, 0xb9ae9e, 0xddd5c8]), L('ash', [0x5a5652, 0x777069, 0x3e3b38], { density: 0.7 })],
  // the Breton strand: salt spray off the bay, a little dune thistle down by day
  coastal: [L('spray', SPRAY), L('fluff', DOWN, { density: 0.45, times: DAYLIGHT })],
  // Amberford in October: red, orange and gold leaves; golden motes over the river meadows
  autumn: [L('leaf', [0xb8401c, 0xe07a26, 0xd8a734]), L('dust', [0xf3e2b8, 0xffefcc, 0xe8d4a8], { density: 0.6 })],
  // the Sary-Arka grain steppe: feather-grass down on the wind, dust off the tracks
  steppe: [L('fluff', [0xf2ead6, 0xe6dcc2, 0xfaf4e6], { density: 1.1 }), L('dust', [0xd8c08e, 0xc8ad78, 0xe4d2a6])],
  // Cinder Junction: coal soot, and cinders from the stage and the engines
  railyard: [L('ash', [0x2e2c2a, 0x45413d, 0x5a554f]), L('ember', [0xff6a1a, 0xff8a2a, 0xff5214], { density: 0.6 })],
  // the Huenfeld basin's farms: harvest chaff, fireflies along the river at night
  frontier: [L('chaff', [0xd8b765, 0xe8cd85, 0xc49e4e]), L('firefly', FIREFLY, { density: 0.7, times: NIGHT })],
  // Narvik in May, a fortnight after the snow: sea mist off the fjord, birch catkin fluff
  fjord: [L('spray', MIST, { density: 0.8 }), L('fluff', [0xeee8d8, 0xe0d8c4, 0xf8f4ea], { density: 0.5, times: DAYLIGHT })],
  // the braided Jamuna: humid motes, midges over the paddies by day
  delta: [L('mote', [0xf0f2e8, 0xe4ead8, 0xfafaf0]), L('insect', MIDGE, { times: DAYLIGHT })],
  // Wadi Rum: red sand on the wind, red dust in the light
  badlands: [L('sand', [0xc8693a, 0xb85a30, 0xd88050]), L('dust', [0xd88a5c, 0xc87448, 0xe6a07a])],
  // Kohima's monsoon ridge: a light drizzle in humid air
  monsoon: [L('drizzle', [0xc8d2dc, 0xb8c4d0, 0xdce4ec]), L('mote', [0xe8ecea, 0xdde4e2, 0xf4f6f4], { density: 0.6 })],
  // the Mont-Cenis in April under a clear sky: spindrift off the snowfields, diamond dust glinting
  alpine: [L('spindrift', SNOW), L('crystal', SNOW)],
  // the Aso caldera: fine volcanic ash, a few embers off the vents
  caldera: [L('ash', [0x8a8580, 0x6e6a66, 0xa29d97]), L('ember', [0xff7a22, 0xff9a3a, 0xff5a14], { density: 0.4 })],
  // the Völklingen furnaces: sparks drifting off the works, soot settling
  foundry: [L('ember', [0xff6a1a, 0xff8a2a, 0xffaa48]), L('ash', [0x3a3632, 0x504a44, 0x2a2826], { density: 0.8 })],
  // besieged Sarajevo: concrete dust, burnt paper and ash
  ruinspires: [L('dust', [0xc9c2b6, 0xb3aa9c, 0xd8d2c6]), L('ash', [0x4a4642, 0x6a645e, 0x34312e], { density: 0.8 })],
  // Shanghai, autumn 1937: the Settlement's plane-tree leaves, ash blown over from burning Zhabei
  blackglass: [L('leaf', [0xb88a3a, 0x9a6a2a, 0xc8a050], { density: 0.8 }), L('ash', [0x4c4844, 0x6a6560, 0x38342f], { density: 0.7 })],
  // Monument Valley: red dust and blown sand
  titan_gorge: [L('dust', [0xd48660, 0xc47050, 0xe09a74]), L('sand', [0xc0603a, 0xd07a4a, 0xb05432], { density: 0.8 })],
  // Glen Canyon's drowned gorge: mist over the water, sandstone dust
  skybridge: [L('mote', MIST), L('dust', [0xd8a878, 0xc89464, 0xe4bc90], { density: 0.7 })],
  // the Scheldt polders in autumn 1944: poplar leaves off the windbreaks, salt haze off the estuary
  polders: [L('leaf', [0xd4b23a, 0xc09a2e, 0xa88a3a], { density: 0.75 }), L('spray', SPRAY, { density: 0.8 })],
  // Queenstown's stripped hills: ochre and pink dust blown off the haul roads
  copper_mesa: [L('sand', [0xc88a6a, 0xb87a5c, 0xd8a080], { density: 0.8 }), L('dust', [0xd49a7c, 0xc4886c, 0xe0b098])],
  // Hostomel's plateau in the pine forest: poplar fluff and runway grit
  airfield: [L('fluff', DOWN, { density: 0.7, times: DAYLIGHT }), L('dust', [0xc8c0aa, 0xb8af98, 0xd6cfbc])],
  // Siwa: pale sand skimming the dune arms, gnats over the palm gardens
  oasis: [L('sand', [0xe2c890, 0xd4b67c, 0xeedaa8]), L('insect', MIDGE, { density: 0.7, times: DAYLIGHT })],
  // DYE-M on the Baffin ice cap under its low deck: blowing spindrift and fine snow
  whiteout: [L('spindrift', SNOW, { density: 1.3 }), L('snow', SNOW, { density: 0.6 })],
  // the Chouf in August: bougainvillea, oleander and jasmine petals off the village, golden haze motes
  orchard: [L('petal', [0xd4307a, 0xf08ab0, 0xfaf2f0]), L('dust', [0xf0dcb0, 0xe4cc9a, 0xfaecc8], { density: 0.6 })],
  // Longleaf's sawmill town in September: longleaf needles and sawdust
  longleaf: [L('needle', [0x9a6a34, 0xb07c3c, 0x7e5a2e]), L('chaff', [0xe0c89c, 0xd4b888, 0xead8b4], { density: 0.5 })],
  // Ca Mau's mangrove coast: midges by day, the mangroves' fireflies at night
  mangrove: [L('insect', MIDGE, { times: DAYLIGHT }), L('firefly', FIREFLY, { density: 1.2, times: NIGHT })],
  // the Dalmatian narrows: salt spray, limestone dust off the terraces
  saltwind: [L('spray', SPRAY), L('dust', [0xe8e0cc, 0xd8cfb8, 0xf2ecdc], { density: 0.6 })],
  // the Roer dams in winter: cold mist motes, spruce needles off the ridges
  reservoir: [L('mote', [0xe6ecee, 0xdce4e8, 0xf2f6f8]), L('needle', [0x6a5434, 0x584428, 0x7c6440], { density: 0.6 })],
  // Olympus Basin: red Martian dust and blown grit
  mars: [L('dust', [0xc0643a, 0xb05a34, 0xd07a4c]), L('sand', [0xa84e2c, 0xb85c36, 0x98462a], { density: 0.7 })],
  // Taurus-Littrow: vacuum carries nothing
  moon: [],
  // Ronda's tableland in summer: harvest chaff, dust in the gorge's light
  cliffbridge: [L('chaff', [0xdcbc70, 0xe8d090, 0xc8a85a]), L('dust', [0xe6d2a8, 0xd8c294, 0xf0e0be], { density: 0.7 })],
});

/** The layers a map shows at a time of day (empty for an unknown map or one that carries none). */
export function ambienceLayersFor(mapId: string, time: AmbienceTime): readonly AmbienceLayer[] {
  const rows = (MAP_AMBIENCE as Record<string, readonly AmbienceLayer[] | undefined>)[mapId];
  if (!rows) return [];
  return rows.filter((layer) => !layer.times || layer.times.includes(time));
}

/** Instances a layer draws at a tier's density scale (QualityPreset.ambience): 0 turns it off. */
export function ambienceCount(layer: AmbienceLayer, tierScale: number): number {
  const scale = Number.isFinite(tierScale) ? Math.max(0, Math.min(1.5, tierScale)) : 0;
  return Math.round(AMBIENCE_KINDS[layer.kind].count * (layer.density ?? 1) * scale);
}

/** A battle's or the Studio's time of day as the ambience reads it (dusk's blue hour already brings the fireflies out). */
export function ambienceTimeOf(time: string): AmbienceTime {
  if (time === 'night' || time === 'dusk') return 'night';
  if (time === 'dawn' || time === 'golden' || time === 'sunset') return 'sunset';
  return 'day';
}

/** The ambience's own hash domain (the battle seed in, never the combat RNG; battleWeatherPolicy keeps its own). */
export function ambienceHash(seed: number, salt: number): number {
  let value = ((seed >>> 0) ^ (salt >>> 0)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}
