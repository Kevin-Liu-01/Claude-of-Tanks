/**
 * cinematicRecipes.ts — Scene Studio pyrotechnics recipes (Studio chunk only).
 *
 * Pure emission recipes for the cinematic FX layer (src/fx/cinematicFx.ts):
 * every function writes particles into a sink, schedules light pulses and
 * creates continuous emitters. Nothing here touches the DOM, WebGL or the
 * battle runtime, so the step-size and determinism receipts run in Node.
 *
 * Time contract: a recipe runs at the Studio playhead `now`. Every particle
 * carries a birth offset relative to `now` (negative = already alive,
 * positive = scheduled), so a sub-event 1.7 s after a kill is simply emitted
 * with birthOffset +1.7 at fire time — no timers, no frame-rate dependence.
 * Continuous emitters tick on an absolute grid `startS + k * periodS` and
 * backdate each tick to its exact grid time, so 1/60 s, 4 ms or 2-8 ms
 * export steps produce the same particles. Each emitter owns a private
 * seeded RNG stream: the interleaving of other effects never changes it.
 */

export type Rng = () => number;
type Vec3 = [number, number, number];

export type PuffPool = 'smoke' | 'fire' | 'billow' | 'psmoke' | 'screen' | 'dust' | 'flash';

export interface Puff {
  pos: Vec3; vel: Vec3; life: number; size0: number; size1: number;
  rot: number; rotVel: number; col0: Vec3; col1: Vec3; alpha: number;
  grav: number; birthOffset: number;
}
export interface Streak {
  pos: Vec3; vel: Vec3; life: number; width: number; stretch: number;
  grav: number; col: Vec3; alpha: number; seed: number; birthOffset: number;
}
export interface Chunk {
  pos: Vec3; vel: Vec3; life: number; axis: Vec3; spin: number; scale: number;
  groundY: number; hot: number; seed: number; birthOffset: number;
}
export interface Jet {
  pos: Vec3; axis: Vec3; life: number; width: number; len0: number; len1: number;
  seed: number; col: Vec3; alpha: number; birthOffset: number;
}

/** Particle destination (the companion pools, or a recording fake in tests). */
export interface CineSink {
  puff(pool: PuffPool, o: Readonly<Puff>): void;
  streak(o: Readonly<Streak>): void;
  chunk(o: Readonly<Chunk>): void;
  jet(o: Readonly<Jet>): void;
}

/** Dust/ejecta colours for a ground point: [light, dark] linear RGB. */
export interface GroundTone { light: Vec3; dark: Vec3; snow: boolean; wet: boolean }

export interface CineWorld {
  groundY(x: number, z: number): number;
  tone(x: number, z: number, out: GroundTone): GroundTone;
  /** 0..1 open-water coverage under a point. */
  water(x: number, z: number): number;
}

/** Shared per-frame environment (night factor follows the live light rig). */
export interface CineEnv {
  /** 0 = full daylight, 1 = night. */
  night: number;
  /** Seconds on the Studio playhead (the recipes' `now`). */
  nowS: number;
}

/** Light pulse scheduled by a recipe: the explosion light flashes at `atS`. */
export interface CinePulse { atS: number; x: number; y: number; z: number; peak: number }

/** Continuous fire light contribution (wrecks, fire fields, flares). */
export interface CineLight {
  x: number; y: number; z: number;
  /** Candela-scale intensity before flicker. */
  intensity: number;
  range: number;
  color: number;
  /** Larger wins the borrowed light. */
  priority: number;
}

/** Ground glow decal request (additive fire light pool on the terrain). */
export interface CineGlow { x: number; z: number; radius: number; intensity: number; seed: number }

/** Additive glare sprite (flare cores, tracer heads, fire hot spots). */
export interface CineSprite { x: number; y: number; z: number; size: number; r: number; g: number; b: number; intensity: number }

export interface CineCtx {
  readonly sink: CineSink;
  readonly world: CineWorld;
  readonly env: CineEnv;
  rng: Rng;
  /**
   * Seconds added to every one-shot birth and pulse: 0 normally, -ageS for
   * the frozen composers (firing_moment / explosion_moment).
   */
  shift: number;
  pulse(x: number, y: number, z: number, peak: number, offsetS: number): void;
  addEmitter(emitter: CineEmitter): void;
  /** Charred ground decal appearing at `offsetS` (relative to now). */
  scorch(x: number, z: number, radius: number, offsetS: number): void;
  /** Ground pressure-ring decal racing out to `radiusM`, born at `offsetS`. */
  shockRing(x: number, z: number, radiusM: number, alpha: number, offsetS: number): void;
}

export interface CineEmitter {
  readonly id: string;
  readonly startS: number;
  /** Last tick time (inclusive); Infinity for the whole storyboard. */
  endS: number;
  /** Actor uid whose fire this emitter belongs to (burning off / extinguish). */
  owner?: string;
  readonly periodS: number;
  /** Ticks already emitted. */
  k: number;
  readonly rng: Rng;
  tick(ctx: CineCtx, tS: number, offsetS: number, ageS: number): void;
  light?(nowS: number, out: CineLight): boolean;
  glow?(nowS: number, out: CineGlow): boolean;
  sprite?(nowS: number, index: number, out: CineSprite): boolean;
  /** Smoke-grenade canister positions in flight (smoke_screen). */
  canisters?(nowS: number, visit: (x: number, y: number, z: number, dx: number, dy: number, dz: number) => void): void;
  /** Flare parachute canopy position (world), false when not deployed. */
  parachute?(nowS: number, out: [number, number, number]): boolean;
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** Canonical PRNG (same algorithm as particles.ts mulberry32). */
export function cineRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed from the scene seed, an effect id and a salt. */
export function cineSeed(sceneSeed: number, id: string, salt = 0): number {
  let h = (0x811c9dc5 ^ (sceneSeed | 0) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) | 0;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;
/** Drift shared with the battle smoke columns (COLUMN_WIND in effects.ts). */
const WIND_X = 0.82, WIND_Z = 0.28;

function rgb(out: Vec3, r: number, g: number, b: number): Vec3 { out[0] = r; out[1] = g; out[2] = b; return out; }
function hexRgb(out: Vec3, hex: number): Vec3 {
  // sRGB-authored hex to the linear values col3() feeds the battle pools
  const c = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return rgb(out, c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255));
}

// Allocation-free scratch records reused by every recipe.
const P: Puff = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0, col0: [0, 0, 0], col1: [0, 0, 0], alpha: 1, grav: 0, birthOffset: 0 };
const S: Streak = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.02, grav: -9.8, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 };
const C: Chunk = { pos: [0, 0, 0], vel: [0, 0, 0], life: 2, axis: [0, 1, 0], spin: 6, scale: 0.15, groundY: 0, hot: 0, seed: 0, birthOffset: 0 };
const J: Jet = { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.2, width: 0.4, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 };
const TONE: GroundTone = { light: [0, 0, 0], dark: [0, 0, 0], snow: false, wet: false };
const _a: Vec3 = [0, 0, 0];
const _b: Vec3 = [0, 0, 0];

function set3(out: Vec3, x: number, y: number, z: number): Vec3 { out[0] = x; out[1] = y; out[2] = z; return out; }

/** Orthonormal basis perpendicular to a unit direction. */
function basis(dx: number, dy: number, dz: number, u: Vec3, v: Vec3): void {
  if (Math.abs(dy) < 0.94) set3(u, 0, 1, 0); else set3(u, 1, 0, 0);
  // u = normalize(u × d); v = d × u
  let ux = u[1] * dz - u[2] * dy, uy = u[2] * dx - u[0] * dz, uz = u[0] * dy - u[1] * dx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  set3(u, ux, uy, uz);
  set3(v, dy * uz - dz * uy, dz * ux - dx * uz, dx * uy - dy * ux);
}

/** Displacement of a pool particle: v (1 - e^{-k t}) / k (+ 0.5 g t^2 handled by callers). */
function dragTravel(v: number, k: number, t: number): number {
  return k > 1e-4 ? v * (1 - Math.exp(-k * t)) / k : v * t;
}

// ---------------------------------------------------------------------------
// Primitive emitters (thin wrappers that keep the recipes readable)
// ---------------------------------------------------------------------------

function puff(
  ctx: CineCtx, pool: PuffPool,
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, size0: number, size1: number, col0: Vec3, col1: Vec3,
  alpha: number, grav: number, birthOffset: number, rotVel = (ctx.rng() - 0.5) * 2,
): void {
  set3(P.pos, x, y, z); set3(P.vel, vx, vy, vz);
  P.life = life; P.size0 = size0; P.size1 = size1;
  P.rot = ctx.rng() * TAU; P.rotVel = rotVel;
  set3(P.col0, col0[0], col0[1], col0[2]); set3(P.col1, col1[0], col1[1], col1[2]);
  P.alpha = alpha; P.grav = grav; P.birthOffset = birthOffset + ctx.shift;
  ctx.sink.puff(pool, P);
}

function streak(
  ctx: CineCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, width: number, stretch: number, grav: number, col: Vec3, alpha: number, birthOffset: number,
): void {
  set3(S.pos, x, y, z); set3(S.vel, vx, vy, vz);
  S.life = life; S.width = width; S.stretch = stretch; S.grav = grav;
  set3(S.col, col[0], col[1], col[2]); S.alpha = alpha; S.seed = ctx.rng(); S.birthOffset = birthOffset + ctx.shift;
  ctx.sink.streak(S);
}

