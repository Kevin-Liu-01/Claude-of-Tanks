/**
 * blastRecipes.ts — explosions, strikes, muzzle blasts and burning columns built from simulated media
 * (destruction-fx lane, 2026-10-07).
 *
 * Every recipe composes a few big coherent media puffs (volumeMedia.ts) with the battle's additive light (flash,
 * fire, sparks, jets: particles.ts) and thrown pieces of the struck material (debrisChunks.ts). The variety keys on
 * the munition class and its charge (sim/munitionBlast.ts, the same catalog that prices the blast in the sim) and on
 * the surface (surfaceLooks.ts):
 *
 *   s = cbrt(charge kg)   — the blast's length scale (125 mm HE 1.5, 152 mm 1.9, the gunship's howitzer 2.7)
 *
 * A burst on the ground is, in order of what the eye reads:
 *   1. the FLASH (additive, two frames) and a short FIREBALL that cools to soot inside the media (explosives only);
 *   2. the dark EJECTA thrown up in a steep cone (dense dark media launched hard that stall and fall back) and the
 *      CHUNKS of the ground on ballistic arcs;
 *   3. one coherent DUST CLOUD: a few big media puffs born together in the burst's footprint that swell fast, slow,
 *      rise a little and drift downwind as one mass, darker while they still carry soil, drying to the dust colour;
 *   4. a low BASE SURGE running out along the ground;
 *   5. for explosives, a pale RESIDUE smoke that lingers over the crater.
 * A kinetic strike (AP, APFSDS, autocannon AP, small arms) has no flash and no fireball: a spurt of soil along the
 * ricochet line, chunks, a small dust puff, sparks on rock and metal.
 *
 * Recipes draw ONLY from the context's seeded stream (the fx rng that Studio resetSeed and frozen captures pin) and
 * write through the context's scratch records: nothing allocates per call.
 */
import type { MunitionClass } from '../sim/destructionEvents.ts';
import type { VolumePuff } from './volumeMedia.ts';
import type { ChunkPiece, ChunkShape } from './debrisChunks.ts';
import {
  BLAST_RESIDUE, PROPELLANT, SOOT, SURFACE_LOOKS, UNDER_SNOW_SOIL, type SurfaceKind,
} from './surfaceLooks.ts';

type Rgb = readonly [number, number, number];
const TAU = Math.PI * 2;

/** The battle pools a recipe may add light with (particles.ts emit options, structurally). */
export interface LightPuff {
  pos: [number, number, number]; vel: [number, number, number]; life: number; size0: number; size1: number;
  rot: number; rotVel: number; col0: [number, number, number]; col1: [number, number, number]; alpha: number;
  grav: number; birthOffset: number;
}
export interface LightStreak {
  pos: [number, number, number]; vel: [number, number, number]; life: number; width: number; stretch: number;
  grav: number; col: [number, number, number]; alpha: number; seed: number; birthOffset: number;
}

export interface BlastContext {
  /** the shared seeded fx stream */
  rand(): number;
  groundY(x: number, z: number): number;
  media(p: VolumePuff): void;
  chunk(p: ChunkPiece): void;
  flash(o: LightPuff): void;
  fire(o: LightPuff): void;
  sparks(o: LightStreak): void;
  /** pulse the pooled explosion light (peak x the battle's explosion peak) after delayS */
  lightPulse(x: number, y: number, z: number, peakK: number, delayS: number): void;
  /** camera-distance size boost (1 inside ~90 m) so far blasts still read */
  distBoost(x: number, y: number, z: number): number;
  /** 1 on desktop; the phone tier never builds this context */
  readonly tier: number;
  readonly m: VolumePuff;
  readonly k: ChunkPiece;
  readonly lp: LightPuff;
  readonly ls: LightStreak;
}

const FLASH_WHITE: Rgb = [1, 0.96, 0.86];
const FLASH_ORANGE: Rgb = [1, 0.55, 0.16];
const FIRE_HOT: Rgb = [1, 0.84, 0.5];
const FIRE_DEEP: Rgb = [0.95, 0.32, 0.06];
const SPARK: Rgb = [1, 0.78, 0.45];
const _c: [number, number, number] = [0, 0, 0];

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  _c[0] = a[0] + (b[0] - a[0]) * t; _c[1] = a[1] + (b[1] - a[1]) * t; _c[2] = a[2] + (b[2] - a[2]) * t;
  return _c;
}

// ---- record setters (each recipe sets every field group, so nothing carries over between emits) ----------------

