// src/world/horizonRelief.ts — round 72 (2026-09-25, owner, looking at Whiteout under the round-71 clouds: "the
// mountains look so flat and untextured and boring, while the clouds look so good"): the ring's mountain relief and
// its baked surface. Pure and deterministic from the map seed, Node-runnable (no DOM), so the receipts measure it.
//
// Two things live here:
//  1. THE RELIEF FIELD — a ridged multifractal over a warped world plane (after Musgrave's ridged multifractal: each
//     octave's ridge is weighted by the one below it, so crests sharpen where the coarse ridge already stands and
//     the valleys between stay smooth), with an erosion vocabulary: gullies elongated downslope (radial on the
//     ring), a talus apron at the concave foot of a face where the fine relief damps out, rounded shoulders low on a
//     face and sharp crests high on it, each with a per-map CHARACTER (polar, alpine, rolling, mesa, volcanic,
//     coastal, martian, karst). The field is split by wavelength: the octaves the ring mesh can carry (about 15–25 m
//     of vertex spacing on the ranges) displace the authored and interpolated rows in maps/horizon.ts; the octaves it
//     cannot go into the bake below, so nothing is drawn twice.
//  2. THE SURFACE BAKE — an (angle x radius) RGBA8 atlas over the annulus, built once per map at world activation in
//     slices (a generator, like the terrain build): R/G the fine relief's world-xz gradient (the detail normal the
//     fragment adds to the geometric slope), B a horizon-based ambient occlusion of the whole height field (valleys
//     and the foot of a crest darken), A the sun's visibility across the ranges at the map's fixed sun (the ridges'
//     own cast shadows). The fragment (horizonVista.ts) reads it by the ring's own u (the angle) and its radius.
import { SimplexNoise } from '../engine/simplexFast.ts';

export type HorizonReliefCharacter = 'polar' | 'alpine' | 'rolling' | 'mesa' | 'volcanic' | 'coastal' | 'martian' | 'karst';

export interface HorizonFarRangeSettings {
  /** Peak height (m) over the far ring's foot at full amplitude, before the deck ceiling. */
  ampM: number;
  /** Fraction of the peak height the ranges keep as their lowest saddles. */
  floor: number;
  /** Haze toward the fog tint on the inner and the outer rows (0..1). */
  hazeIn: number;
  hazeOut: number;
  /** Snow above this fraction of the peak height (2 = none). */
  snowline: number;
  /** Ridge sharpness of the far silhouette (1 plain ridge, higher = spires). */
  sharpness: number;
}

export interface HorizonReliefSettings {
  character: HorizonReliefCharacter;
  /** Metres of coarse relief (the geometry's share) at full weight. */
  lowAmpM: number;
  /** Metres of fine relief (the bake's share) at full weight. */
  highAmpM: number;
  /** Domain warp reach (m) and wavelength (m): ridgelines bend instead of running straight. */
  warpM: number;
  warpWavelengthM: number;
  /** Wavelength (m) of the first (coarsest) octave; every octave halves it. */
  wavelengthM: number;
  /** Ridge exponent at the crests (high on a face) and at the foot (low): > 1 sharpens, < 1 rounds. */
  crestSharpness: number;
  footSharpness: number;
  /** 0..1 share of billow (rounded |n| humps) over ridge (1 - |n| crests). */
  billow: number;
  /** Gully depth (m), across-slope wavelength (m) and downslope elongation (x). */
  gullyM: number;
  gullyWavelengthM: number;
  gullyElongation: number;
  /** Downslope stretch of the fine octaves (x): spurs and chutes run down a face instead of blobs (< 1 stretches along the strike). */
  fineElongation: number;
  /** Height multiplier on the ranges behind the first ridge: the ridge stays the terrain-material foothill the seam
   * laws seat, the ranges behind it — the vista's — stand over it (1 keeps the ladder's authored proportions). */
  rangeBoost: number;
  /** Round 72b: how many ranges (each with its own axis, azimuth, depth band and height) the coarse field is built from. */
  rangeCount: number;
  /** Round 72b: the ridgeline's elongation along its axis (the across wavelength is the character's wavelengthM). */
  rangeElongation: number;
  /** How much of the fine relief survives at a concave foot (the talus apron). */
  talusFloor: number;
  /** Ambient-occlusion reach (m) and strength (0..1 of the raw occlusion). */
  aoReachM: number;
  aoStrength: number;
  /** Softness of the baked sun shadow edge (slope units, ~tan of the penumbra angle). */
  shadowSoft: number;
  /** The far range behind the ring, or null for none. */
  far: HorizonFarRangeSettings | null;
}

const FAR_ALPINE: HorizonFarRangeSettings = { ampM: 820, floor: 0.34, hazeIn: 0.46, hazeOut: 0.68, snowline: 0.55, sharpness: 1.7 };
const FAR_POLAR: HorizonFarRangeSettings = { ampM: 640, floor: 0.30, hazeIn: 0.44, hazeOut: 0.68, snowline: 0.18, sharpness: 1.4 };
const FAR_ROLLING: HorizonFarRangeSettings = { ampM: 360, floor: 0.40, hazeIn: 0.50, hazeOut: 0.70, snowline: 2, sharpness: 0.85 };
const FAR_MESA: HorizonFarRangeSettings = { ampM: 470, floor: 0.45, hazeIn: 0.48, hazeOut: 0.70, snowline: 2, sharpness: 0.75 };
const FAR_VOLCANIC: HorizonFarRangeSettings = { ampM: 560, floor: 0.28, hazeIn: 0.48, hazeOut: 0.70, snowline: 2, sharpness: 1.05 };
const FAR_COASTAL: HorizonFarRangeSettings = { ampM: 300, floor: 0.35, hazeIn: 0.52, hazeOut: 0.72, snowline: 2, sharpness: 0.9 };
const FAR_MARTIAN: HorizonFarRangeSettings = { ampM: 1050, floor: 0.50, hazeIn: 0.38, hazeOut: 0.62, snowline: 2, sharpness: 0.6 };
const FAR_KARST: HorizonFarRangeSettings = { ampM: 520, floor: 0.30, hazeIn: 0.50, hazeOut: 0.72, snowline: 2, sharpness: 1.5 };

