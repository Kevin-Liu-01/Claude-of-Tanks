/**
 * atmosRecipes.ts — the battle's atmospherics built from simulated media (atmospherics lane, 2026-10-08): smoke screens
 * first; missile and rocket trails, distant plumes and ambient haze follow on the same page.
 *
 * The recipes write through a BlastContext (blastRecipes.ts): the destruction-fx lane's media layer (volumeMedia.ts:
 * baked 3D billow and burst flipbooks, six-way lit, depth sorted) and its additive pools. Unlike a burst, a smoke
 * screen is SCHEDULED: its presentation (auxiliaryPresentation.ts) emits each puff at a fixed time of the screen's own
 * life, so every recipe here takes its own seeded stream `R` (puffRandom) rather than the shared fx stream — the same
 * screen draws the same puffs whatever the frame rate, and a late joiner sees the cloud a player saw from its start.
 *
 * A VEHICLE SMOKE SCREEN (grenade launchers: M250/M257, Wegmann 76 mm, 902 Tucha, L8), as it looks:
 *   1. the grenades fly out on low arcs (a faint wisp at most);
 *   2. each one bursts with a sharp white pop: a dense white ball thrown out in lobes, a short flash and a few burning
 *      pellets arcing out with white streamers;
 *   3. within one to two seconds the pops bloom into one dense white wall, as tall as a house: broad lobes at its foot,
 *      rounded cauliflower crowns over them, sunlit white and cool grey in shade;
 *   4. the wall holds, churning slowly, and drifts downwind; wisps tear off its top and stream away;
 *   5. it thins from the top and the edges, the edges going fibrous, and is gone.
 * The wall is shaped to the simulation's own sight-blocking envelope (sim/smokeScreen.ts: per bank an ellipsoid that
 * grows to 10.5 m across and 4 m up over 2.2 s after its canister lands, drifting with a fixed light breeze and fading
 * from 13.5 s to 18 s), so what a player sees is what blocks sight.
 */
import type { BlastContext } from './blastRecipes.ts';
import { linearHex } from './surfaceLooks.ts';

type Rgb = readonly [number, number, number];
const TAU = Math.PI * 2;

/** The dense fresh screen: red-phosphorus and multispectral smoke is white (an albedo near a cloud's). */
const SCREEN_WHITE: Rgb = linearHex(0xdcdedc);
/** The screen as it thins: a little greyer, never blue (the media's shaded sky is desaturated). */
const SCREEN_AGED: Rgb = linearHex(0xc4c7c6);
/** The burst's own white, a shade brighter than the wall it becomes. */
const BURST_WHITE: Rgb = linearHex(0xeeeeea);
/** The launch wisp behind a grenade in flight: the fuse's thin grey-white smoke. */
const WISP_GREY: Rgb = linearHex(0xb8bab6);
const FLASH_WARM: readonly [number, number, number] = [1, 0.9, 0.7];
const FLASH_DEEP: readonly [number, number, number] = [1, 0.55, 0.2];
const PELLET: readonly [number, number, number] = [1, 0.82, 0.55];

/** A seeded stream (mulberry32) for one scheduled emission: `puffRandom(seed)` gives the same numbers every time. */
export function puffRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for one emission slot: the screen (its birth on the match clock and its place), the bank, the slot. */
export function slotSeed(born: number, x: number, z: number, bank: number, slot: number): number {
  let h = Math.imul(Math.round(born * 1000) | 0, 0x9e3779b1) ^ Math.imul(Math.round(x * 16) | 0, 0x85ebca6b)
    ^ Math.imul(Math.round(z * 16) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) ^ Math.imul(bank + 1, 0x846ca68b) ^ Math.imul(slot + 7, 0x27d4eb2d);
  return (h ^ (h >>> 15)) | 0;
}

function look(C: BlastContext, c0: Rgb, c1: Rgb, density: number, fadeIn: number, fadeOut: number): void {
  const m = C.m;
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.density = density; m.fadeIn = fadeIn; m.fadeOut = fadeOut;
}
function book(C: BlastContext, R: () => number, medium: 'billow' | 'burst', playSeconds: number, startFrame: number,
  aspect: number): void {
  const m = C.m;
  m.medium = medium; m.variant = 0; m.mirror = R() < 0.5; m.playSeconds = playSeconds; m.startFrame = startFrame;
  m.aspect = aspect; m.heat = 0; m.cool = 1;
}

