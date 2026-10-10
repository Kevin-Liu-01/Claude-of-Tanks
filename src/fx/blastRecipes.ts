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
  BLAST_RESIDUE, PROPELLANT, SMOKE_AGED, SOOT, SURFACE_LOOKS, UNDER_SNOW_SOIL, type SurfaceKind,
} from './surfaceLooks.ts';

type Rgb = readonly [number, number, number];
const TAU = Math.PI * 2;

/** The battle pools a recipe may add light with (particles.ts emit options, structurally). */
interface LightPuff {
  pos: [number, number, number]; vel: [number, number, number]; life: number; size0: number; size1: number;
  rot: number; rotVel: number; col0: [number, number, number]; col1: [number, number, number]; alpha: number;
  grav: number; birthOffset: number;
}
interface LightStreak {
  pos: [number, number, number]; vel: [number, number, number]; life: number; width: number; stretch: number;
  grav: number; col: [number, number, number]; alpha: number; seed: number; birthOffset: number;
}
/** An axis-oriented additive cone (particles.ts 'jet'): a shaped charge's jet, a backblast. */
interface LightJet {
  pos: [number, number, number]; axis: [number, number, number]; life: number; width: number; len0: number;
  len1: number; seed: number; col: [number, number, number]; alpha: number; birthOffset: number;
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
  jet(o: LightJet): void;
  /** the pressure ring racing out over the ground (scale x the battle ring) */
  shockRing(x: number, z: number, scaleK: number, alphaK: number, ageS: number): void;
  /** pulse the pooled explosion light (peak x the battle's explosion peak) after delayS, over durS (default: the kill
   *  light's long decay), in its own hue (default: the kill light's orange) */
  lightPulse(x: number, y: number, z: number, peakK: number, delayS: number, durS?: number, hex?: number): void;
  /** the burst's light inside the media round it (volumeMedia glow sources): centre, radius m, peak, duration s */
  glow(x: number, y: number, z: number, radiusM: number, peak: number, durS: number, birthOffset: number): void;
  /** camera-distance size boost (1 inside ~90 m) so far blasts still read */
  distBoost(x: number, y: number, z: number): number;
  /** 1 on desktop; the phone tier never builds this context */
  readonly tier: number;
  readonly m: VolumePuff;
  readonly k: ChunkPiece;
  readonly lp: LightPuff;
  readonly ls: LightStreak;
  readonly lj: LightJet;
}

const FLASH_WHITE: Rgb = [1, 0.96, 0.86];
const FLASH_ORANGE: Rgb = [1, 0.55, 0.16];
const FIRE_HOT: Rgb = [1, 0.84, 0.5];
const FIRE_DEEP: Rgb = [0.95, 0.32, 0.06];
const SPARK: Rgb = [1, 0.78, 0.45];
/** (round 7c: the ground under a burst lay red) a detonation's light is hotter than a burning hull's */
const BURST_LIGHT_HEX = 0xff9a52;
const _c: [number, number, number] = [0, 0, 0];

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  _c[0] = a[0] + (b[0] - a[0]) * t; _c[1] = a[1] + (b[1] - a[1]) * t; _c[2] = a[2] + (b[2] - a[2]) * t;
  return _c;
}
/** mix3 into a second scratch: for a call that blends two colours at once (mix3 twice would hand both the same one) */
const _d: [number, number, number] = [0, 0, 0];
function mix3b(a: Rgb, b: Rgb, t: number): Rgb {
  _d[0] = a[0] + (b[0] - a[0]) * t; _d[1] = a[1] + (b[1] - a[1]) * t; _d[2] = a[2] + (b[2] - a[2]) * t;
  return _d;
}
/** two more scratches for colours a recipe holds across its loops (a burst's smoke at birth and aged); each component is
 *  read before it is written, so a mix may take its own scratch as `a` */
