import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
/**
 * Multiplayer v2 wire vocabulary, limits and quantization.
 *
 * Every number here is part of the client/server contract documented in
 * README.md. Bump WIRE_VERSION when a layout changes; bump PROTOCOL_VERSION
 * when the handshake or the semantics of a message change.
 */

// Vehicle controls widen action words and add auxiliary state plus smoke envelopes.
// 4 (destruction, 2026-10-07): snapshots carry the destruction log (SNAPSHOT_FLAGS.HAS_DESTRUCTION, destructionLog.ts)
// and the event kinds gain structure_stage, structure_breach and terrain_crater.
export const WIRE_VERSION = 4;
/**
 * 2 (P3b, 2026-09-29): entity rows carry the authority tick they were captured at (`EntityRow.tick`, ROW_GROUP.AGE on the
 * wire when it predates the packet) so the host's interest tiers may hold a far entity's row across snapshots and the
 * client interpolates it at its own cadence; the client sends RESUME_HINT after a migration. The frame layout is
 * otherwise unchanged (WIRE_VERSION stays 1: the handshake is where a mismatch is caught, cleanly, as PROTOCOL_VERSION).
 */
// 4: complete module health uses a 32-bit word (wire layout 3).
export const PROTOCOL_VERSION = 6; // aerial supply actions and expanded mode checkpoints

export const TICK_HZ = 60;
/**
 * The near tier's snapshot rate (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9): 20 Hz, as §13.3 designed — the 14v14
 * soak at 30 Hz stayed over the host's 4 Mbit/s line with the interest tiers (4,201 kbit/s median) and at 20 Hz landed
 * at 3,114 with the same desync and migration figures; the interpolation delay (two intervals) is the one measurable
 * cost. A host may name another divisor of TICK_HZ in its WELCOME; the client adopts it.
 */
export const SNAPSHOT_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

export const MAX_ENTITIES = 64;
export const MAX_SHELLS = 256;
export const MAX_SEATS = 64;
export const MAX_CONTROLS_PER_INPUT = 3;
export const MAX_EVENTS_PER_MESSAGE = 64;
export const MAX_DESTROYED_PER_SNAPSHOT = 4096;
export const MAX_ERA_PER_ROW = 4096;
export const MAX_MOVEMENT_VALUES = 64;

/** Byte bounds: the decoder rejects anything larger before allocating. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;
export const MAX_ID_BYTES = 64;
export const MAX_NAME_BYTES = 96;
export const MAX_TOKEN_BYTES = 1024;
export const MAX_BUILD_BYTES = 64;
export const MAX_DETAIL_BYTES = 240;
export const MAX_CHAT_CHARS = 240;
export const MAX_CHAT_BYTES = MAX_CHAT_CHARS * 4;
export const MAX_EVENT_JSON_BYTES = 4096;
export const MAX_RULESET_JSON_BYTES = 4096;
export const MAX_MODE_STATE_JSON_BYTES = 8192;
export const MAX_REASON_BYTES = 64;

/** Entity ids are 1..MAX_ENTITIES; 0 means "no entity" (a spectator viewer). */
export const NO_ENTITY = 0;
/** Seat ids are 0..MAX_SEATS-1; 255 means "no seat" (a bot). */
export const NO_SEAT = 255;
/** Tick sentinel for "none" in u32 tick fields. */
export const NO_TICK = 0xffffffff;

export const MESSAGE_TYPE = Object.freeze({
  // client -> server
  HELLO: 1,
  INPUT: 2,
  SNAPSHOT_ACK: 3,
  PING: 4,
  CHAT: 5,
  LEAVE: 6,
  /** After a host migration: the viewer's own newest authority row from the old host (P3b; the actor bounds it). */
  RESUME_HINT: 7,
  // server -> client
  WELCOME: 16,
  SNAPSHOT: 17,
  EVENT: 18,
  PONG: 19,
  CLOSE: 20,
  ERROR: 21,
} as const);

