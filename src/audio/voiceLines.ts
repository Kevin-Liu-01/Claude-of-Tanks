/**
 * Crew radio line catalog: priority, cooldown, mutual-exclusion group and
 * staleness for every line id in the national scripts
 * (tools/audio/crew-lines.json).
 *
 * Priority ladder (radio discipline): 4 = result and critical survival, may
 * cut anything below; 3 = actionable damage and decisive events, may cut
 * situational calls; 2 = important reports (what our round did, what our
 * equipment just did), may cut flavour; 1 = situational; 0 = flavour that
 * never waits in the queue. A line that `yields` is cut by any call of
 * priority 1 or more.
 *
 * A line asks for a moment in the tank crew's words; `resolveCrewLine` turns it
 * into what this crew says there: the mode's own call (its opening, its
 * results, the team counts a respawning mode has no use for) and the AC-130
 * crew's call for a tank crew's (MODE_CREW, GUNSHIP_CREW).
 */

import type { GameModeId } from '../sim/gameModeCatalog.ts';

export interface VoiceLineMeta {
  readonly pri: 0 | 1 | 2 | 3 | 4;
  readonly cdS: number;
  readonly group: string;
  readonly groupCdS?: number;
  readonly staleS: number;
  readonly yields?: boolean;
}

const V = (pri: VoiceLineMeta['pri'], cdS: number, group: string, staleS: number, groupCdS?: number): VoiceLineMeta =>
  Object.freeze(groupCdS == null ? { pri, cdS, group, staleS } : { pri, cdS, group, staleS, groupCdS });