// ---------------------------------------------------------------------------------------------------------------
// The grenade in flight and its burst
// ---------------------------------------------------------------------------------------------------------------

/** One thin wisp behind a grenade in flight (the caller spaces them along the arc). */
export function smokeGrenadeWisp(C: BlastContext, R: () => number, x: number, y: number, z: number, bo: number): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.3; m.vy = 0.2 + R() * 0.2; m.vz = (R() - 0.5) * 0.3;
  m.drag = 1.5; m.rise = 0.15; m.windK = 0.6; m.grav = 0;
  m.life = 1.1 + R() * 0.5; m.size0 = 0.25; m.size1 = 1.0 + R() * 0.5; m.growExp = 1.8;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
  look(C, WISP_GREY, WISP_GREY, 0.3, 0.02, 0.35);
  book(C, R, 'billow', 1.6, 18 + Math.floor(R() * 12), 1);
  C.media(m);
}

/**
 * (r2, wave 311: "rows of tiny black dots that burst into dark smoke") the launch at the tube: the expelling charge
 * throws a short white-grey puff out after the grenade (vx, vy, vz its flight), which stalls within a metre or two.
 */
export function smokeLaunchPuff(C: BlastContext, R: () => number, x: number, y: number, z: number,
  vx: number, vy: number, vz: number, bo: number): void {
  const m = C.m;
  const v = Math.hypot(vx, vy, vz) || 1, k = 2.6 / v;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = vx * k + (R() - 0.5) * 0.4; m.vy = vy * k + 0.3; m.vz = vz * k + (R() - 0.5) * 0.4;
  m.drag = 2.2; m.rise = 0.12; m.windK = 0.5; m.grav = 0;
  m.life = 1.5 + R() * 0.5; m.size0 = 0.45; m.size1 = 1.9 + R() * 0.6; m.growExp = 2.6;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.12;
  look(C, BURST_WHITE, WISP_GREY, 0.62, 0.0, 0.4);
  book(C, R, 'billow', 1.9, 4 + Math.floor(R() * 10), 1.05);
  C.media(m);
}

/**
 * A grenade's burst where it lands (x, gy the ground there, z): the pop — a dense white ball thrown out in lobes — a
 * short warm flash, burning pellets arcing out and white streamers left along their arcs. `k` thins the pellets and
 * streamers where many grenades burst together (1 alone .. ~0.25 in a 24-tube salvo).
 */