function jet(
  ctx: CineCtx, x: number, y: number, z: number, ax: number, ay: number, az: number,
  life: number, width: number, len0: number, len1: number, col: Vec3, alpha: number, birthOffset: number,
): void {
  set3(J.pos, x, y, z);
  const l = Math.hypot(ax, ay, az) || 1;
  set3(J.axis, ax / l, ay / l, az / l);
  J.life = life; J.width = width; J.len0 = len0; J.len1 = len1;
  J.seed = ctx.rng(); set3(J.col, col[0], col[1], col[2]); J.alpha = alpha; J.birthOffset = birthOffset + ctx.shift;
  ctx.sink.jet(J);
}

function chunk(
  ctx: CineCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, scale: number, groundY: number, hot: number, birthOffset: number,
): void {
  set3(C.pos, x, y, z); set3(C.vel, vx, vy, vz);
  C.life = life; C.scale = scale; C.groundY = groundY; C.hot = hot;
  set3(C.axis, ctx.rng() - 0.5, ctx.rng() - 0.5, ctx.rng() - 0.5);
  C.spin = 5 + ctx.rng() * 16; C.seed = ctx.rng(); C.birthOffset = birthOffset + ctx.shift;
  ctx.sink.chunk(C);
}

// Palette. Authored as sRGB hex and converted exactly like the battle pools'
// col3() (THREE.Color.setHex under colour management), so the cinematic
// layer reads as the same art.
const hex = (h: number): Vec3 => hexRgb([0, 0, 0], h);
const WHITE_HOT = hex(0xfff0b0);
const FLAME_Y = hex(0xffd070);
const FLAME_O = hex(0xff5a10);
const FLAME_R = hex(0xe6520f);
const EMBER = hex(0xffa848);
const SPARK = hex(0xffd58a);
const SOOT0 = hex(0x4a423a);
const SOOT1 = hex(0x2b2723);
const SMOKE_DARK0 = hex(0x3a3531);
const SMOKE_DARK1 = hex(0x58534c);
const SMOKE_MID = hex(0x6e6a63);
const PROP0 = hex(0xaba79f);
const PROP1 = hex(0x8f8c86);
const FIRE_LIGHT = hex(0xff9a58);
const SPRAY0 = hex(0xd8e2dc);
const SPRAY1 = hex(0x8ca9aa);
const _emit: Vec3 = [0, 0, 0];

/**
 * Self-lit puff (FX_LIGHT_TINT companion pools only): a negative peak alpha
 * flags it, col0 is the emission at birth (fading over life) and col1 the
 * albedo the scene light tints. Fire-lit smoke undersides keep glowing at
 * night while the rest of the plume falls to the dark ambient.
 */
function glowPuff(
  ctx: CineCtx, pool: PuffPool,
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, size0: number, size1: number, emission: Vec3, emitK: number, albedo: Vec3,
  alpha: number, grav: number, birthOffset: number,
): void {
  rgb(_emit, emission[0] * emitK, emission[1] * emitK, emission[2] * emitK);
  puff(ctx, pool, x, y, z, vx, vy, vz, life, size0, size1, _emit, albedo, -Math.max(alpha, 1e-4), grav, birthOffset);
}

/** Emission share of fire-lit smoke: a warm kiss in daylight, the key light at night. */
function glowShare(ctx: CineCtx, k: number): number {
  return k * (0.05 + 0.95 * ctx.env.night);
}

function toneAt(ctx: CineCtx, x: number, z: number): GroundTone {
  return ctx.world.tone(x, z, TONE);
}

// ---------------------------------------------------------------------------
// One-shot recipes
// ---------------------------------------------------------------------------

/**
 * Cinematic main-gun blast layered over the battle muzzle flash: an incandescent
 * fireball, the expanding propellant ring, a forward gas cone and — within a few
 * metres of the ground — the blast fan of dust and grit thrown off the terrain,
 * leaving a haze that hangs for seconds.
 */
export function muzzleBlast(
  ctx: CineCtx, px: number, py: number, pz: number, dx: number, dy: number, dz: number, caliberMm: number,
): void {
  const r = ctx.rng;
  const s = clamp(caliberMm / 120, 0.35, 1.45);
  const u: Vec3 = _a, v: Vec3 = _b;
  basis(dx, dy, dz, u, v);
  // incandescent fireball (fire pool: additive, short); calmer at night so a
  // front-on shot keeps the hull readable instead of clipping the frame
  const hot = 1 - 0.35 * ctx.env.night;
  for (let i = 0; i < 9; i++) {
    const along = (0.25 + r() * 1.6) * s;
    const sp = (6 + r() * 14) * s;
    const ox = (u[0] * (r() - 0.5) + v[0] * (r() - 0.5)) * 0.5 * s;
    const oy = (u[1] * (r() - 0.5) + v[1] * (r() - 0.5)) * 0.5 * s;
    const oz = (u[2] * (r() - 0.5) + v[2] * (r() - 0.5)) * 0.5 * s;
    puff(ctx, 'fire', px + dx * along + ox, py + dy * along + oy, pz + dz * along + oz,
      dx * sp + ox * 6, dy * sp + oy * 6 + 0.4, dz * sp + oz * 6,
      0.07 + r() * 0.11, (0.9 + r() * 0.5) * s, (2.4 + r() * 1.3) * s,
      i < 3 ? WHITE_HOT : FLAME_Y, FLAME_O, (0.75 + r() * 0.2) * hot, 0.5, -r() * 0.012);
  }
  // radial overpressure flash disc: short jets perpendicular to the bore
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r() * 0.5;
    const cx = u[0] * Math.cos(a) + v[0] * Math.sin(a);
    const cy = u[1] * Math.cos(a) + v[1] * Math.sin(a);
    const cz = u[2] * Math.cos(a) + v[2] * Math.sin(a);
    jet(ctx, px + dx * 0.35 * s, py + dy * 0.35 * s, pz + dz * 0.35 * s,
      cx + dx * 0.35, cy + dy * 0.35, cz + dz * 0.35,
      0.05 + r() * 0.04, 0.22 * s, 0.25 * s, (0.9 + r() * 0.7) * s, FLAME_Y, 0.55 * hot, 0);
  }
  // propellant ring (the doughnut thrown out perpendicular to the bore). Owner 2026-10-05 (the round puffs in s28):
  // thirty small cards flung 4-6 m/s scattered into separate soft discs that defocus read as polka dots — sixteen
  // larger, slower, fainter cards stay overlapped into one rolling ring that thins as a haze. Round 5 (front lenses
  // on PR #9) found that haze a fog over the hero for seconds: every veil below is ~40 % fainter and ~25 % shorter.
  const ringN = 16;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * TAU + r() * 0.35;
    const cx = u[0] * Math.cos(a) + v[0] * Math.sin(a);
    const cy = u[1] * Math.cos(a) + v[1] * Math.sin(a);
    const cz = u[2] * Math.cos(a) + v[2] * Math.sin(a);
    const sp = (2.2 + r() * 1.4) * s;
    const fwd = (1.2 + r() * 1.8) * s;
    puff(ctx, 'psmoke', px + dx * 0.9 * s + cx * 0.3, py + dy * 0.9 * s + cy * 0.3, pz + dz * 0.9 * s + cz * 0.3,
      cx * sp + dx * fwd, cy * sp + dy * fwd + 0.35, cz * sp + dz * fwd,
      2.4 + r() * 1.8, (1.3 + r() * 0.5) * s, (5.0 + r() * 1.8) * s,
      PROP0, PROP1, 0.16 + r() * 0.06, 0.22, -r() * 0.03);
  }
  // forward gas cone: smoke pushed down the bore line (eight broad, overlapping cards, not eighteen scattered ones)
  for (let i = 0; i < 8; i++) {
    const sp = (5 + r() * 8) * s;
    const spread = 0.08 + r() * 0.12;
    const a = r() * TAU;
    const cx = dx + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * spread;
    const cy = dy + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * spread;
    const cz = dz + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * spread;
    puff(ctx, 'psmoke', px + dx * 0.8, py + dy * 0.8, pz + dz * 0.8,
      cx * sp, cy * sp + 0.3, cz * sp,
      2.0 + r() * 1.8, (1.3 + r() * 0.6) * s, (5.0 + r() * 2.2) * s,
      PROP0, PROP1, 0.14 + r() * 0.06, 0.25, -r() * 0.05);
  }
  // unburnt propellant sparks spat down range
  for (let i = 0; i < 16; i++) {
    const sp = 25 + r() * 45;
    const spread = r() * 0.14;
    const a = r() * TAU;
    streak(ctx, px + dx * 0.4, py + dy * 0.4, pz + dz * 0.4,
      (dx + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * spread) * sp,
      (dy + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * spread) * sp,
      (dz + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * spread) * sp,
      0.08 + r() * 0.16, 0.018 + r() * 0.014, 0.012, -6, SPARK, 0.85, -r() * 0.01);
  }
  // ground blast fan: only when the muzzle sits low over open ground
  const gy = ctx.world.groundY(px + dx * 2, pz + dz * 2);
  const h = py - gy;
  const groundK = clamp(1 - (h - 1.4) / 3.2, 0, 1);
  if (groundK <= 0.02 || ctx.world.water(px + dx * 2, pz + dz * 2) > 0.5) return;
  const tone = toneAt(ctx, px + dx * 2, pz + dz * 2);
  const flatL = Math.hypot(dx, dz) || 1;
  const fx = dx / flatL, fz = dz / flatL;
  // (as the ring: fewer, broader, fainter cards that overlap into one sheet of dust instead of a field of discs)
  const fanN = Math.round(16 * (0.5 + 0.5 * groundK));
  for (let i = 0; i < fanN; i++) {
    // fan centred on the bore, widening to the sides; the strongest gust runs forward
    const a = (r() - 0.5) * Math.PI * 1.35;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = fx * ca - fz * sa, rz = fz * ca + fx * sa;
    const reach = (0.5 + 0.5 * ca) * (6 + r() * 6) * s * groundK;
    const ox = px + fx * (0.6 + r() * 2.6), oz = pz + fz * (0.6 + r() * 2.6);
    puff(ctx, 'dust', ox, ctx.world.groundY(ox, oz) + 0.35 + r() * 0.4, oz,
      rx * reach * 1.4, 0.5 + r() * 1.2, rz * reach * 1.4,
      2.6 + r() * 2.2, (1.3 + r() * 0.6) * s, (5.0 + r() * 2.8) * s,
      tone.light, tone.dark, (0.13 + r() * 0.08) * (0.55 + 0.45 * groundK), 0.18, -r() * 0.02);
  }
  // grit + grass bits
  for (let i = 0; i < 10; i++) {
    const a = (r() - 0.5) * Math.PI * 1.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = fx * ca - fz * sa, rz = fz * ca + fx * sa;
    const ox = px + fx * (1 + r() * 2), oz = pz + fz * (1 + r() * 2);
    const g = ctx.world.groundY(ox, oz);
    chunk(ctx, ox, g + 0.15, oz, rx * (4 + r() * 6), 2 + r() * 4, rz * (4 + r() * 6),
      0.9 + r() * 0.5, 0.025 + r() * 0.035, g, 0, 0);
  }
  // hanging haze that drifts for seconds after the shot: six broad, faint veils
  for (let i = 0; i < 6; i++) {
    const ox = px + fx * (2 + r() * 5) + (r() - 0.5) * 2.4, oz = pz + fz * (2 + r() * 5) + (r() - 0.5) * 2.4;
    puff(ctx, 'dust', ox, ctx.world.groundY(ox, oz) + 0.8 + r(), oz,
      fx * 1.2 + WIND_X * 0.4, 0.2 + r() * 0.25, fz * 1.2 + WIND_Z * 0.4,
      4.5 + r() * 3, 3.2 * s, (9 + r() * 4) * s, tone.light, tone.dark, 0.08 + r() * 0.04, 0.03, 0.1 + r() * 0.3);
  }
  ctx.shockRing(px + fx * 1.4, pz + fz * 1.4, (7 + 6 * groundK) * s, 0.7 * groundK, 0);
}