const _e: [number, number, number] = [0, 0, 0];
const _f: [number, number, number] = [0, 0, 0];
function mixInto(out: [number, number, number], a: Rgb, b: Rgb, t: number): Rgb {
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
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
  m.startFrame = startFrame; m.aspect = 1;
}
/** A card wider than tall (a skirt of dust lying on the ground) or taller than wide (a jet of soil), held near level. */
function card(m: VolumePuff, aspect: number, R: () => number, tilt = 0.08): void {
  m.aspect = aspect; m.rot = (R() - 0.5) * tilt * 2; m.spin = (R() - 0.5) * 0.02;
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

interface GroundBurstInput {
  x: number; y: number; z: number;
  munition: MunitionClass;
  chargeKg: number;
  surface: SurfaceKind;
  birthOffset?: number;
  /** the round's travel direction (unit) when known: a shaped charge's jet flashes back along it */
  dx?: number; dy?: number; dz?: number;
}

/**
 * An explosive burst on (or just above) the ground. Round 7 (wave 276: "the 1.2 kg FPV, the 3.4 kg ATGM and the 125 mm
 * HE look nearly identical", thrown soil "a vertical chain of separate brown balls", debris "flat unlit black squares",
 * "a ring of haystack puffs", "a flat orange glow wash on the ground for 800 ms"): each munition class has its own
 * birth, sized by its charge —
 *   - a shaped charge (FPV, ATGM, HEAT): a bright jet out of the hole and a sharp, narrow spike of dark smoke and fine
 *     soil driven up its line; it digs little and throws little dust;
 *   - HE: a dense dark fountain of earth in a cone;
 *   - the heavy rounds (152 mm, missiles, rockets): a big dark column, a shock ring, twice the earth.
 * The thrown soil is mostly real clods (lit, in the soil's colour, drawn out along their flight) that arc and fall back
 * within a second or two and lie where they land; the media are the fine soil, the smoke and the dust: many small
 * overlapping puffs filling the fountain (never a few stretched cards stacked up a column), one dust cloud, and a thin
 * ring racing out along the ground. The fireball is the charge's own (~3.9 kg^0.32 m across) and brief; its light lies on
 * the ground for ~0.2 s and glows inside the burst's own medium for a moment. Water bursts go to waterBurst.
 */
export function groundBurst(C: BlastContext, I: GroundBurstInput): void {
  if (I.surface === 'water') { waterBurst(C, I); return; }
  const L = SURFACE_LOOKS[I.surface];
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const kg = Math.max(0.05, I.chargeKg);
  const s = blastScale(kg);
  const sq = Math.sqrt(s);
  const gy = C.groundY(I.x, I.z);
  const by = Math.max(I.y, gy);
  const dk = C.distBoost(I.x, by, I.z);
  const shaped = I.munition === 'heat' || I.munition === 'atgm' || I.munition === 'drone_fpv';
  const fpv = I.munition === 'drone_fpv';
  const heavy = I.munition === 'howitzer' || I.munition === 'missile' || I.munition === 'rocket';
  const thermobaric = I.munition === 'rocket';
  const hard = I.surface === 'rock' || I.surface === 'concrete' || I.surface === 'metal';
  const dustK = L.dustK * (shaped ? 0.6 : 1);
  // the fireball's width: an open-air TNT fireball is ~3.9 kg^0.32 m across (the drone's 1.2 kg ~4 m, the 125 mm's
  // 3.5 kg ~5.8 m, the gunship's 20 kg ~10 m); a shaped charge's explosive drives its jet, its ball is smaller
  const D = 3.9 * Math.pow(kg, 0.32) * (shaped ? 0.7 : 1) * (thermobaric ? 1.35 : 1);
  if (heavy || s >= 1.6) C.shockRing(I.x, I.z, 0.5 + 0.38 * s, Math.min(1.3, 0.55 + 0.28 * s), Math.max(0, -bo));

  // 1. the flash (it lasts long enough to land on a 10 fps frame) and the fireball: the charge's width, swelling out of
  // one core in a tenth of a second, cooling to dark smoke and soil inside a quarter
  // (round 7c, DVIDS 954922: the charge's dome is white-hot on the event frame and full and saturated a frame later;
  // ours had cooled away by +0.1 s) the dome holds ~0.15 s
  lightPuff(C, 'flash', I.x, by + 0.3 * D, I.z, 0, 0.8, 0, 0.15, 0.7 * D * dk, 1.25 * D * dk, FLASH_WHITE, FLASH_ORANGE, 1, 0, bo);
  const fireN = shaped ? 2 : heavy ? 5 : 3;
  for (let i = 0; i < fireN; i++) {
    const a = R() * TAU, v = (2 + R() * 3) * sq;
    lightPuff(C, 'fire', I.x + Math.cos(a) * 0.08 * D, by + 0.25 * D, I.z + Math.sin(a) * 0.08 * D,
      Math.cos(a) * v, v * 0.8 + 1, Math.sin(a) * v, 0.2 + R() * 0.1, 0.3 * D * dk, (0.6 + R() * 0.15) * D * dk,
      mix3(FIRE_HOT, FIRE_DEEP, 0.3), FIRE_DEEP, 0.8, 1.5, bo + 0.005);
  }
  const ballN = thermobaric ? 5 : heavy ? 4 : shaped ? 2 : 3;
  const ballC0: Rgb = shaped || thermobaric ? SOOT : mix3b(SOOT, L.ejecta, 0.55);
  for (let i = 0; i < ballN; i++) {
    const a = R() * TAU;
    place(m, I.x + Math.cos(a) * 0.1 * D, by + (0.18 + 0.2 * R()) * D, I.z + Math.sin(a) * 0.1 * D, bo - 0.01);
    move(m, Math.cos(a) * 0.8 * D, (0.8 + R() * 0.6) * D * (shaped ? 1.5 : 1), Math.sin(a) * 0.8 * D, 3.2,
      thermobaric ? 1.6 : 0.5, 0.5, 0);
    const life = thermobaric ? 3.0 + R() * 0.6 : 1.4 + R() * 0.5;
    shape(m, life, 0.45 * D * dk, (0.85 + 0.25 * R()) * D * dk, 5, R);
    look(m, ballC0, mix3(ballC0, SMOKE_AGED, 0.35), 0.95, 0.0, 0.5);
    book(m, 'billow', R, life);
    // white-orange for the shaped charge's sharp flash, orange for HE (mostly hidden in its own soil), rolling for the
    // thermobaric rocket; (round 7c) still glowing orange inside its smoke at +0.3 s, as the real charges do
    heat(m, thermobaric ? 1.45 : shaped ? 1.3 : 1.12, thermobaric ? 1.6 : shaped ? 9 : heavy ? 5 : 6);
    C.media(m);
  }
  // the light: on the ground for ~0.2 s (a bright ground takes far less of it), and inside the burst's own medium
  const albedoK = I.surface === 'snow' ? 0.3 : I.surface === 'sand' ? 0.5 : hard ? 0.6 : 1;
  C.lightPulse(I.x, by + 0.6 * D, I.z, Math.min(0.75, 0.25 + 0.14 * s) * albedoK, 0, heavy ? 0.32 : shaped ? 0.16 : 0.22,
    BURST_LIGHT_HEX);
  C.glow(I.x, by + 0.4 * D, I.z, 1.3 * D, heavy ? 1.1 : shaped ? 0.7 : 0.9, heavy ? 0.42 : shaped ? 0.22 : 0.3, bo);

  // 1b. (round 7c, DVIDS 954922: by +0.3 s the fireball is inside its own smoke, a lobed grey-brown cloud that keeps
  // climbing on its heat for seconds, leaning downwind and thinning; b8a's stopped as a tan haystack on the ground) the
  // explosive's smoke: puffs born out of the cooling fireball and driven up by its heat, the upper ones faster so the
  // cloud stretches into a lobed column, each glowing a moment at its heart
  // (7d: separate blue-grey lobes from ~2.4 s) more, smaller puffs overlapping into one lobed mass
  const smokeN = thermobaric || heavy ? 14 : shaped ? 6 : 10;
  // (on snow, the dark soil it throws from under the snow: HE on snow is dark smoke over white powder)
  const snowy = I.surface === 'snow';
  const soilC = snowy ? UNDER_SNOW_SOIL : L.ejecta;
  // (wave 293: "separate brown and blue-grey balls") born a dark soot-brown with the soil's dust in it, and every smoke
  // puff of the burst (the explosive's and the column's) ages to the same warm grey-brown
  const smokeC0: Rgb = shaped || thermobaric ? SOOT
    : snowy ? mixInto(_e, SOOT, soilC, 0.35) : mixInto(_e, mixInto(_e, SOOT, soilC, 0.45), L.dust, 0.2);
  const smokeAged: Rgb = snowy ? mixInto(_f, SMOKE_AGED, soilC, 0.2)
    : mixInto(_f, mixInto(_f, SMOKE_AGED, L.dust, 0.3), soilC, 0.12);
  for (let i = 0; i < smokeN; i++) {
    const u = (i + R()) / smokeN;
    const a = R() * TAU, r = R() * 0.25 * D;
    place(m, I.x + Math.cos(a) * r, by + (0.25 + 0.45 * u) * D, I.z + Math.sin(a) * r, bo + 0.06 + 0.12 * u);
    const lift = (2.4 + 1.8 * u) * sq * (heavy ? 1.3 : 1) * (shaped ? 0.8 : 1);
    // (wave 293) it billows outward as it climbs, not up a chimney
    const out = (0.8 + 1.4 * R()) * sq;
    move(m, Math.cos(a) * out, lift, Math.sin(a) * out, 1.1, (0.35 + 0.25 * u) * Math.sqrt(sq), 1.0, 0);
    // (DVIDS 954922: still a thin grey cloud drifting high at +7 s) it thins out over ten seconds or so
    const life = (9 + 4 * R()) * (heavy ? 1.3 : 1) * (shaped ? 0.8 : 1);
    // (wave 293: the real cloud has grown about eight-fold by +2 s) most of its swelling in its first two seconds
    shape(m, life, 0.35 * D * dk, (1.15 + 0.5 * u + 0.3 * R()) * D * dk, 3.2, R);
    look(m, smokeC0, smokeAged, 0.92, 0.0, 0.55);
    book(m, 'billow', R, life);
    heat(m, 0.32, 4.5);
    C.media(m);
  }

  // 2a. a shaped charge's spike: the jet flashes out of the hole it drilled (back along the round's line; straight up when
  // the line is unknown), and dark smoke and fine soil are driven up that line in a tight cone — many small puffs
  // launched together at continuous speeds, so they fill one narrow column from the ground to its top and stall there
  if (shaped) {
    let ax = 0, ay = 1, az = 0;
    if (I.dx !== undefined) {
      const jl = Math.hypot(I.dx ?? 0, I.dy ?? 0, I.dz ?? 0) || 1;
      ax = -(I.dx ?? 0) / jl; ay = Math.abs((I.dy ?? 0) / jl) * 0.6 + 0.4; az = -(I.dz ?? 0) / jl;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al; ay /= al; az /= al;
    }
    const j = C.lj;
    j.pos[0] = I.x; j.pos[1] = by + 0.15; j.pos[2] = I.z;
    j.axis[0] = ax; j.axis[1] = ay; j.axis[2] = az;
    j.life = 0.14; j.width = (fpv ? 0.35 : 0.5) * s * dk; j.len0 = 0.8; j.len1 = (fpv ? 5 : 8) * s * dk; j.seed = R();
    j.col[0] = 1; j.col[1] = 0.92; j.col[2] = 0.7; j.alpha = 1; j.birthOffset = bo;
    C.jet(j);
    // the spike rises nearly straight up, leaning a little back along the round's line (the jet's flash is the line)
    ax *= 0.3; az *= 0.3; ay = 1;
    const sl = Math.hypot(ax, ay, az);
    ax /= sl; ay /= sl; az /= sl;
    // a basis round the spike's axis
    let ux = -az, uz = ax, uy = 0;
    if (ux * ux + uz * uz < 1e-4) { ux = 1; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux;
    // (b8: a chain of separate grey balls) bigger puffs, launched closer in speed, overlap from the ground to the top
    // (round 7c, b8a: still a string of beads) twice as many, larger: their dark hearts merge into one jet
    const spikeN = fpv ? 14 : 20;
    const vMax = (fpv ? 22 : 30) * sq * L.heightK;
    for (let i = 0; i < spikeN; i++) {
      const u = (i + R()) / spikeN;
      const tilt = R() * 0.09, az2 = R() * TAU, st = Math.sin(tilt), ct = Math.cos(tilt);
      const dxs = ax * ct + (ux * Math.cos(az2) + wx * Math.sin(az2)) * st;
      const dys = ay * ct + (uy * Math.cos(az2) + wy * Math.sin(az2)) * st;
      const dzs = az * ct + (uz * Math.cos(az2) + wz * Math.sin(az2)) * st;
      const v = vMax * (0.45 + 0.55 * u);
      place(m, I.x + (R() - 0.5) * 0.3, by + 0.25, I.z + (R() - 0.5) * 0.3, bo + R() * 0.03);
      move(m, dxs * v, dys * v, dzs * v, 2.8, 0.25, 0.6, -2.5);
      // (wave 293: "a man's width across that stops growing") as narrow at birth, then it keeps swelling all its life
      const life = 5.0 + R() * 2.0;
      const size1 = (3.0 + 1.6 * u + R() * 0.6) * s * dk;
      shape(m, life, size1 * 0.3, size1, 1.4, R);
      // dense enough that no sky shows through (b8: thin puffs read blue-grey)
      look(m, mix3b(SOOT, L.ejecta, 0.3 + 0.3 * R()), mix3(SOOT, SMOKE_AGED, 0.45), 1.0, 0.0, 0.55);
      book(m, 'burst', R, life, 1);
      heat(m, i < 2 ? 0.5 : 0, 6);
      C.media(m);
    }
    // the burnt liner and the explosive's smoke at its foot: dark grey-black, low and dense
    for (let i = 0; i < 2; i++) {
      const a = R() * TAU;
      place(m, I.x + Math.cos(a) * 0.3, by + 0.5, I.z + Math.sin(a) * 0.3, bo + 0.02);
      move(m, Math.cos(a) * 1.4, 1.6 + R(), Math.sin(a) * 1.4, 1.8, 0.35, 0.8, 0);
      const life = 5.0 + R() * 2.0;
      shape(m, life, 0.8 * s * dk, (3.0 + R() * 1.0) * s * dk, 2.0, R);
      look(m, SOOT, mix3(SOOT, SMOKE_AGED, 0.45), 0.85, 0.0, 0.45);
      book(m, 'billow', R, life);
      heat(m, 0.5, 4.0);
      C.media(m);
    }
    // the drone's warhead throws its fragments
    if (fpv) sparkSpray(C, I.x, by + 0.4, I.z, 0, 1, 0, 26, 24, 1.3, 0.35, 0.022, bo);
  }

  // 2b. the earth: a dense dark fountain in a cone (HE ~20°, the heavy rounds wider and far taller) — many small puffs of
  // fine soil launched together at continuous speeds, so they fill the fountain from the ground up, arc over and fall
  // back into the cloud within about two seconds
  const vTop = 20 * Math.pow(s, 0.6) * L.heightK * (heavy ? 1.35 : 1);
  if (!shaped) {
    // (b8: still a spray of separate brown balls) the core: a dense dark jet of big puffs driven up a tight cone (~10°)
    // together, swelling fast, so their union is one column from the ground to its top; the spray round it: smaller
    // puffs thrown wider (to ~25°) that arc over and fall back
    const kEarth = Math.min(1.2, 0.5 + 0.5 * L.chunkK + 0.3 * (L.dustK - 1));
    const coreN = Math.round((10 + 6 * s) * (heavy ? 1.4 : 1) * kEarth);
    for (let i = 0; i < coreN; i++) {
      const u = (i + R()) / coreN;
      const a = R() * TAU, tilt = 0.17 * Math.sqrt(R());
      const v = vTop * (0.35 + 0.65 * u);
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      place(m, I.x + (R() - 0.5) * 0.4 * s, by + 0.4, I.z + (R() - 0.5) * 0.4 * s, bo + R() * 0.02);
      move(m, Math.cos(a) * st * v, ct * v, Math.sin(a) * st * v, 1.6, 0, 0.35, -9.8);
      const life = 1.7 + R() * 0.7 + (heavy ? 0.4 : 0);
      const size1 = (1.9 + 1.2 * u + R() * 0.6) * Math.pow(s, 0.85) * dk * (heavy ? 1.2 : 1);
      shape(m, life, size1 * 0.45, size1, 3.2, R);
      const c0 = I.surface === 'snow' && i % 2 === 0 ? UNDER_SNOW_SOIL : L.ejecta;
      look(m, c0, mix3(c0, L.dust, 0.5), 1.0, 0.0, 0.6);
      book(m, 'burst', R, life, 1);
      heat(m, 0, 1);
      C.media(m);
    }
    const sprayN = Math.round((8 + 5 * s) * (heavy ? 1.4 : 1) * kEarth);
    for (let i = 0; i < sprayN; i++) {
      const a = R() * TAU, tilt = 0.2 + 0.25 * Math.sqrt(R());
      const v = vTop * (0.3 + 0.5 * R());
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      place(m, I.x + (R() - 0.5) * 0.4 * s, by + 0.35, I.z + (R() - 0.5) * 0.4 * s, bo + R() * 0.03);
      move(m, Math.cos(a) * st * v, ct * v, Math.sin(a) * st * v, 1.5, 0, 0.35, -9.8);
      const life = 1.3 + R() * 0.6;
      const size1 = (0.9 + R() * 0.6) * s * dk;
      shape(m, life, size1 * 0.4, size1, 2.6, R);
      const c0 = I.surface === 'snow' && i % 2 === 0 ? UNDER_SNOW_SOIL : L.ejecta;
      look(m, c0, mix3(c0, L.dust, 0.45), 1.0, 0.0, 0.6);
      book(m, 'burst', R, life, 1);
      heat(m, 0, 1);
      C.media(m);
    }
    // the fine dust left standing where the earth passed: the column's foot it rises out of and falls back into
    const colTop = 0.3 * vTop;
    const pillarN = heavy ? 3 : 2;
    for (let i = 0; i < pillarN; i++) {
      const h = (0.12 + 0.3 * (i + R() * 0.5) / pillarN) * colTop;
      place(m, I.x + (R() - 0.5) * 0.6 * s, by + h, I.z + (R() - 0.5) * 0.6 * s, bo + 0.15 + R() * 0.15);
      move(m, (R() - 0.5) * 0.6, 0.6 + R() * 0.6, (R() - 0.5) * 0.6, 1.4, 0.12, 0.9, 0);
      const life = (4.2 + R() * 1.5) * L.hang;
      const size1 = (1.7 + 0.7 * R()) * s * dk * (heavy ? 1.3 : 1);
      shape(m, life, size1 * 0.5, size1, 2.2, R);
      // (wave 293: "a tan haystack mound") the soil's own dark, thinner
      look(m, mix3(L.ejecta, L.dust, 0.3), mix3b(mix3b(L.ejecta, L.dust, 0.5), SMOKE_AGED, 0.35),
        Math.min(0.45, 0.28 * dustK + 0.1), 0.15, 0.45);
      book(m, 'burst', R, life, 3);
      heat(m, 0, 1);
      C.media(m);
    }
    // (round 7c, b8a: the column was gone at 2 s and a haystack stayed) when its earth falls back the column leaves its
    // fine soil standing along its height: grey-brown smoke that drifts off downwind and thins
    const colSmokeN = heavy ? 4 : 3;
    for (let i = 0; i < colSmokeN; i++) {
      const h = (0.35 + 0.5 * (i + R() * 0.6) / colSmokeN) * colTop;
      place(m, I.x + (R() - 0.5) * 0.8 * s, by + h, I.z + (R() - 0.5) * 0.8 * s, bo + 0.3 + R() * 0.25);
      move(m, (R() - 0.5) * 0.8, 0.4 + R() * 0.5, (R() - 0.5) * 0.8, 1.2, 0.2 + 0.15 * R(), 1.0, 0);
      const life = (6 + R() * 2.5) * L.hang * (heavy ? 1.2 : 1);
      const size1 = (2.2 + 0.8 * R()) * s * dk * (heavy ? 1.3 : 1);
      shape(m, life, size1 * 0.45, size1, 1.8, R);
      const soil = I.surface === 'snow' && i % 2 === 0 ? UNDER_SNOW_SOIL : L.ejecta;
      look(m, mix3(soil, SMOKE_AGED, 0.35), smokeAged, 0.75, 0.12, 0.5);
      book(m, 'billow', R, life);
      heat(m, 0, 1);
      C.media(m);
    }
  }

  // 2c. the clods: lumps of the ground itself, lit and in its colour, drawn out along their flight; most are thrown low
  // and fall back within a second or two, a few go high; they lie where they land (~20 s) and settle into the ground
  if (L.chunkK > 0) {
    const shapeId: ChunkShape = I.surface === 'rock' || I.surface === 'concrete' ? 'stone' : 'clod';
    const n = Math.round((shaped ? (fpv ? 26 : 40) : (70 + 45 * s) * (heavy ? 1.5 : 1)) * L.chunkK);
    const vC = 15 * Math.pow(s, 0.4) * L.heightK;
    const coneC = shaped ? 0.25 : heavy ? 0.6 : 0.55;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, tilt = coneC * Math.pow(R(), 0.7);
      const v = vC * (0.25 + 0.75 * Math.pow(R(), 2.2));
      const big = R() < 0.04;
      const sc = (big ? 0.16 + R() * 0.14 : 0.04 + Math.pow(R(), 2.2) * 0.16) * sq * L.chunkScale * dk;
      const soil = I.surface === 'snow' && i % 3 === 0;
      chunk(C, shapeId, I.x + (R() - 0.5) * 0.5 * s, by + 0.3, I.z + (R() - 0.5) * 0.5 * s,
        Math.cos(a) * Math.sin(tilt) * v, Math.cos(tilt) * v + 1, Math.sin(a) * Math.sin(tilt) * v,
        sc, soil ? UNDER_SNOW_SOIL : L.chunk, 14 + R() * 10, 0, bo + R() * 0.03);
    }
  }

  // 3. the dust the blast raised over its footprint: low and wide, out past the fireball, drifting downwind and thinning
  // (wave 276: the dust that ages and drifts reads) — never a mound (round 7c: b8a's dense dome of tan puffs sat on the
  // ground for eight seconds, a haystack; DVIDS 954922's dust is a thin grey-brown sheet under the climbing smoke)
  const cloudN = Math.round(5 + 2 * s);
  const top = (shaped ? 1.8 : 2.6) * s * L.heightK * (heavy ? 1.6 : 1);
  // (7d: still tan mounds to ~4 s) half as dense again, born wider and thrown out faster, greyer, shorter-lived
  // (wave 293: "a tan haystack mound with a crisp rim ... a thin dark soil-coloured sheet") the soil's own dark brown,
  // in the soft-edged medium (the burst flipbook's rim is crisp)
  const hazeC1 = mix3b(mix3b(L.ejecta, L.dust, 0.5), SMOKE_AGED, 0.35);
  for (let i = 0; i < cloudN; i++) {
    const a = R() * TAU, r = (0.5 + 1.4 * R()) * s;
    const h = (0.1 + 0.3 * R()) * top;
    place(m, I.x + Math.cos(a) * r, by + 0.3 + h * 0.2, I.z + Math.sin(a) * r, bo + 0.04 + R() * 0.1);
    move(m, Math.cos(a) * 4.5 * sq, (0.4 + h * 0.25) * sq, Math.sin(a) * 4.5 * sq, 1.5, 0.04 + R() * 0.06, 1.0, 0);
    const size1 = (3.2 + R() * 2.4) * s * Math.sqrt(dustK) * dk * (heavy ? 1.25 : 1);
    const life = (3.5 + R() * 2) * Math.min(1.6, sq) * L.hang;
    shape(m, life, size1 * 0.35, size1, 2.0, R);
    look(m, mix3(L.ejecta, L.dust, 0.4), hazeC1, Math.min(0.42, 0.28 * dustK + 0.08), 0.05, 0.35);
    book(m, 'billow', R, life);
    card(m, 1.5 + R() * 0.35, R, 0.2);
    m.spin = (R() - 0.5) * 0.1;
    heat(m, 0, 1);
    C.media(m);
  }

  // 4. the ring: the blast wave throws the surface dust out along the ground as one thin ring that races out, stalls a
  // few metres out and thins away in two seconds — many low, wide, overlapping cards, never a row of mounds
  const ringN = Math.round((shaped ? 14 : 18 + 4 * s) * Math.sqrt(L.dustK));
  const ringV = (shaped ? 13 : 11.5) * sq;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * TAU + (R() - 0.5) * (TAU / ringN);
    const v = ringV * (0.8 + R() * 0.4);
    place(m, I.x + Math.cos(a) * 0.5 * s, by + 0.2 * sq, I.z + Math.sin(a) * 0.5 * s, bo + 0.01 + R() * 0.03);
    move(m, Math.cos(a) * v, 0.3 + R() * 0.2, Math.sin(a) * v, 3.2, 0.05, 0.8, 0);
    // (round 7c, DVIDS 954922: the sheet still lies along the ground at +2 s) it hangs ~2-3 s
    const life = (2.2 + R() * 1.0) * (shaped ? 0.85 : 1) * Math.max(0.7, L.hang);
    const size1 = (1.6 + R() * 0.8) * s * Math.sqrt(L.dustK) * dk * (shaped ? 0.75 : 1);
    shape(m, life, size1 * 0.3, size1, 1.8, R);
    look(m, mix3(L.ejecta, L.dust, 0.5), mix3b(mix3b(L.ejecta, L.dust, 0.6), SMOKE_AGED, 0.3),
      Math.min(0.38, 0.22 * L.dustK + 0.08) * (shaped ? 0.8 : 1), 0.0, 0.35);
    book(m, 'burst', R, life * 1.2, 2);
    card(m, 3.0 + R() * 0.8, R, 0.04);
    heat(m, 0, 1);
    C.media(m);
  }

  // 5. a hard ground keeps a little pale smoke over the strike (soil, sand and snow bury it in their own dust: wave 276's
  // "translucent blue-grey sphere" was this puff floating up out of the cloud)
  if (hard) {
    const a = R() * TAU;
    place(m, I.x + Math.cos(a) * 0.4 * s, by + 0.8 * s, I.z + Math.sin(a) * 0.4 * s, bo + 0.15);
    move(m, Math.cos(a) * 0.6, 1.0 + R() * 0.6, Math.sin(a) * 0.6, 1.2, 0.3, 1, 0);
    const life = 5 + R() * 2;
    shape(m, life, 1.4 * s * dk, (4.5 + R() * 1.5) * s * dk, 1.8, R);
    look(m, mix3(BLAST_RESIDUE, L.dust, 0.5), L.dust, 0.4, 0.3, 0.4);
    book(m, 'billow', R, life, 8);
    heat(m, 0, 1);
    C.media(m);
  }
  if (L.sparks > 0) sparkSpray(C, I.x, by + 0.3, I.z, 0, 1, 0, Math.round(10 * L.sparks), 15, 1.0, 0.45, 0.028, bo);
}