export const VOICE_LINES: Readonly<Record<string, VoiceLineMeta>> = Object.freeze({
  // battle envelope
  battle_start: V(2, 8, 'flow', 1.4),
  on_the_move: V(1, 30, 'flow', 1.0),
  victory: V(4, 10, 'result', 8),
  defeat: V(4, 10, 'result', 8),
  draw: V(4, 10, 'result', 8),
  // awareness
  enemy_spotted: V(1, 9, 'awareness', 0.9, 4.5),
  spotted_front: V(1, 9, 'awareness', 0.9, 4.5),
  spotted_left: V(1, 9, 'awareness', 0.9, 4.5),
  spotted_right: V(1, 9, 'awareness', 0.9, 4.5),
  spotted_rear: V(2, 8, 'awareness', 0.9, 4),
  spotted_multiple: V(2, 14, 'awareness', 1.0, 4),
  sixth_sense: V(3, 14, 'awareness', 1.0),
  // our gunnery
  firing: V(0, 12, 'gun_cycle', 0.35),
  missile_away: V(1, 8, 'gun_cycle', 0.5),
  // What our round did: called on every main-gun shot (2026-10-04), so a report that cuts the loader's chatter and
  // waits out a busy net, spaced only by the group's breath between results.
  penetration: V(2, 3, 'shot_result', 1.4, 2.5),
  nonpen: V(2, 3, 'shot_result', 1.4, 2.5),
  ricochet: V(2, 3, 'shot_result', 1.4, 2.5),
  enemy_crit: V(2, 4, 'shot_result', 1.4, 2.5),
  enemy_fire: V(2, 8, 'shot_result', 1.4, 2.5),
  enemy_ammo_rack: V(2, 10, 'shot_result', 1.4),
  enemy_immobilized: V(2, 6, 'shot_result', 1.4, 2.5),
  enemy_gun_damaged: V(2, 6, 'shot_result', 1.4, 2.5),
  enemy_crew_hit: V(2, 6, 'shot_result', 1.4, 2.5),
  enemy_engine_hit: V(2, 6, 'shot_result', 1.4, 2.5),
  target_destroyed: V(3, 3.5, 'shot_result', 2.0),
  double_kill: V(3, 20, 'shot_result', 2.0),
  miss: V(1, 6, 'shot_result', 1.0, 2.5),
  friendly_fire: V(2, 6, 'team', 1.0),
  // loading
  reloading: V(0, 9, 'gun_cycle', 0.45),
  reloaded: V(0, 3, 'gun_cycle', 0.45),
  load_kinetic: V(1, 2.5, 'ammo', 0.6),
  load_heat: V(1, 2.5, 'ammo', 0.6),
  load_he: V(1, 2.5, 'ammo', 0.6),
  load_missile: V(1, 2.5, 'ammo', 0.6),
  // the AC-130's weapons, called as the gunner selects them
  gunship_cannon: V(1, 2.5, 'ammo', 0.6),
  gunship_howitzer: V(1, 2.5, 'ammo', 0.6),
  gunship_missile: V(1, 2.5, 'ammo', 0.6),
  // (ac130-fx-228) the gunship crew confirms the AC-130's kills (the tank crew's target_destroyed / double_kill)
  gunship_kill: V(3, 3.5, 'shot_result', 2.0),
  gunship_double: V(3, 20, 'shot_result', 2.0),
  ammo_low: V(1, 45, 'ammo', 1.2),
  ammo_empty: V(1, 6, 'ammo', 1.0),
  ammo_out_all: V(3, 30, 'ammo', 1.2),
  target_locked: V(1, 4, 'gun_cycle', 0.5),
  target_lost: V(1, 6, 'gun_cycle', 0.6),
  // incoming
  were_hit: V(2, 6, 'incoming', 0.8),
  bounced_us: V(2, 6, 'incoming', 0.8),
  near_miss: V(2, 12, 'incoming', 0.7),
  missile_incoming: V(4, 6, 'incoming', 0.8),
  drone_incoming: V(4, 8, 'incoming', 0.9),
  hit_by_friendly: V(3, 10, 'team', 1.0),
  rammed: V(3, 8, 'incoming', 0.8),
  friendly_ram: V(1, 12, 'team', 0.8),
  low_hp: V(3, 25, 'damage', 1.1),
  ammo_rack: V(4, 8, 'damage', 1.3),
  fuel_tank: V(3, 10, 'damage', 1.1),
  fire: V(4, 10, 'damage', 1.3),
  fire_out: V(2, 10, 'recovery', 1.2),
  engine_damaged: V(3, 8, 'damage', 1.1),
  engine_destroyed: V(3, 10, 'damage', 1.1),
  transmission_damaged: V(3, 10, 'damage', 1.1),
  track_gone: V(3, 6, 'damage', 1.1),
  gun_damaged: V(3, 8, 'damage', 1.1),
  turret_jammed: V(3, 10, 'damage', 1.1),
  gun_mount_damaged: V(3, 10, 'damage', 1.1),
  autoloader_damaged: V(3, 10, 'damage', 1.1),
  feed_damaged: V(3, 10, 'damage', 1.1),
  roof_gun_damaged: V(2, 12, 'damage', 1.1),
  missile_rack_damaged: V(3, 10, 'damage', 1.1),
  optics_damaged: V(3, 10, 'damage', 1.1),
  radio_damaged: V(3, 10, 'damage', 1.1),
  commander_down: V(3, 12, 'damage', 1.1),
  gunner_down: V(3, 12, 'damage', 1.1),
  driver_down: V(3, 12, 'damage', 1.1),
  loader_down: V(3, 12, 'damage', 1.1),
  // mobility edge cases
  flipped: V(4, 10, 'mobility', 1.0),
  back_on_tracks: V(2, 10, 'mobility', 1.2),
  taking_water: V(3, 15, 'mobility', 1.0),
  stuck: V(2, 18, 'mobility', 1.0),
  // recovery and equipment
  repairs: V(1, 8, 'recovery', 1.2),
  crew_recovered: V(1, 8, 'recovery', 1.2),
  track_repaired: V(1, 8, 'recovery', 1.2),
  gun_repaired: V(1, 8, 'recovery', 1.2),
  engine_repaired: V(1, 8, 'recovery', 1.2),
  extinguishing: V(2, 8, 'recovery', 0.8),
  smoke_out: V(2, 10, 'recovery', 0.8),
  // our own systems: the crew confirms what the commander's switch just did
  roof_gun_on: V(1, 8, 'equipment', 1.0),
  suspension_set: V(1, 6, 'equipment', 1.0),
  drone_launch: V(2, 6, 'equipment', 1.2),
  drone_lost: V(2, 8, 'equipment', 1.4),
  supply_ammo: V(2, 6, 'equipment', 1.4),
  supply_repair: V(2, 6, 'equipment', 1.4),
  // team and objectives
  ally_destroyed: V(1, 12, 'team', 1.2),
  ally_kill: V(1, 10, 'team', 1.2),
  // The count is still news a few seconds on: it waits out the kill call that usually comes with it.
  last_tank: V(3, 60, 'team', 4.0),
  last_enemy: V(3, 60, 'team', 4.0),
  outnumbered: V(2, 60, 'team', 4.0),
  objective_captured: V(2, 10, 'mode', 1.5),
  objective_lost: V(3, 10, 'mode', 1.5),
  objective_contested: V(2, 15, 'mode', 1.2),
  flag_taken_ours: V(2, 8, 'mode', 1.5),
  flag_taken_theirs: V(3, 8, 'mode', 1.5),
  flag_captured: V(2, 8, 'mode', 1.5),
  flag_returned: V(1, 8, 'mode', 1.5),
  wave_incoming: V(2, 10, 'mode', 1.5),
  wave_cleared: V(1, 10, 'mode', 1.5),
  line_advanced: V(1, 12, 'mode', 1.5),
  goal_scored: V(2, 6, 'mode', 1.5),
  respawn: V(1, 10, 'flow', 1.5),
  pickup_collected: V(0, 10, 'mode', 0.8),
  // The reasoning exchange (a Chain of Thought or five hits in a row, once a battle): flavour that only starts on a
  // quiet net and gives way to any real call; the engine speaks the gunner's answer only after the commander's line
  // finished uninterrupted (audioEngine updateThink).
  think_step_by_step: Object.freeze({ ...V(0, 600, 'reasoning', 1.5), yields: true }),
  step_by_step_reply: Object.freeze({ ...V(0, 600, 'reasoning', 1.5), yields: true }),
  // Between fights (AU.04, 2026-10-13; the owner: "so its not quiet all the time"): the commander keeps the crew
  // watching in the serious register. Flavour that yields to any real call, spoken only after a long quiet on the net
  // and in the battle (audioEngine QUIET_RADIO), at most one a minute or so.
  quiet_scan: Object.freeze({ ...V(0, 50, 'quiet', 1.5, 40), yields: true }),
  quiet_hold: Object.freeze({ ...V(0, 80, 'quiet', 1.5, 40), yields: true }),
  quiet_move: Object.freeze({ ...V(0, 80, 'quiet', 1.5, 40), yields: true }),
  quiet_crew: Object.freeze({ ...V(0, 80, 'quiet', 1.5, 40), yields: true }),
  objective_push: Object.freeze({ ...V(0, 90, 'quiet', 1.5, 40), yields: true }),
  // what the damage left us, once the shooting stops (not a survival call: low_hp is that)
  hull_status: Object.freeze({ ...V(0, 150, 'quiet', 1.5, 40), yields: true }),
  // the world around us: a building coming down near us, the front's aircraft and its distant guns
  building_down: V(1, 25, 'world', 1.4, 15),
  aircraft_overhead: Object.freeze({ ...V(0, 90, 'world', 1.5, 15), yields: true }),
  artillery_far: Object.freeze({ ...V(0, 120, 'world', 1.5, 15), yields: true }),
  // we stop in cover just after a hit
  in_cover: V(1, 30, 'cover', 3.0),

  // ---- crew-lines-269: the fire command and its answers (alert, ammunition, target; identified; re-engage; cease fire)
  fire_command_kinetic: V(1, 8, 'fire_command', 0.6, 8),
  fire_command_heat: V(1, 8, 'fire_command', 0.6, 8),
  fire_command_he: V(1, 8, 'fire_command', 0.6, 8),
  fire_command_missile: V(1, 8, 'fire_command', 0.6, 8),
  identified: V(1, 6, 'fire_reply', 1.5),
  re_engage: V(2, 6, 'gun_orders', 1.0),
  cease_fire: V(1, 20, 'gun_orders', 1.5),
  // protection: our APS or ERA stopped a round, or theirs stopped ours
  aps_intercept_us: V(3, 6, 'incoming', 0.9),
  aps_intercept_them: V(2, 6, 'shot_result', 1.4, 2.5),
  era_us: V(2, 6, 'incoming', 0.8),
  enemy_era: V(2, 4, 'shot_result', 1.4, 2.5),
  // our drone's flight and the counter-drone fight
  drone_battery_low: V(2, 20, 'equipment', 1.5),
  drone_link_weak: V(2, 20, 'equipment', 1.5),
  drone_shot_down: V(2, 8, 'equipment', 1.4),
  enemy_drone_down: V(2, 6, 'shot_result', 1.4),
  drone_recovered: V(1, 8, 'equipment', 1.5),
  drone_kill: V(3, 3.5, 'shot_result', 2.0),
  // the field: enemy smoke, backing out of the line of fire, through an obstacle, off the ground
  enemy_smoke: V(1, 20, 'awareness', 1.2),
  reversing: V(1, 30, 'mobility', 0.8),
  obstacle_through: Object.freeze({ ...V(0, 45, 'mobility', 0.8), yields: true }),
  jump_brace: V(1, 15, 'mobility', 0.6),
  // the countdown's crew report: flavour that gives way to the rollout's call
  crew_report: Object.freeze({ ...V(0, 60, 'flow', 1.5), yields: true }),
  crew_ready: Object.freeze({ ...V(0, 60, 'flow_reply', 2.0), yields: true }),
  // each mode's opening call (battle_start's place at the rollout: MODE_CREW, GUNSHIP_CREW)
  start_flag: V(2, 8, 'flow', 1.4),
  start_zones: V(2, 8, 'flow', 1.4),
  start_ball: V(2, 8, 'flow', 1.4),
  start_horde: V(2, 8, 'flow', 1.4),
  start_assault: V(2, 8, 'flow', 1.4),
  start_mars: V(2, 8, 'flow', 1.4),
  start_juggernaut: V(2, 8, 'flow', 1.4),
  start_hunt: V(2, 8, 'flow', 1.4),
  start_survivors: V(2, 8, 'flow', 1.4),
  start_gun_game: V(2, 8, 'flow', 1.4),
  start_drone: V(2, 8, 'flow', 1.4),
  start_range: V(2, 8, 'flow', 1.4),
  gunship_cleared_hot: V(2, 8, 'flow', 1.4),
  // the AC-130 crew's fire control and close-air-support brevity
  gunship_rifle: V(1, 6, 'gun_cycle', 0.5),
  gunship_splash: V(1, 5, 'shot_result', 1.0, 2.5),
  gunship_good_hits: V(2, 4, 'shot_result', 1.4, 2.5),
  gunship_danger_close: V(3, 15, 'team', 1.0),
  gunship_rounds_complete: Object.freeze({ ...V(0, 60, 'gun_cycle', 1.5), yields: true }),
  gunship_shift_fire: V(1, 15, 'fire_command', 0.8, 8),
  gunship_tally: V(1, 8, 'fire_command', 0.6, 8),
  gunship_friendly_down: V(1, 12, 'team', 1.2),
  gunship_friendly_extracted: V(1, 10, 'mode', 1.5),
  // the modes' own moments; a call that follows the objective's own call on the same event is a 'mode_detail', so it
  // never replaces that call in the queue
  flag_dropped_ours: V(3, 8, 'mode', 1.5),
  flag_dropped_theirs: V(2, 8, 'mode', 1.5),
  enemy_flag_returned: V(1, 8, 'mode', 1.5),
  flag_lost: V(3, 8, 'mode', 1.5),
  objective_contesting: V(1, 20, 'mode', 1.2),
  goal_conceded: V(2, 6, 'mode', 1.5),
  ball_reset: V(1, 10, 'mode', 1.5),
  wave_runners: V(2, 10, 'mode_detail', 4.0),
  wave_swarm: V(2, 10, 'mode_detail', 4.0),
  counter_attack: V(3, 15, 'mode', 1.5),
  final_line: V(2, 30, 'mode_detail', 4.0),
  infected_turned: V(3, 10, 'mode', 1.5),
  ally_infected: V(1, 10, 'mode', 1.5),
  last_survivor: V(3, 60, 'team', 4.0),
  juggernaut_spotted: V(2, 45, 'awareness', 1.0),
  gun_game_final: V(2, 30, 'mode_detail', 4.0),
  enemy_final_weapon: V(2, 20, 'mode', 1.5),
  // a mode's own result (MODE_CREW results by the ending's reason)
  victory_survivors: V(4, 10, 'result', 8),
  victory_juggernaut: V(4, 10, 'result', 8),
  juggernaut_down: V(4, 10, 'result', 8),
  victory_assault: V(4, 10, 'result', 8),
  defeat_overrun: V(4, 10, 'result', 8),
  gunship_victory: V(4, 10, 'result', 8),
  gunship_defeat: V(4, 10, 'result', 8),
});

