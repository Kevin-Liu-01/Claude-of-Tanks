/**
 * surfaceLooks.ts — what a blow threw up, by the surface it struck (destruction-fx lane, 2026-10-07).
 *
 * An explosion takes its colour and its body from the ground or the material it hit: dark turned earth and a tan
 * dust pall on soil, a pale fine cloud on sand, white powder over dark soil on snow, black clumps and little dust on
 * mud, grey chips and sparks on rock and road metal, a white column on water, splinters on wood, sparks on metal,
 * grey-white powder on concrete and masonry. Terrain hits are classified from the live height field the battle already
 * queries (no new world API): the water mask, the presentation track surface (sand / snow), the drive ground type
 * (soft = mud, hard = road metal and decks) and the slope. Roads report plain earth inside 14 m on most maps, so a road
 * hit looks at its neighbourhood: a road through snow or sand throws snow or sand.
 *
 * Colours are linear RGB (the renderer's working space). Airborne mineral dust scatters most of the light it meets
 * (single-scattering albedo about 0.9), so a dust cloud in the sun reads light tan against the sky; the clumps and the
 * early, dense ejecta are dark. Pure data plus one classifier: no three, no DOM.
 */

export type SurfaceKind = 'soil' | 'sand' | 'snow' | 'mud' | 'rock' | 'concrete' | 'water' | 'wood' | 'metal';

export const SURFACE_KINDS: readonly SurfaceKind[] = Object.freeze([
  'soil', 'sand', 'snow', 'mud', 'rock', 'concrete', 'water', 'wood', 'metal',
] as const);

type Rgb = readonly [number, number, number];

/** sRGB hex -> linear rgb (the same transfer three.js Color.setHex applies under ColorManagement). */
export function linearHex(hex: number): Rgb {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return Object.freeze([f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)] as const);
}

interface SurfaceLook {
  /** the dense early ejecta (dark, wet, clumped) and the drying dust it becomes */
  readonly ejecta: Rgb;
  /** the fine airborne dust of the pall and the surge */
  readonly dust: Rgb;
  /** thrown chunks (clods, chips, splinters) */
  readonly chunk: Rgb;
  /** how much dust the blast lifts (pall and surge mass), how many chunks, how high the fountain throws */
  readonly dustK: number;
  readonly chunkK: number;
  readonly heightK: number;
  /** chunks are heavy/wet (mud) or light (sand grains never make chunks) */
  readonly chunkScale: number;
  /** sparks on a strike (rock, metal, concrete with aggregate) */
  readonly sparks: number;
  /** a muzzle blast lifts this much dust off this ground (0..1.5) */
  readonly blastDust: number;
  /** how long its dust hangs in the air (1 soil; powder snow and spray fall out fast, fine sand hangs) */
  readonly hang: number;
}

export const SURFACE_LOOKS: Readonly<Record<SurfaceKind, SurfaceLook>> = Object.freeze({
  // dust 0xa8977e -> 0x968a78 (wave 273: sand-beige dust over green loam)
  soil: Object.freeze({ ejecta: linearHex(0x3a2d21), dust: linearHex(0x857a69), chunk: linearHex(0x6a5641),
    dustK: 1, chunkK: 1, heightK: 1, chunkScale: 1, sparks: 0, blastDust: 1, hang: 1 }),
  sand: Object.freeze({ ejecta: linearHex(0x9a825e), dust: linearHex(0xd6c4a0), chunk: linearHex(0xa08a66),
    dustK: 1.45, chunkK: 0.25, heightK: 0.95, chunkScale: 0.6, sparks: 0, blastDust: 1.5, hang: 1.15 }),
  snow: Object.freeze({ ejecta: linearHex(0xcfd8de), dust: linearHex(0xe4e9ee), chunk: linearHex(0xe2e8ee),
    dustK: 0.85, chunkK: 0.7, heightK: 1.05, chunkScale: 0.9, sparks: 0, blastDust: 1.3, hang: 0.5 }),
  mud: Object.freeze({ ejecta: linearHex(0x231c15), dust: linearHex(0x7a6d5d), chunk: linearHex(0x3e3125),
    dustK: 0.45, chunkK: 1.35, heightK: 0.85, chunkScale: 1.2, sparks: 0, blastDust: 0.35, hang: 0.6 }),
  rock: Object.freeze({ ejecta: linearHex(0x5a554e), dust: linearHex(0xb5afa5), chunk: linearHex(0x6e6a63),
    dustK: 0.8, chunkK: 1.1, heightK: 0.8, chunkScale: 0.8, sparks: 1, blastDust: 0.7, hang: 0.8 }),
  concrete: Object.freeze({ ejecta: linearHex(0x7c7a76), dust: linearHex(0xc9c6bf), chunk: linearHex(0x8f8c86),
    dustK: 0.9, chunkK: 1.0, heightK: 0.75, chunkScale: 0.8, sparks: 0.6, blastDust: 0.6, hang: 0.9 }),
  water: Object.freeze({ ejecta: linearHex(0xc5d3d7), dust: linearHex(0xeef3f4), chunk: linearHex(0xc8d6da),
    dustK: 1, chunkK: 0, heightK: 1.3, chunkScale: 0, sparks: 0, blastDust: 0.25, hang: 0.45 }),
  wood: Object.freeze({ ejecta: linearHex(0x5b4632), dust: linearHex(0xa89478), chunk: linearHex(0x7a5a3c),
    dustK: 0.5, chunkK: 1.2, heightK: 0.7, chunkScale: 0.9, sparks: 0, blastDust: 0.4, hang: 0.8 }),
  metal: Object.freeze({ ejecta: linearHex(0x3e3b37), dust: linearHex(0x8f8a82), chunk: linearHex(0x4a4743),
    dustK: 0.35, chunkK: 0.8, heightK: 0.6, chunkScale: 0.6, sparks: 1.6, blastDust: 0.3, hang: 0.8 }),
});