// ---------------------------------------------------------------------------------------------------------------
// A kinetic strike on the ground (AP, APFSDS, autocannon AP, small arms)
// ---------------------------------------------------------------------------------------------------------------

interface StrikeInput {
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
  // (round 4: a 12.7 mm burst on Verdant's dirt was invisible at 18 m: a heavy bullet's spurt stands half a metre)
  const s = small ? 0.34 : I.munition === 'autocannon_ap' ? 0.45 : Math.max(0.6, I.caliberMm / 120);
  const dk = C.distBoost(I.x, by, I.z);
  // the spurt leaves along the ricochet line: forward along the shot, thrown up off the ground
  let fx = I.dx, fz = I.dz;
  const fl = Math.hypot(fx, fz);
  if (fl > 1e-3) { fx /= fl; fz /= fl; } else { fx = 0; fz = 0; }
  if (I.surface === 'water') { splash(C, I.x, by, I.z, s, bo); return; }
  // a spray of soil standing up along the ricochet line (tall, narrow, overlapping: round 3's round spurts read as a
  // row of small balls)
  const spurtN = small ? 2 : Math.round(2 + s * 2);
  for (let i = 0; i < spurtN; i++) {
    const fwd = 0.35 + R() * 0.5;
    const v = (small ? 5 : 9 + R() * 6) * Math.sqrt(s) * L.heightK;
    place(m, I.x + fx * 0.15 * i, by + 0.1, I.z + fz * 0.15 * i, bo + R() * 0.02);
    move(m, (fx * fwd + (R() - 0.5) * 0.4) * v, v * (0.8 + R() * 0.4), (fz * fwd + (R() - 0.5) * 0.4) * v, 2.6, 0.1, 0.6, -5);
    shape(m, (small ? 0.8 : 1.6) + R() * 0.6, 0.35 * s * dk, (1.6 + R() * 0.6) * s * dk * Math.sqrt(L.dustK), 2.2, R);
    look(m, i === 0 ? L.ejecta : mix3(L.ejecta, L.dust, 0.5), L.dust, 0.9, 0.0, 0.4);
    book(m, 'burst', R, 2.2, 3);
    card(m, 0.55 + R() * 0.15, R, 0.15);
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
        (Math.sin(a) * 0.6 + fz) * v * 0.7, (0.04 + R() * 0.08) * s * L.chunkScale + 0.02, L.chunk, 10 + R() * 6, 0, bo);
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
// On armour: a round bursting on a hull, and the fragments of a burst striking the hulls around it
// ---------------------------------------------------------------------------------------------------------------

interface PlateBurstInput {
  x: number; y: number; z: number;
  /** the struck plate's outward normal */
  nx: number; ny: number; nz: number;
  munition: MunitionClass;
  chargeKg: number;
  /** the ground under the burst (its dust when the burst is low), null when it is high */
  ground: SurfaceKind | null;
  birthOffset?: number;
}

/**
 * An explosive round bursting on a hull (HE, HESH, HEAT, ATGM, FPV, missiles): the flash, a fireball that cools to
 * residue smoke thrown off the plate, fragments sparking off it, and the ground's dust when the burst sits low.
 */
export function plateBurst(C: BlastContext, I: PlateBurstInput): void {
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const s = blastScale(I.chargeKg);
  const dk = C.distBoost(I.x, I.y, I.z);
  const nl = Math.hypot(I.nx, I.ny, I.nz) || 1;
  const nx = I.nx / nl, ny = I.ny / nl, nz = I.nz / nl;
  lightPuff(C, 'flash', I.x + nx * 0.3, I.y + ny * 0.3, I.z + nz * 0.3, nx, ny + 0.5, nz, 0.07, 1.3 * s * dk,
    3.6 * s * dk, FLASH_WHITE, FLASH_ORANGE, 1, 0, bo);
  const fireN = Math.round(3 + s);
  for (let i = 0; i < fireN; i++) {
    const v = (3 + R() * 5) * s;
    lightPuff(C, 'fire', I.x + nx * 0.4, I.y + ny * 0.4, I.z + nz * 0.4,
      (nx + (R() - 0.5) * 1.2) * v, (ny + 0.4 + R() * 0.5) * v, (nz + (R() - 0.5) * 1.2) * v,
      0.13 + R() * 0.12, 0.8 * s * dk, (2.0 + R()) * s * dk, FIRE_HOT, FIRE_DEEP, 0.9, 1.5, bo);
  }
  const ballN = 2 + (s > 1.6 ? 1 : 0);
  for (let i = 0; i < ballN; i++) {
    place(m, I.x + nx * 0.6 * s, I.y + ny * 0.6 * s + 0.2, I.z + nz * 0.6 * s, bo - 0.02);
    move(m, (nx + (R() - 0.5) * 0.8) * 3 * s, (ny * 3 + 2 + R() * 2) * s, (nz + (R() - 0.5) * 0.8) * 3 * s, 2.2, 1.2, 0.6, 0);
    shape(m, 2.6 + R() * 0.8, 1.0 * s * dk, (3.6 + R()) * s * dk, 2.6, R);
    look(m, BLAST_RESIDUE, mix3(BLAST_RESIDUE, PROPELLANT, 0.3), 0.85, 0.0, 0.45);
    book(m, 'billow', R, 3.2);
    heat(m, 1.35, 4.2);
    C.media(m);
  }
  sparkSpray(C, I.x, I.y, I.z, nx, ny, nz, Math.round(14 + 8 * s), 20 * Math.sqrt(s), 1.2, 0.45, 0.026, bo);
  C.lightPulse(I.x + nx, I.y + 1.5, I.z + nz, Math.min(1.4, 0.4 + 0.3 * s), 0);
  if (I.ground) dustSurge(C, I.x, C.groundY(I.x, I.z), I.z, Math.max(0.8, s * 0.8), I.ground, bo + 0.02);
}

/** The kinetic results on armour that armorHit draws (the battle's shell:hit kinds; HE and shaped charges are plateBurst). */
export type ArmorHitKind = 'pen' | 'nonpen' | 'ricochet' | 'spaced' | 'era';

interface ArmorHitInput {
  x: number; y: number; z: number;
  /** the struck plate's outward normal */
  nx: number; ny: number; nz: number;
  caliberMm: number;
  kind: ArmorHitKind;
  birthOffset?: number;
}

/** ERA cassettes' dark olive steel. */
const ERA_CASE: Rgb = [0.05, 0.055, 0.035];

/**
 * A kinetic round's hit on armour, past the additive pop and sparks the caller draws (owner 2026-10-08: every effect on
 * the media layer): a penetration drives a dark jet of spall and pulverised armour out of the hole along the plate's
 * normal, which stalls within a couple of metres and drifts off thinning, rings the hole with a thin armour-dust ring in
 * the plate's plane, and throws lit steel chips that fall and lie; a non-penetration leaves a pale puff of paint and
 * dust; a ricochet a faint scuff; spaced armour a grey puff and torn sheet; an ERA cassette a dark blast and its
 * fragments. Sized by the calibre (120 mm: 1).
 */
export function armorHit(C: BlastContext, I: ArmorHitInput): void {
  const R = C.rand;
  const m = C.m;
  const bo = I.birthOffset ?? 0;
  const s = Math.max(0.3, Math.min(1.6, I.caliberMm / 120));
  const sq = Math.sqrt(s);
  const dk = C.distBoost(I.x, I.y, I.z);
  const nl = Math.hypot(I.nx, I.ny, I.nz) || 1;
  const nx = I.nx / nl, ny = I.ny / nl, nz = I.nz / nl;
  // a basis in the plate's plane
  let ux = -nz, uy = 0, uz = nx;
  if (ux * ux + uz * uz < 1e-4) { ux = 1; uy = 0; uz = 0; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const wx = ny * uz - nz * uy, wy = nz * ux - nx * uz, wz = nx * uy - ny * ux;
  // a direction in a cone of half-angle `cone` round the normal
  let dx = 0, dy = 0, dz = 0;
  const coneDir = (cone: number): void => {
    const a = R() * TAU, t = cone * Math.sqrt(R()), st = Math.sin(t), ct = Math.cos(t);
    dx = nx * ct + (ux * Math.cos(a) + wx * Math.sin(a)) * st;
    dy = ny * ct + (uy * Math.cos(a) + wy * Math.sin(a)) * st;
    dz = nz * ct + (uz * Math.cos(a) + wz * Math.sin(a)) * st;
  };
  const puffs = (n: number, cone: number, v0: number, v1: number, life0: number, life1: number, size1: number,
    c0: Rgb, c1: Rgb, density: number, hot: number): void => {
    for (let i = 0; i < n; i++) {
      coneDir(cone);
      const v = (v0 + (v1 - v0) * R()) * sq;
      place(m, I.x + nx * 0.15, I.y + ny * 0.15, I.z + nz * 0.15, bo + R() * 0.02);
      // driven out hard, stalled within a couple of metres by the air, then a little lift and the wind
      move(m, dx * v, dy * v + 0.3, dz * v, 4.5, 0.3, 0.8, 0);
      const life = life0 + (life1 - life0) * R();
      shape(m, life, 0.25 * s * dk, size1 * (0.8 + 0.4 * R()) * s * dk, 2.6, R);
      look(m, c0, c1, density, 0.0, 0.45);
      book(m, 'burst', R, life);
      heat(m, i < hot ? 0.5 : 0, 8);
      C.media(m);
    }
  };
  const chips = (n: number, cone: number, v0: number, v1: number, size: number, col: Rgb, hot: number,
    shapeA: ChunkShape, shapeB: ChunkShape): void => {
    for (let i = 0; i < n; i++) {
      coneDir(cone);
      const v = v0 + (v1 - v0) * R();
      chunk(C, i % 2 === 0 ? shapeA : shapeB, I.x + nx * 0.05, I.y + ny * 0.05, I.z + nz * 0.05, dx * v, dy * v + 2, dz * v,
        size * (0.6 + 0.8 * R()) * sq * dk, col, 8 + R() * 5, i < hot ? 0.9 : 0.25 * R(), bo + R() * 0.02);
    }
  };
  const darkSpall: Rgb = [SOOT[0] * 1.1, SOOT[1] * 1.1, SOOT[2] * 1.1];
  switch (I.kind) {
    case 'pen': {
      // the jet of spall and armour dust out of the hole, dark at its heart
      puffs(7, 0.24, 8, 15, 1.6, 2.4, 1.1, darkSpall, mix3(SMOKE_AGED, SOOT, 0.35), 0.85, 2);
      // the thin armour-dust ring round the hole, in the plate's plane
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + (R() - 0.5) * 0.8;
        const rx = ux * Math.cos(a) + wx * Math.sin(a), ry = uy * Math.cos(a) + wy * Math.sin(a);
        const rz = uz * Math.cos(a) + wz * Math.sin(a);
        const v = (3 + 2.5 * R()) * sq;
        place(m, I.x + rx * 0.25 + nx * 0.1, I.y + ry * 0.25 + ny * 0.1, I.z + rz * 0.25 + nz * 0.1, bo + 0.01);
        move(m, rx * v + nx * 0.6, ry * v + ny * 0.6 + 0.3, rz * v + nz * 0.6, 3.5, 0.2, 0.9, 0);
        const life = 1.0 + 0.6 * R();
        shape(m, life, 0.2 * s * dk, (0.8 + 0.4 * R()) * s * dk, 2.2, R);
        look(m, mix3(SMOKE_AGED, BLAST_RESIDUE, 0.4), SMOKE_AGED, 0.35, 0.0, 0.4);
        book(m, 'burst', R, life, 2);
        heat(m, 0, 1);
        C.media(m);
      }
      chips(6, 0.45, 9, 18, 0.07, STEEL, 2, 'shard', 'sheet');
      break;
    }
    case 'nonpen':
      // paint, scale and dust knocked off the face
      puffs(2, 0.5, 3, 5, 1.1, 1.5, 0.8, mix3(SMOKE_AGED, BLAST_RESIDUE, 0.3), SMOKE_AGED, 0.5, 0);
      chips(2, 0.7, 5, 10, 0.04, STEEL, 0, 'shard', 'shard');
      break;
    case 'ricochet':
      puffs(1, 0.6, 2, 3, 0.8, 1.1, 0.6, SMOKE_AGED, SMOKE_AGED, 0.35, 0);
      break;
    case 'spaced':
      puffs(2, 0.4, 4, 7, 1.3, 1.8, 0.9, BLAST_RESIDUE, mix3(BLAST_RESIDUE, SMOKE_AGED, 0.5), 0.55, 1);
      chips(3, 0.6, 6, 12, 0.08, STEEL, 1, 'sheet', 'sheet');
      break;
    case 'era':
      // the cassette's charge: a dark blast thrown off the plate, its fragments
      puffs(4, 0.35, 6, 12, 2.0, 3.0, 1.7, SOOT, mix3(SOOT, SMOKE_AGED, 0.45), 0.9, 2);
      chips(6, 0.6, 10, 18, 0.12, ERA_CASE, 3, 'sheet', 'brick');
      break;
  }
}

/** Fragments of a nearby burst striking a hull: a few sparks and a puff of paint and dust off the plate. */
export function fragmentStrike(C: BlastContext, x: number, y: number, z: number, nx: number, ny: number, nz: number,
  bo = 0): void {
  const R = C.rand;
  const m = C.m;
  const dk = C.distBoost(x, y, z);
  sparkSpray(C, x, y, z, nx, ny, nz, 6, 12, 1.1, 0.3, 0.02, bo);
  place(m, x + nx * 0.2, y + ny * 0.2, z + nz * 0.2, bo);
  move(m, nx * 1.5, ny * 1.5 + 0.6, nz * 1.5, 2, 0.3, 0.8, 0);
  shape(m, 1.6 + R() * 0.6, 0.3 * dk, 1.4 * dk, 2.2, R);
  look(m, BLAST_RESIDUE, mix3(BLAST_RESIDUE, PROPELLANT, 0.5), 0.55, 0.0, 0.4);
  book(m, 'burst', R, 2.4, 4);
  heat(m, 0, 1);
  C.media(m);
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

interface MuzzleInput {
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
  // (round 4: three to five puffs spaced along the bore read as a row of cotton balls; the gas is one cloud: more,
  // smaller, overlapping puffs strung continuously along the throw, spreading sideways, wider than tall, thinner)
  const gasN = Math.round(6 + 3 * s);
  for (let i = 0; i < gasN; i++) {
    const along = (i + R() * 0.9) / gasN;
    const v = (8 + 26 * (1 - along) * (1 - along)) * s;
    const side = (R() - 0.5) * 0.5;
    place(m, I.x + I.dx * 0.4, I.y + I.dy * 0.4, I.z + I.dz * 0.4, bo + R() * 0.03);
    move(m, I.dx * v + side * I.dz * v, I.dy * v + (R() - 0.3) * 1.4, I.dz * v - side * I.dx * v, 4.2, 0.4, 0.9, 0);
    shape(m, 2.2 + R() * 1.4, 0.5 * s, (1.8 + 1.8 * along + R() * 0.8) * s, 2.8, R);
    look(m, PROPELLANT, PROPELLANT, 0.42 * att, 0.0, 0.3);
    book(m, 'billow', R, 3.4, 6);
    card(m, 1.2 + R() * 0.4, R, 0.3);
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
      // (round 2: a few tall opaque puffs stood in a row of tan balls for three seconds; the blast lifts a low, wide,
      // thin sheet that rolls out and settles)
      const n = Math.round(5 + 5 * Math.min(1.3, k));
      for (let i = 0; i < n; i++) {
        // mostly ahead of the bore, some to the sides
        const a = Math.atan2(I.dz, I.dx) + (R() - 0.5) * 2.6;
        const r = 1.0 + R() * 3.0;
        const v = (5 + R() * 6) * Math.sqrt(k);
        const px = I.x + Math.cos(a) * r + I.dx * 1.5, pz = I.z + Math.sin(a) * r + I.dz * 1.5;
        place(m, px, C.groundY(px, pz) + 0.45, pz, bo + 0.02 + R() * 0.06);
        move(m, Math.cos(a) * v, 0.6 + R() * 0.7, Math.sin(a) * v, 2.6, 0.12, 1.0, 0);
        shape(m, (1.8 + R() * 1.2) * L.hang, 0.6, (2.0 + R() * 1.2) * Math.min(1.4, 0.6 + k), 2.2, R);
        // (round 4: a flat beige plate on the ground) a thin, roiling sheet a metre or two high
        look(m, L.dust, L.dust, Math.min(0.4, 0.14 + 0.18 * k) * att, 0.06, 0.3);
        book(m, 'burst', R, 3.0, 4);
        card(m, 1.4 + R() * 0.5, R, 0.12);
        heat(m, 0, 1);
        C.media(m);
      }
    }
  }
}

/**
 * A moving hull's trailing dust skirt (one body; the caller rate-limits by travel): low, wide cards of the ground's own
 * dust left behind the track, rolling out and up a little and drifting off with the wind, scaled by the speed
 * (`intensity` 0..1) and the ground (`k`: heavy on sand, light on grass). Wet ground and snow take none (their spray and
 * powder are the battle's).
 */
export function trackSkirt(C: BlastContext, x: number, gy: number, z: number, dx: number, dz: number, intensity: number,
  surface: SurfaceKind, k: number, bo: number): void {
  const L = SURFACE_LOOKS[surface];
  const R = C.rand;
  const m = C.m;
  const dk = C.distBoost(x, gy, z);
  const dl = Math.hypot(dx, dz) || 1;
  const fx = dx / dl, fz = dz / dl;
  const back = 0.6 + R() * 1.0;
  place(m, x - fx * 0.4 + (R() - 0.5) * 0.6, gy + 0.35 + R() * 0.25, z - fz * 0.4 + (R() - 0.5) * 0.6, bo);
  // left behind: no forward speed, a slow roll back, out and up, then the wind
  move(m, -fx * back + (R() - 0.5) * 0.8, 0.25 + R() * 0.35, -fz * back + (R() - 0.5) * 0.8, 1.5, 0.06 + R() * 0.08, 1.0, 0);
  const life = (3.5 + R() * 2.5) * (0.7 + 0.5 * intensity) * L.hang;
  const size1 = (1.8 + R() * 1.4) * (0.7 + 0.6 * intensity) * Math.sqrt(k) * dk;
  shape(m, life, size1 * 0.35, size1, 2.0, R);
  look(m, mix3(L.ejecta, L.dust, 0.65), L.dust, Math.min(0.55, (0.16 + 0.22 * intensity) * k), 0.15, 0.4);
  book(m, 'burst', R, life, 4);
  // a skirt lies wide and low
  card(m, 1.8 + R() * 0.8, R, 0.05);
  heat(m, 0, 1);
  C.media(m);
}

/** A low dust surge driven out along the ground from under a blast (a hull cooking off, a wall coming down). */
export function dustSurge(C: BlastContext, x: number, y: number, z: number, s: number, surface: SurfaceKind,
  bo: number): void {
  const L = SURFACE_LOOKS[surface === 'water' ? 'soil' : surface];
  const R = C.rand;
  const m = C.m;
  const sq = Math.sqrt(s);
  const dk = C.distBoost(x, y, z);
  // a continuous skirt of wide, flat cards close to the ground (round 2's ring of round puffs read as a row of balls)
  const n = Math.round((8 + 3 * s) * Math.sqrt(L.dustK));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (R() - 0.5) * 0.7;
    const v = (5 + R() * 5) * sq;
    place(m, x + Math.cos(a) * 1.2 * s, y + 0.35, z + Math.sin(a) * 1.2 * s, bo + R() * 0.06);
    move(m, Math.cos(a) * v, 0.3 + R() * 0.3, Math.sin(a) * v, 2.6, 0.08, 0.9, 0);
    shape(m, (4.5 + R() * 2) * Math.min(1.5, sq), 0.9 * s * dk, (2.6 + R() * 1.2) * s * Math.sqrt(L.dustK) * dk, 2.2, R);
    look(m, mix3(L.ejecta, L.dust, 0.65), L.dust, Math.min(0.7, 0.42 * L.dustK + 0.12), 0.05, 0.4);
    book(m, 'burst', R, 3.8, 1);
    card(m, 2.0 + R() * 0.8, R, 0.06);
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
  // (wave 266: the fireball barely outgrew the hull, one smooth brown ball whose billows froze after ~2 s) a fireball
  // well past the hull's size, rolling up and out in lobes of different sizes; it burns out within a second or so into
  // black soot, which keeps churning (each flipbook plays its whole life) as it climbs into the column
  const S = rack ? 1.75 : 1.3;
  const dk = C.distBoost(x, y, z);
  // 1. the fire: lobes swelling fast out of the hull, hot at the heart, burnt out to soot by ~1.5 s
  const n = rack ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (R() - 0.5) * 1.2, b = 0.35 + R() * 0.9, v = (4 + R() * 6) * S;
    place(m, x + (R() - 0.5) * 1.8, y + (R() - 0.2) * 1.4, z + (R() - 0.5) * 1.8, bo - R() * 0.03);
    move(m, Math.cos(a) * Math.sin(b) * v, (3.5 + R() * 4) * S, Math.sin(a) * Math.sin(b) * v, 1.8, 2.6 * S, 0.45, 0);
    // lobes of different sizes, so their union is lumpy rather than one smooth ball
    const size1 = (5.5 + R() * 4.5) * S * dk;
    const life = 3.4 + R() * 1.6;
    shape(m, life, size1 * 0.5, size1, 4, R);
    look(m, SOOT, mix3(SOOT, SMOKE_AGED, 0.2), 0.97, 0.0, 0.6);
    book(m, 'billow', R, life);
    // orange-yellow at the heart (round 4 and b5: never white — at heat ~2 the blackbody ramp saturates), and gone
    // fast: a long dull glow read as brown smoke
    heat(m, 1.15 + R() * 0.15, 1.0);
    C.media(m);
  }
  // 2. the soot: black smoke rolling out of the top of the fire over the first second, climbing and spreading
  const sn = rack ? 6 : 4;
  for (let i = 0; i < sn; i++) {
    const a = R() * TAU;
    place(m, x + (R() - 0.5) * 2.0, y + 1.5 + R() * 2.0 * S, z + (R() - 0.5) * 2.0, bo + 0.2 + i * (0.6 / sn) + R() * 0.1);
    move(m, Math.cos(a) * 1.5 * S, (4 + R() * 3) * S, Math.sin(a) * 1.5 * S, 1.2, 3.0 + R() * 1.2, 0.7, 0);
    const size1 = (8 + R() * 6) * S * dk;
    const life = 6 + R() * 3;
    shape(m, life, size1 * 0.35, size1, 2.2, R);
    look(m, SOOT, mix3(SOOT, SMOKE_AGED, 0.3), 0.9, 0.15, 0.55);
    book(m, 'billow', R, life);
    heat(m, 0.5, 3.0);
    C.media(m);
  }
  // 3. the hull's own pieces thrown out of the fire (round 7b, wave m2: "no debris"): hot fragments of plate and fittings,
  // glowing as they fly, cooling as they fall, lying round the wreck
  const fragN = rack ? 22 : 14;
  for (let i = 0; i < fragN; i++) {
    const a = R() * TAU, up = 0.35 + R() * 0.6, v = (6 + R() * 12) * S;
    chunk(C, i % 3 === 0 ? 'sheet' : 'stone', x + (R() - 0.5) * 1.2, y + 0.8 + R(), z + (R() - 0.5) * 1.2,
      Math.cos(a) * (1 - up) * v, up * v + 2, Math.sin(a) * (1 - up) * v,
      0.12 + Math.pow(R(), 2) * 0.35, STEEL, 16 + R() * 8, 0.85 + R() * 0.15, bo + R() * 0.05);
  }
}