/** A tank crew's line and this crew's own call for it, or null where it has no such moment. */
type CrewSwap = Readonly<Record<string, string | null>>;

interface ModeCrew {
  /** The tank crew's lines this mode speaks in its own words (its opening) or not at all (team counts it respawns past). */
  readonly swap: CrewSwap;
  /** The result's own call, by the result and the ending's reason (mode_completed, battle:ended). */
  readonly results?: Readonly<Partial<Record<'victory' | 'defeat' | 'draw', Readonly<Record<string, string>>>>>;
  /** Juggernaut: what a hunter says instead (the boss is our own tank by default). */
  readonly hunter?: CrewSwap;
  /** Infected: what a crew that has turned says instead. */
  readonly turned?: CrewSwap;
}

/** A respawning mode's counts are not news: a hull that comes back six seconds later was never the last. */
const NO_TEAM_COUNTS: CrewSwap = Object.freeze({ last_tank: null, last_enemy: null, outnumbered: null });

/** Every mode's crew calls: a new mode fails typecheck until it names its own. */
export const MODE_CREW: Readonly<Record<GameModeId, ModeCrew>> = Object.freeze({
  standard: { swap: {} },
  capture_the_flag: { swap: { battle_start: 'start_flag', ...NO_TEAM_COUNTS } },
  zone_control: { swap: { battle_start: 'start_zones', ...NO_TEAM_COUNTS } },
  // a goal's kick-off revives every tank: not "back in the fight" (CrewLineContext.kickoff)
  turbo_ball: { swap: { battle_start: 'start_ball', ...NO_TEAM_COUNTS } },
  endless_horde: { swap: { battle_start: 'start_horde' }, results: { defeat: { horde_overrun: 'defeat_overrun' } } },
  frontline_assault: {
    swap: { battle_start: 'start_assault' },
    results: { victory: { line_held: 'victory_assault' }, defeat: { assault_overrun: 'defeat_overrun' } },
  },
  mars: { swap: { battle_start: 'start_mars', ...NO_TEAM_COUNTS } },
  juggernaut: {
    swap: { battle_start: 'start_juggernaut', ...NO_TEAM_COUNTS },
    hunter: { start_juggernaut: 'start_hunt' },
    results: { victory: { juggernaut_survived: 'victory_juggernaut', juggernaut_destroyed: 'juggernaut_down' } },
  },
  // a survivor who falls turns (mode_infected): the infected call is the news, not "we lost one"
  infected: {
    swap: { battle_start: 'start_survivors', last_tank: 'last_survivor', last_enemy: null, ally_destroyed: null },
    turned: { last_survivor: null, outnumbered: null },
    results: { victory: { survivors_extracted: 'victory_survivors' } },
  },
  realistic: { swap: {} },
  gun_game: { swap: { battle_start: 'start_gun_game', ...NO_TEAM_COUNTS } },
  drone: { swap: { battle_start: 'start_drone', ...NO_TEAM_COUNTS } },
  // the tank seats under the gunship speak as any tank crew; the gunship's own crew is GUNSHIP_CREW
  ac130: { swap: {} },
  // a practice range: targets in lanes, reset at will, no verdict
  proving_ground: { swap: { battle_start: 'start_range', respawn: null, ...NO_TEAM_COUNTS } },
});