export interface FireballOptions {
  /** Overall size: 1 = an MBT ammunition fireball. */
  scale: number;
  /** Extra seconds of rising roll for big blasts. */
  rise?: number;
  /** Dark mushroom cap volume multiplier. */
  smoke?: number;
  /** Emit the hard ground shock + dust ring. */
  ground?: boolean;
  /** Seconds after `now` this fireball erupts (cook-offs). */
  delayS?: number;
  /** Flame lifetime factor (1 = an ammunition fireball). A shell burst has no fuel load: its core and billow lobes burn
   * out in about half the time, cooling to soot near the ground instead of climbing as orange puffs that read as fire
   * floating in the air (2026-10-03, the site fifty). */
  cool?: number;
}

/**
 * Rolling fireball: blinding flash, an additive incandescent core, a
 * normal-blended billow body that cools through orange into soot while it
 * climbs, and a dark smoke roll that boils up out of its crown.
 */
export function fireball(ctx: CineCtx, x: number, y: number, z: number, o: FireballOptions): void {
  const r = ctx.rng;
  const k = o.scale;
  const d = o.delayS ?? 0;
  const rise = o.rise ?? 1;
  const cool = o.cool ?? 1;
  // flash
  for (let i = 0; i < 3; i++) {
    puff(ctx, 'flash', x + (r() - 0.5) * k, y + r() * k, z + (r() - 0.5) * k, 0, 2, 0,
      0.08 + r() * 0.06, (2.4 + r()) * k, (5.8 + r() * 2.0) * k, WHITE_HOT, FLAME_Y, 0.85, 0, d - r() * 0.01);
  }
  // incandescent core: fast radial burst, additive
  const coreN = Math.round(13 + 8 * Math.min(k, 2));
  for (let i = 0; i < coreN; i++) {
    const a = r() * TAU, b = Math.acos(1 - 2 * r()) * 0.75;
    const sp = (5 + r() * 9) * k;
    const sx = Math.sin(b) * Math.cos(a), sy = Math.abs(Math.cos(b)), sz = Math.sin(b) * Math.sin(a);
    puff(ctx, 'fire', x + sx * 0.6 * k, y + sy * 0.4 * k, z + sz * 0.6 * k,
      sx * sp, sy * sp * 0.7 + 2.2 * rise, sz * sp,
      (0.55 + r() * 0.75) * cool, (1.4 + r() * 0.9) * k, (3.6 + r() * 2.2) * k,
      i < coreN / 5 ? WHITE_HOT : FLAME_Y, FLAME_O, 0.42 + r() * 0.26, 2.4 * rise, d + r() * 0.12);
  }
  // billow body: occluding fire-in-smoke lobes rolling upward
  const bodyN = Math.round(14 + 8 * Math.min(k, 2));
  for (let i = 0; i < bodyN; i++) {
    const a = r() * TAU;
    const out = (0.4 + r() * 1.2) * k;
    const crown = i < bodyN * 0.4;
    const sp = (2.2 + r() * 4.2) * k;
    puff(ctx, 'billow', x + Math.cos(a) * out, y + (crown ? 0.8 + r() * 1.4 : r() * 0.8) * k, z + Math.sin(a) * out,
      Math.cos(a) * sp, (crown ? 4.5 + r() * 3.5 : 1.6 + r() * 2.4) * k * rise, Math.sin(a) * sp,
      (1.5 + r() * 1.3 + 0.4 * rise) * cool, (2.4 + r() * 1.2) * k, (6.4 + r() * 3.2) * k,
      SOOT0, SOOT1, 0.9 + r() * 0.08, 1.6 * rise, d + 0.02 + r() * 0.2);
  }
  // dark smoke roll boiling out of the crown (normal-blended, long)
  const smokeN = Math.round((16 + 10 * Math.min(k, 2.2)) * (o.smoke ?? 1));
  const glow = glowShare(ctx, 0.55);
  for (let i = 0; i < smokeN; i++) {
    const a = r() * TAU;
    const out = r() * 1.5 * k;
    const lift = (1.2 + r() * 2.6) * k;
    const birth = d + 0.35 + r() * 1.4;
    glowPuff(ctx, 'smoke', x + Math.cos(a) * out, y + lift, z + Math.sin(a) * out,
      Math.cos(a) * (0.8 + r() * 1.6) * k + WIND_X * 0.5, (2.6 + r() * 3.2) * k * rise, Math.sin(a) * (0.8 + r() * 1.6) * k + WIND_Z * 0.5,
      5.5 + r() * 4.5 + 2 * rise, (3.2 + r() * 1.4) * k, (8.5 + r() * 4.5) * k,
      FIRE_LIGHT, glow * 0.6 * cool * (1 - i / smokeN), SMOKE_DARK0, 0.62 + r() * 0.18, 0.9 * rise, birth);
  }
  if (o.ground !== false) {
    shockwave(ctx, x, z, 10 + 9 * k, 0.8 + 0.4 * Math.min(k, 1.5), d);
    ctx.scorch(x, z, 2.8 + 2.4 * k, d);
  }
  ctx.pulse(x, y + 2.5 * k, z, 1.15 + 0.5 * Math.min(k, 2), d);
}

/**
 * Expanding ground shockwave: a low dust ring racing outward (pool drag
 * decelerates it naturally to ~radius), a ground pressure ring decal and a
 * short flash of kicked-up grit at the inner edge.
 */
export function shockwave(ctx: CineCtx, x: number, z: number, radiusM: number, strength: number, delayS = 0): void {
  const r = ctx.rng;
  const tone = toneAt(ctx, x, z);
  const n = Math.round(clamp(radiusM * 2.6, 18, 64));
  // dust pool drag k = 1.4: travel = v / k, so v = radius * k reaches radius
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const v = radiusM * 1.4 * (0.75 + r() * 0.4);
    const ox = x + ca * 0.8, oz = z + sa * 0.8;
    puff(ctx, 'dust', ox, ctx.world.groundY(ox, oz) + 0.45 + r() * 0.5, oz,
      ca * v, 0.4 + r() * 1.2, sa * v,
      1.4 + r() * 1.6, 0.9 + r() * 0.5, (2.8 + r() * 2.0) * Math.max(0.7, radiusM / 14),
      tone.light, tone.dark, (0.30 + r() * 0.16) * clamp(strength, 0.2, 1.6), 0.12, delayS - r() * 0.02);
  }
  // inner billow of thrown-up soil
  for (let i = 0; i < Math.round(n * 0.4); i++) {
    const a = r() * TAU;
    const v = radiusM * (0.3 + r() * 0.5);
    puff(ctx, 'dust', x + Math.cos(a) * 1.2, ctx.world.groundY(x, z) + 0.8, z + Math.sin(a) * 1.2,
      Math.cos(a) * v, 1.5 + r() * 2.5, Math.sin(a) * v,
      2.6 + r() * 2.6, 1.6, (4 + r() * 3) * Math.max(0.8, radiusM / 16), tone.light, tone.dark,
      0.24 * clamp(strength, 0.2, 1.6), 0.15, delayS + r() * 0.08);
  }
  ctx.shockRing(x, z, radiusM * 1.1, clamp(strength, 0.2, 1.4), delayS);
}

