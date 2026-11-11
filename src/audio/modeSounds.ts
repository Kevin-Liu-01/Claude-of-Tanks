/**
 * What the special modes sound like (world-sfx-269, 2026-11-03; the owner: "all the special moodes"): each mode's opener
 * at the rollout and every event the mode controller (sim/matchModes.ts) emits. Pure data, DOM-free; the engine's mode
 * handler plays them (audioEngine.ts onMode).
 *
 * Both tables are exhaustive. MODE_OPENER names every mode id (typecheck fails on a new mode); MODE_EVENT_SOUND names
 * every `mode_*` event (worldSounds.selftest.mjs scans matchModes.ts and fails on an event it does not name), with the
 * recordings the handler chooses among, or why it is heard as nothing. MODE_EVENT_TYPES is the one list of the events:
 * the engine's handler and the crew's (crewProcedure.ts) are typed by it, so a renamed or retired event fails the
 * typecheck in both (round 8 Y3 s1-14). Until this a Frontline counter-attack, a Turbo
 * Ball reset, the Horde's special waves and an ally turned in Infected played nothing; the ball was heard only by the
 * tank that struck it, as a flat interface sound; a flag taken sounded the same whichever side lost it; and capture the
 * flag, zone control, the gravity mode, the drones and the proving ground opened on the standard battle's horn.
 */
import type { GameModeId } from '../sim/gameModeCatalog.ts';
import type { AirStrikeKind } from '../sim/matchRuleset.ts';

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

// ------------------------------------------------------------ air support ---

/**
 * Air Support's call-ins (air-support-270, 2026-11-05; the owner: "call in 3 differennt kinnds of airstrikes with their own
 * special effects annd sounnt", then "keep and add artillery annd recon with the 3 airstrikes"). Each kind is heard by its
 * moments, from the strike's public record (sim/airSupport.ts): the aircraft's engines flown along its path (aircraftPose:
 * the aircraft rig's distance law, air, pan and Doppler make the pass), the gun's burst once per run, each falling round's
 * whistle down to its landing, the landing's own blast where the howitzer bank is too small, the targeted crew's call when
 * the footprint covers its hull, and our crew's read-back when it calls the kind. Exhaustive: a new call-in fails typecheck
 * until it names its sounds.
 */
/** The strike aircraft's engine loops (aerialRig.ts), by the airframe that flies the kind. */
export type StrikeAircraft = 'strike_recon' | 'strike_attack' | 'strike_fast' | 'gunship';

export interface AirStrikeSound {
  /** The aircraft the rig flies along the strike's path, or null (the battery fires from off the map). */
  readonly aircraft: StrikeAircraft | null;
  /** The gun's burst, heard once a run from the aircraft (its close bank fading into its distant one), or null. */
  readonly burst: { readonly close: string; readonly far: string } | null;
  /** Each round's whistle down to its landing, or null (the gunship's rounds are fired reports: weaponAudio's rows). */
  readonly fall: string | null;
  /** The landing's own blast in place of the HE bank's, or null (the 155 mm is the howitzer-sized bank's). */
  readonly blast: string | null;
  /** The targeted crew's call when the footprint covers its hull, or null (a recon pass lands nothing). */
  readonly incoming: 'air_incoming' | 'artillery_incoming' | null;
  /** Our crew's read-back when it calls the kind (the AC-130 checks in with the gunship crew's own call). */
  readonly readback: string;
}

