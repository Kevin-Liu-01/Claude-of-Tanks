/**
 * missileLooks.ts — every guided missile and rocket its own signature in flight and at launch (fx lane, 2026-10-10; the
 * owner: "give different missiles different special traces").
 *
 * Pure data and one resolver (no three, no DOM): effects.ts reads a look per live missile and per launch, and draws it
 * through the tracer capsules (projectileTracers.ts: the motor's flare and plume), its smoke trail (missileTrails.ts),
 * a wire-guided round's wire (missileWires.ts), the media layer (missileRecipes.ts: the launch, the ignition) and the
 * missile body.
 *
 * The families, from how real launches film:
 *   - wire-guided SACLOS (TOW, Konkurs/Fagot, MILAN): a launch charge out of the tube with a backblast, the flight motor
 *     lighting a few metres out, a bright flickering tracking flare on the tail, a thin glint of command wire paying out
 *     behind it, a puffy grey sustainer trail that hangs; small steering corrections;
 *   - older SACLOS / MCLOS (Malyutka era, Type 79 Jyu-MAT): slow, smoky, darker trail, visibly wobbling;
 *   - laser beam-riders (Kornet, Stugna, and the gun-launched Arkan/Refleks/Svir/Bastion/LAHAT): a bright tracer, almost
 *     no smoke; a gun-launched round leaves the gun's own muzzle blast and lights its motor clear of the muzzle;
 *   - radio command (Ataka, Shturm): a fast missile, a bright tracer, a light trail;
 *   - soft-launch fire-and-forget (Javelin, Spike, Type 01 LMAT): a small eject puff, a coast of a few metres, then the
 *     motor's pop and a bright white motor with a light trail;
 *   - vehicle and helicopter rail missiles (Hellfire class, HJ-10): a dense white trail that persists;
 *   - gun-launched IR-beacon missiles (MGM-51 Shillelagh): a strongly pulsing beacon, a smoky grey motor trail;
 *   - MANPADS (Stinger on the Linebacker): an eject motor, then a fierce white motor and a dense white trail;
 *   - hypersonic gun-launched darts (XM1210 MRM-H): a long hot streak and no smoke;
 *   - micro-missiles (Viper): a small bright motor and a thin trail;
 *   - unguided rockets (salvo racks, TOS-1A): a flame and a dense grey-white trail, a canister launch in a cloud.
 *
 * Resolution is by the round's own name first (a missile's identity), then its launch sound profile (every guided round
 * in the fleet carries one: 'tow-launch', 'konkurs-launch', ...), then the rocket flag; a networked round that carries no
 * name resolves through its shooter's gun (effects.ts). Colours are linear RGB.
 */

type Rgb = readonly [number, number, number];

export type MissileFamily = 'saclos_wire' | 'saclos_old' | 'mclos' | 'beam_rider' | 'radio_command' | 'soft_launch'
  | 'rail_dense' | 'gun_ir' | 'manpads' | 'hypersonic' | 'micro' | 'rocket';

/** How the round leaves its launcher. */
export type MissileLaunch = 'tube' | 'gun' | 'soft_eject' | 'rail' | 'canister';

/** The smoke a launch and the motor's ignition throw on the media layer (missileRecipes.ts); the trail it lays in flight
 *  is its MissileTrail (missileTrails.ts). */
export interface MissileSmoke {
  /** peak opacity of a puff (0 smokeless .. ~0.85 a dense white cloud) */
  readonly density: number;
  /** albedo at birth and as it ages (linear) */
  readonly c0: Rgb;
  readonly c1: Rgb;
  /** card size at birth and at full growth (m) */
  readonly size0: number;
  readonly size1: number;
  /** life of a puff (s) */
  readonly life: number;
  /** terminal rise (m/s) and wind coupling */
  readonly rise: number;
  readonly windK: number;
}

