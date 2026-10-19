// Match rulesets (owner 2026-09-14 evening: "make the mechanics actually apply and change what the
// player has available, or change physics or gravity or more"). A ruleset is the complete, pure
// description of how one game mode bends the simulation: gravity, speed, hit points, damage,
// reload, the ammunition and equipment a crew may carry, consumables, respawns, the clock and the
// solo roster split. It is derived deterministically from the mode (and a campaign operation's
// difficulty), so the browser sim, the network authority and the receipts all compute the same
// rules without a wire change. Everything that reads a rule reads it from here — the mode
// controller, setupBattle, movement (gravity, speed), ballistics (shell gravity), damage (hit
// points lost), ammunition and equipment at spawn, and the play-menu rule cards.
import type { GameModeId } from './matchModes.ts';
import { shell } from './shellSpec.ts';
import type { DestructionRules } from './destructionEvents.ts';

/** Mode weapons are fictional gameplay loadouts; they never mutate the fleet catalog. */
export const GUN_GAME_WEAPONS = Object.freeze([
  shell('30 mm Autocannon', 'AP', 30, 210, 165, 120, 1150, { reloadS: .18 }),
  shell('105 mm Cannon', 'APFSDS', 105, 570, 520, 440, 1450, { reloadS: 3.5 }),
  shell('120 mm Cannon', 'APFSDS', 120, 800, 750, 650, 1700, { reloadS: 4 }),
  shell('152 mm Howitzer', 'HE', 152, 100, 100, 1250, 650, { reloadS: 5 }),
  shell('Guided Missile', 'HEAT', 152, 1100, 1100, 1000, 350, { guided: true, reloadS: 5 }),
]);
export const AERIAL_RULES = Object.freeze({
  // `cooldownS` follows an airframe lost or spent (an impact, the battery, the link's range); a recall has its own below.
  // hitsToDown (VH.15 counter-drone): the strikes a drone's airframe takes before it falls (the roof stations' rounds
  // land shares of a strike by range: vehicles/auxiliaryWeapons.ts droneHitAt100). 1.1, not 1 (owner 2026-10-16 on the
  // 226 preview: "machine guns targeting drones is a lil too punishinng"): one capped 12.7 burst (5 x .2 = 1.0) or 30 mm
  // burst (3 x .35 = 1.05) no longer downs a drone alone, a 7.62's (8 x .15 = 1.2) still does, and shares from several
  // stations still add, so a lone gun downs a quarter to a third fewer drones and two or three stations nearly as many.
  // Kept clear of every exact burst sum.
  drone: Object.freeze({ launchS: 2.4, responseHz: 4.5, spotRangeM: 350, speedMps: 42, turnRadS: 2.8, climbMps: 20, batteryS: 40, cooldownS: 25, rangeM: 850, launchHeightM: 12, hitsToDown: 1.1,
    /**
     * The recall (owner 2026-10-14: "dont be able to instantly call it back, only be able to call back once weve entered
     * screen, and if we do, show the landing animation and we should be able to launch it again after a shorter
     * cooldown"). Both authorities (the solo step and the network authority) time it in sim/droneRecall.ts: a recall is
     * accepted only once the pilot is in the drone's own feed (the launch climb, then the lens hand-over `feedS` that
     * engine/aerialCamera.ts eases the chase view into the lens over); the recalled airframe flies home and lands on its
     * dock (the presentation draws it on this same timing law), and the next launch is ready `cooldownS` after it is parked.
     */
    recall: Object.freeze({
      feedS: .55,
      /** The flight home: the horizontal distance over `transitS` at a ground speed inside [minMps, maxMps], climbing or
       *  sinking to `cruiseAboveDockM` over the dock at `climbMps` / `sinkMps`; each leg flies faster where that pace would
       *  not cover it inside `maxTransitS`, so a recall from the link's edge, high above or far below the tank is home
       *  as quickly (verifier 2026-10-14: an unbounded climb or sink made a recall from 835 m up wait 81 s). */
      transitS: 5, minMps: 20, maxMps: 60, climbMps: 8, sinkMps: 12, cruiseAboveDockM: 15, maxTransitS: 7,
      /** The flight home's fixed beats: the hold for an impact in flight, the approach to the dock's column and its descent
       *  (4.1 s since round 5's descent keeps at least the landing's hand-over speed down the column: a recall from over the
       *  dock at cruise height is at the landing's first pose 1.4 s inside it, fx/droneRecallReturn.selftest.mjs). */
      approachS: 4.1,
      /** The landing on the dock: the descent onto the pads, the rotor spin-down and the pause before the clamps close
       *  (fx/droneArrival.ts descentS + spoolS + pauseS = 4.85 s, drawn to the frame, fits inside). */
      landingS: 4.9,
      /** The relaunch wait after a recalled airframe is parked on its dock (`cooldownS` above follows a loss). From
       *  anywhere, a recall relaunches within maxTransitS + approachS + landingS + cooldownS = 19.8 s of the press,
       *  over 5 s sooner than the 25 s after a loss (sim/droneRecall.selftest.mjs sweeps the reachable envelope). */
      cooldownS: 3.8,
    }),
  }),
  gunship: Object.freeze({ altitudeM: 240, radiusM: 90, orbitRadS: .09 }),
});
export const GUNSHIP_WEAPONS = Object.freeze([
  shell('30 mm Autocannon', 'AP', 30, 220, 180, 160, 1300, { reloadS: .14, reloadGroup: 'gunship-cannon', soundProfile: 'gunship-autocannon' }),
  shell('152 mm Howitzer', 'HE', 152, 110, 110, 1500, 800, { reloadS: 3.5, reloadGroup: 'gunship-howitzer', blastRadiusM: 22, soundProfile: 'gunship-howitzer' }),
  shell('Guided Missile', 'HE', 180, 320, 320, 1600, 400, { guided: true, reloadS: 7, reloadGroup: 'gunship-missile', blastRadiusM: 18, soundProfile: 'gunship-missile' }),
]);
// Fictional single-charge anti-armor payload: uses the same ERA, spaced armor
// and penetration rules as other shaped charges, rather than an artillery blast.
export const DRONE_WARHEAD = shell('FPV shaped charge', 'HEAT', 90, 350, 350, 1400, 42, { tracer: 'DRONE', gravityScale: 0, maxLifetimeS: AERIAL_RULES.drone.batteryS });

type RulesetAmmo = 'spec' | 'he_only' | 'unlimited';
type RulesetTimeout = 'draw' | 'defeat';

/**
 * Bot doctrine (gameplay-modes-228; owner 2026-10-18: "up its aggression of tanks more" in Frontline Assault, "increase
 * aggression" in Endless Horde, "increase aggression of bots trying to capturing flag or pursuing ball", "infected should
 * be super aggressie"): how a bot plays its SIDE of a mode. Every knob multiplies or gates one site of the shared
 * controller (game/ai.ts); CLASSIC_BOT_DOCTRINE is today's controller exactly, so a mode without a table of its own plays
 * byte-identical (server/battlePacing, the harness's standard and juggernaut rows). A doctrine is keyed by side only,
 * never by nation: the TEAM NATIONS option decides which vehicles fill the seats, not how they drive.
 */
type BotHitReactions = 'all' | 'angle' | 'none';
export interface BotDoctrine {
  /** The opening read phase (game/ai.ts DEPLOYMENT_TUNING): long contacts are left alone for the first 2-2.75 min. */
  readonly openingRead: boolean;
  /** Multiplies the role's hold band (0 = no stand-off band at all). */
  readonly holdBandScale: number;
  /** Multiplies the role's engage envelope. */
  readonly engageRangeScale: number;
  /** Multiplies the cover discipline (reload cover, hull-down searches; 0 = never duck). */
  readonly coverScale: number;
  /** Multiplies the low-hull fallback's thresholds and divides the burst rule's (0 = never fall back). */
  readonly fallbackScale: number;
  /** Hit reactions: every one, only the hull turn onto the shot, or none (keep coming). */
  readonly hitReactions: BotHitReactions;
  /** A scout kites away from close contacts. */
  readonly scoutKite: boolean;
  /** Shoot-and-scoot relocations after a shot. */
  readonly scoot: boolean;
  /** The lone-spearhead guard (a hull out in front alone holds outside the fight). */
  readonly spearheadGuard: boolean;
  /** Low-odds lays at a bot are held to save rounds. Today's gate is ammunition-blind, so CLASSIC keeps it on. */
  readonly conserveRounds: boolean;
  /** Seconds of a silent gun with a live contact before the stalemate push (the contact push; 12 s classic). */
  readonly stalemateSilentS: number;
  /** Throttle of a route (and a mission) after the opening minute. */
  readonly missionSpeed: number;
  /** A mission bot breaks off its mission for the fallback under this hull fraction (0 = never). */
  readonly missionBreakOffHp: number;
  /** A zone holder leaves its zone for a SPOTTED enemy this far outside its edge, then returns (0 = holds). */
  readonly zoneSortieM: number;
  /** The hunt: drive at the target and orbit it at point blank with the gun laid; never stop in a band, never ram. */
  readonly rush: boolean;
  /** The Turbo Ball striker's jump at the ball (game/botAbilities.ts). */
  readonly offensiveJump: boolean;
  /** The no-contact search and the scout's kite scan read live enemy positions, or only what the team has spotted. */
  readonly searchRouting: 'live' | 'spotted';
  /** The mode route push (both builders): seconds between pushes and the move that re-routes a bot. */
  readonly routeRefreshS: number;
  readonly routeMoveM: number;
  /** Targets are claimed only this close (null: any spotted target in sight); a rusher's hunt brings it closer. */
  readonly claimRangeM: number | null;
}
/** Today's controller, knob for knob. */
export const CLASSIC_BOT_DOCTRINE: BotDoctrine = Object.freeze({
  openingRead: true, holdBandScale: 1, engageRangeScale: 1, coverScale: 1, fallbackScale: 1, hitReactions: 'all',
  scoutKite: true, scoot: true, spearheadGuard: true, conserveRounds: true, stalemateSilentS: 12, missionSpeed: 0.85,
  missionBreakOffHp: 0.25, zoneSortieM: 0, rush: false, offensiveJump: false, searchRouting: 'live',
  routeRefreshS: 3, routeMoveM: 12, claimRangeM: null,
});
type BotDoctrineOverrides = { readonly alpha?: Partial<BotDoctrine>; readonly bravo?: Partial<BotDoctrine> };
/** The Horde's zombies (and, with the hull turn, the infected): charge, fire on the move, never duck, never retreat. */
const RUSH_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, rush: true, holdBandScale: 0, coverScale: 0, fallbackScale: 0, hitReactions: 'none', scoutKite: false,
  scoot: false, spearheadGuard: false, conserveRounds: false, stalemateSilentS: 4, missionSpeed: 1, missionBreakOffHp: 0,
  searchRouting: 'spotted', routeRefreshS: 1.25, routeMoveM: 8, claimRangeM: 60,
});
/**
 * The hunt's drive (mission 'hunt' with `rush`): straight at a visible target inside `directM`, an orbit at
 * [orbitMinM, orbitMaxM] once inside `orbitInM` with the turret laid, and never a ram: inside `noRamM` and closing it
 * steers to the tangent (a ram costs the fodder hull more than the survivor's).
 */
