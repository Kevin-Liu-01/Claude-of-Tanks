/**
 * combat/impactBurst.ts — a shell striking the ground or the water (combat-fx lane, 2026-10-05).
 *
 * The critics (motion wave 105, 1.8/10): "the shell never visibly lands: no flash, no fountain of soil, no clods of
 * earth thrown up … only faint, flat beige blobs that slide sideways at ground height". The burst is rebuilt as the
 * structure of a real impact, in the colours of the ground it hit (surface.ts):
 *  1. a sharp flash (an explosive shell adds a short fireball);
 *  2. a FOUNTAIN of dense, dark ejecta: fast puffs in a steep cone that climb against drag and gravity, smear along
 *     their flight, top out (~6 m for a 120 mm HE on soil) and fall back while they dry to a paler dust;
 *  3. CLODS of the ground on ballistic arcs that land and stop, each landing kicking a small secondary puff;
 *  4. a BASE SURGE: low dust driven radially along the ground by the blast, spreading wide and flat;
 *  5. a dust CROWN born as the fountain tops out, which billows, rises (an explosive's hot gas lifts it) and drifts
 *     downwind over the next seconds; an explosive shell adds dark residue smoke that glows for its first instant;
 *  6. a crater (craters.ts), sooty for an explosive shell.
 * Water throws a white column that collapses, a crown of spray jets, a low surge, droplet glints and a drifting mist.
 */
import type { CombatContext, Rgb } from './context.ts';
import { blend, calScale, mHeat, mLook, mMove, mPlace, mShape, tierCount } from './context.ts';
import { landClod } from './clods.ts';
import {
  BLAST_SMOKE0, BLAST_SMOKE1, SURFACE_INDEX, SURFACE_LOOKS, UNDER_SNOW_SOIL, classifySurface,
  type SurfaceKind,
} from './surface.ts';

interface Vec3Like { x: number; y: number; z: number }

const TAU = Math.PI * 2;
const _c0: [number, number, number] = [0, 0, 0];
const _c1: [number, number, number] = [0, 0, 0];
const FLASH_WHITE: Rgb = [1, 0.97, 0.88];
const FLASH_ORANGE: Rgb = [1, 0.52, 0.14];
const FIRE_HOT: Rgb = [1, 0.86, 0.55];
const FIRE_DEEP: Rgb = [0.9, 0.3, 0.06];
const EMBER: Rgb = [1, 0.62, 0.25];
const ROCK_SPARK: Rgb = [1, 0.8, 0.5];
const DROPLET: Rgb = [0.85, 0.92, 0.95];
const WET_HEART0: Rgb = [0.05, 0.085, 0.095];
const WET_HEART1: Rgb = [0.18, 0.24, 0.26];

function battleFlash(C: CombatContext, x: number, y: number, z: number, size0: number, size1: number, life: number,
  c0: Rgb, c1: Rgb, alpha: number, birthOffset: number): void {
  const b = C.bp;
  b.pos[0] = x; b.pos[1] = y; b.pos[2] = z; b.vel[0] = 0; b.vel[1] = 0.6; b.vel[2] = 0;
  b.life = life; b.size0 = size0; b.size1 = size1; b.rot = C.rand() * TAU; b.rotVel = 0;
  b.col0[0] = c0[0]; b.col0[1] = c0[1]; b.col0[2] = c0[2]; b.col1[0] = c1[0]; b.col1[1] = c1[1]; b.col1[2] = c1[2];
  b.alpha = alpha; b.grav = 0; b.birthOffset = birthOffset;
  C.flash(b);
}

function sparkSpray(C: CombatContext, x: number, y: number, z: number, count: number, speed: number, cone: number,
  col: Rgb, life: number, width: number, birthOffset: number): void {
  const s = C.bs;
  for (let i = 0; i < count; i++) {
    const a = C.rand() * TAU, tilt = C.rand() * cone, v = speed * (0.45 + C.rand() * 0.8);
    s.pos[0] = x; s.pos[1] = y; s.pos[2] = z;
    s.vel[0] = Math.cos(a) * Math.sin(tilt) * v; s.vel[1] = Math.cos(tilt) * v; s.vel[2] = Math.sin(a) * Math.sin(tilt) * v;
    s.life = life * (0.5 + C.rand() * 0.8); s.width = width * (0.6 + C.rand() * 0.8); s.stretch = 0.03;
    s.grav = -18; s.col[0] = col[0]; s.col[1] = col[1]; s.col[2] = col[2]; s.alpha = 0.5 + C.rand() * 0.5;
    s.seed = C.rand(); s.birthOffset = birthOffset - C.rand() * 0.05;
    C.sparks(s);
  }
}

