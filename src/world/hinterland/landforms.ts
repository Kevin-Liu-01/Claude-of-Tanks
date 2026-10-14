// src/world/hinterland/landforms.ts — the near ranges' landform primitives in world space (the field's term 4; HL-2,
// the horizons stream, 2026-10-13; B-architecture §4.5).
//
// The old ring carved its forms on polar columns (massif and escarpment knobs on ring rows, table caps, a dam canyon
// cut through the ring). The Hinterland places each landform in the world, where the real place has it, in its own
// frame (centre, strike, length, width) with its own geology, so mountains have real form: strata that line up across
// faces, scree under the walls, snow on the slopes that hold it, forest belts by altitude. The primitives, harvested
// from the ring and the battlefield so near and far are one geology (P1):
//   ridge / swell     a crest line along its strike, its summits and saddles, gullies down its flanks;
//   massif            a mountain mass eroded by the mountains lane's drainage (horizonMassif.ts createMassifField: smooth
//                     base, Clay John's erosion octaves, concavity), domed under its footprint;
//   escarpment        a bed stair along its strike (horizonEscarpment.ts's beds: ledge, riser, talus), the plateau behind;
//   mesa / butte      a caprock table on a talus apron (landformGeology.ts inselbergSection with a rim and bedding tiers);
//   inselberg         a bornhardt (inselbergSection without a rim); jebel: a sheer fluted jebel with a bossed cap
//                     (inselbergSection with its rim, the flutes setting the wall back, the cap's bosses);
//   cone / caldera    a volcano with its crater / a rim escarpment round a floor (Caldera's missing story);
//   canyon / valley   negative forms: a stepped trench / a broad trough; notch: opens a wall so the far country shows;
//   dam               a canyon with its wall across (the dam's structure is a planner vertical);
//   dike              a level crown over 1-in-3 batters (HL-1);
//   frozenRing        an excellent map's old skyline kept as a landform (HL-DEL's freeze tool, §7.3; no-op until then).
// Positive forms combine by their maximum (two crests meeting keep one), negative forms cut by their minimum, notches
// scale the positive forms down inside them, so authoring order never matters. Each primitive is pure and allocation-
// free; its geology hook tells the land material where its own rock, strata, snow and forest belt govern.
import { inselbergSection } from '../landformGeology.ts';
import { createMassifField, erosionOctave, type MassifField } from '../horizonMassif.ts';
import type { HinterlandGeologySample, HinterlandReliefTerm } from './field.ts';
import { fbm2, hashString, noise2, seedOffset, smoothstep } from './noise.ts';
import { hinterlandPoint, type HinterlandLandformConfig, type HinterlandSpec } from './spec.ts';

/** One placed landform: its frame and its profile, evaluated in its own (u along the strike, v across) coordinates. */
interface PlacedLandform {
  cfg: HinterlandLandformConfig;
  cx: number; cz: number;
  /** The strike as a unit vector (world XZ). */
  ax: number; az: number;
  halfL: number; halfW: number;
  /** The world bounding box. */
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Height (signed) and a salt for its noise. */
  h: number; salt: number;
  /** 'pos' adds by maximum, 'neg' cuts by minimum, 'notch' scales the positive forms down. */
  mode: 'pos' | 'neg' | 'notch';
  /** Profile at world (x, z) and local (u, v): 0..1 (times h). */
  profile(u: number, v: number, x: number, z: number): number;
  /** The landform's own geology, merged where it stands (null: the region's). */
  geology: HinterlandLandformConfig['geology'] | null;
  forest: readonly [number, number] | null;
  bare: boolean;
}

const BATTER = 3; // a dike's batter, 1 in 3
const TAU = Math.PI * 2;

type Frame = Omit<PlacedLandform, 'profile' | 'minX' | 'maxX' | 'minZ' | 'maxZ' | 'mode' | 'geology' | 'forest' | 'bare'>;