export const RUSH_DRIVE = Object.freeze({ directM: 70, orbitInM: 35, orbitMinM: 25, orbitMaxM: 35, noRamM: 12 });
/** A zone holder's sortie (`zoneSortieM`): it drives at the spotted attacker and stops `standoffM` short (a sortie, never a ram). */
export const SORTIE_DRIVE = Object.freeze({ standoffM: 35 });
/** The Turbo Ball striker's offensive jump (`offensiveJump`): the ball within [minM, rangeM] ahead, inside coneRad of the bow. */
export const STRIKER_JUMP = Object.freeze({ rangeM: 25, minM: 4, coneRad: 0.35 });
/**
 * The honest hunt (matchModes.ts): the nearest opponent the hunting team spots, else its freshest sighting within
 * `lastSeenMaxS`, else a seeded sweep over the opponents' side. Hunters are assigned once a second in id order at the
 * cost of distance + `crowdPenaltyM` per hunter already on that target beyond its fair share; until `laneUntilM` each
 * takes a lateral lane `laneMinM`-`laneMaxM` off the line, `flankShare` of them on flank arcs of ±`flankDeg`.
 */
export const HUNT_RULES = Object.freeze({
  lastSeenMaxS: 45, assignEveryS: 1, crowdPenaltyM: 60, laneMinM: 15, laneMaxM: 45, laneUntilM: 90, flankShare: 0.4,
  flankDeg: 50, sweepRingM: 140,
});

interface AssaultRules {
  /** Defenders fielded on the first sector; each further sector adds one. */
  readonly initialActive: number;
  /** Extra defenders per sector from the operation's difficulty. */
  readonly extraDefenders: number;
  /** Hit-point scale added per sector taken, up to the last sector. */
  readonly hpPerLine: number;
  /**
   * Hit-point scale of the last sector's counter-attack, in place of 1 + sectors taken × hpPerLine (1.32 on the third
   * sector). Modes lane, 2026-10-08 (owner decision: the attackers should win 40–55 % of bot tests): the attack took
   * the first two sectors every time and lost most matches at the third, where five fresh defenders at 1.32× met the
   * four survivors; 1.15× is the decision's first knob.
   */
  readonly finalLineHp: number;
  /** Hit-point scale added by the operation's difficulty (applies to every defender). */
  readonly difficultyHp: number;
  /** Seconds the last sector must be held. */
  readonly holdS: number;
  /**
   * A sector's defenders stand on its line from the start (gameplay-modes-228: sector 1 fell in 24 s with no shot fired,
   * its three defenders still driving from the bravo base 800 m back): placed `lineBandM` behind its centre facing the
   * attack, and the reinforcements for the next sector form on that sector's line.
   */
  readonly defendersStartOnLine: boolean;
  readonly lineBandM: readonly [number, number];
  /** `squad` fresh defenders drive at the sector just taken `afterCaptureS` after it falls, for `forS`, then fall back. */
  readonly counterAttack: { readonly squad: number; readonly afterCaptureS: number; readonly forS: number } | null;
  /** While a sector is contested and its line is short, one defender arrives from the rear this often, up to count + `reinforceExtra`. */
  readonly reinforceTrickleS: number;
  readonly reinforceExtra: number;
  /** The rear the trickle arrives from: this far behind the line. */
  readonly reinforceRearM: number;
  /**
   * The regroup before the last sector (bots lane 2026-10-03): the attackers hold the sector they just took until every
   * bot stands within `regroupRadiusM` of it, for at most `regroupMaxS`; a human within `regroupHumanM` of the last
   * sector leads them on.
   */
  readonly regroupMaxS: number;
  readonly regroupRadiusM: number;
  readonly regroupHumanM: number;
  /** Destroyed allied BOTS revive behind the last sector taken after this long (null: only when a sector falls). */
  readonly allyReviveS: number | null;
  /**
   * The defenders' bots play this many difficulty tiers below the battle's (the Horde's `hostileDifficultyStep`): the
   * defence's pressure is its numbers, its line and its doctrine, not a sharper aim (gameplay-modes-228).
   */
  readonly hostileDifficultyStep: number;
}

/**
 * Endless Horde wave law (owner 2026-09-15: "the horde is not endless, there's only 3 tanks every time"). Zombies
 * (owner 2026-10-17: "all the zombies actually have low hp"): the ruleset's `hpScale` is the humans' hull; the hostiles
 * arrive as fodder at `hostileHpScale` of their own hull (about one main-gun round), so the pressure is their numbers.
 */
/**
 * Where a hostile arrives (gameplay-modes-228; a game-director decision of the authority, never bot knowledge and
 * never sent to a client): on a ring `spawnRingM` round the living humans' centroid, in `spawnSectors` sectors
 * `sectorWidthDeg` wide centred on the bearing to the hostile base and ±`sectorSpreadDeg` (rotated per arrival), never
 * within `spawnMinHumanM` of a human or (spawnOutOfSight) in the terrain sight of one within `sightRangeM` (a
 * height-field march every `sightStepM` from `sightEyeM` up to the hull `sightHullM` up; a crest hides it only by
 * `sightMarginM`), out of `spawnCandidates` seeded candidates; else at the hostile base.
 */
export interface ArrivalRules {
  readonly spawnRingM: readonly [number, number];
  readonly spawnSectors: number;
  readonly sectorWidthDeg: number;
  readonly sectorSpreadDeg: number;
  readonly spawnMinHumanM: number;
  readonly spawnOutOfSight: boolean;
  readonly sightRangeM: number;
  readonly sightStepM: number;
  readonly sightEyeM: number;
  readonly sightHullM: number;
  readonly sightMarginM: number;
  readonly spawnCandidates: number;
}

interface HordeRules extends ArrivalRules {
  /**
   * The wave total (gameplay-modes-228; owner 2026-10-18: "more enemies per round"): round(waveSize + waveStep·(w−1) +
   * waveCurve·(w−1)²) hostiles a wave — 6, 9, 13, 18, 24, 30, 37, 44, 52, 61 … rising every round with no cap — times
   * (1 + perHumanTotal per extra human). The total is not what stands on the field at once (maxAlive is): the rest
   * queue and trickle in as the field thins.
   */
  readonly waveSize: number;
  readonly waveStep: number;
  readonly waveCurve: number;
  readonly perHumanTotal: number;
  /** Hostiles alive at once: maxAlive + maxAlivePerHuman per extra human, never over maxAliveCap or the pool. */
  readonly maxAlive: number;
  readonly maxAlivePerHuman: number;
  readonly maxAliveCap: number;
  /** While some of the wave is queued and the field is below maxAlive, one rested pool identity arrives this often… */
  readonly trickleS: number;
  /** …a wreck's identity only once it has lain this long (it never vanishes under the gun that killed it). */
  readonly recycleAfterS: number;
  /**
   * A hostile on the field that has come no `strandedGainM` closer to any human for `strandedS` while farther than
   * `strandedContactM` from all of them (cut off by the ground, wedged) is benched and queued again: it re-arrives on the
   * ring, so a round never stalls on hostiles that cannot reach the fight (Redrock seed 2 sat 740 s on seven).
   */
  readonly strandedS: number;
  readonly strandedGainM: number;
  readonly strandedContactM: number;
  /** The lull between waves (a clear, readable break; was a 6 s literal plus 0-49 s of travel). */
  readonly intermissionS: number;
  /** Share of maximum hull repaired on every surviving human when a wave is cleared. */
  readonly waveRepair: number;
  /** A hostile's hull on the first wave, as a multiple of its vehicle's own hull (not of the humans' `hpScale`). */
  readonly hostileHpScale: number;
  /** Hull a hostile gains every wave after the first through wave lateFromWave − 1, as a share of its first-wave hull… */
  readonly hpPerWave: number;
  /** …and every wave from `lateFromWave` on (the curve that ends every run while a hostile stays fodder). */
  readonly hpPerWaveLate: number;
  readonly lateFromWave: number;
  /** Every `runnerEvery`-th wave is a RUNNER wave: `runnerSpeed` × speed, light hulls first. */
  readonly runnerEvery: number;
  readonly runnerSpeed: number;
  /** Every `swarmEvery`-th wave is a SWARM wave: `swarmTotalScale` × the total at `swarmHull` of their own hull. */
  readonly swarmEvery: number;
  readonly swarmTotalScale: number;
  readonly swarmHull: number;
  /** How the hunt routes: on what the hunting team spots ('spotted') — never on a hidden human's live position. */
  readonly hunt: 'spotted' | 'live';
  /** Allied bots hunt spotted hostiles only within this of the humans' centroid; beyond it they rejoin the humans. */
  readonly allyLeashM: number;
  /** Speed a hostile (and a Frontline defender) gains every wave after the first, up to `speedPerWaveMax`. */
  readonly speedPerWave: number;
  readonly speedPerWaveMax: number;
  /** Share of the caches that repair rather than rearm: `first` on wave one, `perWave` less each wave, never under `floor`. */
  readonly cacheHeal: { readonly first: number; readonly perWave: number; readonly floor: number };
  /** Difficulty tiers the hostiles' bots play below the battle's (0 = the same; never under the easiest). */
  readonly hostileDifficultyStep: number;
  /**
   * Multiplies a hostile's reload (gameplay-modes-228): the zombies charge to point blank now, so a wave's pressure is
   * its numbers and its speed, not a full tank gun's rate of fire from every one of them (the 10-17 ask: no
   * steamroll). The humans' own hull, rounds and reload are never touched.
   */
  readonly hostileReloadScale: number;
}

/** Frontline attackers (gameplay-modes-228): the push into a sector, its anti-suicide gate and the flank lanes. */
interface AssaultBotRules {
  /** An attacker that has held the zone edge this long without capture progress drives into the centre… */
  readonly pushAfterS: number;
  /** …and a push waits until `pushMinGroup` other attackers stand within `pushGroupM` of it, or pushAfterS passes. */
  readonly pushMinGroup: number;
  readonly pushGroupM: number;
  /** Where the edge is: this far outside the zone's radius, on the attack's side. */
  readonly stageM: number;
  /** `flankShare` of the attackers approach on lanes `flankOffsetM` off the axis, converging in the last `flankConvergeM`. */
  readonly flankShare: number;
  readonly flankOffsetM: number;
  readonly flankConvergeM: number;
}
/** Capture the Flag bots (gameplay-modes-228: "increase aggression of bots trying to capturing flag"). */
interface FlagBotRules {
  /** Share of the squad (at least `recoverMin`) that recovers the own flag while it is away… */
  readonly recoverShare: number;
  readonly recoverMin: number;
  /** …or every bot that is neither the carrier nor an escort (a capture needs the own flag home). */
  readonly huntWhenHomeFlagTaken: boolean;
  /** Escorts of the own carrier, `escortAheadM` ahead of it on its route home at ±`escortSideM`. */
  readonly escorts: number;
  readonly escortAheadM: number;
  readonly escortSideM: number;
  /** Share of a squad of `defendMinSquad` or more that guards home while no flag is carried. */
  readonly defendShare: number;
  readonly defendMinSquad: number;
  /** Recoverers aim at the enemy carrier's point this far ahead along its line home (the flag marker is public). */
  readonly interceptLeadS: number;
}
/** Turbo Ball bots (gameplay-modes-228: "pursuing ball"). */
interface BallBotRules {
  /** Strikers per team: the chaser and a support striker `supportBackM` behind it and `supportSideM` to the side. */
  readonly strikers: number;
  readonly supportBackM: number;
  readonly supportSideM: number;
  /** A striker keeps its job this long unless a teammate is `swapM` closer to the ball. */
  readonly strikerHoldS: number;
  readonly swapM: number;
  /** The intercept: the ball's point t ahead (its drag law), t its ETA iterated `leadIterations` times, at most `leadMaxS`. */
  readonly leadMaxS: number;
  readonly leadIterations: number;
  /** Screens `screenNear` / `screenFar` of the way from the own goal to the ball, `screenSideM` off the line. */
  readonly screens: number;
  readonly screenNear: number;
  readonly screenFar: number;
  readonly screenSideM: number;
  /** Keepers `keeperM` out from the own goal. */
  readonly keepers: number;
  readonly keeperM: number;
  /** At most `crowdCap` bots of a team within `crowdM` of the ball; the rest hold their lanes. */
  readonly crowdCap: number;
  readonly crowdM: number;
  /** A striker may fire at the ball within `maxRangeM` when it lies inside `coneDeg` of the line to the opponent goal. */
  readonly shootBall: { readonly maxRangeM: number; readonly coneDeg: number } | null;
}
/** Turbo Ball pitch rules: the goals at the middle ± goalAxisM / 2 along the axis (null: the deployment centres). */
interface BallPitchRules {
  readonly goalAxisM: number | null;
  /** A ball nobody has touched this long goes back to the kick-off spot (null: never). */
  readonly idleResetS: number | null;
}
/** Infected survivors: unengaged survivors close on their own living centroid and hold together within this. */
interface InfectionBotRules {
  readonly survivorRallyM: number;
  /**
   * The infected rise round the survivors (the opening five and every respawn, a convert's included), out of their sight,
   * not at a far base: the outbreak is among them. Null keeps the infected's base.
   */
  readonly arrival: ArrivalRules | null;
}

