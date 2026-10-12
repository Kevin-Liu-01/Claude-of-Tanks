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

/** The dense fresh screen: red-phosphorus and multispectral smoke is white (an albedo near a cloud's); (fx 8c, the
 *  critics: "a cool white wall in the desert") warm, never the green-grey cast 0xdcdedc had; (fx 9, wave 403 on the
 *  farmland: "a beige cast, so sunlit crowns read cream") a neutral white — the scene's light gives the warmth (the
 *  desert's warm sun and ground bounce, volumeMedia's near-white ground hue) */
const SCREEN_WHITE: Rgb = linearHex(0xe2e2df);
/** The screen as it thins: a little greyer, never blue (the media's shaded sky is desaturated). */
const SCREEN_AGED: Rgb = linearHex(0xc7c7c4);
/** The burst's own white, a shade brighter than the wall it becomes. */
const BURST_WHITE: Rgb = linearHex(0xefefec);
/** The launch wisp behind a grenade in flight: the fuse's thin grey-white smoke. */
const WISP_GREY: Rgb = linearHex(0xbcbcb9);
/** (fx 8m) the dust a grenade knocks off a wall it strikes: masonry, plaster and render, a light warm grey. */
const MASONRY_DUST: Rgb = linearHex(0xa59c90);
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

const _tone0: [number, number, number] = [0, 0, 0], _tone1: [number, number, number] = [0, 0, 0];
/** A colour at `k` of its brightness (into a scratch triple: no allocation). */
function toned(out: [number, number, number], c: Rgb, k: number): Rgb {
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  return out;
}

/** (fx 8r) a puff meeting a wall fades into it more softly: the feather scale (1 in the open, up to 3), carried in an
 *  unheated puff's cool as a negative (volumeMedia.ts VolumePuff); call after book(), which resets heat and cool */
function feathered(C: BlastContext, feather: number): void {
  if (feather > 1) C.m.cool = -Math.min(3, feather);
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

/**
 * One thin wisp behind a grenade in flight (the caller spaces them along the arc). (fx 8m, wave 337: "strings of
 * hard-edged near-white balls" tracing the arcs over the house) small, faint puffs left closer together than their own
 * size, swelling within a few tenths of a second and gone within a second: the arc reads as one fading thread of the
 * fuse's smoke, never a dotted line of balls.
 */
export function smokeGrenadeWisp(C: BlastContext, R: () => number, x: number, y: number, z: number, bo: number): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.2; m.vy = 0.1 + R() * 0.15; m.vz = (R() - 0.5) * 0.2;
  m.drag = 1.5; m.rise = 0.12; m.windK = 0.6; m.grav = 0;
  m.life = 0.8 + R() * 0.35; m.size0 = 0.65; m.size1 = 1.0 + R() * 0.3; m.growExp = 3.0;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
  look(C, WISP_GREY, WISP_GREY, 0.13, 0.04, 0.3);
  book(C, R, 'billow', 1.2, 18 + Math.floor(R() * 12), 1);
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
  // (fx 9, wave 404: "the grenades fly as hard white balls") a short grey puff of the expelling charge, a metre across and
  // gone within a second — never the two big white balls by the turret the 1.9-2.5 m, 0.62-density puffs read as
  m.life = 0.7 + R() * 0.25; m.size0 = 0.3; m.size1 = 1.0 + R() * 0.3; m.growExp = 2.6;
  m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.12;
  look(C, WISP_GREY, WISP_GREY, 0.38, 0.02, 0.3);
  book(C, R, 'billow', 1.0, 4 + Math.floor(R() * 10), 1.05);
  C.media(m);
}

/**
 * A grenade's burst where it lands (x, gy the ground there, z): the pop — a dense white ball thrown out in lobes — a
 * short warm flash, burning pellets arcing out and white streamers left along their arcs. `k` thins the pellets and
 * streamers where many grenades burst together (1 alone .. ~0.25 in a 24-tube salvo).
 */