function frame(cfg: HinterlandLandformConfig, salt: number): Frame {
  const p = hinterlandPoint(cfg.at);
  const strike = ((cfg.strikeDeg ?? 0) * Math.PI) / 180;
  const length = cfg.lengthM ?? cfg.widthM ?? 600;
  const width = cfg.widthM ?? length * 0.5;
  return { cfg, cx: p.x, cz: p.z, ax: Math.sin(strike), az: Math.cos(strike), halfL: length / 2, halfW: width / 2, h: cfg.heightM, salt };
}

function place(f: Frame, mode: PlacedLandform['mode'], profile: PlacedLandform['profile']): PlacedLandform {
  const ex = Math.abs(f.ax) * f.halfL + Math.abs(f.az) * f.halfW, ez = Math.abs(f.az) * f.halfL + Math.abs(f.ax) * f.halfW;
  return {
    ...f, minX: f.cx - ex, maxX: f.cx + ex, minZ: f.cz - ez, maxZ: f.cz + ez, mode, profile,
    geology: f.cfg.geology ?? null, forest: f.cfg.cover?.forest ?? null, bare: f.cfg.cover?.bare === true,
  };
}

/** A smooth wander round a round form's bearing in [-1, 1] (maps lane A's lobe: four harmonics, falling amplitude). */
function lobe(theta: number, salt: number): number {
  let sum = 0;
  for (let k = 2; k <= 5; k++) sum += Math.sin(k * theta + TAU * ((salt * (k + 1) * 0.618) % 1)) / (k - 1);
  return sum / 2.0833333;
}

/** A round form's normalised radius q (0 at the centre, 1 at the toe) in its own ellipse, its rim wandering by `vary`. */
function roundQ(f: Frame, u: number, v: number, vary: number): { q: number; theta: number } {
  const lu = u / f.halfL, lv = v / f.halfW;
  const theta = Math.atan2(lv, lu);
  const q = Math.hypot(lu, lv) / (1 + vary * lobe(theta, f.salt * 0.013));
  return { q, theta };
}

/** A dike: a level crown (crown.widthM, default 5 m) over 1-in-3 batters, straight along its strike, eased off at its ends. */
function placeDike(cfg: HinterlandLandformConfig, salt: number): PlacedLandform {
  const f = frame(cfg, salt);
  const crown = (cfg.crown?.widthM ?? 5) / 2;
  const foot = crown + BATTER * Math.abs(cfg.heightM);
  f.halfW = Math.max(f.halfW, foot);
  return place(f, 'pos', (u, v) => {
    const end = 1 - smoothstep(f.halfL - 30, f.halfL, Math.abs(u));
    const av = Math.abs(v);
    if (av <= crown) return end;
    const t = 1 - (av - crown) / (foot - crown);
    return t <= 0 ? 0 : end * t * t * (3 - 2 * t);
  });
}

/** A ridge (or a swell): a crest along its strike, its summits and saddles, gullies down its flanks. */
function placeRidge(cfg: HinterlandLandformConfig, salt: number, erosion: number, gullies: number): PlacedLandform {
  const f = frame(cfg, salt);
  const [ox, oz] = seedOffset(salt, 3);
  const e = new Float64Array(3);
  const cell = Math.max(60, Math.min(260, f.halfW * 0.5));
  return place(f, 'pos', (u, v) => {
    const tu = Math.abs(u) / f.halfL;
    if (tu >= 1) return 0;
    const crest = 0.74 + 0.26 * fbm2(u / Math.max(180, f.halfL * 0.45) + ox, oz, 3);
    const along = 1 - smoothstep(0.55, 1, tu);
    const wander = 0.12 * f.halfW * noise2(u / Math.max(200, f.halfL * 0.6) + oz, ox);
    const sv = (v - wander) / f.halfW, tv = Math.abs(sv);
    if (tv >= 1) return 0;
    const round = (1 - tv * tv) * (1 - tv * tv);
    const sharp = Math.pow(1 - tv, 1.6);
    let p = crest * along * (round * (1 - erosion) + sharp * erosion);
    if (gullies > 0 && tv > 0.15) {
      // the gullies run down the flanks: waves across the slope (their phase along the strike)
      erosionOctave(u / cell + ox, v / cell + oz, Math.sign(sv) * 2.2, 0, (salt * 7919) >>> 0, e);
      p *= 1 + gullies * 0.22 * e[0] * smoothstep(0.15, 0.45, tv);
    }
    return p;
  });
}

