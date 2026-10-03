/**
 * Playback policy for every shipped sound-effect asset: which bus it mixes
 * on, how it attenuates and darkens with distance, its HDR loudness, voice
 * priority, instance cap, re-trigger cooldown and pitch variation.
 *
 * Defaults come from the asset's group (the directory the build writes it
 * to); a short override table tunes the assets that differ. Pure data.
 */

export type BusId =
  | 'weapons' | 'impacts' | 'vehicles' | 'own' | 'ownCombat' | 'interior' | 'environment'
  | 'ambience' | 'ui' | 'music' | 'voice' | 'alarm' | 'cinematic';

/** How a cue is placed: world-positioned, attached to the occupied hull, or flat. */
export type CueSpace = 'world' | 'hull' | 'flat';

export interface CueProfile {
  readonly bus: BusId;
  readonly space: CueSpace;
  /** 0..100; higher survives voice stealing. */
  readonly priority: number;
  readonly maxInstances: number;
  readonly cooldownS: number;
  readonly refM: number;
  readonly rolloff: number;
  readonly maxM: number;
  /** Air-absorption sensitivity (1 = nominal). */
  readonly absorb: number;
  /** Base reverb send 0..1 (grows with distance). */
  readonly send: number;
  /** HDR logical loudness at 1 m (dB). */
  readonly loudDb: number;
  readonly gainDb: number;
  readonly pitch: readonly [number, number];
}

type ProfileSeed = Omit<CueProfile, 'pitch'> & { pitch?: readonly [number, number] };

const seed = (value: ProfileSeed): CueProfile => Object.freeze({ pitch: [0.97, 1.03] as const, ...value });

export const GROUP_PROFILES: Readonly<Record<string, CueProfile>> = Object.freeze({
  // Gunfire, impacts and destruction use a compressed distance law (a game mix,
  // not inverse-square): a battle stays audible across the map instead of
  // sinking under the idling engine at a hundred metres.
  weapons: seed({ bus: 'weapons', space: 'world', priority: 85, maxInstances: 10, cooldownS: 0, refM: 35, rolloff: 0.55, maxM: 1800, absorb: 0.9, send: 0.16, loudDb: 145, gainDb: 0, pitch: [0.96, 1.04] }),
  mechanism: seed({ bus: 'interior', space: 'hull', priority: 70, maxInstances: 4, cooldownS: 0.05, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0.04, loudDb: 105, gainDb: -3 }),
  flyby: seed({ bus: 'impacts', space: 'world', priority: 80, maxInstances: 4, cooldownS: 0.08, refM: 6, rolloff: 1.1, maxM: 120, absorb: 1, send: 0.1, loudDb: 128, gainDb: -1 }),
  impacts: seed({ bus: 'impacts', space: 'world', priority: 78, maxInstances: 12, cooldownS: 0, refM: 15, rolloff: 0.75, maxM: 1400, absorb: 1, send: 0.2, loudDb: 138, gainDb: 0 }),
  destruction: seed({ bus: 'impacts', space: 'world', priority: 88, maxInstances: 6, cooldownS: 0, refM: 30, rolloff: 0.6, maxM: 2500, absorb: 0.7, send: 0.26, loudDb: 152, gainDb: 0, pitch: [0.95, 1.04] }),
  // Small clutter stays local: a battle of fourteen tanks is otherwise a wall of foley.
  props: seed({ bus: 'environment', space: 'world', priority: 55, maxInstances: 6, cooldownS: 0.05, refM: 10, rolloff: 1.05, maxM: 260, absorb: 1, send: 0.2, loudDb: 128, gainDb: -2 }),
  collisions: seed({ bus: 'impacts', space: 'world', priority: 70, maxInstances: 4, cooldownS: 0.12, refM: 9, rolloff: 1.05, maxM: 320, absorb: 1, send: 0.16, loudDb: 132, gainDb: -1 }),
  vehicle: seed({ bus: 'vehicles', space: 'world', priority: 40, maxInstances: 6, cooldownS: 0.08, refM: 8, rolloff: 1.1, maxM: 140, absorb: 1, send: 0.12, loudDb: 118, gainDb: -3 }),
  engines: seed({ bus: 'vehicles', space: 'world', priority: 45, maxInstances: 4, cooldownS: 0.5, refM: 10, rolloff: 1, maxM: 900, absorb: 0.8, send: 0.1, loudDb: 120, gainDb: -2 }),
  tracks: seed({ bus: 'vehicles', space: 'world', priority: 40, maxInstances: 4, cooldownS: 0.5, refM: 8, rolloff: 1.1, maxM: 600, absorb: 1, send: 0.08, loudDb: 115, gainDb: -3 }),
  equipment: seed({ bus: 'interior', space: 'hull', priority: 60, maxInstances: 2, cooldownS: 0.3, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0.04, loudDb: 104, gainDb: -5 }),
  ambience: seed({ bus: 'ambience', space: 'flat', priority: 20, maxInstances: 3, cooldownS: 0, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0, loudDb: 80, gainDb: 0 }),
  spots: seed({ bus: 'ambience', space: 'world', priority: 10, maxInstances: 3, cooldownS: 1.5, refM: 25, rolloff: 1, maxM: 700, absorb: 1, send: 0.3, loudDb: 96, gainDb: -2, pitch: [0.95, 1.05] }),
  edge: seed({ bus: 'interior', space: 'hull', priority: 62, maxInstances: 2, cooldownS: 0.2, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0.04, loudDb: 104, gainDb: -6 }),
  radio: seed({ bus: 'voice', space: 'flat', priority: 95, maxInstances: 2, cooldownS: 0, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0, loudDb: 100, gainDb: -12, pitch: [0.98, 1.02] }),
  ui: seed({ bus: 'ui', space: 'flat', priority: 90, maxInstances: 3, cooldownS: 0.03, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0, loudDb: 100, gainDb: -6, pitch: [0.99, 1.01] }),
  stingers: seed({ bus: 'music', space: 'flat', priority: 92, maxInstances: 1, cooldownS: 0.5, refM: 1, rolloff: 0, maxM: 1e9, absorb: 0, send: 0, loudDb: 100, gainDb: -5, pitch: [1, 1] }),
  // Drone and AC-130 aircraft: their engine loops run in aerialRig; these place the one-shots.
  aerial: seed({ bus: 'vehicles', space: 'world', priority: 65, maxInstances: 3, cooldownS: 0.3, refM: 6, rolloff: 1, maxM: 500, absorb: 1, send: 0.12, loudDb: 118, gainDb: -3 }),
});