/** Finite reasons for CLOSE, ERROR and LEAVE. */
export const CLOSE_REASON = Object.freeze({
  NONE: 0,
  PROTOCOL_VERSION: 1,
  BAD_TOKEN: 2,
  TOKEN_EXPIRED: 3,
  SEAT_TAKEN: 4,
  ROOM_UNKNOWN: 5,
  ROOM_CLOSED: 6,
  MALFORMED: 7,
  RATE_LIMITED: 8,
  BACKPRESSURE: 9,
  HELLO_REQUIRED: 10,
  INPUT_TOO_FAR_AHEAD: 11,
  UNEXPECTED_MESSAGE: 12,
  SERVER_DRAIN: 13,
  CLIENT_LEAVE: 14,
  REPLACED: 15,
  IDLE_TIMEOUT: 16,
  ORIGIN_FORBIDDEN: 17,
  PAYLOAD_TOO_LARGE: 18,
  MATCH_ENDED: 19,
  INTERNAL_ERROR: 20,
  CHAT_REJECTED: 21,
  NOT_SEATED: 22,
  CAPACITY: 23,
} as const);
export type CloseReasonId = typeof CLOSE_REASON[keyof typeof CLOSE_REASON];
export const CLOSE_REASON_NAMES: readonly string[] = Object.freeze(
  Object.entries(CLOSE_REASON).sort((a, b) => a[1] - b[1]).map(([name]) => name.toLowerCase()),
);

export const TEAM = Object.freeze({ ALPHA: 0, BRAVO: 1, SPECTATOR: 2 } as const);
export type TeamId = typeof TEAM[keyof typeof TEAM];
export const TEAM_NAMES = Object.freeze(['alpha', 'bravo', 'spectator'] as const);

export const PHASE = Object.freeze({ LOADING: 0, COUNTDOWN: 1, PLAYING: 2, ENDED: 3 } as const);
export type PhaseId = typeof PHASE[keyof typeof PHASE];

export const VERDICT = Object.freeze({ NONE: 0, ALPHA: 1, BRAVO: 2, DRAW: 3 } as const);
export type VerdictId = typeof VERDICT[keyof typeof VERDICT];

export const HELLO_CAPABILITY = Object.freeze({
  /** The client presents immediate own-shot feedback (v1 shotFeedbackVersion 1). */
  SHOT_FEEDBACK: 1 << 0,
} as const);

/** Reload channel phases, two bits each in the status word. */
export const RELOAD_KIND = Object.freeze({ READY: 0, SHELL: 1, INTRA_CLIP: 2, MAGAZINE: 3 } as const);
export const RELOAD_KIND_NAMES = Object.freeze(['ready', 'shell', 'intraClip', 'magazine'] as const);

/** Nine presentation flags, identical values to v1's SNAPSHOT_FLAGS. */
export const ENTITY_FLAGS = Object.freeze({
  DESTROYED: 1 << 0,
  BURNING: 1 << 1,
  FIRING: 1 << 2,
  SPOTTED: 1 << 3,
  SPECIAL_ACTIVE: 1 << 4,
  SPECIAL_PENDING: 1 << 5,
  AIRBORNE: 1 << 6,
  OVERTURNED: 1 << 7,
  AUTO_RIGHTING: 1 << 8,
} as const);
export const ENTITY_FLAG_BITS = 9;

/** Per-tick control flags. */
export const CONTROL_FLAGS = Object.freeze({
  FIRE_HELD: 1 << 0,
  BRAKE: 1 << 1,
  AIM_LOCKED: 1 << 2,
} as const);

/** Edge-triggered actions (identical to v1 PLAYER_ACTION_BITS). */
/** The simulation's action bits (src/sim/playerActions.ts): one table for the solo step and the wire. */
export const ACTION_BITS = PLAYER_ACTION_BITS;
export const ACTION_BIT_MASK = 0x1fff; // thirteen action bits, including FPV launch/return

/** Shell types the fleet authors; unknown types encode as OTHER. */
export const SHELL_TYPE_NAMES = Object.freeze(['AP', 'APCR', 'APFSDS', 'HEAT', 'HE', 'DRONE'] as const);
export const SHELL_TYPE_OTHER = 255;
export const SHELL_FLAGS = Object.freeze({ GUIDED: 1 << 0 } as const);

/** Snapshot header flags. */
export const SNAPSHOT_FLAGS = Object.freeze({
  KEYFRAME: 1 << 0,
  HAS_VIEWER: 1 << 1,
  HAS_MODE_STATE: 1 << 2,
  HAS_VERDICT: 1 << 3,
  /** The packet carries destruction log entries (docs/DESTRUCTION.md §8.2). */
  HAS_DESTRUCTION: 1 << 4,
} as const);