/**
 * A massif: Quilez's eroded multifractal under a domed mask — the ridged octaves give its crests, spurs and summits
 * (the panorama's macro field, so a near massif and the far ranges are one law), and the mountains lane's drainage
 * (horizonMassif.ts createMassifField: Clay John's erosion octaves turned by the slope) cuts its couloirs and gullies.
 */
function placeMassif(cfg: HinterlandLandformConfig, salt: number, erosion: number, gullies: number, seed: number): PlacedLandform {
  const f = frame(cfg, salt);
  const dist = cfg.at.distM;
  const span = Math.max(f.halfL, f.halfW);
  const crestL = Math.max(500, Math.min(2200, Math.min(f.halfL, f.halfW) * 0.9));
  const [ox, oz] = seedOffset(salt, 21);
  const field: MassifField = createMassifField((seed ^ salt) >>> 0, {
    baseWavelengthM: Math.max(420, crestL * 0.6), gullyWavelengthM: 140 + 90 * (1 - gullies), gullyOctaves: 3, gullyGain: 0.5,
    slopeStrength: 2.8, branch: 2.2, erosion: 0.45 + 0.4 * erosion, concavity: 1.2 + 0.4 * erosion, contrast: 0.45 + 0.3 * gullies, smoothM: 0,
  }, [Math.max(0, dist - span), dist + span]);
  return place(f, 'pos', (u, v, x, z) => {
    const { q } = roundQ(f, u, v, 0.22);
    if (q >= 1) return 0;
    const dome = Math.pow(1 - q * q, 0.9);
    // the ridged multifractal (sharper with erosion): crest lines with summits and cols between them
    let sum = 0, amp = 1, weight = 1, norm = 0, qx = x / crestL + ox, qy = z / crestL + oz;
    const sharp = 1.15 + 0.5 * erosion;
    for (let o = 0; o < 5; o++) {
      let r = 1 - Math.abs(noise2(qx, qy));
      r = Math.pow(r, sharp) * weight;
      weight = Math.max(0, Math.min(1, r * 1.2));
      sum += r * amp; norm += amp; amp *= 0.5;
      const nx = 1.6 * qx - 1.2 * qy, ny = 1.2 * qx + 1.6 * qy; qx = nx; qy = ny;
    }
    const ridged = sum / norm;
    const shape = dome * (0.3 + 0.95 * Math.pow(ridged, 1.3)) * (0.75 + 0.25 * smoothstep(1, 0.3, q));
    return shape * field.multiplier(x, z);
  });
}

/** An escarpment: a bed stair along its strike, rising toward +v to the plateau behind; its edge wanders in alcoves
 * and spurs; each bed a ledge then a riser over its talus. */
function placeEscarpment(cfg: HinterlandLandformConfig, salt: number, bedM: number): PlacedLandform {
  const f = frame(cfg, salt);
  const [ox, oz] = seedOffset(salt, 9);
  const beds = Math.max(2, Math.min(9, Math.round(Math.abs(cfg.heightM) / Math.max(4, bedM * 3))));
  return place(f, 'pos', (u, v) => {
    const tu = Math.abs(u) / f.halfL;
    if (tu >= 1) return 0;
    const ends = 1 - smoothstep(0.7, 1, tu);
    // the scarp's line wanders (alcoves and spurs ~180 m), the face takes a third of the width, the plateau the rest
    const edge = 0.08 * f.halfW * fbm2(u / 180 + ox, oz, 3) - 0.35 * f.halfW;
    const t = (v - edge) / (0.4 * f.halfW);
    if (t <= 0) return 0;
    const back = 1 - smoothstep(0.85, 1, (v + f.halfW) / (2 * f.halfW));
    if (t >= 1) return ends * back;
    const k = Math.min(beds - 1, Math.floor(t * beds)), fr = t * beds - k;
    const ledge = 0.35, r = fr < ledge ? 0 : (fr - ledge) / (1 - ledge);
    const step = (k + r * r * (3 - 2 * r)) / beds;
    return ends * back * step;
  });
}