/** The characters: the vocabulary of each mountain country, from the field guides rather than from one another. */
const CHARACTERS: Readonly<Record<HorizonReliefCharacter, HorizonReliefSettings>> = {
  // broad polar ranges: long warped ridgelines, wind-scoured crests over talus skirts, deep radial gullies
  polar: {
    character: 'polar', lowAmpM: 48, highAmpM: 7, warpM: 150, warpWavelengthM: 760, wavelengthM: 300,
    crestSharpness: 1.35, footSharpness: 0.85, billow: 0.15, gullyM: 6.0, gullyWavelengthM: 46, gullyElongation: 5.5, fineElongation: 3.2, rangeBoost: 1.35, rangeCount: 3, rangeElongation: 3.6,
    talusFloor: 0.28, aoReachM: 170, aoStrength: 0.75, shadowSoft: 0.06, far: FAR_POLAR,
  },
  // spires and glaciers: sharp multifractal crests, short warps, chutes on the faces
  alpine: {
    character: 'alpine', lowAmpM: 52, highAmpM: 8, warpM: 110, warpWavelengthM: 620, wavelengthM: 260,
    crestSharpness: 1.9, footSharpness: 0.95, billow: 0.05, gullyM: 6.5, gullyWavelengthM: 40, gullyElongation: 6, fineElongation: 3.0, rangeBoost: 1.30, rangeCount: 4, rangeElongation: 3.2,
    talusFloor: 0.30, aoReachM: 160, aoStrength: 0.80, shadowSoft: 0.05, far: FAR_ALPINE,
  },
  // wooded hills: rounded billows with spurs, shallow drainage
  rolling: {
    character: 'rolling', lowAmpM: 22, highAmpM: 5, warpM: 90, warpWavelengthM: 700, wavelengthM: 320,
    crestSharpness: 0.9, footSharpness: 0.7, billow: 0.45, gullyM: 2.6, gullyWavelengthM: 60, gullyElongation: 4, fineElongation: 2.2, rangeBoost: 1.10, rangeCount: 3, rangeElongation: 2.8,
    talusFloor: 0.5, aoReachM: 140, aoStrength: 0.6, shadowSoft: 0.08, far: FAR_ROLLING,
  },
  // tablelands: the caps stay flat (small coarse share), the cliffs carry ledges and talus, dry washes below
  mesa: {
    character: 'mesa', lowAmpM: 5, highAmpM: 6, warpM: 40, warpWavelengthM: 520, wavelengthM: 220,
    crestSharpness: 1.1, footSharpness: 0.8, billow: 0.30, gullyM: 3.8, gullyWavelengthM: 34, gullyElongation: 7, fineElongation: 0.5, rangeBoost: 1.0, rangeCount: 0, rangeElongation: 3.4, // tables are not ridges: the isotropic field alone
    talusFloor: 0.35, aoReachM: 120, aoStrength: 0.7, shadowSoft: 0.05, far: FAR_MESA,
  },
  // volcanic country: smooth-sided cones cut by radial barrancos, lava benches
  volcanic: {
    character: 'volcanic', lowAmpM: 18, highAmpM: 6, warpM: 60, warpWavelengthM: 560, wavelengthM: 240,
    crestSharpness: 1.0, footSharpness: 0.75, billow: 0.35, gullyM: 5.5, gullyWavelengthM: 30, gullyElongation: 9, fineElongation: 3.5, rangeBoost: 1.15, rangeCount: 3, rangeElongation: 2.6,
    talusFloor: 0.40, aoReachM: 130, aoStrength: 0.7, shadowSoft: 0.06, far: FAR_VOLCANIC,
  },
  // headlands and cliffs into the sea: rounded uplands, cliffed fronts
  coastal: {
    character: 'coastal', lowAmpM: 20, highAmpM: 5, warpM: 80, warpWavelengthM: 640, wavelengthM: 300,
    crestSharpness: 0.95, footSharpness: 0.7, billow: 0.40, gullyM: 2.8, gullyWavelengthM: 52, gullyElongation: 4.5, fineElongation: 2.0, rangeBoost: 1.08, rangeCount: 3, rangeElongation: 3.0,
    talusFloor: 0.5, aoReachM: 130, aoStrength: 0.6, shadowSoft: 0.08, far: FAR_COASTAL,
  },
  // Olympus-scale shield slopes: very long wavelengths, low relief, lobate flows
  martian: {
    character: 'martian', lowAmpM: 16, highAmpM: 4, warpM: 120, warpWavelengthM: 900, wavelengthM: 420,
    crestSharpness: 0.8, footSharpness: 0.7, billow: 0.55, gullyM: 2.0, gullyWavelengthM: 70, gullyElongation: 6, fineElongation: 1.6, rangeBoost: 1.15, rangeCount: 2, rangeElongation: 4.2,
    talusFloor: 0.6, aoReachM: 160, aoStrength: 0.55, shadowSoft: 0.07, far: FAR_MARTIAN,
  },
  // jungle karst: steep isolated towers, rounded tops, sharp bases
  karst: {
    character: 'karst', lowAmpM: 30, highAmpM: 6, warpM: 70, warpWavelengthM: 480, wavelengthM: 200,
    crestSharpness: 1.4, footSharpness: 1.2, billow: 0.25, gullyM: 3.0, gullyWavelengthM: 36, gullyElongation: 5, fineElongation: 2.4, rangeBoost: 1.25, rangeCount: 4, rangeElongation: 2.4,
    talusFloor: 0.35, aoReachM: 120, aoStrength: 0.75, shadowSoft: 0.06, far: FAR_KARST,
  },
};