/**
 * Team arrangement (owner 2026-09-15): the co-op modes let the player arrange both sides — allied
 * bots, the enemy pool (distinct hostile identities in the match), the first Horde wave and the
 * enemy nation. Sides (owner 2026-09-18: "a switch that's default set to 7v7 but then switching it
 * does 14v14 and you can also enter custom numbers of allies and enemies … 1 v 20"): every other mode
 * arranges its two sides the same way — allied bots and hostiles all on the field at once — under
 * one field limit. Absent fields keep the mode's defaults; every value is clamped by
 * TEAM_ARRANGEMENT_LIMITS.
 */
/**
 * Mars mode settings (owner 2026-09-18: "give it a bunch of boosts and settings"): the gravity world the basin
 * plays under and how often a boost cache drops. Stored per player on the mars arrangement
 * (game/teamArrangement.ts readMarsSettings) and carried by rooms through the lobby arrangement.
 */
const MARS_GRAVITY_OPTIONS = Object.freeze({
  // round 30 (owner 2026-09-20): the jump is a rocket boost — about 1.45x the 2026-09-18 launches
  mars: Object.freeze({ gravityScale: 0.38, jumpMps: 9.5, recoilLaunchScale: 3 }),
  moon: Object.freeze({ gravityScale: 0.17, jumpMps: 12.5, recoilLaunchScale: 4.5 }),
  earth: Object.freeze({ gravityScale: 1, jumpMps: 6, recoilLaunchScale: 1.5 }),
});
export type MarsGravityId = keyof typeof MARS_GRAVITY_OPTIONS;
export const MARS_GRAVITY_IDS: readonly MarsGravityId[] = Object.freeze(Object.keys(MARS_GRAVITY_OPTIONS) as MarsGravityId[]);
const MARS_CACHE_OPTIONS = Object.freeze({
  off: Object.freeze({ cacheFirstS: 0, cacheIntervalS: 0 }),
  standard: Object.freeze({ cacheFirstS: 12, cacheIntervalS: 22 }),
  frequent: Object.freeze({ cacheFirstS: 8, cacheIntervalS: 11 }),
});
export type MarsCachesId = keyof typeof MARS_CACHE_OPTIONS;
export const MARS_CACHE_IDS: readonly MarsCachesId[] = Object.freeze(Object.keys(MARS_CACHE_OPTIONS) as MarsCachesId[]);
export function isMarsGravityId(value: unknown): value is MarsGravityId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARS_GRAVITY_OPTIONS, value);
}
export function isMarsCachesId(value: unknown): value is MarsCachesId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARS_CACHE_OPTIONS, value);
}
interface MarsRules {
  readonly gravity: MarsGravityId;
  readonly caches: MarsCachesId;
  /** Seconds into the match the first boost cache drops, then the cadence; 0 means no caches. */
  readonly cacheFirstS: number;
  readonly cacheIntervalS: number;
}
function marsRulesFor(gravity: MarsGravityId, caches: MarsCachesId): MarsRules {
  return Object.freeze({ gravity, caches, ...MARS_CACHE_OPTIONS[caches] });
}
export const MARS_DEFAULT_RULES: MarsRules = marsRulesFor('mars', 'standard');

/**
 * TEAM NATIONS (gameplay-modes-228; owner 2026-10-18: "be able to select wehtehr we want team enemies to be mononation or
 * just random"): MONO-NATION seats each side from ONE country — the allies from the player's pick's country, the
 * enemies from one opposing country per match, shortfalls filled from the closest allied countries (sim/teamNations.ts)
 * and said so — and RANDOM seats any vehicle on either side. The player's own pick is always kept. One per-player
 * preference (game/teamArrangement.ts), decided by the host in a room.
 */
export const TEAM_NATIONS_IDS = Object.freeze(['mono', 'random'] as const);
export type TeamNationsId = (typeof TEAM_NATIONS_IDS)[number];
export const DEFAULT_TEAM_NATIONS: TeamNationsId = 'mono';
export function isTeamNationsId(value: unknown): value is TeamNationsId {
  return value === 'mono' || value === 'random';
}
/**
 * The planner's numbers: the rival bloc's weight in the AUTO enemy draw, the distinct bot vehicles a multiplayer side
 * may field (each one a procedural profile every seat loads; beyond it the side repeats), and whether the AUTO enemy
 * must fill its seats from contemporaries alone where any country can.
 */
export const TEAM_NATIONS_RULES = Object.freeze({ rivalBlocWeight: 3, mpDistinctBotSpecsPerSide: 6, autoEnemyNeedsContemporaries: true });
/**
 * How MONO-NATION reads in each mode's fiction (the rule card and docs/GAME-MODES.md say so): `sides` the two sides it
 * seats; a note key under `rules.teams.scope.*` when the fiction bends it.
 */
export const TEAM_NATIONS_MODE_SCOPE: Readonly<Record<GameModeId, { readonly note: string | null }>> = Object.freeze({
  standard: { note: null }, capture_the_flag: { note: null }, zone_control: { note: null }, turbo_ball: { note: null },
  mars: { note: null }, realistic: { note: null }, gun_game: { note: null }, drone: { note: null },
  // the zombie pool is one country (every wave draws from it), the allies the player's
  endless_horde: { note: 'horde' },
  // the defending formation is one country (a campaign operation's in the campaign)
  frontline_assault: { note: 'frontline' },
  // the opening survivors are the player's country, the opening infected one enemy country; a convert keeps its hull,
  // so the sides mix by design as the outbreak spreads
  infected: { note: 'infected' },
  // boss role: the hunters are one country; hunter role: the player's country against one enemy juggernaut
  juggernaut: { note: 'juggernaut' },
  // the escorts are the player's country, the ground force one enemy country
  ac130: { note: 'ac130' },
});

export interface TeamArrangement {
  /** TEAM NATIONS: 'random' seats any vehicle; absent / null / 'mono' is MONO-NATION (the default). */
  readonly teamNations?: TeamNationsId | null;
  /** Juggernaut side, from the local player/host perspective. */
  readonly juggernautRole?: 'boss' | 'hunter' | null;
  /** Free-sortie objective controls; irrelevant fields are discarded at the boundary. */
  readonly scoreTarget?: number | null;
  readonly respawnS?: number | null;
  readonly waveStep?: number | null;
  readonly holdS?: number | null;
  readonly allies?: number | null;
  readonly enemies?: number | null;
  readonly waveSize?: number | null;
  /** Enemy nation id (game/teamArrangement.ts ENEMY_NATION_OPTIONS) or null for a mixed force. */
  readonly enemyNation?: string | null;
  /** Retired (TEAM NATIONS): the legacy "allies are the player's nation" flag, read as MONO-NATION and dropped. */
  readonly alliedNation?: 'player' | null;
  /** Mars mode only: the gravity world and boost-cache cadence (MARS_GRAVITY_OPTIONS / MARS_CACHE_OPTIONS). */
  readonly marsGravity?: MarsGravityId | null;
  readonly marsCaches?: MarsCachesId | null;
}

/**
 * Vehicles one solo field may hold, the player included (owner 2026-09-18: "go up to a number that you
 * test is the total limit to how many tanks can be in a game before performance is unacceptable" —
 * measured on the desktop tier 2026-09-18, docs/GAME-MODES.md "Sides").
 */
export const BATTLE_FIELD_LIMIT = 42;
/** The whole-game default split: the player with six allied bots against seven hostiles. */
export const STANDARD_SIDES = Object.freeze({ allies: 6, enemies: 7 });
/** The sides switch presets (the player counts on the allied side, so "14 v 14" is thirteen allied bots). */
export const SIDES_PRESETS = Object.freeze({
  '7v7': STANDARD_SIDES,
  '14v14': Object.freeze({ allies: 13, enemies: 14 }),
});
type SidesPreset = keyof typeof SIDES_PRESETS | 'custom';
type IntRange = readonly [number, number];
const range = (low: number, high: number): IntRange => Object.freeze([low, high] as const);
const SYMMETRIC_ALLIES = range(0, BATTLE_FIELD_LIMIT - 2), SYMMETRIC_ENEMIES = range(1, BATTLE_FIELD_LIMIT - 1);
const COOP_ALLIES = range(0, 6);
export const TEAM_ARRANGEMENT_LIMITS: {
  readonly field: number;
  readonly allies: Readonly<Record<GameModeId, IntRange>>;
  readonly enemies: Readonly<Record<GameModeId, IntRange>>;
  readonly waveSize: IntRange;
} = Object.freeze({
  field: BATTLE_FIELD_LIMIT,
  allies: Object.freeze({
    standard: SYMMETRIC_ALLIES, capture_the_flag: SYMMETRIC_ALLIES, zone_control: SYMMETRIC_ALLIES, turbo_ball: SYMMETRIC_ALLIES,
    endless_horde: COOP_ALLIES, frontline_assault: COOP_ALLIES, mars: SYMMETRIC_ALLIES,
    juggernaut: SYMMETRIC_ALLIES, infected: SYMMETRIC_ALLIES, realistic: SYMMETRIC_ALLIES, gun_game: SYMMETRIC_ALLIES, drone: SYMMETRIC_ALLIES, ac130: range(2, 8),
  }),
  enemies: Object.freeze({
    standard: SYMMETRIC_ENEMIES, capture_the_flag: SYMMETRIC_ENEMIES, zone_control: SYMMETRIC_ENEMIES, turbo_ball: SYMMETRIC_ENEMIES,
    endless_horde: range(6, 20), frontline_assault: range(4, 14), mars: SYMMETRIC_ENEMIES,
    juggernaut: SYMMETRIC_ENEMIES, infected: SYMMETRIC_ENEMIES, realistic: SYMMETRIC_ENEMIES, gun_game: SYMMETRIC_ENEMIES, drone: SYMMETRIC_ENEMIES, ac130: range(4, 24),
  }),
  waveSize: range(2, 12),
});

/**
 * Impact physics (owner 2026-09-25: "add more speed based damage — running into something hard super fast like
 * a rock or building or other tank, fall damage — and make bouncing properly work in the lower gravity modes").
 * The laws live in sim/impact.ts (damage) and sim/movement.ts (landing rebound); this block holds every number a
 * mode bends, so the solo step, the authority and the client prediction read one table. Energies are the hull's
 * kinetic energy in kilojoules above the threshold speed (½ · m · (v − v_min)²), so a heavier hull takes more from
 * the same speed and the onset is smooth.
 */