/** Hot and cold fragments with smoke/ember trails and landing dust. */
export function debrisBurst(
  ctx: CineCtx, x: number, y: number, z: number, count: number, speed: number, hot: number,
  sizeK: number, upward = 0.75, delayS = 0,
): void {
  const r = ctx.rng;
  const gy = ctx.world.groundY(x, z);
  const tone = toneAt(ctx, x, z);
  for (let i = 0; i < count; i++) {
    const a = r() * TAU;
    const tilt = (0.15 + r() * 0.9) * (1.15 - upward * 0.6);
    const sp = speed * (0.45 + r() * 0.75);
    const vx = Math.cos(a) * Math.sin(tilt) * sp;
    const vy = Math.cos(tilt) * sp * upward + 3 + r() * 4;
    const vz = Math.sin(a) * Math.sin(tilt) * sp;
    const life = 2.2 + r() * 1.6;
    const big = r() < 0.18;
    const scale = (big ? 0.24 + r() * 0.16 : 0.06 + r() * 0.12) * sizeK;
    const isHot = r() < hot ? 1 : 0.25 * hot;
    const bo = delayS - r() * 0.04;
    chunk(ctx, x, y, z, vx, vy, vz, life, scale, gy, isHot, bo);
    // trail: smoke (+ embers on hot pieces) sampled along the same arc the shader integrates
    const trailEvery = big ? 0.06 : 0.1;
    for (let t = 0.05; t < Math.min(life, 1.6); t += trailEvery) {
      const sx = dragTravel(vx, 0.12, t), sz = dragTravel(vz, 0.12, t);
      const py = y + dragTravel(vy, 0.12, t) - 10.8 * t * t;
      if (py < gy + 0.25) {
        // landing: a puff of soil where it struck
        puff(ctx, 'dust', x + sx, gy + 0.3, z + sz, vx * 0.05, 0.6 + r() * 0.6, vz * 0.05,
          1.2 + r() * 0.8, 0.4, (big ? 2.4 : 1.3) + r() * 0.6, tone.light, tone.dark, 0.32, -0.2, bo + t);
        break;
      }
      if (isHot >= 1 && r() < 0.55) {
        puff(ctx, 'fire', x + sx, py, z + sz, (r() - 0.5) * 0.4, 0.3, (r() - 0.5) * 0.4,
          0.22 + r() * 0.18, (big ? 0.7 : 0.4) * sizeK, (big ? 0.35 : 0.2) * sizeK, FLAME_Y, FLAME_R, 0.8, 0, bo + t);
      }
      puff(ctx, 'smoke', x + sx, py, z + sz, (r() - 0.5) * 0.3, 0.4 + r() * 0.3, (r() - 0.5) * 0.3,
        0.9 + r() * 0.8, (big ? 0.45 : 0.25) * sizeK, (big ? 2.0 : 1.1) * sizeK,
        isHot >= 1 ? SMOKE_DARK0 : tone.dark, SMOKE_DARK1, isHot >= 1 ? 0.55 : 0.32, 0.4, bo + t);
    }
  }
}

/** Ember storm: hot specks thrown out of a blast that drift down and cool. */
export function emberBurst(ctx: CineCtx, x: number, y: number, z: number, count: number, speed: number, delayS = 0): void {
  const r = ctx.rng;
  for (let i = 0; i < count; i++) {
    const a = r() * TAU, b = Math.acos(1 - r() * 1.6);
    const sp = speed * (0.3 + r() * 0.9);
    streak(ctx, x + (r() - 0.5), y + r(), z + (r() - 0.5),
      Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp + 2, Math.sin(b) * Math.sin(a) * sp,
      1.4 + r() * 2.4, 0.018 + r() * 0.022, 0.006 + r() * 0.008, -4.2 - r() * 3,
      r() < 0.3 ? SPARK : EMBER, 0.7 + r() * 0.3, delayS + r() * 0.25);
  }
}

/** Spark shower with ground bounces (ricochets, cook-off spits, grinding metal). */
export function sparkShower(
  ctx: CineCtx, x: number, y: number, z: number, nx: number, ny: number, nz: number,
  count: number, speed: number, spread: number, delayS = 0,
): void {
  const r = ctx.rng;
  const u: Vec3 = _a, v: Vec3 = _b;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  basis(nx, ny, nz, u, v);
  const gy = ctx.world.groundY(x, z);
  for (let i = 0; i < count; i++) {
    const a = r() * TAU, tilt = r() * spread;
    const st = Math.sin(tilt), ct = Math.cos(tilt);
    const cx = Math.cos(a) * st, cz = Math.sin(a) * st;
    const sp = speed * (0.35 + r() * 0.9);
    const vx = (nx * ct + u[0] * cx + v[0] * cz) * sp;
    const vy = (ny * ct + u[1] * cx + v[1] * cz) * sp;
    const vz = (nz * ct + u[2] * cx + v[2] * cz) * sp;
    const life = 0.35 + r() * 0.7;
    const bo = delayS - r() * 0.03;
    streak(ctx, x, y, z, vx, vy, vz, life, 0.016 + r() * 0.022, 0.022 + r() * 0.03, -9.8, i % 5 === 0 ? WHITE_HOT : SPARK, 0.75 + r() * 0.25, bo);
    // bounce: sparks pool drag k 1.1 and gravity -9.8 — find the ground crossing
    if (i % 3 !== 0) continue;
    for (let t = 0.04; t < life * 0.92; t += 0.04) {
      const py = y + dragTravel(vy, 1.1, t) - 4.9 * t * t;
      if (py > gy + 0.05) continue;
      const hx = x + dragTravel(vx, 1.1, t), hz = z + dragTravel(vz, 1.1, t);
      const e = Math.exp(-1.1 * t);
      const bx = vx * e * 0.45, bz = vz * e * 0.45;
      const by = Math.abs(vy * e - 9.8 * t) * 0.35 + 1;
      streak(ctx, hx, gy + 0.06, hz, bx, by, bz, Math.max(0.12, (life - t) * 0.7), 0.014, 0.02, -9.8, EMBER, 0.6, bo + t);
      break;
    }
  }
}

/**
 * Armour penetration upgrade: a white-hot pop, a jet of flame and molten spall
 * out of the hole, a dark spall-smoke puff and a few embers.
 */
export function penetration(ctx: CineCtx, x: number, y: number, z: number, nx: number, ny: number, nz: number, caliberMm: number): void {
  const r = ctx.rng;
  const s = clamp(caliberMm / 120, 0.4, 1.4);
  puff(ctx, 'flash', x + nx * 0.2, y + ny * 0.2, z + nz * 0.2, nx, ny, nz, 0.07, 0.9 * s, 2.6 * s, WHITE_HOT, FLAME_Y, 1, 0, 0);
  puff(ctx, 'flash', x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, nx, ny, nz, 0.12, 0.6 * s, 1.8 * s, FLAME_Y, FLAME_O, 0.8, 0, -0.01);
  jet(ctx, x, y, z, nx, ny + 0.1, nz, 0.16 + r() * 0.08, 0.32 * s, 0.4 * s, (2.2 + r()) * s, FLAME_Y, 0.85, 0);
  sparkShower(ctx, x, y, z, nx, ny + 0.15, nz, Math.round(42 * s), 26 * s, 0.75);
  for (let i = 0; i < 6; i++) {
    puff(ctx, 'smoke', x + nx * 0.3, y + ny * 0.3, z + nz * 0.3,
      nx * (2 + r() * 3) + (r() - 0.5), ny * (2 + r() * 3) + 0.8 + r(), nz * (2 + r() * 3) + (r() - 0.5),
      1.6 + r() * 1.4, 0.5 * s, (2.2 + r()) * s, SMOKE_DARK0, SMOKE_DARK1, 0.55 + r() * 0.2, 0.6, r() * 0.05);
  }
  emberBurst(ctx, x, y, z, Math.round(18 * s), 5, 0);
  ctx.pulse(x + nx * 0.6, y + ny * 0.6, z + nz * 0.6, 0.35, 0);
}

/**
 * HE / artillery ground burst: flash, a dark ejecta fountain that arcs and
 * falls back, radial skirt, shock ring, clods with trails and a lingering
 * dust cloud. No persistent smoke column (that belongs to burning things).
 */