/** A map's character: authored (`horizon.relief`), else by map identity, else by the ring style. */
export function resolveHorizonReliefCharacter(
  horizon: { relief?: HorizonReliefCharacter; style?: string } | null | undefined, mapId: string,
): HorizonReliefCharacter {
  if (horizon?.relief && CHARACTERS[horizon.relief]) return horizon.relief;
  if (mapId === 'winter' || mapId === 'whiteout') return 'polar';
  if (mapId === 'caldera' || mapId === 'blackglass') return 'volcanic';
  if (mapId === 'mars') return 'martian';
  if (mapId === 'monsoon' || mapId === 'mangrove') return 'karst';
  if (mapId === 'coastal' || mapId === 'saltwind' || mapId === 'fjord' || mapId === 'polders') return mapId === 'fjord' ? 'alpine' : 'coastal';
  const style = horizon?.style;
  if (style === 'alpine') return 'alpine';
  if (style === 'mesa') return 'mesa';
  return 'rolling';
}

export function resolveHorizonRelief(character: HorizonReliefCharacter): HorizonReliefSettings {
  return CHARACTERS[character];
}

/** Every character, for the receipts. */
export const HORIZON_RELIEF_CHARACTERS: readonly HorizonReliefCharacter[] = Object.freeze(Object.keys(CHARACTERS) as HorizonReliefCharacter[]);

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface HorizonReliefField {
  /** Metres of coarse relief at world (x, z): the geometry's share, centred on zero. */
  low(x: number, z: number): number;
  /**
   * Metres of fine relief at world (x, z): the bake's share. `hT` (0..1, height within the ring) picks the ridge
   * sharpness between the foot and the crest, `concavity` (-1 convex .. +1 concave) damps it on the talus apron,
   * `steep` (0..1) admits the downslope gullies.
   */
  high(x: number, z: number, hT: number, concavity: number, steep: number, r?: number, theta?: number): number;
  /**
   * The bake's two-stage form of `high`: `prepare` runs the warp and the coarse octaves at a point (their offsets and
   * the multifractal weight they leave, smooth enough to interpolate between the bake's half-resolution texels),
   * `finish` runs the fine octaves, the talus and the gullies from a prepared point. `high` = prepare + finish.
   */
  prepare(x: number, z: number, sharp: number, out: { dx: number; dz: number; weight: number }): void;
  finish(dx: number, dz: number, weight: number, sharp: number, concavity: number, steep: number, r: number, theta: number): number;
  /** The character in force. */
  settings: HorizonReliefSettings;
}

const LOW_OCTAVES = 3;
const HIGH_OCTAVES = 3;
/** The fine band starts one octave back: the row ladder (60–250 m spans) cannot carry the 75 m octave, so the bake does. */
const HIGH_FIRST = 2;
const LACUNARITY = 2.05;
const GAIN = 0.52;
/** The fine octaves fall off faster than the coarse ones, so their gradient energy sits in the spurs, not in grit. */
const HIGH_GAIN = 0.42;

/**
 * The relief field of one map. Seeded like the ring's own noise (the caller mixes the map id in), so a map's ridges
 * are the same on every load and in every receipt.
 */