/** The AC-130 crew (fire control officer, sensor operator, gunners): its own call for a tank crew's, or none. */
export const GUNSHIP_CREW: CrewSwap = Object.freeze({
  battle_start: 'gunship_cleared_hot',
  victory: 'gunship_victory',
  defeat: 'gunship_defeat',
  target_destroyed: 'gunship_kill',
  double_kill: 'gunship_double',
  penetration: 'gunship_good_hits',
  enemy_crit: 'gunship_good_hits',
  nonpen: 'gunship_splash',
  ricochet: 'gunship_splash',
  miss: 'gunship_splash',
  missile_away: 'gunship_rifle',
  ally_destroyed: 'gunship_friendly_down',
  fire_command_kinetic: 'gunship_tally',
  fire_command_heat: 'gunship_tally',
  fire_command_he: 'gunship_tally',
  fire_command_missile: 'gunship_tally',
  // an aircraft in its orbit: no driver, no hatch, no last tank, never outnumbered by what it hunts
  on_the_move: null,
  identified: null,
  re_engage: null,
  cease_fire: null,
  crew_report: null,
  crew_ready: null,
  reversing: null,
  obstacle_through: null,
  jump_brace: null,
  in_cover: null,
  last_tank: null,
  outnumbered: null,
});

export type CrewSeat = 'tank' | 'gunship';