/** Soil an explosive burst throws through snow powder. */
export const UNDER_SNOW_SOIL: Rgb = linearHex(0x2e241a);
/** Explosive residue smoke: grey-brown (TNT and RDX smoke is lighter than burning-fuel soot). */
export const BLAST_RESIDUE: Rgb = linearHex(0x56504a);
/** Burning fuel and hull soot. */
export const SOOT: Rgb = linearHex(0x33312e);
/** Smoke that has cooled and thinned (a column's crown, a fire burning out): grey. */
export const SMOKE_AGED: Rgb = linearHex(0x86837e);
/** Propellant smoke (the gun's charge): pale warm grey. */
export const PROPELLANT: Rgb = linearHex(0x9d988e);

/** The height-field queries the classifier reads (world/terrain + water, all optional). */
interface SurfaceField {
  getWaterMaskAt?(x: number, z: number): number;
  getTrackSurfaceAt?(x: number, z: number): unknown;
  getGroundType?(x: number, z: number): string;
  getNormalAt?(x: number, z: number): { y: number };
  getHeightAt?(x: number, z: number): number;
}

const NEIGHBOUR_M = 22;

function trackSurface(field: SurfaceField, x: number, z: number): number {
  const s = field.getTrackSurfaceAt?.(x, z);
  return typeof s === 'number' ? s : 0;
}

/** Sand (2) or snow (3) around a road point, else 0. */
function neighbourhood(field: SurfaceField, x: number, z: number): number {
  let sand = 0, snow = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const s = trackSurface(field, x + Math.cos(a) * NEIGHBOUR_M, z + Math.sin(a) * NEIGHBOUR_M);
    if (s === 2) sand++;
    else if (s === 3) snow++;
  }
  if (snow >= 2 && snow >= sand) return 3;
  if (sand >= 2) return 2;
  return 0;
}

/** The surface a terrain point shows (no structure or prop: those pass their own material). */
export function classifyTerrain(field: SurfaceField | null | undefined, x: number, z: number): SurfaceKind {
  if (!field) return 'soil';
  if ((field.getWaterMaskAt?.(x, z) ?? 0) > 0.5) return 'water';
  const ground = field.getGroundType?.(x, z) ?? 'medium';
  const surface = trackSurface(field, x, z);
  if (ground === 'soft') return 'mud';
  if (surface === 3) return 'snow';
  if (surface === 2) return 'sand';
  const around = neighbourhood(field, x, z);
  if (around === 3) return 'snow';
  if (around === 2) return 'sand';
  if (ground === 'hard') return 'concrete';
  const ny = field.getNormalAt?.(x, z)?.y ?? 1;
  if (ny < 0.8) return 'rock';
  return 'soil';
}

/**
 * The surface a building or prop material shows to a blow (DESTRUCTION.md §16 fracture materials): masonry and
 * render throw grey-white powder, adobe and earth throw tan dust, timber splinters, metal sparks.
 */
export function surfaceForMaterial(material: string): SurfaceKind {
  switch (material) {
    case 'brick': case 'stone': case 'concrete': case 'rebar': case 'plaster': case 'tile': case 'slate':
      return 'concrete';
    case 'adobe': case 'earth': case 'infill': case 'thatch':
      return 'sand';
    case 'timber': case 'plank': case 'canvas':
      return 'wood';
    case 'metal':
      return 'metal';
    case 'glass':
      return 'concrete';
    default:
      return 'concrete';
  }
}
