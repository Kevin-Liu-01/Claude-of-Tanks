// src/world/hinterland/landforms.ts — the near ranges' landform primitives in world space (the field's term 4; HL-1's
// ridge and dike, HL-2's ranges; the horizons stream, 2026-10-13; B-architecture §4.5).
//
// The old ring carved its forms on polar columns (massif and escarpment knobs on ring rows, table caps, a dam canyon
// cut through the ring). The Hinterland places each landform in the world, where the real place has it, in its own
// frame (centre, strike, length, width) with its own geology, and the field adds them over the outland: positive forms
// combine by their maximum (two dikes meeting keep one crest), negative forms (valleys, notches, canyons) cut by their
// minimum, so authoring order never matters. Each primitive is pure and allocation-free; its geology hook tells the
// land material where its own rock, strata and snow govern.
import type { HinterlandGeologySample, HinterlandReliefTerm } from './field.ts';
import { fbm2, hashString, noise2, seedOffset, smoothstep } from './noise.ts';
import { hinterlandPoint, type HinterlandLandformConfig, type HinterlandSpec } from './spec.ts';

/** One placed landform: its frame and its profile, evaluated in its own (u along the strike, v across) coordinates. */
interface PlacedLandform {
  cfg: HinterlandLandformConfig;
  cx: number; cz: number;
  /** The strike as a unit vector (world XZ) and its normal. */
  ax: number; az: number;
  halfL: number; halfW: number;
  /** The world bounding box (with the profile's reach). */
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Height (signed) and a salt for its noise. */
  h: number; salt: number;
  /** Profile in local coordinates (|u| <= halfL, |v| <= halfW): 0..1 (multiplied by h). */
  profile(u: number, v: number): number;
}

const BATTER = 3; // a dike's batter, 1 in 3

function frame(cfg: HinterlandLandformConfig, salt: number): Omit<PlacedLandform, 'profile' | 'minX' | 'maxX' | 'minZ' | 'maxZ'> {
  const p = hinterlandPoint(cfg.at);
  const strike = ((cfg.strikeDeg ?? 0) * Math.PI) / 180;
  const length = cfg.lengthM ?? cfg.widthM ?? 600;
  const width = cfg.widthM ?? length * 0.5;
  return { cfg, cx: p.x, cz: p.z, ax: Math.sin(strike), az: Math.cos(strike), halfL: length / 2, halfW: width / 2, h: cfg.heightM, salt };
}

function bounds(f: Omit<PlacedLandform, 'profile' | 'minX' | 'maxX' | 'minZ' | 'maxZ'>): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const ex = Math.abs(f.ax) * f.halfL + Math.abs(f.az) * f.halfW, ez = Math.abs(f.az) * f.halfL + Math.abs(f.ax) * f.halfW;
  return { minX: f.cx - ex, maxX: f.cx + ex, minZ: f.cz - ez, maxZ: f.cz + ez };
}

/** A dike: a level crown (crown.widthM, default 5 m) over 1-in-3 batters, straight along its strike, eased off at its ends. */
function placeDike(cfg: HinterlandLandformConfig, salt: number): PlacedLandform {
  const f = frame(cfg, salt);
  const crown = (cfg.crown?.widthM ?? 5) / 2;
  const foot = crown + BATTER * Math.abs(cfg.heightM);
  f.halfW = Math.max(f.halfW, foot);
  return {
    ...f, ...bounds(f),
    profile(u, v) {
      const end = 1 - smoothstep(f.halfL - 30, f.halfL, Math.abs(u));
      const av = Math.abs(v);
      if (av <= crown) return end;
      const t = 1 - (av - crown) / (foot - crown);
      return t <= 0 ? 0 : end * t * t * (3 - 2 * t);
    },
  };
}

/** A ridge (or a swell): a crest line along its strike with a rounded section, its crest wandering in height. */
function placeRidge(cfg: HinterlandLandformConfig, salt: number, erosion: number): PlacedLandform {
  const f = frame(cfg, salt);
  const [ox, oz] = seedOffset(salt, 3);
  return {
    ...f, ...bounds(f),
    profile(u, v) {
      const tu = Math.abs(u) / f.halfL;
      if (tu >= 1) return 0;
      // the crest's own summits and saddles along the strike
      const crest = 0.78 + 0.22 * fbm2(u / 380 + ox, oz, 3);
      const along = 1 - smoothstep(0.55, 1, tu);
      // the section: rounded for a swell, sharper with erosion; the crest line wanders across the strike
      const wander = 0.12 * f.halfW * noise2(u / 520 + oz, ox);
      const tv = Math.abs(v - wander) / f.halfW;
      if (tv >= 1) return 0;
      const round = (1 - tv * tv) * (1 - tv * tv);
      const sharp = Math.pow(1 - tv, 1.6);
      return crest * along * (round * (1 - erosion) + sharp * erosion);
    },
  };
}

/**
 * The landform term for a spec (the field's term 4). Unknown kinds (the HL-2 primitives before they land) contribute
 * nothing rather than guessing a shape.
 */
export function createLandformRelief(spec: HinterlandSpec, seed: number): HinterlandReliefTerm | null {
  if (!spec.landforms.length) return null;
  const placeSeed = (seed ^ hashString(`hinterland-landforms:${spec.mapId}`)) >>> 0;
  const placed: PlacedLandform[] = [];
  spec.landforms.forEach((cfg, i) => {
    const salt = (placeSeed % 997) + i * 31;
    const erosion = cfg.geology?.erosion ?? spec.geology.erosion;
    if (cfg.kind === 'dike') placed.push(placeDike(cfg, salt));
    else if (cfg.kind === 'ridge' || cfg.kind === 'massif' || cfg.kind === 'escarpment' || cfg.kind === 'mesa') placed.push(placeRidge(cfg, salt, erosion));
  });
  if (!placed.length) return null;
  return {
    heightAt(x: number, z: number): number {
      let pos = 0, neg = 0;
      for (let i = 0; i < placed.length; i++) {
        const L = placed[i];
        if (x < L.minX || x > L.maxX || z < L.minZ || z > L.maxZ) continue;
        const dx = x - L.cx, dz = z - L.cz;
        const u = dx * L.ax + dz * L.az, v = dx * L.az - dz * L.ax;
        if (Math.abs(u) > L.halfL || Math.abs(v) > L.halfW) continue;
        const a = L.h * L.profile(u, v);
        if (a > pos) pos = a; else if (a < neg) neg = a;
      }
      return pos + neg;
    },
    geologyAt(_x: number, _z: number, _out: HinterlandGeologySample): number { return 0; },
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