/**
 * The flash: white-hot core cards; an explosive shell adds a short orange fireball. Small arms of light, not a
 * floodlight — the media carry the event.
 */
function impactFlash(C: CombatContext, x: number, y: number, z: number, s: number, explosive: boolean,
  birthOffset: number): void {
  if (explosive) {
    battleFlash(C, x, y + 0.5 * s, z, 1.4 * s, 3.4 * s, 0.075, FLASH_WHITE, FLASH_ORANGE, 1, birthOffset);
    battleFlash(C, x, y + 0.9 * s, z, 1.0 * s, 2.6 * s, 0.11, FLASH_WHITE, FLASH_ORANGE, 0.75, birthOffset);
    const b = C.bp;
    const n = tierCount(C, 5);
    for (let i = 0; i < n; i++) {
      const a = C.rand() * TAU, up = 0.5 + C.rand() * 0.5, v = (3 + C.rand() * 4) * s;
      b.pos[0] = x + Math.cos(a) * 0.3 * s; b.pos[1] = y + 0.4 * s; b.pos[2] = z + Math.sin(a) * 0.3 * s;
      b.vel[0] = Math.cos(a) * v * (1 - up); b.vel[1] = v * up + 1.5; b.vel[2] = Math.sin(a) * v * (1 - up);
      b.life = 0.16 + C.rand() * 0.16; b.size0 = 1.1 * s; b.size1 = (2.4 + C.rand()) * s;
      b.rot = C.rand() * TAU; b.rotVel = (C.rand() - 0.5) * 4;
      b.col0[0] = FIRE_HOT[0]; b.col0[1] = FIRE_HOT[1]; b.col0[2] = FIRE_HOT[2];
      b.col1[0] = FIRE_DEEP[0]; b.col1[1] = FIRE_DEEP[1]; b.col1[2] = FIRE_DEEP[2];
      b.alpha = 0.9; b.grav = 1.5; b.birthOffset = birthOffset;
      C.fire(b);
    }
  } else {
    battleFlash(C, x, y + 0.3 * s, z, 0.5 * s, 1.5 * s, 0.05, FLASH_WHITE, FLASH_ORANGE, 0.8, birthOffset);
  }
}

/**
 * A shell hitting dry or soft ground. `explosive`: HE / HEAT / HESH (a burst with a fireball, soot and a hot crown);
 * otherwise a kinetic strike (a narrower, lower fountain, no fireball).
 */