function place(m: VolumePuff, x: number, y: number, z: number, birthOffset: number): void {
  m.x = x; m.y = y; m.z = z; m.birthOffset = birthOffset;
}
function move(m: VolumePuff, vx: number, vy: number, vz: number, drag: number, rise: number, windK: number, grav: number): void {
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = grav;
}
function shape(m: VolumePuff, life: number, size0: number, size1: number, growExp: number, R: () => number, spin = 0.12): void {
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = growExp;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * spin;
}
function look(m: VolumePuff, c0: Rgb, c1: Rgb, density: number, fadeIn: number, fadeOut: number): void {
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = fadeIn; m.fadeOut = fadeOut;
}
function book(m: VolumePuff, medium: 'billow' | 'burst', R: () => number, playSeconds: number, startFrame = 0): void {
  m.medium = medium; m.variant = Math.floor(R() * 4); m.mirror = R() < 0.5; m.playSeconds = playSeconds;
  m.startFrame = startFrame;
}
function heat(m: VolumePuff, h: number, cool: number): void { m.heat = h; m.cool = cool; }

function lightPuff(C: BlastContext, pool: 'flash' | 'fire', x: number, y: number, z: number, vx: number, vy: number,
  vz: number, life: number, size0: number, size1: number, c0: Rgb, c1: Rgb, alpha: number, grav: number,
  birthOffset: number): void {
  const b = C.lp;
  b.pos[0] = x; b.pos[1] = y; b.pos[2] = z; b.vel[0] = vx; b.vel[1] = vy; b.vel[2] = vz;
  b.life = life; b.size0 = size0; b.size1 = size1; b.rot = C.rand() * TAU; b.rotVel = (C.rand() - 0.5) * 2;
  b.col0[0] = c0[0]; b.col0[1] = c0[1]; b.col0[2] = c0[2]; b.col1[0] = c1[0]; b.col1[1] = c1[1]; b.col1[2] = c1[2];
  b.alpha = alpha; b.grav = grav; b.birthOffset = birthOffset;
  if (pool === 'flash') C.flash(b); else C.fire(b);
}