export interface RulesetPhysics {
  /** Rebound share of the closing speed when a hull lands on terrain or a structure (v_out = restitution · v_in). */
  readonly restitution: number;
  /** A rebound slower than this settles onto the ground instead of bouncing (m/s). */
  readonly bounceMinMps: number;
  /** Optional arcade landing height cap, independent of the selected planet's gravity. */
  readonly bounceMaxHeightM?: number;
  /** Optional arcade spin damping (per second) and per-axis angular speed limit (rad/s). */
  readonly airAngularDrag?: number;
  readonly airAngularSpeedMax?: number;
  /** Landing speed against the ground where fall damage begins (m/s; 6 m/s is a 1.8 m drop at 1 g). */
  readonly fallMinMps: number;
  /** Hull hit points per kilojoule of landing energy above the threshold. */
  readonly fallHpPerKj: number;
  /** Closing speed against a hard obstacle (rock, wall, structure, map edge) where impact damage begins (m/s). */
  readonly impactMinMps: number;
  /** Hull hit points per kilojoule of impact energy above the threshold. */
  readonly impactHpPerKj: number;
  /** Multiplies the tank-on-tank ram pool (damage.ts ramDamage). */
  readonly ramScale: number;
  /** Rebound share of a tank-on-tank contact's closing speed in the momentum exchange (0 = they stick). */
  readonly ramRestitution: number;
}

/**
 * The arcade modes' landing hop: the tracks leave the ground by at most this much on a landing's rebound, whatever the
 * gravity (physics lane, 2026-10-03; gauntlet wave 2). The springs take the landing and return its rebound
 * (sim/movement.ts); at 1.5 m a Mars rocket jump came back up a metre and the Moon's took 2.7 s to come down again, a
 * rubber ball, not a tracked hull — the critics' target was a damped settle with low restitution. At the Moon's 0.17 g
 * the capped rebound is under the 1.2 m/s floor, so its springs settle it.
 */
const LANDING_HOP_MAX_M = 0.25;
/** The whole-game impact physics: a tracked hull barely rebounds, a 1.8 m drop is free, walls hurt from 4 m/s. */
export const STANDARD_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.15, bounceMinMps: 1.2, fallMinMps: 6, fallHpPerKj: 0.25,
  impactMinMps: 4, impactHpPerKj: 0.16, ramScale: 1, ramRestitution: 0.2,
});
/** Turbo Ball: arcade rebounds at 0.6 g, a single 13 m/s jump lands free, walls at 1.85× speed cost less per kJ. */
const TURBO_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.28, bounceMinMps: 1.5, bounceMaxHeightM: LANDING_HOP_MAX_M, airAngularDrag: 0.9, airAngularSpeedMax: 1.4,
  fallMinMps: 15, fallHpPerKj: 0.12,
  impactMinMps: 9, impactHpPerKj: 0.05, ramScale: 1, ramRestitution: 0.5,
});
/** Mars: a small, bounded landing rebound; the full 9.5 m/s rocket jump still lands free. */
const MARS_PHYSICS: RulesetPhysics = Object.freeze({
  restitution: 0.30, bounceMinMps: 1.2, bounceMaxHeightM: LANDING_HOP_MAX_M, airAngularDrag: 0.8, airAngularSpeedMax: 1.2,
  fallMinMps: 10.5, fallHpPerKj: 0.16,
  impactMinMps: 5, impactHpPerKj: 0.12, ramScale: 1, ramRestitution: 0.35,
});

export interface MatchRuleset {
  readonly alwaysVisible?: boolean;
  readonly moduleOnlyDamage?: boolean;
  readonly juggernaut?: { readonly team: 'alpha' | 'bravo'; readonly hpScale: number; readonly reloadScale: number; readonly speedScale: number };
  /**
   * Infected: the survivors' and the infected's hulls (multiples of the vehicle's own), the infected's speed and reload
   * multipliers, and `hunt` — the infected bots drive at the nearest survivor (the Horde's law) instead of roaming. Every
   * respawn, a converted survivor's included, waits the ruleset's `respawnS`.
   */
  readonly infection?: { readonly infectedSpeed: number; readonly survivorHpScale: number; readonly infectedHpScale: number; readonly infectedReloadScale: number; readonly hunt: boolean };
  readonly gunGame?: { readonly killsPerWeapon: number };
  readonly aerial?: 'drone' | 'gunship';
  /** VH.15: the roof stations engage enemy drones in flight (sim/auxiliarySystems.ts; the drone mode). */
  readonly counterDrone?: boolean;
  readonly scoreTarget?: number | null;
  readonly mode: GameModeId;
  /** Multiplies 9.81 m/s² for hulls in the air, shells in flight and the ball. */
  readonly gravityScale: number;
  /** Impact, fall, rebound and ram-exchange laws (sim/impact.ts, sim/movement.ts). */
  readonly physics: RulesetPhysics;
  /** Multiplies top and reverse speed (the controller may raise it per wave / lower it for a flag carrier). */
  readonly speedMultiplier: number;
  /** Multiplies hull hit points at spawn and revive. */
  readonly hpScale: number;
  /** Multiplies every hit point lost to shells, blast and ramming. */
  readonly damageScale: number;
  /** Multiplies reload time. */
  readonly reloadScale: number;
  /** Which rounds a crew carries: the vehicle's own loadout, HE only, or the loadout with unlimited rounds. */
  readonly ammo: RulesetAmmo;
  /** Equipment slots honoured (0 disables equipment). */
  readonly equipmentSlots: 0 | 1 | 2 | 3;
  readonly consumables: boolean;
  /** Modules, crew and fires take damage. False (owner 2026-09-15, Turbo Ball: "make modules not break since
   * there's no consumables") keeps every critical system intact — hull hit points are the only thing a hit costs. */
  readonly criticalDamage: boolean;
  /** Upward launch (m/s) the F key gives a grounded, upright hull, or null when the mode has no jump (owner
   * 2026-09-16, Turbo Ball: "make an f button that just adds an upward vector so you go flying"). */
  readonly jumpMps: number | null;
  /** Multiplies the hull's firing recoil into a real launch opposite the muzzle (owner: "aim behind you and launch
   * yourself and use it as a speed boost"); 1 keeps the ordinary hull kick. */
  readonly recoilLaunchScale: number;
  /** Mars mode settings (gravity world, boost-cache cadence); only the mars ruleset carries them. */
  readonly mars?: MarsRules;
  /** Multiplies the shove a shell impact gives the hull it hits (owner: "shells should have more physics effects
   * that knock you"); 1 is the whole-game baseline. */
  readonly shellKnockScale: number;
  /** Seconds to respawn, or null when a destroyed vehicle stays destroyed. */
  readonly respawnS: number | null;
  /** Clock in seconds, or null for no clock. */
  readonly timeLimitS: number | null;
  /** How an expired clock resolves when the score is level (or has no score). */
  readonly timeout: RulesetTimeout;
  /**
   * Battle endings (owner 2026-09-25: "handle battle ends better"): seconds the world keeps simulating after
   * the verdict — wrecks settle, fires burn, shells in flight land — with every gun silent, so the ending beat
   * (final-kill replay, time's-up pull-back, objective orbit) plays over a living field. Past the hold the
   * simulation stands still under the report. Bounded: see ENDING_HOLD_LIMIT_S.
   */
  readonly endingHoldS: number;
  /** Solo roster split: allied bots and enemy bots (null keeps the default 6 / 7). */
  readonly allies: number | null;
  readonly enemies: number | null;
  /** Frontline Assault wave rules (campaign difficulty folds in here). */
  readonly assault: AssaultRules | null;
  /** Endless Horde wave law. */
  readonly horde: HordeRules | null;
  /** Enemy country id under MONO-NATION (null = AUTO, or the operation decides); RANDOM ignores it. */
  readonly enemyNation: string | null;
  /** TEAM NATIONS: MONO-NATION (each side one country, the default) or RANDOM. */
  readonly teamNations: TeamNationsId;
  /** Buildings that break and collapse, ground that craters (docs/DESTRUCTION.md §9). */
  readonly destruction: DestructionRules;
  /** Per-side bot doctrine over CLASSIC_BOT_DOCTRINE (rulesetBotDoctrine); absent = classic on both sides. */
  readonly bots?: BotDoctrineOverrides;
  readonly assaultBots?: AssaultBotRules;
  readonly flagBots?: FlagBotRules;
  readonly ballBots?: BallBotRules;
  readonly ball?: BallPitchRules;
  readonly infectionBots?: InfectionBotRules;
  /**
   * The battlefield variant the mode plays on (null: the base map). Frontline Assault's 'assault-trenches' carves the
   * trench system into the terrain and dresses its works; every client builds it and the authority plays exactly it
   * (its own collision manifest, server/world-collision-manifests/<map>@assault-trenches.json).
   */
  readonly terrainVariant: TerrainVariant | null;
}

/** A battlefield variant a mode can play (the map built with that variant's config, its own collision manifest). */
export type TerrainVariant = 'assault-trenches';
export const TERRAIN_VARIANTS: readonly TerrainVariant[] = Object.freeze(['assault-trenches']);
/** The variant `mode` plays on (null: the base map). */
export function terrainVariantFor(mode: GameModeId | string | null | undefined): TerrainVariant | null {
  return (BASE_RULESETS as Readonly<Record<string, MatchRuleset>>)[String(mode)]?.terrainVariant ?? null;
}

export interface CampaignRulesetInput {
  /** 1-based ladder difficulty. */
  readonly difficulty: number;
  readonly timeLimitS?: number | null;
  /** The operation's enemy nation id (campaignOperations.ts). */
  readonly enemy?: string | null;
}

/** The longest post-verdict hold any ruleset may declare (the report gate's watchdog sits at 16 s). */
export const ENDING_HOLD_LIMIT_S = 12;
/** Whole-game post-verdict hold: long enough for the 2.5 s beats and the killcam's live wreck hold. */
const ENDING_HOLD_S = 8;

/**
 * Destruction (owner 2026-10-07: "buildings should break and collapse ... after withstanding damage and ramming"; craters
 * "esp from like the ac 130"): on in every mode but Turbo Ball, whose pitch an unlimited HE ladder would crater under
 * the ball; the AC-130 digs its craters a quarter wider (docs/DESTRUCTION.md §9).
 */
/**
 * The crater switch (destruction core lane, 2026-10-08; docs/DESTRUCTION.md §7, crater-render-spec §F): on, the
 * simulation digs craters in every mode that plays destruction, and the drawn terrain (world/terrainCraterMesh.ts), the
 * ground cover (world/groundCoverCraters.ts) and the crater's own surface (fx/craterMarks.ts) follow the dug ground.
 * On since the destruction lane's DST-04 round (2026-10-15): pacing and fairness paired against craters off, both
 * audits and the network's stamp-once and late join passed on 2026-10-08; the world's ray march now reads the dug ground
 * (world/map.ts, world/headlessCollisionWorld.ts); the barrage's cost and the motion strips run in the 225/226 final pass.
 */
const CRATERS_SWITCH = true;
// sections (P2: holes, fallen walls, roofs and storeys that shells and sight lines pass; docs/DESTRUCTION.md §3.4, §13):
// on since the destruction lane's DST-04 round (2026-10-15; the owner: "explosions that should be destructive and leave
// holes"). A battle's HE now holes the wall it strikes, a section at zero falls, and a collapse comes down storey by
// storey as the Studio's films have shown since 2026-10-08; the paired pacing, the cost runs and the motion strips run
// in the 225/226 final pass
const SECTIONS_SWITCH = true;
const DESTRUCTION_ON: DestructionRules = Object.freeze({
  structures: true, craters: CRATERS_SWITCH, sections: SECTIONS_SWITCH, structureDamageScale: 1, craterScale: 1, maxCraters: 160,
});
const DESTRUCTION_OFF: DestructionRules = Object.freeze({
  structures: false, craters: false, sections: false, structureDamageScale: 0, craterScale: 0, maxCraters: 0,
});