export function smokeGrenadeBurst(C: BlastContext, R: () => number, x: number, gy: number, z: number, k: number,
  bo: number): void {
  const m = C.m;
  const y = gy + 0.55;
  // the flash: a small warm pop, gone in a frame or two (red phosphorus ignites; the wall itself never glows)
  const lp = C.lp;
  lp.pos[0] = x; lp.pos[1] = y + 0.3; lp.pos[2] = z; lp.vel[0] = 0; lp.vel[1] = 0.5; lp.vel[2] = 0;
  lp.life = 0.09; lp.size0 = 0.7; lp.size1 = 1.9; lp.rot = R() * TAU; lp.rotVel = 0;
  lp.col0[0] = FLASH_WARM[0]; lp.col0[1] = FLASH_WARM[1]; lp.col0[2] = FLASH_WARM[2];
  lp.col1[0] = FLASH_DEEP[0]; lp.col1[1] = FLASH_DEEP[1]; lp.col1[2] = FLASH_DEEP[2];
  lp.alpha = 0.55; lp.grav = 0; lp.birthOffset = bo;
  C.flash(lp);
  // the pop: four lobes of dense white thrown out and up, stalling within a second, already a body three to five
  // metres across (the 'burst' book: a smooth ball that develops lobes as it swells)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + (R() - 0.5) * 1.1, v = 3.2 + R() * 3.2;
    m.x = x + Math.cos(a) * 0.3; m.y = y + R() * 0.3; m.z = z + Math.sin(a) * 0.3; m.birthOffset = bo - R() * 0.02;
    m.vx = Math.cos(a) * v; m.vy = 2.2 + R() * 2.6; m.vz = Math.sin(a) * v;
    m.drag = 2.4; m.rise = 0.12; m.windK = 0.15; m.grav = 0;
    m.life = 2.6 + R() * 0.8; m.size0 = 0.8; m.size1 = 3.6 + R() * 1.6; m.growExp = 3.6;
    m.rot = (R() - 0.5) * 0.8; m.spin = (R() - 0.5) * 0.12;
    look(C, BURST_WHITE, SCREEN_WHITE, 0.96, 0.0, 0.62);
    book(C, R, 'burst', 3.0, Math.floor(R() * 4), 1.05 + R() * 0.2);
    C.media(m);
  }
  // burning pellets thrown out on arcs, each leaving a white streamer: the burst's tell at a distance
  const pellets = Math.max(2, Math.round(6 * k));
  const ls = C.ls;
  for (let i = 0; i < pellets; i++) {
    const a = R() * TAU, up = 0.45 + R() * 0.45, v = 7 + R() * 6;
    const vx = Math.cos(a) * (1 - up) * v, vy = up * v, vz = Math.sin(a) * (1 - up) * v;
    ls.pos[0] = x; ls.pos[1] = y + 0.2; ls.pos[2] = z;
    ls.vel[0] = vx; ls.vel[1] = vy; ls.vel[2] = vz;
    ls.life = 0.55 + R() * 0.35; ls.width = 0.035; ls.stretch = 0.012; ls.grav = -9.8;
    ls.col[0] = PELLET[0]; ls.col[1] = PELLET[1]; ls.col[2] = PELLET[2]; ls.alpha = 0.8; ls.seed = R();
    ls.birthOffset = bo;
    C.sparks(ls);
    // the streamer: small puffs left along the pellet's arc (born where it passes, as it passes), drifting a little
    for (let j = 1; j <= 3; j++) {
      const t = j * 0.12;
      m.x = x + vx * t; m.y = y + 0.2 + vy * t - 4.9 * t * t; m.z = z + vz * t; m.birthOffset = bo + t;
      m.vx = vx * 0.08; m.vy = 0.25; m.vz = vz * 0.08;
      m.drag = 1.2; m.rise = 0.2; m.windK = 0.5; m.grav = 0;
      m.life = 1.8 + R() * 0.9; m.size0 = 0.35; m.size1 = 1.3 + R() * 0.7 + 0.25 * j; m.growExp = 2.2;
      m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
      look(C, BURST_WHITE, SCREEN_AGED, 0.62, 0.0, 0.45);
      book(C, R, 'billow', 2.2, 10 + Math.floor(R() * 14), 1);
      C.media(m);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The wall: bloom lobes, the body that keeps it dense, the wisps that tear off its top
// ---------------------------------------------------------------------------------------------------------------

/** Where a puff is born and where it settles (the bank's lobe), and its scheduled life. */
export interface SmokeLobeInput {
  /** birth: the grenade's burst (m) */
  x0: number; y0: number; z0: number;
  /** the lobe's settled place (m): its centre, over the ground there */
  tx: number; ty: number; tz: number;
  /** card size at full growth (m), the life (s), and the life fraction the erosion starts at */
  size: number; life: number; fadeOut: number;
  /** a crown lobe sits on the wall's top: rounder, a little taller, catching the most sun */
  crown: boolean;
  bo: number;
}

/**
 * A bloom lobe: born at the burst, it swells and travels out to its place in the bank in about two seconds (the
 * simulation's growth: smoothstep over 2.2 s), then holds there, churning (the media's eddies), until it thins.
 * It takes none of the scene's wind: the wall drifts with the simulation's breeze (the caller's later puffs are born
 * where the drifted bank is), so the cloud a player sees is where sight is blocked.
 */
export function smokeBankLobe(C: BlastContext, R: () => number, I: SmokeLobeInput): void {
  const m = C.m;
  const k = 1.15;
  const rise = 0.06;
  m.x = I.x0; m.y = I.y0; m.z = I.z0; m.birthOffset = I.bo;
  m.vx = (I.tx - I.x0) * k; m.vy = (I.ty - I.y0) * k + rise; m.vz = (I.tz - I.z0) * k;
  m.drag = k; m.rise = rise; m.windK = 0; m.grav = 0;
  m.life = I.life; m.size0 = 1.4; m.size1 = I.size; m.growExp = 4.2;
  m.rot = (R() - 0.5) * 0.5; m.spin = (R() - 0.5) * 0.03;
  look(C, I.crown ? BURST_WHITE : SCREEN_WHITE, SCREEN_AGED, I.crown ? 0.9 : 0.95, 0.0, I.fadeOut);
  // the billow book over the whole life: it keeps rolling slowly (a 12 s life plays its 64 frames once)
  book(C, R, 'billow', I.life * (0.9 + R() * 0.2), Math.floor(R() * 8), I.crown ? 1.0 + R() * 0.15 : 1.15 + R() * 0.25);
  C.media(m);
}

/** A body puff: born inside the bank (already where the drifting bank is), swelling in from small to fill it. */
export function smokeBankBody(C: BlastContext, R: () => number, x: number, y: number, z: number, size: number,
  life: number, fadeOut: number, bo: number): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.5; m.vy = 0.15 + R() * 0.15; m.vz = (R() - 0.5) * 0.5;
  m.drag = 0.8; m.rise = 0.07; m.windK = 0; m.grav = 0;
  m.life = life; m.size0 = size * 0.35; m.size1 = size; m.growExp = 2.4;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.03;
  // fades in from inside the wall, never popping on at its edge
  look(C, SCREEN_WHITE, SCREEN_AGED, 0.9, 0.7, fadeOut);
  book(C, R, 'billow', life * (0.9 + R() * 0.2), Math.floor(R() * 16), 1.1 + R() * 0.3);
  C.media(m);
}

/**
 * (r2, wave 311: "gone by 18 s with no residual haze") the screen's tail: a broad, thin, see-through veil left in the
 * bank as its wall erodes, drifting with the simulation's own breeze (wx, wz: it stays inside the drifting envelope)
 * and fraying away by the screen's end. Its density hides nothing: the simulation stops blocking sight by then.
 */
export function smokeScreenHaze(C: BlastContext, R: () => number, x: number, y: number, z: number, wx: number,
  wz: number, life: number, bo: number, maxSize = Infinity): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  // a near-constant drift (drag 0.05 keeps ~90 % of it over the tail's few seconds)
  m.vx = wx * 1.1 + (R() - 0.5) * 0.15; m.vy = 0.05 + R() * 0.06; m.vz = wz * 1.1 + (R() - 0.5) * 0.15;
  m.drag = 0.05; m.rise = 0.04; m.windK = 0; m.grav = 0;
  m.life = life; m.size1 = Math.min(13 + R() * 2.5, maxSize); m.size0 = Math.min(9, m.size1 * 0.7); m.growExp = 1.4;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.02;
  look(C, SCREEN_AGED, SCREEN_AGED, 0.34, 1.0, 0.5);
  book(C, R, 'billow', life * 1.1, 24 + Math.floor(R() * 20), 1.45 + R() * 0.3);
  C.media(m);
}

/**
 * A wisp torn off the wall's top: thin, taking the scene's wind and rising a little faster, it streams away downwind
 * and frays. Visual only (above the blocking envelope's crown), it is what makes the wall read as smoke in a breeze.
 */
export function smokeBankWisp(C: BlastContext, R: () => number, x: number, y: number, z: number, bo: number, maxSize = Infinity): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.4; m.vy = 0.3 + R() * 0.3; m.vz = (R() - 0.5) * 0.4;
  m.drag = 0.6; m.rise = 0.28; m.windK = 0.75; m.grav = 0;
  m.life = 4.5 + R() * 2.0; m.size1 = Math.min(6.0 + R() * 2.5, maxSize); m.size0 = Math.min(2.0, m.size1 * 0.5); m.growExp = 1.6;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.05;
  look(C, SCREEN_WHITE, SCREEN_AGED, 0.42, 0.6, 0.35);
  book(C, R, 'billow', 6.0, 20 + Math.floor(R() * 20), 1.3 + R() * 0.4);
  C.media(m);
}