export function heBurst(ctx: CineCtx, x: number, z: number, scale: number, delayS = 0, fireK = 0.4): void {
  const r = ctx.rng;
  const gy = ctx.world.groundY(x, z);
  const y = gy + 0.3;
  const k = scale;
  if (ctx.world.water(x, z) > 0.5) {
    waterColumn(ctx, x, z, k, delayS);
    return;
  }
  const tone = toneAt(ctx, x, z);
  // flash + short fire
  puff(ctx, 'flash', x, y + 0.6 * k, z, 0, 1, 0, 0.07, 1.8 * k, 4.8 * k, WHITE_HOT, FLAME_Y, 1, 0, delayS);
  for (let i = 0; i < Math.round(6 + 6 * fireK); i++) {
    const a = r() * TAU, sp = (3 + r() * 7) * k;
    puff(ctx, 'fire', x, y + 0.5 * k, z, Math.cos(a) * sp, (4 + r() * 6) * k, Math.sin(a) * sp,
      0.16 + r() * 0.22 + fireK * 0.25, 1.1 * k, (2.6 + r() * 1.4) * k, FLAME_Y, FLAME_O, 0.7 + r() * 0.25, 1, delayS + r() * 0.03);
  }
  // ejecta fountain (dark soil column that arcs and falls back)
  const darkA: Vec3 = [tone.dark[0] * 0.42, tone.dark[1] * 0.40, tone.dark[2] * 0.38];
  for (let i = 0; i < Math.round(16 * Math.min(k, 1.6) + 6); i++) {
    const a = r() * TAU, lean = r() * 0.38;
    const up = (10 + r() * 14) * k;
    puff(ctx, 'smoke', x + (r() - 0.5) * 0.8 * k, y + r() * 0.5, z + (r() - 0.5) * 0.8 * k,
      Math.cos(a) * up * lean, up, Math.sin(a) * up * lean,
      1.5 + r() * 1.3, (0.8 + r() * 0.5) * k, (3.6 + r() * 2.2) * k,
      darkA, tone.dark, 0.82 + r() * 0.12, -7.5, delayS + r() * 0.05);
  }
  // radial skirt rolling along the ground
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + r() * 0.4, sp = (5 + r() * 4) * k;
    puff(ctx, 'smoke', x + Math.cos(a) * 0.6 * k, y + 0.3, z + Math.sin(a) * 0.6 * k,
      Math.cos(a) * sp, 2 + r() * 2.2, Math.sin(a) * sp,
      1.2 + r() * 1.1, 0.8 * k, (2.8 + r()) * k, tone.dark, tone.light, 0.62, -2.6, delayS + r() * 0.04);
  }
  shockwave(ctx, x, z, 9 * k + 3, 0.7 + 0.3 * Math.min(k, 1.5), delayS);
  // clods
  for (let i = 0; i < Math.round(12 * Math.min(k, 1.8)); i++) {
    const a = r() * TAU, tilt = r() * 0.75;
    const sp = (9 + r() * 12) * k;
    const vx = Math.cos(a) * Math.sin(tilt) * sp, vy = (8 + r() * 10) * k, vz = Math.sin(a) * Math.sin(tilt) * sp;
    const bo = delayS + r() * 0.03;
    chunk(ctx, x, y, z, vx, vy, vz, 2.4, (0.07 + r() * 0.12) * k, gy, 0, bo);
    for (let t = 0.06; t < 1.4; t += 0.09) {
      const py = y + dragTravel(vy, 0.12, t) - 10.8 * t * t;
      if (py < gy + 0.3) break;
      puff(ctx, 'smoke', x + dragTravel(vx, 0.12, t), py, z + dragTravel(vz, 0.12, t),
        (r() - 0.5) * 0.3, -0.3, (r() - 0.5) * 0.3, 0.5 + r() * 0.4, 0.14 * k, 0.55 * k,
        tone.dark, tone.light, 0.62, -1.4, bo + t);
    }
  }
  // lingering cloud drifting off the crater
  for (let i = 0; i < 10; i++) {
    const a = r() * TAU, dd = r() * 2.6 * k;
    puff(ctx, 'dust', x + Math.cos(a) * dd, gy + 0.9 + r() * 1.4 * k, z + Math.sin(a) * dd,
      Math.cos(a) * (0.8 + r()) + WIND_X * 0.6, 0.45 + r() * 0.6, Math.sin(a) * (0.8 + r()) + WIND_Z * 0.6,
      5 + r() * 4, 1.6 * k, (5.6 + r() * 2.2) * k, tone.light, tone.dark, 0.26 + r() * 0.1, 0.08, delayS + 0.25 + r() * 0.6);
  }
  ctx.scorch(x, z, 1.8 + 1.4 * k, delayS);
  ctx.pulse(x, y + 1.5 * k, z, 0.4 + 0.25 * fireK, delayS);
}

/** HE burst in open water: white column, dark wet heart, spray and a foam skirt. */
function waterColumn(ctx: CineCtx, x: number, z: number, k: number, delayS: number): void {
  const r = ctx.rng;
  const y = ctx.world.groundY(x, z) + 0.4;
  const white0 = hex(0xdfe9ea), white1 = hex(0xb9cbd0);
  for (let i = 0; i < 22; i++) {
    const a = r() * TAU, up = (11 + r() * 14) * k;
    puff(ctx, 'smoke', x + (r() - 0.5) * k, y, z + (r() - 0.5) * k, Math.cos(a) * up * 0.12, up, Math.sin(a) * up * 0.12,
      1.3 + r() * 0.9, 0.7 * k, (3.2 + r() * 1.6) * k, white0, white1, 0.88, -10, delayS + r() * 0.04);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, sp = (6 + r() * 3) * k;
    puff(ctx, 'dust', x, y - 0.25, z, Math.cos(a) * sp, 0.8 + r(), Math.sin(a) * sp, 1.6 + r(), 0.6 * k, 3.2 * k,
      white0, white1, 0.55, -1.2, delayS);
  }
  sparkShower(ctx, x, y, z, 0, 1, 0, 30, 15 * k, 0.9, delayS);
}

/**
 * Ammunition cook-off: delayed secondary pops after a kill — a flash, a short
 * fireball, sometimes a hatch blowtorch jet and a spark spit — plus their
 * light pulses. Times are seeded, all relative to `now`.
 */