export function createHorizonReliefField(seed: number, settings: HorizonReliefSettings): HorizonReliefField {
  const s = settings;
  const noise = new SimplexNoise({ random: mulberry32(seed >>> 0) });
  const rng = mulberry32((seed ^ 0x9E37) >>> 0);
  const octaves = HIGH_FIRST + HIGH_OCTAVES;
  const freq = new Float64Array(octaves), ox = new Float64Array(octaves), oz = new Float64Array(octaves), amp = new Float64Array(octaves);
  let f = 1 / s.wavelengthM, a = 1;
  for (let o = 0; o < octaves; o++) {
    freq[o] = f; ox[o] = rng() * 200 - 100; oz[o] = rng() * 200 - 100; amp[o] = a;
    f *= LACUNARITY; a *= GAIN;
  }
  const lowNorm = amp[0] + amp[1] + amp[2];
  // the fine band's own amplitudes and offsets (a different set from the coarse band's at the shared octave)
  const highAmp = new Float64Array(HIGH_OCTAVES), hox = new Float64Array(HIGH_OCTAVES), hoz = new Float64Array(HIGH_OCTAVES);
  let ha = 1, highNorm = 0;
  for (let o = 0; o < HIGH_OCTAVES; o++) { highAmp[o] = ha; highNorm += ha; hox[o] = rng() * 200 - 100; hoz[o] = rng() * 200 - 100; ha *= HIGH_GAIN; }
  const warpF = 1 / s.warpWavelengthM;
  const gullyF = 1 / s.gullyWavelengthM;
  const gullyFr = gullyF / s.gullyElongation;
  const gullyK = 1000 * gullyF; // the circle's radius in noise units: one wavelength per gullyWavelengthM of arc at r = 1 km
  const scratch = { wx: 0, wz: 0, weight: 1 };

  const warpTo = (x: number, z: number): void => {
    scratch.wx = x + noise.noise(x * warpF + 31.7, z * warpF - 12.9) * s.warpM;
    scratch.wz = z + noise.noise(x * warpF - 57.3, z * warpF + 44.1) * s.warpM;
  };
  // one octave of the ridged multifractal at the warped point; the running weight couples the octaves
  const octave = (o: number, sharp: number): number => {
    const n = noise.noise(scratch.wx * freq[o] + ox[o], scratch.wz * freq[o] + oz[o]);
    const an = Math.abs(n);
    let r = (1 - an) + (an - (1 - an)) * s.billow;
    r = Math.pow(clamp(r, 0, 1), sharp);
    r *= scratch.weight;
    scratch.weight = clamp(r * 2.0, 0, 1);
    return r;
  };
  const lowRaw = (x: number, z: number, sharp: number): number => {
    warpTo(x, z);
    scratch.weight = 1;
    let sum = 0;
    for (let o = 0; o < LOW_OCTAVES; o++) sum += octave(o, sharp) * amp[o];
    return sum / lowNorm;
  };
  // Round 72b (integrator: "rows of symmetric cones ... real ranges are asymmetric massifs with several summits,
  // serrated crests, shoulders and saddles, and long ridgelines running obliquely to the viewer"): the coarse field is
  // the sum of RANGES. Each range has its own azimuth window on the ring, its depth band (near / mid / far, so the
  // ranges layer front to back), an AXIS at 20–50° to the ring's tangent (the ridgeline runs obliquely to a viewer at
  // the centre) and its own height; along the axis the ridged field is stretched by the character's elongation (long
  // crest lines), across it one flank is compressed (a steep face and a gentle shoulder, never a symmetric cone), and a
  // second ridged octave at a third of the spacing, phase-jittered along the axis, hangs sub-peaks and shoulders on the
  // crest (multifractally: only where the main ridge already stands). Between the windows a weak isotropic base keeps
  // saddles and passes instead of flat gaps.
  interface ReliefRange {
    theta: number; halfSpan: number; phi: number; cx: number; cz: number; rIn: number; rOut: number;
    height: number; steepSide: number; steepness: number; sub: number; lambdaAlong: number; lambdaAcross: number;
    o1: number; o2: number; o3: number; o4: number; jitterPhase: number;
  }
  const rangeRng = mulberry32((seed ^ 0x5A17) >>> 0);
  const ranges: ReliefRange[] = [];
  const depthBands: ReadonlyArray<readonly [number, number]> = [[620, 980], [820, 1250], [1000, 1560]];
  for (let k = 0; k < s.rangeCount; k++) {
    const slot = (2 * Math.PI) / s.rangeCount;
    const theta = k * slot + (rangeRng() - 0.5) * slot * 0.5;
    const [rIn, rOut] = depthBands[(k + Math.floor(rangeRng() * 2)) % depthBands.length];
    const oblique = (rangeRng() < 0.5 ? -1 : 1) * (0.35 + rangeRng() * 0.5);
    const rMid = (rIn + rOut) * 0.5;
    ranges.push({
      theta, halfSpan: (Math.PI / s.rangeCount) * (1.05 + rangeRng() * 0.45), phi: theta + Math.PI / 2 + oblique,
      cx: Math.cos(theta) * rMid, cz: Math.sin(theta) * rMid, rIn, rOut,
      height: 0.75 + rangeRng() * 0.55, steepSide: rangeRng() < 0.5 ? -1 : 1, steepness: 1.6 + rangeRng() * 0.6,
      sub: 0.28 + rangeRng() * 0.12,
      lambdaAlong: s.wavelengthM * s.rangeElongation * (0.9 + rangeRng() * 0.3), lambdaAcross: s.wavelengthM * (0.85 + rangeRng() * 0.3),
      o1: rangeRng() * 100, o2: rangeRng() * 100, o3: rangeRng() * 100, o4: rangeRng() * 100, jitterPhase: rangeRng() * 100,
    });
  }
  const TAU = Math.PI * 2;
  const rangeField = (x: number, z: number, sharp: number): number => {
    const ang = Math.atan2(z, x), r = Math.hypot(x, z);
    let sum = 0;
    for (const g of ranges) {
      let d = ang - g.theta; d -= Math.round(d / TAU) * TAU;
      const wTheta = 1 - smoothstep(g.halfSpan * 0.55, g.halfSpan, Math.abs(d));
      if (wTheta < 1e-3) continue;
      const wR = smoothstep(g.rIn - 140, g.rIn, r) * (1 - smoothstep(g.rOut, g.rOut + 140, r));
      const w = wTheta * wR;
      if (w < 1e-3) continue;
      const cp = Math.cos(g.phi), sp = Math.sin(g.phi);
      const dx = x - g.cx, dz = z - g.cz;
      const along = dx * cp + dz * sp;
      let across = -dx * sp + dz * cp;
      if (across * g.steepSide < 0) across *= g.steepness; // the steep flank
      const n1 = noise.noise(along / g.lambdaAlong + g.o1, across / g.lambdaAcross + g.o2);
      const r1 = Math.pow(1 - Math.abs(n1), sharp);
      const w1 = clamp(r1 * 2, 0, 1);
      const jitter = noise.noise(along / (g.lambdaAlong * 0.6) + g.jitterPhase, 7.7) * g.lambdaAlong * 0.15;
      const n2 = noise.noise((along + jitter) / (g.lambdaAlong / 3) + g.o3, across / (g.lambdaAcross / 2) + g.o4);
      const r2 = Math.pow(1 - Math.abs(n2), sharp) * w1;
      sum += w * g.height * (r1 * (1 - g.sub) + r2 * g.sub);
    }
    return ranges.length ? sum + lowRaw(x, z, sharp) * 0.35 : lowRaw(x, z, sharp);
  };
  // Centre the coarse field on zero and set its RMS to half the amplitude (peaks about ±lowAmpM) over the ring's own
  // annulus (the ranges are placed on it), so the authored rows keep their mean height and the relief spends the
  // metres the character asks for — a multifractal's raw sum has a mean near 0.4 and a spread of a few hundredths
  const midSharp = (s.crestSharpness + s.footSharpness) * 0.5;
  let lowMean = 0, lowStd = 1;
  {
    const N = 48, samples = new Float64Array(N * N);
    let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const theta = (i / N) * TAU, r = 640 + (j / N) * 900;
      const v = rangeField(Math.cos(theta) * r, Math.sin(theta) * r, midSharp);
      samples[j * N + i] = v; sum += v;
    }
    lowMean = sum / (N * N);
    let sq = 0;
    for (let k = 0; k < samples.length; k++) sq += (samples[k] - lowMean) * (samples[k] - lowMean);
    lowStd = Math.max(1e-4, Math.sqrt(sq / samples.length));
  }
  const lowScale = 0.5 * s.lowAmpM / lowStd;
  const stage = { dx: 0, dz: 0, weight: 1 };
  // the fine band's own centring and scale (RMS = 0.45 of its amplitude), sampled in the ring frame at 1 km
  let fineMean = 0.42, fineScale = 1;
  const fineRaw = (aFine: number, rFine: number, weight: number, sharp: number): number => {
    let w = weight, sum = 0;
    for (let o = 0; o < HIGH_OCTAVES; o++) {
      const fq = freq[HIGH_FIRST + o], k = 1000 * fq;
      const n = noise.noise3d(Math.cos(aFine) * k + hox[o], Math.sin(aFine) * k + hoz[o], rFine * fq + hoz[o] * 0.37);
      const an = Math.abs(n);
      let rr = (1 - an) + (an - (1 - an)) * s.billow;
      rr = Math.pow(clamp(rr, 0, 1), sharp) * w;
      w = clamp(rr * 2.0, 0, 1);
      sum += rr * highAmp[o];
    }
    return sum / highNorm;
  };
  {
    const N = 64, samples = new Float64Array(N * N);
    let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2, r = 700 + (j / N) * 700;
      const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
      warpTo(x, z); scratch.weight = 1;
      for (let o = 0; o < LOW_OCTAVES; o++) octave(o, midSharp);
      const v = fineRaw(theta, r / s.fineElongation, scratch.weight, midSharp);
      samples[j * N + i] = v; sum += v;
    }
    fineMean = sum / (N * N);
    let sq = 0;
    for (let k = 0; k < samples.length; k++) sq += (samples[k] - fineMean) * (samples[k] - fineMean);
    fineScale = 0.45 * s.highAmpM / Math.max(1e-4, Math.sqrt(sq / samples.length));
  }
  return {
    settings: s,
    low(x, z) {
      return (rangeField(x, z, midSharp) - lowMean) * lowScale;
    },
    prepare(x, z, sharp, out) {
      warpTo(x, z);
      scratch.weight = 1;
      for (let o = 0; o < LOW_OCTAVES; o++) octave(o, sharp);
      out.dx = scratch.wx - x; out.dz = scratch.wz - z; out.weight = scratch.weight;
    },
    finish(dx, dz, weight, sharp, concavity, steep, r, theta) {
      scratch.weight = weight;
      // the fine octaves run in the ring's own (arc, radius) frame, stretched downslope by the character's elongation
      // (a face's spurs and chutes run down it; a mesa's ledges run along it), the warp offsets carried over as arc
      // and radius shifts; the across-slope coordinate is a circle in noise space so the field closes at every angle
      const ct = Math.cos(theta), st = Math.sin(theta);
      const dArc = -st * dx + ct * dz, dR = ct * dx + st * dz;
      const aFine = theta + dArc / Math.max(1, r);
      const rFine = (r + dR) / s.fineElongation;
      const raw = fineRaw(aFine, rFine, weight, sharp);
      // the talus apron: at a concave foot the fine relief settles into a smooth fan
      const talus = smoothstep(0.08, 0.45, concavity);
      const fine = (raw - fineMean) * fineScale * (1 - talus * (1 - s.talusFloor));
      // gullies: ridged noise elongated downslope (radial on the ring), carved into the steeper faces only; the
      // across-slope coordinate runs around a circle in noise space so the pattern closes on itself at every angle
      const g = noise.noise3d(Math.cos(theta) * gullyK + 7.7, Math.sin(theta) * gullyK - 3.3, r * gullyFr + 5.1);
      const gully = -Math.pow(1 - Math.abs(g), 3) * s.gullyM * (0.25 + 0.75 * steep) * (1 - talus * 0.6);
      return fine + gully;
    },
    high(x, z, hT, concavity, steep, rIn, thetaIn) {
      const sharp = s.footSharpness + (s.crestSharpness - s.footSharpness) * clamp(hT, 0, 1);
      this.prepare(x, z, sharp, stage);
      return this.finish(stage.dx, stage.dz, stage.weight, sharp, concavity, steep, rIn ?? Math.hypot(x, z), thetaIn ?? Math.atan2(z, x));
    },
  };
}

