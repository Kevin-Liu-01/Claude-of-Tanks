/**
 * What the special modes sound like (world-sfx-269, 2026-11-03; the owner: "all the special moodes"): each mode's opener
 * at the rollout and every event the mode controller (sim/matchModes.ts) emits. Pure data, DOM-free; the engine's mode
 * handler plays them (audioEngine.ts onMode).
 *
 * Both tables are exhaustive. MODE_OPENER names every mode id (typecheck fails on a new mode); MODE_EVENT_SOUND names
 * every `mode_*` event (modeSounds.selftest.mjs scans matchModes.ts and fails on an event it does not name), with the
 * recordings the handler chooses among, or why it is heard as nothing. Until this a Frontline counter-attack, a Turbo
 * Ball reset, the Horde's special waves and an ally turned in Infected played nothing; the ball was heard only by the
 * tank that struck it, as a flat interface sound; a flag taken sounded the same whichever side lost it; and capture the
 * flag, zone control, the gravity mode, the drones and the proving ground opened on the standard battle's horn.
 */
import type { GameModeId } from '../sim/gameModeCatalog.ts';

/**
 * Each mode opens on its own field sound (2026-10-02; world-sfx-269 for the last five): the Horde's air-raid siren, the
 * Frontline's preparatory barrage, the Juggernaut's vault door, the Infected's broken radio, Turbo Ball's foghorn, Gun
 * Game's armory, the AC-130 passing overhead, capture the flag's flag snapping out on its pole, zone control's crews
 * digging in, the gravity mode's airlock, the drones spinning up and lifting off, the proving ground's range siren.
 * Realistic opens on silence.
 */
export const MODE_OPENER: Readonly<Record<GameModeId, string | null>> = Object.freeze({
  standard: 'sting_battle', realistic: null,
  endless_horde: 'mode_horde_siren', frontline_assault: 'mode_frontline_barrage', juggernaut: 'mode_juggernaut',
  infected: 'mode_infected_outbreak', turbo_ball: 'mode_turbo_horn', gun_game: 'mode_gungame_armory', ac130: 'gunship_flyover',
  capture_the_flag: 'mode_ctf_opener', zone_control: 'mode_zone_opener', mars: 'mode_mars_opener', drone: 'mode_drone_opener',
  proving_ground: 'mode_range_opener',
  // Air Support opens on a strike jet's low pass over the field (air-support-270)
  air_support: 'jet_flyover',
});

/** A mode's opener (an id the table does not name opens on the battle horn, as the standard battle does). */
export function modeOpener(mode: string): string | null {
  return Object.hasOwn(MODE_OPENER, mode) ? MODE_OPENER[mode as GameModeId] : 'sting_battle';
}

/** Every event the mode controller emits, without its `mode_` prefix (the bus carries it as `mode:<type>`). */
export const MODE_EVENT_TYPES = Object.freeze([
  'zone_captured', 'zone_contested', 'flag_taken', 'flag_captured', 'flag_returned', 'flag_dropped', 'wave_started',
  'wave_cleared', 'counter_attack', 'line_advanced', 'line_reinforced', 'goal_scored', 'ball_hit', 'ball_reset',
  'pickup_collected', 'pickup_spawned', 'destruction_scored', 'respawn', 'infected', 'weapon_advanced', 'horde_retired',
  'horde_recycled', 'completed',
] as const);
export type ModeEventType = typeof MODE_EVENT_TYPES[number];

/** An event's recordings (the handler picks by side, mode or kind), or `why` it is heard as nothing. */
interface ModeEventSound {
  readonly ids: readonly string[];
  readonly why?: string;
}
const sounds = (...ids: string[]): ModeEventSound => Object.freeze({ ids: Object.freeze(ids) });
const silent = (why: string): ModeEventSound => Object.freeze({ ids: Object.freeze([]), why });