/** A table (mesa, butte) or an inselberg or a jebel: landformGeology.ts's section on its own wandering footprint. */
function placeTable(cfg: HinterlandLandformConfig, salt: number, kind: 'mesa' | 'butte' | 'inselberg' | 'jebel'): PlacedLandform {
  const f = frame(cfg, salt);
  const jebel = kind === 'jebel';
  const foot = kind === 'mesa' ? 0.74 : kind === 'butte' ? 0.62 : jebel ? 0.66 : 0.68;
  const apron = kind === 'mesa' ? 0.32 : kind === 'butte' ? 0.28 : jebel ? 0.18 : 0.16;
  const rim = kind === 'inselberg' ? 0 : jebel ? 0.86 : 0.9;
  const tiers = kind === 'mesa' || kind === 'butte' ? 2 : 0;
  const flutes = jebel ? 18 : 0;
  return place(f, 'pos', (u, v) => {
    const { q, theta } = roundQ(f, u, v, kind === 'inselberg' ? 0.08 : 0.16);
    if (q >= 1) return 0;
    // a jebel's flutes set the wall back in vertical grooves round it
    const notch = flutes ? Math.pow(Math.max(0, Math.cos(theta * flutes + f.salt)), 2) : 0;
    const wall = foot * (1 - notch * 0.5 * (1 - rim));
    let s = inselbergSection(q, wall, apron, 4, rim, rim > 0 ? (jebel ? 0.08 : 0.015) : 0.08, tiers, 0.3);
    if (jebel && q < wall * rim) {
      // the cap's bosses: rounded domes inside the rim
      const lu = u / f.halfL, lv = v / f.halfW;
      let boss = 0;
      for (let k = 0; k < 4; k++) {
        const ba = TAU * (((f.salt + k * 41) * 0.618) % 1), br = Math.sqrt(((f.salt * 0.37 + k * 0.29) % 1)) * wall * rim * 0.6;
        const radius = wall * rim * 0.34;
        const bd = Math.hypot(lu - Math.cos(ba) * br, lv - Math.sin(ba) * br) / radius;
        if (bd < 1) boss = Math.max(boss, (1 - bd * bd) * (1 - bd * bd));
      }
      s += 0.12 * boss;
    }
    return s;
  });
}

/** A volcanic cone with its crater (concave flanks, a crater a sixth of its width across). */
function placeCone(cfg: HinterlandLandformConfig, salt: number): PlacedLandform {
  const f = frame(cfg, salt);
  return place(f, 'pos', (u, v) => {
    const { q } = roundQ(f, u, v, 0.06);
    if (q >= 1) return 0;
    const flank = Math.pow(1 - q, 1.35);
    const crater = 0.18 * (1 - smoothstep(0, 0.14, q));
    return Math.max(0, flank - crater);
  });
}

/** A caldera: a rim wall round a sunken floor — a steep inner escarpment, a gentle outer slope. */
function placeCaldera(cfg: HinterlandLandformConfig, salt: number): PlacedLandform {
  const f = frame(cfg, salt);
  return place(f, 'pos', (u, v) => {
    const { q } = roundQ(f, u, v, 0.1);
    if (q >= 1) return 0;
    const rimQ = 0.72;
    if (q < rimQ) return 0.08 + 0.92 * smoothstep(rimQ - 0.12, rimQ, q);
    return Math.pow(1 - (q - rimQ) / (1 - rimQ), 1.6);
  });
}