// ---------------------------------------------------------------------------
// the surface bake
// ---------------------------------------------------------------------------
interface HorizonReliefBakeInput {
  columns: number;
  rowCount: number;
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
  /** Per-vertex marine weight (0..1), optional: the sea apron bakes flat and unshadowed. */
  marine?: Float32Array | null;
}

export interface HorizonReliefBake {
  width: number;
  height: number;
  /** RGBA8: R/G the fine gradient (world dh/dx, dh/dz over gradScale, biased), B the ambient occlusion, A the sun visibility. */
  data: Uint8Array;
  /** The radius the first texel row sits on and the radius the last one reaches. */
  r0: number;
  r1: number;
  gradScale: number;
  stats: { aoMean: number; shadowMean: number; gradP95: number; fineRangeM: number; passMs: [number, number, number] };
}

export const HORIZON_RELIEF_BAKE_R0 = 410;
export const HORIZON_RELIEF_BAKE_R1 = 1560;
export const HORIZON_RELIEF_GRAD_SCALE = 4.0; // round 72b: the steep-face striations reach a gradient of 2.8 (was 1.5, which saturated them)
const AO_DIRECTIONS = 8;
const AO_STEPS_M = [5, 10, 20, 40, 80, 160];
const SUN_STEPS_M = [4, 8, 14, 22, 34, 50, 72, 100, 140, 190, 260, 340, 440, 560];