/** Entity row groups (a varint mask, low bits are the motion groups that change every interval). */
export const ROW_GROUP = Object.freeze({
  POS_ABS: 1 << 0,     // 3 x i32 mm
  POS_REL: 1 << 1,     // 3 x i16 mm, relative to the baseline row
  VEL: 1 << 2,         // i16 speed cm/s along yaw, i16 vertical speed cm/s
  YAW: 1 << 3,         // u16 turn
  TILT_ABS: 1 << 4,    // pitch, roll u16 turns
  TILT_REL: 1 << 5,    // pitch, roll i8 turn deltas
  TURRET: 1 << 6,      // turretYaw, gunPitch u16 turns
  HP: 1 << 7,          // u16
  MAX_HP: 1 << 8,      // u16
  RELOAD: 1 << 9,      // remaining, total u16 (2 ms units)
  GUN_RELOAD: 1 << 10, // remaining, total u16 (2 ms units)
  MAGAZINE: 1 << 11,   // rounds u8, capacity u8
  AMMO: 1 << 12,       // 3 x varint
  STATUS: 1 << 13,     // u16 status word (kinds, slot, mirror bit, flags)
  ERA_ADD: 1 << 14,    // varint count + gap-coded plate indices added to the baseline set
  ERA_RESET: 1 << 15,  // varint count + gap-coded plate indices replacing the set
  /**
   * varint age = packet tick − the tick the row was captured at (P3b interest tiers, 2026-09-29): present only when
   * the row predates its packet (a keyframe carrying a held row, or a delta whose row was refreshed before this packet);
   * a patched row without it was captured at the packet's tick. A row a delta leaves untouched keeps its baseline tick.
   */
  AGE: 1 << 16,
  AUXILIARY: 1 << 17,
} as const);
/** The widest row mask the decoder admits (18 groups). */
export const ROW_GROUP_MASK_MAX = (1 << 18) - 1;

/** Status word layout. */
export const STATUS_RELOAD_KIND_SHIFT = 0;
export const STATUS_GUN_RELOAD_KIND_SHIFT = 2;
export const STATUS_SHELL_SLOT_SHIFT = 4;
export const STATUS_GUN_RELOAD_MIRRORS = 1 << 6;
export const STATUS_FLAGS_SHIFT = 7;

/** Quantization: integers on the wire, SI units in the simulation. */
export const POSITION_SCALE = 1000;          // mm
export const VELOCITY_SCALE = 100;           // cm/s (tanks)
export const SHELL_VELOCITY_SCALE = 10;      // dm/s (shells fly at up to 1800 m/s)
export const ANGLE_TURN_UNITS = 65536;       // u16 turns
export const AIM_PITCH_UNITS = 32767;        // i16 over +-pi/2
export const AIM_DISTANCE_SCALE = 20;        // 5 cm units, u16 (max 3276 m)
export const RELOAD_MS_UNITS = 2;            // u16 in 2 ms steps (max 131 s)
export const MULTIPLIER_SCALE = 1000;        // u16, max 65.535
export const CONTROL_AXIS_SCALE = 127;       // i8 throttle / steer
export const MAX_POS_REL_MM = 32767;
export const MAX_TILT_REL_UNITS = 127;
export const INPUT_MARGIN_UNKNOWN = 127;

/** Module and crew order of the viewer prediction section. */
export const VIEWER_MODULES = Object.freeze(['engine', 'transmission', 'trackL', 'trackR', 'turretRing', 'gunMount', 'gun', 'missileRack', 'feedSystem', 'roofGun', 'autoloader', 'ammoRack', 'fuelTank', 'radio', 'optics'] as const);
export const VIEWER_CREW = Object.freeze(['driver', 'gunner'] as const);
export const VIEWER_EQUIPMENT = Object.freeze(['traverse', 'turret', 'aimTime', 'bloom'] as const);
export const MODULE_STATE_NAMES = Object.freeze(['ok', 'yellow', 'red'] as const);

/** Known event kinds; 255 carries the type name inline. */
export const EVENT_KIND_NAMES = Object.freeze([
  'shell_fired', 'shell_hit', 'shell_impact', 'tank_destroyed', 'tank_ram', 'tank_fire',
  'tank_spotted', 'module_state', 'world_prop_destroyed', 'match_countdown', 'match_started',
  'match_ended', 'ammo_empty', 'ammo_depleted', 'ammo_selection_denied', 'consumable_used',
  'consumable_denied', 'magazine_reload', 'magazine_reload_denied', 'special_action',
  'special_action_denied', 'tank_self_right', 'tank_autoflip',
  // v2 server-originated
  'chat', 'roster', 'admin',
  // destruction (2026-10-07, wire 4): world state every viewer receives (docs/DESTRUCTION.md §8.1)
  'structure_stage', 'structure_breach', 'terrain_crater',
] as const);
export const EVENT_KIND_OTHER = 255;