export function cookOffs(ctx: CineCtx, x: number, y: number, z: number, count: number, spanS: number, startS = 0.7): void {
  const r = ctx.rng;
  let t = startS;
  for (let i = 0; i < count; i++) {
    t += (spanS / Math.max(1, count)) * (0.45 + r() * 1.1);
    const px = x + (r() - 0.5) * 1.6, pz = z + (r() - 0.5) * 1.6, py = y + 0.3 + r() * 0.5;
    const big = r() < 0.35;
    const k = big ? 0.55 + r() * 0.25 : 0.28 + r() * 0.18;
    puff(ctx, 'flash', px, py + 0.4, pz, 0, 2, 0, 0.08, 1.6 * k * 2, 4.2 * k * 2, WHITE_HOT, FLAME_Y, 1, 0, t);
    for (let j = 0; j < (big ? 12 : 6); j++) {
      const a = r() * TAU, sp = (2.5 + r() * 5) * k * 2;
      puff(ctx, 'fire', px, py + 0.3, pz, Math.cos(a) * sp, (3 + r() * 6) * k * 2, Math.sin(a) * sp,
        0.35 + r() * 0.5, 1.0 * k * 2, (2.6 + r() * 1.4) * k * 2, FLAME_Y, FLAME_O, 0.75, 2.2, t + r() * 0.05);
    }
    if (big || r() < 0.4) {
      // hatch blowtorch: a roaring vertical tongue of flame
      jet(ctx, px, py, pz, (r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3, 0.45 + r() * 0.5, 0.5 + r() * 0.3, 1.2, 4.5 + r() * 4, FLAME_Y, 0.9, t);
      for (let j = 0; j < 8; j++) {
        puff(ctx, 'fire', px, py + j * 0.5, pz, (r() - 0.5) * 0.8, 6 + r() * 6, (r() - 0.5) * 0.8,
          0.3 + r() * 0.35, 0.9, 2.2 + r(), FLAME_Y, FLAME_O, 0.8, 3, t + j * 0.04);
      }
    }
    sparkShower(ctx, px, py + 0.4, pz, 0, 1, 0, big ? 40 : 18, big ? 22 : 14, 1.1, t);
    for (let j = 0; j < 4; j++) {
      puff(ctx, 'smoke', px, py + 1.2, pz, (r() - 0.5) * 1.2, 2 + r() * 2, (r() - 0.5) * 1.2,
        3 + r() * 2.5, 1.2, 4 + r() * 2, SMOKE_DARK0, SMOKE_DARK1, 0.55, 0.8, t + 0.12 + r() * 0.2);
    }
    ctx.pulse(px, py + 1.2, pz, big ? 0.75 : 0.4, t);
  }
}

// ---------------------------------------------------------------------------
// Continuous emitters
// ---------------------------------------------------------------------------

export interface FlameSource { x: number; y: number; z: number; size: number }

interface EmitterBase {
  id: string; startS: number; endS: number; periodS: number; rng: Rng;
}

function makeEmitter<T extends CineEmitter>(base: EmitterBase, extra: Omit<T, keyof EmitterBase | 'k'>): T {
  return { ...base, k: 0, ...extra } as unknown as T;
}

/**
 * Burning wreck: licking flames anchored to deck/hatch sources, rising embers,
 * fire-lit smoke rising into a tall leaning column, and a flickering fire
 * light plus ground glow for night shots. Intensity can fade in (`rampS`).
 */
export function burningEmitter(
  id: string, rng: Rng, startS: number, endS: number, sources: readonly FlameSource[],
  intensity: number, columnHeightM: number, rampS = 0.6,
): CineEmitter {
  const src = sources.map((s) => ({ ...s }));
  const cx = src.reduce((sum, s) => sum + s.x, 0) / Math.max(1, src.length);
  const cz = src.reduce((sum, s) => sum + s.z, 0) / Math.max(1, src.length);
  const cy = src.reduce((sum, s) => sum + s.y, 0) / Math.max(1, src.length);
  const flick = rng() * 100;
  const em: CineEmitter = makeEmitter<CineEmitter>({ id, startS, endS, periodS: 1 / 30, rng }, {
    tick(ctx, _tS, off, age) {
      const r = ctx.rng;
      const ramp = clamp(age / rampS, 0, 1);
      const k = intensity * ramp;
      if (k <= 0.01) return;
      const glow = glowShare(ctx, 1.0);
      for (let i = 0; i < src.length; i++) {
        const s = src[i];
        // licks: born on the deck, rising fast, shrinking as they burn off
        const licks = r() < 0.35 * k ? 2 : 1;
        for (let j = 0; j < licks; j++) {
          puff(ctx, 'fire', s.x + (r() - 0.5) * s.size, s.y + r() * 0.25, s.z + (r() - 0.5) * s.size,
            (r() - 0.5) * 0.6 + WIND_X * 0.25, 1.6 + r() * 1.8, (r() - 0.5) * 0.6 + WIND_Z * 0.25,
            0.38 + r() * 0.42, (0.9 + r() * 0.6) * s.size * (0.7 + 0.3 * k), (0.45 + r() * 0.35) * s.size,
            r() < 0.25 ? WHITE_HOT : FLAME_Y, FLAME_O, 0.85 + r() * 0.15, 3.4, off - r() * 0.03);
        }
        // occasional tall tongue
        if (r() < 0.06 * k) {
          jet(ctx, s.x, s.y, s.z, WIND_X * 0.15 + (r() - 0.5) * 0.3, 1, WIND_Z * 0.15 + (r() - 0.5) * 0.3,
            0.25 + r() * 0.25, 0.34 * s.size, 0.6 * s.size, (2.2 + r() * 1.8) * s.size, FLAME_Y, 0.7, off);
        }
        // embers popping off
        if (r() < 0.5 * k) {
          streak(ctx, s.x + (r() - 0.5) * s.size, s.y + 0.6, s.z + (r() - 0.5) * s.size,
            (r() - 0.5) * 2.4 + WIND_X, 2.5 + r() * 3.5, (r() - 0.5) * 2.4 + WIND_Z,
            1.2 + r() * 1.8, 0.016 + r() * 0.016, 0.006, 1.2 + r() * 1.5, EMBER, 0.75, off);
        }
        // fire-lit smoke leaving the flame tips
        if (r() < 0.55) {
          glowPuff(ctx, 'smoke', s.x + (r() - 0.5) * s.size, s.y + 1.1 + r() * 0.6, s.z + (r() - 0.5) * s.size,
            WIND_X * 0.6 + (r() - 0.5) * 0.6, 2.2 + r() * 1.4, WIND_Z * 0.6 + (r() - 0.5) * 0.6,
            3.2 + r() * 1.8, (0.9 + r() * 0.5) * s.size, (3.2 + r() * 1.6) * s.size,
            FIRE_LIGHT, glow * 0.55, SMOKE_DARK0, 0.46 + r() * 0.16, 0.8, off - r() * 0.03);
        }
      }
      // tall column: every band refreshed, base-heavy, leaning downwind
      if (columnHeightM > 0) {
        const H = Math.min(4 + age * 2.4, columnHeightM);
        for (let j = 0; j < 2; j++) {
          const hN = Math.pow(r(), 1.5);
          const h = hN * H;
          const lean = h * 0.30;
          const w = 1 + h * 0.14;
          glowPuff(ctx, 'smoke', cx + WIND_X * lean + (r() - 0.5) * w, cy + 1.6 + h, cz + WIND_Z * lean + (r() - 0.5) * w,
            WIND_X * (0.6 + h * 0.07) + (r() - 0.5) * 0.7, 1.6 + r() * 1.4, WIND_Z * (0.6 + h * 0.07) + (r() - 0.5) * 0.7,
            3.5 + r() * 2 + hN * 2.5, (1.4 + r() * 0.8 + h * 0.10), (4.2 + r() * 2.2 + h * 0.28),
            FIRE_LIGHT, glow * 0.4 * Math.max(0, 1 - hN * 2.2), hN > 0.6 ? SMOKE_DARK1 : SMOKE_DARK0,
            (0.28 + r() * 0.14) * (0.6 + 0.4 * k), 0.35, off - r() * 0.03);
        }
      }
    },
    light(nowS, out) {
      const age = nowS - startS;
      if (age < 0 || nowS > em.endS + 0.5) return false;
      const k = intensity * clamp(age / rampS, 0, 1) * clamp((em.endS + 0.5 - nowS) / 0.5, 0, 1);
      if (k <= 0.01) return false;
      const t = nowS * 1.0 + flick;
      const f = 0.78 + 0.12 * Math.sin(t * 13.1) + 0.07 * Math.sin(t * 7.3 + 1.7) + 0.05 * Math.sin(t * 23.7 + 0.4);
      out.x = cx; out.y = cy + 1.4; out.z = cz;
      out.intensity = 34 * k * f; out.range = 22; out.color = 0xff8a3c; out.priority = 1 + k;
      return true;
    },
    glow(nowS, out) {
      const age = nowS - startS;
      if (age < 0 || nowS > em.endS + 0.5) return false;
      const k = intensity * clamp(age / rampS, 0, 1) * clamp((em.endS + 0.5 - nowS) / 0.5, 0, 1);
      out.x = cx; out.z = cz; out.radius = 7 + 2 * src.length; out.intensity = k; out.seed = flick;
      return true;
    },
  });
  return em;
}

/** Burning ground (spilled fuel, burning grass): many low flames over an area. */
export function fireFieldEmitter(
  id: string, rng: Rng, world: CineWorld, startS: number, endS: number,
  x: number, z: number, radiusM: number, intensity: number, smoke: boolean,
): CineEmitter {
  const n = Math.round(clamp(radiusM * radiusM * 0.55, 6, 60));
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * radiusM;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    pts.push(px, world.groundY(px, pz) + 0.05, pz, 0.45 + rng() * 0.75);
  }
  const flick = rng() * 100;
  return makeEmitter<CineEmitter>({ id, startS, endS, periodS: 1 / 20, rng }, {
    tick(ctx, _tS, off, age) {
      const r = ctx.rng;
      const k = intensity * clamp(age / 0.8, 0, 1) * clamp((endS - (ctx.env.nowS + off)) / 2.5, 0, 1);
      if (k <= 0.01) return;
      const glow = glowShare(ctx, 0.8);
      for (let i = 0; i < pts.length; i += 4) {
        if (r() > 0.55 * k + 0.15) continue;
        const s = pts[i + 3];
        puff(ctx, 'fire', pts[i] + (r() - 0.5) * 0.5, pts[i + 1] + 0.1, pts[i + 2] + (r() - 0.5) * 0.5,
          (r() - 0.5) * 0.4 + WIND_X * 0.3, 1.0 + r() * 1.2, (r() - 0.5) * 0.4 + WIND_Z * 0.3,
          0.35 + r() * 0.45, (0.8 + r() * 0.5) * s, (0.35 + r() * 0.25) * s,
          r() < 0.2 ? WHITE_HOT : FLAME_Y, FLAME_O, 0.85, 2.6, off - r() * 0.04);
        if (r() < 0.12) {
          streak(ctx, pts[i], pts[i + 1] + 0.5, pts[i + 2], (r() - 0.5) * 1.6 + WIND_X, 2 + r() * 2.5, (r() - 0.5) * 1.6 + WIND_Z,
            1 + r() * 1.5, 0.015, 0.006, 1.4, EMBER, 0.7, off);
        }
        if (smoke && r() < 0.16) {
          glowPuff(ctx, 'smoke', pts[i], pts[i + 1] + 1.0, pts[i + 2], WIND_X * 0.8 + (r() - 0.5) * 0.5, 1.4 + r(), WIND_Z * 0.8 + (r() - 0.5) * 0.5,
            3.5 + r() * 2.5, 0.9 + s, 3.2 + s * 2, FIRE_LIGHT, glow * 0.55, SMOKE_DARK0, 0.34 + r() * 0.14, 0.45, off - r() * 0.04);
        }
      }
    },
    light(nowS, out) {
      if (nowS < startS || nowS > endS) return false;
      const t = nowS + flick;
      const f = 0.8 + 0.1 * Math.sin(t * 11.3) + 0.1 * Math.sin(t * 5.9 + 0.8);
      out.x = x; out.y = world.groundY(x, z) + 1.2; out.z = z;
      out.intensity = (14 + radiusM * 4) * intensity * f; out.range = 10 + radiusM * 2.5; out.color = 0xff8a3c;
      out.priority = 0.8 + intensity * radiusM * 0.08;
      return true;
    },
    glow(nowS, out) {
      if (nowS < startS || nowS > endS) return false;
      out.x = x; out.z = z; out.radius = radiusM * 1.6 + 2; out.intensity = intensity; out.seed = flick;
      return true;
    },
  });
}