export function smokeGrenadeBurst(C: BlastContext, R: () => number, x: number, gy: number, z: number, k: number,
  bo: number, wall: { x: number; z: number } | null = null): void {
  const m = C.m;
  const y = gy + 0.55;
  // (fx 9, wave 404: "small puffs sit right in the window openings") by a wall (`wall`: its face's normal, out of it)
  // nothing is thrown into it: a lobe or pellet headed for the face goes the mirrored way, off it
  const wx = wall ? wall.x : 0, wz = wall ? wall.z : 0;
  // the flash: a small warm pop, gone in a frame or two (red phosphorus ignites; the wall itself never glows)
  const lp = C.lp;
  lp.pos[0] = x; lp.pos[1] = y + 0.3; lp.pos[2] = z; lp.vel[0] = 0; lp.vel[1] = 0.5; lp.vel[2] = 0;
  lp.life = 0.09; lp.size0 = 0.7; lp.size1 = 1.9; lp.rot = R() * TAU; lp.rotVel = 0;
  lp.col0[0] = FLASH_WARM[0]; lp.col0[1] = FLASH_WARM[1]; lp.col0[2] = FLASH_WARM[2];
  lp.col1[0] = FLASH_DEEP[0]; lp.col1[1] = FLASH_DEEP[1]; lp.col1[2] = FLASH_DEEP[2];
  lp.alpha = 0.55; lp.grav = 0; lp.birthOffset = bo;
  C.flash(lp);
  // the pop: a dense white ball thrown out in lobes, stalling within a second. (fx 8l, wave 354a: "cotton-ball lobes";
  // fx 8m, wave 337: "a necklace of balls round partial blobs") one ragged mass: five lobes of mixed size born already
  // overlapping and thrown out slowly (each stalls within a metre), all in the turbulent billow medium; the wall's lobes
  // swell out of it (smokeBankLobe), so no ball ever travels out on its own
  // (fx 8r, the w5 film: "a row of separate white puffs ... the necklace") low and wide, faded in over a tenth of a
  // second: a ragged burst spreading along the ground, never a round white ball
  // (fx 9, wave 404: "by 2.5 s the bursts are still necklaces of separate hard-edged balls") six smaller, thinner lobes
  // of mixed size: a ragged cluster the skirt and the bloom swallow, not a white ball
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + (R() - 0.5) * 1.2, v = 1.2 + R() * 2.2;
    let ca = Math.cos(a), sa = Math.sin(a);
    const into = ca * wx + sa * wz;
    if (into < 0) { ca -= 2 * into * wx; sa -= 2 * into * wz; }
    m.x = x + ca * 0.3; m.y = y + R() * 0.25; m.z = z + sa * 0.3; m.birthOffset = bo - R() * 0.03;
    m.vx = ca * v; m.vy = 0.6 + R() * 1.0; m.vz = sa * v;
    m.drag = 2.4; m.rise = 0.12; m.windK = 0.15; m.grav = 0;
    m.life = 2.4 + R() * 0.8; m.size0 = 1.1; m.size1 = (i % 2 === 0 ? 3.2 : 2.4) + R() * 1.0; m.growExp = 3.6;
    m.rot = (R() - 0.5) * 0.8; m.spin = (R() - 0.5) * 0.12;
    look(C, BURST_WHITE, SCREEN_WHITE, 0.5, 0.12, 0.55);
    book(C, R, 'billow', 2.8, Math.floor(R() * 6), 1.3 + R() * 0.4);
    C.media(m);
  }
  // burning pellets thrown out on arcs, each leaving a white streamer: the burst's tell at a distance
  const pellets = Math.max(1, Math.round(4 * k));
  const ls = C.ls;
  for (let i = 0; i < pellets; i++) {
    const a = R() * TAU, up = 0.45 + R() * 0.45, v = 7 + R() * 6;
    let ca = Math.cos(a), sa = Math.sin(a);
    const into = ca * wx + sa * wz;
    if (into < 0) { ca -= 2 * into * wx; sa -= 2 * into * wz; }
    const vx = ca * (1 - up) * v, vy = up * v, vz = sa * (1 - up) * v;
    ls.pos[0] = x; ls.pos[1] = y + 0.2; ls.pos[2] = z;
    ls.vel[0] = vx; ls.vel[1] = vy; ls.vel[2] = vz;
    ls.life = 0.55 + R() * 0.35; ls.width = 0.035; ls.stretch = 0.012; ls.grav = -9.8;
    ls.col[0] = PELLET[0]; ls.col[1] = PELLET[1]; ls.col[2] = PELLET[2]; ls.alpha = 0.8; ls.seed = R();
    ls.birthOffset = bo;
    C.sparks(ls);
    // the streamer: small puffs left along the pellet's arc (born where it passes, as it passes), drifting a little.
    // (fx 8m, wave 337: "strings of hard-edged near-white balls") a soft rope, not beads: thin puffs left closer together
    // than their own size, swelling and fraying within a second and a half
    for (let j = 1; j <= 5; j++) {
      const t = j * 0.05;
      m.x = x + vx * t; m.y = y + 0.2 + vy * t - 4.9 * t * t; m.z = z + vz * t; m.birthOffset = bo + t;
      m.vx = vx * 0.06; m.vy = 0.2; m.vz = vz * 0.06;
      m.drag = 1.2; m.rise = 0.18; m.windK = 0.5; m.grav = 0;
      m.life = 1.1 + R() * 0.5; m.size0 = 0.38; m.size1 = 0.8 + R() * 0.3 + 0.08 * j; m.growExp = 2.8;
      m.rot = (R() - 0.5) * 0.7; m.spin = (R() - 0.5) * 0.1;
      look(C, BURST_WHITE, SCREEN_AGED, 0.4, 0.0, 0.4);
      book(C, R, 'billow', 1.5, 10 + Math.floor(R() * 14), 1);
      C.media(m);
    }
  }
}