export const MODE_EVENT_SOUND: Readonly<Record<ModeEventType, ModeEventSound>> = Object.freeze({
  zone_captured: sounds('ui_objective_gain', 'ui_objective_loss'),
  zone_contested: silent('the crew calls it ("They\'re contesting the point"): the radio is its sound'),
  flag_taken: sounds('ui_flag_taken', 'ui_flag_seized'),
  flag_captured: sounds('ui_flag_captured', 'ui_objective_loss'),
  flag_returned: sounds('ui_flag_returned', 'ui_flag_dropped'),
  flag_dropped: sounds('ui_flag_returned', 'ui_flag_dropped'),
  // the Horde's waves on the air-raid siren (a special wave on the attack warning's warble), the Frontline's under a
  // barrage, any other mode's on the war drums
  wave_started: sounds('mode_horde_siren', 'mode_horde_swarm', 'mode_frontline_barrage', 'sting_wave'),
  wave_cleared: sounds('mode_horde_all_clear', 'ui_wave_clear'),
  // the defenders' flare over the sector they drive at, heard from there
  counter_attack: sounds('mode_counter_attack'),
  line_advanced: sounds('mode_frontline_barrage', 'ui_line_advance'),
  line_reinforced: silent('a defender joining the line arrives on its own engine and tracks'),
  goal_scored: sounds('ui_goal', 'ui_objective_loss'),
  // the steel buoy struck by anyone, heard where it is
  ball_hit: sounds('ball_strike'),
  // an untouched ball back on the kick-off spot: the kick-off's foghorn again
  ball_reset: sounds('mode_turbo_horn'),
  pickup_collected: sounds('ui_pickup'),
  pickup_spawned: sounds('cache_drop'),
  destruction_scored: sounds('ui_score'),
  respawn: sounds('ui_respawn'),
  // our crew turned (the sting and the radio breaking up), an ally turned (the net breaking up), one more of ours on
  // the infected side (the outbreak, low)
  infected: sounds('sting_infected', 'radio_interference', 'mode_infected_outbreak'),
  // the crew changing over to the next weapon and loading it
  weapon_advanced: sounds('breech_open', 'shell_ram', 'missile_tube_load', 'breech_close', 'latch_ready'),
  horde_retired: silent('bookkeeping: a hostile leaving the wave queue makes no sound of its own'),
  horde_recycled: silent('bookkeeping: a hostile re-entering the wave queue makes no sound of its own'),
  completed: silent('the battle\'s end is heard through battle:ended and battle:presented (the result sting)'),
});

/** Whose flag (taken, returned, dropped) or who scored (captured): ours or theirs. */
type FlagSide = 'ours' | 'theirs';
type FlagEvent = 'flag_taken' | 'flag_captured' | 'flag_returned' | 'flag_dropped';

/**
 * Capture the flag by perspective: the event's `team` is whose flag it is (taken, returned, dropped) or who scored
 * (captured). Their flag in our hands is not our flag lost: a tense stab when they take ours, a firm call when we take
 * theirs; our flag home is the warm note, theirs home the falling one; their carrier dropping ours is relief, ours
 * dropping theirs the falling note.
 */
export const FLAG_CUE: Readonly<Record<FlagEvent, Readonly<Record<FlagSide, string>>>> = Object.freeze({
  flag_taken: Object.freeze({ ours: 'ui_flag_taken', theirs: 'ui_flag_seized' }),
  flag_captured: Object.freeze({ ours: 'ui_flag_captured', theirs: 'ui_objective_loss' }),
  flag_returned: Object.freeze({ ours: 'ui_flag_returned', theirs: 'ui_flag_dropped' }),
  flag_dropped: Object.freeze({ ours: 'ui_flag_returned', theirs: 'ui_flag_dropped' }),
});

/** The Horde's special waves (sim/matchRuleset.ts hordeWaveSpecial) come on the attack warning, not the air-raid siren. */
export function hordeWaveSiren(special: unknown): string {
  return special === 'runner' || special === 'swarm' ? 'mode_horde_swarm' : 'mode_horde_siren';
}

/** Every recording the modes may play (the battle warm pins them). */
export function modeSoundAssets(): string[] {
  const ids = new Set<string>();
  for (const id of Object.values(MODE_OPENER)) if (id) ids.add(id);
  for (const entry of Object.values(MODE_EVENT_SOUND)) for (const id of entry.ids) ids.add(id);
  for (const cue of Object.values(FLAG_CUE)) for (const id of Object.values(cue)) ids.add(id);
  return [...ids].sort();
}