function sparkSpray(C: BlastContext, x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number,
  speed: number, cone: number, life: number, width: number, birthOffset: number): void {
  const s = C.ls;
  const R = C.rand;
  // a basis around the normal
  let ux = -nz, uy = 0, uz = nx;
  if (ux * ux + uz * uz < 1e-4) { ux = 1; uy = 0; uz = 0; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const wx = ny * uz - nz * uy, wy = nz * ux - nx * uz, wz = nx * uy - ny * ux;
  for (let i = 0; i < count; i++) {
    const a = R() * TAU, t = R() * cone, st = Math.sin(t), ct = Math.cos(t);
    const v = speed * (0.45 + R() * 0.8);
    const dx = nx * ct + (ux * Math.cos(a) + wx * Math.sin(a)) * st;
    const dy = ny * ct + (uy * Math.cos(a) + wy * Math.sin(a)) * st;
    const dz = nz * ct + (uz * Math.cos(a) + wz * Math.sin(a)) * st;
    s.pos[0] = x; s.pos[1] = y; s.pos[2] = z;
    s.vel[0] = dx * v; s.vel[1] = dy * v; s.vel[2] = dz * v;
    s.life = life * (0.5 + R() * 0.8); s.width = width * (0.6 + R() * 0.8); s.stretch = 0.03;
    s.grav = -18; s.col[0] = SPARK[0]; s.col[1] = SPARK[1]; s.col[2] = SPARK[2]; s.alpha = 0.5 + R() * 0.5;
    s.seed = R(); s.birthOffset = birthOffset - R() * 0.04;
    C.sparks(s);
  }
}

function chunk(C: BlastContext, shapeId: ChunkShape, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  scale: number, col: Rgb, life: number, heatK: number, birthOffset: number): void {
  const k = C.k;
  const R = C.rand;
  k.shape = shapeId; k.x = x; k.y = y; k.z = z; k.birthOffset = birthOffset;
  k.vx = vx; k.vy = vy; k.vz = vz; k.life = life;
  k.ax = R() - 0.5; k.ay = R() - 0.5; k.az = R() - 0.5; k.spin = 6 + R() * 14;
  k.scale = scale; k.groundY = C.groundY(x, z); k.drag = 0.25;
  const tint = 0.8 + R() * 0.4;
  k.r = col[0] * tint; k.g = col[1] * tint; k.b = col[2] * tint; k.heat = heatK; k.seed = R();
  C.chunk(k);
}

/** The blast's length scale from its charge: cbrt(kg), floored for the smallest explosive rounds. */
export function blastScale(chargeKg: number): number {
  return Math.max(0.3, Math.cbrt(Math.max(0, chargeKg)));
}

/** Explosive classes detonate (flash, fireball, residue); the rest strike. */
export function isExplosive(munition: MunitionClass): boolean {
  return munition !== 'small_arms' && munition !== 'autocannon_ap' && munition !== 'kinetic' && munition !== 'smoke';
}

// ---------------------------------------------------------------------------------------------------------------
// A burst on the ground
// ---------------------------------------------------------------------------------------------------------------

export interface GroundBurstInput {
  x: number; y: number; z: number;
  munition: MunitionClass;
  chargeKg: number;
  surface: SurfaceKind;
  birthOffset?: number;
}

/**
 * An explosive burst on (or just above) the ground: flash, fireball, ejecta, chunks, the dust cloud, the surge and the
 * residue, sized by cbrt(charge) and coloured by the surface. Water bursts go to waterBurst.
 */
export function groundBurst(C: BlastContext, I: GroundBurstInput): void {
  if (I.surface === 'water') { waterBurst(C, I); return; }
  const L = SURFACE_LOOKS[I.surface];
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const s = blastScale(I.chargeKg);
  const sq = Math.sqrt(s);
  const gy = C.groundY(I.x, I.z);
  const by = Math.max(I.y, gy);
  const dk = C.distBoost(I.x, by, I.z);
  // gunship / heavy rounds throw a taller column; shaped charges (HEAT, ATGM, FPV) dig less and burn more
  const shaped = I.munition === 'heat' || I.munition === 'atgm' || I.munition === 'drone_fpv';
  const heavy = I.munition === 'howitzer' || I.munition === 'missile' || I.munition === 'rocket';
  const dustK = L.dustK * (shaped ? 0.7 : 1);

  // 1. flash and fireball
  lightPuff(C, 'flash', I.x, by + 0.6 * s, I.z, 0, 0.5, 0, 0.07, 1.6 * s * dk, 4.2 * s * dk, FLASH_WHITE, FLASH_ORANGE, 1, 0, bo);
  lightPuff(C, 'flash', I.x, by + 1.1 * s, I.z, 0, 1.0, 0, 0.12, 1.2 * s * dk, 3.4 * s * dk, FLASH_WHITE, FLASH_ORANGE, 0.7, 0, bo);
  const fireN = Math.round((shaped ? 4 : 3) + s);
  for (let i = 0; i < fireN; i++) {
    const a = R() * TAU, up = 0.35 + R() * 0.65, v = (4 + R() * 6) * s;
    lightPuff(C, 'fire', I.x + Math.cos(a) * 0.3 * s, by + 0.5 * s, I.z + Math.sin(a) * 0.3 * s,
      Math.cos(a) * v * (1 - up), v * up + 1.5, Math.sin(a) * v * (1 - up), 0.14 + R() * 0.14,
      1.0 * s * dk, (2.2 + R()) * s * dk, FIRE_HOT, FIRE_DEEP, 0.9, 1.5, bo);
  }
  // the fireball's body inside the media: a hot billow that cools to residue in half a second
  const ballN = shaped ? 3 : 2;
  for (let i = 0; i < ballN; i++) {
    const a = R() * TAU;
    place(m, I.x + Math.cos(a) * 0.4 * s, by + (0.6 + R() * 0.6) * s, I.z + Math.sin(a) * 0.4 * s, bo - 0.02);
    move(m, Math.cos(a) * 2.5 * s, (3 + R() * 3) * s, Math.sin(a) * 2.5 * s, 2.2, 1.2, 0.5, 0);
    shape(m, 1.6 + R() * 0.6, 1.4 * s * dk, (4.2 + R()) * s * dk, 2.6, R);
    look(m, BLAST_RESIDUE, BLAST_RESIDUE, 0.92, 0.0, 0.45);
    book(m, 'billow', R, 2.2 + R() * 0.6);
    heat(m, 1.4, 4.5);
    C.media(m);
  }
  C.lightPulse(I.x, by + 2.2 * s, I.z, Math.min(1.6, 0.45 + 0.35 * s), 0);

  // 2. ejecta: dense dark soil thrown up a steep cone; it stalls and falls back as it thins
  const ejN = Math.round((4 + 2 * s) * Math.min(1.2, L.chunkK + 0.4));
  for (let i = 0; i < ejN; i++) {
    const a = (i / ejN) * TAU + (R() - 0.5) * 0.9;
    const tilt = Math.pow(R(), 1.4) * (shaped ? 0.25 : 0.42);
    const v = (13 + R() * 9) * sq * L.heightK * (heavy ? 1.25 : 1);
    const st = Math.sin(tilt), ct = Math.cos(tilt);
    place(m, I.x + (R() - 0.5) * 0.5 * s, by + 0.3, I.z + (R() - 0.5) * 0.5 * s, bo + R() * 0.03);
    move(m, Math.cos(a) * st * v, ct * v, Math.sin(a) * st * v, 1.6, 0, 0.25, -7);
    shape(m, 1.5 + R() * 0.6, 0.9 * s * dk, (2.6 + R() * 1.2) * s * dk, 2.2, R);
    const soil = I.surface === 'snow' && i % 2 === 0;
    const c0 = soil ? UNDER_SNOW_SOIL : L.ejecta;
    look(m, c0, mix3(c0, L.dust, 0.5), 0.95, 0.0, 0.42);
    book(m, 'burst', R, 2.4 + R() * 0.8, 2);
    heat(m, 0, 1);
    C.media(m);
  }
  if (L.chunkK > 0) {
    const shapeId: ChunkShape = I.surface === 'rock' || I.surface === 'concrete' ? 'stone' : 'clod';
    const chN = Math.round((12 + 8 * s) * L.chunkK);
    for (let i = 0; i < chN; i++) {
      const a = R() * TAU, tilt = 0.1 + R() * 0.9, v = (6 + R() * 14) * Math.pow(s, 0.45) * L.heightK;
      const soil = I.surface === 'snow' && i % 3 === 0;
      chunk(C, shapeId, I.x + (R() - 0.5) * 0.4, by + 0.3, I.z + (R() - 0.5) * 0.4,
        Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v + 2, Math.sin(a) * Math.sin(tilt) * v,
        (0.06 + Math.pow(R(), 2) * 0.22) * Math.sqrt(s) * L.chunkScale, soil ? UNDER_SNOW_SOIL : L.chunk,
        2.6 + R() * 1.6, 0, bo);
    }
  }

  // 3. the dust cloud: one mass, born together over the footprint, swelling fast then slowly, drifting downwind
  const cloudN = Math.round(3 + 1.5 * s);
  const top = (shaped ? 2.4 : 3.6) * s * L.heightK * (heavy ? 1.3 : 1);
  for (let i = 0; i < cloudN; i++) {
    const a = R() * TAU, r = R() * 0.9 * s;
    const h = (0.25 + 0.75 * (i / Math.max(1, cloudN - 1))) * top;
    place(m, I.x + Math.cos(a) * r, by + 0.4 + h * 0.35, I.z + Math.sin(a) * r, bo + 0.02 + R() * 0.08);
    move(m, Math.cos(a) * 2.2 * sq, (3.5 + h * 1.6) * sq, Math.sin(a) * 2.2 * sq, 1.4, 0.35 + R() * 0.25, 0.85, 0);
    shape(m, (7 + R() * 3) * Math.min(1.6, sq), 2.0 * s * dk, (6.5 + R() * 2.5) * s * Math.sqrt(dustK) * dk, 3.2, R);
    look(m, mix3(L.ejecta, L.dust, 0.35), L.dust, Math.min(1, 0.75 * dustK + 0.1), 0.06, 0.45);
    book(m, 'burst', R, 4.2 * Math.min(1.8, sq));
    heat(m, 0, 1);
    C.media(m);
  }

  // 4. base surge: low dust driven out along the ground
  const surgeN = Math.round((4 + 2 * s) * Math.sqrt(dustK));
  for (let i = 0; i < surgeN; i++) {
    const a = (i / surgeN) * TAU + (R() - 0.5) * 0.6;
    const v = (7 + R() * 5) * sq;
    place(m, I.x + Math.cos(a) * 0.8 * s, by + 0.5 * sq, I.z + Math.sin(a) * 0.8 * s, bo + R() * 0.05);
    move(m, Math.cos(a) * v, 0.6 + R() * 0.4, Math.sin(a) * v, 2.8, 0.12, 0.9, 0);
    shape(m, (4.5 + R() * 2) * Math.min(1.5, sq), 1.2 * s * dk, (4.2 + R() * 1.8) * s * Math.sqrt(dustK) * dk, 2.4, R);
    look(m, mix3(L.ejecta, L.dust, 0.6), L.dust, Math.min(0.9, 0.55 * dustK + 0.1), 0.05, 0.4);
    book(m, 'burst', R, 3.6 * Math.min(1.6, sq), 1);
    heat(m, 0, 1);
    C.media(m);
  }

  // 5. residue smoke over the crater
  const resN = shaped ? 1 : 2;
  for (let i = 0; i < resN; i++) {
    const a = R() * TAU;
    place(m, I.x + Math.cos(a) * 0.5 * s, by + 1.0 * s, I.z + Math.sin(a) * 0.5 * s, bo + 0.15 + R() * 0.2);
    move(m, Math.cos(a) * 0.8, 1.6 + R(), Math.sin(a) * 0.8, 1.2, 0.8 + R() * 0.3, 1, 0);
    shape(m, 6 + R() * 2, 1.6 * s * dk, (5.5 + R() * 2) * s * dk, 1.8, R);
    look(m, BLAST_RESIDUE, mix3(BLAST_RESIDUE, L.dust, 0.4), 0.5, 0.4, 0.4);
    book(m, 'billow', R, 5.5, 8);
    heat(m, 0, 1);
    C.media(m);
  }
  if (L.sparks > 0) sparkSpray(C, I.x, by + 0.3, I.z, 0, 1, 0, Math.round(10 * L.sparks), 15, 1.0, 0.45, 0.028, bo);
}

// ---------------------------------------------------------------------------------------------------------------
// A kinetic strike on the ground (AP, APFSDS, autocannon AP, small arms)
// ---------------------------------------------------------------------------------------------------------------

export interface StrikeInput {
  x: number; y: number; z: number;
  /** the shell's travel direction (unit), when known; the spurt kicks forward along it */
  dx: number; dy: number; dz: number;
  caliberMm: number;
  munition: MunitionClass;
  surface: SurfaceKind;
  birthOffset?: number;
}

export function kineticStrike(C: BlastContext, I: StrikeInput): void {
  const L = SURFACE_LOOKS[I.surface];
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const gy = C.groundY(I.x, I.z);
  const by = Math.max(I.y, gy);
  const small = I.munition === 'small_arms';
  // size by calibre: a 12.7 mm round kicks a fist of dust, a 30 mm a bucket, a 120 mm rod a spray of soil
  const s = small ? 0.22 : I.munition === 'autocannon_ap' ? 0.45 : Math.max(0.6, I.caliberMm / 120);
  const dk = C.distBoost(I.x, by, I.z);
  // the spurt leaves along the ricochet line: forward along the shot, thrown up off the ground
  let fx = I.dx, fz = I.dz;
  const fl = Math.hypot(fx, fz);
  if (fl > 1e-3) { fx /= fl; fz /= fl; } else { fx = 0; fz = 0; }
  if (I.surface === 'water') { splash(C, I.x, by, I.z, s, bo); return; }
  const spurtN = small ? 1 : Math.round(2 + s * 2);
  for (let i = 0; i < spurtN; i++) {
    const fwd = 0.35 + R() * 0.5;
    const v = (small ? 4 : 9 + R() * 6) * Math.sqrt(s) * L.heightK;
    place(m, I.x, by + 0.1, I.z, bo + R() * 0.02);
    move(m, (fx * fwd + (R() - 0.5) * 0.5) * v, v * (0.75 + R() * 0.4), (fz * fwd + (R() - 0.5) * 0.5) * v, 2.6, 0.1, 0.6, -5);
    shape(m, (small ? 0.9 : 1.6) + R() * 0.6, 0.35 * s * dk, (1.4 + R() * 0.6) * s * dk * Math.sqrt(L.dustK), 2.2, R);
    look(m, i === 0 ? L.ejecta : mix3(L.ejecta, L.dust, 0.5), L.dust, 0.85, 0.0, 0.4);
    book(m, 'burst', R, 2.2, 3);
    heat(m, 0, 1);
    C.media(m);
  }
  // a little hanging dust where it struck
  place(m, I.x, by + 0.3 * s, I.z, bo + 0.05);
  move(m, fx * 1.2, 0.8, fz * 1.2, 1.4, 0.2, 0.9, 0);
  shape(m, (small ? 1.6 : 3.2) + R(), 0.5 * s * dk, (small ? 1.2 : 2.6) * s * dk * Math.sqrt(L.dustK), 2.4, R);
  look(m, mix3(L.ejecta, L.dust, 0.6), L.dust, 0.6, 0.05, 0.35);
  book(m, 'burst', R, 3.5, 4);
  heat(m, 0, 1);
  C.media(m);
  if (L.chunkK > 0 && !small) {
    const shapeId: ChunkShape = I.surface === 'rock' || I.surface === 'concrete' ? 'stone' : 'clod';
    const n = Math.round((3 + 5 * s) * L.chunkK);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, v = (4 + R() * 8) * Math.sqrt(s);
      chunk(C, shapeId, I.x, by + 0.15, I.z, (Math.cos(a) * 0.6 + fx) * v * 0.7, (0.6 + R() * 0.8) * v,
        (Math.sin(a) * 0.6 + fz) * v * 0.7, (0.04 + R() * 0.08) * s * L.chunkScale + 0.02, L.chunk, 2 + R(), 0, bo);
    }
  }
  if (L.sparks > 0) sparkSpray(C, I.x, by + 0.1, I.z, fx * 0.5, 0.85, fz * 0.5, Math.round((small ? 3 : 8) * L.sparks),
    small ? 9 : 16, 0.8, 0.35, small ? 0.016 : 0.026, bo);
}