/**
 * (fx 8m, wave 337: "no visible strike or bounce at the wall") a grenade striking a wall on its way (x, y, z where it
 * struck; nx, ny, nz the wall's normal, out of the face): a little of the face's dust knocked off it and a small white
 * puff of the grenade's own smoke shaken out at the knock, both stalling within a metre; the grenade drops back off the
 * wall and bursts below (sim/smokeBallistics.ts flies it on).
 */
export function smokeCanisterStrike(C: BlastContext, R: () => number, x: number, y: number, z: number, nx: number,
  ny: number, nz: number, bo: number): void {
  const m = C.m;
  // (fx 8r, the w5 film: "white puffs sit against the house face") born off the face and thrown out of it, never half
  // inside the wall, and fading softly where they meet it
  for (let i = 0; i < 2; i++) {
    const v = 1.6 + R() * 1.4;
    m.x = x + nx * 0.45; m.y = y + ny * 0.45; m.z = z + nz * 0.45; m.birthOffset = bo;
    m.vx = nx * v + (R() - 0.5) * 0.8; m.vy = ny * v + (R() - 0.3) * 0.8; m.vz = nz * v + (R() - 0.5) * 0.8;
    m.drag = 2.6; m.rise = 0.05; m.windK = 0.4; m.grav = -0.4;
    // (fx 9, wave 404: "no strip shows a grenade visibly striking the wall") a bigger kick of the face's dust
    m.life = 1.2 + R() * 0.6; m.size0 = 0.35; m.size1 = 1.6 + R() * 0.8; m.growExp = 2.6;
    m.rot = R() * TAU; m.spin = (R() - 0.5) * 0.1;
    look(C, MASONRY_DUST, MASONRY_DUST, 0.6, 0.0, 0.4);
    book(C, R, 'burst', 1.6, Math.floor(R() * 8), 1.0 + R() * 0.3);
    feathered(C, 2.2);
    C.media(m);
  }
  // (fx 9, wave 404 aside: "small puffs sit right in the window openings and the windows go pale") the grenade's own
  // smoke shaken out at the knock stands nearly a metre off the face, smaller, greyer and brief
  m.x = x + nx * 0.9; m.y = y + ny * 0.9; m.z = z + nz * 0.9; m.birthOffset = bo;
  m.vx = nx * 0.9; m.vy = 0.3 + ny * 0.9; m.vz = nz * 0.9;
  m.drag = 1.8; m.rise = 0.15; m.windK = 0.45; m.grav = 0;
  m.life = 1.0 + R() * 0.3; m.size0 = 0.3; m.size1 = 1.1 + R() * 0.3; m.growExp = 2.4;
  m.rot = R() * TAU; m.spin = (R() - 0.5) * 0.1;
  look(C, WISP_GREY, WISP_GREY, 0.4, 0.0, 0.35);
  book(C, R, 'billow', 1.8, 6 + Math.floor(R() * 10), 1.0);
  feathered(C, 2.2);
  C.media(m);
}