/**
 * Bake the (angle x radius) surface atlas for a finished ring (after the seating, the caps and the sea). The macro
 * height at any (angle, radius) is the ring's own rows interpolated (per column the rows are monotone in radius, so
 * a binary search finds the span); the fine relief comes from the field; the occlusion and the sun visibility are
 * horizon searches over the combined height. Yields every few rows of each pass so the caller can slice it.
 */
export function* bakeHorizonReliefSteps(
  input: HorizonReliefBakeInput, field: HorizonReliefField, sun: readonly [number, number, number],
  size: { width: number; height: number } = { width: 2048, height: 256 },
): Generator<void, HorizonReliefBake, void> {
  const { columns: n, rowCount, positions, heights, maxHeight } = input;
  const W = size.width, H = size.height;
  const r0 = HORIZON_RELIEF_BAKE_R0, r1 = HORIZON_RELIEF_BAKE_R1;
  const dr = (r1 - r0) / H;
  const s = field.settings;
  // per-column monotone radius / height tables
  const colR = new Float32Array(n * rowCount), colH = new Float32Array(n * rowCount), colM = new Float32Array(n * rowCount);
  for (let row = 0; row < rowCount; row++) {
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      colR[k * rowCount + row] = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
      colH[k * rowCount + row] = heights[i];
      colM[k * rowCount + row] = input.marine ? input.marine[i] : 0;
    }
  }
  const columnAt = (k: number, r: number, out: Float32Array): number => {
    // returns the height; writes the marine weight to out[0]
    const base = k * rowCount;
    let lo = 0, hi = rowCount - 1;
    if (r <= colR[base]) { out[0] = colM[base]; return colH[base]; }
    if (r >= colR[base + hi]) { out[0] = colM[base + hi]; return colH[base + hi]; }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (colR[base + mid] <= r) lo = mid; else hi = mid;
    }
    const t = (r - colR[base + lo]) / Math.max(1e-3, colR[base + hi] - colR[base + lo]);
    out[0] = colM[base + lo] + (colM[base + hi] - colM[base + lo]) * t;
    return colH[base + lo] + (colH[base + hi] - colH[base + lo]) * t;
  };
  const mA = new Float32Array(1), mB = new Float32Array(1);
  const macro = new Float32Array(W * H), marine = new Float32Array(W * H);
  const TAU = Math.PI * 2;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  // pass 1: the macro height
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr;
    for (let i = 0; i < W; i++) {
      const c = (i / W) * n;
      const k0 = Math.floor(c) % n, k1 = (k0 + 1) % n, t = c - Math.floor(c);
      const hA = columnAt(k0, r, mA), hB = columnAt(k1, r, mB);
      macro[j * W + i] = hA + (hB - hA) * t;
      marine[j * W + i] = mA[0] + (mB[0] - mA[0]) * t;
    }
    if ((j & 15) === 15) yield;
  }
  const t1 = now();
  // pass 2: the fine relief over the macro (concavity and steepness from the macro's radial second and first
  // differences). The warp and the coarse octaves — smooth terms — run on a half-resolution grid and are interpolated
  // to each texel (their offsets and the multifractal weight they leave); only the fine octaves and the gullies run
  // per texel, so the field costs four noise samples a texel instead of nine.
  const fine = new Float32Array(W * H);
  const dj = Math.max(2, Math.round(40 / dr));
  const arcAt = (r: number): number => r * TAU / W;
  const Wq = W >> 1, Hq = H >> 1;
  const stageDx = new Float32Array(Wq * Hq), stageDz = new Float32Array(Wq * Hq), stageW = new Float32Array(Wq * Hq);
  const stage = { dx: 0, dz: 0, weight: 1 };
  const sharpAt = (hT: number): number => s.footSharpness + (s.crestSharpness - s.footSharpness) * clamp(hT, 0, 1);
  for (let jq = 0; jq < Hq; jq++) {
    const r = r0 + (jq * 2 + 1) * dr;
    for (let iq = 0; iq < Wq; iq++) {
      const theta = ((iq * 2 + 0.5) / W) * TAU;
      const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
      const h = macro[(jq * 2) * W + iq * 2];
      field.prepare(x, z, sharpAt(h / Math.max(1, maxHeight)), stage);
      const q = jq * Wq + iq;
      stageDx[q] = stage.dx; stageDz[q] = stage.dz; stageW[q] = stage.weight;
    }
    if ((jq & 7) === 7) yield;
  }
  const stageAt = (grid: Float32Array, i: number, j: number): number => {
    const fx = (i - 0.5) * 0.5, fy = (j - 0.5) * 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % Wq) + Wq) % Wq; const x1 = (x0 + 1) % Wq;
    y0 = y0 < 0 ? 0 : y0 >= Hq ? Hq - 1 : y0; const y1 = y0 + 1 >= Hq ? Hq - 1 : y0 + 1;
    const top = grid[y0 * Wq + x0] + (grid[y0 * Wq + x1] - grid[y0 * Wq + x0]) * tx;
    const bottom = grid[y1 * Wq + x0] + (grid[y1 * Wq + x1] - grid[y1 * Wq + x0]) * tx;
    return top + (bottom - top) * ty;
  };
  let fineMin = Infinity, fineMax = -Infinity;
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr;
    const jm = Math.max(0, j - dj), jp = Math.min(H - 1, j + dj);
    const arc = arcAt(r);
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const hm = macro[jm * W + i], hp = macro[jp * W + i], h = macro[idx];
      const concavity = clamp((hm + hp - 2 * h) / (40 * 1.0), -1, 1);
      const im = (i - 1 + W) % W, ip = (i + 1) % W;
      const gθ = (macro[j * W + ip] - macro[j * W + im]) / (2 * arc);
      const gr = (macro[Math.min(H - 1, j + 1) * W + i] - macro[Math.max(0, j - 1) * W + i]) / (2 * dr);
      const steep = smoothstep(0.22, 0.65, Math.hypot(gθ, gr));
      const theta = (i / W) * TAU;
      // the seam (round 29 / 35 laws): the fine relief is nil at the square's edge and full 90 m out, so the seam row
      // continues the terrain's own edge and the terrain-material bands read the same atlas from there (round 72b)
      const seamW = smoothstep(0, 90, Math.max(Math.abs(Math.cos(theta) * r), Math.abs(Math.sin(theta) * r)) - 511.5);
      // round 72b (integrator: "faces read as one flat tone"): the striations and gully shading run at three times
      // their amplitude on the steep faces, so they survive the aerial pass at range
      const land = (1 - marine[idx]) * seamW * (1 + 2.2 * steep);
      const v = land > 0.001
        ? field.finish(stageAt(stageDx, i, j), stageAt(stageDz, i, j), stageAt(stageW, i, j), sharpAt(h / Math.max(1, maxHeight)), concavity, steep, r, theta) * land
        : 0;
      fine[idx] = v;
      if (v < fineMin) fineMin = v; if (v > fineMax) fineMax = v;
    }
    if ((j & 7) === 7) yield;
  }
  // pass 3: the combined height, its fine gradient in world xz, the occlusion and the sun visibility. The horizon
  // searches walk the (angle x radius) grid itself at HALF resolution (occlusion and shadow are smooth terms with a
  // reach of a hundred metres; the gradient stays at full resolution): the eight occlusion directions are grid-aligned
  // (their metre lengths taken from the row's arc and the radial step), so a row's texel offsets are computed once,
  // and the sun's grid direction is fixed per column (it turns with the angle), so no trigonometry runs per sample.
  const t2 = now();
  const total = new Float32Array(W * H);
  for (let idx = 0; idx < W * H; idx++) total[idx] = macro[idx] + fine[idx];
  const data = new Uint8Array(W * H * 4);
  const sunHoriz = Math.hypot(sun[0], sun[2]);
  const tanEl = sun[1] / Math.max(1e-3, sunHoriz);
  const sx = sun[0] / Math.max(1e-6, sunHoriz), sz = sun[2] / Math.max(1e-6, sunHoriz);
  const gradScale = HORIZON_RELIEF_GRAD_SCALE;
  const grads: number[] = [];
  const Wh = W >> 1, Hh = H >> 1;
  const aoGrid = new Float32Array(Wh * Hh), sunGrid = new Float32Array(Wh * Hh);
  const cosCol = new Float32Array(Wh), sinCol = new Float32Array(Wh), sunA = new Float32Array(Wh), sunB = new Float32Array(Wh);
  for (let i = 0; i < Wh; i++) {
    const theta = ((i + 0.5) / Wh) * TAU;
    cosCol[i] = Math.cos(theta); sinCol[i] = Math.sin(theta);
    // the sun's world direction in grid units per metre: angle texels (times 1 / r) and radial texels
    sunA[i] = (-sinCol[i] * sx + cosCol[i] * sz) * W / TAU;
    sunB[i] = (cosCol[i] * sx + sinCol[i] * sz) / dr;
  }
  const aoDirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const aoSteps = AO_STEPS_M.filter((d) => d <= s.aoReachM);
  const aoDi = new Int32Array(AO_DIRECTIONS * aoSteps.length), aoDj = new Int32Array(AO_DIRECTIONS * aoSteps.length);
  const aoDist = new Float32Array(AO_DIRECTIONS * aoSteps.length);
  let aoSum = 0, shSum = 0;
  for (let jh = 0; jh < Hh; jh++) {
    const j = jh * 2;
    const r = r0 + (j + 1) * dr;
    const arc = arcAt(r);
    // this row's occlusion offsets (full-resolution texels): a grid direction scaled so the metre length matches the step
    for (let d = 0; d < AO_DIRECTIONS; d++) {
      const [ui, uj] = aoDirs[d];
      const unitM = Math.hypot(ui * arc, uj * dr);
      for (let step = 0; step < aoSteps.length; step++) {
        const k = Math.max(1, Math.round(aoSteps[step] / unitM));
        aoDi[d * aoSteps.length + step] = ui * k; aoDj[d * aoSteps.length + step] = uj * k;
        aoDist[d * aoSteps.length + step] = k * unitM;
      }
    }
    for (let ih = 0; ih < Wh; ih++) {
      const i = ih * 2;
      const idx = j * W + i;
      const h0 = total[idx];
      // ambient occlusion: the horizon in eight grid directions, up to the reach
      let occ = 0;
      for (let d = 0; d < AO_DIRECTIONS; d++) {
        let maxSlope = 0;
        for (let step = 0; step < aoSteps.length; step++) {
          const q = d * aoSteps.length + step;
          let ii = i + aoDi[q], jj = j + aoDj[q];
          if (ii < 0) ii += W; else if (ii >= W) ii -= W;
          if (jj < 0) jj = 0; else if (jj >= H) jj = H - 1;
          const slope = (total[jj * W + ii] - h0) / aoDist[q];
          if (slope > maxSlope) maxSlope = slope;
        }
        occ += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
      }
      const ao = 1 - occ / AO_DIRECTIONS;
      // sun visibility: march toward the sun; a higher ridge along the way at a slope above the sun's blocks it
      const a = sunA[ih] / r, b = sunB[ih];
      let block = -1;
      for (let step = 0; step < SUN_STEPS_M.length; step++) {
        const dist = SUN_STEPS_M[step];
        let ii = i + Math.round(a * dist), jj = j + Math.round(b * dist);
        ii = ((ii % W) + W) % W;
        if (jj < 0) jj = 0; else if (jj >= H) jj = H - 1;
        const bl = (total[jj * W + ii] - h0) / dist - tanEl;
        if (bl > block) block = bl;
      }
      const theta0 = ((i + 0.5) / W) * TAU;
      const seamW0 = smoothstep(0, 90, Math.max(Math.abs(Math.cos(theta0) * r), Math.abs(Math.sin(theta0) * r)) - 511.5);
      const land = (1 - marine[idx]) * seamW0;
      const sunVis = 1 - smoothstep(-s.shadowSoft, s.shadowSoft, block) * land;
      // round 72b: the occlusion deepened (a 1.6 power) so the folds read at 1.5 km through the haze
      const aoOut = 1 - (1 - Math.pow(ao, 1.6)) * land;
      aoGrid[jh * Wh + ih] = aoOut; sunGrid[jh * Wh + ih] = sunVis;
      aoSum += aoOut; shSum += sunVis;
    }
    if ((jh & 7) === 7) yield;
  }
  // the fine gradient at full resolution, the occlusion and the sun bilinear from the half grid
  const half = (grid: Float32Array, i: number, j: number): number => {
    const fx = (i - 0.5) * 0.5, fy = (j - 0.5) * 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % Wh) + Wh) % Wh; const x1 = (x0 + 1) % Wh;
    y0 = y0 < 0 ? 0 : y0 >= Hh ? Hh - 1 : y0; const y1 = y0 + 1 >= Hh ? Hh - 1 : y0 + 1;
    const top = grid[y0 * Wh + x0] + (grid[y0 * Wh + x1] - grid[y0 * Wh + x0]) * tx;
    const bottom = grid[y1 * Wh + x0] + (grid[y1 * Wh + x1] - grid[y1 * Wh + x0]) * tx;
    return top + (bottom - top) * ty;
  };
  for (let j = 0; j < H; j++) {
    const r = r0 + (j + 0.5) * dr;
    const arc = arcAt(r);
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const theta = (i / W) * TAU;
      const ct = Math.cos(theta), st = Math.sin(theta);
      // fine gradient (world): dh/dx = dh/dr cos - dh/dθ sin / r ; dh/dz = dh/dr sin + dh/dθ cos / r
      const im = i === 0 ? W - 1 : i - 1, ip = i === W - 1 ? 0 : i + 1;
      const fθ = (fine[j * W + ip] - fine[j * W + im]) / (2 * arc);
      const fr = (fine[Math.min(H - 1, j + 1) * W + i] - fine[Math.max(0, j - 1) * W + i]) / (2 * dr);
      const gx = fr * ct - fθ * st, gz = fr * st + fθ * ct;
      if ((idx & 1023) === 0) grads.push(Math.hypot(gx, gz));
      data[idx * 4] = clamp(Math.round((gx / gradScale * 0.5 + 0.5) * 255), 0, 255);
      data[idx * 4 + 1] = clamp(Math.round((gz / gradScale * 0.5 + 0.5) * 255), 0, 255);
      data[idx * 4 + 2] = clamp(Math.round(half(aoGrid, i, j) * 255), 0, 255);
      data[idx * 4 + 3] = clamp(Math.round(half(sunGrid, i, j) * 255), 0, 255);
    }
    if ((j & 15) === 15) yield;
  }
  aoSum /= Wh * Hh; shSum /= Wh * Hh;
  const t3 = now();
  grads.sort((a, b) => a - b);
  return {
    width: W, height: H, data, r0, r1, gradScale,
    stats: {
      aoMean: aoSum, shadowMean: shSum,
      gradP95: grads.length ? grads[Math.min(grads.length - 1, Math.floor(grads.length * 0.95))] : 0,
      fineRangeM: fineMax - fineMin,
      passMs: [t1 - t0, t2 - t1, t3 - t2],
    },
  };
}

/** Synchronous wrapper for receipts and tools. */
export function bakeHorizonRelief(
  input: HorizonReliefBakeInput, field: HorizonReliefField, sun: readonly [number, number, number],
  size?: { width: number; height: number },
): HorizonReliefBake {
  const steps = bakeHorizonReliefSteps(input, field, sun, size);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