export interface MissileLook {
  readonly id: string;
  readonly family: MissileFamily;
  readonly launch: MissileLaunch;
  /** launch strength (1 typical; the canister's cloud and the tube's backblast scale with it) */
  readonly launchK: number;
  /** the motor's flare: core and halo colours, core half width and halo radius (1080p px), radiance */
  readonly flareCore: Rgb;
  readonly flareHalo: Rgb;
  readonly flarePx: number;
  readonly haloPx: number;
  readonly flareK: number;
  /** flare flicker: depth 0..1 and rate (Hz) — a tracking beacon pulses, a motor burns steadily */
  readonly flicker: number;
  readonly flickerHz: number;
  /** the hot exhaust streak behind the motor (m) */
  readonly plumeM: number;
  /** the smoke trail (null: none worth drawing) */
  readonly smoke: MissileSmoke | null;
  /** command wires paying out behind it (0, 1 or 2) */
  readonly wires: number;
  /** steering corrections: lateral amplitude (m) and rate (Hz) */
  readonly wobbleM: number;
  readonly wobbleHz: number;
  /** (EF.04) a roll-stabilised round's corkscrew: the motor's flare rides a helix of this radius (m) about the flight
   *  line at the roll rate (Hz) — a tracer off the axis on a spinning airframe (Malyutka's wing-tip tracer, the rolling
   *  Stinger, a spin-stabilised rocket); a fire-and-forget or rail round flies roll-controlled, without one */
  readonly spinM?: number;
  readonly spinHz?: number;
  /** metres flown before the flight motor lights (0: lit out of the launcher) */
  readonly igniteM: number;
  /** body: length and radius scale (1 = the 1.25 m x 0.17 m reference body), colour (sRGB hex) */
  readonly bodyLen: number;
  readonly bodyRad: number;
  readonly bodyHex: number;
}

function lin(hex: number): Rgb {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return Object.freeze([f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)] as const);
}

// trail albedos: a rocket's or a Hellfire's dense white, a sustainer's light grey, an old motor's darker grey
const WHITE: Rgb = lin(0xdedcd6);
const WHITE_AGED: Rgb = lin(0xd6d4cf);
const LIGHT: Rgb = lin(0xc4c0b8);
const LIGHT_AGED: Rgb = lin(0xcdcac3);
const GREY: Rgb = lin(0x9e9a92);
const GREY_AGED: Rgb = lin(0xb0ada6);

const look = (l: MissileLook): MissileLook => Object.freeze(l);

