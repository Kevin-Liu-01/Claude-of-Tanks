/**
 * combat/surface.ts — what a shell hit when it hit the ground (combat-fx lane, 2026-10-05).
 *
 * The burst takes its colour and its density from the ground: dark soil and turned earth, pale sand, white snow
 * powder over dark soil, black mud, grey rock chips, or water. Classified from the live height field the battle
 * already queries (no new world API): the liquid-water mask, the presentation track surface (sand / snow away from
 * roads), the drive ground type (soft = bog and lake mud, hard = road metal, bridge decks, ice) and the slope.
 * Roads report plain earth inside 14 m on every map, so a road hit looks at its neighbourhood: a road through snow or
 * sand throws snow or sand, a road through fields throws grit.
 */
import * as THREE from 'three';

export type SurfaceKind = 'soil' | 'sand' | 'snow' | 'mud' | 'rock' | 'water';

/** Crater shader index (craters.ts). Water leaves no crater. */
export const SURFACE_INDEX: Readonly<Record<Exclude<SurfaceKind, 'water'>, 0 | 1 | 2 | 3 | 4>> =
  Object.freeze({ soil: 0, sand: 1, snow: 2, mud: 3, rock: 4 });

export interface SurfaceField {
  getWaterMaskAt?(x: number, z: number): number;
  getWaterSurfaceHeightAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  getTrackSurfaceAt?(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
  getNormalAt?(x: number, z: number): { y: number };
}

const NEIGHBOUR_M = 22;

function surfaceAt(field: SurfaceField, x: number, z: number): number {
  return field.getTrackSurfaceAt ? field.getTrackSurfaceAt(x, z) : 0;
}

/** Sand (2) or snow (3) around a road point, else 0. */
function neighbourhood(field: SurfaceField, x: number, z: number): number {
  let sand = 0, snow = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const s = surfaceAt(field, x + Math.cos(a) * NEIGHBOUR_M, z + Math.sin(a) * NEIGHBOUR_M);
    if (s === 2) sand++;
    else if (s === 3) snow++;
  }
  if (snow >= 2 && snow >= sand) return 3;
  if (sand >= 2) return 2;
  return 0;
}

export function classifySurface(field: SurfaceField | null | undefined, x: number, z: number): SurfaceKind {
  if (!field) return 'soil';
  if ((field.getWaterMaskAt?.(x, z) ?? 0) > 0.5) return 'water';
  const ground = field.getGroundType?.(x, z) ?? 'medium';
  const surface = surfaceAt(field, x, z);
  if (ground === 'soft') return 'mud';
  if (surface === 3) return 'snow';
  if (surface === 2) return 'sand';
  const around = neighbourhood(field, x, z);
  if (around === 3) return 'snow';
  if (around === 2) return 'sand';
  if (ground === 'hard') return 'rock';
  const ny = field.getNormalAt?.(x, z)?.y ?? 1;
  if (ny < 0.8) return 'rock';
  return 'soil';
}

type Rgb = readonly [number, number, number];
const _c = new THREE.Color();
/** sRGB hex -> the renderer's linear working space (as every battle recipe's col3()). */
function lin(hex: number): Rgb {
  _c.setHex(hex);
  return Object.freeze([_c.r, _c.g, _c.b] as const);
}

interface SurfaceLook {
  /** dense ejecta: born dark, dries lighter */
  ejecta0: Rgb; ejecta1: Rgb;
  /** fine dust (surge and crown) */
  dust0: Rgb; dust1: Rgb;
  /** thrown chunks */
  clod: Rgb; clodWet: number;
  /** scales: ejecta count, dust mass, clod count, fountain height, how heavy the ejecta falls back */
  ejectaK: number; dustK: number; clodK: number; heightK: number; heavy: number;
  /** spray smear on the ejecta (sand and powder throw sheets of grains) */
  smear: number;
  /** thin-edge translucency of the dust (powder, spray) */
  scatter: number;
  /** muzzle blast: how much dust the blast wave lifts off this ground */
  blastDust: number;
}

// Albedos: a fresh clump of turned earth is dark, but airborne mineral dust scatters almost all the light it meets
// (single-scattering albedo ~0.9), so a dust cloud in the sun reads light tan against the sky, never as a darker
// veil over it. Ejecta are born at the soil's colour and dry/spread toward the dust's.
export const SURFACE_LOOKS: Readonly<Record<SurfaceKind, SurfaceLook>> = Object.freeze({
  soil: {
    ejecta0: lin(0x2b2119), ejecta1: lin(0x8c7b63), dust0: lin(0xa39179), dust1: lin(0xbcae98),
    clod: lin(0x2f251b), clodWet: 0.15, ejectaK: 1, dustK: 1, clodK: 1, heightK: 1, heavy: 1, smear: 0.035,
    scatter: 0.15, blastDust: 1,
  },
  sand: {
    ejecta0: lin(0x9c8460), ejecta1: lin(0xcdb894), dust0: lin(0xd2be9a), dust1: lin(0xe0d0b2),
    clod: lin(0xa58d68), clodWet: 0, ejectaK: 1.1, dustK: 1.45, clodK: 0.35, heightK: 0.9, heavy: 0.8, smear: 0.05,
    scatter: 0.3, blastDust: 1.5,
  },
  snow: {
    ejecta0: lin(0xd2dae0), ejecta1: lin(0xf0f3f6), dust0: lin(0xeef2f5), dust1: lin(0xf7f9fb),
    clod: lin(0xdde4ea), clodWet: 0.3, ejectaK: 1, dustK: 1.25, clodK: 0.8, heightK: 1.05, heavy: 0.7, smear: 0.045,
    scatter: 0.7, blastDust: 1.3,
  },
  mud: {
    ejecta0: lin(0x1c1611), ejecta1: lin(0x3e3327), dust0: lin(0x75685a), dust1: lin(0x8a7d6c),
    clod: lin(0x1d1711), clodWet: 1, ejectaK: 1, dustK: 0.45, clodK: 1.3, heightK: 0.85, heavy: 1.4, smear: 0.03,
    scatter: 0.05, blastDust: 0.35,
  },
  rock: {
    ejecta0: lin(0x57534d), ejecta1: lin(0x9a958d), dust0: lin(0xb3ada3), dust1: lin(0xc6c1b8),
    clod: lin(0x6c6862), clodWet: 0, ejectaK: 0.7, dustK: 0.9, clodK: 1.1, heightK: 0.8, heavy: 1, smear: 0.035,
    scatter: 0.15, blastDust: 0.8,
  },
  water: {
    ejecta0: lin(0xc3d1d5), ejecta1: lin(0xeef3f4), dust0: lin(0xe2eaec), dust1: lin(0xf2f6f7),
    clod: lin(0xc8d6da), clodWet: 1, ejectaK: 1, dustK: 1, clodK: 0, heightK: 1.3, heavy: 1, smear: 0.06,
    scatter: 0.85, blastDust: 0.25,
  },
});

/** Explosive residue smoke: grey-brown (TNT/RDX smoke is lighter than burning-fuel soot), thinning paler. */
export const BLAST_SMOKE0 = lin(0x4a433b);
export const BLAST_SMOKE1 = lin(0x8c857a);
/** Soil under snow that an explosive burst throws through the powder. */
export const UNDER_SNOW_SOIL = lin(0x2c2219);
