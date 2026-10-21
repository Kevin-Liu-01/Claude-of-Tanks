// src/world/hinterland/far.ts — the far country and the distant ranges by sector (the field's term 5; HL-2, the
// horizons stream, 2026-10-13; B-architecture §4.6).
//
// The panorama baked its far country from one eye at the centre onto a shell 2.6 km out; its region vocabulary won
// wave 24 (+1.16: the gain came from geography, not from the bake). That vocabulary and its terrain-field maths move
// here, as geometry at their true distance: the JS twin of the panorama's FIELD_GLSL (horizonPanorama.ts — the eroded
// ridged multifractal, the mid-scale fBm with derivative damping, Clay John's gully octaves across the slope, the mesa
// tables with their talus and caprock, the isolated peaks of a volcanic field or an ice sheet, the sheer fluted jebels,
// the flat countries' tree lines) with each class's own numbers (HORIZON_PANORAMA_REGIONAL and the relief characters,
// harvested below, three-free). What the panorama could not have: the far country is never capped by the cloud deck (it
// stands into it and the clouds cover it physically, §4.7), a sector's `layers` place successive ridgelines at authored
// distances so each clears the one in front on some bearings, and a sector may stand anywhere to 80 km (band E). A map
// authors its sectors in its block (`far`); the region supplies one all round by default. Octaves finer than the
// bake's sample are left out (texelM), so the 512 m limb level costs a fraction of the 16 m one.
import type { HinterlandReliefTerm } from './field.ts';
import { hash12, hashString, noise2, noised, seedOffset, smoothstep } from './noise.ts';
import { arcWeight, hinterlandBearing, type HinterlandFarForm, type HinterlandFarSectorConfig, type HinterlandSpec } from './spec.ts';

/** A far form's vocabulary (the panorama character's terrain knobs; amplitudes come from the sector's relief). */
interface FarCharacter {
  foot: number; macroL: number; sharp: number; midL: number; gullyL: number; gullyM: number; warpM: number;
  valley: number; valleyL: number; tables: boolean; trees: number;
  mesaTalusM: number; mesaTalusShare: number; mesaCliffM: number; mesaFluteM: number;
  peakShare: number; peakM: number; peakRadiusM: number; peakSharp: number;
  jebelShare: number; jebelM: number; jebelRadiusM: number; jebelFoot: number; jebelRim: number; jebelApron: number;
  jebelFlutes: number; jebelFluteDepth: number; jebelBossM: number; jebelFootVary: number;
}

const BASE: Omit<FarCharacter, 'foot' | 'macroL' | 'sharp' | 'midL' | 'gullyL' | 'gullyM' | 'warpM' | 'valley' | 'valleyL' | 'tables'> = Object.freeze({
  trees: 0, mesaTalusM: 700, mesaTalusShare: 0.55, mesaCliffM: 50, mesaFluteM: 45,
  peakShare: 0, peakM: 0, peakRadiusM: 600, peakSharp: 1.5,
  jebelShare: 0, jebelM: 0, jebelRadiusM: 900, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18,
  jebelFlutes: 16, jebelFluteDepth: 0.5, jebelBossM: 0, jebelFootVary: 0.14,
});
const ch = (c: Partial<FarCharacter>): FarCharacter => Object.freeze({ ...BASE, ...c } as FarCharacter);