/** A canyon (or a dam's canyon): a stepped trench along the strike, its floor a fifth of its width. */
function placeCanyon(cfg: HinterlandLandformConfig, salt: number, bedM: number): PlacedLandform {
  const f = frame(cfg, salt);
  const [ox, oz] = seedOffset(salt, 13);
  const beds = Math.max(2, Math.min(7, Math.round(Math.abs(cfg.heightM) / Math.max(6, bedM * 3))));
  return place(f, 'neg', (u, v) => {
    const tu = Math.abs(u) / f.halfL;
    if (tu >= 1) return 0;
    const ends = 1 - smoothstep(0.8, 1, tu);
    const wander = 0.15 * f.halfW * noise2(u / 420 + ox, oz);
    const t = Math.abs(v - wander) / f.halfW;
    if (t >= 1) return 0;
    if (t < 0.2) return ends;
    const w = (t - 0.2) / 0.8, k = Math.min(beds - 1, Math.floor(w * beds)), fr = w * beds - k;
    const r = fr < 0.4 ? 0 : (fr - 0.4) / 0.6;
    return ends * (1 - (k + r * r * (3 - 2 * r)) / beds);
  });
}

/** A valley: a broad trough along the strike (a cosine section); a notch: the same footprint as a mask that opens walls. */
function placeTrough(cfg: HinterlandLandformConfig, salt: number, mode: 'neg' | 'notch'): PlacedLandform {
  const f = frame(cfg, salt);
  return place(f, mode, (u, v) => {
    const tu = Math.abs(u) / f.halfL, tv = Math.abs(v) / f.halfW;
    if (tu >= 1 || tv >= 1) return 0;
    return (1 - smoothstep(0.6, 1, tu)) * (0.5 + 0.5 * Math.cos(Math.PI * tv));
  });
}

/**
 * The landform term for a spec (the field's term 4), with its geology hook. Unknown kinds contribute nothing rather than
 * guessing a shape.
 */
export function createLandformRelief(spec: HinterlandSpec, seed: number): HinterlandReliefTerm | null {
  if (!spec.landforms.length) return null;
  const placeSeed = (seed ^ hashString(`hinterland-landforms:${spec.mapId}`)) >>> 0;
  const placed: PlacedLandform[] = [];
  spec.landforms.forEach((cfg) => {
    // (the salt is the landform's own, from what it is and where it stands, never its place in the list: authoring order
    // and a new landform beside it move nothing)
    const salt = ((placeSeed ^ hashString(`${cfg.kind}:${cfg.at.azDeg}:${cfg.at.distM}:${cfg.heightM}`)) >>> 0) % 9973;
    const erosion = cfg.geology?.erosion ?? spec.geology.erosion;
    const gullies = cfg.geology?.gullies ?? spec.geology.gullies;
    const bedM = cfg.geology?.strata?.bedM ?? spec.geology.strata.bedM;
    switch (cfg.kind) {
      case 'dike': placed.push(placeDike(cfg, salt)); break;
      case 'ridge': placed.push(placeRidge(cfg, salt, erosion, gullies)); break;
      case 'massif': placed.push(placeMassif(cfg, salt, erosion, gullies, seed)); break;
      case 'escarpment': placed.push(placeEscarpment(cfg, salt, bedM || 8)); break;
      case 'mesa': case 'butte': case 'inselberg': case 'jebel': placed.push(placeTable(cfg, salt, cfg.kind)); break;
      case 'cone': placed.push(placeCone(cfg, salt)); break;
      case 'caldera': placed.push(placeCaldera(cfg, salt)); break;
      case 'canyon': case 'dam': placed.push(placeCanyon({ ...cfg, heightM: -Math.abs(cfg.heightM) }, salt, bedM || 8)); break;
      case 'valley': placed.push(placeTrough({ ...cfg, heightM: -Math.abs(cfg.heightM) }, salt, 'neg')); break;
      case 'notch': placed.push(placeTrough({ ...cfg, heightM: Math.min(1, Math.abs(cfg.heightM) / 100) }, salt, 'notch')); break;
      default: break; // frozenRing: HL-DEL's freeze tool
    }
  });
  if (!placed.length) return null;
  const local = (L: PlacedLandform, x: number, z: number): [number, number] | null => {
    if (x < L.minX || x > L.maxX || z < L.minZ || z > L.maxZ) return null;
    const dx = x - L.cx, dz = z - L.cz;
    const u = dx * L.ax + dz * L.az, v = dx * L.az - dz * L.ax;
    return Math.abs(u) > L.halfL || Math.abs(v) > L.halfW ? null : [u, v];
  };
  // (the last point's dominant landform and its profile, for the geology hook that follows a height query)
  return {
    heightAt(x: number, z: number): number {
      let pos = 0, neg = 0, keep = 1;
      for (let i = 0; i < placed.length; i++) {
        const L = placed[i];
        const uv = local(L, x, z);
        if (!uv) continue;
        const p = L.profile(uv[0], uv[1], x, z);
        if (p <= 0) continue;
        if (L.mode === 'notch') keep = Math.min(keep, 1 - L.h * p);
        else {
          const a = L.h * p;
          if (a > pos) pos = a; else if (a < neg) neg = a;
        }
      }
      return pos * keep + neg;
    },
    geologyAt(x: number, z: number, out: HinterlandGeologySample): number {
      // the landform standing highest here governs its geology (its rock, strata, snow, forest belt)
      let best: PlacedLandform | null = null, bestA = 0, bestP = 0;
      for (let i = 0; i < placed.length; i++) {
        const L = placed[i];
        if (L.mode !== 'pos') continue;
        const uv = local(L, x, z);
        if (!uv) continue;
        const p = L.profile(uv[0], uv[1], x, z);
        if (p * L.h > bestA) { bestA = p * L.h; best = L; bestP = p; }
      }
      if (!best) return 0;
      const g = best.geology;
      if (g?.rockHex !== undefined) out.rockHex = g.rockHex;
      if (g?.strata?.bedM) out.strata = (bestA + (g.strata.dipDeg ?? 0) * 0.01 * (x - best.cx)) / g.strata.bedM;
      if (best.bare) out.forest = 0;
      else if (best.forest) {
        // the forest belt: from its low to its high height above the landform's foot, thinning past the top
        const [lo, hi] = best.forest;
        out.forest = smoothstep(lo - 10, lo + 10, bestA) * (1 - smoothstep(hi - 25, hi + 25, bestA));
      }
      if (g?.snow?.lineM !== undefined) {
        out.snow = Math.max(out.snow, smoothstep(g.snow.lineM - 30, g.snow.lineM + 40, bestA));
      }
      return bestP;
    },
  };
}