export interface CrewLineContext {
  readonly mode: GameModeId;
  readonly seat: CrewSeat;
  /** Juggernaut: whether our tank is the boss or one of its hunters (null before the boss is known, or another mode). */
  readonly juggernaut: 'boss' | 'hunter' | null;
  /** Infected: our crew has turned. */
  readonly turned: boolean;
  /** A kick-off has just revived every tank (Turbo Ball after a goal). */
  readonly kickoff: boolean;
  /** Why the battle ended (mode_completed, battle:ended), once it has. */
  readonly endReason: string | null;
}

const RESULT_IDS: ReadonlySet<string> = new Set(['victory', 'defeat', 'draw']);

/** What this crew says for the moment `id` asks for: its own line, or null where it says nothing. */
export function resolveCrewLine(id: string, context: CrewLineContext): string | null {
  const crew = MODE_CREW[context.mode] ?? MODE_CREW.standard;
  let line: string | null = id;
  if (RESULT_IDS.has(id) && context.endReason) line = crew.results?.[id as 'victory']?.[context.endReason] ?? line;
  if (line && context.seat === 'gunship' && line in GUNSHIP_CREW) line = GUNSHIP_CREW[line];
  if (line && line in crew.swap) line = crew.swap[line];
  if (line && context.juggernaut === 'hunter' && crew.hunter && line in crew.hunter) line = crew.hunter[line];
  if (line && context.turned && crew.turned && line in crew.turned) line = crew.turned[line];
  if (line === 'respawn' && context.kickoff) line = null;
  return line;
}

/** A disciplined net: one transmission at a time with a breath between calls, two waiting at most. */
export const RADIO_DISCIPLINE = Object.freeze({ gapS: 0.8, queueMax: 2, defaultStaleS: 1.2 });
