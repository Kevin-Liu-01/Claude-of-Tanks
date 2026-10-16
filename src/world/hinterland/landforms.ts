// src/world/hinterland/landforms.ts — the near ranges' landform primitives in world space (the field's term 4; HL-2,
// the horizons stream, 2026-10-13; B-architecture §4.5).
//
// The old ring carved its forms on polar columns (massif and escarpment knobs on ring rows, table caps, a dam canyon
// cut through the ring). The Hinterland places each landform in the world, where the real place has it, in its own
// frame (centre, strike, length, width) with its own geology, so mountains have real form: strata that line up across
// faces, scree under the walls, snow on the slopes that hold it, forest belts by altitude. The primitives, harvested
// from the ring and the battlefield so near and far are one geology (P1):
//   ridge / swell     a crest line along its strike, its summits and saddles, gullies down its flanks;
//   massif            a mountain mass at mountain slopes: a domed section with its talus apron, the ridged multifractal's
//                     crests and cols, Clay John's erosion octaves (horizonMassif.ts) carving its couloirs;
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
import { erosionOctave } from '../horizonMassif.ts';
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
  /** Profile at world (x, z) and local (u, v): 0..1 (times h); `texelM` the bake's sample (finer detail left out). */
  profile(u: number, v: number, x: number, z: number, texelM?: number): number;
  /** 0..1 in a gully at local (u, v) (a massif's erosion gullies; 1..2 in an authored couloir's throat; absent: none). */
  gully?(u: number, v: number): number;
  /** A massif's summit at local (u, v): `top` 0..1 within its top 80–150 m, `crest` 0..1 on an arête's knife edge. */
  summit?(u: number, v: number): { top: number; crest: number };
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
    // (a notched crest: sharp minor peaks where a ridged octave crests, real cols between — round 5's edge-s)
    const crest = cfg.notched
      ? 0.5 + 0.5 * Math.pow(1 - Math.abs(noise2(u / Math.max(160, f.halfL * 0.22) + ox, oz)), 1.6) * (0.85 + 0.15 * fbm2(u / 90 + oz, ox, 2))
      : 0.74 + 0.26 * fbm2(u / Math.max(180, f.halfL * 0.45) + ox, oz, 3);
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
 * A massif: a mountain mass whose faces stand at mountain slopes, not curtains (HL-2b, the coordinator on the first
 * eye sheets: "the massif faces read as vertical curtains"; measured, their median slope was 66–76°, three quarters of
 * them over 60°). The mass is a broad domed section — a concave talus apron at its foot, its steepest slopes at
 * mid-height, a rounded shoulder under the crest — on which a ridged multifractal of falling slope (each octave half the
 * wavelength and under half the height) lays its crest lines, summits and cols, and Clay John's erosion octaves turned
 * by the slope cut the couloirs and gullies as a carving of a few tens of metres (never a multiplier on the whole
 * height: that stood every gully as a wall hundreds of metres high). A summit may still stand as a horn where the ridged
 * octaves meet; cliff bands are the escarpment's and the geology's (strata, bare rock on the steep), not the mass's.
 */
