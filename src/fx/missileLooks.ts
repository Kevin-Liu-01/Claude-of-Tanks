/**
 * missileLooks.ts — every guided missile and rocket its own signature in flight and at launch (fx lane, 2026-10-10; the
 * owner: "give different missiles different special traces").
 *
 * Pure data and one resolver (no three, no DOM): effects.ts reads a look per live missile and per launch, and draws it
 * through the tracer capsules (projectileTracers.ts: the motor's flare and plume, the command wires), the media layer
 * (missileRecipes.ts: the smoke trail, the launch) and the missile body.
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

export interface MissileSmoke {
  /** peak opacity of a trail puff (0 smokeless .. ~0.85 a dense white trail) */
  readonly density: number;
  /** albedo at birth and as it ages (linear) */
  readonly c0: Rgb;
  readonly c1: Rgb;
  /** card size at birth and at full growth (m) */
  readonly size0: number;
  readonly size1: number;
  /** life of a puff (s) */
  readonly life: number;
  /** one puff per this many metres of flight */
  readonly spacingM: number;
  /** terminal rise (m/s) and wind coupling */
  readonly rise: number;
  readonly windK: number;
  /** 0 a steady trail .. 1 a puffy, pulsing sustainer (puff size and density beat along the trail) */
  readonly pulse: number;
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
    smoke: { density: 0.45, c0: LIGHT, c1: LIGHT_AGED, size0: 0.7, size1: 3.2, life: 5, spacingM: 4, rise: 0.15, windK: 0.8,
      pulse: 0.35 },
    wires: 2, wobbleM: 0.12, wobbleHz: 1.3, igniteM: 9, bodyLen: 0.94, bodyRad: 0.5, bodyHex: 0x4a4f43,
  }),
  konkurs: look({
    id: 'konkurs', family: 'saclos_wire', launch: 'tube', launchK: 0.8,
    flareCore: [1, 0.55, 0.2], flareHalo: [1, 0.24, 0.04], flarePx: 1.8, haloPx: 9, flareK: 3.4, flicker: 0.28, flickerHz: 11,
    plumeM: 2.0,
    smoke: { density: 0.36, c0: LIGHT, c1: LIGHT_AGED, size0: 0.6, size1: 2.7, life: 4.2, spacingM: 4.5, rise: 0.15, windK: 0.8,
      pulse: 0.22 },
    wires: 1, wobbleM: 0.15, wobbleHz: 1.6, igniteM: 3, bodyLen: 0.93, bodyRad: 0.42, bodyHex: 0x59603f,
  }),
  milan: look({
    id: 'milan', family: 'saclos_wire', launch: 'tube', launchK: 0.7,
    flareCore: [1, 0.72, 0.38], flareHalo: [1, 0.42, 0.1], flarePx: 2.0, haloPx: 10, flareK: 3.5, flicker: 0.42, flickerHz: 14,
    plumeM: 1.8,
    smoke: { density: 0.3, c0: LIGHT, c1: LIGHT_AGED, size0: 0.5, size1: 2.4, life: 3.6, spacingM: 5, rise: 0.15, windK: 0.8,
      pulse: 0.2 },
    wires: 1, wobbleM: 0.15, wobbleHz: 1.8, igniteM: 2, bodyLen: 0.74, bodyRad: 0.4, bodyHex: 0x4d5340,
  }),
  mclos: look({
    id: 'mclos', family: 'mclos', launch: 'rail', launchK: 0.6,
    flareCore: [1, 0.46, 0.12], flareHalo: [1, 0.2, 0.03], flarePx: 1.9, haloPx: 8, flareK: 2.6, flicker: 0.5, flickerHz: 6,
    plumeM: 2.2,
    smoke: { density: 0.6, c0: GREY, c1: GREY_AGED, size0: 0.8, size1: 3.6, life: 6, spacingM: 3.5, rise: 0.12, windK: 0.85,
      pulse: 0.5 },
    wires: 1, wobbleM: 0.6, wobbleHz: 0.8, igniteM: 0, bodyLen: 0.69, bodyRad: 0.42, bodyHex: 0x5c6045,
  }),
  jyumat: look({
    id: 'jyumat', family: 'saclos_old', launch: 'tube', launchK: 0.8,
    flareCore: [1, 0.56, 0.22], flareHalo: [1, 0.26, 0.05], flarePx: 1.8, haloPx: 8, flareK: 2.9, flicker: 0.35, flickerHz: 9,
    plumeM: 2.0,
    smoke: { density: 0.5, c0: GREY, c1: GREY_AGED, size0: 0.7, size1: 3.2, life: 5, spacingM: 4, rise: 0.14, windK: 0.85,
      pulse: 0.4 },
    wires: 1, wobbleM: 0.3, wobbleHz: 1.1, igniteM: 2, bodyLen: 0.85, bodyRad: 0.45, bodyHex: 0x56594a,
  }),
  spike: look({
    id: 'spike', family: 'soft_launch', launch: 'soft_eject', launchK: 1,
    flareCore: [1, 0.9, 0.76], flareHalo: [1, 0.58, 0.24], flarePx: 2.1, haloPx: 11, flareK: 4.2, flicker: 0.12, flickerHz: 25,
    plumeM: 3.0,
    smoke: { density: 0.28, c0: WHITE, c1: WHITE_AGED, size0: 0.5, size1: 2.2, life: 3.2, spacingM: 5, rise: 0.12, windK: 0.85,
      pulse: 0.08 },
    wires: 0, wobbleM: 0.04, wobbleHz: 2.2, igniteM: 7, bodyLen: 0.95, bodyRad: 0.42, bodyHex: 0x55594a,
  }),
  kornet: look({
    id: 'kornet', family: 'beam_rider', launch: 'tube', launchK: 0.75,
    flareCore: [1, 0.78, 0.46], flareHalo: [1, 0.42, 0.1], flarePx: 2.0, haloPx: 11, flareK: 4.4, flicker: 0.1, flickerHz: 30,
    plumeM: 2.2,
    smoke: { density: 0.1, c0: WHITE, c1: WHITE_AGED, size0: 0.4, size1: 1.6, life: 1.6, spacingM: 10, rise: 0.1, windK: 0.8,
      pulse: 0 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, igniteM: 3, bodyLen: 0.97, bodyRad: 0.45, bodyHex: 0x606a4a,
  }),
  arkan: look({
    id: 'arkan', family: 'beam_rider', launch: 'gun', launchK: 1,
    flareCore: [1, 0.8, 0.5], flareHalo: [1, 0.44, 0.12], flarePx: 1.8, haloPx: 10, flareK: 4.2, flicker: 0.08, flickerHz: 30,
    plumeM: 2.0,
    smoke: { density: 0.08, c0: WHITE, c1: WHITE_AGED, size0: 0.35, size1: 1.4, life: 1.4, spacingM: 12, rise: 0.1, windK: 0.8,
      pulse: 0 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, igniteM: 14, bodyLen: 0.85, bodyRad: 0.35, bodyHex: 0x4d5642,
  }),
  ataka: look({
    id: 'ataka', family: 'radio_command', launch: 'tube', launchK: 1,
    flareCore: [1, 0.72, 0.36], flareHalo: [1, 0.38, 0.08], flarePx: 2.0, haloPx: 10, flareK: 3.8, flicker: 0.16, flickerHz: 20,
    plumeM: 2.8,
    smoke: { density: 0.3, c0: LIGHT, c1: LIGHT_AGED, size0: 0.6, size1: 2.8, life: 3.6, spacingM: 6, rise: 0.12, windK: 0.8,
      pulse: 0.12 },
    wires: 0, wobbleM: 0.08, wobbleHz: 1.5, igniteM: 2, bodyLen: 1.2, bodyRad: 0.45, bodyHex: 0x4f5741,
  }),
  shillelagh: look({
    id: 'shillelagh', family: 'gun_ir', launch: 'gun', launchK: 1,
    flareCore: [1, 0.92, 0.72], flareHalo: [1, 0.6, 0.26], flarePx: 2.1, haloPx: 11, flareK: 3.8, flicker: 0.55, flickerHz: 9,
    plumeM: 2.4,
    smoke: { density: 0.5, c0: GREY, c1: GREY_AGED, size0: 0.7, size1: 3.0, life: 4.6, spacingM: 4, rise: 0.14, windK: 0.85,
      pulse: 0.3 },
    wires: 0, wobbleM: 0.25, wobbleHz: 1.0, igniteM: 6, bodyLen: 0.9, bodyRad: 0.5, bodyHex: 0x5b5f4b,
  }),
  hellfire: look({
    id: 'hellfire', family: 'rail_dense', launch: 'rail', launchK: 1.2,
    flareCore: [1, 0.88, 0.62], flareHalo: [1, 0.55, 0.2], flarePx: 2.4, haloPx: 12, flareK: 4.6, flicker: 0.08, flickerHz: 30,
    plumeM: 4.0,
    smoke: { density: 0.75, c0: WHITE, c1: WHITE_AGED, size0: 0.8, size1: 3.8, life: 7.5, spacingM: 3.5, rise: 0.1, windK: 0.85,
      pulse: 0.05 },
    wires: 0, wobbleM: 0.02, wobbleHz: 2, igniteM: 0, bodyLen: 1.3, bodyRad: 0.55, bodyHex: 0x60645a,
  }),
  stinger: look({
    id: 'stinger', family: 'manpads', launch: 'soft_eject', launchK: 0.8,
    flareCore: [1, 0.95, 0.86], flareHalo: [1, 0.7, 0.36], flarePx: 2.4, haloPx: 13, flareK: 5, flicker: 0.05, flickerHz: 30,
    plumeM: 4.5,
    smoke: { density: 0.6, c0: WHITE, c1: WHITE_AGED, size0: 0.5, size1: 2.6, life: 6, spacingM: 4.5, rise: 0.1, windK: 0.85,
      pulse: 0.05 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2, igniteM: 9, bodyLen: 1.2, bodyRad: 0.25, bodyHex: 0x55594f,
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
    smoke: { density: 0.18, c0: LIGHT, c1: LIGHT_AGED, size0: 0.3, size1: 1.4, life: 2, spacingM: 7, rise: 0.1, windK: 0.8,
      pulse: 0.05 },
    wires: 0, wobbleM: 0.03, wobbleHz: 2.5, igniteM: 2, bodyLen: 0.55, bodyRad: 0.25, bodyHex: 0x585c52,
  }),
  rocket: look({
    id: 'rocket', family: 'rocket', launch: 'canister', launchK: 1.4,
    flareCore: [1, 0.64, 0.24], flareHalo: [1, 0.34, 0.07], flarePx: 2.8, haloPx: 14, flareK: 4.2, flicker: 0.18, flickerHz: 22,
    plumeM: 6,
    smoke: { density: 0.8, c0: LIGHT, c1: WHITE_AGED, size0: 1.0, size1: 4.5, life: 8, spacingM: 4, rise: 0.12, windK: 0.85,
      pulse: 0.15 },
    wires: 0, wobbleM: 0.05, wobbleHz: 1.4, igniteM: 0, bodyLen: 2.6, bodyRad: 0.75, bodyHex: 0x50553f,
  }),
});

/** The round's own name → its look (first match). */
const BY_NAME: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/\bTOW\b|BGM-71/i, 'tow'],
  [/Konkurs|9M113|Fagot|9M111|Metis|9M115|9M131|9M-695|HJ-P9|HJ-8|Red Arrow 8/i, 'konkurs'],
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
 *  '*-launch' profile; a rack's rockets carry the rocket flag). */
export function firedIsMissile(sound: string | null | undefined, rocket: boolean | undefined): boolean {
  return rocket === true || (typeof sound === 'string' && sound.endsWith('-launch'));
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

/** The flare's radiance factor at flight time t (1 steady; a beacon pulses between 1 - flicker and 1). */
export function missileFlicker(l: MissileLook, t: number, seed: number): number {
  if (!(l.flicker > 0)) return 1;
  const w = Math.PI * 2 * l.flickerHz;
  const v = 0.5 + 0.5 * Math.sin(w * t + seed * 40) * Math.sin(w * 0.61 * t + seed * 17 + 1.3);
  return 1 - l.flicker * v;
}