const EXHAUST_DIESEL: Rgb = [0.044, 0.04, 0.036];
const EXHAUST_DIESEL_AGED: Rgb = [0.16, 0.155, 0.148];
const EXHAUST_TURBINE: Rgb = [0.26, 0.255, 0.24];

/**
 * An engine's exhaust (round 7b, wave m2: "engine smoke rising as straight chimney columns"): a puff born at the stack
 * with the hull's own motion plus the gas's exit (back off the deck and up), which drag hands over to the wind as it
 * rises; under way the plume streams back off the deck and bends with the wind, at rest it leans downwind, and it swells,
 * thins and tears apart within a few seconds (the media's shear, eddies and torn rims). A diesel's is grey-brown and
 * denser, a turbine's a pale thin haze. `vx/vz` the hull's velocity, `fx/fz` its forward (unit).
 */
export function exhaustPuff(C: BlastContext, x: number, y: number, z: number, vx: number, vz: number, fx: number, fz: number,
  intensity: number, sooty: boolean, bo: number): void {
  const R = C.rand;
  const m = C.m;
  const dk = C.distBoost(x, y, z);
  const exit = 1.2 + R() * 0.8 + intensity * 0.8;
  place(m, x + (R() - 0.5) * 0.2, y + 0.15, z + (R() - 0.5) * 0.2, bo - R() * 0.03);
  move(m, vx * 0.85 - fx * exit + (R() - 0.5) * 0.4, 0.9 + R() * 0.6 + intensity * 0.8, vz * 0.85 - fz * exit + (R() - 0.5) * 0.4,
    1.5, 0.45 + R() * 0.35, 1.15, 0);
  const life = sooty ? 2.6 + R() * 1.4 : 1.6 + R() * 0.9;
  const size1 = (sooty ? 2.2 + R() * 1.2 : 1.6 + R() * 0.8) * (0.7 + 0.5 * intensity) * dk;
  shape(m, life, 0.35 * dk, size1, 1.7, R);
  if (sooty) look(m, EXHAUST_DIESEL, EXHAUST_DIESEL_AGED, Math.min(0.62, 0.3 + 0.28 * intensity), 0.05, 0.6);
  else look(m, EXHAUST_TURBINE, EXHAUST_TURBINE, 0.1 + 0.12 * intensity, 0.08, 0.6);
  book(m, 'billow', R, life);
  heat(m, 0, 1);
  C.media(m);
}