function placeMassif(cfg: HinterlandLandformConfig, salt: number, erosion: number, gullies: number): PlacedLandform {
  const f = frame(cfg, salt);
  const crestL = Math.max(450, Math.min(f.halfL, f.halfW) * 0.7);
  const [ox, oz] = seedOffset(salt, 21);
  const e = new Float64Array(3);
  // (a gully's sides stand under ~30° of its own: its depth a seventh of its spacing; bigger masses, wider couloirs)
  const gullyCell = (160 + 80 * (1 - gullies)) * (1 + Math.abs(cfg.heightM) / 2000);
  const gullyDepth = Math.min(0.14 * gullyCell, 0.045 * Math.abs(cfg.heightM)) * (0.4 + 0.6 * gullies);
  // (sharper ridged crests: arête-like lines, not swells — the coordinator on the rim-30 sheet's snow domes)
  const sharp = 1.45 + 0.3 * erosion;
  // the dominant summits: one, or two on a long mass, on the crest at seeded places along the strike
  // (one on a compact mass; along a long wall one every ~1.8 km, so its skyline breaks into peaks and cols — the near
  // walls of the Glacier frames read as table tops with one summit)
  // (an authored peak: the main summit where the map wants it and a lower shoulder either side, round 4)
  const authored = cfg.peak ?? null;
  const summitCount = authored ? 3 : Math.max(2, Math.min(4, Math.round(f.halfL / 900)));
  const summits: { u: number; v: number; r: number; h: number }[] = [];
  const summitAretes: number[][] = [];
  for (let k = 0; k < summitCount; k++) {
    const a = ((salt * (0.618 + k * 0.17)) % 1);
    if (authored) {
      const main = Math.max(-0.8, Math.min(0.8, authored.along));
      const along = k === 0 ? main : k === 1 ? Math.max(-0.85, main - 0.5) : Math.min(0.85, main + 0.55);
      summits.push({ u: along * f.halfL, v: 0, r: Math.max(300, Math.min(f.halfL, f.halfW) * 0.3),
        h: k === 0 ? (authored.share ?? 0.5) : k === 1 ? 0.3 : 0.24 });
    } else {
      const along = summitCount === 2 ? (k === 0 ? -0.55 : 0.15) + 0.4 * a
        : -0.72 + 1.44 * (k + 0.5) / summitCount + (a - 0.5) * (0.9 / summitCount);
      summits.push({ u: along * f.halfL, v: 0,
        r: Math.max(300, Math.min(f.halfL, f.halfW) * 0.28), h: [0.5, 0.36, 0.3, 0.26][k] });
    }
    // (the coordinator on the rim-30 sheet: "the massifs read as rounded snow domes ... Rochemelon and Ronce are sharp
    // pyramidal summits with arêtes") 2–4 arêtes, one of them down the crest along the strike, the rest spread round
    const n = 2 + Math.floor(((salt * 7.31 + k * 3.7) % 1) * 3);
    const aretes: number[] = [];
    for (let j = 0; j < n; j++) aretes.push((j * 2 * Math.PI) / n + (j ? (((salt * 1.37 + j * 0.71) % 1) - 0.5) * 0.6 : 0) + (k ? Math.PI : 0));
    summitAretes.push(aretes);
  }
  // (round 5) a gendarme: a slim rock tower on the main summit's crest arête, a little way along the strike
  if (authored?.gendarme && summits.length) {
    const s0 = summits[0];
    summits.push({ u: s0.u + 0.55 * s0.r, v: 0, r: Math.max(55, 0.16 * s0.r), h: 0.07 });
    summitAretes.push([0, Math.PI]);
  }
  const asym = authored?.asym && authored.asym > 0 ? authored.asym : 1;
  /** A summit's pyramid at local (u, v): its height (0..1 of its own), its top band and its arêtes' knife edges. */
  const SUMMIT = { peak: 0, top: 0, crest: 0 };
  const summitAt = (u: number, v: number): typeof SUMMIT => {
    SUMMIT.peak = 0; SUMMIT.top = 0; SUMMIT.crest = 0;
    for (let k = 0; k < summits.length; k++) {
      const s = summits[k];
      // (the main summit's block offset: one side steeper by `asym`, the other gentler)
      const du = ((u - s.u) / s.r) * (k === 0 && asym !== 1 ? (u > s.u ? asym : 1 / asym) : 1), dv = (v - s.v) / (s.r * 0.8);
      const dq = Math.hypot(du, dv);
      if (dq >= 1.4) continue;
      // the arêtes: knife-edged spurs (the faces between them fall at 1.25× the summit's mean, the arêtes at half)
      const phi = Math.atan2(dv, du);
      let ridge = 0, perp = Infinity;
      for (const a of summitAretes[k]) {
        const c = Math.cos(phi - a);
        if (c <= 0) continue;
        ridge = Math.max(ridge, c ** 24);
        perp = Math.min(perp, Math.abs(Math.sin(phi - a)) * dq * s.r);
      }
      // (an authored peak, seen broadside, is its arête along the crest: that arête falls at four-fifths of its faces'
      // mean, not half, and its faces run straight to the apex — the round-4 Mont Froid rounded to a dome at 0.78)
      const dqe = dq * (1.25 - (authored ? 0.45 : 0.75) * ridge);
      if (dqe >= 1) continue;
      // a pyramid's straight faces to a sharp apex (the old (1 − q)^1.5 rounded it to a dome)
      // (an authored summit's straight faces carry a few metres of rib and hollow, so a coarse level never draws them as
      // flat triangles — corner-nw's "low-poly facets")
      const p = authored ? (1 - dqe) * (1 + 0.05 * noise2(u / 85 + ox, v / 85 - oz)) : Math.pow(1 - dqe, 0.78);
      if (s.h * p > SUMMIT.peak) {
        SUMMIT.peak = s.h * p;
        // its top 80–150 m (of the mass's height), and an arête's crest within ~14 m (the cornice's line)
        const peakM = s.h * Math.abs(cfg.heightM);
        SUMMIT.top = smoothstep(1 - 150 / peakM, 1 - 80 / peakM, p);
        SUMMIT.crest = dqe < 0.85 ? 1 - smoothstep(4, 14, perp) : 0;
      }
    }
    return SUMMIT;
  };
  // (a mass is a ridge with its summits along it, not one cone: its section is measured across the strike, the crest
  // running level along the middle half of its length before it falls to its ends)
  // (an authored peak's mass has no level middle: its crest falls from the summit to either end, round 4)
  const uPeak = authored ? summits[0].u : 0;
  // (round 5) the side facing the map (the sign of the map's centre in the local v), the headwall's share of the
  // height, the couloirs' places along the strike (seeded, spread over the middle of the face)
  const v0 = (0 - f.cx) * f.az - (0 - f.cz) * f.ax;
  const facing = cfg.headwall || cfg.couloirs ? (v0 >= 0 ? 1 : -1) : 0;
  const headwallH = cfg.headwall ? cfg.headwall.heightM / (Math.abs(cfg.heightM) || 1) : 0;
  const couloirAt: number[] = [];
  for (let c = 0; c < Math.max(0, Math.min(8, cfg.couloirs ?? 0)); c++) {
    const n = cfg.couloirs!;
    couloirAt.push((-0.62 + 1.24 * (c + 0.5) / n + (((salt * (0.37 + c * 0.13)) % 1) - 0.5) * (0.8 / n)) * f.halfL);
  }
  const massQ = (u: number, v: number): number => {
    const { q, theta } = roundQ(f, u, v, 0.18);
    const lu = Math.abs(u) / f.halfL, lv = Math.abs(v) / f.halfW;
    const wander = 1 + 0.18 * lobe(theta, f.salt * 0.013);
    if (authored && authored.tent !== false) return Math.hypot(lv, (u - uPeak) / (u >= uPeak ? f.halfL - uPeak : f.halfL + uPeak)) / wander;
    return Math.min(q, Math.hypot(lv, Math.max(0, lu - 0.3) / 0.7) / wander);
  };
  const placed = place(f, 'pos', (u, v, x, z, texelM = 0) => {
    const q = massQ(u, v);
    if (q >= 1) return 0;
    // the section: a talus apron (concave) from the toe, the steep mid-slopes, a rounded shoulder; its mean slope is the
    // massif's height over its half-width
    const t = 1 - q;
    // (above the apron the faces run nearly straight to the crest — the old sine shoulder rounded every mass into a
    // dome under its snow)
    const section = t < 0.35 ? 0.42 * (t / 0.35) ** 1.8 : 0.42 + 0.58 * ((t - 0.35) / 0.65) ** 0.85;
    // the ridged octaves: crests, summits and cols along the mass, their weight growing toward the top
    let sum = 0, amp = 1, weight = 1, norm = 0, qx = x / crestL + ox, qy = z / crestL + oz;
    for (let o = 0; o < 4; o++) {
      let r = 1 - Math.abs(noise2(qx, qy));
      r = Math.pow(r, sharp) * weight;
      weight = Math.max(0, Math.min(1, r * 1.1));
      sum += r * amp; norm += amp; amp *= 0.42;
      const nx = 1.6 * qx - 1.2 * qy, ny = 1.2 * qx + 1.6 * qy; qx = nx; qy = ny;
    }
    const ridged = sum / norm;
    // (HL-2c, the coordinator: "an even plateau crest with small pyramids sprinkled on top") the skyline's hierarchy: the
    // crest line rises and falls ±30 % along the strike, its cols real dips, and one or two dominant summits stand
    // 400–800 m-class over it (a third of the mass's height), each a pyramid on the crest with its shoulders below
    const crestLine = 0.48 * (1 + 0.4 * fbm2(u / (0.3 * f.halfL) + oz, ox * 0.37, 3));
    const peak = summitAt(u, v).peak;
    // (the ridged term carries more weight at the crest: a long wall's skyline breaks into teeth and notches, not a
    // table top — the Glacier CPU sheets)
    let h = section * (crestLine + 0.5 * (ridged - 0.5) * (0.3 + 0.7 * section * section)) + peak * section;
    // the gullies: two erosion octaves across the slope (the mass's radial fall), carving the mid-slopes
    // (a bake's coarse levels leave out couloirs finer than a third of their spacing: three samples a couloir or none)
    if (gullyDepth > 0 && q > 0.12 && q < 0.95 && !(texelM > gullyCell * 0.34)) h -= (gullyDepth / Math.abs(cfg.heightM || 1)) * gullyCut(u, v, q, texelM);
    // (round 5) the side facing the map: its headwall — a cliff band rising from just above the apron, the face above it
    // lifted with it — and its couloirs, cut down through the band over their debris fans
    if (facing) {
      // (the facing side and its crest whole, the lift easing out down the back: a band on the face alone stood the
      // face in front of the summit and hid it)
      const side = smoothstep(-0.6 * f.halfW, 0, v * facing);
      if (side > 0) {
        if (headwallH > 0) {
          // (the band stands behind the summit's middle third of the face, falling away along the strike — one dark wall,
          // not a curtain across the whole view: round 5's first sheet stood the band 28° high from end to end)
          const tc = 0.36 + 0.035 * noise2(u / 520 + ox, oz * 0.7);
          const mid = 1 - smoothstep(0.1, 0.26, Math.abs(u - uPeak) / f.halfL);
          h += headwallH * side * mid * smoothstep(tc, tc + 0.06, t);
        }
        if (couloirAt.length && v * facing > 0) h += couloirRelief(u, t);
      }
    }
    return Math.max(0, h);
  });
  /** A couloir's cut (negative) down the face and its fan (positive) at the foot, in units of the mass's height. */
  function couloirRelief(u: number, t: number): number {
    const H = Math.abs(cfg.heightM) || 1;
    let r = 0;
    for (const uc0 of couloirAt) {
      // (a couloir wanders down the face, ±20 m: a line ruled straight read as a waterfall)
      const uc = uc0 + 20 * noise2(t * 7 + uc0 * 0.01, oz);
      const d = Math.abs(u - uc);
      // the throat: a V ~32 m each side, 26 m deep, from the headwall's foot to near the crest, tapering at both ends
      if (d < 32 && t > 0.33 && t < 0.88) r -= (26 / H) * (1 - d / 32) * smoothstep(0.33, 0.4, t) * (1 - smoothstep(0.76, 0.88, t));
      // the fan: a cone of debris ~130 m across at the throat's foot, 16 m at its apex
      const fanT = 0.3, dv = (t - fanT) * f.halfW, dd = Math.hypot(u - uc0, dv);
      if (dd < 130 && t < 0.38) r += (16 / H) * (1 - dd / 130) ** 1.6;
    }
    return r;
  }
  /** 0..1: how deep in a couloir (local u, v) at its radius q (0 on the spurs between them). */
  function gullyCut(u: number, v: number, q: number, texelM = 0): number {
    const lu = u / f.halfL, lv = v / f.halfW, rl = Math.hypot(lu, lv) || 1;
    // (the fall line is radial: the waves run across it, so their crests run down the face)
    const dx = (lu / rl) * 2.4, dz = (lv / rl) * 2.4;
    erosionOctave(u / gullyCell + ox, v / gullyCell + oz, -dz, dx, (salt * 7919) >>> 0, e);
    let g = e[0];
    if (!(texelM > gullyCell * 0.17)) {
      erosionOctave(u / (gullyCell * 0.5) + oz, v / (gullyCell * 0.5) + ox, -dz * 2, dx * 2, (salt * 104729) >>> 0, e);
      g += 0.5 * e[0];
    }
    const face = smoothstep(0.12, 0.35, q) * (1 - smoothstep(0.8, 0.95, q));
    return face * Math.max(0, Math.min(1, 0.5 - 0.5 * g));
  }
  placed.gully = (u, v) => {
    const q = massQ(u, v);
    if (q >= 1) return 0;
    let g = gullyDepth > 0 ? gullyCut(u, v, q) : 0;
    // (a couloir's throat is a gully full of snow)
    if (facing && couloirAt.length && v * facing > 0) {
      const t = 1 - q;
      // (marked over 1: the geology fills a couloir's throat with snow, not every erosion gully's)
      // (its snow broken by rock steps down the throat, narrower than the cut)
      for (const uc0 of couloirAt) {
        const uc = uc0 + 20 * noise2(t * 7 + uc0 * 0.01, oz), d = Math.abs(u - uc);
        if (d < 20 && t > 0.34 && t < 0.86 && noise2(t * 23 + uc0 * 0.03, ox) > -0.35) g = Math.max(g, 2 - d / 20);
      }
    }
    return g;
  };
  placed.summit = (u, v) => { const s = summitAt(u, v); return { top: s.top, crest: s.crest }; };
  return placed;
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
    // (a wide scarp's alcoves grow with it but stay a few hundred metres: at 0.08 of a 3.8 km half-width over 180 m
    // waves Whiteout's coast fall zigzagged in the plan, HOR-05)
    const edge = Math.min(0.08 * f.halfW, 140) * fbm2(u / Math.max(180, 0.12 * f.halfW) + ox, oz, 3) - 0.35 * f.halfW;
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
    const rimQ = 0.72, floor = Math.max(0, Math.min(0.5, cfg.floor ?? 0.08)), wall = Math.max(0.03, Math.min(0.4, cfg.wall ?? 0.12));
    if (q < rimQ) return floor + (1 - floor) * smoothstep(rimQ - wall, rimQ, q);
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
      case 'massif': placed.push(placeMassif(cfg, salt, erosion, gullies)); break;
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
  // (one scratch pair, no allocation per query)
  const UV: [number, number] = [0, 0];
  const local = (L: PlacedLandform, x: number, z: number): [number, number] | null => {
    if (x < L.minX || x > L.maxX || z < L.minZ || z > L.maxZ) return null;
    const dx = x - L.cx, dz = z - L.cz;
    const u = dx * L.ax + dz * L.az, v = dx * L.az - dz * L.ax;
    if (Math.abs(u) > L.halfL || Math.abs(v) > L.halfW) return null;
    UV[0] = u; UV[1] = v;
    return UV;
  };
  // (the last point's dominant landform and its profile, for the geology hook that follows a height query)
  return {
    heightAt(x: number, z: number, _base: number, texelM = 0): number {
      let pos = 0, neg = 0, keep = 1;
      for (let i = 0; i < placed.length; i++) {
        const L = placed[i];
        const uv = local(L, x, z);
        if (!uv) continue;
        const p = L.profile(uv[0], uv[1], x, z, texelM);
        if (p <= 0) continue;
        if (L.mode === 'notch') keep = Math.min(keep, 1 - L.h * p);
        else {
          const a = L.h * p;
          if (a > pos) pos = a; else if (a < neg) neg = a;
        }
      }
      return pos * keep + neg;
    },
    geologyAt(x: number, z: number, out: HinterlandGeologySample, slopeDeg = 30): number {
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
      if (best.gully) {
        const uv = local(best, x, z);
        if (uv) out.gully = Math.max(out.gully, best.gully(uv[0], uv[1]));
      }
      if (best.summit) {
        const uv = local(best, x, z);
        if (uv) {
          // a summit's top 80–150 m: bare rock where steeper than ~40°, the snow off it; its arêtes' crests hold their
          // cornices (a white knife edge over the dark faces, as the Ronce and Rochemelon ridges read from the col)
          const sm = best.summit(uv[0], uv[1]);
          const bare = sm.top * smoothstep(34, 42, slopeDeg);
          out.rock = Math.max(out.rock, bare);
          out.snowHold *= 1 - bare;
          out.snow *= 1 - bare;
          if (sm.crest > 0) {
            out.snowHold = Math.max(out.snowHold, sm.crest);
            out.snow = Math.max(out.snow, 0.95 * sm.crest);
            out.rock *= 1 - sm.crest;
          }
        }
      }
      // a bare mountain's steep upper faces: bare rock past ~46° (round 5: the bedding and its snow ledges are drawn by
      // the land's material on the faces past 50–56° — the atlas's 55 m bands of rock and ledge snow striped the
      // shoulders at its 24–96 m texels, "the uniform dashes read as contour lines"; the shoulders keep the region's
      // snow, scree and forest)
      if (best.cfg.kind === 'massif' || best.cfg.kind === 'ridge') {
        const H = Math.abs(best.cfg.heightM) || 1;
        const w = smoothstep(0.16 * H, 0.3 * H, bestA) * smoothstep(42, 50, slopeDeg);
        if (w > 0) {
          out.rock = Math.max(out.rock, w);
          out.snow *= 1 - w;
          out.snowHold *= 1 - w;
        }
      }
      // (a couloir's throat holds snow down through the rock)
      if (out.gully > 1.4) {
        out.snow = Math.max(out.snow, 0.95);
        out.snowHold = Math.max(out.snowHold, 1);
        out.rock *= 0.2;
      }
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
        // (held by the slope like the region's: a landform's snow never lies on its walls, HL-2b)
        out.snow = Math.max(out.snow, smoothstep(g.snow.lineM - 30, g.snow.lineM + 40, bestA) * out.snowHold);
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