const STANDARD: MatchRuleset = Object.freeze({
  mode: 'standard', gravityScale: 1, physics: STANDARD_PHYSICS, speedMultiplier: 1, hpScale: 1, damageScale: 1, reloadScale: 1,
  ammo: 'spec', equipmentSlots: 3, consumables: true, criticalDamage: true, jumpMps: null, recoilLaunchScale: 1, shellKnockScale: 0.3,
  respawnS: null, timeLimitS: 900, timeout: 'draw', endingHoldS: ENDING_HOLD_S,
  allies: null, enemies: null, assault: null, horde: null, enemyNation: null, teamNations: DEFAULT_TEAM_NATIONS,
  destruction: DESTRUCTION_ON, terrainVariant: null,
});

// Per-side doctrines (gameplay-modes-228). Each is a partial over CLASSIC_BOT_DOCTRINE; see BotDoctrine for the knobs.
const HORDE_ALLY_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, conserveRounds: false, searchRouting: 'spotted', routeRefreshS: 1.25, routeMoveM: 8,
});
// the infected keep firing at range on the way in (a zombie's long shot is wasted; the infected's is pressure)
const INFECTED_DOCTRINE: Partial<BotDoctrine> = Object.freeze({ ...RUSH_DOCTRINE, hitReactions: 'angle', claimRangeM: null });
const SURVIVOR_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, conserveRounds: false, fallbackScale: 0.5, hitReactions: 'angle', stalemateSilentS: 6,
  spearheadGuard: true, scoutKite: true, holdBandScale: 1, searchRouting: 'spotted', routeRefreshS: 1.25, routeMoveM: 8,
});
const ASSAULT_ATTACKER_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, conserveRounds: false, missionSpeed: 1, missionBreakOffHp: 0, spearheadGuard: false, coverScale: 0.5,
  fallbackScale: 0.5, hitReactions: 'angle', stalemateSilentS: 6, holdBandScale: 0.6, searchRouting: 'spotted',
  routeRefreshS: 1.25, routeMoveM: 8,
});
const ASSAULT_DEFENDER_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, conserveRounds: false, missionSpeed: 1, missionBreakOffHp: 0.15, zoneSortieM: 80, coverScale: 0.75,
  fallbackScale: 0.5, hitReactions: 'angle', holdBandScale: 0.7, stalemateSilentS: 6, routeRefreshS: 1.25, routeMoveM: 8,
});
const FLAG_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  openingRead: false, missionSpeed: 1, missionBreakOffHp: 0, fallbackScale: 0.5, coverScale: 0.5, hitReactions: 'angle',
  stalemateSilentS: 8, searchRouting: 'spotted', routeRefreshS: 1.25, routeMoveM: 8,
});
const FAST_ROUTE_DOCTRINE: Partial<BotDoctrine> = Object.freeze({ routeRefreshS: 1.25, routeMoveM: 0 });
const BALL_DOCTRINE: Partial<BotDoctrine> = Object.freeze({
  ...FAST_ROUTE_DOCTRINE, openingRead: false, conserveRounds: false, missionSpeed: 1, missionBreakOffHp: 0,
  offensiveJump: true, hitReactions: 'angle',
});

// Ammunition (owner 2026-10-17: "for special modes like juggernaut, ammo should be endless"): the competitive and
// realistic modes (Standard, Capture the Flag, Zone Control, Realistic) keep the vehicle's own loadout; every special
// and arcade mode plays unlimited rounds — the AC-130's escorts excepted, whose rounds are what the gunship's airdrop is
// for (state.ts and the authority refill only the gunship there). Unlimited rounds turn every cache into a repair
// (cacheHealChance): an ammunition cache could never be taken.
const BASE_RULESETS: Readonly<Record<GameModeId, MatchRuleset>> = Object.freeze({
  standard: STANDARD,
  // Flags: respawning objective play on the standard physics; the controller slows a carrier.
  // gameplay-modes-228 (owner 2026-10-18: "increase aggression of bots trying to capturing flag"): the flags are run,
  // not brawled over — every free bot recovers a taken home flag (a capture needs it home), three escorts lead the
  // carrier home, recoverers cut the carrier off; no opening read, full pace, no mission break-off in a respawn mode
  capture_the_flag: Object.freeze({ ...STANDARD, mode: 'capture_the_flag', respawnS: 6,
    bots: Object.freeze({ alpha: FLAG_DOCTRINE, bravo: FLAG_DOCTRINE }),
    flagBots: Object.freeze({ recoverShare: 0.5, recoverMin: 2, huntWhenHomeFlagTaken: true, escorts: 3, escortAheadM: 24,
      escortSideM: 22, defendShare: 0.15, defendMinSquad: 6, interceptLeadS: 2.5 }) }),
  // Zones: respawning hold-the-ground play; the 750-point target resolves inside the clock.
  zone_control: Object.freeze({ ...STANDARD, mode: 'zone_control', respawnS: 6 }),
  // Turbo Ball: arcade physics — 0.6 g so hulls and shells fly, 1.85× speed, tough hulls, half
  // damage, quick reloads, HE only with unlimited rounds, no equipment or consumables, 3 s
  // respawns, a ten-minute clock.
  turbo_ball: Object.freeze({
    ...STANDARD, mode: 'turbo_ball', gravityScale: 0.6, physics: TURBO_PHYSICS, speedMultiplier: 1.85, hpScale: 1.5,
    damageScale: 0.5, reloadScale: 0.7, ammo: 'unlimited', equipmentSlots: 0, consumables: false,
    criticalDamage: false, jumpMps: 13, recoilLaunchScale: 12, shellKnockScale: 2.5, respawnS: 3, timeLimitS: 600,
    destruction: DESTRUCTION_OFF,
    // gameplay-modes-228 ("pursuing ball"): two strikers on an intercept course, screens and a keeper, at most three a
    // team on the ball; strikers jump at it and shoot it toward the goal; the goals sit goalAxisM apart (A/B-chosen)
    bots: Object.freeze({ alpha: BALL_DOCTRINE, bravo: BALL_DOCTRINE }),
    ballBots: Object.freeze({ strikers: 2, supportBackM: 25, supportSideM: 14, strikerHoldS: 3, swapM: 25, leadMaxS: 3,
      leadIterations: 2, screens: 2, screenNear: 0.85, screenFar: 0.6, screenSideM: 28, keepers: 1, keeperM: 30, crowdCap: 3,
      crowdM: 30, shootBall: Object.freeze({ maxRangeM: 120, coneDeg: 25 }) }),
    ball: Object.freeze({ goalAxisM: null, idleResetS: 30 }),
  }),
  // Horde: survival — the player with four allied bots on alpha (co-op humans join it), a pool of
  // twenty hostile identities on the far side drawn afresh every wave (six on the first wave,
  // two more each wave and a surge every third), no respawn, no clock, unlimited rounds; clearing
  // a wave repairs the survivors by HORDE_WAVE_REPAIR and drops a repair cache. Zombies (owner
  // 2026-10-17: "all the zombies actually have low hp. rn its humans with low hp and a bunch of
  // overpowered glowing zombies that can steam roll them"): the humans' hull is doubled, the
  // hostiles arrive at 15 % of their own (about one main-gun round) plus 2 % a wave and play one
  // difficulty tier below the battle's, so a wave is many and weak and its pressure is numbers
  // (docs/GAME-MODES.md "Zombie balance": 1.1 waves and a 1:3 kill ratio before, measured after).
  // gameplay-modes-228 (owner 2026-10-18: "make it work a lot more properly like youd expect, more enemies per round, and
  // then increase aggression in that game mode too because of what it implies"): a wave TOTAL that grows every round
  // without a cap (6, 9, 13, 18, 24, 30, 37 …), at most sixteen on the field at once (the twenty pool identities rest
  // and rotate, trickling back in every 1.5 s), arriving 170-300 m round the humans, out of their sight, from three
  // sectors; an 8 s lull; runner waves every fourth, swarm waves every fifth; the zombies charge (RUSH_DOCTRINE) on
  // what they have spotted, and the allied bots stay within reach of the humans
  endless_horde: Object.freeze({
    ...STANDARD, mode: 'endless_horde', hpScale: 2, ammo: 'unlimited', respawnS: null, timeLimitS: null,
    allies: 4, enemies: 20,
    horde: Object.freeze({
      waveSize: 6, waveStep: 3, waveCurve: 0.35, perHumanTotal: 0.25, maxAlive: 16, maxAlivePerHuman: 1, maxAliveCap: 20,
      trickleS: 1.5, recycleAfterS: 6, strandedS: 40, strandedGainM: 20, strandedContactM: 100, spawnRingM: Object.freeze([260, 380] as const), spawnSectors: 3, sectorWidthDeg: 60, sectorSpreadDeg: 70,
      spawnMinHumanM: 150, spawnOutOfSight: true, sightRangeM: 450, sightStepM: 8, sightEyeM: 2.4, sightHullM: 1.5, sightMarginM: 1,
      spawnCandidates: 12,
      intermissionS: 8, waveRepair: 0.3,
      hostileHpScale: 0.15, hpPerWave: 0.02, hpPerWaveLate: 0.06, lateFromWave: 11,
      runnerEvery: 4, runnerSpeed: 1.25, swarmEvery: 5, swarmTotalScale: 1.4, swarmHull: 0.10,
      speedPerWave: 0.045, speedPerWaveMax: 0.55, cacheHeal: Object.freeze({ first: 0.62, perWave: 0.055, floor: 0.08 }),
      hostileDifficultyStep: 1, hostileReloadScale: 1.8, hunt: 'spotted', allyLeashM: 120,
    }),
    bots: Object.freeze({ bravo: RUSH_DOCTRINE, alpha: HORDE_ALLY_DOCTRINE }),
  }),
  // Frontline Assault: the campaign sortie — three allies, no respawn, unlimited rounds, a twelve-minute
  // clock that costs the operation when it runs out; defenders escalate per sector and per difficulty.
  frontline_assault: Object.freeze({
    ...STANDARD, mode: 'frontline_assault', ammo: 'unlimited', respawnS: null, timeLimitS: 720, timeout: 'defeat',
    allies: 3, enemies: 12, terrainVariant: 'assault-trenches',
    // gameplay-modes-228 (owner 2026-10-18: "up its aggression of tanks more"): every sector is fought for — its
    // defenders dug in on the line from the start (4 / 5 / 6), a two-tank counter-attack on the sector just taken, a
    // trickle from the rear while a sector is contested; the attackers push in groups on flank lanes, the defenders
    // sortie at the attackers they see within 80 m of their line
    assault: Object.freeze({ initialActive: 4, extraDefenders: 0, hpPerLine: 0.16, finalLineHp: 1.15, difficultyHp: 0, holdS: 20,
      defendersStartOnLine: true, lineBandM: Object.freeze([30, 70] as const),
      counterAttack: Object.freeze({ squad: 2, afterCaptureS: 8, forS: 40 }),
      reinforceTrickleS: 30, reinforceExtra: 2, reinforceRearM: 140,
      regroupMaxS: 25, regroupRadiusM: 80, regroupHumanM: 250, allyReviveS: null, hostileDifficultyStep: 1 }),
    assaultBots: Object.freeze({ pushAfterS: 15, pushMinGroup: 2, pushGroupM: 80, stageM: 20, flankShare: 0.4, flankOffsetM: 60,
      flankConvergeM: 80 }),
    bots: Object.freeze({ alpha: ASSAULT_ATTACKER_DOCTRINE, bravo: ASSAULT_DEFENDER_DOCTRINE }),
  }),
  // Mars mode (owner 2026-09-18): Olympus Basin's own physics — 0.38 g, a 6.5 m/s jump, +25 % speed, tougher
  // hulls, a lighter recoil launch than Turbo Ball — on the zone objective with 6 s respawns, unlimited
  // rounds and a twelve-minute clock; the boost caches (repairs, under unlimited rounds) are the mode controller's.
  mars: Object.freeze({
    ...STANDARD, mode: 'mars', mars: MARS_DEFAULT_RULES, gravityScale: 0.38, physics: MARS_PHYSICS, speedMultiplier: 1.25, hpScale: 1.2, damageScale: 0.9,
    reloadScale: 0.9, ammo: 'unlimited', jumpMps: 9.5, recoilLaunchScale: 3, shellKnockScale: 0.9, respawnS: 6, timeLimitS: 720,
    // the station sectors re-route every 1.25 s (the authority's long-standing fast route mode, now a rule)
    bots: Object.freeze({ alpha: FAST_ROUTE_DOCTRINE, bravo: FAST_ROUTE_DOCTRINE }),
  }),
  juggernaut: Object.freeze({ ...STANDARD, mode: 'juggernaut', ammo: 'unlimited', allies: 0, enemies: 12, respawnS: 6, timeLimitS: 600,
    juggernaut: Object.freeze({ team: 'alpha', hpScale: 8, reloadScale: .5, speedScale: .9 }) }),
  // Infected (owner 2026-10-17, the zombies): sturdy survivors (150 % hull) against five fragile infected (30 %) that hunt
  // the nearest survivor at +30 % speed with no reload bonus and come back 5 s after every death, a converted survivor's
  // included; the outbreak wins by numbers (four starters let the survivors win 3 rounds in 4, six almost never). Before: survivors at 30 % against infected at 125 % with +40 % speed and a
  // ×0.7 reload lost every bot round inside 2:16 (docs/GAME-MODES.md "Zombie balance").
  // gameplay-modes-228 (owner 2026-10-18: "infected should be super aggressie as well"): the infected take the Horde's
  // charge with one difference, the hull turn onto a hit (second only to the zombies); the survivors fight back hard —
  // no opening read, every round fired, a shorter fallback, their range kept — and close ranks round their own centroid
  infected: Object.freeze({ ...STANDARD, mode: 'infected', ammo: 'unlimited', allies: 9, enemies: 5, respawnS: 5, timeLimitS: 420,
    infection: Object.freeze({ infectedSpeed: 1.3, survivorHpScale: 1.5, infectedHpScale: .3, infectedReloadScale: 1, hunt: true }),
    bots: Object.freeze({ bravo: INFECTED_DOCTRINE, alpha: SURVIVOR_DOCTRINE }),
    infectionBots: Object.freeze({ survivorRallyM: 90, arrival: Object.freeze({
      spawnRingM: Object.freeze([120, 200] as const), spawnSectors: 3, sectorWidthDeg: 60, sectorSpreadDeg: 70,
      spawnMinHumanM: 110, spawnOutOfSight: true, sightRangeM: 450, sightStepM: 8, sightEyeM: 2.4, sightHullM: 1.5,
      sightMarginM: 1, spawnCandidates: 12 }) }) }),
  realistic: Object.freeze({ ...STANDARD, mode: 'realistic', alwaysVisible: false, moduleOnlyDamage: true, consumables: false }),
  gun_game: Object.freeze({ ...STANDARD, mode: 'gun_game', respawnS: 4, ammo: 'unlimited', timeLimitS: 900,
    gunGame: Object.freeze({ killsPerWeapon: 2 }) }),
  drone: Object.freeze({ ...STANDARD, mode: 'drone', aerial: 'drone', counterDrone: true, ammo: 'unlimited', respawnS: 6, timeLimitS: 600, scoreTarget: 20 }),
  ac130: Object.freeze({ ...STANDARD, mode: 'ac130', aerial: 'gunship', allies: 4, enemies: 12, alwaysVisible: true,
    ammo: 'unlimited', consumables: false, timeLimitS: 480, timeout: 'defeat',
    destruction: Object.freeze({ ...DESTRUCTION_ON, craterScale: 1.25 }) }),
});