/**
 * (fx 8r, the w5 film: "a row of separate white puffs along the line before it merges") the wall's skirt: low wide puffs
 * born along a bank's stretch of the wall right after its grenade lands (x, y, z the place on the stretch, y over the
 * ground there), swelling to most of their size within a second, so the row closes before the lobes have travelled out;
 * the lobes take over by ~3 s and the skirt thins away. Visual only, inside the blocking envelope's lower half.
 */
export function smokeBankSkirt(C: BlastContext, R: () => number, x: number, y: number, z: number, size: number,
  life: number, fadeOut: number, bo: number, feather = 1, densityK = 1): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.4; m.vy = 0.12 + R() * 0.12; m.vz = (R() - 0.5) * 0.4;
  m.drag = 1.4; m.rise = 0.05; m.windK = 0.1; m.grav = 0;
  // (fx 9, wave 404: "by 2.5 s the bursts are still necklaces") born bigger and ~80 % of its size 0.7 s after its birth
  m.life = life; m.size0 = Math.min(2.6, size * 0.55); m.size1 = size;
  m.growExp = Math.log(0.2) / Math.log(1 - Math.min(0.85, 0.7 / Math.max(life, 0.5)));
  m.rot = (R() - 0.5) * 0.5; m.spin = (R() - 0.5) * 0.03;
  const tone = 0.86 + R() * 0.08;
  look(C, toned(_tone0, SCREEN_WHITE, tone), toned(_tone1, SCREEN_AGED, tone), 0.85 * densityK, 0.12, fadeOut);
  book(C, R, 'billow', Math.min(life, 8) * (0.9 + R() * 0.2), Math.floor(R() * 12), 1.45 + R() * 0.35);
  feathered(C, feather);
  C.media(m);
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
  /** (fx 8r) the soft-depth feather scale where the lobe meets a wall (1 in the open) */
  feather?: number;
  /** (fx 9) its density scale by its room to the wall (1 in the open, fading over the last metre before the wall) */
  densityK?: number;
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
  // (fx 8m, wave 337: "a necklace of balls round partial blobs" until ~4 s) the lobe swells with the simulation's own
  // growth, ~88 % of its size 2.4 s after its birth whatever its long life (its growth law runs on the life's fraction:
  // 4.2 over a 17 s life left it a 3-4 m ball for two seconds), from a body already two metres and more across that fades
  // in out of the pop: the bloom is one swelling mass, never a string of small balls travelling out along the row
  m.life = I.life; m.size1 = I.size; m.size0 = Math.min(I.crown ? 2.0 : 2.6, I.size * 0.6);
  m.growExp = Math.log(0.12) / Math.log(1 - Math.min(0.85, 2.4 / Math.max(I.life, 0.5)));
  m.rot = (R() - 0.5) * 0.5; m.spin = (R() - 0.5) * 0.03;
  // (fx 8m, wave 337: "a flat grey mass with little billow or lit and shaded modelling") each lobe its own tone: the
  // crowns the sunlit white of the wall's top, the feet a shade greyer (the mass above shades them) and every lobe a
  // little apart from its neighbours, so the cauliflower reads lobe by lobe
  const tone = I.crown ? 0.97 + R() * 0.03 : 0.84 + R() * 0.1;
  look(C, toned(_tone0, I.crown ? BURST_WHITE : SCREEN_WHITE, tone), toned(_tone1, SCREEN_AGED, tone),
    (I.crown ? 0.9 : 0.95) * (I.densityK ?? 1), 0.35, I.fadeOut);
  // the billow book: it keeps rolling (fx 8m: over at most 11 s, churning twice as fast as over the whole life; it
  // rests on its widest frame as the lobe erodes)
  book(C, R, 'billow', Math.min(I.life, 11) * (0.9 + R() * 0.2), Math.floor(R() * 8),
    I.crown ? 1.0 + R() * 0.15 : 1.15 + R() * 0.25);
  feathered(C, I.feather ?? 1);
  C.media(m);
}