/** The placed dikes' crowns as polylines (the planner lays their roads and tree rows along them). */
export function dikeCrowns(spec: HinterlandSpec): { xs: number[]; zs: number[]; road: boolean; trees: string | null; name?: string }[] {
  const out: { xs: number[]; zs: number[]; road: boolean; trees: string | null; name?: string }[] = [];
  for (const cfg of spec.landforms) {
    if (cfg.kind !== 'dike') continue;
    const f = frame(cfg, 0);
    const xs: number[] = [], zs: number[] = [];
    const end = f.halfL - 34;
    for (let u = -end; u <= end + 1e-6; u += Math.max(20, (2 * end) / 64)) { xs.push(f.cx + f.ax * u); zs.push(f.cz + f.az * u); }
    out.push({ xs, zs, road: !!cfg.crown?.road, trees: cfg.crown?.trees ?? null, name: cfg.name });
  }
  return out;
}

/** A landform kind's profile at a local point, for the receipts (the profile law pinned per primitive). */
export function landformProfileAt(cfg: HinterlandLandformConfig, u: number, v: number, seed = 1337): number {
  const relief = createLandformRelief({ mapId: 'probe', landforms: [cfg], geology: {
    rock: 'granite', rockHex: 0, strata: { bedM: 8, dipDeg: 0, contrast: 0 }, scree: 0, snow: { lineM: Infinity, maxSlopeDeg: 0, scour: 0 },
    gullies: 0, erosion: 0.3, rockSlopeDeg: 30, forestBandM: [0, 0], sand: 0, varnish: 0,
  } } as unknown as HinterlandSpec, seed);
  const p = hinterlandPoint(cfg.at);
  const strike = ((cfg.strikeDeg ?? 0) * Math.PI) / 180;
  const x = p.x + Math.sin(strike) * u + Math.cos(strike) * v, z = p.z + Math.cos(strike) * u - Math.sin(strike) * v;
  return relief ? relief.heightAt(x, z, 0) : 0;
}