/** Score targets the modes play to (kept here so rule cards and controller agree). */
export const RULESET_SCORE_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  capture_the_flag: 3, zone_control: 750, turbo_ball: 5, mars: 750, drone: 20,
});
/** A flag carrier drives at this share of the mode speed (Capture the Flag). */
export const FLAG_CARRIER_SPEED_SCALE = 0.85;
/** Share of maximum hull repaired on every surviving attacker when a Horde wave is cleared (the Horde's `waveRepair`). */
export const HORDE_WAVE_REPAIR = BASE_RULESETS.endless_horde.horde!.waveRepair;

/**
 * The numbers a mode's card, battle setup and manual quote, read from this table (`{target}`, `{gravity}`, ...), so the
 * copy can never promise a rule the battle does not keep (2026-10-13: Zone Control's copy said 1,000 points while the
 * mode plays to 750, and Realistic's said every tank stays visible while it plays normal spotting).
 */
export function modeCopyValues(mode: GameModeId): Readonly<Record<string, number>> {
  const rules = matchRulesetFor(mode);
  return {
    target: RULESET_SCORE_TARGETS[mode] ?? 0,
    gravity: rules.gravityScale,
    minutes: rules.timeLimitS == null ? 0 : rules.timeLimitS / 60,
    survivorHp: Math.round((rules.infection?.survivorHpScale ?? 1) * 100),
    infectedHp: Math.round((rules.infection?.infectedHpScale ?? 1) * 100),
    killsPerWeapon: rules.gunGame?.killsPerWeapon ?? 0,
    weapons: GUN_GAME_WEAPONS.length,
  };
}

/**
 * The post-verdict hold, read by the solo step and the authority alike: while it runs the world keeps
 * simulating with every gun silent; once it expires the step returns early and the field stands still.
 * A null verdict time means no verdict yet (never expired); the hold is clamped to ENDING_HOLD_LIMIT_S.
 */
export function endingHoldExpired(
  ruleset: Pick<MatchRuleset, 'endingHoldS'>,
  resultTimeS: number | null | undefined,
  timeS: number,
): boolean {
  if (resultTimeS == null || !Number.isFinite(resultTimeS)) return false;
  const holdS = Number.isFinite(ruleset.endingHoldS) ? Math.min(ENDING_HOLD_LIMIT_S, Math.max(0, ruleset.endingHoldS)) : 0;
  return timeS - resultTimeS >= holdS - 1e-9;
}

/** The wave modes: their enemy side is a pool drawn per wave (Horde) or per sector (Frontline). */
export function isWaveMode(mode: GameModeId): mode is 'endless_horde' | 'frontline_assault' {
  return mode === 'endless_horde' || mode === 'frontline_assault';
}

/**
 * A destroyed hull stays out of the battle: no respawn, and no wave that draws the pool back in. Only then can a network
 * seat count a side from the roster and the deaths it is sent: a hull's return out of its sight is never sent to it.
 */
export function deathsAreFinal(ruleset: Pick<MatchRuleset, 'mode' | 'respawnS'>): boolean {
  return ruleset.respawnS == null && !isWaveMode(ruleset.mode);
}

/** Every registered mode arranges its sides (owner 2026-09-18); an unknown id takes none. */
export function acceptsTeamArrangement(mode: GameModeId): boolean {
  return Object.prototype.hasOwnProperty.call(BASE_RULESETS, mode);
}

/** The two sides a symmetric mode fields at once (bots only — the player joins the allied side). */
export function rulesetSides(ruleset: Pick<MatchRuleset, 'allies' | 'enemies'>): { readonly allies: number; readonly enemies: number } {
  return { allies: ruleset.allies ?? STANDARD_SIDES.allies, enemies: ruleset.enemies ?? STANDARD_SIDES.enemies };
}

/** Which switch position an arrangement is: a preset when its sides match one, otherwise custom. */
export function sidesPresetOf(arrangement: Pick<TeamArrangement, 'allies' | 'enemies'> | null | undefined): SidesPreset {
  const sides = rulesetSides({ allies: arrangement?.allies ?? null, enemies: arrangement?.enemies ?? null });
  for (const [id, preset] of Object.entries(SIDES_PRESETS)) {
    if (preset.allies === sides.allies && preset.enemies === sides.enemies) return id as SidesPreset;
  }
  return 'custom';
}

const clampInt = (value: unknown, range: readonly [number, number]): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(range[0], Math.min(range[1], Math.round(n)));
};

/** Clamp an arrangement to the mode's limits; null for modes that take none or an empty input. */
export function normalizeTeamArrangement(mode: GameModeId, input: TeamArrangement | null | undefined): TeamArrangement | null {
  if (!input || !acceptsTeamArrangement(mode)) return null;
  let allies = input.allies == null ? null : clampInt(input.allies, TEAM_ARRANGEMENT_LIMITS.allies[mode]);
  const enemies = input.enemies == null ? null : clampInt(input.enemies, TEAM_ARRANGEMENT_LIMITS.enemies[mode]);
  const waveSize = mode === 'endless_horde' && input.waveSize != null
    ? clampInt(input.waveSize, TEAM_ARRANGEMENT_LIMITS.waveSize) : null;
  // TEAM NATIONS: only 'random' is stored; mono is the absent default (old stores, old rooms and the retired
  // alliedNation 'player' all read as MONO)
  const teamNations = input.teamNations === 'random' ? 'random' : null;
  const enemyNation = typeof input.enemyNation === 'string' && /^[a-z_]{2,24}$/.test(input.enemyNation) ? input.enemyNation : null;
  const marsGravity = mode === 'mars' && isMarsGravityId(input.marsGravity) ? input.marsGravity : null;
  const marsCaches = mode === 'mars' && isMarsCachesId(input.marsCaches) ? input.marsCaches : null;
  const juggernautRole = mode === 'juggernaut' && (input.juggernautRole === 'hunter' || input.juggernautRole === 'boss') ? input.juggernautRole : null;
  const hasScore = Object.prototype.hasOwnProperty.call(RULESET_SCORE_TARGETS, mode);
  const scoreTarget = hasScore && Number.isFinite(input.scoreTarget) ? clampInt(input.scoreTarget!,
    mode === 'capture_the_flag' ? [1, 9] : mode === 'turbo_ball' ? [1, 15] : mode === 'drone' ? [5, 100] : [100, 2000]) : null;
  const respawnS = hasScore && Number.isFinite(input.respawnS) ? clampInt(input.respawnS!, [2, 15]) : null;
  const waveStep = mode === 'endless_horde' && Number.isFinite(input.waveStep) ? clampInt(input.waveStep!, [0, 3]) : null;
  const holdS = mode === 'frontline_assault' && Number.isFinite(input.holdS) ? clampInt(input.holdS!, [10, 60]) : null;
  // the field limit (player included) holds whatever the two sides ask for: the enemy count is kept — it is
  // the number the player typed for a "1 v 20" — and the allied bots yield
  if (!isWaveMode(mode) && (allies != null || enemies != null)) {
    const sides = rulesetSides({ allies, enemies });
    if (sides.allies + sides.enemies + 1 > BATTLE_FIELD_LIMIT) allies = Math.max(0, BATTLE_FIELD_LIMIT - 1 - sides.enemies);
  }
  if (allies == null && enemies == null && waveSize == null && enemyNation == null && teamNations == null && marsGravity == null && marsCaches == null && scoreTarget == null && respawnS == null && waveStep == null && holdS == null && juggernautRole == null) return null;
  return Object.freeze({
    allies, enemies, waveSize, enemyNation,
    ...(teamNations ? { teamNations } : {}),
    ...(juggernautRole ? { juggernautRole } : {}),
    ...(scoreTarget != null ? { scoreTarget } : {}), ...(respawnS != null ? { respawnS } : {}),
    ...(waveStep != null ? { waveStep } : {}), ...(holdS != null ? { holdS } : {}),
    ...(marsGravity ? { marsGravity } : {}), ...(marsCaches ? { marsCaches } : {}),
  });
}

/**
 * Earth's gravity lands with the whole game's bounce (physics lane round 3; gauntlet wave 23: "an Earth-gravity drop
 * hops clear of the ground"): the basin's 30 % threw a 5.6 m/s landing at 1 g back off the ground.
 */
