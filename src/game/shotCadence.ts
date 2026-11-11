// The presentation's cadence for fast guns (release 272, the owner: "debounce some things like fire sounds ... for super
// fast fire rates sound effects, muzzle flashes, etc"). Every air-defence cannon now cycles at the simulation's floor
// (vehicles/airDefenseFirepower.ts: 1,200 rounds a minute), and each of its rounds used to raise a full report stack, a
// full muzzle flash with its smoke and light, a camera kick and a phone buzz. This is the one shared cap the audio, the
// effects, the camera and the phone read: a channel takes a weapon's round only when the channel's window has passed
// since the last round it took, and the round it takes stands for those it folded. A gun that cycles at or above every
// window (a tank at its 6-8 s reload, an autocannon's single shots) passes straight through, unchanged.
// Presentation only: the simulation, the authority, damage, ammunition, reload timing and the wire never read it.
// Dependency-free and allocation-free once a weapon is known (one small typed array per shooter and weapon).
// First-party: Kevin B. Liu (NOTICE.md).

/** The simulation's floor between two rounds of one magazine (sim/damage.ts startPostShotReload: three 60 Hz ticks). */
export const SHOT_FLOOR_S = 0.05;

/**
 * Each presentation channel's window (s). A weapon's round fired at least this long after the last round the channel took
 * plays as it always has; a round inside the window is folded into the next round the channel takes. The windows past
 * the floor are odd multiples of it (0.15 s is three rounds at the floor), so a twin or quadruple gun cycling its
 * barrels round by round shows its flash at each barrel in turn rather than always at one.
 */
export const SHOT_CADENCE_WINDOW_S = Object.freeze({
  /** a round's crack and its muzzle's core flicker: at most the floor's 20 a second (a rotary gun's rounds between the
   *  floor's are silent and dark: the M163's Vulcan, release 270's in-between rounds) */
  report: SHOT_FLOOR_S,
  /** the report's body: the punch of the blast, the distant boom, the feed, the breech */
  body: 0.15,
  /** the map's echo of the report: a second or two of ringing, so once in nine floor rounds */
  tail: 0.45,
  /** the whole muzzle flash: its jets, sparks, fire, propellant smoke, wisps, ground blast, and the muzzle light */
  flash: 0.15,
  /** the camera's kick and shake for the player's own gun, and the paired phone's buzz */
  shake: 0.15,
  /** a burst's sparks and strike sounds on one target, by one shooter */
  impact: 0.1,
});
export type ShotChannel = keyof typeof SHOT_CADENCE_WINDOW_S;
const CHANNELS = Object.keys(SHOT_CADENCE_WINDOW_S) as ShotChannel[];
const CHANNEL_INDEX: Readonly<Record<ShotChannel, number>> = Object.freeze(
  Object.fromEntries(CHANNELS.map((channel, index) => [channel, index])) as Record<ShotChannel, number>);
const WINDOWS = CHANNELS.map((channel) => SHOT_CADENCE_WINDOW_S[channel]);
/** Slots per channel in a weapon's track: the last round the channel took, the last round it saw, the rounds it holds. */
const SLOT = 3;
/** A round within this of the window still counts as past it (a sum of 1/60 steps lands a hair under 0.05). */
const EPSILON_S = 1e-6;

/** A weapon fires sustained when its rounds come closer than this: a gun under 240 rounds a minute never does. */
export const SHOT_SUSTAIN_GAP_S = 0.25;

/** The trauma a second one sustained gun may add to the camera: under its rig's decay (engine/cameraRig.ts
 *  TRAUMA_DECAY_PER_S, 1.4), so a long burst holds a steady shake instead of ratcheting the camera to its full shake. */
export const SHAKE_SUSTAIN_TRAUMA_PER_S = 1.2;

/** The shooters a cadence remembers before it forgets them all (a long room's departed tanks); a re-met weapon starts over. */
const MAX_SHOOTERS = 256;

export type ShotKey = string | number;