/** Drifting embers rising off a fire (or a whole burning street). */
export function emberEmitter(
  id: string, rng: Rng, startS: number, endS: number, x: number, y: number, z: number,
  radiusM: number, rate: number, rise: number,
): CineEmitter {
  const period = 1 / 30;
  const per = rate * period;
  return makeEmitter<CineEmitter>({ id, startS, endS, periodS: period, rng }, {
    tick(ctx, _tS, off) {
      const r = ctx.rng;
      let n = Math.floor(per) + (r() < per - Math.floor(per) ? 1 : 0);
      while (n-- > 0) {
        const a = r() * TAU, d = Math.sqrt(r()) * radiusM;
        streak(ctx, x + Math.cos(a) * d, y + r() * 0.8, z + Math.sin(a) * d,
          (r() - 0.5) * 1.8 + WIND_X * 1.2, rise * (0.6 + r() * 0.9), (r() - 0.5) * 1.8 + WIND_Z * 1.2,
          1.8 + r() * 2.6, 0.014 + r() * 0.018, 0.004 + r() * 0.006, rise * 0.35, r() < 0.25 ? SPARK : EMBER, 0.65 + r() * 0.35, off - r() * period);
      }
    },
  });
}

/** Persistent leaning smoke column (huge explosions, burning depots). */
export function columnEmitter(
  id: string, rng: Rng, startS: number, endS: number, x: number, y: number, z: number,
  heightM: number, widthM: number, darkness: number,
): CineEmitter {
  return makeEmitter<CineEmitter>({ id, startS, endS, periodS: 1 / 20, rng }, {
    tick(ctx, _tS, off, age) {
      const r = ctx.rng;
      const fade = clamp((endS - (ctx.env.nowS + off)) / 6, 0, 1);
      const H = Math.min(6 + age * 3.2, heightM);
      const glow = glowShare(ctx, 0.5);
      for (let j = 0; j < 4; j++) {
        const hN = Math.pow(r(), 1.35);
        const h = hN * H;
        const lean = h * 0.32;
        const w = widthM * (0.5 + hN * 0.9);
        const albedo = darkness > 0.5 ? (hN > 0.55 ? SMOKE_DARK1 : SMOKE_DARK0) : (hN > 0.55 ? SMOKE_MID : SMOKE_DARK1);
        glowPuff(ctx, 'smoke', x + WIND_X * lean + (r() - 0.5) * w, y + h + 1, z + WIND_Z * lean + (r() - 0.5) * w,
          WIND_X * (0.8 + h * 0.06) + (r() - 0.5), 2 + r() * 2, WIND_Z * (0.8 + h * 0.06) + (r() - 0.5),
          4.5 + r() * 2.5 + hN * 3, widthM * (0.45 + r() * 0.3) + h * 0.12, widthM * (1.3 + r() * 0.7) + h * 0.32,
          FIRE_LIGHT, hN < 0.3 ? glow * 0.5 * (1 - hN / 0.3) : 0, albedo, (0.32 + r() * 0.14) * fade, 0.3, off - r() * 0.05);
      }
    },
  });
}

/**
 * Illumination flare under a parachute: an optional launch streak, a burst,
 * then a magnesium core drifting down with the wind trailing lit smoke. The
 * runtime turns light() into the borrowed scene light and sprite() into
 * the glare billboard.
 */
export function flareEmitter(
  id: string, rng: Rng, startS: number, x: number, y0: number, z: number,
  opts: { heightM: number; burnS: number; driftMps: number; fallMps: number; intensity: number; color: number; launch: boolean },
): CineEmitter {
  const climbS = opts.launch ? 1.6 : 0;
  const burstY = y0 + opts.heightM;
  const sway = rng() * TAU;
  const endS = startS + climbS + opts.burnS;
  const col = opts.color;
  const cr = ((col >> 16) & 255) / 255, cg = ((col >> 8) & 255) / 255, cb = (col & 255) / 255;
  const trailEmit: Vec3 = hexRgb([0, 0, 0], col);
  const trailAlbedo = hex(0x8c8f93);
  const at = (t: number, out: Vec3): Vec3 => {
    if (t < climbS) {
      const u = t / climbS;
      const e = 1 - (1 - u) * (1 - u);
      return set3(out, x + WIND_X * 2 * u, y0 + (burstY - y0) * e, z + WIND_Z * 2 * u);
    }
    const b = t - climbS;
    const dx = WIND_X * opts.driftMps * b + Math.sin(b * 0.9 + sway) * 1.6;
    const dz = WIND_Z * opts.driftMps * b + Math.cos(b * 0.7 + sway) * 1.6;
    return set3(out, x + WIND_X * 2 + dx, burstY - opts.fallMps * b, z + WIND_Z * 2 + dz);
  };
  const pos: Vec3 = [0, 0, 0];
  const brightness = (t: number): number => {
    if (t < climbS) return 0.0;
    const b = t - climbS;
    const ignite = clamp(b / 0.35, 0, 1);
    const die = clamp((opts.burnS - b) / 2.5, 0, 1);
    return ignite * die * (0.86 + 0.08 * Math.sin(t * 17.3 + sway) + 0.06 * Math.sin(t * 6.1));
  };
  return makeEmitter<CineEmitter>({ id, startS, endS, periodS: 1 / 30, rng }, {
    tick(ctx, tS, off) {
      const r = ctx.rng;
      const t = tS - startS;
      at(t, pos);
      if (t < climbS) {
        // launch: hot rising streak + thin smoke
        streak(ctx, pos[0], pos[1], pos[2], (r() - 0.5) * 0.5, 4 + r() * 3, (r() - 0.5) * 0.5, 0.25, 0.05, 0.02, -2, SPARK, 0.9, off);
        if (r() < 0.6) puff(ctx, 'smoke', pos[0], pos[1], pos[2], (r() - 0.5) * 0.2, 0.2, (r() - 0.5) * 0.2, 2.5 + r(), 0.35, 1.6, PROP0, PROP1, 0.32, 0.05, off);
        return;
      }
      if (t - climbS < 1 / 30 + 1e-9) {
        // burst pop at ignition
        puff(ctx, 'flash', pos[0], pos[1], pos[2], 0, 0, 0, 0.18, 2.5, 7, WHITE_HOT, WHITE_HOT, 1, 0, off);
        sparkShower(ctx, pos[0], pos[1], pos[2], 0, -1, 0, 26, 9, 1.2, off);
      }
      const k = brightness(t);
      // lit smoke trail left above the descending flare
      if (r() < 0.8) {
        glowPuff(ctx, 'smoke', pos[0] + (r() - 0.5) * 0.25, pos[1] + 0.25, pos[2] + (r() - 0.5) * 0.25,
          (r() - 0.5) * 0.25 + WIND_X * 0.4, 0.25 + r() * 0.2, (r() - 0.5) * 0.25 + WIND_Z * 0.4,
          5 + r() * 3, 0.5, 2.4 + r() * 1.2, trailEmit, 1.4 * k * opts.intensity, trailAlbedo,
          0.40 * (0.4 + 0.6 * k), 0.06, off - r() * 0.03);
      }
      // dripping magnesium sparks
      if (r() < 0.45 * k) {
        streak(ctx, pos[0], pos[1] - 0.2, pos[2], (r() - 0.5) * 1.2, -1 - r() * 2, (r() - 0.5) * 1.2,
          0.6 + r() * 0.8, 0.02, 0.01, -9.8, WHITE_HOT, 0.9, off);
      }
    },
    light(nowS, out) {
      const t = nowS - startS;
      if (t < climbS || nowS > endS) return false;
      const k = brightness(t);
      if (k <= 0.01) return false;
      at(t, pos);
      out.x = pos[0]; out.y = pos[1]; out.z = pos[2];
      // keep the lit ground at a cinematic ~1.3 (twice the moon) as the flare
      // sinks: candela follows height^2 instead of overexposing the finale
      const h = Math.max(10, pos[1] - y0);
      out.intensity = 1.3 * h * h * opts.intensity * k; out.range = h * 4.2 + 70; out.color = col;
      out.priority = 10 + opts.intensity * k;
      return true;
    },
    parachute(nowS, out) {
      const t = nowS - startS;
      if (t < climbS + 0.4 || nowS > endS) return false;
      at(t, pos);
      // canopy rides ~2.2 m above the burning candle, swinging with it
      out[0] = pos[0] - Math.sin(t * 0.9 + sway) * 0.35; out[1] = pos[1] + 2.2; out[2] = pos[2] - Math.cos(t * 0.7 + sway) * 0.35;
      return true;
    },
    sprite(nowS, index, out) {
      if (index > 0) return false;
      const t = nowS - startS;
      if (t < 0 || nowS > endS) return false;
      at(t, pos);
      const k = t < climbS ? 0.25 : brightness(t);
      if (k <= 0.01) return false;
      out.x = pos[0]; out.y = pos[1]; out.z = pos[2];
      out.size = t < climbS ? 1.2 : 5.5; out.r = 0.55 + cr * 0.45; out.g = 0.55 + cg * 0.45; out.b = 0.5 + cb * 0.5;
      out.intensity = (t < climbS ? 1.5 : 6) * k * opts.intensity;
      return true;
    },
  });
}

/** Linear-RGB ground tone helper exposed to the runtime's world adapter. */
export function toneFromHex(out: GroundTone, lightHex: number, darkHex: number, snow: boolean, wet: boolean): GroundTone {
  hexRgb(out.light, lightHex); hexRgb(out.dark, darkHex); out.snow = snow; out.wet = wet;
  return out;
}