function gravityPhysics(physics: RulesetPhysics, gravity: MarsGravityId): RulesetPhysics {
  return gravity === 'earth' ? Object.freeze({ ...physics, restitution: STANDARD_PHYSICS.restitution }) : physics;
}

/**
 * The impact physics a hull of this mode lands by at this gravity. The client's prediction knows the room's mode and the
 * gravity the authority sends it (viewer.modeGravityScale), not the Mars settings, and Gravity mode's Earth rewrites the
 * mode's rebound (physics lane round 4: the prediction landed a 1 g hull at the basin's 30 % where the authority took
 * 15 %, so a landing the authority settled bounced on the client and was corrected).
 */
export function rulesetPhysicsAt(mode: GameModeId, gravityScale: number): RulesetPhysics {
  const physics = matchRulesetFor(mode).physics;
  if (mode !== 'mars') return physics;
  const gravity = MARS_GRAVITY_IDS.find((id) => Math.abs(MARS_GRAVITY_OPTIONS[id].gravityScale - gravityScale) < 1e-3);
  return gravity ? gravityPhysics(physics, gravity) : physics;
}

export function matchRulesetFor(
  mode: GameModeId,
  campaign: CampaignRulesetInput | null = null,
  arrangement: TeamArrangement | null = null,
): MatchRuleset {
  const base = BASE_RULESETS[mode] ?? STANDARD;
  let ruleset: MatchRuleset = base;
  if (campaign && mode === 'frontline_assault' && base.assault) {
    const difficulty = Math.max(1, Math.min(9, Math.floor(campaign.difficulty) || 1));
    ruleset = {
      ...base,
      timeLimitS: campaign.timeLimitS === undefined ? base.timeLimitS : campaign.timeLimitS,
      enemyNation: typeof campaign.enemy === 'string' ? campaign.enemy : base.enemyNation,
      assault: Object.freeze({
        ...base.assault,
        // one extra defender every two operations, and 6 % hull per operation past the first
        extraDefenders: Math.floor((difficulty - 1) / 2),
        difficultyHp: (difficulty - 1) * 0.06,
      }),
    };
  }
  const arranged = normalizeTeamArrangement(mode, arrangement);
  if (arranged) {
    ruleset = {
      ...ruleset,
      scoreTarget: arranged.scoreTarget ?? ruleset.scoreTarget,
      respawnS: arranged.respawnS ?? ruleset.respawnS,
      assault: ruleset.assault && arranged.holdS != null && !campaign
        ? Object.freeze({ ...ruleset.assault, holdS: arranged.holdS }) : ruleset.assault,
      allies: arranged.allies ?? ruleset.allies,
      enemies: arranged.enemies ?? ruleset.enemies,
      teamNations: arranged.teamNations ?? ruleset.teamNations,
      // a campaign operation's formation is not overridden by the free-sortie nation setting
      enemyNation: campaign?.enemy ? ruleset.enemyNation : (arranged.enemyNation ?? ruleset.enemyNation),
      // the first wave and the step are the arranged ones; the pool caps only what stands on the field at once (maxAlive)
      horde: ruleset.horde && (arranged.waveSize != null || arranged.waveStep != null)
        ? Object.freeze({ ...ruleset.horde, waveSize: arranged.waveSize ?? ruleset.horde.waveSize, waveStep: arranged.waveStep ?? ruleset.horde.waveStep })
        : ruleset.horde,
    };
  }
  if (mode === 'mars' && arranged && (arranged.marsGravity || arranged.marsCaches)) {
    // Mars settings: the gravity world rewrites the physics trio, the cache choice its cadence
    const gravity = arranged.marsGravity ?? ruleset.mars?.gravity ?? MARS_DEFAULT_RULES.gravity;
    const caches = arranged.marsCaches ?? ruleset.mars?.caches ?? MARS_DEFAULT_RULES.caches;
    const world = MARS_GRAVITY_OPTIONS[gravity];
    ruleset = {
      ...ruleset, gravityScale: world.gravityScale, jumpMps: world.jumpMps, recoilLaunchScale: world.recoilLaunchScale,
      physics: gravityPhysics(ruleset.physics, gravity),
      mars: marsRulesFor(gravity, caches),
    };
  }
  if (ruleset.juggernaut) {
    const hunter = arrangement?.juggernautRole === 'hunter';
    ruleset = { ...ruleset, allies: hunter ? (arranged?.allies ?? 5) : 0,
      enemies: hunter ? 1 : (arranged?.enemies ?? 12),
      juggernaut: { ...ruleset.juggernaut, team: hunter ? 'bravo' : 'alpha' } };
  }
  if (ruleset.infection) ruleset = { ...ruleset, enemies: Math.max(3, ruleset.enemies ?? base.enemies ?? 3) };
  return ruleset === base ? base : Object.freeze(ruleset);
}

/**
 * Hull scale a Frontline counter-attack arrives with on sector `line` (0-based) of `lines`: 1 + line × hpPerLine on
 * the way in, finalLineHp on the last sector, plus the operation's difficulty on every one.
 */
export function assaultWaveHealthScale(rules: AssaultRules, line: number, lines: number): number {
  const index = Math.max(0, Math.floor(line));
  // the opening wave is never the counter-attack, even on a one-sector front
  const base = index > 0 && index >= lines - 1 ? rules.finalLineHp : 1 + index * rules.hpPerLine;
  return base + rules.difficultyHp;
}

/** The base wave law (1-based wave, one human): round(waveSize + waveStep·(w−1) + waveCurve·(w−1)²). */
export function hordeWaveSize(rules: HordeRules, wave: number): number {
  const k = Math.max(1, Math.floor(wave)) - 1;
  return Math.round(rules.waveSize + rules.waveStep * k + rules.waveCurve * k * k);
}

/** A wave's kind: every swarmEvery-th a SWARM, every runnerEvery-th a RUNNER (a swarm wins when both fall due). */
export function hordeWaveSpecial(rules: HordeRules, wave: number): 'swarm' | 'runner' | null {
  const w = Math.max(1, Math.floor(wave));
  if (rules.swarmEvery > 0 && w % rules.swarmEvery === 0) return 'swarm';
  if (rules.runnerEvery > 0 && w % rules.runnerEvery === 0) return 'runner';
  return null;
}

/** Hostiles a wave brings in total (gameplay-modes-228): the base law, the swarm's scale, (1 + perHumanTotal) per extra human. */
export function hordeWaveTotal(rules: HordeRules, wave: number, humans: number): number {
  const coop = 1 + rules.perHumanTotal * (Math.max(1, Math.floor(humans)) - 1);
  const swarm = hordeWaveSpecial(rules, wave) === 'swarm' ? rules.swarmTotalScale : 1;
  return Math.max(1, Math.round(hordeWaveSize(rules, wave) * swarm * coop));
}

/** Hostiles on the field at once: maxAlive + maxAlivePerHuman per extra human, never over maxAliveCap or the pool. */
export function hordeMaxAlive(rules: HordeRules, humans: number, pool: number): number {
  const scaled = rules.maxAlive + rules.maxAlivePerHuman * (Math.max(1, Math.floor(humans)) - 1);
  return Math.max(0, Math.min(Math.floor(pool), rules.maxAliveCap, scaled));
}

/**
 * A Horde hostile's hull on a wave (1-based) as a multiple of its vehicle's own: the zombies' fodder law — hpPerWave a
 * wave through lateFromWave − 1, hpPerWaveLate a wave after it (wave 10: 0.177, wave 15: 0.222), a swarm at swarmHull.
 */
export function hordeHostileHull(rules: HordeRules, wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  if (hordeWaveSpecial(rules, w) === 'swarm') return rules.swarmHull;
  const early = Math.min(w, rules.lateFromWave - 1) - 1;
  const late = Math.max(0, w - (rules.lateFromWave - 1));
  return rules.hostileHpScale * (1 + early * rules.hpPerWave + late * rules.hpPerWaveLate);
}

/**
 * The health scale the controller hands a Horde hostile's revive on a wave. The revive's ruleset stamp multiplies it by
 * `hpScale` (the humans' hull), so it is the hostile's hull divided by that: the hostile ends at hordeHostileHull.
 */
export function hordeWaveHealthScale(ruleset: Pick<MatchRuleset, 'hpScale'>, rules: HordeRules, wave: number): number {
  return hordeHostileHull(rules, wave) / (ruleset.hpScale > 0 ? ruleset.hpScale : 1);
}

/** Speed multiplier the wave pressure gives a Horde hostile or a Frontline defender on a wave (1-based); runners run. */
export function hordeWaveSpeedScale(rules: HordeRules, wave: number): number {
  const ramp = 1 + Math.min(rules.speedPerWaveMax, (Math.max(1, Math.floor(wave)) - 1) * rules.speedPerWave);
  return hordeWaveSpecial(rules, wave) === 'runner' ? ramp * rules.runnerSpeed : ramp;
}

const doctrineMemo = new WeakMap<object, { alpha: BotDoctrine; bravo: BotDoctrine }>();
/**
 * The doctrine a bot on `team` plays under a ruleset: CLASSIC_BOT_DOCTRINE under the mode's side table. The side reads
 * the way rulesetBotDifficulty's does (`bravo` and solo's `enemy` are bravo, everything else alpha), so both builders
 * read one table and an Infected convert switches to the infected's on its first tick. Frozen and memoised per
 * ruleset: a tick allocates nothing.
 */
export function rulesetBotDoctrine(ruleset: Pick<MatchRuleset, 'bots'>, team: string): BotDoctrine {
  const bots = ruleset.bots;
  if (!bots) return CLASSIC_BOT_DOCTRINE;
  let memo = doctrineMemo.get(ruleset);
  if (!memo) {
    memo = {
      alpha: bots.alpha ? Object.freeze({ ...CLASSIC_BOT_DOCTRINE, ...bots.alpha }) : CLASSIC_BOT_DOCTRINE,
      bravo: bots.bravo ? Object.freeze({ ...CLASSIC_BOT_DOCTRINE, ...bots.bravo }) : CLASSIC_BOT_DOCTRINE,
    };
    doctrineMemo.set(ruleset, memo);
  }
  return team === 'bravo' || team === 'enemy' ? memo.bravo : memo.alpha;
}

/** Mars caches split evenly between a repair and a rearm (the Horde's fall with the waves). */
const EVEN_CACHE_HEAL_CHANCE = 0.5;
/**
 * Share of the caches a mode drops on a wave (1-based) that repair rather than rearm: every one under unlimited rounds
 * (an ammunition cache could never be taken and would hold a cache slot), else the Horde's falling law, else even.
 */
export function cacheHealChance(ruleset: Pick<MatchRuleset, 'ammo' | 'horde'>, wave: number): number {
  if (ruleset.ammo === 'unlimited') return 1;
  const law = ruleset.horde?.cacheHeal;
  if (!law) return EVEN_CACHE_HEAL_CHANCE;
  return Math.max(law.floor, law.first - (Math.max(1, Math.floor(wave)) - 1) * law.perWave);
}

/** Bot difficulty tiers, easiest first (game/input.ts AI_DIFFICULTIES; the ruleset only steps along them). */
const BOT_DIFFICULTY_TIERS = Object.freeze(['easy', 'normal', 'hard'] as const);
type BotDifficultyTier = (typeof BOT_DIFFICULTY_TIERS)[number];
/**
 * The difficulty a bot on `team` plays under a ruleset: the battle's own, except a Horde hostile, which plays
 * `horde.hostileDifficultyStep` tiers below it and never under the easiest (zombies come on numbers, not aim). The solo
 * battle and the network authority both read it when they build a bot.
 */