export const AIR_STRIKE_SOUND: Readonly<Record<AirStrikeKind, AirStrikeSound>> = Object.freeze({
  // the photo pass: a jet high and fast over the mark; the reveal is the spotting system's, heard as the crew's spots
  recon: Object.freeze({ aircraft: 'strike_recon', burst: null, fall: null, blast: null, incoming: null, readback: 'air_call_recon' }),
  // the battery's ten 155 mm rounds, each whistling down its last seconds onto the circle
  artillery: Object.freeze({ aircraft: null, burst: null, fall: 'air_shell_incoming', blast: null, incoming: 'artillery_incoming', readback: 'air_call_artillery' }),
  // the A-10's run: its turbofans, the GAU-8's one burst (the rounds strike before its report arrives)
  strafe: Object.freeze({ aircraft: 'strike_attack', burst: Object.freeze({ close: 'air_gau8_close', far: 'air_gau8_far' }), fall: null, blast: null,
    incoming: 'air_incoming', readback: 'air_call_strafe' }),
  // the GBU-12: the jet's pass, the bomb's whistle from its release and the 500 lb blast, far past any shell's
  bomb: Object.freeze({ aircraft: 'strike_fast', burst: null, fall: 'air_bomb_fall', blast: 'air_bomb_blast', incoming: 'air_incoming', readback: 'air_call_bomb' }),
  // the AC-130's orbit: its own turboprops (gunship_orbit_loop) and its own guns' reports from the sky
  gunship: Object.freeze({ aircraft: 'gunship', burst: null, fall: null, blast: null, incoming: 'air_incoming', readback: 'gunship_cleared_hot' }),
});

/** The weapon sounds a strike round names that are heard as the strike's own (the burst, the whistle), never per round. */
export const STRIKE_OWNED_REPORTS: ReadonlySet<string> = new Set(['strike-strafe', 'strike-bomb', 'strike-artillery']);

/** Every event Air Support emits, without its `mode_` prefix (worldSounds.selftest.mjs scans sim/airSupport.ts). */
export const AIR_EVENT_TYPES = Object.freeze(['strike_called', 'strike_round', 'aircraft_hit', 'aircraft_down', 'recon_pass', 'strike_denied'] as const);
export type AirEventType = typeof AIR_EVENT_TYPES[number];

export const AIR_EVENT_SOUND: Readonly<Record<AirEventType, ModeEventSound>> = Object.freeze({
  // the targeted side's hull warns it (louder when the footprint covers it); the aircraft's engines start in the distance
  strike_called: sounds('air_strike_warning'),
  // the burst, the whistles (AIR_STRIKE_SOUND); the gunship's rounds are fired reports through the bridge's shell:fired
  strike_round: sounds('air_gau8_close', 'air_gau8_far', 'air_shell_incoming', 'air_bomb_fall'),
  aircraft_hit: silent('the round that struck it is heard as fired; an airframe hit high overhead is not heard on the ground'),
  // the aircraft falls along its last heading (game/airSupportWorld.ts fallPose) and crashes where it meets the ground
  aircraft_down: sounds('air_crash'),
  recon_pass: silent('the pass is its jet\'s engines; what it reveals is heard as the crew\'s spots'),
  // our own call refused by the authority: the interface's refusal
  strike_denied: sounds('ui_error'),
});

/** The aircraft loops, by airframe (the gunship's is its own orbit, the AC-130 mode's). */
export const STRIKE_AIRCRAFT_LOOP: Readonly<Record<StrikeAircraft, string>> = Object.freeze({
  strike_recon: 'air_jet_recon_loop', strike_attack: 'air_jet_attack_loop', strike_fast: 'air_jet_fast_loop', gunship: 'gunship_orbit_loop',
});

/** Every recording an Air Support battle may play (its warm pins them; the gunship's reports are its rows'). */
export function airSupportAssets(): string[] {
  const ids = new Set<string>(Object.values(STRIKE_AIRCRAFT_LOOP));
  for (const sound of Object.values(AIR_STRIKE_SOUND)) {
    if (sound.burst) { ids.add(sound.burst.close); ids.add(sound.burst.far); }
    if (sound.fall) ids.add(sound.fall);
    if (sound.blast) ids.add(sound.blast);
  }
  for (const entry of Object.values(AIR_EVENT_SOUND)) for (const id of entry.ids) ids.add(id);
  return [...ids].sort();
}