const o = (value: Partial<ProfileSeed>): Partial<CueProfile> => Object.freeze(value);

/** Assets that differ from their group default. */
const CUE_OVERRIDES: Readonly<Record<string, Partial<CueProfile>>> = Object.freeze({
  // The procedural muzzle blast (procedural.ts) travels like gunfire, and air takes its crack first.
  muzzle_blast: { bus: 'weapons', space: 'world', priority: 86, maxInstances: 16, cooldownS: 0, refM: 35, rolloff: 0.55, maxM: 2400, absorb: 1.1, send: 0.1, loudDb: 145, gainDb: 0, pitch: [0.98, 1.02] },
  // Main guns carry across the whole battlefield as distant thunder.
  gun_far_light: o({ refM: 80, rolloff: 0.62, maxM: 2600, absorb: 0.5, send: 0.3, loudDb: 140 }),
  gun_far_medium: o({ refM: 90, rolloff: 0.62, maxM: 2800, absorb: 0.45, send: 0.3, loudDb: 144 }),
  gun_far_heavy: o({ refM: 100, rolloff: 0.62, maxM: 3000, absorb: 0.4, send: 0.3, loudDb: 148 }),
  ac_far_light: o({ refM: 50, rolloff: 0.68, maxM: 1600, absorb: 0.55, send: 0.26, loudDb: 128 }),
  ac_far_heavy: o({ refM: 60, rolloff: 0.68, maxM: 1900, absorb: 0.55, send: 0.26, loudDb: 133 }),
  mg_far: o({ refM: 40, rolloff: 0.72, maxM: 900, absorb: 0.6, send: 0.24, loudDb: 116, gainDb: -2 }),
  mg_rifle_close: o({ maxInstances: 8, refM: 14, rolloff: 0.7, maxM: 500, loudDb: 120, gainDb: -2, pitch: [0.95, 1.05] }),
  mg_heavy_close: o({ maxInstances: 8, refM: 16, rolloff: 0.68, maxM: 700, loudDb: 126, gainDb: -1, pitch: [0.95, 1.05] }),
  tail_open: o({ refM: 60, rolloff: 0.7, maxM: 2500, absorb: 0.4, send: 0.1, gainDb: -4 }),
  tail_forest: o({ refM: 60, rolloff: 0.7, maxM: 2500, absorb: 0.45, send: 0.1, gainDb: -4 }),
  tail_urban: o({ refM: 60, rolloff: 0.7, maxM: 2500, absorb: 0.4, send: 0.1, gainDb: -3 }),
  tail_mountain: o({ refM: 70, rolloff: 0.65, maxM: 3000, absorb: 0.35, send: 0.1, gainDb: -3 }),
  gun_interior_medium: o({ bus: 'ownCombat', space: 'hull', loudDb: 140 }),
  gun_interior_large: o({ bus: 'ownCombat', space: 'hull', loudDb: 142 }),
  gun_interior_heavy: o({ bus: 'ownCombat', space: 'hull', loudDb: 144 }),
  missile_flight_loop: o({ priority: 70, maxM: 900, loudDb: 128 }),
  rocket_salvo: o({ loudDb: 150, maxM: 3000 }),
  smoke_launcher: o({ priority: 60, refM: 8, maxM: 400, loudDb: 120, gainDb: -2 }),
  smoke_burst: o({ priority: 40, refM: 8, maxM: 300, loudDb: 112, gainDb: -4 }),
  // Interior and hull-attached impacts: the receiving end of a hit.
  pen_interior: o({ bus: 'ownCombat', space: 'hull', priority: 92, loudDb: 140 }),
  nonpen_interior: o({ bus: 'ownCombat', space: 'hull', priority: 90, loudDb: 134 }),
  bullet_armor: o({ maxInstances: 4, refM: 4, maxM: 180, loudDb: 112, cooldownS: 0.05, gainDb: -3 }),
  bullet_dirt: o({ maxInstances: 4, refM: 4, maxM: 120, loudDb: 106, cooldownS: 0.05, priority: 30, gainDb: -3 }),
  bullet_water: o({ maxInstances: 3, refM: 4, maxM: 120, loudDb: 104, priority: 28 }),
  ricochet_light: o({ refM: 6, maxM: 220, loudDb: 116, gainDb: -3 }),
  // Distant armour hits carry their distance in the recording: the close banks' slope,
  // shifted by their quieter master so the range crossfade stays level, with less air loss.
  impact_far_pen: o({ refM: 35, maxM: 2600, absorb: 0.5, send: 0.3, loudDb: 132 }),
  impact_far_nonpen: o({ refM: 35, maxM: 2400, absorb: 0.5, send: 0.3, loudDb: 130 }),
  impact_far_ricochet: o({ refM: 35, maxM: 2400, absorb: 0.5, send: 0.3, loudDb: 130 }),
  expl_he_small: o({ loudDb: 136 }),
  expl_he_medium: o({ refM: 22, rolloff: 0.68, maxM: 2200, absorb: 0.75, send: 0.24, loudDb: 148 }),
  expl_he_large: o({ refM: 28, rolloff: 0.62, maxM: 3000, absorb: 0.6, send: 0.28, loudDb: 154 }),
  expl_far: o({ refM: 120, rolloff: 0.8, maxM: 3500, absorb: 0.4, send: 0.3, loudDb: 150 }),
  debris_dirt: o({ priority: 40, maxM: 250, loudDb: 112, gainDb: -5 }),
  ground_dirt: o({ loudDb: 130 }),
  water_small: o({ priority: 35, maxM: 300, loudDb: 112 }),
  // Fires and cook-off loops ride the vehicle bus.
  cookoff_loop: o({ bus: 'environment', priority: 50, maxM: 900, loudDb: 128 }),
  wreck_fire_loop: o({ bus: 'environment', priority: 35, maxM: 500, loudDb: 116 }),
  fire_small_loop: o({ bus: 'environment', priority: 40, maxM: 400, loudDb: 112 }),
  metal_creak: o({ bus: 'environment', priority: 20, maxM: 160, loudDb: 100, gainDb: -6 }),
  // Own-hull foley that must stay intimate.
  gear_shift: o({ maxM: 120, loudDb: 108, gainDb: -6 }),
  susp_creak: o({ maxM: 100, loudDb: 102, gainDb: -6 }),
  brake_squeal: o({ maxM: 150, loudDb: 120, gainDb: -6 }),
  track_break: o({ priority: 70, maxM: 500, loudDb: 128 }),
  turret_stop: o({ bus: 'own', space: 'hull', gainDb: -8 }),
  hydro_susp: o({ maxM: 150, loudDb: 108 }),
  water_enter: o({ priority: 60, maxM: 500, loudDb: 126 }),
  jump_launch: o({ loudDb: 120 }),
  self_right: o({ loudDb: 124 }),
  // Equipment cues ring through the radio net as well as the hull.
  extinguisher: o({ gainDb: -3 }),
  // Edge-case cues: world-placed ones.
  rollover: o({ bus: 'impacts', space: 'world', priority: 70, refM: 10, rolloff: 1.05, maxM: 500, absorb: 1, send: 0.15, loudDb: 128, gainDb: -1 }),
  hull_debris_patter: o({ bus: 'ownCombat', gainDb: -4 }),
  missile_warning: o({ bus: 'alarm', space: 'flat', priority: 94, gainDb: -8 }),
  lock_on: o({ bus: 'alarm', space: 'flat', gainDb: -10 }),
  lock_off: o({ bus: 'alarm', space: 'flat', gainDb: -12 }),
  killcam_in: o({ bus: 'cinematic', space: 'flat', priority: 80, gainDb: -6 }),
  killcam_out: o({ bus: 'cinematic', space: 'flat', priority: 80, gainDb: -8 }),
  spectate_switch: o({ bus: 'ui', space: 'flat', gainDb: -8 }),
  tinnitus: o({ bus: 'alarm', space: 'flat', priority: 96, gainDb: -14 }),
  interior_hum_loop: o({ bus: 'interior', gainDb: -10 }),
  interior_rattle_loop: o({ bus: 'interior', gainDb: -8 }),
  bubbles_loop: o({ bus: 'own', gainDb: -6 }),
  ui_hover: o({ gainDb: -14, cooldownS: 0.07 }),
  ui_slider: o({ gainDb: -12, cooldownS: 0.04 }),
  ui_ball_hit: o({ bus: 'impacts', space: 'world', refM: 10, rolloff: 1, maxM: 600, absorb: 1, send: 0.2, loudDb: 128, gainDb: -2 }),
  // Distant war beyond the map edge carries much further than combat.
  distant_artillery: o({ bus: 'environment', space: 'world', priority: 15, refM: 300, rolloff: 0.6, maxM: 6000, absorb: 0.25, send: 0.35, loudDb: 158, gainDb: -6 }),
  distant_flak: o({ bus: 'environment', space: 'world', priority: 12, refM: 200, rolloff: 0.6, maxM: 5000, absorb: 0.3, send: 0.3, loudDb: 150, gainDb: -8 }),
  distant_mg: o({ bus: 'environment', space: 'world', priority: 10, refM: 150, rolloff: 0.6, maxM: 4000, absorb: 0.35, send: 0.3, loudDb: 140, gainDb: -8 }),
  jet_flyover: o({ bus: 'environment', space: 'world', priority: 30, refM: 200, rolloff: 0.7, maxM: 6000, absorb: 0.3, send: 0.2, loudDb: 160, gainDb: -6 }),
  heli_loop: o({ bus: 'environment', space: 'world', priority: 25, refM: 120, rolloff: 0.7, maxM: 5000, absorb: 0.35, send: 0.2, loudDb: 150, gainDb: -6 }),
  // Workshop sounds inside the hangar: placed a few metres away (indoor scene).
  garage_clank: o({ bus: 'ambience', space: 'world', refM: 6, rolloff: 0.9, maxM: 80, absorb: 0.3, send: 0.45, loudDb: 100, gainDb: -2 }),
});

const profileCache = new Map<string, CueProfile>();

/** Effective playback profile of one asset id within its manifest group. */
export function cueProfile(assetId: string, group: string): CueProfile {
  const key = `${group}:${assetId}`;
  let profile = profileCache.get(key);
  if (!profile) {
    const base = GROUP_PROFILES[group] ?? GROUP_PROFILES.impacts;
    profile = Object.freeze({ ...base, ...(CUE_OVERRIDES[assetId] ?? {}) });
    profileCache.set(key, profile);
  }
  return profile;
}
