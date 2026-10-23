/**
 * The game modes' identity: the battle and practice mode ids, their Garage/HUD/site definitions and normalizeGameMode.
 * Split from matchModes.ts (232 bundle diet): the Garage, the boot roster and the HUD read only these, so the boot graph
 * no longer carries the mode controller (bot doctrine, objectives, waves), which only a battle's simulation loads.
 * matchModes.ts re-exports every name for its other readers. No DOM, no wall clock.
 */
import { RULESET_SCORE_TARGETS } from './matchRuleset.ts';

/**
 * The battle modes: the ones a room hosts, the play menu and the Garage list, the site and the manual count. Their order
 * is the wire's and the marketing cards' order; a new battle mode is appended here.
 */
export const BATTLE_MODE_IDS = Object.freeze([
  'standard',
  'capture_the_flag',
  'zone_control',
  'turbo_ball',
  'endless_horde',
  'frontline_assault',
  'mars',
  'juggernaut',
  'infected',
  'realistic',
  'gun_game',
  'drone',
  'ac130',
] as const);

/**
 * The practice modes (v2 progression, owner 2026-10-17: "build out all the options" — the proving ground / test drive):
 * solo sessions on the same simulation with no opponent, no verdict and no record. Rooms never host them and they are
 * never listed as a battle; the Garage dossier and the Gallery launch them directly.
 */
export const PRACTICE_MODE_IDS = Object.freeze(['proving_ground'] as const);

/** Every mode the simulation plays: the battle modes, then the practice modes. */
export const GAME_MODE_IDS = Object.freeze([...BATTLE_MODE_IDS, ...PRACTICE_MODE_IDS] as const);

export type GameModeId = typeof GAME_MODE_IDS[number];
type PracticeModeId = typeof PRACTICE_MODE_IDS[number];

const PRACTICE_MODE_SET: ReadonlySet<string> = new Set(PRACTICE_MODE_IDS);
/** A practice mode: solo only, no opponent, no verdict, no record (rooms refuse it; lists leave it out). */
export function isPracticeMode(mode: unknown): mode is PracticeModeId {
  return typeof mode === 'string' && PRACTICE_MODE_SET.has(mode);
}
export type ObjectiveTeam = 'alpha' | 'bravo';

export interface GameModeDefinition {
  id: GameModeId;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  respawns: boolean;
}

export const GAME_MODE_DEFINITIONS: Readonly<Record<GameModeId, GameModeDefinition>> =
  Object.freeze({
    standard: Object.freeze({
      id: 'standard', label: 'Standard Battle', shortLabel: 'STANDARD', icon: 'modeStandard',
      description: 'Destroy the opposing team before time expires.', respawns: false,
    }),
    capture_the_flag: Object.freeze({
      id: 'capture_the_flag', label: 'Capture the Flag', shortLabel: 'CTF', icon: 'modeFlag',
      description: `Steal the enemy flag and return it home. First to ${RULESET_SCORE_TARGETS.capture_the_flag} captures wins.`,
      respawns: true,
    }),
    zone_control: Object.freeze({
      id: 'zone_control', label: 'Zone Control', shortLabel: String(RULESET_SCORE_TARGETS.zone_control), icon: 'modeZones',
      description: `Capture and hold three sectors. First team to ${RULESET_SCORE_TARGETS.zone_control} points wins.`,
      respawns: true,
    }),
    turbo_ball: Object.freeze({
      id: 'turbo_ball', label: 'Turbo Ball', shortLabel: 'TURBO', icon: 'modeTurbo',
      description: 'Super-fast armed tanks drive or shoot the ball into the enemy goal.',
      respawns: true,
    }),
    endless_horde: Object.freeze({
      id: 'endless_horde', label: 'Endless Horde', shortLabel: 'HORDE', icon: 'modeHorde',
      description: 'Survive escalating waves and hunt floating repair or ammunition caches.',
      respawns: false,
    }),
    // campaign slice 1 (2026-09-12): the front comes to the battlefield. Three
    // trench sectors along the axis to the enemy; each one taken brings the
    // next counter-attack wave and pushes the frontline atmosphere closer.
    frontline_assault: Object.freeze({
      id: 'frontline_assault', label: 'Frontline Assault', shortLabel: 'FRONT', icon: 'modeFrontline',
      description: 'Break the enemy line: take three trench sectors in turn against escalating counter-attacks, then hold the last one.',
      respawns: false,
    }),
    // Mars mode (owner 2026-09-18: "add mars map mode (called mars mode) ... give it a bunch of boosts and
    // settings"): Olympus Basin's zone objective under its own physics, with boost caches for the humans.
    mars: Object.freeze({
      id: 'mars', label: 'Gravity Mode', shortLabel: 'GRAV', icon: 'modeMars',
      description: `Olympus Basin under a galaxy sky: low gravity, long jumps, respawns and boost caches. Hold the station sectors — first team to ${RULESET_SCORE_TARGETS.mars} points wins.`,
      respawns: true,
    }),
    juggernaut: Object.freeze({ id: 'juggernaut', label: 'Juggernaut', shortLabel: 'BOSS', icon: 'modeJuggernaut',
      description: 'Become the armored boss or join the hunters. Destroy the juggernaut before time runs out.', respawns: true }),
    infected: Object.freeze({ id: 'infected', label: 'Infected', shortLabel: 'INFECT', icon: 'modeInfected',
      description: 'Survive the outbreak. Destroyed survivors return on the infected side.', respawns: true }),
    realistic: Object.freeze({ id: 'realistic', label: 'Realistic', shortLabel: 'REAL', icon: 'modeRealistic',
      // the ruleset plays normal spotting (alwaysVisible: false); 2026-10-13 the copy had said every tank stays visible
      description: 'Normal spotting. Disable modules, eliminate the crew or detonate ammunition; there is no hull-health victory.', respawns: false }),
    gun_game: Object.freeze({ id: 'gun_game', label: 'Gun Game', shortLabel: 'GUNS', icon: 'modeGunGame',
      description: 'Earn confirmed kills to advance through five weapons. Complete the final weapon to win.', respawns: true }),
    drone: Object.freeze({ id: 'drone', label: 'Drone', shortLabel: 'FPV', icon: 'modeDrone',
      description: 'Fight in your tank, launch an FPV attack drone, then pilot it into an enemy. Your parked tank stays vulnerable.', respawns: true }),
    ac130: Object.freeze({ id: 'ac130', label: 'AC-130', shortLabel: 'AC-130', icon: 'modeAc130',
      description: 'Protect vulnerable ground troops as they reach extraction. Save at least half using your autocannon, 152 mm howitzer and missiles.', respawns: false }),
    // the proving ground (v2 progression, 2026-10-17): a test drive on a measured range — target hulls at set ranges
    // and angles, every shot's outcome on the shot card, no enemies, no clock, nothing recorded
    proving_ground: Object.freeze({ id: 'proving_ground', label: 'Proving Ground', shortLabel: 'RANGE', icon: 'modeProving',
      description: 'Test drive any tank on a measured range: target hulls at set ranges and angles show every penetration outcome. No enemies, no clock, nothing recorded.', respawns: true }),
  });

const MODE_SET = new Set<string>(GAME_MODE_IDS);

export function normalizeGameMode<Value>(value: Value): GameModeId {
  const id = String(value || 'standard');
  return MODE_SET.has(id) ? id as GameModeId : 'standard';
}