/** A body puff: born inside the bank (already where the drifting bank is), swelling in from small to fill it. */
export function smokeBankBody(C: BlastContext, R: () => number, x: number, y: number, z: number, size: number,
  life: number, fadeOut: number, bo: number, feather = 1, densityK = 1): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.5; m.vy = 0.15 + R() * 0.15; m.vz = (R() - 0.5) * 0.5;
  m.drag = 0.8; m.rise = 0.07; m.windK = 0; m.grav = 0;
  m.life = life; m.size0 = size * 0.35; m.size1 = size; m.growExp = 2.4;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.03;
  // fades in from inside the wall, never popping on at its edge; (fx 8m) the wall's inside a shade under its sunlit
  // lobes, so their rims stand off it
  const tone = 0.86 + R() * 0.1;
  look(C, toned(_tone0, SCREEN_WHITE, tone), toned(_tone1, SCREEN_AGED, tone), 0.9 * densityK, 0.7, fadeOut);
  book(C, R, 'billow', life * (0.9 + R() * 0.2), Math.floor(R() * 16), 1.1 + R() * 0.3);
  feathered(C, feather);
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
  look(C, SCREEN_AGED, SCREEN_AGED, 0.26, 1.0, 0.45);
  book(C, R, 'billow', life * 1.1, 24 + Math.floor(R() * 20), 1.45 + R() * 0.3);
  C.media(m);
}

/**
 * (fx 8l, wave 354a: "a full-bodied wall at 15 s that's gone at 18 s, a hard switch-off") the wall's remains as it
 * decays: broad thin veils born in the eroding bank (its top and its edges first) that the scene's wind takes, drifting
 * off, rising a little, swelling and thinning for many seconds. Cosmetic only: thin (it hides nothing), born while the
 * simulation still blocks and lingering 10-20 s after it stops (the gameplay duration is matchRuleset's, untouched).
 */
export function smokeDecayHaze(C: BlastContext, R: () => number, x: number, y: number, z: number, life: number,
  bo: number, maxSize = Infinity): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.4; m.vy = 0.15 + R() * 0.2; m.vz = (R() - 0.5) * 0.4;
  m.drag = 0.5; m.rise = 0.12 + R() * 0.08; m.windK = 0.6 + R() * 0.3; m.grav = 0;
  // (fx 8m) `maxSize`: a veil born by a wall is no wider than the caller's room there (fix/smoke-collision's walls); a
  // veil 11-14 m across (15-20 m spread a bank's remains over a house beside it, the smoke-collision receipt's 1.6 m)
  m.life = life; m.size1 = Math.min(11 + R() * 3, maxSize); m.size0 = Math.min(6 + R() * 1.5, m.size1 * 0.6); m.growExp = 1.5;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.02;
  look(C, SCREEN_AGED, SCREEN_AGED, 0.18 + R() * 0.06, 1.6, 0.3);
  book(C, R, 'billow', life * 1.05, 16 + Math.floor(R() * 24), 1.3 + R() * 0.4);
  C.media(m);
}

/**
 * (fx 9, wave 403: "after 15 s the whole bank fades evenly; it should erode from its crowns and flanks over tens of
 * seconds") the wall's material torn off an eroding crown or flank lobe: born inside it as it starts to thin (fading in),
 * taken by the scene's wind, rising a little, swelling and thinning for 12-18 s. Cosmetic only: thin, it hides nothing.
 */
export function smokeErosionWisp(C: BlastContext, R: () => number, x: number, y: number, z: number, size: number,
  life: number, bo: number, maxSize = Infinity): void {
  const m = C.m;
  m.x = x; m.y = y; m.z = z; m.birthOffset = bo;
  m.vx = (R() - 0.5) * 0.3; m.vy = 0.12 + R() * 0.12; m.vz = (R() - 0.5) * 0.3;
  m.drag = 0.6; m.rise = 0.18 + R() * 0.12; m.windK = 0.75 + R() * 0.2; m.grav = 0;
  // (fx 9) `maxSize`: a wisp born by a wall no wider than the caller's room there
  m.life = life; m.size1 = Math.min(size * 1.8 + R() * 3, maxSize); m.size0 = Math.min(Math.max(1.5, size * 0.6), m.size1 * 0.7);
  m.growExp = 1.5;
  m.rot = (R() - 0.5) * 0.6; m.spin = (R() - 0.5) * 0.03;
  look(C, SCREEN_AGED, SCREEN_AGED, 0.24 + R() * 0.06, 1.2, 0.3);
  book(C, R, 'billow', life * 1.05, 12 + Math.floor(R() * 24), 1.25 + R() * 0.35);
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