/** The far forms, harvested from horizonPanorama.ts (HORIZON_PANORAMA_REGIONAL and HORIZON_PANORAMA_CHARACTERS). */
export const FAR_FORMS: Readonly<Record<HinterlandFarForm, FarCharacter>> = Object.freeze({
  plain: ch({ foot: 0.6, macroL: 5000, sharp: 1.0, midL: 1800, gullyL: 600, gullyM: 4, warpM: 900, valley: 0.2, valleyL: 8000, tables: false, trees: 18 }),
  erg: ch({ foot: 0.7, macroL: 2400, sharp: 1.0, midL: 900, gullyL: 600, gullyM: 0, warpM: 700, valley: 0.15, valleyL: 6000, tables: false }),
  upland: ch({ foot: 0.35, macroL: 5200, sharp: 0.9, midL: 1700, gullyL: 500, gullyM: 18, warpM: 1000, valley: 0.3, valleyL: 8000, tables: false, trees: 14 }),
  forested: ch({ foot: 0.22, macroL: 4600, sharp: 1.2, midL: 1400, gullyL: 420, gullyM: 45, warpM: 900, valley: 0.4, valleyL: 7000, tables: false }),
  karstRidge: ch({ foot: 0.24, macroL: 5400, sharp: 1.3, midL: 1500, gullyL: 450, gullyM: 55, warpM: 1100, valley: 0.35, valleyL: 8500, tables: false }),
  ridges: ch({ foot: 0.25, macroL: 3800, sharp: 0.95, midL: 1500, gullyL: 380, gullyM: 30, warpM: 700, valley: 0.5, valleyL: 6000, tables: false }),
  alpine: ch({ foot: 0.16, macroL: 5200, sharp: 1.45, midL: 1500, gullyL: 520, gullyM: 55, warpM: 900, valley: 0.4, valleyL: 7500, tables: false }),
  polar: ch({ foot: 0.18, macroL: 5800, sharp: 1.3, midL: 1700, gullyL: 560, gullyM: 45, warpM: 1000, valley: 0.4, valleyL: 8000, tables: false }),
  iceSheet: ch({ foot: 0.5, macroL: 6000, sharp: 1.0, midL: 2200, gullyL: 600, gullyM: 6, warpM: 1000, valley: 0.2, valleyL: 8000, tables: false,
    peakShare: 0.2, peakM: 320, peakRadiusM: 380, peakSharp: 2.2 }),
  tables: ch({ foot: 0.24, macroL: 6000, sharp: 1.0, midL: 2000, gullyL: 500, gullyM: 30, warpM: 900, valley: 0.3, valleyL: 7000, tables: true }),
  jebels: ch({ foot: 0.7, macroL: 2600, sharp: 1.0, midL: 1000, gullyL: 600, gullyM: 0, warpM: 700, valley: 0.15, valleyL: 6000, tables: false,
    jebelShare: 0.65, jebelM: 720, jebelRadiusM: 700, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18, jebelFlutes: 20, jebelFluteDepth: 0.8, jebelBossM: 110, jebelFootVary: 0.14 }),
  volcanicField: ch({ foot: 0.3, macroL: 4800, sharp: 1.0, midL: 1600, gullyL: 420, gullyM: 20, warpM: 800, valley: 0.3, valleyL: 7000, tables: false,
    peakShare: 0.35, peakM: 260, peakRadiusM: 800, peakSharp: 1.2 }),
  martian: ch({ foot: 0.24, macroL: 7000, sharp: 1.0, midL: 2400, gullyL: 600, gullyM: 35, warpM: 1100, valley: 0.5, valleyL: 8500, tables: true }),
  lunar: ch({ foot: 0.3, macroL: 6400, sharp: 0.85, midL: 2200, gullyL: 700, gullyM: 8, warpM: 1200, valley: 0.25, valleyL: 9000, tables: false }),
});

const ROT_A = 1.6, ROT_B = 1.2; // ROT = mat2(1.6, 1.2, -1.2, 1.6)
const N3 = new Float64Array(3);

/** How many octaves of wavelength L (halving each octave) show at a sample `texelM` (0: all `max`). */
function octavesFor(L: number, texelM: number, max: number): number {
  if (!(texelM > 0)) return max;
  return Math.max(1, Math.min(max, Math.floor(Math.log2(L / (2.2 * texelM))) + 1));
}

function macroField(qx: number, qy: number, sharp: number, octaves: number): number {
  let sum = 0, amp = 1, weight = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let v = 1 - Math.abs(noise2(qx, qy));
    v = Math.pow(v, sharp) * weight;
    weight = Math.max(0, Math.min(1, v * 1.15));
    sum += v * amp; norm += amp; amp *= 0.47;
    const nx = ROT_A * qx - ROT_B * qy, ny = ROT_B * qx + ROT_A * qy; qx = nx; qy = ny;
  }
  return sum / norm;
}

