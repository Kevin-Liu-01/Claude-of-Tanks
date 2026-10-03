/**
 * Crew radio line catalog: priority, cooldown, mutual-exclusion group and
 * staleness for every line id in the national scripts
 * (tools/audio/crew-lines.json).
 *
 * Priority ladder (radio discipline): 4 = result and critical survival, may
 * cut anything below; 3 = actionable damage and decisive events, may cut
 * flavour; 2 = important reports; 1 = situational; 0 = flavour that never
 * waits in the queue.
 */

export interface VoiceLineMeta {
  readonly pri: 0 | 1 | 2 | 3 | 4;
  readonly cdS: number;
  readonly group: string;
  readonly groupCdS?: number;
  readonly staleS: number;
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
  penetration: V(1, 6, 'shot_result', 0.8, 3.5),
  nonpen: V(1, 6, 'shot_result', 0.8, 3.5),
  ricochet: V(1, 5, 'shot_result', 0.8, 3.5),
  enemy_crit: V(1, 8, 'shot_result', 0.8, 3.5),
  enemy_fire: V(2, 10, 'shot_result', 1.0, 3),
  enemy_ammo_rack: V(2, 12, 'shot_result', 1.0),
  enemy_immobilized: V(1, 10, 'shot_result', 0.9, 3),
  enemy_gun_damaged: V(1, 10, 'shot_result', 0.9, 3),
  enemy_crew_hit: V(1, 10, 'shot_result', 0.9, 3),
  enemy_engine_hit: V(1, 10, 'shot_result', 0.9, 3),
  target_destroyed: V(3, 3.5, 'shot_result', 2.0),
  double_kill: V(3, 20, 'shot_result', 2.0),
  miss: V(1, 8, 'shot_result', 0.8, 3.5),
  friendly_fire: V(2, 6, 'team', 1.0),
  // loading
  reloading: V(0, 9, 'gun_cycle', 0.45),
  reloaded: V(0, 3, 'gun_cycle', 0.45),
  load_kinetic: V(1, 2.5, 'ammo', 0.6),
  load_heat: V(1, 2.5, 'ammo', 0.6),
  load_he: V(1, 2.5, 'ammo', 0.6),
  load_missile: V(1, 2.5, 'ammo', 0.6),
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
  // team and objectives
  ally_destroyed: V(1, 12, 'team', 1.2),
  ally_kill: V(1, 10, 'team', 1.2),
  last_tank: V(3, 60, 'team', 2.0),
  last_enemy: V(3, 60, 'team', 2.0),
  outnumbered: V(2, 60, 'team', 1.5),
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
});

/** One radio net: a dead-air gap between transmissions and a short queue. */
/** A disciplined net: one transmission at a time with a breath between calls, two waiting at most. */
export const RADIO_DISCIPLINE = Object.freeze({ gapS: 0.8, queueMax: 2, defaultStaleS: 1.2 });