export interface ShotCadence {
  /**
   * Offers one round of a weapon to a channel at `timeS` (the clock the round's event carries; any one clock per
   * weapon). Returns the rounds this one stands for when the channel takes it (1, plus the rounds it folded within the
   * window before), or 0 when it is folded into a later one. A clock that runs back (a new battle, a rewound replay)
   * starts the weapon over.
   */
  admit(channel: ShotChannel, shooter: ShotKey | null | undefined, weapon: ShotKey | null | undefined, timeS: number): number;
  /** Seconds between the round the last admit() offered and the weapon's round before it on that channel (Infinity for
   *  its first, or after a clock ran back). */
  readonly gapS: number;
  /** Forgets every weapon (a battle's end). */
  clear(): void;
  /** Weapons remembered (a receipt's bound). */
  readonly weapons: number;
}

/** One cadence: each consumer keeps its own (the audio's, the effects', the camera's, the phone's). */
export function createShotCadence(): ShotCadence {
  const shooters = new Map<ShotKey, Map<ShotKey, Float64Array>>();
  let weapons = 0;
  let gapS = Infinity;
  function track(shooter: ShotKey, weapon: ShotKey): Float64Array {
    let byWeapon = shooters.get(shooter);
    if (!byWeapon) {
      if (shooters.size >= MAX_SHOOTERS) { shooters.clear(); weapons = 0; }
      byWeapon = new Map();
      shooters.set(shooter, byWeapon);
    }
    let slots = byWeapon.get(weapon);
    if (!slots) {
      slots = new Float64Array(CHANNELS.length * SLOT).fill(Number.NaN);
      byWeapon.set(weapon, slots);
      weapons++;
    }
    return slots;
  }
  return {
    admit(channel, shooter, weapon, timeS) {
      const index = CHANNEL_INDEX[channel];
      if (index === undefined || !Number.isFinite(timeS)) { gapS = Infinity; return 1; }
      const slots = track(shooter ?? '', weapon ?? '');
      const at = index * SLOT;
      const lastTaken = slots[at]!;
      const lastSeen = slots[at + 1]!;
      const window = WINDOWS[index]!;
      // the first round, or a clock that ran back: the weapon starts over
      if (!(timeS >= lastSeen)) {
        gapS = Infinity;
        slots[at] = timeS; slots[at + 1] = timeS; slots[at + 2] = 0;
        return 1;
      }
      gapS = timeS - lastSeen;
      slots[at + 1] = timeS;
      // rounds folded more than a window before this one belong to a burst that ended: they ride no later round
      if (gapS >= window - EPSILON_S) slots[at + 2] = 0;
      if (timeS - lastTaken >= window - EPSILON_S) {
        const rounds = slots[at + 2]! + 1;
        slots[at] = timeS; slots[at + 2] = 0;
        return rounds;
      }
      slots[at + 2] = slots[at + 2]! + 1;
      return 0;
    },
    get gapS() { return gapS; },
    clear() { shooters.clear(); weapons = 0; gapS = Infinity; },
    get weapons() { return weapons; },
  };
}

/**
 * The scale of one camera kick that stands for `rounds` rounds of a gun whose one round adds `perRoundTrauma`: 1 for a
 * single round (a slow gun's shot, unchanged), more for a sustained gun's folded rounds (by their square root), but never
 * past SHAKE_SUSTAIN_TRAUMA_PER_S over the shake window, so a long burst cannot ratchet the camera to its full shake.
 */
export function shotShakeScale(rounds: number, perRoundTrauma: number): number {
  if (!(rounds > 0)) return 0;
  if (rounds <= 1) return 1;
  const ceiling = SHAKE_SUSTAIN_TRAUMA_PER_S * SHOT_CADENCE_WINDOW_S.shake / Math.max(1e-3, perRoundTrauma);
  return Math.min(Math.sqrt(rounds), Math.max(1, ceiling));
}

/**
 * How long one crack of a sustained gun may ring (s): long enough for its attack and the first of its decay, short enough
 * that one weapon holds a handful of voices rather than every voice the mix has (the next rounds' cracks and the echo,
 * one each tail window, carry the burst's body). Null for a gun that is not firing sustained: its report rings in full.
 */
export function sustainedGrainS(gapS: number): number | null {
  if (!(gapS < SHOT_SUSTAIN_GAP_S)) return null;
  return Math.min(1, Math.max(0.3, 6 * Math.max(gapS, SHOT_FLOOR_S)));
}

/** A gun cycling at least this slowly passes every channel round by round, unchanged (the longest window). */
export const SHOT_SLOW_S = Math.max(...Object.values(SHOT_CADENCE_WINDOW_S));