export function groundBurst(C: CombatContext, pos: Vec3Like, caliberMm: number, explosive: boolean,
  birthOffset = 0, surfaceOverride: SurfaceKind | null = null): SurfaceKind {
  const surf = surfaceOverride ?? classifySurface(C.field, pos.x, pos.z);
  if (surf === 'water') {
    const f = C.field;
    const wy = f?.getWaterSurfaceHeightAt?.(pos.x, pos.z)
      ?? C.groundY(pos.x, pos.z) + (f?.getWaterDepthAt?.(pos.x, pos.z) ?? 0);
    waterBurst(C, pos, caliberMm, explosive, birthOffset, wy);
    return surf;
  }
  const L = SURFACE_LOOKS[surf];
  const s = calScale(caliberMm);
  const sq = Math.sqrt(s);
  const gy = C.groundY(pos.x, pos.z);
  const by = Math.max(pos.y, gy);
  const dk = C.distBoost(pos.x, by, pos.z);
  const m = C.m;
  const R = C.rand;
  impactFlash(C, pos.x, by, pos.z, s, explosive, birthOffset);

  // 2. the fountain: a dense, dark column of soil thrown up a steep cone (overlapping lobed masses), with faster,
  //    wider ejecta spikes smeared along their flight around it; both stall, top out and fall back as they dry
  const coreN = tierCount(C, (explosive ? 11 : 7) * L.ejectaK);
  for (let i = 0; i < coreN; i++) {
    const a = R() * TAU;
    const tilt = Math.pow(R(), 1.5) * (explosive ? 0.3 : 0.24);
    const v = (explosive ? 15 + R() * 10 : 10 + R() * 7) * sq * L.heightK;
    const st = Math.sin(tilt), ct = Math.cos(tilt);
    mPlace(m, pos.x + (R() - 0.5) * 0.5 * s, by + 0.3 + R() * 0.3, pos.z + (R() - 0.5) * 0.5 * s,
      birthOffset + R() * 0.025);
    // the column's mass is soil AND dust: it climbs, stalls and sags back (a softer fall than the spikes' clumps) as
    // it fades, never sinking through the ground
    mMove(m, Math.cos(a) * st * v, ct * v, Math.sin(a) * st * v, 2.4, 0, 0.2, -5 * L.heavy);
    mShape(m, 1.45 + R() * 0.6, (0.9 + R() * 0.4) * s, (3.0 + R() * 1.4) * s * dk, 2.4, 1, R() * TAU, (R() - 0.5) * 2);
    const soil = surf === 'snow' && explosive && i % 2 === 0;
    const c0 = soil ? UNDER_SNOW_SOIL : L.ejecta0;
    const c1 = soil ? blend(UNDER_SNOW_SOIL, L.ejecta1, 0.5, _c1) : L.ejecta1;
    mLook(m, c0, c1, 0.96, 0.01, 0.45, 0.3, 0.12, L.smear * 0.5, L.scatter * 0.4, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.smoke(m);
  }
  const spikeN = tierCount(C, (explosive ? 10 : 7) * L.ejectaK);
  for (let i = 0; i < spikeN; i++) {
    const a = (i / spikeN) * TAU + (R() - 0.5) * 0.6;
    const tilt = 0.25 + R() * 0.55;
    const v = (explosive ? 20 + R() * 12 : 14 + R() * 8) * sq * L.heightK;
    const st = Math.sin(tilt), ct = Math.cos(tilt);
    mPlace(m, pos.x + (R() - 0.5) * 0.4 * s, by + 0.25, pos.z + (R() - 0.5) * 0.4 * s, birthOffset + R() * 0.02);
    mMove(m, Math.cos(a) * st * v, ct * v, Math.sin(a) * st * v, 2.6, 0, 0.2, -9.8 * L.heavy);
    mShape(m, 0.9 + R() * 0.5, 0.4 * s, (1.4 + R() * 0.8) * s * dk, 2, 1, R() * TAU, (R() - 0.5) * 2.4);
    const soil = surf === 'snow' && explosive && i % 3 === 0;
    // dark jets of soil streaking out of the burst (smeared hard along their flight), drying only halfway
    blend(L.ejecta0, L.ejecta1, 0.5, _c1);
    mLook(m, soil ? UNDER_SNOW_SOIL : L.ejecta0, _c1, 0.9, 0.01, 0.5, 0.45, 0.1, L.smear * 2.2, L.scatter * 0.5, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.smoke(m);
  }

  // 3. clods on ballistic arcs; the bigger ones kick a little dust where they land
  const clodN = tierCount(C, (explosive ? 22 : 14) * L.clodK);
  const trailN = Math.min(clodN, tierCount(C, (explosive ? 5 : 3) * Math.min(1, L.clodK)));
  const k = C.k;
  for (let i = 0; i < clodN; i++) {
    const a = R() * TAU, tilt = 0.12 + R() * 0.85, v = (6 + R() * 13) * Math.pow(s, 0.4) * (explosive ? 1 : 0.8);
    k.px = pos.x + (R() - 0.5) * 0.4; k.py = by + 0.3; k.pz = pos.z + (R() - 0.5) * 0.4;
    k.vx = Math.cos(a) * Math.sin(tilt) * v; k.vy = Math.cos(tilt) * v + 2; k.vz = Math.sin(a) * Math.sin(tilt) * v;
    k.scale = (i < trailN ? 0.16 + R() * 0.08 : 0.05 + Math.pow(R(), 2) * 0.2) * s * (surf === 'sand' ? 0.6 : 1);
    k.ax = R() - 0.5; k.ay = R() - 0.5; k.az = R() - 0.5; k.spin = 6 + R() * 14;
    k.seed = R();
    const tint = 0.8 + R() * 0.4;
    const clodSoil = surf === 'snow' && explosive && i % 3 === 0;
    const base = clodSoil ? UNDER_SNOW_SOIL : L.clod;
    k.r = base[0] * tint; k.g = base[1] * tint; k.b = base[2] * tint; k.wet = L.clodWet;
    landClod(k, C.groundY);
    k.life = k.landS + 1.4 + R() * 1.2;
    k.birthOffset = birthOffset;
    C.clod(k);
    // the biggest clods drag a trail of crumbling soil along their arc (the arc reads in a still frame)
    if (i < trailN) {
      for (let ts = 0.05; ts < Math.min(0.55, k.landS - 0.05); ts += 0.09) {
        const sd = (1 - Math.exp(-0.35 * ts)) / 0.35;
        mPlace(m, k.px + k.vx * sd, k.py + k.vy * sd - 4.9 * ts * ts, k.pz + k.vz * sd, birthOffset + ts);
        mMove(m, k.vx * 0.12, k.vy * 0.05, k.vz * 0.12, 2.2, 0.05, 0.5, -2);
        mShape(m, 0.55 + R() * 0.3, 0.16 * sq, (0.6 + R() * 0.3) * sq, 2, 1, R() * TAU, (R() - 0.5) * 2);
        mLook(m, L.ejecta0, L.dust0, 0.62, 0.01, 0.35, 0.5, 0.08, 0.02, L.scatter * 0.5, R());
        mHeat(m, 0, 1, 0.5, 1);
        C.earth(m);
      }
    }
    if (k.scale > 0.09 * s && i % 2 === 0) {
      const lx = k.px + k.vx * (1 - Math.exp(-0.35 * k.landS)) / 0.35;
      const lz = k.pz + k.vz * (1 - Math.exp(-0.35 * k.landS)) / 0.35;
      mPlace(m, lx, k.restY + 0.2, lz, birthOffset + k.landS);
      mMove(m, k.vx * 0.08, 0.9, k.vz * 0.08, 3, 0.15, 0.8, 0);
      mShape(m, 0.9 + R() * 0.5, 0.25 + k.scale, 1.0 + R() * 0.6 + k.scale * 3, 2.4, 0.7, R() * TAU, (R() - 0.5));
      mLook(m, L.dust0, L.dust1, 0.5, 0.02, 0.3, 0.6, 0.15, 0, L.scatter, R());
      mHeat(m, 0, 1, 0.5, 1);
      C.earth(m);
    }
  }

  // 4. base surge: low dust driven radially along the ground, spreading wide and flat — two rings (a fast outer wave
  //    and a slower inner roll) of overlapping, tearing cards so the surge reads as one rolling dust wave
  const surgeN = tierCount(C, (explosive ? 24 : 14) * Math.sqrt(L.dustK));
  for (let i = 0; i < surgeN; i++) {
    const outer = i % 3 !== 0;
    const a = (i / surgeN) * TAU + (R() - 0.5) * 0.35;
    const v = (outer ? (explosive ? 11 + R() * 7 : 7 + R() * 5) : (explosive ? 4 + R() * 3 : 3 + R() * 2)) * sq;
    mPlace(m, pos.x + Math.cos(a) * 0.6 * s, by + 0.4, pos.z + Math.sin(a) * 0.6 * s, birthOffset + R() * 0.05);
    mMove(m, Math.cos(a) * v, 0.35 + R() * 0.5, Math.sin(a) * v, 3.0, 0.2, 0.9, 0);
    mShape(m, 2.8 + R() * 1.6, 1.2 * s, (outer ? 4.4 + R() * 1.8 : 3.4 + R() * 1.2) * s * Math.sqrt(L.dustK) * dk, 2.6,
      0.42, R() * TAU, (R() - 0.5) * 0.6);
    blend(L.ejecta1, L.dust0, 0.6, _c0);
    mLook(m, _c0, L.dust1, (0.5 + R() * 0.14) * Math.min(1, L.dustK), 0.04, 0.4, 0.55, 0.2, 0.05,
      L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }

  // 5. the crown: born as the fountain tops out, billowing, rising (hot gas) and drifting downwind
  const crownN = tierCount(C, (explosive ? 16 : 9) * Math.sqrt(L.dustK));
  const crownTop = (explosive ? 5.5 : 3.2) * s * L.heightK;
  for (let i = 0; i < crownN; i++) {
    const a = R() * TAU, h = 0.7 + Math.pow(R(), 0.8) * crownTop, r = R() * 1.3 * s;
    const out = 1.2 + R() * 2.0;
    mPlace(m, pos.x + Math.cos(a) * r, by + h, pos.z + Math.sin(a) * r, birthOffset + 0.1 + R() * 0.35);
    mMove(m, Math.cos(a) * out, 1.2 + R() * 1.8, Math.sin(a) * out, 1.3,
      (explosive ? 0.85 : 0.3) + R() * 0.35, 1, 0);
    mShape(m, 5.5 + R() * 2.5, 1.8 * s, (5.8 + R() * 2.8) * s * Math.sqrt(L.dustK) * dk, 1.6, 0.92, R() * TAU,
      (R() - 0.5) * 0.6);
    // born the brown of the fountain's dust, drying and thinning toward the ground's pale dust as it spreads
    blend(L.ejecta0, L.dust0, 0.55, _c0);
    mLook(m, _c0, L.dust0, 0.74 + R() * 0.14, 0.2, 0.38, 0.35, 0.22, 0, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.smoke(m);
  }

  // explosive residue: dark smoke out of the crater, glowing for its first instant
  if (explosive) {
    const smokeN = tierCount(C, 4);
    for (let i = 0; i < smokeN; i++) {
      const a = R() * TAU, r = R() * 0.8 * s;
      mPlace(m, pos.x + Math.cos(a) * r, by + 0.7 + R() * 1.6 * s, pos.z + Math.sin(a) * r, birthOffset + R() * 0.06);
      mMove(m, Math.cos(a) * 1.5, 2.5 + R() * 2.5, Math.sin(a) * 1.5, 1.6, 1.0 + R() * 0.4, 1, 0);
      mShape(m, 3.2 + R() * 1.4, 1.1 * s, (3.0 + R() * 1.2) * s * dk, 1.9, 1, R() * TAU, (R() - 0.5) * 0.8);
      mLook(m, BLAST_SMOKE0, BLAST_SMOKE1, 0.55 + R() * 0.15, 0.02, 0.4, 0.4, 0.18, 0, 0.1, R());
      mHeat(m, 0.95, 5.5, 0.95, 1);
      C.smoke(m);
    }
    sparkSpray(C, pos.x, by + 0.4, pos.z, tierCount(C, 8), 13 * s, 0.9, EMBER, 0.55, 0.035, birthOffset);
  }
  if (surf === 'rock') sparkSpray(C, pos.x, by + 0.2, pos.z, tierCount(C, 12), 16, 1.1, ROCK_SPARK, 0.4, 0.025,
    birthOffset);

  // 6. the crater
  C.crater(pos.x, pos.z, (explosive ? 1.55 : 1.0) * s * (0.85 + R() * 0.3), SURFACE_INDEX[surf], explosive,
    birthOffset);
  return surf;
}

/**
 * A shell ending in open water: a white column thrown straight up that collapses, a crown of spray jets, a low
 * surge running out over the surface, droplet glints and a mist that drifts off. The reactive water impulse and the
 * wake print stay with the caller (effects.ts waterSplash).
 */
export function waterBurst(C: CombatContext, pos: Vec3Like, caliberMm: number, explosive: boolean,
  birthOffset = 0, surfaceY: number | null = null): void {
  const L = SURFACE_LOOKS.water;
  const s = calScale(caliberMm);
  const sq = Math.sqrt(s);
  const wy = surfaceY ?? Math.max(pos.y, C.groundY(pos.x, pos.z));
  const dk = C.distBoost(pos.x, wy, pos.z);
  const m = C.m;
  const R = C.rand;
  if (explosive) impactFlash(C, pos.x, wy, pos.z, s * 0.8, true, birthOffset);
  // the column: a dense white core thrown straight up (overlapping lobed masses) that tops out and collapses, with
  // fast streaming spikes up its middle
  const colN = tierCount(C, 13);
  for (let i = 0; i < colN; i++) {
    const a = R() * TAU, tilt = Math.pow(R(), 2) * 0.16, v = (explosive ? 18 + R() * 13 : 14 + R() * 10) * sq;
    mPlace(m, pos.x + (R() - 0.5) * 0.6 * s, wy + 0.3, pos.z + (R() - 0.5) * 0.6 * s, birthOffset + R() * 0.04);
    mMove(m, Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v, Math.sin(a) * Math.sin(tilt) * v, 1.9 + R() * 0.5,
      0, 0.3, -9.8);
    mShape(m, 1.7 + R() * 0.8, (0.8 + R() * 0.3) * s, (2.8 + R() * 1.2) * s * dk, 2.2, 1, R() * TAU, (R() - 0.5) * 1.5);
    mLook(m, L.ejecta0, L.ejecta1, 0.92, 0.01, 0.55, 0.35, 0.12, 0.03, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.smoke(m);
  }
  const jetN = tierCount(C, 8);
  for (let i = 0; i < jetN; i++) {
    const a = R() * TAU, tilt = R() * 0.1, v = (explosive ? 26 + R() * 12 : 20 + R() * 9) * sq;
    mPlace(m, pos.x + (R() - 0.5) * 0.4 * s, wy + 0.3, pos.z + (R() - 0.5) * 0.4 * s, birthOffset + R() * 0.03);
    mMove(m, Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v, Math.sin(a) * Math.sin(tilt) * v, 1.5, 0, 0.3, -9.8);
    mShape(m, 1.5 + R() * 0.6, 0.5 * s, (1.8 + R() * 0.8) * s * dk, 2, 1, R() * TAU, (R() - 0.5) * 1.5);
    mLook(m, L.ejecta0, L.ejecta1, 0.85, 0.01, 0.5, 0.5, 0.12, 0.06, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // the crown: spray jets fanning out at 25-45 degrees (many small, quickly thinning sheets streaked along their
  // flight: torn spray, never round puffs)
  const crownN = tierCount(C, 18);
  for (let i = 0; i < crownN; i++) {
    const a = (i / crownN) * TAU + (R() - 0.5) * 0.4, tilt = 0.45 + R() * 0.4, v = (10 + R() * 7) * sq;
    mPlace(m, pos.x + Math.cos(a) * 0.4 * s, wy + 0.25, pos.z + Math.sin(a) * 0.4 * s, birthOffset + R() * 0.03);
    mMove(m, Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v, Math.sin(a) * Math.sin(tilt) * v, 1.8, 0, 0.3, -9.8);
    mShape(m, 1.2 + R() * 0.5, 0.35 * s, (1.5 + R() * 0.8) * s * dk, 2, 1, R() * TAU, (R() - 0.5) * 2);
    mLook(m, L.ejecta0, L.ejecta1, 0.55, 0.012, 0.45, 0.7, 0.12, 0.13, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // the surge over the surface
  const surgeN = tierCount(C, 10);
  for (let i = 0; i < surgeN; i++) {
    const a = (i / surgeN) * TAU + (R() - 0.5) * 0.5, v = (6 + R() * 5) * sq;
    mPlace(m, pos.x + Math.cos(a) * 0.6 * s, wy + 0.35, pos.z + Math.sin(a) * 0.6 * s, birthOffset + R() * 0.05);
    mMove(m, Math.cos(a) * v, 0.5 + R() * 0.6, Math.sin(a) * v, 2.8, 0.1, 0.9, 0);
    mShape(m, 2.0 + R() * 1.0, 0.7 * s, (3.0 + R() * 1.2) * s * dk, 2.5, 0.5, R() * TAU, (R() - 0.5) * 0.6);
    mLook(m, L.dust0, L.dust1, 0.5, 0.03, 0.35, 0.65, 0.16, 0.02, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // the mist left behind as the column falls back
  const mistN = tierCount(C, 6);
  for (let i = 0; i < mistN; i++) {
    const a = R() * TAU, r = R() * 1.6 * s;
    // low, where the collapsing column leaves it (a mist born high floated off as a lone cloud)
    mPlace(m, pos.x + Math.cos(a) * r, wy + 0.8 + R() * 2.2 * s, pos.z + Math.sin(a) * r, birthOffset + 0.5 + R() * 0.5);
    mMove(m, Math.cos(a) * 0.8, 0.15 + R() * 0.3, Math.sin(a) * 0.8, 1.2, 0.12, 1, 0);
    mShape(m, 3.6 + R() * 1.6, 1.8 * s, (5 + R() * 2) * s * dk, 1.6, 0.85, R() * TAU, (R() - 0.5) * 0.4);
    mLook(m, L.dust0, L.dust1, 0.3, 0.3, 0.3, 0.5, 0.25, 0, L.scatter, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
  // droplet glints and the dark wet heart thrown up with the column
  sparkSpray(C, pos.x, wy + 0.3, pos.z, tierCount(C, 14), 14 * s, 0.85, DROPLET, 0.6, 0.028, birthOffset);
  const heartN = tierCount(C, 3);
  for (let i = 0; i < heartN; i++) {
    mPlace(m, pos.x + (R() - 0.5) * 0.3, wy + 0.3, pos.z + (R() - 0.5) * 0.3, birthOffset);
    mMove(m, (R() - 0.5) * 1.2, (12 + R() * 6) * sq, (R() - 0.5) * 1.2, 2, 0, 0.2, -9.8);
    mShape(m, 0.8 + R() * 0.3, 0.45 * s, 1.5 * s, 2, 1, R() * TAU, 0);
    mLook(m, WET_HEART0, WET_HEART1, 0.85, 0.01, 0.5, 0.4, 0.1, 0.06, 0.3, R());
    mHeat(m, 0, 1, 0.5, 1);
    C.earth(m);
  }
}