/** Track-dust packet for a moving actor: churn behind each track + a rising wake. */
export function trackDustPacket(
  ctx: CineCtx, x: number, z: number, dirX: number, dirZ: number, speedMps: number, sizeK: number, off: number,
): void {
  const r = ctx.rng;
  const gy = ctx.world.groundY(x, z);
  const wet = ctx.world.water(x, z);
  const tone = toneAt(ctx, x, z);
  const sp = clamp(speedMps / 12, 0, 1.4);
  if (wet > 0.35) {
    // spray instead of dust
    puff(ctx, 'dust', x, gy + 0.3, z, -dirX * 2 + (r() - 0.5) * 1.5, 1.6 + sp * 2, -dirZ * 2 + (r() - 0.5) * 1.5,
      0.5 + r() * 0.4, 0.3, 1.2 + sp, SPRAY0, SPRAY1, 0.32, -6, off);
    return;
  }
  const dustK = tone.snow ? 1.1 : 1;
  // low churn kicked straight back off the track
  puff(ctx, 'dust', x + (r() - 0.5) * 0.4, gy + 0.25 + r() * 0.2, z + (r() - 0.5) * 0.4,
    -dirX * (1.5 + sp * 3) + (r() - 0.5) * 1.2, 0.8 + sp * 1.4 + r() * 0.6, -dirZ * (1.5 + sp * 3) + (r() - 0.5) * 1.2,
    0.9 + r() * 0.7, 0.3 * sizeK, (1.2 + sp * 1.4) * sizeK, tone.light, tone.dark, (0.30 + 0.25 * sp) * dustK, -0.6, off);
  // billowing wake that rises, spreads and drifts downwind for seconds
  if (r() < 0.55 + 0.35 * sp) {
    puff(ctx, 'dust', x + (r() - 0.5) * 0.8, gy + 0.6 + r() * 0.5, z + (r() - 0.5) * 0.8,
      dirX * sp * 1.2 + (r() - 0.5) * 1.1 + WIND_X * 0.7, 0.6 + r() * 0.9 * sp, dirZ * sp * 1.2 + (r() - 0.5) * 1.1 + WIND_Z * 0.7,
      3.2 + r() * 2.8, (0.6 + 0.5 * sp) * sizeK, (3.0 + sp * 3.2 + r() * 1.4) * sizeK,
      tone.light, tone.dark, (0.18 + 0.22 * sp) * dustK, 0.05, off - r() * 0.02);
  }
  // thrown clods on soft ground at speed
  if (!tone.snow && sp > 0.45 && r() < 0.25) {
    chunk(ctx, x, gy + 0.3, z, -dirX * (3 + r() * 3) + (r() - 0.5) * 2, 2 + r() * 2.5, -dirZ * (3 + r() * 3) + (r() - 0.5) * 2,
      0.9, 0.035 + r() * 0.04, gy, 0, off);
  }
}

/**
 * Smoke screen: a real launcher salvo (canister receipts from the game's own
 * smoke ballistics) — ripple pops at the dischargers, canisters arcing out
 * with thin trails, white bursts where they land, then a thick wall that
 * blooms, rolls and drifts with the battle smoke wind before thinning out.
 */
/** (2026-10-09) The screen's walls, handed in by the Studio from the simulation (src/sim/smokeScreen.ts, no import here):
 * the canisters' paths with their bounces, each cloud held outside the walls round its rest, and the surface it
 * stands on (a roof's, when it rests on one). */
export interface SmokeScreenWalls {
  pathAt(canister: readonly number[], t: number, out: Vec3): void;
  velAt(canister: readonly number[], t: number, out: Vec3): void;
  hold(index: number, cx: number, cz: number, radius: number, at: { x: number; z: number }): void;
  base(index: number, x: number, z: number): number;
  /** How near the walls stand to a point of a canister's cloud (m; Infinity in the open): a puff's size is held to it. */
  room(index: number, x: number, z: number): number;
}
export function smokeScreenEmitter(
  id: string, rng: Rng, startS: number, durationS: number, density: number,
  canisters: readonly (readonly number[])[], windX: number, windZ: number, gravity: number,
  groundY: (x: number, z: number) => number, walls: SmokeScreenWalls | null = null,
): CineEmitter {
  // canister receipts: [x0,y0,z0, vx,vy,vz, landS, (bounces: tS, x,y,z, vx,vy,vz)*]
  const shots = canisters.map((c, i) => ({ c, delay: i * 0.06, i }));
  const endS = startS + durationS + 6;
  const posAt = (shot: { c: readonly number[] }, t: number, out: Vec3): Vec3 => {
    const tt = clamp(t, 0, shot.c[6]);
    if (walls) { walls.pathAt(shot.c, tt, out); return out; }
    return set3(out, shot.c[0] + shot.c[3] * tt, shot.c[1] + shot.c[4] * tt - 0.5 * gravity * tt * tt, shot.c[2] + shot.c[5] * tt);
  };
  const v: Vec3 = [0, 0, 0];
  const at = { x: 0, z: 0 };
  const p: Vec3 = [0, 0, 0];
  const white0 = hex(0xaeb6b8), white1 = hex(0xb8c1c2), bloom = hex(0xe8eeee);
  const smooth = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  return makeEmitter<CineEmitter>({ id, startS, endS, periodS: 1 / 30, rng }, {
    tick(ctx, tS, off) {
      const r = ctx.rng;
      const t = tS - startS;
      for (const shot of shots) {
        const st = t - shot.delay;
        const land = shot.c[6];
        if (st < 0) continue;
        if (st < 1 / 30 + 1e-9) {
          // discharger pop
          posAt(shot, 0, p);
          puff(ctx, 'flash', p[0], p[1], p[2], shot.c[3] * 0.2, shot.c[4] * 0.2, shot.c[5] * 0.2, 0.07, 0.4, 1.3, WHITE_HOT, FLAME_Y, 0.9, 0, off);
          for (let j = 0; j < 4; j++) {
            puff(ctx, 'psmoke', p[0], p[1], p[2], shot.c[3] * 0.15 + (r() - 0.5), shot.c[4] * 0.15 + 0.4, shot.c[5] * 0.15 + (r() - 0.5),
              1.6 + r(), 0.3, 1.5 + r(), PROP0, PROP1, 0.4, 0.2, off);
          }
        }
        if (st <= land) {
          posAt(shot, st, p);
          if (r() < 0.9) puff(ctx, 'psmoke', p[0], p[1], p[2], (r() - 0.5) * 0.3, 0.2, (r() - 0.5) * 0.3, 1.2 + r() * 0.8, 0.12, 0.9, white0, white1, 0.45, 0.1, off);
          continue;
        }
        const after = st - land;
        posAt(shot, land, p);
        const gy = walls ? walls.base(shot.i, p[0], p[2]) : groundY(p[0], p[2]);
        if (after < 1 / 30 + 1e-9) {
          // landing burst: bright white bloom with streamers
          for (let j = 0; j < 12; j++) {
            const a = r() * TAU;
            const sp = 3 + r() * 5;
            puff(ctx, 'screen', p[0], gy + 0.6, p[2], Math.cos(a) * sp, 1.5 + r() * 3, Math.sin(a) * sp,
              2.5 + r() * 2, 0.6, 3.2 + r() * 1.5, bloom, white1, 0.75, 0.2, off);
          }
          sparkShower(ctx, p[0], gy + 0.3, p[2], 0, 1, 0, 14, 7, 1.3, off);
        }
        // wall growth and decay (same envelope family as sim/smokeScreen.ts)
        const growth = smooth(after / 2.4);
        const fade = 1 - smooth((t - (durationS - 4.5)) / 4.5);
        const dens = growth * fade * density;
        if (dens < 0.02) continue;
        const radius = 1.2 + growth * 6.8;
        const height = 0.8 + growth * 3.6;
        let driftX = windX * after, driftZ = windZ * after;
        if (walls) {
          // (the breeze carries the cloud no nearer a wall than the simulation lets it)
          at.x = p[0] + driftX; at.z = p[2] + driftZ;
          walls.hold(shot.i, p[0], p[2], 1e9, at);
          driftX = at.x - p[0]; driftZ = at.z - p[2];
        }
        const n = r() < 0.5 * dens ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const a = r() * TAU, d = Math.sqrt(r()) * radius;
          const lift = r() * height;
          at.x = p[0] + driftX + Math.cos(a) * d; at.z = p[2] + driftZ + Math.sin(a) * d;
          if (walls) walls.hold(shot.i, p[0] + driftX, p[2] + driftZ, radius, at);
          // (a puff by a wall no wider than its room there and a metre: neither through the wall nor over the roof)
          const cap = walls ? Math.max(1.6, 2 * (walls.room(shot.i, at.x, at.z) + 1)) : Infinity;
          puff(ctx, 'screen', at.x, gy + 1.0 + lift, at.z,
            windX + (r() - 0.5) * 0.35, 0.10 + r() * 0.18, windZ + (r() - 0.5) * 0.35,
            4.5 + r() * 2.5, Math.min(2.8 + growth * 1.6, cap * 0.6), Math.min(6.2 + growth * 3.4 + r() * 1.6, cap),
            white0, white1, Math.min(0.85, 0.42 + 0.36 * dens), 0.02, off - r() * (1 / 30));
        }
      }
    },
    canisters(nowS, visit) {
      const t = nowS - startS;
      for (const shot of shots) {
        const st = t - shot.delay;
        if (st < 0 || st > shot.c[6]) continue;
        posAt(shot, st, p);
        if (walls) { walls.velAt(shot.c, st, v); visit(p[0], p[1], p[2], v[0], v[1], v[2]); }
        else visit(p[0], p[1], p[2], shot.c[3], shot.c[4] - gravity * st, shot.c[5]);
      }
    },
  });
}

/** Linear interpolation shared with the runtime. */
export { lerp as cineLerp, clamp as cineClamp };