function midField(qx: number, qy: number, octaves: number): number {
  let a = 0, b = 1, norm = 0, dx = 0, dy = 0;
  for (let o = 0; o < octaves; o++) {
    noised(qx, qy, N3); dx += N3[1]; dy += N3[2];
    a += b * N3[0] / (1 + dx * dx + dy * dy); norm += b; b *= 0.5;
    const nx = ROT_A * qx - ROT_B * qy, ny = ROT_B * qx + ROT_A * qy; qx = nx; qy = ny;
  }
  return a / norm;
}

/** Clay John's erosion octave (FIELD_GLSL gullyOctave): cosines across the slope in jittered cells. */
function gullyOctave(px: number, py: number, dx: number, dy: number, seed: number): number {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  let va = 0, wt = 0;
  for (let j = -2; j <= 1; j++) for (let k = -2; k <= 1; k++) {
    const cx = ix - k, cy = iy - j;
    const hx = hash12(cx + seed, cy) * 0.5, hy = hash12(cx, cy + seed) * 0.5;
    const ppx = fx + k - hx, ppy = fy + j - hy;
    const w = Math.exp(-(ppx * ppx + ppy * ppy) * 2);
    wt += w; va += Math.cos((ppx * dx + ppy * dy) * 6.283185307179586) * w;
  }
  return va / wt;
}

/** A mesa table's section by its rim distance (FIELD_GLSL mesaRamp). */
function mesaRamp(sv: number, tw: number, cw: number, share: number): number {
  const t = smoothstep(-tw, 0, sv);
  return share * t * t + (1 - share) * smoothstep(0, cw, sv);
}

/** A sheer jebel's section (horizonPanorama.ts horizonJebelSection). */
function jebelSection(q: number, foot: number, apron: number, rim: number): number {
  if (q >= 1) return 0;
  const top = foot * rim;
  if (q <= top) return 1 - 0.08 * (q / top) ** 2;
  if (q <= foot) { const t = (q - top) / (foot - top); return apron + (0.92 - apron) * (1 - t * t * (3 - 2 * t)); }
  const t = (1 - q) / (1 - foot);
  return apron * t * t;
}

interface ResolvedSector {
  cfg: HinterlandFarSectorConfig;
  c: FarCharacter;
  innerM: number; outerM: number;
  off: number[];
  layerSalt: number;
}