const STEEL: Rgb = [0.055, 0.053, 0.05];

/** One tick of a burning hull's column (stage 1 fresh .. 0 burnt out; scale = the column's own x distance boost). */
export function columnPuff(C: BlastContext, x: number, y: number, z: number, stage: number, scale: number, bo: number): void {
  const R = C.rand;
  const m = C.m;
  const a = R() * TAU, r = R() * 0.6 * scale;
  place(m, x + Math.cos(a) * r, y + 1.0 + R() * 0.8, z + Math.sin(a) * r, bo);
  // (round 3: round 2's column stood 15 m tall and stopped like a sausage) each puff lives long, keeps swelling as it
  // climbs and thins from the middle of its life, so the column widens, greys and fades into the sky
  // (wave 266: still a tube of one width, of same-sized puffs, ending at one height) each body's size, life, climb and
  // wind pick-up vary, and now and then the fire gulps a bigger, denser one: the column swells and pinches, ends at a
  // ragged height, and its bodies take the wind slowly (low drag), so it bends over downwind as it rises
  const gulp = R() < 0.22;
  move(m, Math.cos(a) * 0.6, 1.6 + R() * 1.2, Math.sin(a) * 0.6, 0.28 + R() * 0.12,
    (1.8 + 1.3 * stage) * (0.75 + R() * 0.5), 0.7 + R() * 0.5, 0);
  const size1 = (9 + R() * 9) * scale * (gulp ? 1.45 : 1);
  const life = 10 + R() * 9;
  shape(m, life, Math.max(1.6 * scale, size1 * 0.16), size1, 1.5, R);
  // fresh smoke is black; it greys as it rises, cools and thins (and the whole column greys as the fire burns out)
  // (b5: at 12-18 s the column's crown had aged to a sunlit tan-brown) it stays a dark grey well up the column
  const crown = mix3(SOOT, SMOKE_AGED, 0.3 + 0.35 * (1 - stage));
  look(m, stage > 0.5 ? SOOT : mix3(SOOT, SMOKE_AGED, 0.3), crown,
    Math.min(0.95, (0.5 + 0.3 * stage) * (gulp ? 1.2 : 0.85 + R() * 0.3)), 0.2, 0.35 + R() * 0.3);
  book(m, 'billow', R, life * (0.85 + R() * 0.3));
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

// ---------------------------------------------------------------------------------------------------------------
// A crater's own ejecta (crater-render-spec §D: live events only)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The clods a dug crater throws out of its bowl, landing on its rim and blanket between R and 1.6 R (each one aimed
 * so it comes to rest on the deformed ground where it lands: `heightAt` is base + the overlay), where they lie ~20 s
 * and settle in (round 7: its ring of rim dust cards read as "haystack puffs"; the burst's own ring is the one ring). The burst itself (its flash, its cloud, its surge) is the munition's own, drawn from the same
 * tick's blast; this is the ground's part. Never for a settled crater.
 */
export function craterEjecta(C: BlastContext, x: number, z: number, radiusM: number, surface: SurfaceKind,
  heightAt: (x: number, z: number) => number, bo: number): void {
  const L = SURFACE_LOOKS[surface === 'water' ? 'soil' : surface];
  const R = C.rand;
  const k = C.k;
  const y0 = heightAt(x, z) + 0.2;
  const n = Math.round((10 + 6 * radiusM) * Math.max(0.4, L.chunkK));
  const shapeId: ChunkShape = surface === 'rock' || surface === 'concrete' ? 'stone' : 'clod';
  const drag = 0.25;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU;
    const d = radiusM * (1 + 0.6 * Math.sqrt(R()));
    const lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
    const land = heightAt(lx, lz);
    const T = 0.55 + R() * 0.55 + 0.08 * radiusM;
    const s = (1 - Math.exp(-drag * T)) / drag;
    const soil = surface === 'snow' && i % 3 === 0;
    k.shape = shapeId; k.x = x + Math.cos(a) * 0.3 * radiusM; k.y = y0; k.z = z + Math.sin(a) * 0.3 * radiusM; k.birthOffset = bo + R() * 0.05;
    k.vx = (lx - k.x) / s; k.vz = (lz - k.z) / s; k.vy = (land - y0 + 4.9 * T * T) / s; k.life = T + 16 + R() * 8;
    k.ax = R() - 0.5; k.ay = R() - 0.5; k.az = R() - 0.5; k.spin = 5 + R() * 10;
    k.scale = (0.08 + Math.pow(R(), 2) * 0.28) * Math.sqrt(radiusM / 1.6) * L.chunkScale; k.groundY = land; k.drag = drag;
    const col = soil ? UNDER_SNOW_SOIL : L.chunk;
    const tint = 0.8 + R() * 0.4;
    k.r = col[0] * tint; k.g = col[1] * tint; k.b = col[2] * tint; k.heat = 0; k.seed = R();
    C.chunk(k);
  }
}