/** The looks, by id. */
export const MISSILE_LOOKS: Readonly<Record<string, MissileLook>> = Object.freeze({
  tow: look({
    id: 'tow', family: 'saclos_wire', launch: 'tube', launchK: 1,
    flareCore: [1, 0.86, 0.62], flareHalo: [1, 0.52, 0.16], flarePx: 1.9, haloPx: 9, flareK: 3.2, flicker: 0.4, flickerHz: 17,
    plumeM: 2.4,
    smoke: { density: 0.45, c0: LIGHT, c1: LIGHT_AGED, size0: 0.7, size1: 3.2, life: 5, rise: 0.15, windK: 0.8 },
    wires: 2, wobbleM: 0.12, wobbleHz: 1.3, spinM: 0.1, spinHz: 5, igniteM: 9, bodyLen: 0.94, bodyRad: 0.5, bodyHex: 0x4a4f43,
  }),
  konkurs: look({
    id: 'konkurs', family: 'saclos_wire', launch: 'tube', launchK: 0.8,
    flareCore: [1, 0.55, 0.2], flareHalo: [1, 0.24, 0.04], flarePx: 1.8, haloPx: 9, flareK: 3.4, flicker: 0.28, flickerHz: 11,
    plumeM: 2.0,
    smoke: { density: 0.36, c0: LIGHT, c1: LIGHT_AGED, size0: 0.6, size1: 2.7, life: 4.2, rise: 0.15, windK: 0.8 },
    wires: 1, wobbleM: 0.15, wobbleHz: 1.6, spinM: 0.16, spinHz: 7, igniteM: 3, bodyLen: 0.93, bodyRad: 0.42, bodyHex: 0x59603f,
  }),
  milan: look({
    id: 'milan', family: 'saclos_wire', launch: 'tube', launchK: 0.7,
    flareCore: [1, 0.72, 0.38], flareHalo: [1, 0.42, 0.1], flarePx: 2.0, haloPx: 10, flareK: 3.5, flicker: 0.42, flickerHz: 14,
    plumeM: 1.8,
    smoke: { density: 0.3, c0: LIGHT, c1: LIGHT_AGED, size0: 0.5, size1: 2.4, life: 3.6, rise: 0.15, windK: 0.8 },
    wires: 1, wobbleM: 0.15, wobbleHz: 1.8, spinM: 0.14, spinHz: 9, igniteM: 2, bodyLen: 0.74, bodyRad: 0.4, bodyHex: 0x4d5340,
  }),
  mclos: look({
    id: 'mclos', family: 'mclos', launch: 'rail', launchK: 0.6,
    flareCore: [1, 0.46, 0.12], flareHalo: [1, 0.2, 0.03], flarePx: 1.9, haloPx: 8, flareK: 2.6, flicker: 0.5, flickerHz: 6,
    plumeM: 2.2,
    smoke: { density: 0.6, c0: GREY, c1: GREY_AGED, size0: 0.8, size1: 3.6, life: 6, rise: 0.12, windK: 0.85 },
    wires: 1, wobbleM: 0.6, wobbleHz: 0.8, spinM: 0.35, spinHz: 8.5, igniteM: 0, bodyLen: 0.69, bodyRad: 0.42, bodyHex: 0x5c6045,
  }),
  jyumat: look({
    id: 'jyumat', family: 'saclos_old', launch: 'tube', launchK: 0.8,
    flareCore: [1, 0.56, 0.22], flareHalo: [1, 0.26, 0.05], flarePx: 1.8, haloPx: 8, flareK: 2.9, flicker: 0.35, flickerHz: 9,
    plumeM: 2.0,
    smoke: { density: 0.5, c0: GREY, c1: GREY_AGED, size0: 0.7, size1: 3.2, life: 5, rise: 0.14, windK: 0.85 },
    wires: 1, wobbleM: 0.3, wobbleHz: 1.1, spinM: 0.2, spinHz: 6, igniteM: 2, bodyLen: 0.85, bodyRad: 0.45, bodyHex: 0x56594a,
  }),
  spike: look({
    id: 'spike', family: 'soft_launch', launch: 'soft_eject', launchK: 1,
    flareCore: [1, 0.9, 0.76], flareHalo: [1, 0.58, 0.24], flarePx: 2.1, haloPx: 11, flareK: 4.2, flicker: 0.12, flickerHz: 25,
    plumeM: 3.0,
    smoke: { density: 0.28, c0: WHITE, c1: WHITE_AGED, size0: 0.5, size1: 2.2, life: 3.2, rise: 0.12, windK: 0.85 },
    wires: 0, wobbleM: 0.04, wobbleHz: 2.2, igniteM: 7, bodyLen: 0.95, bodyRad: 0.42, bodyHex: 0x55594a,
  }),
  kornet: look({
    id: 'kornet', family: 'beam_rider', launch: 'tube', launchK: 0.75,
    flareCore: [1, 0.78, 0.46], flareHalo: [1, 0.42, 0.1], flarePx: 2.0, haloPx: 11, flareK: 4.4, flicker: 0.1, flickerHz: 30,
    plumeM: 2.2,
    smoke: { density: 0.1, c0: WHITE, c1: WHITE_AGED, size0: 0.4, size1: 1.6, life: 1.6, rise: 0.1, windK: 0.8 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, spinM: 0.06, spinHz: 3, igniteM: 3, bodyLen: 0.97, bodyRad: 0.45, bodyHex: 0x606a4a,
  }),
  arkan: look({
    id: 'arkan', family: 'beam_rider', launch: 'gun', launchK: 1,
    flareCore: [1, 0.8, 0.5], flareHalo: [1, 0.44, 0.12], flarePx: 1.8, haloPx: 10, flareK: 4.2, flicker: 0.08, flickerHz: 30,
    plumeM: 2.0,
    smoke: { density: 0.08, c0: WHITE, c1: WHITE_AGED, size0: 0.35, size1: 1.4, life: 1.4, rise: 0.1, windK: 0.8 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, igniteM: 14, bodyLen: 0.85, bodyRad: 0.35, bodyHex: 0x4d5642,
  }),
  ataka: look({
    id: 'ataka', family: 'radio_command', launch: 'tube', launchK: 1,
    flareCore: [1, 0.72, 0.36], flareHalo: [1, 0.38, 0.08], flarePx: 2.0, haloPx: 10, flareK: 3.8, flicker: 0.16, flickerHz: 20,
    plumeM: 2.8,
    smoke: { density: 0.3, c0: LIGHT, c1: LIGHT_AGED, size0: 0.6, size1: 2.8, life: 3.6, rise: 0.12, windK: 0.8 },
    wires: 0, wobbleM: 0.08, wobbleHz: 1.5, igniteM: 2, bodyLen: 1.2, bodyRad: 0.45, bodyHex: 0x4f5741,
  }),
  shillelagh: look({
    id: 'shillelagh', family: 'gun_ir', launch: 'gun', launchK: 1,
    flareCore: [1, 0.92, 0.72], flareHalo: [1, 0.6, 0.26], flarePx: 2.1, haloPx: 11, flareK: 3.8, flicker: 0.55, flickerHz: 9,
    plumeM: 2.4,
    smoke: { density: 0.5, c0: GREY, c1: GREY_AGED, size0: 0.7, size1: 3.0, life: 4.6, rise: 0.14, windK: 0.85 },
    wires: 0, wobbleM: 0.25, wobbleHz: 1.0, spinM: 0.12, spinHz: 5, igniteM: 6, bodyLen: 0.9, bodyRad: 0.5, bodyHex: 0x5b5f4b,
  }),
  hellfire: look({
    id: 'hellfire', family: 'rail_dense', launch: 'rail', launchK: 1.2,
    flareCore: [1, 0.88, 0.62], flareHalo: [1, 0.55, 0.2], flarePx: 2.4, haloPx: 12, flareK: 4.6, flicker: 0.08, flickerHz: 30,
    plumeM: 4.0,
    smoke: { density: 0.75, c0: WHITE, c1: WHITE_AGED, size0: 0.8, size1: 3.8, life: 7.5, rise: 0.1, windK: 0.85 },
    wires: 0, wobbleM: 0.02, wobbleHz: 2, igniteM: 0, bodyLen: 1.3, bodyRad: 0.55, bodyHex: 0x60645a,
  }),
  stinger: look({
    id: 'stinger', family: 'manpads', launch: 'soft_eject', launchK: 0.8,
    flareCore: [1, 0.95, 0.86], flareHalo: [1, 0.7, 0.36], flarePx: 2.4, haloPx: 13, flareK: 5, flicker: 0.05, flickerHz: 30,
    plumeM: 4.5,
    smoke: { density: 0.6, c0: WHITE, c1: WHITE_AGED, size0: 0.5, size1: 2.6, life: 6, rise: 0.1, windK: 0.85 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2, spinM: 0.12, spinHz: 13, igniteM: 9, bodyLen: 1.2, bodyRad: 0.25, bodyHex: 0x55594f,
  }),
  mrm: look({
    id: 'mrm', family: 'hypersonic', launch: 'gun', launchK: 1,
    flareCore: [1, 0.85, 0.55], flareHalo: [1, 0.45, 0.12], flarePx: 1.6, haloPx: 9, flareK: 4.8, flicker: 0, flickerHz: 0,
    plumeM: 9,
    smoke: null,
    wires: 0, wobbleM: 0, wobbleHz: 0, igniteM: 20, bodyLen: 0.8, bodyRad: 0.3, bodyHex: 0x4c4f48,
  }),
  viper: look({
    id: 'viper', family: 'micro', launch: 'rail', launchK: 0.4,
    flareCore: [1, 0.8, 0.5], flareHalo: [1, 0.46, 0.14], flarePx: 1.4, haloPx: 7, flareK: 3.2, flicker: 0.1, flickerHz: 26,
    plumeM: 1.6,
    smoke: { density: 0.18, c0: LIGHT, c1: LIGHT_AGED, size0: 0.3, size1: 1.4, life: 2, rise: 0.1, windK: 0.8 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, igniteM: 2, bodyLen: 0.55, bodyRad: 0.25, bodyHex: 0x585c52,
  }),
  rocket: look({
    id: 'rocket', family: 'rocket', launch: 'canister', launchK: 1.4,
    flareCore: [1, 0.64, 0.24], flareHalo: [1, 0.34, 0.07], flarePx: 2.8, haloPx: 14, flareK: 4.2, flicker: 0.18, flickerHz: 22,
    plumeM: 6,
    smoke: { density: 0.8, c0: LIGHT, c1: WHITE_AGED, size0: 1.2, size1: 4.8, life: 6.5, rise: 0.12, windK: 0.85 },
    wires: 0, wobbleM: 0.05, wobbleHz: 1.4, spinM: 0.08, spinHz: 10, igniteM: 0, bodyLen: 2.6, bodyRad: 0.75, bodyHex: 0x50553f,
  }),
});

/**
 * (FX lane 10-14) A missile's smoke trail (missileTrails.ts), by look. The owner: "make missile trails a lot better and not
 * randomly get cut off ... looks like a fixed width ribbon flapping behind the missile". The trail is born at the nozzle
 * every frame, expands and softens with age, drifts with the world wind and fades where it was laid; its size and
 * density come from what the real motor does:
 *   - a boost phase (the first boostS seconds after the flight motor lights) lays a denser (boostK) and wider (boostW)
 *     trail: a TOW's flight motor burns ~1.6 s, a Javelin's/Spike's and a Stinger's first stage a fraction of a second,
 *     a rocket ~1.5 s; the sustainer or the coast after it lays the lighter trail that persists;
 *   - a pulsing sustainer (TOW, Malyutka, the old SACLOS motors) lays lumps every puffM metres (puff 0 steady .. 1);
 *   - churn: how hard the air breaks the trail up as it ages (its torn edges and clumps).
 * Radii (m): r0 at the nozzle, rJet after the jet's first expansion (~0.1 s), r1 grown (an e-fold every growS s).
 * tau: the young trail's optical depth through its width, seen from the side (its alpha 1 - e^-tau), thinning as it
 * spreads. life (s): how long a stretch lasts before it has dissolved.
 */
export interface MissileTrail {
  readonly r0: number;
  readonly rJet: number;
  readonly r1: number;
  readonly growS: number;
  readonly life: number;
  readonly tau: number;
  readonly boostS: number;
  readonly boostK: number;
  readonly boostW: number;
  readonly puff: number;
  readonly puffM: number;
  readonly churn: number;
  /** the motor's flame lighting the smoke just behind it (0 none .. 1 strong) */
  readonly glow: number;
  readonly c0: Rgb;
  readonly c1: Rgb;
  readonly rise: number;
  readonly windK: number;
  /** (ac130-fx-228 r2) the smoke fades out within this many metres of the camera (0: never). Only a trail born beside
   *  the eye takes it: the gunship's own missile, whose smoke starts 8 m from its gimbal lens */
  readonly nearM?: number;
}

const trail = (t: MissileTrail): MissileTrail => Object.freeze(t);

/** The trails, by look id (null: a smokeless motor). */
export const MISSILE_TRAILS: Readonly<Record<string, MissileTrail | null>> = Object.freeze({
  // a TOW: the flight motor's dense grey-white burn for ~1.6 s, then a lighter puffy line that hangs
  tow: trail({ r0: 0.09, rJet: 0.42, r1: 2.03, growS: 1.68, life: 7.5, tau: 1.3, boostS: 1.6, boostK: 1.7, boostW: 1.2,
    puff: 0.45, puffM: 2.8, churn: 0.8, glow: 0.7, c0: LIGHT, c1: LIGHT_AGED, rise: 0.15, windK: 0.85 }),
  konkurs: trail({ r0: 0.08, rJet: 0.38, r1: 1.82, growS: 1.54, life: 6.5, tau: 1.17, boostS: 1.2, boostK: 1.6, boostW: 1.15,
    puff: 0.3, puffM: 2.4, churn: 0.8, glow: 0.75, c0: LIGHT, c1: LIGHT_AGED, rise: 0.15, windK: 0.85 }),
  milan: trail({ r0: 0.07, rJet: 0.35, r1: 1.62, growS: 1.4, life: 6, tau: 1.1, boostS: 1.0, boostK: 1.6, boostW: 1.15,
    puff: 0.3, puffM: 2.2, churn: 0.8, glow: 0.7, c0: LIGHT, c1: LIGHT_AGED, rise: 0.15, windK: 0.85 }),
  // an old MCLOS motor: smoky, darker, lumpy
  mclos: trail({ r0: 0.1, rJet: 0.51, r1: 2.43, growS: 1.82, life: 8.5, tau: 1.95, boostS: 0.8, boostK: 1.3, boostW: 1.1,
    puff: 0.6, puffM: 2.0, churn: 0.95, glow: 0.8, c0: GREY, c1: GREY_AGED, rise: 0.12, windK: 0.85 }),
  jyumat: trail({ r0: 0.09, rJet: 0.45, r1: 2.16, growS: 1.68, life: 7.5, tau: 1.62, boostS: 1.0, boostK: 1.4, boostW: 1.15,
    puff: 0.45, puffM: 2.4, churn: 0.9, glow: 0.75, c0: GREY, c1: GREY_AGED, rise: 0.14, windK: 0.85 }),
  // fire-and-forget: a short dense white first stage where the motor lights, then a light steady trail
  spike: trail({ r0: 0.07, rJet: 0.38, r1: 1.69, growS: 1.4, life: 5.5, tau: 0.78, boostS: 0.6, boostK: 2.4, boostW: 1.35,
    puff: 0.08, puffM: 3, churn: 0.7, glow: 0.6, c0: WHITE, c1: WHITE_AGED, rise: 0.12, windK: 0.85 }),
  // a laser beam-rider: a thin pale wisp, quickly gone
  kornet: trail({ r0: 0.05, rJet: 0.26, r1: 1.15, growS: 1.12, life: 3.5, tau: 0.31, boostS: 0.5, boostK: 2.2, boostW: 1.2,
    puff: 0, puffM: 3, churn: 0.6, glow: 0.5, c0: WHITE, c1: WHITE_AGED, rise: 0.1, windK: 0.8 }),
  arkan: trail({ r0: 0.05, rJet: 0.24, r1: 1.01, growS: 1.05, life: 3, tau: 0.22, boostS: 0.4, boostK: 2.2, boostW: 1.2,
    puff: 0, puffM: 3, churn: 0.6, glow: 0.45, c0: WHITE, c1: WHITE_AGED, rise: 0.1, windK: 0.8 }),
  ataka: trail({ r0: 0.07, rJet: 0.38, r1: 1.69, growS: 1.4, life: 5.5, tau: 0.78, boostS: 0.8, boostK: 1.7, boostW: 1.2,
    puff: 0.15, puffM: 2.6, churn: 0.75, glow: 0.65, c0: LIGHT, c1: LIGHT_AGED, rise: 0.12, windK: 0.8 }),
  shillelagh: trail({ r0: 0.09, rJet: 0.48, r1: 2.09, growS: 1.68, life: 7.5, tau: 1.49, boostS: 1.0, boostK: 1.35,
    boostW: 1.15, puff: 0.35, puffM: 2.6, churn: 0.85, glow: 0.75, c0: GREY, c1: GREY_AGED, rise: 0.14, windK: 0.85 }),
  // a rail missile: a dense white trail that persists; (ac130-fx-228 r2, the motion critic: "a smooth tube of even width
  // with no billowing or spread with age") its steady motor lays a smooth line that spreads as it hangs, the air tearing
  // and clumping it as it ages
  hellfire: trail({ r0: 0.12, rJet: 0.64, r1: 3.5, growS: 1.96, life: 10, tau: 2.86, boostS: 0.6, boostK: 1.3, boostW: 1.15,
    puff: 0.08, puffM: 3, churn: 0.95, glow: 0.7, c0: WHITE, c1: WHITE_AGED, rise: 0.1, windK: 0.85 }),
  // MANPADS: the boost stage's fierce dense white, the sustainer's long white trail
  stinger: trail({ r0: 0.08, rJet: 0.48, r1: 2.43, growS: 1.82, life: 9, tau: 2.08, boostS: 0.4, boostK: 1.7, boostW: 1.25,
    puff: 0.06, puffM: 3, churn: 0.7, glow: 0.8, c0: WHITE, c1: WHITE_AGED, rise: 0.1, windK: 0.85 }),
  mrm: null,
  viper: trail({ r0: 0.04, rJet: 0.21, r1: 1.01, growS: 1.12, life: 3.5, tau: 0.55, boostS: 0.5, boostK: 1.6, boostW: 1.15,
    puff: 0.05, puffM: 3, churn: 0.6, glow: 0.5, c0: LIGHT, c1: LIGHT_AGED, rise: 0.1, windK: 0.8 }),
  // an unguided rocket: a flame and a dense grey-white trail, densest while the motor burns
  rocket: trail({ r0: 0.14, rJet: 0.77, r1: 2.6, growS: 1.96, life: 8, tau: 2.6, boostS: 1.5, boostK: 1.3, boostW: 1.15,
    puff: 0.2, puffM: 3.4, churn: 0.85, glow: 0.85, c0: LIGHT, c1: WHITE_AGED, rise: 0.12, windK: 0.85 }),
});

/** A look's trail (null: no smoke worth drawing). */
export function missileTrailOf(l: MissileLook): MissileTrail | null {
  return MISSILE_TRAILS[l.id] ?? null;
}

/** The round's own name → its look (first match). */
const BY_NAME: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/\bTOW\b|BGM-71/i, 'tow'],
  // (EF.04) the 9M-695 and HJ-P9 volleys fly at 320-380 m/s from 8-12 tubes: radio command (Ataka's look), not a wire
  [/9M-695|HJ-P9/i, 'ataka'],
  [/Konkurs|9M113|Fagot|9M111|Metis|9M115|9M131|HJ-8|Red Arrow 8/i, 'konkurs'],
  [/MILAN|\bHOT\b|Euromissile/i, 'milan'],
  [/Malyutka|9M14|Sagger|SS-11|ENTAC|KAM-3|Type 64/i, 'mclos'],
  [/Jyu-MAT Kai|Type 01|LMAT|Javelin|FGM-148|Spike|MELLS|NLAW|\bMMP\b|Akeron|HJ-12|Red Arrow 12/i, 'spike'],
  [/Jyu-MAT|Type 79|KAM-9/i, 'jyumat'],
  [/Kornet|9M133|Stugna|Skif|Barrier|Bulat|Corsar/i, 'kornet'],
  [/Arkan|9M117|Bastion|Refleks|9M119|Svir|Kobra|9M112|Sheksna|Invar|LAHAT|Falarick|Konus/i, 'arkan'],
  [/Ataka|9M120|Shturm|9M114|Khrizantema|9M123/i, 'ataka'],
  [/Shillelagh|MGM-51/i, 'shillelagh'],
  [/Hellfire|AGM-114|HJ-10|Brimstone|JAGM|Hermes|AKD-10/i, 'hellfire'],
  [/Stinger|FIM-92|Igla|Strela|Mistral|Starstreak/i, 'stinger'],
  [/MRM|XM1210|Hypersonic/i, 'mrm'],
  [/Viper micro|micro-missile/i, 'viper'],
]);

/** The launch sound profile → its look (every guided round in the fleet names one). */
const BY_SOUND: Readonly<Record<string, string>> = Object.freeze({
  'tow-launch': 'tow',
  'konkurs-launch': 'konkurs',
  'milan-launch': 'milan',
  'spike-launch': 'spike',
  'arkan-launch': 'arkan',
  'ataka-launch': 'ataka',
  'shillelagh-launch': 'shillelagh',
  'jyu-mat-launch': 'spike',
  // (ac130-fx-228) the AC-130's guided missile: a Hellfire-class rail missile off the gunship's wing (its rail launch,
  // dense persistent white trail and the hellfire airframe), not the Konkurs default
  'gunship-missile': 'hellfire',
});

/** The fallback for a guided round that names neither (a SACLOS missile: the commonest kind in the fleet). */
const DEFAULT_LOOK = 'konkurs';

/**
 * The look a round takes: by its name, then its launch sound, then the rocket flag (an unguided rocket whose name and
 * sound say nothing). An unguided rocket that names a missile family keeps the rocket look (a salvo rack fires rockets).
 */
export function missileLookFor(name: string | null | undefined, sound: string | null | undefined,
  rocket = false): MissileLook {
  if (rocket) return MISSILE_LOOKS.rocket;
  const n = typeof name === 'string' ? name : '';
  if (n) for (const [re, id] of BY_NAME) if (re.test(n)) return MISSILE_LOOKS[id];
  const s = typeof sound === 'string' ? BY_SOUND[sound] : undefined;
  if (s) return MISSILE_LOOKS[s];
  return MISSILE_LOOKS[DEFAULT_LOOK];
}

/** Whether a fired round is a missile or a rocket by what its shot event carries (every guided round's sound is a
 *  '*-launch' profile or another launch sound this table names, the gunship's 'gunship-missile'; a rack's rockets carry
 *  the rocket flag). */
export function firedIsMissile(sound: string | null | undefined, rocket: boolean | undefined): boolean {
  return rocket === true || (typeof sound === 'string' && (sound.endsWith('-launch') || Object.hasOwn(BY_SOUND, sound)));
}

/**
 * The steering corrections' lateral offset (m) at flight time t: two incommensurate slow cycles per axis, ramping in over
 * the first half second (it leaves the launcher on its line), the same for every frame rate. `out` gets [side, up].
 */
export function missileWobble(l: MissileLook, t: number, seed: number, out: number[]): number[] {
  if (!(l.wobbleM > 0) || !(t > 0)) { out[0] = 0; out[1] = 0; return out; }
  const ramp = Math.min(1, t / 0.5);
  const w = Math.PI * 2 * l.wobbleHz;
  const p = seed * 6.2831853;
  out[0] = l.wobbleM * ramp * (0.7 * Math.sin(w * t + p) + 0.3 * Math.sin(w * 2.37 * t + 1.7 * p));
  out[1] = l.wobbleM * ramp * 0.6 * (0.7 * Math.sin(w * 0.83 * t + 2.1 + p) + 0.3 * Math.sin(w * 1.91 * t + 0.4 * p));
  return out;
}

/**
 * (EF.04) A roll-stabilised round's tracer offset (m) at flight time t: the flare rides a helix of spinM about the body's
 * axis at the roll rate, opening over the first half second as the round spins up (the body and its smoke stay on the
 * axis). `out` gets [side, up]; zero for a roll-controlled round.
 */
export function missileSpin(l: MissileLook, t: number, seed: number, out: number[]): number[] {
  const r = l.spinM ?? 0;
  if (!(r > 0) || !(t > 0)) { out[0] = 0; out[1] = 0; return out; }
  const a = Math.PI * 2 * (l.spinHz ?? 0) * t + seed * 6.2831853;
  const k = r * Math.min(1, t / 0.5);
  out[0] = k * Math.cos(a); out[1] = k * Math.sin(a);
  return out;
}

/** The flare's radiance factor at flight time t (1 steady; a beacon pulses between 1 - flicker and 1). */
export function missileFlicker(l: MissileLook, t: number, seed: number): number {
  if (!(l.flicker > 0)) return 1;
  const w = Math.PI * 2 * l.flickerHz;
  const v = 0.5 + 0.5 * Math.sin(w * t + seed * 40) * Math.sin(w * 0.61 * t + seed * 17 + 1.3);
  return 1 - l.flicker * v;
}