/** The far term for a spec: its sectors (the region's all round by default), each a far form at its distances. */
export function createFarRelief(spec: HinterlandSpec, seed: number): HinterlandReliefTerm | null {
  const sectors: ResolvedSector[] = [];
  const placeSeed = (seed ^ hashString(`hinterland-far:${spec.mapId}`)) >>> 0;
  spec.far.forEach((cfg, i) => {
    if (!(cfg.reliefM > 0)) return;
    const offs: number[] = [];
    for (let k = 0; k < 8; k++) { const [a, b] = seedOffset(placeSeed + i * 13, 50 + k); offs.push(a * 0.37, b * 0.37); }
    const treesM = spec.region.far.treesM;
    const c = FAR_FORMS[cfg.form];
    sectors.push({ cfg, c: treesM !== c.trees ? { ...c, trees: treesM } : c, innerM: cfg.distKm[0] * 1000, outerM: cfg.distKm[1] * 1000, off: offs, layerSalt: i * 7.31 });
  });
  if (!sectors.length) return null;

  function sectorHeight(S: ResolvedSector, x: number, z: number, r: number, texelM: number): number {
    const c = S.c, A = S.cfg.reliefM, o = S.off;
    // the far country rises through its foot from 1.5 km inside its inner distance, and eases off past its outer one
    // (beyond it the region's own far plain runs on to the limb)
    const d = smoothstep(S.innerM - 1500, S.innerM + 600, r);
    if (d <= 0) return 0;
    const rise = (c.foot + (1 - c.foot) * d) * d * (1 - 0.65 * smoothstep(S.outerM, S.outerM * 1.5 + 2000, r));
    const wx = x + c.warpM * noise2(x / 3300 + o[2], z / 3300 + o[3]), wz = z + c.warpM * noise2(x / 3300 + o[4], z / 3300 + o[5]);
    const az = noise2(x / 11000 + o[8], z / 11000 + o[9]) * 0.5 + 0.5;
    const vf = Math.abs(noise2(wx / c.valleyL + o[10], wz / c.valleyL + o[11]));
    const valley = 1 - c.valley * (1 - smoothstep(0, 0.45, vf));
    const env = A * rise * (0.55 + 0.45 * smoothstep(0.15, 0.85, az)) * valley;
    const mo = octavesFor(c.macroL, texelM, 7), mi = octavesFor(c.midL, texelM, 6);
    let h: number;
    if (c.tables) h = mesaField(S, wx, wz, env, r, texelM);
    else {
      const m = macroField(wx / c.macroL + o[0], wz / c.macroL + o[1], c.sharp, mo);
      h = env * (Math.pow(m, 1.6) * 1.15 + 0.22 * midField(wx / c.midL + o[6], wz / c.midL + o[7], mi) * (0.35 + m));
      // the gullies: two erosion octaves across the local slope, deeper on the steeper ground (the slope from the
      // macro field's first three octaves, forward differences)
      if (c.gullyM > 0 && (!(texelM > 0) || texelM < c.gullyL / 2.5)) {
        const e = 40, m0 = macroField(wx / c.macroL + o[0], wz / c.macroL + o[1], c.sharp, 3);
        const gx = env * (macroField((wx + e) / c.macroL + o[0], wz / c.macroL + o[1], c.sharp, 3) - m0) / e;
        const gz = env * (macroField(wx / c.macroL + o[0], (wz + e) / c.macroL + o[1], c.sharp, 3) - m0) / e;
        const s = Math.hypot(gx, gz);
        if (s > 0.02) {
          const k = Math.max(0.4, Math.min(2.2, s * 2.2));
          const dx = (gz / s) * k, dz = (-gx / s) * k;
          const gs = gullyOctave(x / c.gullyL + o[12 % 16], z / c.gullyL + o[13 % 16], dx, dz, 17)
            + (texelM > 0 && texelM > c.gullyL / 5 ? 0 : 0.5 * gullyOctave(x / (c.gullyL * 0.5) + o[14 % 16], z / (c.gullyL * 0.5) + o[15 % 16], dx, dz, 48));
          h += c.gullyM * smoothstep(0.05, 0.35, s) * gs * (0.4 + 0.6 * smoothstep(0, env * 0.5, h));
        }
      }
    }
    h = Math.max(0, h);
    // isolated peaks: rounded cones on a volcanic field, sharp nunataks through an ice sheet
    if (c.peakShare > 0) h += c.peakM * (A / 600) * cellPeaks(c, x, z);
    // sheer jebels standing alone on the plain
    if (c.jebelShare > 0) h += cellJebels(c, x, z, A / 720);
    // the sector's layers: ridgelines at authored distances across its band, each a little higher than the one in
    // front, their crests wandering in distance and height (bands of hills standing behind one another)
    const layers = S.cfg.layers ?? 0;
    if (layers > 0) {
      const du = Math.atan2(x, z);
      let lift = 0;
      for (let i = 0; i < layers; i++) {
        const rc = S.innerM + ((i + 0.6) / (layers + 0.4)) * (S.outerM - S.innerM) + 600 * noise2(du * (3 + i) + S.layerSalt, i * 7.1 + 1.3);
        const wr = 1100 + 380 * i;
        const prof = Math.exp(-((r - rc) * (r - rc)) / (wr * wr));
        const und = noise2(du * (rc / 1400) + i * 5.7, 9.1 + S.layerSalt) * 0.6 + noise2(du * (rc / 520) - i * 2.3, 4.4) * 0.4;
        const crest = A * (0.45 + 0.22 * i) * (0.67 + 0.48 * smoothstep(-0.55, 0.75, und));
        lift = Math.max(lift, (crest - 0.5 * env) * prof);
      }
      h += Math.max(0, lift);
    }
    // the flat countries' skyline is their trees: shelterbelts on a turned field grid and lobed woods, standing on the
    // far ground past 3 km (nearer, the impostor trees and the woods' cover carry them)
    if (c.trees > 0 && r > 2800) {
      const tu = x * 0.913 + z * 0.408, tv = -x * 0.408 + z * 0.913;
      const du = Math.abs(((tu / 640 + 0.5 * noise2(tv / 2100, tu / 2100)) % 1 + 1) % 1 - 0.5) * 640;
      const dv = Math.abs(((tv / 980 + 0.5 * noise2(tu / 2300 + 7.1, tv / 2300)) % 1 + 1) % 1 - 0.5) * 980;
      const brk = smoothstep(-0.2, 0.25, noise2(x / 700 + 3.3, z / 700 - 1.1));
      const belt = Math.max(1 - smoothstep(24, 40, du), 0.8 * (1 - smoothstep(24, 40, dv))) * brk;
      const wn = noise2(x / 900 + 5.5, z / 900 - 2.2) * 0.6 + noise2(x / 320 - 4.4, z / 320 + 8.8) * 0.4;
      const woods = smoothstep(0.28, 0.38, wn - 0.12 * smoothstep(0, A, h));
      h += c.trees * Math.max(belt, woods) * smoothstep(2800, 3800, r);
    }
    return h;
  }

  function mesaField(S: ResolvedSector, wx: number, wz: number, A: number, r: number, texelM: number): number {
    const c = S.c, o = S.off;
    const L1 = c.macroL, L2 = c.macroL * 0.37;
    noised(wx / L1 + o[0], wz / L1 + o[1], N3); const na0 = N3[0], na1 = N3[1], na2 = N3[2];
    noised(wx / L2 + o[6], wz / L2 + o[7], N3); const nb0 = N3[0], nb1 = N3[1], nb2 = N3[2];
    noised(wx / 420 + o[8], wz / 420 + o[9], N3); const nr0 = N3[0], nr1 = N3[1], nr2 = N3[2];
    const big = na0 * 0.65 + nb0 * 0.35 + 0.05 * nr0;
    const gx = na1 * (0.65 / L1) + nb1 * (0.35 / L2) + nr1 * (0.05 / 420), gz = na2 * (0.65 / L1) + nb2 * (0.35 / L2) + nr2 * (0.05 / 420);
    const th = 0.9 + (0.16 - 0.9) * smoothstep(S.innerM, S.innerM + 1500, r);
    let s1 = (big - th) / Math.max(Math.hypot(gx, gz), 1e-7);
    if (!(texelM > 0) || texelM < 90) s1 += c.mesaFluteM * noise2(wx / 180 + o[14], wz / 180 + o[15]);
    const lv = noise2(wx / (L1 * 1.3) + o[12], wz / (L1 * 1.3) + o[13]);
    const level = 0.42 + 0.22 * (lv >= -0.15 ? 1 : 0) + 0.2 * (lv >= 0.3 ? 1 : 0) + 0.04 * noise2(wx / 1300, wz / 1300);
    let prof = mesaRamp(s1, c.mesaTalusM, c.mesaCliffM, c.mesaTalusShare);
    const inset = 260 + 160 * (noise2(wx / 2100 + 4.1, wz / 2100 - 2.7) * 0.5 + 0.5);
    const tier = mesaRamp(s1 - inset, 200, 30, c.mesaTalusShare);
    prof = prof * (1 - 0.32 * smoothstep(0, 1, tier)) + 0.32 * tier;
    const Lb = c.macroL * 0.3;
    noised(wx / Lb + o[10], wz / Lb + o[11], N3);
    const sb = (N3[0] - (th + 0.5)) / Math.max(Math.hypot(N3[1], N3[2]) / Lb, 1e-7);
    const bprof = mesaRamp(sb, 320, 16, c.mesaTalusShare) * (0.45 + 0.55 * smoothstep(20, 160, sb)) * (1 - smoothstep(-40, 40, s1));
    const plain = A * (0.04 + 0.05 * (noise2(wx / 900 + o[14], wz / 900 + o[15]) * 0.5 + 0.5));
    const top = 1 + 0.04 * noise2(wx / 700 - 3.3, wz / 700 + 1.9);
    return plain + 0.7 * Math.max(A * level * Math.max(prof, 0) * top, A * (level + 0.22) * bprof);
  }

  function cellPeaks(c: FarCharacter, x: number, z: number): number {
    const cx0 = Math.floor(x / 2600), cz0 = Math.floor(z / 2600);
    let best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = cx0 + i, cz = cz0 + j;
      if (hash12(cx + 13.1, cz + 7.7) < 1 - c.peakShare) continue;
      const px = (cx + 0.2 + 0.6 * hash12(cx + 1.3, cz + 9.1)) * 2600, pz = (cz + 0.2 + 0.6 * hash12(cx + 8.7, cz + 2.9)) * 2600;
      const rad = c.peakRadiusM * (0.7 + 0.6 * hash12(cx + 4.4, cz + 4.4));
      const ang = 6.2831853 * hash12(cx + 5.9, cz + 3.3), ax = Math.cos(ang), az = Math.sin(ang);
      const el = 1 + 0.58 * Math.max(0, Math.min(1.2, c.peakSharp - 1)) * hash12(cx + 9.4, cz + 0.6);
      const qx = x - px, qz = z - pz;
      const d = Math.hypot((qx * ax + qz * az) / el, -qx * az + qz * ax);
      const cone = Math.pow(Math.max(0, 1 - d / rad), c.peakSharp) * (0.6 + 0.4 * hash12(cx + 2.2, cz + 6.6));
      best = Math.max(best, cone);
    }
    return best;
  }

  function cellJebels(c: FarCharacter, x: number, z: number, scale: number): number {
    const cx0 = Math.floor(x / 2600), cz0 = Math.floor(z / 2600);
    let best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = cx0 + i, cz = cz0 + j;
      if (hash12(cx + 31.7, cz + 3.1) < 1 - c.jebelShare) continue;
      const px = (cx + 0.2 + 0.6 * hash12(cx + 2.9, cz + 7.3)) * 2600, pz = (cz + 0.2 + 0.6 * hash12(cx + 6.1, cz + 1.7)) * 2600;
      const rad = c.jebelRadiusM * (0.7 + 0.6 * hash12(cx + 5.3, cz + 8.8));
      const el = 1 + 0.5 * hash12(cx + 0.7, cz + 2.2);
      const ang = 6.2831853 * hash12(cx + 9.1, cz + 4.4), ax = Math.cos(ang), az = Math.sin(ang);
      const qx = x - px, qz = z - pz;
      const lu = (qx * ax + qz * az) / el / rad, lv = (-qx * az + qz * ax) / rad;
      const q = Math.hypot(lu, lv);
      if (q >= 1) continue;
      const th = Math.atan2(lv, lu), salt = hash12(cx + 4.8, cz + 5.9) * 97;
      let wall = Math.max(0.25, Math.min(0.92, c.jebelFoot * (1 + c.jebelFootVary * Math.sin(3 * th + salt))));
      const notch = Math.pow(Math.max(0, Math.cos(th * c.jebelFlutes + hash12(cx + 3.7, cz + 0.3) * 6.28)), 2);
      wall -= notch * c.jebelFluteDepth * (1 - c.jebelRim) * wall;
      const hgt = c.jebelM * scale * (0.7 + 0.3 * hash12(cx + 8.2, cz + 6.6));
      best = Math.max(best, hgt * jebelSection(q, wall, c.jebelApron, c.jebelRim));
    }
    return best;
  }

  return {
    heightAt(x: number, z: number, _base: number, texelM = 0): number {
      const r = Math.hypot(x, z);
      let add = 0;
      const az = sectors.length > 1 || sectors[0].cfg.azDeg[1] - sectors[0].cfg.azDeg[0] < 360 ? hinterlandBearing(x, z) : 0;
      for (const S of sectors) {
        if (r < S.innerM - 1500) continue;
        const span = S.cfg.azDeg[1] - S.cfg.azDeg[0];
        const w = span >= 360 ? 1 : arcWeight(az, S.cfg.azDeg, 14);
        if (w <= 0) continue;
        add = Math.max(add, w * sectorHeight(S, x, z, r, texelM));
      }
      return add;
    },
  };
}