function splash(C: BlastContext, x: number, y: number, z: number, s: number, bo: number): void {
  const L = SURFACE_LOOKS.water;
  const R = C.rand;
  const m = C.m;
  const dk = C.distBoost(x, y, z);
  const n = Math.max(1, Math.round(1 + 2 * s));
  for (let i = 0; i < n; i++) {
    place(m, x + (R() - 0.5) * 0.3 * s, y + 0.1, z + (R() - 0.5) * 0.3 * s, bo + R() * 0.03);
    move(m, (R() - 0.5) * 1.5, (7 + R() * 5) * Math.sqrt(s), (R() - 0.5) * 1.5, 1.4, 0, 0.3, -9.8);
    shape(m, 1.0 + R() * 0.4, 0.3 * s * dk, (1.3 + R() * 0.5) * s * dk, 2, R);
    look(m, L.ejecta, L.dust, 0.85, 0.0, 0.5);
    book(m, 'burst', R, 1.8, 2);
    heat(m, 0, 1);
    C.media(m);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------------------------------------------

export function waterBurst(C: BlastContext, I: GroundBurstInput): void {
  const L = SURFACE_LOOKS.water;
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const s = blastScale(I.chargeKg);
  const sq = Math.sqrt(s);
  const wy = I.y;
  const dk = C.distBoost(I.x, wy, I.z);
  lightPuff(C, 'flash', I.x, wy + 0.5 * s, I.z, 0, 0.5, 0, 0.06, 1.2 * s * dk, 3.2 * s * dk, FLASH_WHITE, FLASH_ORANGE, 0.8, 0, bo);
  C.lightPulse(I.x, wy + 2 * s, I.z, 0.4 + 0.2 * s, 0);
  // the column: dense white spray thrown straight up; it tops out and collapses
  const colN = Math.round(4 + 2 * s);
  for (let i = 0; i < colN; i++) {
    const a = R() * TAU, tilt = Math.pow(R(), 2) * 0.18, v = (16 + R() * 10) * sq;
    place(m, I.x + (R() - 0.5) * 0.6 * s, wy + 0.3, I.z + (R() - 0.5) * 0.6 * s, bo + R() * 0.04);
    move(m, Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v, Math.sin(a) * Math.sin(tilt) * v, 1.3, 0, 0.3, -9.8);
    shape(m, 1.7 + R() * 0.7, 1.0 * s * dk, (3.2 + R() * 1.2) * s * dk, 2.2, R);
    look(m, L.ejecta, L.dust, 0.92, 0.0, 0.55);
    book(m, 'burst', R, 2.4, 2);
    heat(m, 0, 1);
    C.media(m);
  }
  // the surge over the surface and the mist the column leaves
  const surgeN = Math.round(4 + 2 * s);
  for (let i = 0; i < surgeN; i++) {
    const a = (i / surgeN) * TAU + (R() - 0.5) * 0.5, v = (6 + R() * 4) * sq;
    place(m, I.x + Math.cos(a) * 0.6 * s, wy + 0.4, I.z + Math.sin(a) * 0.6 * s, bo + R() * 0.05);
    move(m, Math.cos(a) * v, 0.5 + R() * 0.5, Math.sin(a) * v, 2.6, 0.15, 1.0, 0);
    shape(m, 3 + R(), 0.9 * s * dk, (3.8 + R() * 1.2) * s * dk, 2.2, R);
    look(m, L.dust, L.dust, 0.55, 0.03, 0.4);
    book(m, 'burst', R, 3.2, 1);
    heat(m, 0, 1);
    C.media(m);
  }
  const mistN = Math.round(2 + s);
  for (let i = 0; i < mistN; i++) {
    const a = R() * TAU, r = R() * 1.4 * s;
    place(m, I.x + Math.cos(a) * r, wy + 1.0 + R() * 2.0 * s, I.z + Math.sin(a) * r, bo + 0.5 + R() * 0.4);
    move(m, Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6, 1.0, 0.25, 1.2, 0);
    shape(m, 4.5 + R() * 1.5, 2.0 * s * dk, (6 + R() * 2) * s * dk, 1.4, R);
    look(m, L.dust, L.dust, 0.32, 0.3, 0.3);
    book(m, 'burst', R, 4.5, 10);
    heat(m, 0, 1);
    C.media(m);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The muzzle: propellant smoke and the dust the blast lifts off the ground
// ---------------------------------------------------------------------------------------------------------------

export interface MuzzleInput {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  caliberMm: number;
  /** the ground under the muzzle (null: no dust) */
  surface: SurfaceKind | null;
  birthOffset?: number;
  /** 0..1: a scoped own-gun shot keeps the gas off the lens */
  nearAtt?: number;
}

export function muzzleBlast(C: BlastContext, I: MuzzleInput): void {
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const s = Math.max(0.35, Math.min(1.6, I.caliberMm / 120));
  const att = I.nearAtt ?? 1;
  // propellant gas: thrown out of the bore, it stops a few metres out and swells into a pale cloud that drifts off
  const gasN = Math.round(3 + 2 * s);
  for (let i = 0; i < gasN; i++) {
    const along = (i + R() * 0.6) / gasN;
    const v = (10 + 24 * (1 - along)) * s;
    const side = (R() - 0.5) * 0.25;
    place(m, I.x + I.dx * 0.4, I.y + I.dy * 0.4, I.z + I.dz * 0.4, bo + R() * 0.02);
    move(m, I.dx * v + side * I.dz * v, I.dy * v + (R() - 0.2) * 1.2, I.dz * v - side * I.dx * v, 4.2, 0.35, 0.9, 0);
    shape(m, 2.6 + R() * 1.4, 0.6 * s, (2.6 + 2.0 * along + R()) * s, 2.8, R);
    look(m, PROPELLANT, PROPELLANT, 0.62 * att, 0.0, 0.35);
    book(m, 'billow', R, 3.4, 6);
    heat(m, i < 2 ? 0.9 : 0.4, 9);
    C.media(m);
  }
  // the brake's side jets leave two lobes beside the muzzle
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    const lx = I.dz * sgn, lz = -I.dx * sgn;
    place(m, I.x, I.y, I.z, bo);
    move(m, lx * 9 * s + I.dx * 2, 0.6, lz * 9 * s + I.dz * 2, 4.5, 0.3, 0.9, 0);
    shape(m, 2.2 + R(), 0.5 * s, (1.8 + R() * 0.6) * s, 2.8, R);
    look(m, PROPELLANT, PROPELLANT, 0.45 * att, 0.0, 0.35);
    book(m, 'billow', R, 3.0, 6);
    heat(m, 0.5, 10);
    C.media(m);
  }
  // ground dust: the blast wave lifts the surface under and ahead of the muzzle
  if (I.surface) {
    const L = SURFACE_LOOKS[I.surface];
    const gy = C.groundY(I.x, I.z);
    const hAbove = I.y - gy;
    const k = L.blastDust * Math.max(0, 1 - Math.max(0, hAbove - 1.6) / 2.4) * s;
    if (k > 0.05) {
      const n = Math.round(3 + 4 * Math.min(1.3, k));
      for (let i = 0; i < n; i++) {
        // mostly ahead of the bore, some to the sides
        const a = Math.atan2(I.dz, I.dx) + (R() - 0.5) * 2.6;
        const r = 1.0 + R() * 3.0;
        const v = (5 + R() * 6) * Math.sqrt(k);
        const px = I.x + Math.cos(a) * r + I.dx * 1.5, pz = I.z + Math.sin(a) * r + I.dz * 1.5;
        place(m, px, C.groundY(px, pz) + 0.45, pz, bo + 0.02 + R() * 0.06);
        move(m, Math.cos(a) * v, 0.9 + R() * 0.8, Math.sin(a) * v, 2.4, 0.18, 1.0, 0);
        shape(m, 3.2 + R() * 1.8, 1.0, (3.4 + R() * 1.6) * Math.min(1.4, 0.6 + k), 2.2, R);
        look(m, L.dust, L.dust, Math.min(0.85, 0.42 + 0.35 * k) * att, 0.08, 0.4);
        book(m, 'burst', R, 3.6, 4);
        heat(m, 0, 1);
        C.media(m);
      }
    }
  }
}

/** A low dust surge driven out along the ground from under a blast (a hull cooking off, a wall coming down). */
export function dustSurge(C: BlastContext, x: number, y: number, z: number, s: number, surface: SurfaceKind,
  bo: number): void {
  const L = SURFACE_LOOKS[surface === 'water' ? 'soil' : surface];
  const R = C.rand;
  const m = C.m;
  const sq = Math.sqrt(s);
  const dk = C.distBoost(x, y, z);
  const n = Math.round((5 + 2 * s) * Math.sqrt(L.dustK));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (R() - 0.5) * 0.7;
    const v = (6 + R() * 5) * sq;
    place(m, x + Math.cos(a) * 1.4 * s, y + 0.55, z + Math.sin(a) * 1.4 * s, bo + R() * 0.05);
    move(m, Math.cos(a) * v, 0.6 + R() * 0.5, Math.sin(a) * v, 2.6, 0.12, 0.9, 0);
    shape(m, (4.5 + R() * 2) * Math.min(1.5, sq), 1.4 * s * dk, (4.8 + R() * 1.8) * s * Math.sqrt(L.dustK) * dk, 2.4, R);
    look(m, mix3(L.ejecta, L.dust, 0.65), L.dust, Math.min(0.85, 0.5 * L.dustK + 0.12), 0.05, 0.4);
    book(m, 'burst', R, 3.8, 1);
    heat(m, 0, 1);
    C.media(m);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fire: a hull's fireball, a burning column's tick, a smouldering wreck
// ---------------------------------------------------------------------------------------------------------------

/** A hull's death fireball (ammo rack: bigger, taller), cooling into the column's first soot. */
export function killFireball(C: BlastContext, x: number, y: number, z: number, rack: boolean, bo: number): void {
  const R = C.rand;
  const m = C.m;
  const S = rack ? 1.25 : 0.9;
  const dk = C.distBoost(x, y, z);
  const n = rack ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, b = R() * 1.2, v = (3 + R() * 5) * S;
    place(m, x + (R() - 0.5) * 1.6, y + (R() - 0.3) * 1.2, z + (R() - 0.5) * 1.6, bo - R() * 0.03);
    move(m, Math.cos(a) * Math.sin(b) * v, (3 + R() * 3) * S, Math.sin(a) * Math.sin(b) * v, 1.6, 2.6 * S, 0.4, 0);
    shape(m, 3.6 + R() * 1.4, 2.4 * S * dk, (7.5 + R() * 2.5) * S * dk, 2.4, R);
    look(m, SOOT, SOOT, 0.97, 0.0, 0.55);
    book(m, 'billow', R, 3.6);
    heat(m, 1.5, rack ? 0.7 : 0.95);
    C.media(m);
  }
  C.lightPulse(x, y + 2.4, z, rack ? 1 : 0.6, 0);
}

/** One tick of a burning hull's column (stage 1 fresh .. 0 burnt out; scale = the column's own x distance boost). */
export function columnPuff(C: BlastContext, x: number, y: number, z: number, stage: number, scale: number, bo: number): void {
  const R = C.rand;
  const m = C.m;
  const a = R() * TAU, r = R() * 0.5 * scale;
  place(m, x + Math.cos(a) * r, y + 1.0 + R() * 0.6, z + Math.sin(a) * r, bo);
  move(m, Math.cos(a) * 0.6, 2.2 + R() * 0.8, Math.sin(a) * 0.6, 0.7, 2.2 + 1.2 * stage + R() * 0.4, 0.75 + R() * 0.3, 0);
  shape(m, 7 + R() * 2.5, (1.6 + R() * 0.5) * scale, (8.5 + R() * 3) * scale, 1.5, R);
  const grey = mix3(SOOT, BLAST_RESIDUE, 0.25 + 0.5 * (1 - stage));
  look(m, SOOT, grey, 0.62 + 0.3 * stage, 0.25, 0.5);
  book(m, 'billow', R, 7.5 + R() * 2);
  heat(m, 0.55 * stage, 2.4);
  C.media(m);
}

/** A smouldering wreck after its fire: thin grey smoke that rises slowly and drifts. */
export function smolderPuff(C: BlastContext, x: number, y: number, z: number, k: number, bo: number): void {
  const R = C.rand;
  const m = C.m;
  place(m, x + (R() - 0.5) * 1.4, y + 1.2 + R() * 0.6, z + (R() - 0.5) * 1.4, bo);
  move(m, (R() - 0.5) * 0.4, 0.8 + R() * 0.6, (R() - 0.5) * 0.4, 0.9, 0.9 + R() * 0.3, 1, 0);
  shape(m, 7 + R() * 3, 1.0 + R() * 0.4, 5 + R() * 2, 1.4, R);
  look(m, BLAST_RESIDUE, mix3(BLAST_RESIDUE, PROPELLANT, 0.5), 0.12 + 0.22 * k, 0.5, 0.4);
  book(m, 'billow', R, 8, 12);
  heat(m, 0, 1);
  C.media(m);
}