export function rulesetBotDifficulty(ruleset: Pick<MatchRuleset, 'horde' | 'assault'>, team: string, difficulty: BotDifficultyTier): BotDifficultyTier {
  const step = ruleset.horde?.hostileDifficultyStep ?? ruleset.assault?.hostileDifficultyStep ?? 0;
  if (step <= 0 || (team !== 'bravo' && team !== 'enemy')) return difficulty;
  const index = BOT_DIFFICULTY_TIERS.indexOf(difficulty);
  return index < 0 ? difficulty : BOT_DIFFICULTY_TIERS[Math.max(0, index - Math.floor(step))]!;
}

/** The hostile side's hull as a multiple of its vehicles' own when it differs from the humans' (Horde, Infected). */
function hostileHullScale(ruleset: MatchRuleset): number | null {
  if (ruleset.horde) return ruleset.horde.hostileHpScale;
  if (ruleset.infection) return ruleset.hpScale * ruleset.infection.infectedHpScale;
  return null;
}

/** Whole-number percent for copy ("+50 %", "-40 %"). */
function percent(scale: number): string {
  const delta = Math.round((scale - 1) * 100);
  return `${delta > 0 ? '+' : ''}${delta} %`;
}

interface RulesetLine {
  /** i18n key under `rules.line.*`. */
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * The rule lines a mode card shows — only the rules that differ from Standard, in a fixed order,
 * so every card lists exactly what the code does.
 */
export function rulesetLines(ruleset: MatchRuleset): RulesetLine[] {
  const lines: RulesetLine[] = [];
  const line = (key: string, values: Record<string, string> = {}): void => { lines.push({ key, values }); };
  if (ruleset.moduleOnlyDamage) line('modulesOnly');
  if (ruleset.alwaysVisible) line('alwaysVisible');
  if (ruleset.juggernaut) line('boss', { hp: String(ruleset.juggernaut.hpScale), reload: String(ruleset.juggernaut.reloadScale) });
  if (ruleset.infection) line('infection');
  if (ruleset.gunGame) line('gunGame', { kills: String(ruleset.gunGame.killsPerWeapon) });
  if (ruleset.gravityScale !== 1) line('gravity', { value: `${Math.round(ruleset.gravityScale * 100) / 100} g` });
  if (ruleset.speedMultiplier !== 1) line('speed', { value: percent(ruleset.speedMultiplier) });
  // the humans' hull; where the hostiles' differs (owner 2026-10-17: the Horde's and the Infected's are low-hull fodder)
  // the same chip pairs it after a slash, own / hostile ("+100 % / -85 %"), so the card gains no line of its own
  const humanHull = ruleset.hpScale * (ruleset.infection?.survivorHpScale ?? 1);
  const hostileHull = hostileHullScale(ruleset);
  if (hostileHull != null) line('hp', { value: `${percent(humanHull)} / ${percent(hostileHull)}` });
  else if (humanHull !== 1) line('hp', { value: percent(humanHull) });
  if (ruleset.damageScale !== 1) line('damage', { value: percent(ruleset.damageScale) });
  if (ruleset.reloadScale !== 1) line('reload', { value: percent(1 / ruleset.reloadScale) });
  if (ruleset.ammo === 'he_only') line('ammoHeOnly');
  if (ruleset.ammo === 'unlimited') line('ammoUnlimited');
  if (ruleset.equipmentSlots === 0) line('noEquipment');
  else if (ruleset.equipmentSlots < 3) line('equipmentSlots', { value: String(ruleset.equipmentSlots) });
  if (!ruleset.consumables) line('noConsumables');
  if (!ruleset.criticalDamage) line('noCriticalDamage');
  if (ruleset.jumpMps != null) line('jump', { value: String(ruleset.jumpMps) });
  if (ruleset.recoilLaunchScale !== 1) line('recoilLaunch', { value: `×${Math.round(ruleset.recoilLaunchScale * 10) / 10}` });
  if (ruleset.mars) {
    if (ruleset.mars.cacheIntervalS > 0) line('marsCaches', { value: String(ruleset.mars.cacheIntervalS) });
    else line('marsCachesOff');
  }
  if (ruleset.shellKnockScale !== 0.3) line('shellKnock', { value: `×${Math.round(ruleset.shellKnockScale * 10) / 10}` });
  // impact physics (2026-09-25): a mode that rebounds harder than the whole game or forgives harder landings says so
  if (ruleset.physics.restitution !== STANDARD_PHYSICS.restitution) {
    line('bounce', { value: `${Math.round(ruleset.physics.restitution * 100)} %` });
  }
  if (ruleset.physics.fallMinMps !== STANDARD_PHYSICS.fallMinMps) line('fallDamage', { value: String(ruleset.physics.fallMinMps) });
  if (ruleset.respawnS != null) line('respawn', { value: String(ruleset.respawnS) });
  else if (ruleset.mode !== 'standard') line('noRespawn');
  if (ruleset.timeLimitS == null) line('noClock');
  else if (ruleset.timeLimitS !== STANDARD.timeLimitS || ruleset.timeout !== 'draw') {
    line(ruleset.timeout === 'defeat' ? 'clockDefeat' : 'clock', { value: `${Math.round(ruleset.timeLimitS / 60)}` });
  }
  if (isWaveMode(ruleset.mode)) {
    if (ruleset.allies === 0) line('noAllies');
    else if (ruleset.allies != null) line('allies', { value: String(ruleset.allies) });
    if (ruleset.enemies != null) line('enemyPool', { value: String(ruleset.enemies) });
  } else if (ruleset.allies != null || ruleset.enemies != null) {
    // sides (owner 2026-09-18): "14 v 14", "1 v 20" — the player counts on the allied side
    const sides = rulesetSides(ruleset);
    if (sides.allies !== STANDARD_SIDES.allies || sides.enemies !== STANDARD_SIDES.enemies) {
      line('sides', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
    }
  }
  // TEAM NATIONS: the card's teams chip where it differs from Standard's MONO-NATION — RANDOM, or a mode whose fiction
  // bends it (the note); the deploy and loading screens pair the actual flags
  const teamsNote = TEAM_NATIONS_MODE_SCOPE[ruleset.mode]?.note ?? null;
  if (ruleset.teamNations === 'random') line('teamsRandom');
  else if (teamsNote) line('teamsMono', { scope: teamsNote });
  if (ruleset.enemyNation && ruleset.teamNations !== 'random') line('enemyNation', { value: ruleset.enemyNation });
  if (ruleset.scoreTarget != null) line('scoreTarget', { value: String(ruleset.scoreTarget) });
  if (ruleset.assault) line('sectorHold', { value: String(ruleset.assault.holdS) });
  if (ruleset.mode === 'capture_the_flag') line('carrierSpeed', { value: percent(FLAG_CARRIER_SPEED_SCALE) });
  if (ruleset.horde) {
    line('hordeWaves', { value: String(hordeWaveSize(ruleset.horde, 1)), step: String(hordeWaveSize(ruleset.horde, 2) - hordeWaveSize(ruleset.horde, 1)) });
    line('hordeField', { value: String(ruleset.horde.maxAlive), lull: String(ruleset.horde.intermissionS) });
    line('waveRepair', { value: `${Math.round(ruleset.horde.waveRepair * 100)} %` });
  }
  if (ruleset.assault) {
    line('assaultWaves', {
      value: String(ruleset.assault.initialActive + ruleset.assault.extraDefenders),
      hp: percent(1 + ruleset.assault.difficultyHp),
    });
  }
  return lines;
}

/** Ammunition capacity for one round under a ruleset. Unlimited rounds keep the authored capacity and are refilled
 * after every shot (refillUnlimitedAmmunition); the HUD prints ∞ from the ruleset, not from the count. */
export function rulesetAmmoCapacity(ruleset: MatchRuleset, shellType: string, authored: number): number {
  if (ruleset.ammo === 'he_only') return shellType === 'HE' ? Math.max(authored, 1) : 0;
  return authored;
}

/** Reload multiplier a spawn folds into the equipment multipliers. */
export function rulesetReloadMultiplier(ruleset: MatchRuleset): number {
  return Math.max(0.1, ruleset.reloadScale);
}

/** Structural view of the combat state a ruleset stamps (damage.ts CombatState and the authority's share it). */
interface RulesetCombatState {
  hp: number;
  maxHp: number;
  ammo: number[];
  ammoCapacity: number[];
  equipMults?: Partial<Record<string, number>>;
  /** Multiplies every hit point lost (damage.ts hull sites and ramming). */
  modeDamageTakenScale?: number;
  /** False keeps modules, crew and fires intact (damage.ts rollModuleDamage / rollCrewHit). */
  modeCriticalDamage?: boolean;
  modeModuleOnlyDamage?: boolean;
}

interface RulesetShellSpec { readonly type?: string }

/**
 * Stamp a freshly created combat state with the ruleset: hull hit points (times the wave / health scale
 * the mode controller hands to a revive), the damage-taken scale, the reload multiplier folded into the
 * equipment multipliers, and the ammunition channels. Call it after applyEquipmentToCombat so the
 * reload fold survives; spawn and revive both go through it, in the browser sim and the authority.
 */
export function applyRulesetToCombat(
  combat: RulesetCombatState,
  shells: readonly RulesetShellSpec[] | null | undefined,
  ruleset: MatchRuleset,
  healthScale = 1,
): void {
  const wave = Number.isFinite(healthScale) && healthScale > 0 ? healthScale : 1;
  const scale = ruleset.hpScale * wave;
  if (scale !== 1) {
    combat.maxHp = Math.max(1, Math.round(combat.maxHp * scale));
    combat.hp = combat.maxHp;
  }
  combat.modeDamageTakenScale = ruleset.damageScale;
  combat.modeCriticalDamage = ruleset.criticalDamage;
  combat.modeModuleOnlyDamage = !!ruleset.moduleOnlyDamage;
  if (ruleset.reloadScale !== 1) {
    const mults = combat.equipMults || (combat.equipMults = {});
    const current = mults.reload;
    mults.reload = (Number.isFinite(current) ? current! : 1) * rulesetReloadMultiplier(ruleset);
  }
  if (ruleset.ammo === 'he_only' && Array.isArray(shells) && combat.ammoCapacity.length) {
    const capacities = combat.ammoCapacity.map((authored, slot) =>
      rulesetAmmoCapacity(ruleset, String(shells[slot]?.type || ''), authored));
    // a vehicle without any HE round keeps its own loadout rather than sortieing empty
    if (capacities.some((capacity) => capacity > 0)) {
      for (let slot = 0; slot < capacities.length; slot++) {
        combat.ammoCapacity[slot] = capacities[slot];
        combat.ammo[slot] = capacities[slot];
      }
    }
  }
}

/** The equipment ids a ruleset honours out of a loadout (0 slots disables equipment). */
export function rulesetLoadout(ruleset: MatchRuleset, ids: readonly string[] | null | undefined): string[] {
  const list = Array.isArray(ids) ? ids.slice() : [];
  return ruleset.equipmentSlots >= 3 ? list : list.slice(0, ruleset.equipmentSlots);
}

/** After a shot under unlimited ammunition, refill the fired channel (the HUD keeps the loadout shape). */
export function refillUnlimitedAmmunition(
  ruleset: MatchRuleset,
  combat: Pick<RulesetCombatState, 'ammo' | 'ammoCapacity'>,
  slot: number,
): void {
  if (ruleset.ammo !== 'unlimited') return;
  if (Number.isInteger(slot) && slot >= 0 && slot < combat.ammoCapacity.length) {
    combat.ammo[slot] = combat.ammoCapacity[slot];
  }
}

/** Solo roster caps: allied bots the player gets under a ruleset (null keeps the default split). */
export function rulesetAllyCap(ruleset: MatchRuleset, defaultCap: number): number {
  return ruleset.allies == null ? defaultCap : Math.max(0, Math.floor(ruleset.allies));
}
