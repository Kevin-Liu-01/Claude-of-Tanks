/**
 * src/audio/audioEngine.ts — the Claude of Tanks sound engine (SFX r5).
 *
 * Sample-driven, event-directed and physically placed:
 *   - ~400 generated sound assets (tools/audio/sfx-catalog.mjs, ElevenLabs
 *     sound-effects model, mastered by tools/audio/build-sfx.mjs) loaded in
 *     lazy groups — the battle roster's powertrains and guns, the map's scene,
 *     the core combat set. Every sound is a recording: nothing is synthesized,
 *     and a cue whose asset is still decoding is silent (no fallback);
 *   - weapons by bore class (7.62 mm … 152 mm, autocannons, launchers) with
 *     close/distant report crossfades, the map's outdoor tail, speed-of-sound
 *     delay, supersonic flybys and the occupied hull's interior report;
 *   - impacts by result, bore and surface; destruction by cause with turret
 *     pops, cook-offs and burning wrecks; props, collisions, edge cases;
 *   - vehicle rigs per powertrain family and running gear (vehicleRig.ts);
 *   - environment scenes per battlefield (environmentScenes.ts);
 *   - national crews over a real-time intercom chain (crewRadio.ts);
 *   - HDR world mix, interior/pause/kill-cam/concussion snapshots, reverb.
 *
 * The AudioContext is adopted from lazyAudio (created in a user gesture);
 * before resume() every method is a silent no-op, so headless captures never
 * touch audio hardware. Presentation only: nothing here feeds the simulation.
 */

import type { RuntimeValue } from '../runtimeTypes.ts';
import type { EventBus } from '../game/stateCore.ts';
import type { AudioListenerPose } from './listenerPoseRuntime.ts';
import { getLocale } from '../ui/i18n.ts';
import { isEraActivation } from '../game/eraActivation.ts';
import {
  atmosphereForMap, clamp, dbToGain, dopplerRatio, gainToDb, mulberry32, rampBetween,
  toListenerFrame, distanceAttenuationDb, panFromRelative,
  type AtmosphereProfile, type ListenerFrame, type RelativePosition,
} from './audioMath.ts';
import { createAssetLibrary, predecodeAssets, type AssetLibrary } from './assetLibrary.ts';
import { createMixer, type Mixer } from './mixer.ts';
import { createVoicePool, type ActiveVoice, type PlayOptions, type VoicePool } from './voicePool.ts';
import { createCrewRadio, type CrewRadio } from './crewRadio.ts';
import { createCrewProcedure, type CrewFrameEntity } from './crewProcedure.ts';
import { resolveCrewLine } from './voiceLines.ts';
import { CAPTION_EVENT, createCaptionStream, type CaptionSoundId } from './captions.ts';
import { createAmbienceDirector, sceneAssets, type AmbienceDirector, type BellTower } from './ambienceDirector.ts';
import { BELL_TOWERS, FLYOVER_BY_AIRCRAFT, GARAGE_SCENE, sceneForMap, type EnvironmentScene } from './environmentScenes.ts';
import { propSoundAssets, propSoundRecipe } from './propSounds.ts';
import { FLAG_CUE, MODE_EVENT_TYPES, hordeWaveSiren, modeOpener, type ModeEventType } from './modeSounds.ts';
import {
  DESTRUCTION_SOUND_IDS, STRUCTURE_FAR, blastSoundCaliberMm, munitionExplodes, munitionFromType, sectionFallSounds, structureHitAsset,
  structureSoundOf, structureStageSounds, type RubbleShareLike, type StructureSound, type StructureSoundMaterial,
} from './destructionSounds.ts';
import type { MunitionClass, StructureBreachEvent, StructureStageEvent } from '../sim/destructionEvents.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import { BUDGETS, BUS_LEVELS, CONCUSSION, SNAPSHOTS, VEHICLE_LOD, type DeviceTier, type SettingsChannel } from './mixPolicy.ts';
import { createVehicleRig, fillVehicleInput, TURRET_DRIVE_SOUND, type RigFrame, type RigLod, type VehicleRig } from './vehicleRig.ts';
import { streetGritShare } from '../world/roadPave.ts';
import { createAerialRig, type AerialFrame, type AerialRig } from './aerialRig.ts';
import { cueProfile } from './soundCues.ts';
import { onDebrisLanding, onTurretLanding } from '../fx/clock.ts';
import { AERIAL_RULES, matchRulesetFor, rulesetUnlimitedFor } from '../sim/matchRuleset.ts';
import { bindInterfaceSounds, type InterfaceSound } from './interfaceSounds.ts';
import {
  resolveVehicleAudioIdentity, CREW_LANGUAGES, ENGINE_FAMILY_IDS, type CrewLanguage, type TrackClass, type VehicleAudioIdentity,
} from './vehicleAudioProfiles.ts';
import type { ModuleHealth, SurfaceId, VehicleAudioInput } from './vehicleAudioModel.ts';
import {
  LAUNCH_ASSET, WEAPON_ROWS, brakeGainDb, eventMount, loaderFor, missileLaunchFor, mountForRound, readyRackDoor, reloadAssets,
  resolveReloadCuePlan, resolveWeaponReport, stationMount, stationRows, weaponMounts, type ReloadCue, type ReloadCuePlan, type WeaponMount, type WeaponRow,
} from './weaponAudio.ts';
import { isCrewVoiceSetting, normalizeCrewVoiceSetting, resolveCrewLanguage, type CrewVoiceSetting } from './crewVoice.ts';
import {
  AUDIO_BATTLE_FACT_EVENTS, audioBattleFact, copyAudioBattleMode, createAudioBattleMode, stepAudioBattleMode,
  type AudioBattleEdge, type AudioBattleEvent, type AudioBattleMode,
} from './battleMode.ts';
import { killcamOwnsScreen } from '../game/killcamScreen.ts';
import {
  GROUND_DEBRIS, MATERIAL_SOUNDS, NEAR_MISS_REACH_M, SPALL, calibreBand, compartmentOf, distantBank, groundMaterial, hitMaterial,
  impactAssetIds, impactLayers, landingResult, nearMissAsset, propMaterial,
  type CalibreBand, type GroundMaterial, type ImpactResult, type StruckMaterial,
} from './impactMaterials.ts';

type Vec3 = readonly [number, number, number];
const UNPLACED: Vec3 = Object.freeze([NaN, NaN, NaN]) as Vec3;

/** Terrain queries the engine needs (the live height-field proxy satisfies it). */
export interface AudioTerrainProbe {
  getHeightAt(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
  getTrackSurfaceAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  /** The paved share of a carriageway (world/roadPave.ts): a dirt road is earth. */
  getRoadPaveAt?(x: number, z: number): number;
}

interface AudioMixerOptions {
  context?: AudioContext | null;
  /**
   * The device's owner (the lazy facade): a mixer built before the first gesture adopts that context when it resumes,
   * and never opens a second one of its own (2026-11-02 audit F11). Without it a mixer opens its own at resume().
   */
  getContext?(): AudioContext | null;
  getMapId?(): string | null;
  /** The battle's game mode (each mode opens on its own sound). */
  getGameMode?(): string | null;
  /** Our side in objective terms ('alpha' | 'bravo'): a network seat's own team reads 'player' whichever side it is. */
  getObjectiveTeam?(): string | null;
  getTerrain?(): AudioTerrainProbe | null;
  /**
   * The battlefield's placed buildings and set pieces (world.getMinimapFeatures().buildings): a planned building's
   * plan id in `kind`, a set piece's kind in `landmark`. The bells ring from its churches, belfries and campanile.
   */
  getLandmarks?(): readonly AudioLandmark[] | null;
  /**
   * What a structure is made of (world.structureDamage(id).anatomy: its rubble materials by share, its mass class): a
   * building breaks, falls and takes a round as its walls are built (destructionSounds.ts structureSoundOf).
   */
  getStructureMakeup?(structureId: number): AudioStructureMakeup | null;
  /** The battlefield the two getters above read when they are not given (main.ts hands the world itself). */
  getWorld?(): AudioWorld | null;
  /**
   * The whole field by side as this seat may count it, where the list update() is given is not the field (2026-10-14). A
   * network seat is sent only the hulls its team spots (spotting filters every snapshot), so its list holds the spotted
   * enemy, never a count of the enemy: the crew's "last enemy" read off it named the first hull spotted while the rest
   * lived. The count is the lobby roster with the authority's deaths (game.rosterTanks: every seat is sent every
   * destroyed hull; the HUD's team tally reads it too), and only where a death is final (matchRuleset deathsAreFinal): a
   * hull's return out of sight is never sent. Null when there is no such count; a list of spotted hulls (its hulls
   * carry `networkVisible`) then has no team-count calls at all.
   */
  getTeamRoster?(): readonly RuntimeValue[] | null;
  /**
   * A vehicle's whole spec by id (the fleet registry), for the hulls the battle warm names before any exists: an engine
   * family turns on a hull's role and weight as well as its id (every IFV's diesel), so the warm resolves it from the
   * same spec its rig will (2026-10-14: by id alone, 40 of the 220 vehicles warmed another family's bank).
   */
  getVehicleSpec?(specId: string): RuntimeValue;
  /** The battle's time of day ('day' | 'sunset' | 'night', engine/battleWeatherPolicy.ts): the night has its own life. */
  getTimeOfDay?(): string | null;
  initialPhase?: string;
  /** The battle mode as the lazy facade tracked it while this mixer loaded (its phase, rollout, verdict, overlays). */
  initialMode?: Readonly<AudioBattleMode>;
  tier?: DeviceTier;
}

/** The slice of the world runtime the mixer reads: its buildings and set pieces, and each structure's damage anatomy. */
export interface AudioWorld {
  getMinimapFeatures?(): { readonly buildings?: readonly AudioLandmark[] | null };
  structureDamage?(structureId: number): { readonly anatomy?: AudioStructureMakeup | null } | null;
}

/** A structure's make-up as the world's damage anatomy carries it (fields beyond these are ignored). */
export interface AudioStructureMakeup {
  readonly rubble?: readonly RubbleShareLike[];
  readonly massClass?: string;
}

/** One placed building or set piece, as the world's feature list carries it (fields beyond x/z are untyped there). */
export interface AudioLandmark {
  readonly x: number;
  readonly z: number;
  readonly kind?: unknown;
  readonly landmark?: unknown;
}

export interface AudioMixer {
  resume(): void;
  bindBus(bus: EventBus): void;
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[], shells?: readonly RuntimeValue[]): void;
  setMasterVolume(value: number): void;
  mute(muted: boolean): void;
  playGarageSting(): void;
  loadingOn(active: boolean): void;
  warmBattleEvents(roster?: readonly string[]): Promise<void> | void;
  ambientOn(active: boolean): void;
}

// ---------------------------------------------------------------- entities ---

interface AudioSpec {
  id?: string;
  nation?: string;
  era?: string;
  role?: string;
  weightTons?: number;
  enginePowerHp?: number;
  topSpeedKmh?: number;
  reverseSpeedKmh?: number;
  hydropneumaticAim?: unknown;
  gun?: {
    caliberMm?: number;
    autoloader?: unknown;
    soundProfile?: string;
    reloadS?: number;
    shells?: readonly { name?: string; type?: string; caliberMm?: number; guided?: boolean; soundProfile?: string; reloadGroup?: string }[];
  };
}

interface AudioEntity {
  id: string;
  team?: string;
  isPlayer?: boolean;
  specId?: string;
  spec?: AudioSpec;
  state: {
    pos: { x: number; y: number; z: number };
    speed: number;
    yaw?: number;
    yawRate?: number;
    verticalSpeed?: number;
    grounded?: boolean;
    landingImpactMps?: number;
    gripLost?: boolean;
    overturned?: boolean;
    turretYawRate?: number;
    gunPitch?: number;
    atGunLimit?: boolean;
    slopeBlocked?: boolean;
  };
  input?: { throttle?: number; brake?: boolean };
  /** Drone and AC-130 modes: the tank's drone in flight, or the gunship this entity is. */
  aerial?: { kind?: string; active?: boolean; launching?: boolean; x?: number; y?: number; z?: number; batteryS?: number; cooldownS?: number; recallS?: number; returnS?: number };
  combat?: {
    destroyed?: boolean;
    hp: number;
    maxHp: number;
    modules?: Partial<Record<string, { state?: string }>>;
    ammo?: readonly number[];
    ammoCapacity?: readonly number[];
    shellSlot?: number;
    /** The roof gun and the lights (sim/auxiliarySystems): the same object solo and in a network battle. */
    auxiliary?: { gunOn?: boolean; lights?: number };
  };
  modeActive?: boolean;
}

interface TankInfo {
  team: string;
  isPlayer: boolean;
  pos: { x: number; y: number; z: number };
  lastX: number;
  lastY: number;
  lastZ: number;
  vx: number;
  vy: number;
  vz: number;
  identity: VehicleAudioIdentity;
  /** The spec id and nation the crew is resolved from (a same-entity vehicle change re-resolves it). */
  specId: string;
  nation: string;
  alive: boolean;
  spotted: boolean;
  /** Wears a field net and garnish (its visual's userData.fieldSuit; null until a visual has been seen). */
  suited: boolean | null;
  /** Its gun and the gun's mounts (rebuilt when the gun changes: a Gun Game step or the AC-130 swaps the gun object); the
   *  mounts' loaders are read by `specId` (MAIN_GUN_LOADER). */
  gun: AudioSpec['gun'] | null;
  mounts: readonly WeaponMount[];
}

function toEntity(value: RuntimeValue): AudioEntity | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as { id?: unknown; state?: { pos?: { x?: unknown; y?: unknown; z?: unknown }; speed?: unknown } };
  if (typeof e.id !== 'string' || !e.state?.pos || typeof e.state.pos.x !== 'number'
    || typeof e.state.pos.y !== 'number' || typeof e.state.pos.z !== 'number' || typeof e.state.speed !== 'number') return null;
  return value as AudioEntity;
}

/** The selected weapon holds no round, loaded or stowed (the simulation only leaves an empty slot selected once every
 * channel is spent). A state without an inventory never reads spent, and neither does the ruleset's unlimited-rounds
 * mark, whatever the counters say — the HUD's read (the shell cards carry the same mark). */
function selectedWeaponSpent(combat: AudioEntity['combat'] | null | undefined, unlimited = false): boolean {
  if (unlimited) return false;
  const ammo = combat?.ammo;
  const slot = combat?.shellSlot;
  if (!ammo || slot == null || !Number.isInteger(slot) || slot < 0 || slot >= ammo.length) return false;
  return !((ammo[slot] ?? 0) >= 1);
}

function moduleHealth(entity: AudioEntity, name: string): ModuleHealth {
  const s = entity.combat?.modules?.[name]?.state;
  return s === 'red' ? 'red' : s === 'yellow' ? 'yellow' : 'ok';
}

// ------------------------------------------------------------ event shapes ---

interface ShellFiredEvent {
  feedbackPredicted?: boolean;
  shellId?: number;
  shooterId?: string;
  muzzlePos: Vec3;
  caliberMm: number;
  isPlayer?: boolean;
  weaponSound?: string | null;
  muzzleIndex?: number;
  dir: Vec3;
  velocityMps?: number;
  shellType: string;
  /** The round's own name (a guided round's family: how it leaves its launcher). */
  shellName?: string;
}

interface ShellHitEvent {
  shellId?: number;
  pos: Vec3;
  kind: string;
  targetId?: string | null;
  attackerId?: string | null;
  damage?: number;
  caliberMm?: number;
  destroyed?: boolean;
  fireStarted?: boolean;
  targetMaxHp?: number;
  targetHpAfter: number;
  crewHit?: string[];
  modulesHit?: { module: string; newState?: string }[];
  shellType?: string;
  eraPlate?: string | null;
  eraActivations?: readonly { plate: string; pos?: Vec3 }[];
  /** (impact-materials-269) what the round struck (sim/plateMaterial.ts) and the outer screen it went through first */
  material?: string;
  screenMaterial?: string;
  /** where it struck (the hull's or turret's frame) and the point in that frame: the compartment a penetration bursts into */
  impactFrame?: string | null;
  impactLocalPos?: Vec3 | null;
  localPos?: Vec3 | null;
}

interface ShellExpiredEvent { shellId?: number; shooterId?: string; hitTerrain?: boolean; hitKind?: string; surfaceKind?: string; caliberMm?: number; pos?: Vec3;
  /** (impact-materials-269) the round's incidence off the surface's normal (0 straight in, 90 grazing) */
  impactAngleDeg?: number;
  /** the building the round struck (2026-10-10), when it struck one */
  structureId?: number;
  /** the round's type, and the destruction catalog's class and charge when published (destruction-fx lane) */
  shellType?: string; munition?: MunitionClass; chargeKg?: number }
interface TankDestroyedEvent { id: string; killerId?: string | null; pos: Vec3; cause?: string;
  /** (ac130-fx-228) the kill's platform when not the killer's vehicle (the authority's sim/aerialCombat.ts killSourceOf) */
  source?: string }
interface ModuleStateEvent { id: string; module: string; state: string; source?: string; repaired?: boolean }
/** `cause`: 'impact' (a hard obstacle), 'fall' (a landing) or 'contact' (another hull); `struck`: the obstacle's record kind
 *  ('cliff' for the terrain's own face) when the solo step knows it. */
interface TankImpactEvent { id?: string; pos: Vec3; speedMps: number; cause?: string; struck?: string | null;
  /** the building struck, when the solo step knows it (`struck` 'structure'): it sounds of its walls */
  struckStructureId?: number | null }
interface TankRamEvent { aId?: string; bId?: string; aIsPlayer?: boolean; bIsPlayer?: boolean; pos: Vec3; closingMps?: number; dmgA?: number; dmgB?: number }
/** `loose`: a loose prop (a drum, a bucket) knocked about rather than destroyed (props.ts kickLooseRecord). */
interface PropEvent { id?: string; kind?: string; pos: Vec3; h?: number; cause?: string; speedMps?: number; loose?: boolean; nearMiss?: number }
interface ReloadEvent { total?: number; kind?: string; caliberMm?: number; t?: number; progress?: number; done?: boolean; magazineCapacity?: number }
interface VolumeEvent { master?: number; engine?: number; combat?: number; ambience?: number; ui?: number; voice?: number; alarmHeartbeat?: boolean; crewVoice?: string; concussion?: boolean }
interface SmokeScreen { born?: number; x?: number; y?: number; z?: number; source?: readonly unknown[] }

// ------------------------------------------------------------------ engine ---

// The report banks (close, own, distant) live in weaponAudio.ts with the classes (the coverage receipt reads them).

/** A loop the engine wants sounding and can stop (the fire alarm, the heartbeat, the loading bed, a wreck's fires). */
interface Rig {
  stop(fadeS?: number): void;
  /** Its recording is playing now (it may still be decoding, or have been refused like any cue). */
  readonly sounding: boolean;
}

/**
 * A wanted loop (2026-11-02 audit F11): 'waiting' until its recording plays (it may still be decoding, or the graph
 * not exist yet), 'playing', then 'off' once stopped, or refused once decoded (out of range, culled, as any cue). A
 * stop from either state is final.
 */
interface LoopWant {
  readonly id: string;
  readonly options: PlayOptions;
  /** When it was wanted (ctx time; -1 before the graph existed): a late start keeps its delay and its length. */
  from: number;
  state: 'waiting' | 'playing' | 'off';
  voice: ActiveVoice | null;
}

/** The rows a roof or auxiliary station fires (machine guns and the remote 30 mm cannons): every battle's reports. */
const ROOF_STATION_ROWS: readonly WeaponRow[] = [WEAPON_ROWS['7.62/belt'], WEAPON_ROWS['12.7/belt'], WEAPON_ROWS['30/belt']];

/** Assets every battle needs before the first shot. */
const CORE_BATTLE = [
  'pen_heavy', 'pen_light', 'pen_interior', 'ricochet_heavy', 'ricochet_light', 'nonpen_heavy', 'nonpen_interior',
  'impact_far_pen', 'impact_far_nonpen', 'impact_far_ricochet',
  'heat_impact', 'he_armor', 'era_det', 'bullet_armor', 'bullet_dirt', 'bullet_water', 'bullet_masonry', 'bullet_metal', 'bullet_wood',
  'ground_dirt', 'ground_rock',
  'ground_sand', 'ground_snow', 'ground_mud', 'ground_concrete', 'ground_wood', 'ground_metal', 'water_big', 'water_small',
  'expl_he_small', 'expl_he_medium', 'expl_he_large', 'expl_far', 'debris_dirt', 'tank_explode', 'tank_explode_ammo',
  'turret_land', 'debris_metal', 'cookoff_loop', 'wreck_fire_loop', 'fire_ignite', 'burnout_blast', 'metal_creak',
  'shell_flyby_sabot', 'shell_flyby_he', 'bullet_crack', 'missile_flyby', 'ram_heavy', 'ram_light', 'hit_rock',
  'hit_wall', 'tree_snap', 'tree_fall', 'fence_wood', 'fence_metal', 'car_crush', 'crate_break', 'rubble_crunch',
  'gear_shift', 'brake_squeal', 'brake_hiss', 'susp_bump', 'susp_land', 'susp_creak', 'track_break', 'track_squeal_loop',
  'track_skid_loop', 'water_wade_loop', 'water_enter', 'engine_knock_loop', 'turret_stop',
  'tail_open', 'tail_forest', 'tail_urban', 'tail_mountain', 'smoke_launcher', 'smoke_burst',
  'radio_interference', 'ui_alert',
  'blast_punch_light', 'blast_punch_medium', 'blast_punch_heavy', 'blast_sub',
  // round 1 (2026-10-13): hull landings and steel strikes, the far ammunition blast and ground thump, every launch
  'hull_land', 'hit_metal', 'ammo_explode_far', 'impact_far_ground', 'launch_far', 'net_rustle_loop',
  'launch_tube', 'launch_soft', 'launch_rail', 'launch_gun',
  ...DESTRUCTION_SOUND_IDS,
  'gear_whine_loop', 'electric_drive_loop', 'turbo_whistle_loop',
  'sting_battle', 'distant_artillery', 'distant_flak', 'distant_mg', 'jet_flyover',
  // world-sfx-269 (2026-11-03): the running gear by gearbox and hull class, water under any hull, crashes by what they
  // struck, a light vehicle's end, an active protection system's intercept
  'gear_shift_auto', 'susp_bump_light', 'susp_land_light', 'track_scrub_soft_loop', 'water_splash_in', 'water_exit',
  'hit_timber', 'hit_earth', 'vehicle_explode_light', 'aps_intercept',
];

const PLAYER_HULL = [
  // our own weapons' reports and their loaders' machinery follow our hull (preloadOwnWeapons); the Gun Game's changeover
  // (weaponChangeover) loads by hand whatever hull it changes
  'gun_recoil_mech', 'turret_start', 'ac_feed', 'latch_ready', 'breech_open', 'shell_ram', 'breech_close', 'missile_tube_load',
  'magazine_swap', 'repair_kit', 'first_aid', 'extinguisher',
  'ammo_select', 'missile_mode', 'dry_fire', 'gun_limit', 'traverse_grind_loop', 'rollover', 'overturned_groan',
  'engine_flood', 'bubbles_loop', 'hull_debris_patter', 'scope_in', 'scope_out', 'lock_on', 'lock_off',
  'missile_warning', 'roof_gun_servo', 'tinnitus', 'hydro_susp', 'jump_launch', 'self_right', 'hatch', 'switch_toggle',
  'hull_thud_sub', 'alarm_fire_loop', 'alarm_ammo', 'heartbeat_loop', 'lights_on', 'zoom_step',
  'turret_start_hydraulic', 'turret_stop_hydraulic',
];

const UI_SET = [
  'ui_click', 'ui_toggle', 'ui_back', 'ui_confirm', 'ui_error', 'ui_tab', 'ui_tank_select', 'ui_deploy',
  'ui_slider', 'ui_ready', 'sting_garage', 'loading_bed_loop',
];

/** The battle loader's bed (loadingOn). */
const LOADING_BED = 'loading_bed_loop';

/** The crew radio's keyed elements and net static, decoded from boot like the interface. */
const RADIO_SET = ['radio_interference', 'radio_key_in', 'radio_key_out', 'radio_static_loop'];

/** The reasoning exchange waits this long for a quiet net, gives the answer as long to follow the commander's line
 * (about 3 s of speech, the release and the net's gap), and rarely opens on our first shot. */
const THINK_WAIT_S = 8;
const THINK_REPLY_S = 7;
const THINK_FIRST_SHOT_P = 0.03;
const THINK_MEDALS = new Set(['chain_of_thought', 'step_by_step']);

/** Aircraft of the Drone and AC-130 modes, decoded on first sight of one. */
const AERIAL_SET = [
  'drone_fpv_loop', 'drone_fpv_hover_loop', 'drone_wind_loop', 'drone_spinup', 'drone_feed_static_loop', 'drone_link_lost',
  'gunship_orbit_loop', 'gunship_cabin_loop', 'gunship_cabin_rattle_loop', 'gunship_flyover',
  'gunship_30mm_own', 'gunship_howitzer_own', 'gunship_missile_own', 'gunship_30mm_far', 'gunship_howitzer_far',
  'gunship_casing_drop', 'gunship_round_load', 'gunship_weapon_select', 'drone_shot_down',
];

const MODE_SET = [
  'sting_infected',
  'ui_capture_tick', 'ui_objective_gain', 'ui_objective_loss', 'ui_pickup', 'ui_goal', 'ball_strike', 'ui_respawn',
  'ui_flag_taken', 'ui_flag_seized', 'ui_flag_captured', 'ui_flag_returned', 'ui_flag_dropped', 'ui_wave_clear', 'ui_line_advance',
  'ui_score', 'sting_wave', 'sting_victory', 'sting_defeat', 'sting_draw', 'killcam_in', 'killcam_out', 'spectate_switch',
  'ui_countdown_tick', 'ui_countdown_go',
  'mode_horde_siren', 'mode_horde_all_clear', 'mode_frontline_barrage', 'mode_juggernaut', 'mode_infected_outbreak',
  'mode_turbo_horn', 'mode_gungame_armory', 'cache_drop',
  'mode_horde_swarm', 'mode_counter_attack',
];

/**
 * The loops a hull's rig may start the moment it exists (vehicleRig.ts, beside its engine bands and track loops): the
 * running gear's extras, the drivetrain whines, and our own turret drive, gun servo and cabin. Part of a battle's
 * presence set (presenceAssets): heard from the countdown's first frame.
 */
const RIG_LOOPS = [
  'track_squeal_loop', 'track_scrub_soft_loop', 'track_skid_loop', 'water_wade_loop', 'engine_knock_loop',
  'gear_whine_loop', 'turbo_whistle_loop', 'electric_drive_loop',
  'turret_hydraulic_loop', 'turret_electric_loop', 'elevation_servo_loop', 'interior_hum_loop', 'interior_rattle_loop',
];

/** How long our start-up waits for its recording before the bank fades in without it (a cold first battle). */
const START_WAIT_S = 1;

/** The countdown ticks its last whole seconds (3, 2, 1); the horn is the rollout's. */
const COUNTDOWN_TICK_S = 3;

/** A crash by the material of what the hull struck (world-sfx-269): exhaustive, so a new material needs its recording. */
type HullStrikeMaterial = 'rock' | 'steel' | 'masonry' | 'timber' | 'earth';
const STRUCK_SOUND: Readonly<Record<HullStrikeMaterial, string>> = Object.freeze({
  rock: 'hit_rock', steel: 'hit_metal', masonry: 'hit_wall', timber: 'hit_timber', earth: 'hit_earth',
});
/** A building's walls (destructionSounds.ts) as a hull strikes them. */
const STRUCTURE_STRUCK: Readonly<Record<StructureSoundMaterial, HullStrikeMaterial>> = Object.freeze({
  brick: 'masonry', stone: 'masonry', concrete: 'masonry', plaster: 'earth', timber: 'timber', steel: 'steel',
});

/**
 * A vehicle going up, by its class (world-sfx-269): a light vehicle's thin hull and small charge are not a main battle
 * tank's; until this a 14 t BMP and a 130 t E-100 exploded alike.
 */
const EXPLOSION_SOUND: Readonly<Record<TrackClass, { readonly shot: string; readonly ammorack: string }>> = Object.freeze({
  light: Object.freeze({ shot: 'vehicle_explode_light', ammorack: 'vehicle_explode_light' }),
  heavy: Object.freeze({ shot: 'tank_explode', ammorack: 'tank_explode_ammo' }),
});


function detectTier(): DeviceTier {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { deviceMemory?: number } : null;
  if (!nav) return 'desktop';
  const touch = (nav.maxTouchPoints || 0) > 1 && /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '');
  return touch || (nav.deviceMemory != null && nav.deviceMemory <= 4) ? 'mobile' : 'desktop';
}

/** The garage's and menus' press sounds, decoded at boot idle before any engine exists (prepareInterfaceSounds). */
const INTERFACE_PRESS = Object.freeze(['ui_click', 'ui_hover', 'ui_back', 'ui_confirm', 'ui_tab', 'ui_toggle', 'ui_tank_select']);
let interfaceSeed: Map<string, AudioBuffer[]> | null = null;
let interfaceSeeding: Promise<void> | null = null;

/**
 * Decode the interface set at boot idle (the facade calls it after the first frame, before anyone can press anything),
 * with no audio device: the engine built at the first press starts with these sounds ready, so a click is never late.
 */
export function prepareInterfaceSounds(): Promise<void> {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  interfaceSeeding ??= predecodeAssets(INTERFACE_PRESS, { base }).then((seed) => { interfaceSeed = seed; }, () => {});
  return interfaceSeeding;
}

export function createAudio({
  context: initialContext = null,
  getContext,
  getMapId,
  getGameMode,
  getObjectiveTeam,
  getTerrain,
  getLandmarks: givenLandmarks,
  getStructureMakeup: givenMakeup,
  getWorld,
  getTeamRoster,
  getVehicleSpec,
  getTimeOfDay,
  initialPhase = 'garage',
  initialMode,
  tier: forcedTier,
}: AudioMixerOptions = {}): AudioMixer {
  const getLandmarks = givenLandmarks ?? (getWorld ? () => getWorld()?.getMinimapFeatures?.().buildings ?? null : undefined);
  const getStructureMakeup = givenMakeup ?? (getWorld ? (id: number) => getWorld()?.structureDamage?.(id)?.anatomy ?? null : undefined);
  const tier: DeviceTier = forcedTier ?? detectTier();
  const budget = BUDGETS[tier];
  let ctx: AudioContext | null = initialContext;
  let mixer: Mixer | null = null;
  let library: AssetLibrary | null = null;
  let pool: VoicePool | null = null;
  let radio: CrewRadio | null = null;
  let ambience: AmbienceDirector | null = null;
  const random = mulberry32(0x7a11c);
  // The reasoning exchange's rare first-shot chance draws apart, leaving every other call's sequence as it was.
  const thinkRandom = mulberry32(0x5e9b7);

  // ---- settings (cot.settings.v1, live via 'ui:volumes').
  let masterVolume = 0.8;
  let muted = false;
  let alarmHeartbeat = true;
  let concussionFx = true;
  let crewVoice: CrewVoiceSetting = 'national';
  const chan: Record<SettingsChannel, number> = { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 };
  const unit = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : fallback);
  try {
    const s = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null');
    if (s && typeof s === 'object') {
      masterVolume = unit(s.volMaster, masterVolume);
      chan.engine = unit(s.volEngine, 1);
      chan.combat = unit(s.volCombat, 1);
      chan.ambience = unit(s.volAmbience, 1);
      chan.ui = unit(s.volUi, 1);
      chan.voice = unit(s.volVoice, 1);
      if (typeof s.alarmHeartbeat === 'boolean') alarmHeartbeat = s.alarmHeartbeat;
      if (typeof s.audioConcussion === 'boolean') concussionFx = s.audioConcussion;
      crewVoice = normalizeCrewVoiceSetting(s.crewVoice, s.crewVoice === 'interface' ? getLocale() : null);
    }
  } catch { /* private mode */ }

  // ---- listener and battle context.
  const frame: ListenerFrame = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
  const rel: RelativePosition = { right: 0, up: 0, ahead: 0, distance: 0 };
  // Captions (brand-ui SPEC 10 and 14, BUI-F9): every transmission the crew radio keys and the CAPTION_SOUNDS cues go out
  // on the bus as 'audio:caption', with the speaker and the direction from the listener; the HUD's renderer shows them
  // when the player turns captions on (src/audio/captions.ts).
  let captionBus: EventBus | null = null;
  const captions = createCaptionStream({
    emit: (event) => { captionBus?.emit(CAPTION_EVENT, event); },
    now: () => ctx?.currentTime ?? 0,
  });
  const captionRel: RelativePosition = { right: 0, up: 0, ahead: 0, distance: 0 };
  /** Caption a cue heard at a world point (its direction from the listener), or inside our own tank (no point); a cue
   *  whose sound is scheduled later (a shell's crack as it passes, an aircraft's pass) is captioned when it is heard:
   *  due on the audio clock (a suspended device holds it with its sound), and only in the battle that scheduled it. */
  function caption(id: CaptionSoundId, x?: number, y?: number, z?: number, delayS = 0): void {
    if (delayS > 0.05) {
      if (ctx) pendingCaptions.push({ id, x, y, z, at: ctx.currentTime + delayS, battle: battleMode.battle });
      return;
    }
    if (battleMode.phase !== 'battle' || battleMode.over) return;
    if (x === undefined || y === undefined || z === undefined || !listenerValid) { captions.sound(id, null); return; }
    toListenerFrame(frame, x, y, z, captionRel);
    captions.sound(id, captionRel);
  }
  // Captions of cues heard later, due on the audio clock (flushCaptions in update; 2026-11-02 audit F11).
  const pendingCaptions: { id: CaptionSoundId; x?: number; y?: number; z?: number; at: number; battle: number }[] = [];
  function flushCaptions(now: number): void {
    for (let i = 0; i < pendingCaptions.length;) {
      const due = pendingCaptions[i];
      if (due.at > now) { i++; continue; }
      pendingCaptions.splice(i, 1);
      if (due.battle === battleMode.battle) caption(due.id, due.x, due.y, due.z);
    }
  }
  let listenerValid = false;
  let listenerKind: AudioListenerPose['kind'] = 'camera';
  let listenerOwnerId: string | null = null;
  let listenerScoped = false;
  let wasScoped = false;
  // The battle mode (battleMode.ts): the phase, the stage (loading, live, over, presented), the overlays (paused,
  // kill-cam) and the battle's serial. Its one writer is applyMode(), fed by the bus facts that move it.
  const battleMode: AudioBattleMode = initialMode ? copyAudioBattleMode(initialMode) : createAudioBattleMode(initialPhase);
  // The kill-cam overlay is the replay controller's own flag on the bound bus (src/game/killcamScreen.ts, IR15): read at
  // its begin/done edges and every frame (syncKillcam), so a done that never reaches this mixer cannot keep the kill-cam
  // mix, and a repeated begin or a done with no begin plays no whoosh.
  let modeBus: EventBus | null = null;
  const killcamLive = (): boolean => killcamOwnsScreen(modeBus);
  const KILLCAM_ON: AudioBattleEvent = Object.freeze({ kind: 'killcam', on: true });
  const KILLCAM_OFF: AudioBattleEvent = Object.freeze({ kind: 'killcam', on: false });
  function syncKillcam(): void {
    const live = killcamLive();
    if (battleMode.killcam !== live) applyMode(live ? KILLCAM_ON : KILLCAM_OFF);
  }
  let loading: Rig | null = null;
  let loadingActive = false;
  let ambientWanted = false;
  let playerId: string | null = null;
  let playerTeam: string | null = null;
  let atmosphere: AtmosphereProfile = atmosphereForMap(null);
  let scene: EnvironmentScene = GARAGE_SCENE;
  const tanks = new Map<string, TankInfo>();
  // One death a life (2026-11-02 audit F11): a hull whose death was heard, until it is seen destroyed and then alive
  // again (a respawn), or a mode announces its respawn. The value is whether it has been seen destroyed since.
  const deathLatch = new Map<string, boolean>();
  const rigs = new Map<string, VehicleRig>();
  const moduleStates = new Map<string, string>();
  const wrecks: { until: number; loops: Rig[]; nextCreak: number; x: number; y: number; z: number }[] = [];
  // Wanted loops still waiting for their recording or the graph (startLoop retries them as each lands).
  const waitingLoops: LoopWant[] = [];
  let probeSolo: string | null = null;
  const soundLog: Record<string, unknown>[] = [];
  let soundSeq = 0;
  const killcamLog: Record<string, unknown>[] = [];

  // The listener's main-gun rounds in flight (muzzle and unit direction), for the gunner's miss call.
  const ownRounds = new Map<number, { x: number; y: number; z: number; dx: number; dy: number; dz: number }>();

  // Player battle bookkeeping (every field below is per battle: resetBattleFields() sets each back).
  let bossId: string | null = null;
  let bossChecked = false;
  let movedOnce = false;
  let lowHpCalled = false;
  let ammoLowCalled = false;
  let lastStanding = { mine: false, theirs: false, outnumbered: false };
  // This battle's list is what a network seat's team spots (its hulls carry `networkVisible`): never a count of a side.
  let spottedField = false;
  let lastKillAt = -99;
  let thinkStage: 'idle' | 'wait' | 'reply' = 'idle';
  let thinkUntil = 0;
  let thoughtThisBattle = false;
  let firstShotHeard = false;
  let lastSpots: number[] = [];
  let lastSpotCallAt = -99;
  // "We're spotted" once per exposure, not every time an enemy's view flickers back onto a still tank.
  let lastSixthSenseAt = -99;
  let lastSixthAlertAt = -99;
  // Enemy drones already called out (each drone once).
  const droneWarned = new Set<number>();
  /** Where each carrier's drone was last heard in flight (by the carrier's id; drone:down names it). */
  const droneLastAt = new Map<string, { x: number; y: number; z: number }>();
  let fireAlarm: Rig | null = null;
  let heartbeatRig: Rig | null = null;
  let heartbeatBelow = 0;
  let playerBurning = false;
  let wasOverturned = false;
  let wasDeep = false;
  let stuckS = 0;
  let wasAtLimit = false;
  let lastGunLimitAt = -99;
  let slewS = 0;
  let lastTurretStopAt = -99;
  let lastTurretStartAt = -99;
  let lastPitch: number | null = null;
  // Smoke screens already heard, by birth time on the battle's sim clock (which restarts at 0 every battle).
  let lastSmokeBorn = -1;
  // Our roof gun and lights as last seen (null until the first look, so a battle's opening state is not a switch).
  let auxGunOn: boolean | null = null;
  let auxLights: number | null = null;
  // Our drone's last battery and range while it flew: how the flight ended decides the commander's call.
  const ownDroneLast = { batteryS: 0, rangeM: 0 };
  const reload: { active: boolean; total: number; kind: string; caliber: number; lastT: number; next: number; plan: ReloadCuePlan | null } = {
    active: false, total: 0, kind: 'shell', caliber: 100, lastT: 0, next: 0, plan: null,
  };
  let reloadCalled = false;
  const surfaceCache = new Map<string, { surface: SurfaceId; depth: number; occluded: number; at: number }>();
  const input: VehicleAudioInput = {
    dtS: 0, speedMps: 0, topSpeedMps: 1, reverseTopMps: 1, throttle: 0, brake: false, yawRate: 0,
    grounded: true, verticalSpeedMps: 0, landingImpactMps: 0, gripLost: false, engine: 'ok', immobilized: false,
  };
  const rigFrame: RigFrame = {
    dtS: 0, rel: { right: 0, up: 0, ahead: 0, distance: 0 }, x: 0, y: 0, z: 0, own: false, scoped: false,
    surface: 'earth', waterDepthM: 0, atmosphere, occluded: 0, doppler: 1, turretRate: 0, pitchRate: 0, cabin: 0, suited: false, input,
  };

  function logSound(type: string, data: Record<string, unknown> = {}): void {
    soundLog.push({ seq: ++soundSeq, t: ctx ? +ctx.currentTime.toFixed(3) : 0, type, ...data });
    if (soundLog.length > 256) soundLog.shift();
  }

  const ready = (): boolean => !!(ctx && mixer && pool && library);

  // -------------------------------------------------------------- helpers ---

  function play(id: string, options?: PlayOptions): boolean {
    if (!pool) return false;
    if (listenerKind === 'player-drone' && library) {
      // Flying the drone we listen through it: the hull we sit in is felt only when it is
      // hit (muffled, under the feed), and its machinery is not heard at all.
      const cue = cueProfile(id, library.record(id)?.g ?? 'impacts');
      if ((options?.space ?? cue.space) === 'hull') {
        if ((options?.bus ?? cue.bus) !== 'ownCombat') return false;
        options = { ...options, gainDb: (options?.gainDb ?? 0) - 10, lowpassHz: Math.min(options?.lowpassHz ?? 22000, 1600) };
      }
    }
    return !!pool.play(id, options);
  }

  /**
   * A looping cue the engine wants, as a stoppable handle (2026-11-02 audit F11): it starts now, or as soon as its
   * recording has decoded or the graph exists, so a cold first battle's loader bed, a fire alarm, a wreck's fires or the
   * heartbeat asked for while decoding are heard late rather than never. A missing loop stays silent.
   */
  function loopRig(id: string, options: PlayOptions = {}): Rig {
    const want: LoopWant = { id, options, from: ctx ? ctx.currentTime : -1, state: 'waiting', voice: null };
    startLoop(want);
    return {
      stop(fadeS = 0.2) {
        const voice = want.voice;
        want.state = 'off';
        want.voice = null;
        const at = waitingLoops.indexOf(want);
        if (at >= 0) waitingLoops.splice(at, 1);
        if (voice) pool?.stop((v) => v === voice, fadeS);
      },
      get sounding() { return want.state === 'playing' && !!want.voice && !want.voice.dead; },
    };
  }

  function startLoop(want: LoopWant): void {
    if (want.state !== 'waiting') return;
    if (!pool || !library || !ctx) { if (!waitingLoops.includes(want)) waitingLoops.push(want); return; }
    if (want.from < 0) want.from = ctx.currentTime;
    const elapsed = ctx.currentTime - want.from;
    const { delayS = 0, maxDurS } = want.options;
    // a loop with a length (the heartbeat) whose moment has passed while it decoded is not started at all (and leaves
    // the waiting list below: U34, round 2)
    if (maxDurS != null && maxDurS - elapsed < 0.5) want.state = 'off';
    else {
      const decoded = library.has(want.id);
      const voice = pool.play(want.id, elapsed > 0.001
        ? { ...want.options, loop: true, delayS: Math.max(0, delayS - elapsed), ...(maxDurS != null ? { maxDurS: maxDurS - elapsed } : {}) }
        : { ...want.options, loop: true });
      if (voice) { want.voice = voice; want.state = 'playing'; }
      else if (decoded) want.state = 'off';
      else {
        // still decoding (the ask above queued it in the front lane): start it when it lands. A decode that fails, or an
        // ask inside the library's retry backoff, is asked again by sweepWaitingLoops once that backoff has run out.
        if (!waitingLoops.includes(want)) waitingLoops.push(want);
        const lib = library;
        void lib.load([want.id]).then(() => { if (want.state === 'waiting' && lib.has(want.id)) startLoop(want); });
      }
    }
    if (want.state !== 'waiting') {
      const at = waitingLoops.indexOf(want);
      if (at >= 0) waitingLoops.splice(at, 1);
    }
  }

  /**
   * A wanted loop whose recording failed (a transient fetch error), or that was asked for inside the library's retry
   * backoff, waits with no load in flight: about once a second (on the audio clock) each one whose retry is due asks
   * again (U34, round 2). In place, no allocation; startLoop may take the want off the list, so it walks backwards.
   */
  let loopSweepAt = 0;
  function sweepWaitingLoops(now: number): void {
    if (!library || waitingLoops.length === 0 || now < loopSweepAt) return;
    loopSweepAt = now + 1;
    for (let i = waitingLoops.length - 1; i >= 0; i--) {
      const want = waitingLoops[i];
      if (want && library.retryDue(want.id)) startLoop(want);
    }
  }

  function at(p: Vec3 | { x: number; y: number; z: number }): PlayOptions {
    return Array.isArray(p) ? { x: (p as Vec3)[0], y: (p as Vec3)[1], z: (p as Vec3)[2] } : { x: (p as { x: number }).x, y: (p as { y: number }).y, z: (p as { z: number }).z };
  }

  function distanceTo(x: number, y: number, z: number): number {
    toListenerFrame(frame, x, y, z, rel);
    return rel.distance;
  }

  function isOwn(id: string | null | undefined): boolean {
    return id != null && (id === listenerOwnerId || (listenerOwnerId == null && id === playerId));
  }

  function teamOf(id: string | null | undefined): string | null {
    return id != null ? tanks.get(id)?.team ?? null : null;
  }

  function sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
    const ta = teamOf(a);
    const tb = teamOf(b);
    return ta != null && ta === tb;
  }

  function objectiveTeam(team: string | null): 'alpha' | 'bravo' {
    return team === 'bravo' || team === 'enemy' ? 'bravo' : 'alpha';
  }

  /** Crew radio requests and what the net did with each (bounded; the debug surface's sayLog). */
  const sayLog: { id: string; t: number; ok: boolean; why?: string }[] = [];

  function say(asked: string, options?: Parameters<CrewRadio['say']>[1]): boolean {
    // the moment's line in this mode's and this seat's own words (voiceLines.ts resolveCrewLine), or nothing
    const id = resolveCrewLine(asked, crew.context());
    if (id == null) {
      sayLog.push({ id: asked, t: ctx ? +ctx.currentTime.toFixed(3) : 0, ok: false, why: 'mode' });
      if (sayLog.length > 160) sayLog.shift();
      return false;
    }
    // a take index names the asked line's take, not its stand-in's
    if (id !== asked && options?.take != null) options = { ...options, take: undefined };
    let why: string | undefined;
    if (!radio || battleMode.phase !== 'battle') why = 'phase';
    else if (playerId != null && tanks.get(playerId)?.alive === false && id !== 'victory' && id !== 'defeat' && id !== 'draw') why = 'dead';
    const ok = why == null && !!radio?.say(id, options);
    sayLog.push({ id, t: ctx ? +ctx.currentTime.toFixed(3) : 0, ok, ...(why ? { why } : !ok ? { why: 'net' } : {}) });
    if (sayLog.length > 160) sayLog.shift();
    return ok;
  }

  /** The crew's procedure calls the sound handlers leave unvoiced (crewProcedure.ts). */
  const crew = createCrewProcedure({
    say,
    now: () => ctx?.currentTime ?? 0,
    // the battle mode's own facts (2026-11-02 audit F11: battleMode.ts), never flags of the crew's or the engine's
    live: () => battleMode.phase === 'battle' && battleMode.rolledOut && !battleMode.over && playerId != null && tanks.get(playerId)?.alive !== false,
    inBattle: () => battleMode.phase === 'battle' && !battleMode.over,
    playerId: () => playerId,
    player: () => (latestPlayer && latestPlayer.id === playerId ? latestPlayer : null),
    tanks: () => tanks,
    sameTeam,
    objectiveTeam: () => {
      const perspective = getObjectiveTeam?.();
      return perspective === 'alpha' || perspective === 'bravo' ? perspective : objectiveTeam(playerTeam);
    },
    mode: () => (getGameMode?.() || 'standard') as GameModeId,
    bossId: () => bossId,
    radioQuiet: () => !!radio?.quiet,
    lastTransmission: () => radio?.log.at(-1),
    forgetOwnRound: (shellId) => { ownRounds.delete(shellId); },
  });

  /**
   * "Let me think step by step." A reasoning medal (Chain of Thought, or five hits in a row) and, rarely, our first
   * shot of a battle ask for it, once a battle. It is flavour that gives way to any real call: the commander speaks
   * only on a quiet net (waiting up to THINK_WAIT_S, so the kill call goes first), and the gunner's "Step one: aim.
   * Step two: fire." follows only when the net is quiet again and the commander's line was the last thing said.
   */
  function requestThink(): void {
    if (thoughtThisBattle || thinkStage !== 'idle' || !ctx || battleMode.phase !== 'battle' || battleMode.over) return;
    thinkStage = 'wait';
    thinkUntil = ctx.currentTime + THINK_WAIT_S;
  }

  function updateThink(now: number): void {
    if (thinkStage === 'idle' || !radio) return;
    if (now > thinkUntil || battleMode.over || battleMode.phase !== 'battle') { thinkStage = 'idle'; return; }
    if (!radio.quiet) return;
    if (thinkStage === 'wait') {
      if (!say('think_step_by_step')) { thinkStage = 'idle'; return; }
      thoughtThisBattle = true;
      thinkStage = 'reply';
      thinkUntil = now + THINK_REPLY_S;
      return;
    }
    thinkStage = 'idle';
    if (radio.log.at(-1)?.id === 'think_step_by_step') say('step_by_step_reply');
  }

  // --------------------------------------------------------- quiet stretches ---

  /**
   * The crew between fights (AU.04, 2026-10-13; the owner, 10-12: "so its not quiet all the time"; AUD-23: never "way
   * too much audio"). Once the battle has been quiet for a while (nothing over `loudDb` in the HDR window — no cannon
   * within a kilometre or two, no blast) and the net has been silent as long, the commander keeps the crew watching: a
   * sector check, a hold, a word to the driver, the gunner's "no target", a push to the objective in an objective
   * mode, or, after we took damage, what the hull has left. One call per 50-85 s at most, each flavour that yields to
   * any real call, in turn rather than at random (its own seeded stream keeps the battle's other draws where they were).
   */
  const QUIET_RADIO = Object.freeze({
    loudDb: 118, battleQuietS: 25, netQuietS: 25,
    firstS: Object.freeze([35, 60]) as readonly [number, number],
    everyS: Object.freeze([50, 85]) as readonly [number, number],
  });
  const OBJECTIVE_MODES: ReadonlySet<string> = new Set(['capture_the_flag', 'zone_control', 'frontline_assault']);
  const QUIET_STILL = Object.freeze(['quiet_scan', 'quiet_hold', 'quiet_crew']);
  const QUIET_MOVING = Object.freeze(['quiet_move', 'quiet_scan', 'quiet_crew']);
  const quietRandom = mulberry32(0x9e17a);
  let quietLoudAt = 0;
  let nextQuietAt = Infinity;
  let quietTurn = 0;
  let damagedSinceStatus = false;
  let hitOnUsAt = -1e9;
  let movedSinceHit = false;

  function resetQuietRadio(): void {
    quietLoudAt = 0;
    nextQuietAt = Infinity;
    quietTurn = 0;
    damagedSinceStatus = false;
    hitOnUsAt = -1e9;
    movedSinceHit = false;
  }

  function updateQuietRadio(now: number): void {
    if (!radio || !mixer || battleMode.phase !== 'battle' || battleMode.over || !battleMode.rolledOut || battleMode.killcam || battleMode.paused) return;
    const me = latestPlayer;
    if (!me || me.id !== playerId || me.combat?.destroyed) return;
    const speed = Math.abs(Number(me.state?.speed) || 0);
    // in cover: we pulled up and stopped within eight seconds of a hit
    if (now - hitOnUsAt < 8) {
      if (speed > 3) movedSinceHit = true;
      else if (movedSinceHit && speed < 0.4) { movedSinceHit = false; hitOnUsAt = -1e9; say('in_cover', { delayS: 0.2 }); }
    }
    if (mixer.hdrTop >= QUIET_RADIO.loudDb) quietLoudAt = now;
    if (nextQuietAt === Infinity) { nextQuietAt = now + QUIET_RADIO.firstS[0] + quietRandom() * (QUIET_RADIO.firstS[1] - QUIET_RADIO.firstS[0]); return; }
    if (now < nextQuietAt || now - quietLoudAt < QUIET_RADIO.battleQuietS || !radio.quiet) return;
    const last = radio.log.at(-1);
    if (last && now - (last.t + last.dur) < QUIET_RADIO.netQuietS) return;
    if (me.aerial?.kind === 'gunship' || me.aerial?.active) return;
    nextQuietAt = now + QUIET_RADIO.everyS[0] + quietRandom() * (QUIET_RADIO.everyS[1] - QUIET_RADIO.everyS[0]);
    const hp = Number(me.combat?.hp);
    const maxHp = Number(me.combat?.maxHp);
    const moving = speed > 2;
    let id: string;
    if (damagedSinceStatus && maxHp > 0 && hp / maxHp > 0.25 && hp / maxHp < 0.85) { id = 'hull_status'; damagedSinceStatus = false; }
    else if (moving && quietTurn % 2 === 0 && OBJECTIVE_MODES.has(getGameMode?.() || 'standard')) { id = 'objective_push'; quietTurn++; }
    else { const turn = moving ? QUIET_MOVING : QUIET_STILL; id = turn[quietTurn++ % turn.length]; }
    say(id);
  }

  function hullOptions(extra: PlayOptions = {}): PlayOptions {
    return { space: 'hull', ...extra };
  }

  function playerEntityInfo(): TankInfo | null {
    return playerId ? tanks.get(playerId) ?? null : null;
  }

  // --------------------------------------------------------------- terrain ---

  function surfaceAt(x: number, z: number): { surface: SurfaceId; depth: number } {
    const terrain = getTerrain?.() ?? null;
    if (!terrain) return { surface: 'earth', depth: 0 };
    let depth = 0;
    try { depth = terrain.getWaterDepthAt?.(x, z) ?? 0; } catch { depth = 0; }
    if (depth > 0.35) return { surface: 'water', depth };
    let ground = 'medium';
    try { ground = terrain.getGroundType(x, z); } catch { /* keep medium */ }
    let track = 0;
    try { track = terrain.getTrackSurfaceAt?.(x, z) ?? 0; } catch { track = 0; }
    // (world-sfx-269, 2026-11-03) A carriageway is hard only where it is paved: the paved share the FX's street grit
    // reads (world/roadPave.ts). The dirt roads of most maps are earth under the tracks and under a round; they played
    // the asphalt clatter. Frozen water reads hard off any road, under a snow map's snow (track 3): it stays hard.
    if (ground === 'hard') return { surface: track !== 3 && dirtRoad(terrain, x, z) ? 'earth' : 'hard', depth };
    if (track === 2) return { surface: 'sand', depth };
    if (track === 3) return { surface: 'snow', depth };
    if (ground === 'soft') return { surface: 'mud', depth };
    return { surface: 'earth', depth };
  }

  /** An unpaved carriageway (the terrain's paved share under the street grit's half; a bridge deck and a paved town are 1). */
  function dirtRoad(terrain: AudioTerrainProbe, x: number, z: number): boolean {
    if (!terrain.getRoadPaveAt) return false;
    try { return streetGritShare(terrain.getRoadPaveAt(x, z)) < 0.5; } catch { return false; }
  }

  /** 0..1 how far terrain stands between listener and a point (seven samples along the line). */
  function occlusionAt(x: number, y: number, z: number): number {
    const terrain = getTerrain?.() ?? null;
    if (!terrain || !listenerValid) return 0;
    let worst = 0;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const px = frame.x + (x - frame.x) * t;
      const pz = frame.z + (z - frame.z) * t;
      const lineY = frame.y + (y + 1.2 - frame.y) * t;
      let h = -Infinity;
      try { h = terrain.getHeightAt(px, pz); } catch { return worst; }
      worst = Math.max(worst, clamp((h - lineY + 0.6) / 3.5, 0, 1));
    }
    return worst;
  }

  // --------------------------------------------------------------- weapons ---

  // The punch under a close report (recorded layers by bore; until 2026-10-03 a rendered pressure pulse): the air
  // slam a crack alone lacks. Level re the report: under it, and cut short, so it weights the attack without
  // blurring the decay. The cannon level matches the rendered pulse it replaced; the small bores sit 4 dB above
  // theirs, which had all but vanished under the report.
  const BLAST_DB: Readonly<Record<string, number>> = Object.freeze({ cannon: -6, autocannon: -16, mg: -19 });
  // Machine-gun bursts echo once per beat, not once per round.
  const lastBurstTail = new Map<string, number>();

  /** The punch layer for a report: which recording, its rate (a bigger bore sits lower) and how long it may ring. */
  function punchFor(family: string, caliberMm: number): { id: string; rate: number; maxDurS: number } {
    if (family === 'mg') return { id: 'blast_punch_light', rate: clamp(1.12 - (caliberMm - 7.62) / 50, 0.96, 1.12), maxDurS: 0.22 };
    if (family === 'autocannon') return { id: 'blast_punch_medium', rate: clamp(1.15 - (caliberMm - 20) / 60, 0.9, 1.15), maxDurS: 0.32 };
    return { id: 'blast_punch_heavy', rate: clamp(1.1 - (caliberMm - 90) / 200, 0.88, 1.1), maxDurS: 0.5 };
  }

  /** Mounts of shots whose shooter's gun is unknown (a studio, probe or killcam event), and of roof stations, by their
   *  fields: built once each, never per shot. */
  const eventMounts = new Map<string, WeaponMount>();
  function shotMount(shooterId: string | null, roundName: string | null, caliberMm: number, soundProfile: string | null | undefined): WeaponMount {
    // the shooter's own gun decides a round it carries (a Centurion's 84 mm fires rounds its damage model sizes at 120)
    const info = shooterId != null && roundName ? tanks.get(shooterId) : null;
    const known = info?.mounts.length ? mountForRound(info.mounts, roundName) : null;
    if (known && known.rounds.includes(roundName!)) return known;
    const key = `${caliberMm}|${soundProfile ?? ''}|${roundName ?? ''}`;
    let m = eventMounts.get(key);
    if (!m) {
      m = eventMount(caliberMm, soundProfile, roundName);
      if (eventMounts.size > 256) eventMounts.clear();
      eventMounts.set(key, m);
    }
    return m;
  }
  function stationShot(caliberMm: number): WeaponMount {
    const key = `station|${caliberMm}`;
    let m = eventMounts.get(key);
    if (!m) { m = stationMount(caliberMm); eventMounts.set(key, m); }
    return m;
  }

  /**
   * One shot of one mount (weaponAudio.ts WEAPON_ROWS, keyed by bore and ammunition construction): the close report
   * (a guided round's by how it launches) fading into the distant one by range, the muzzle brake's side blast, the punch
   * of the blast, the map's echo; for our own gun its own report from the hatch, in the sight the closed turret's, and
   * the breech's recoil. A shot whose key has no row is silent (the census and typecheck keep that from shipping).
   */
  function fireWeapon(pos: Vec3, m: WeaponMount, soundProfile: string | null | undefined, own: boolean, muzzleIndex = -1, cinematic = false,
    shooterId: string | null = null, roundName: string | null = null, dir: Vec3 | null = null): void {
    if (!ready()) return;
    const resolved = resolveWeaponReport(m, soundProfile);
    if (!resolved) { logSound('weapon:unkeyed', { key: m.key }); return; }
    // The Juggernaut's gun carries further and sits a little deeper.
    const report = shooterId != null && shooterId === bossId ? { ...resolved, gainDb: resolved.gainDb + 2.5, rate: resolved.rate * 0.94 } : resolved;
    const row = report.row;
    const [x, y, z] = pos;
    const distance = own ? 2 : distanceTo(x, y, z);
    // A guided round leaves its launcher as its family does (2026-10-13): a tube's charge and backblast, a soft eject,
    // a rail, a gun barrel; our own tube launch keeps its hatch-side recording.
    const launch = row.key === 'guided/missile' ? missileLaunchFor(roundName, soundProfile) : null;
    const close = launch ? LAUNCH_ASSET[launch] : row.close;
    const closeK = own ? 1 : 1 - rampBetween(distance, row.closeFadeM[0], row.closeFadeM[1]);
    // Our own shot keeps a trace of its distant report; a gunship's distant report is the ground's, not its crew's.
    const farK = own ? (row.key.startsWith('ac130') ? 0 : 0.18) : rampBetween(distance, row.farFadeM[0], row.farFadeM[1]);
    const bus = cinematic ? 'cinematic' as const : own ? 'ownCombat' as const : undefined;
    const base: PlayOptions = { x, y, z, rate: report.rate, gainDb: report.gainDb, ...(bus ? { bus } : {}) };
    if (own) { base.propagate = false; base.priority = 95; }
    // The muzzle brake (gun-reports-269): with nothing on the muzzle the blast is strongest ahead of the gun; a brake
    // throws it sideways and back, so the gun's crew and anyone beside it hear it harsher. Our own shot keeps its level
    // unless a brake throws the blast back at the hatch.
    const brakeDb = own ? brakeGainDb(row.brake, Math.PI) - brakeGainDb('none', Math.PI) : brakeGainDb(row.brake, boreAngle(x, y, z, dir));
    const scopedInside = own && listenerScoped && !!row.interior;
    // The crew's own report from the hatch (pinned with our hull's banks), the close report otherwise: never the bank
    // everyone else hears standing in for ours while it decodes or rests (owner 2026-10-04, no fallbacks). A gun's own
    // report stays under its closed turret's in the sight; a roof gun's or an autocannon's turret is all we hear there.
    const ownReport = own && (!launch || launch === 'tube') ? row.own : null;
    // The blast belongs to the close report: past its range the distant bank carries the shot.
    const blastDb = closeK > 0.05 ? BLAST_DB[row.family] : undefined;
    if (blastDb != null && !(scopedInside && row.family !== 'cannon')) {
      const punch = punchFor(row.family, row.boreMm);
      // the punch is the muzzle blast itself: it turns with the report around the brake
      play(punch.id, { ...base, rate: punch.rate, maxDurS: punch.maxDurS, loudDb: row.loudDb + 1, gainDb: (base.gainDb ?? 0) + blastDb + (own ? 2 : 0) + brakeDb });
    }
    if (scopedInside && row.family !== 'cannon') {
      play(row.interior!, hullOptions({ bus: 'ownCombat', gainDb: (base.gainDb ?? 0) + 1, rate: report.rate }));
    } else if (ownReport) play(ownReport, { ...base, gainDb: (base.gainDb ?? 0) + 2.5 + brakeDb });
    else if (closeK > 0.03) play(close, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(closeK) + (own ? 2.5 : 0) + brakeDb });
    // The distant boom sits 3 dB under the close report.
    if (farK > 0.03 && !(scopedInside && row.family !== 'cannon')) play(row.far, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(farK) - 3 });
    if (report.twin) play(close, { ...base, delayS: 0.016, rate: report.rate * (muzzleIndex === 1 ? 1.04 : 0.97), gainDb: (base.gainDb ?? 0) + gainToDb(Math.max(closeK, 0.05)) - 2 });
    if (scene.tail !== 'none' && mixer && !(scopedInside && row.family !== 'cannon')) {
      const now = mixer.ctx.currentTime;
      if (row.family !== 'mg' || now - (lastBurstTail.get(row.key) ?? -1) > 0.22) {
        if (row.family === 'mg') lastBurstTail.set(row.key, now);
        // The echo sits well under the crack (2026-10-02): at the old level it was nearly as loud as a
        // peak-mastered report and held a near shot within 2–9 dB of its peak for half a second, a blast.
        play(`tail_${scene.tail}`, { ...base, rate: row.tailRate * report.rate, delayS: 0.035 + random() * 0.02, gainDb: gainToDb(row.tailGain) - (own ? 14 : 12) });
      }
    }
    // In the sight our own gun is heard from inside its closed turret, close-miked by its bore.
    if (own && listenerScoped && row.family === 'cannon' && row.interior) play(row.interior, hullOptions({ bus: 'ownCombat', gainDb: 3 }));
    // The machinery of our own shot: the breech recoiling and running back into battery, the buffer's hiss, the
    // turret's loose gear rattling.
    if (own && !cinematic && row.key === 'ac130-105/unitary_brass') {
      // In the gunship the breech runs open on counter-recoil and throws the hot case onto the deck.
      play('gunship_casing_drop', hullOptions({ delayS: 0.45 }));
    } else if (own && !cinematic && row.family === 'cannon') {
      play('gun_recoil_mech', hullOptions({ delayS: 0.035, rate: clamp(1.15 - (row.boreMm - 100) / 300, 0.85, 1.15) }));
    }
    // (A synthesized sub sweep used to sit under every cannon; 0.5–0.8 s of falling sine is a trailer boom,
    // and it made gunfire read as explosions. The recorded punch is the weight now.)
    if ((own || distance < 45) && row.family === 'autocannon') {
      play('ac_feed', own ? hullOptions({ delayS: row.actionDelayS, gainDb: -8 }) : { x, y, z, delayS: row.actionDelayS, gainDb: -10 });
    }
  }

  /** The angle between a gun's line of fire and the line from its muzzle to us (π/2 when the bore is unknown). */
  function boreAngle(x: number, y: number, z: number, dir: Vec3 | null): number {
    if (!dir || !listenerValid) return Math.PI / 2;
    const lx = frame.x - x, ly = frame.y - y, lz = frame.z - z;
    const ll = Math.hypot(lx, ly, lz), dl = Math.hypot(dir[0], dir[1], dir[2]);
    if (ll < 1e-3 || dl < 1e-6) return Math.PI / 2;
    return Math.acos(clamp((lx * dir[0] + ly * dir[1] + lz * dir[2]) / (ll * dl), -1, 1));
  }

  /**
   * Supersonic flybys and the near-miss crack: closest approach of the shell's
   * ray to the listener, timed by its muzzle velocity.
   */
  function shellFlyby(event: ShellFiredEvent): void {
    if (!listenerValid || !ctx) return;
    const mp = event.muzzlePos;
    const d = event.dir;
    const rx = frame.x - mp[0];
    const ry = frame.y - mp[1];
    const rz = frame.z - mp[2];
    const along = rx * d[0] + ry * d[1] + rz * d[2];
    if (along < 10 || along > 1500) return;
    const cx = mp[0] + d[0] * along;
    const cy = mp[1] + d[1] * along;
    const cz = mp[2] + d[2] * along;
    const miss = Math.hypot(cx - frame.x, cy - frame.y, cz - frame.z);
    const small = event.caliberMm < 40;
    const launcher = /launch/.test(String(event.weaponSound || ''));
    const velocity = event.velocityMps && event.velocityMps > 0 ? event.velocityMps : launcher ? 280 : 900;
    // (impact-materials-269) the sound of the pass by calibre and speed: a bullet's snap, an autocannon round's crack, a
    // sabot's tearing crack, a supersonic full-bore round's crack and rush, a subsonic shell's whoosh
    const asset = nearMissAsset(event.caliberMm, velocity, launcher);
    const reach = NEAR_MISS_REACH_M[asset];
    if (launcher && miss < 30 && !sameTeam(event.shooterId, playerId) && playerId && tanks.get(playerId)?.alive !== false) {
      play('missile_warning', { delayS: 0 });
      caption('missileWarning', mp[0], mp[1], mp[2]);
      say('missile_incoming', { delayS: 0.05 });
    }
    if (miss > reach) return;
    const passIn = along / velocity;
    const lead = asset === 'bullet_crack' || asset === 'flyby_autocannon' ? 0.01 : 0.12;
    play(asset, { x: cx, y: cy, z: cz, propagate: false, delayS: Math.max(0, passIn - lead), gainDb: -3 * (miss / reach), priority: 82 });
    if (!sameTeam(event.shooterId, playerId)) caption('nearMiss', cx, cy, cz, Math.max(0, passIn - lead));
    if (!small && !launcher && miss < 9 && !sameTeam(event.shooterId, playerId)) say('near_miss', { prob: 0.25, delayS: passIn + 0.25 });
  }

  function onShellFired(event: ShellFiredEvent): void {
    const ownShot = listenerOwnerId != null ? event.shooterId === listenerOwnerId : !!event.isPlayer;
    const shotOf = shotMount(event.shooterId ?? null, event.shellName ?? null, event.caliberMm, event.weaponSound);
    if (!event.feedbackPredicted) fireWeapon(event.muzzlePos, shotOf, event.weaponSound, ownShot, event.muzzleIndex, false, event.shooterId ?? null, event.shellName ?? null, event.dir);
    if (!ownShot) shellFlyby(event);
    if (!ownShot && event.caliberMm >= 20 && !sameTeam(event.shooterId, playerId) && listenerValid) {
      const [gx, gy, gz] = event.muzzlePos;
      if (distanceTo(gx, gy, gz) < 350) caption('gunfire', gx, gy, gz);
    }
    if (event.isPlayer) {
      if (/launch/.test(String(event.weaponSound || ''))) say('missile_away', { delayS: 0.1 });
      else say('firing', { prob: 0.1, delayS: 0.08 });
    }
    const [mx, my, mz] = event.muzzlePos;
    if (ownShot && event.shellId != null && event.caliberMm >= 60 && !/launch/.test(String(event.weaponSound || ''))) {
      if (ownRounds.size >= 12) ownRounds.delete(ownRounds.keys().next().value as number);
      ownRounds.set(event.shellId, { x: mx, y: my, z: mz, dx: event.dir[0], dy: event.dir[1], dz: event.dir[2] });
    }
    const dist = ownShot || !listenerValid ? 0 : distanceTo(mx, my, mz);
    logSound('shell:fired', {
      id: event.shellId, own: ownShot, scoped: listenerScoped, caliberMm: event.caliberMm,
      report: shotOf.key,
      dist: +dist.toFixed(1), gain: +dbToGain(distanceAttenuationDb(dist, 12, 1)).toFixed(4),
    });
  }

  function onPredictedWeapon(event: ShellFiredEvent): void {
    if (!ctx || battleMode.phase !== 'battle' || battleMode.over || !event.isPlayer) return;
    if (listenerOwnerId == null || event.shooterId !== listenerOwnerId) return;
    // Intent-only report: no flyby, crew call or shell bookkeeping.
    const shooter = event.shooterId ?? listenerOwnerId;
    fireWeapon(event.muzzlePos, shotMount(shooter, event.shellName ?? null, event.caliberMm, event.weaponSound), event.weaponSound, true,
      event.muzzleIndex, false, null, event.shellName ?? null, event.dir);
  }

  // --------------------------------------------------------------- impacts ---

  /**
   * A blast close to the occupied hull muffles the mix and rings the ears
   * (setting-gated). Strength falls off across the bore-scaled radius.
   */
  function blastNearHull(distance: number, caliberMm: number): void {
    if (!concussionFx || !mixer || !listenerValid || battleMode.phase !== 'battle' || playerEntityInfo()?.alive === false) return;
    const radius = Math.min(CONCUSSION.maxRadiusM, CONCUSSION.radiusPer100mmM * Math.max(0.4, caliberMm / 100));
    if (distance >= radius) return;
    const strength = clamp(1 - distance / radius, 0, 1);
    if (mixer.concussion(0.35 + 0.5 * strength) && strength > 0.45) play('tinnitus', { delayS: 0.15 });
  }

  function explosion(x: number, y: number, z: number, caliberMm: number, bus?: 'cinematic', focus = false): void {
    const id = caliberMm >= 140 ? 'expl_he_large' : caliberMm >= 61 ? 'expl_he_medium' : 'expl_he_small';
    const distance = distanceTo(x, y, z);
    if (caliberMm >= 61 && distance < (focus ? 1200 : 600)) {
      // The ground shock under the blast: generated blasts are thin below ~80 Hz, and this low-passed recording
      // carries the weight (a bigger shell sits lower and a little louder).
      const size = clamp((caliberMm - 61) / 90, 0, 1);
      play('blast_sub', { x, y, z, rate: 1.1 - 0.25 * size, gainDb: -1 + 2 * size, focus, ...(bus ? { bus } : {}) });
    }
    if (!bus) blastNearHull(distance, caliberMm);
    const rate = clamp(1.08 - (caliberMm - 100) / 600, 0.86, 1.12);
    play(id, { x, y, z, rate, focus, ...(bus ? { bus } : {}) });
    if (distance > 700) play('expl_far', { x, y, z, gainDb: -4, focus });
    // (impact-materials-269) what the burst throws up rains back by the ground it dug: earth, sand, mud, snow or a road's
    // grit (on water the column's fall is the splash's own)
    const debris = distance < 40 && caliberMm >= 61 ? GROUND_DEBRIS[groundAt(x, z)].ground : null;
    if (debris) play(debris, { x, y, z, delayS: 0.35, gainDb: -4 });
  }

  /** The ground under a point as an impact material (impactMaterials.ts): a road, a bridge deck or ice is paved. */
  function groundAt(x: number, z: number): GroundMaterial {
    return groundMaterial(surfaceAt(x, z).surface);
  }

  /** The debris of a close burst or landing pattering on our hull, by the ground it was thrown from. */
  function hullPatter(x: number, z: number, delayS: number, gainDb: number): void {
    play(GROUND_DEBRIS[groundAt(x, z)].hull, hullOptions({ bus: 'ownCombat', delayS, gainDb }));
  }

  /** Whether a round came from the listener's tank (the occupied one, or the one being watched). */
  function listenerShot(shooterId: string | null | undefined): boolean {
    if (shooterId == null) return false;
    return listenerOwnerId != null ? shooterId === listenerOwnerId : shooterId === playerId;
  }

  /**
   * An impact by what it struck (impactMaterials.ts): the material's close layers for what the round did there and its
   * calibre, crossfaded by range into its distant bank. A bank that swaps (armour, steel) takes over from the close
   * detail between a few hundred metres and 620 m, as armour hits always did; one that adds (the ground's thump) lies
   * under a close sound that stays. The distant bank sits at the close bank's level. Machine-gun hits have none, and a
   * steel ring or a ricochet's whine is only ever among a steel material's layers.
   */
  function materialImpact(material: StruckMaterial, result: ImpactResult, band: CalibreBand, x: number, y: number, z: number,
    focus: boolean, { gainDb = 0, rate = 1, far = true }: { gainDb?: number; rate?: number; far?: boolean } = {}): void {
    const layers = impactLayers(material, result, band);
    const bank = far ? distantBank(material, result, band) : null;
    const distance = distanceTo(x, y, z);
    const swap = bank?.mode === 'swap';
    // the ground's thump under a landing is a gun round's: an autocannon round's carries no further than its strike
    const adds = bank?.mode === 'add' && band === 'cannon';
    const closeK = swap ? 1 - rampBetween(distance, 260, 620) : 1;
    const farK = swap ? rampBetween(distance, 140, 440) : adds ? rampBetween(distance, 200, 560) : 0;
    if (closeK > 0.03) {
      for (const layer of layers) {
        play(layer.id, { x, y, z, focus, rate: layer.rate * rate, gainDb: gainDb + layer.gainDb + gainToDb(closeK),
          ...(layer.delayS > 0 ? { delayS: layer.delayS } : {}) });
      }
    }
    if (bank && farK > 0.03) play(bank.id, { x, y, z, focus, gainDb: gainDb + (layers[0]?.gainDb ?? 0) + bank.gainDb + gainToDb(farK) });
  }

  function playerHull(event: ShellHitEvent): boolean {
    return (listenerOwnerId != null && event.targetId === listenerOwnerId)
      || (listenerOwnerId == null && playerId != null && event.targetId === playerId);
  }

  /**
   * A round on a tank or a wreck, by what it struck (the hit's material, sim/plateMaterial.ts) and what it did there:
   * through a plate or a screen, stopped by it, or glancing off. A screen the round went through first (a skirt, the
   * running gear, a cage) takes the first blow, and the plate behind is heard through it. Our own hull answers inside by
   * where it was struck.
   */
  function impactSounds(event: ShellHitEvent, ownHull: boolean): void {
    const [x, y, z] = event.pos;
    const caliber = event.caliberMm || 100;
    const band = calibreBand(caliber);
    const small = band === 'bullet';
    const heat = event.shellType === 'HEAT';
    // Our own cannon and autocannon hits carry (OWN_HIT_FOCUS); machine-gun pings stay local.
    const focus = !small && listenerShot(event.attackerId);
    const material = hitMaterial(event.material);
    // Reactive armour is additive to the deeper result: every positioned
    // cassette detonates, and a pass-through activation without positions
    // still gets its blast at the impact point.
    let cassettes = 0;
    for (const activation of event.eraActivations || []) {
      if (activation?.pos?.length === 3) { play('era_det', { ...at(activation.pos), focus }); cassettes++; }
    }
    if (!cassettes && isEraActivation(event) && event.kind !== 'era') play('era_det', { x, y, z, focus });
    const result: ImpactResult | null = event.kind === 'pen' || event.kind === 'screen_pierce' ? 'through'
      : event.kind === 'ricochet' ? 'glance'
        : event.kind === 'nonpen' || event.kind === 'spaced_absorb' ? 'stop' : null;
    if (result) {
      // the outer screen it went through on its way: its own strike, and the plate behind heard through it
      const screen = event.kind !== 'screen_pierce' && event.screenMaterial != null ? hitMaterial(event.screenMaterial) : null;
      const screened = screen != null && screen !== material;
      if (screened) materialImpact(screen, 'through', band, x, y, z, focus, { far: false });
      materialImpact(material, result, band, x, y, z, focus, { gainDb: screened ? -5 : 0 });
      if (heat && event.kind !== 'ricochet' && event.kind !== 'screen_pierce') play('heat_impact', { x, y, z, gainDb: event.kind === 'pen' ? -3 : -5, focus });
    }
    if (ownHull) ownHullImpact(event, material, band);
    switch (event.kind) {
      case 'era':
        if (!(event.eraActivations || []).length) play('era_det', { x, y, z, focus });
        break;
      case 'he_pen':
      case 'he_splash':
        play('he_armor', { x, y, z, focus });
        explosion(x, y, z, caliber, undefined, focus);
        break;
      case 'terrain': {
        explosion(x, y, z, caliber, undefined, focus);
        materialImpact(groundAt(x, z), 'stop', band, x, y, z, focus, { gainDb: -4, far: false });
        break;
      }
      default:
        break;
    }
    // Hull-borne debris from a close blast, by the ground it was thrown from.
    if (!ownHull && (event.kind === 'he_splash' || event.kind === 'terrain') && listenerValid && distanceTo(x, y, z) < 14 && playerEntityInfo()?.alive) {
      hullPatter(x, z, 0.3, 0);
    }
  }

  /**
   * A round on our own hull, heard inside: a penetration's spall bursting into the compartment it struck (the turret and
   * fighting compartment, the driver's station, the engine bay), from that side; a blow that did not get through rings
   * the hull by the part it struck (armour bongs, a track or a skirt barely).
   */
  function ownHullImpact(event: ShellHitEvent, material: StruckMaterial, band: CalibreBand): void {
    const small = band === 'bullet';
    const medium = band === 'autocannon';
    const [x, y, z] = event.pos;
    toListenerFrame(frame, x, y, z, rel);
    const pan = listenerValid ? panFromRelative(rel, 0.5) : 0;
    switch (event.kind) {
      case 'pen':
        if ((event.damage || 0) > 0) {
          const where = event.impactLocalPos ?? event.localPos ?? null;
          const spall = SPALL[compartmentOf(event.impactFrame, where?.[2])];
          play(spall, hullOptions({ bus: 'ownCombat', gainDb: small ? -14 : medium ? -6 : 0, pan }));
          if (!small) play('hull_thud_sub', hullOptions({ bus: 'ownCombat', gainDb: medium ? -5 : 0 }));
        }
        break;
      case 'ricochet':
      case 'nonpen':
      case 'spaced_absorb':
      case 'screen_pierce': {
        const interiorDb = MATERIAL_SOUNDS[material].interiorDb;
        if (small || interiorDb == null) break;
        const base = event.kind === 'ricochet' ? (medium ? -10 : -5) : event.kind === 'screen_pierce' ? (medium ? -14 : -9) : (medium ? -8 : 0);
        play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: base + interiorDb, pan }));
        break;
      }
      case 'he_pen':
      case 'he_splash':
        play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: -2 }));
        break;
      default:
        break;
    }
  }

  const CREW_CALL: Readonly<Record<string, string>> = { commander: 'commander_down', gunner: 'gunner_down', driver: 'driver_down', loader: 'loader_down' };
  const MODULE_CALL: Readonly<Record<string, string>> = {
    ammoRack: 'ammo_rack', gun: 'gun_damaged', gunMount: 'gun_mount_damaged', turretRing: 'turret_jammed',
    autoloader: 'autoloader_damaged', feedSystem: 'feed_damaged', roofGun: 'roof_gun_damaged', missileRack: 'missile_rack_damaged',
    trackL: 'track_gone', trackR: 'track_gone', engine: 'engine_damaged', transmission: 'transmission_damaged',
    fuelTank: 'fuel_tank', optics: 'optics_damaged', radio: 'radio_damaged',
  };
  const MODULE_ORDER = ['ammoRack', 'gun', 'gunMount', 'turretRing', 'trackL', 'trackR', 'engine', 'transmission', 'fuelTank',
    'autoloader', 'feedSystem', 'missileRack', 'optics', 'radio', 'roofGun'];
  const CREW_ORDER = ['commander', 'gunner', 'driver', 'loader'];

  function incomingCall(event: ShellHitEvent): string | null {
    if (event.destroyed || event.fireStarted) return null;
    const crew = new Set(event.crewHit || []);
    for (const role of CREW_ORDER) if (crew.has(role)) return CREW_CALL[role];
    const modules = new Map((event.modulesHit || []).map((m) => [m.module, m.newState] as const));
    for (const name of MODULE_ORDER) {
      if (!modules.has(name)) continue;
      if ((name === 'trackL' || name === 'trackR') && modules.get(name) !== 'red') continue;
      if (name === 'engine' && modules.get(name) === 'red') return 'engine_destroyed';
      return MODULE_CALL[name];
    }
    if ((event.damage || 0) > 0) return 'were_hit';
    // our reactive blocks went off and stopped it
    if (event.kind === 'era' || isEraActivation(event)) return 'era_us';
    if (event.kind === 'ricochet' || event.kind === 'nonpen' || event.kind === 'spaced_absorb') return 'bounced_us';
    return null;
  }

  function reportIncoming(event: ShellHitEvent): void {
    if (event.attackerId && sameTeam(event.attackerId, playerId) && event.attackerId !== playerId) {
      say('hit_by_friendly', { delayS: 0.15 });
      return;
    }
    const call = incomingCall(event);
    const maxHp = event.targetMaxHp || 0;
    const crossed = !lowHpCalled && !event.destroyed && (event.damage || 0) > 0 && maxHp > 0 && event.targetHpAfter / maxHp <= 0.25;
    // Crossing into the last quarter is the news: it replaces the plain "we're hit" rather than queueing behind it
    // (where it went stale); a module or crew call still leads, and the next plain hit carries it.
    if (crossed && (!call || call === 'were_hit')) {
      lowHpCalled = true;
      say('low_hp', { delayS: 0.12 });
      return;
    }
    if (call) say(call, { delayS: 0.12 });
  }

  /**
   * The gunner's call on our own round, as a crew calls every main-gun shot:
   * what it did, about half a second after it lands (the time to see it).
   * Every main-gun result is called (owner 2026-10-04: on top of penetrations);
   * autocannon and machine-gun hits only now and then.
   */
  function reportOutgoing(event: ShellHitEvent): void {
    if (event.targetId == null || event.destroyed) return;
    if (sameTeam(event.targetId, playerId)) { say('friendly_fire', { delayS: 0.12 }); return; }
    const modules = new Map((event.modulesHit || []).map((m) => [m.module, m.newState] as const));
    const damaged = (event.damage || 0) > 0;
    const prob = (event.caliberMm || 0) >= 60 ? 1 : 0.3;
    const call = (id: string): void => { say(id, { prob, delayS: 0.4 + random() * 0.15 }); };
    if (event.fireStarted) call('enemy_fire');
    else if (modules.has('ammoRack')) call('enemy_ammo_rack');
    else if (modules.get('trackL') === 'red' || modules.get('trackR') === 'red') call('enemy_immobilized');
    else if (modules.has('gun') || modules.has('gunMount')) call('enemy_gun_damaged');
    else if (modules.has('engine')) call('enemy_engine_hit');
    else if ((event.crewHit?.length || 0) > 0 && damaged) call('enemy_crew_hit');
    else if (modules.size > 0 && damaged) call('enemy_crit');
    else if ((event.kind === 'pen' || event.kind === 'he_pen') && damaged) call('penetration');
    else if ((event.kind === 'era' || isEraActivation(event)) && !damaged) call('enemy_era');
    else if (event.kind === 'ricochet') call('ricochet');
    else if (event.kind === 'nonpen' || event.kind === 'spaced_absorb') call('nonpen');
    // A splash that stopped the round without hurting the tank is no penetration too.
    else if (event.kind === 'he_splash' && !damaged) call('nonpen');
  }

  /**
   * The gunner calls our main-gun miss: "short" (the line's second take) when
   * the round came down before the enemy it was laid on, the live enemy
   * nearest the line of fire, "over" (the third) when it came down beyond
   * it, and a plain "miss" otherwise.
   */
  function callMiss(round: { x: number; y: number; z: number; dx: number; dy: number; dz: number }, pos: Vec3 | null): void {
    if (playerId == null) return;
    let laidOn = Infinity;
    let nearest = Infinity;
    for (const [id, info] of tanks) {
      if (!info.alive || sameTeam(id, playerId)) continue;
      const rx = info.pos.x - round.x;
      const ry = info.pos.y - round.y;
      const rz = info.pos.z - round.z;
      const along = rx * round.dx + ry * round.dy + rz * round.dz;
      if (along < 30) continue;
      const off = Math.hypot(rx - round.dx * along, ry - round.dy * along, rz - round.dz * along);
      if (off > Math.max(6, along * 0.03) || off >= nearest) continue;
      nearest = off;
      laidOn = along;
    }
    const landed = pos ? (pos[0] - round.x) * round.dx + (pos[1] - round.y) * round.dy + (pos[2] - round.z) * round.dz : Infinity;
    say('miss', { take: landed < laidOn - 8 ? 1 : Number.isFinite(laidOn) && landed > laidOn + 8 ? 2 : 0, delayS: 0.45 + random() * 0.15 });
  }

  function onShellHit(event: ShellHitEvent): void {
    if (event.shellId != null) ownRounds.delete(event.shellId);
    const ownHull = playerHull(event);
    impactSounds(event, ownHull);
    // A heavy round through our own armour rattles the crew (HE splash concusses via its blast).
    if (ownHull && concussionFx && (event.kind === 'he_pen' || (event.kind === 'pen' && (event.caliberMm || 0) >= 100))) {
      if (mixer?.concussion(event.kind === 'pen' ? 0.45 : 0.7) && event.kind !== 'pen') play('tinnitus', { delayS: 0.15 });
    }
    logSound('shell:hit', { id: event.shellId, kind: event.kind, targetId: event.targetId, attackerId: event.attackerId, occupied: ownHull, damage: event.damage || 0 });
    if (playerId == null) return;
    if (event.targetId === playerId && (event.damage || 0) > 0) { damagedSinceStatus = true; hitOnUsAt = ctx?.currentTime ?? 0; movedSinceHit = false; }
    if (event.targetId === playerId) {
      // where the round came from: the shooter when we know it, else the strike on our hull
      const from = event.attackerId ? tanks.get(event.attackerId)?.pos : undefined;
      const [hx, hy, hz] = from ? [from.x, from.y, from.z] : event.pos;
      caption((event.damage || 0) > 0 ? 'hullHit' : 'hullBounce', hx, hy, hz);
      reportIncoming(event);
    } else if (event.attackerId === playerId) reportOutgoing(event);
  }

  function onShellExpired(event: ShellExpiredEvent): void {
    const round = event.shellId != null ? ownRounds.get(event.shellId) : undefined;
    if (round && event.shellId != null) {
      ownRounds.delete(event.shellId);
      callMiss(round, event.pos ?? null);
    }
    if (!event.pos || !(event.hitTerrain || event.hitKind === 'prop')) return;
    const [x, y, z] = event.pos;
    const caliber = event.caliberMm || 76;
    const small = caliber < 23;
    const water = event.surfaceKind === 'water';
    // Our own round landing short or wide is heard like our hits are.
    const focus = !small && listenerShot(event.shooterId);
    // destruction-fx lane: an explosive round detonates where it lands (the HE bank by its charge); a kinetic round or a
    // bullet only strikes (before, an HE shell on open ground played the AP round's dirt thud alone)
    const munition = event.munition ?? munitionFromType(event.shellType, caliber);
    const blastCal = munitionExplodes(munition)
      ? blastSoundCaliberMm(Number.isFinite(event.chargeKg) ? event.chargeKg as number : 1.8 * (caliber / 100) ** 3) : 0;
    // (2026-10-10, the owner: "proper audio like all things that can be destroyed") a burst on a wall or a prop detonates
    // as one on the ground does — it played the prop's impact thud alone
    if (blastCal > 0) explosion(x, y, z, blastCal, undefined, focus);
    const band = calibreBand(caliber);
    const structure = event.hitKind === 'prop' && (typeof event.structureId === 'number' || event.surfaceKind === 'structure');
    if (small && structure) {
      // (2026-10-13) a bullet strikes what it hit: brick and stone crack, steel punches, timber thocks (every one was dirt)
      play(structureBulletAsset(event.structureId), { x, y, z });
    } else if (structure) {
      // a round into a building (2026-10-13): through its wall by what the wall is made of, the masonry crumbling out of
      // the hole, a burst against it throwing its bricks and stones, and past a few hundred metres the distant knock
      const sound = structureSound(event.structureId);
      const masonry = sound.material !== 'timber' && sound.material !== 'steel';
      const layers = [{ id: structureHitAsset(sound), delayS: 0, jitterS: 0, gainDb: blastCal > 0 ? -3 : 0 }];
      if (masonry) layers.push({ id: 'rubble_crunch', delayS: 0.06, jitterS: 0.05, gainDb: blastCal > 0 ? -5 : -9 });
      if (masonry && blastCal >= 61) layers.push({ id: 'blast_masonry', delayS: 0, jitterS: 0, gainDb: -3 });
      structureLayers(layers, x, y, z, STRUCTURE_FAR.hit, -2, focus);
    } else {
      // (impact-materials-269) a prop by what it is made of, the ground by its surface; a solid round meeting the ground at
      // a glancing angle skips off it (a graze: the dirt and the thump, never a ring), a burst digs in. A solid round's
      // landing far off adds its distant thump (a burst has the far explosion already).
      const ground = event.hitKind !== 'prop';
      const material: StruckMaterial = water ? 'water' : ground ? groundAt(x, z) : propMaterial(String(event.surfaceKind || ''));
      const result = ground ? landingResult(event.impactAngleDeg, blastCal > 0) : 'stop';
      materialImpact(material, result, band, x, y, z, focus, {
        gainDb: ground && blastCal > 0 ? -4 : 0,
        rate: ground && !small && !water ? clamp(1.1 - caliber / 900, 0.9, 1.08) : 1,
        far: blastCal === 0,
      });
      logSound('impact:material', { id: event.shellId, material, result, band });
    }
    if (!small && listenerValid && playerEntityInfo()?.alive && distanceTo(x, y, z) < 10) hullPatter(x, z, 0.25, -3);
    logSound('shell:expired', { id: event.shellId, hitKind: water ? 'water' : (event.hitKind || 'terrain') });
  }

  // ----------------------------------------------------------- destruction ---

  /**
   * A destruction. The kill-cam replays it through the cinematic bus: the blast
   * transient stays crisp while the debris and turret layers stretch and pitch
   * down at the replay's slow-motion rate, timed to the slowed launch.
   */
  function onTankDestroyed(event: TankDestroyedEvent, cinematic = false, slowRate = 1): void {
    // An older host's event for a hull this seat never presented carries no position: the death counts, unheard.
    const placed = Array.isArray(event.pos);
    const [x, y, z] = placed ? event.pos : UNPLACED;
    const cause = event.cause === 'ammorack' || event.cause === 'fire' ? event.cause : 'shot';
    const bus = cinematic ? { bus: 'cinematic' as const } : {};
    const slow = cinematic ? { ...bus, rate: slowRate } : bus;
    const stretch = cinematic ? 1 / slowRate : 1;
    // Our kill is confirmed by the target itself going up, carried like our hits.
    const focus = !cinematic && listenerShot(event.killerId);
    if (cause === 'fire') {
      play('burnout_blast', { x, y, z, focus, ...bus });
    } else {
      const blast = EXPLOSION_SOUND[tanks.get(event.id)?.identity.tracks ?? 'heavy'];
      play(cause === 'ammorack' ? blast.ammorack : blast.shot, { x, y, z, focus, ...bus });
      const blastM = distanceTo(x, y, z);
      if (blastM < (focus ? 1800 : 900)) {
        play('blast_sub', { x, y, z, rate: cause === 'ammorack' ? 0.8 : 0.88, gainDb: cause === 'ammorack' ? 2 : 1, focus, ...bus });
      }
      if (!cinematic && blastM > 600) play(cause === 'ammorack' ? 'ammo_explode_far' : 'expl_far', { x, y, z, focus, gainDb: -3 });
      play('debris_metal', { x, y, z, delayS: 0.25 * stretch, focus, ...slow });
      // (physics lane, 2026-10-10) the turret's landing plays where and when its body hits (bindBus: onTurretLanding)
    }
    if (!cinematic && placed && cause !== 'fire' && event.id !== playerId) blastNearHull(distanceTo(x, y, z), cause === 'ammorack' ? 160 : 110);
    if (!cinematic && event.id !== playerId && listenerValid && distanceTo(x, y, z) < 600) caption('explosion', x, y, z);
    if (!cinematic && placed && ctx) {
      const now = ctx.currentTime;
      const loops: Rig[] = [];
      if (cause === 'ammorack') loops.push(loopRig('cookoff_loop', { x, y, z, delayS: 0.8 }));
      if (cause !== 'shot' || random() < 0.45) loops.push(loopRig('wreck_fire_loop', { x, y, z, delayS: 0.5 }));
      wrecks.push({ until: now + 22 + random() * 18, loops, nextCreak: now + 6 + random() * 6, x, y, z });
    }
    const rig = rigs.get(event.id);
    if (rig) { rig.kill(0.25); rigs.delete(event.id); }
    const info = tanks.get(event.id);
    if (info) info.alive = false;
    if (cinematic) return;
    if (playerId != null && event.id === playerId) {
      fireAlarm?.stop(); fireAlarm = null;
      playerBurning = false;
      radio?.silence();
    } else if (playerId != null && event.killerId === playerId) {
      const now = ctx?.currentTime ?? 0;
      // (ac130-fx-228) the AC-130's kill is the gunship crew's call ("Splash. Target down."), never a tank crew's
      const gunship = event.source === 'ac130';
      say(event.source === 'drone' ? 'drone_kill' : now - lastKillAt < 12 ? (gunship ? 'gunship_double' : 'double_kill') : gunship ? 'gunship_kill' : 'target_destroyed',
        { delayS: 0.45 + random() * 0.15 });
      lastKillAt = now;
    } else if (playerId != null && info) {
      const near = listenerValid && distanceTo(x, y, z) < 300;
      if (sameTeam(event.id, playerId)) { if (near || latestPlayer?.aerial?.kind === 'gunship') say('ally_destroyed', { delayS: 0.3 }); }
      else if (event.killerId && sameTeam(event.killerId, playerId)) say('ally_kill', { prob: 0.3, delayS: 0.35 });
    }
    logSound('tank:destroyed', { id: event.id, killerId: event.killerId, cause, occupied: event.id === listenerOwnerId });
  }

  function updateWrecks(now: number): void {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const wreck = wrecks[i];
      if (now > wreck.until) {
        for (const loop of wreck.loops) loop.stop(2.5);
        wrecks.splice(i, 1);
        continue;
      }
      if (now > wreck.nextCreak) {
        wreck.nextCreak = now + 5 + random() * 9;
        play('metal_creak', { x: wreck.x, y: wreck.y, z: wreck.z });
      }
    }
  }

  // ------------------------------------------------------------ structures ---

  /** Each structure's sound, read once per battle from the world's anatomy (the phase edge clears it). */
  const structureSounds = new Map<number, StructureSound>();
  function structureSound(id: number | null | undefined, massClass?: string | null): StructureSound {
    if (typeof id !== 'number' || id < 0) return structureSoundOf(null, massClass);
    const known = structureSounds.get(id);
    if (known) return known;
    const makeup = getStructureMakeup?.(id) ?? null;
    const sound = structureSoundOf(makeup?.rubble ?? null, makeup?.massClass ?? massClass);
    if (makeup) structureSounds.set(id, sound);
    return sound;
  }

  /**
   * A building's layers at (x, y, z), its distant recording crossfaded in by range (STRUCTURE_FAR: the armour hits'
   * law, stretched, since a building is big): the close detail within a few hundred metres, the rumble beyond.
   */
  function structureLayers(layers: readonly { id: string; delayS: number; jitterS: number; gainDb: number }[], x: number, y: number, z: number,
    far: string | null, farDb = 0, focus = false): void {
    const distance = distanceTo(x, y, z);
    const closeK = 1 - rampBetween(distance, STRUCTURE_FAR.closeFadeM[0], STRUCTURE_FAR.closeFadeM[1]);
    const farK = far ? rampBetween(distance, STRUCTURE_FAR.farFadeM[0], STRUCTURE_FAR.farFadeM[1]) : 0;
    if (closeK > 0.03) {
      for (const l of layers) {
        play(l.id, { x, y, z, focus, delayS: l.delayS + (l.jitterS > 0 ? random() * l.jitterS : 0), gainDb: l.gainDb + gainToDb(closeK) });
      }
    }
    if (far && farK > 0.03) play(far, { x, y, z, focus, gainDb: farDb + gainToDb(farK) });
  }

  /** A machine-gun round's strike on a building, by its walls (props and the ground: impactMaterials.ts). */
  function structureBulletAsset(structureId: number | undefined): string {
    const m = structureSound(structureId).material;
    return m === 'timber' ? 'bullet_wood' : m === 'steel' ? 'bullet_metal' : 'bullet_masonry';
  }

  /**
   * What a hull struck sounds like (tank:impact), by the material of the record it hit (world-sfx-269, 2026-11-03): rock,
   * steel, masonry, timber or earth. A building sounds of its walls (the structure's anatomy, as its breaking does); until
   * this a timber barn, a sandbag berm and anything not rock or steel crashed as a concrete wall crumbling.
   */
  function hullStrikeAsset(struck: string | null | undefined, structureId: number | null | undefined, pos: Vec3): string {
    const k = (struck || '').toLowerCase();
    if (k === 'structure') return STRUCK_SOUND[STRUCTURE_STRUCK[structureSound(structureId).material]];
    if (k === 'cliff' || /rock|boulder|cliff|outcrop|crag/.test(k)) return STRUCK_SOUND.rock;
    if (/wreck|hulk|car|truck|van|jeep|tank|container|drum|hedgehog|tetra|metal|steel|iron|setpiece|wagon|locomotive|tram|lamp|sign|pump|windmotor/.test(k)) return STRUCK_SOUND.steel;
    if (/sandbag|bag|berm|earth|trench|mound|dune|bale|hay|straw|stook|weedstack|coal/.test(k)) return STRUCK_SOUND.earth;
    if (/tree|log|lumber|timber|wood|plank|picket|wattle|crate|pallet|cart|hut|shed|barn|shack|blind|leanto|longhouse|cross|pole|bench|trough/.test(k)) return STRUCK_SOUND.timber;
    if (k) return STRUCK_SOUND.masonry;
    // the record is unknown (a network battle's event names none): the ground it happened on
    return STRUCK_SOUND[getTerrain?.()?.getGroundType(pos[0], pos[2]) === 'medium' ? 'rock' : 'masonry'];
  }

  // ------------------------------------------------------ props/collisions ---

  /**
   * A prop crushed, broken, toppled or knocked about sounds of what it is (propSounds.ts names every world kind): its
   * recipe's layers at the prop, a topple's landing when it lands. The obstacle crush and the world's own report of
   * the same prop arrive in one tick; the props' 0.05 s cooldown keeps it to one sound.
   */
  function onProp(event: PropEvent, destroyed: boolean): void {
    if (!event?.pos) return;
    const [x, y, z] = event.pos;
    // P7 (2026-10-13): a burst's near miss on a map vehicle (not destroyed): its glass blown and its body dented, louder
    // the nearer the burst; at most one every 0.1 s (one shell's near miss on a car park)
    if (typeof event.nearMiss === 'number') {
      if (!ctx || ctx.currentTime - lastNearMissAt < 0.1) return;
      lastNearMissAt = ctx.currentTime;
      const k = clamp(event.nearMiss, 0, 1);
      play('glass_shatter', { x, y, z, delayS: 0.03, gainDb: -10 + 8 * k });
      play('hit_metal', { x, y, z, gainDb: -14 + 8 * k });
      logSound('prop:nearMiss', { kind: event.kind, strength: +k.toFixed(2) });
      return;
    }
    const kind = String(event.kind || 'tree');
    const layers = propSoundRecipe(kind, event.h ?? 0);
    const trimDb = destroyed ? 0 : -1;
    for (const layer of layers) {
      play(layer.id, { x, y, z, gainDb: layer.gainDb + trimDb, delayS: layer.jitterS ? layer.delayS + random() * layer.jitterS : layer.delayS });
    }
    logSound(event.loose ? 'prop:knocked' : destroyed ? 'prop:destroyed' : 'prop:crushed', { kind: event.kind, id: layers[0]?.id ?? null });
  }

  /**
   * The front's aircraft sound of its era (2026-10-06): the Second World War maps fly piston fighters and twin-engine
   * bombers, the later ones jets. An event naming its type plays that type's sound; otherwise the scene's list.
   */
  function flyoverAsset(aircraft?: string): string {
    const named = aircraft && Object.hasOwn(FLYOVER_BY_AIRCRAFT, aircraft) ? FLYOVER_BY_AIRCRAFT[aircraft] : undefined;
    if (named) return named;
    const list = scene.flyovers;
    let total = 0;
    for (const [, w] of list) total += w;
    let roll = random() * total;
    for (const [id, w] of list) { if (roll < w) return id; roll -= w; }
    return list[0]?.[0] ?? 'jet_flyover';
  }

  /**
   * The bell towers of the battle's world, read once per scene from its buildings and set pieces when the first toll
   * falls due (the scene change clears them); until a world answers, the next toll asks again.
   */
  let bellTowers: BellTower[] | null = null;
  function currentBellTowers(): readonly BellTower[] {
    if (bellTowers) return bellTowers;
    const landmarks = getLandmarks?.() ?? null;
    if (!landmarks) return [];
    const terrain = getTerrain?.() ?? null;
    const towers: BellTower[] = [];
    for (const feature of landmarks) {
      const kind = typeof feature.landmark === 'string' ? feature.landmark : typeof feature.kind === 'string' ? feature.kind : '';
      const spec = Object.hasOwn(BELL_TOWERS, kind) ? BELL_TOWERS[kind] : null;
      if (!spec || !Number.isFinite(feature.x) || !Number.isFinite(feature.z)) continue;
      const ground = terrain ? terrain.getHeightAt(feature.x, feature.z) : 0;
      towers.push({ x: feature.x, y: (Number.isFinite(ground) ? ground : 0) + spec.heightM, z: feature.z, rate: spec.rate, gainDb: spec.gainDb, kind });
    }
    bellTowers = towers;
    return towers;
  }

  function onTankImpact(event: TankImpactEvent): void {
    const k = clamp(event.speedMps / 12, 0, 1);
    if (k < 0.05) return;
    // (2026-10-13) a landing slams the suspension, a hull on a hull is a ram, a crash sounds of what it struck (it was a
    // coin toss between rock and wall for all three)
    const id = event.cause === 'fall' ? 'hull_land' : event.cause === 'contact' ? 'ram_light' : hullStrikeAsset(event.struck, event.struckStructureId, event.pos);
    play(id, { ...at(event.pos), gainDb: -10 + 10 * k });
    if (isOwn(event.id) && k > 0.4) play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: -16 + 8 * k }));
    logSound('tank:impact', { id: event.id, speedMps: event.speedMps, sound: id });
  }

  function onTankRam(event: TankRamEvent, cinematic = false): void {
    if (!event?.pos) return;
    const closing = Math.max(0, Number(event.closingMps) || 0);
    const heavy = closing > 5.5 || Math.max(Number(event.dmgA) || 0, Number(event.dmgB) || 0) > 120;
    // a hull shoving a burnt-out wreck strikes dead steel, not a live tank's suspension and running gear (2026-10-13)
    const wreck = (event.aId != null && tanks.get(event.aId)?.alive === false) || (event.bId != null && tanks.get(event.bId)?.alive === false);
    play(wreck ? 'hit_metal' : heavy ? 'ram_heavy' : 'ram_light', { ...at(event.pos), gainDb: -6 + clamp(closing / 11, 0, 1) * 6, ...(cinematic ? { bus: 'cinematic' as const } : {}) });
    const occupied = !cinematic && (event.aIsPlayer || event.bIsPlayer || isOwn(event.aId) || isOwn(event.bId));
    if (occupied) {
      play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: -8 + clamp(closing / 11, 0, 1) * 6 }));
      const other = isOwn(event.aId) || event.aIsPlayer ? event.bId : event.aId;
      if (other && sameTeam(other, playerId)) say('friendly_ram', { prob: 0.5, delayS: 0.2 });
      else if (closing > 3) say('rammed', { delayS: 0.2 });
    }
    logSound('tank:ram', { aId: event.aId, bId: event.bId, occupied, closingMps: closing });
  }

  // ---------------------------------------------------------- module state ---

  /** Drops one hull's module states (the `${id}:${module}` keys) with no string built; module names hold no ':'. */
  function forgetModuleStates(id: string): void {
    for (const key of moduleStates.keys()) {
      if (key.charCodeAt(id.length) === 58 && key.startsWith(id) && key.indexOf(':', id.length + 1) < 0) moduleStates.delete(key);
    }
  }

  function onModuleState(event: ModuleStateEvent): void {
    const key = `${event.id}:${event.module}`;
    const prev = moduleStates.get(key) || 'ok';
    moduleStates.set(key, event.state);
    if (event.state === prev) return;
    const rank = (s: string) => (s === 'red' ? 2 : s === 'yellow' ? 1 : 0);
    const worse = rank(event.state) > rank(prev);
    const info = tanks.get(event.id);
    if (worse && event.state === 'red' && (event.module === 'trackL' || event.module === 'trackR') && info) {
      play('track_break', at(info.pos));
    }
    if (event.id === playerId && event.module === 'radio') radio?.setRadioDamage(rank(event.state) as 0 | 1 | 2);
    if (playerId == null || event.id !== playerId || battleMode.phase !== 'battle') return;
    if (event.source === 'hit') {
      if (worse && event.module === 'ammoRack') { play('alarm_ammo', { delayS: 0.01 }); caption('ammoRack'); }
      return;
    }
    if (worse) {
      if (event.module === 'ammoRack') { play('alarm_ammo', { delayS: 0.01 }); caption('ammoRack'); }
      const call = event.module === 'engine' && event.state === 'red' ? 'engine_destroyed' : MODULE_CALL[event.module];
      const track = event.module === 'trackL' || event.module === 'trackR';
      if (call && (event.state === 'red' || !track)) say(call, { delayS: 0.1 });
    } else if (event.repaired) {
      const call = event.module === 'gun' ? 'gun_repaired'
        : event.module === 'trackL' || event.module === 'trackR' ? 'track_repaired'
          : event.module === 'engine' ? 'engine_repaired' : 'repairs';
      say(call, { delayS: 0.12 });
    }
  }

  // ----------------------------------------------------------------- reload ---

  function reloadCue(cue: ReloadCue): void {
    play(cue.asset, hullOptions({ rate: cue.rate, gainDb: cue.gainDb }));
  }

  /** The mount our crew is loading: the selected round's (a missile's launcher, a secondary gun, the main gun). */
  function reloadingMount(caliber: number): WeaponMount {
    const me = playerId ? tanks.get(playerId) : null;
    const slot = latestPlayer?.combat?.shellSlot ?? 0;
    const round = latestPlayer?.spec?.gun?.shells?.[slot];
    return shotMount(me ? playerId : null, round?.name ?? null, caliber, round?.soundProfile ?? latestPlayer?.spec?.gun?.soundProfile ?? null);
  }

  function onReload(event: ReloadEvent): void {
    if (!ctx || battleMode.phase !== 'battle' || battleMode.over) return;
    // Owner 2026-10-17 (out of ammo): an empty gun still runs its post-shot cycle in the simulation, but the crew loads
    // nothing — no loader cues, no latch, no "reloaded" call; the half-played plan is dropped, so a cycle that resumes
    // starts afresh. The mode's unlimited rounds never read spent where this entity really refills (sim/matchRuleset
    // rulesetUnlimitedFor, the read the HUD's cards carry: an AC-130 escort runs dry, the gunship never does). No mode
    // reads as the standard ruleset (matchRulesetFor's own fallback): no mode literal here.
    const unlimitedRounds = rulesetUnlimitedFor(matchRulesetFor(getGameMode?.() as GameModeId), latestPlayer);
    if (selectedWeaponSpent(latestPlayer?.combat, unlimitedRounds)) {
      reload.active = false;
      reloadCalled = false;
      return;
    }
    const total = Math.max(0.05, Number(event.total) || 0.05);
    const kind = event.kind || 'shell';
    const caliber = Math.max(12, Number(event.caliberMm) || 100);
    const t = Number(event.t) || 0;
    if (!reload.active || reload.kind !== kind || Math.abs(reload.total - total) > 0.01 || t > reload.lastT + 0.04) {
      reload.active = true;
      reload.total = total;
      reload.kind = kind;
      reload.caliber = caliber;
      reload.lastT = t;
      reload.next = 0;
      // The loader by the mount's row and the hull's layout (the AC-130's howitzer by hand, its missiles on the pylon).
      const m = reloadingMount(caliber);
      const specId = playerId ? tanks.get(playerId)?.specId ?? null : null;
      const loader = loaderFor(specId, m);
      reload.plan = resolveReloadCuePlan(total, kind, m, loader, { rackDoor: readyRackDoor(specId), magazineRounds: Number(event.magazineCapacity) || 0 });
      logSound('reload:start', { kind, total, caliberMm: caliber, key: m.key, loader });
    }
    const progress = Number.isFinite(event.progress) ? clamp(Number(event.progress), 0, 1) : clamp(1 - t / total, 0, 1);
    const cues = reload.plan?.cues || [];
    while (reload.next < cues.length && progress + 1e-6 >= cues[reload.next].at) {
      const cue = cues[reload.next++];
      reloadCue(cue);
      logSound('reload:cue', { cue: cue.type, asset: cue.asset, kind, progress });
    }
    reload.lastT = t;
    if (event.done) {
      if (reload.plan?.ready) play('latch_ready', hullOptions({ gainDb: -2 }));
      reload.active = false;
      reloadCalled = false;
      if (total >= 1.25) say('reloaded', { prob: 0.35, delayS: 0.08 });
    } else if (!reloadCalled && total >= 2.2) {
      reloadCalled = true;
      say('reloading', { prob: 0.15, delayS: 0.1 });
    }
  }

  // --------------------------------------------------------- mode objectives ---

  /** A mode event's world position (x, z, an optional y; the terrain under it otherwise), or null when it names none. */
  function modeEventAt(payload: Record<string, unknown>, liftM = 0): { x: number; y: number; z: number } | null {
    const x = Number(payload.x), z = Number(payload.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let y = Number(payload.y);
    if (!Number.isFinite(y)) {
      try { y = getTerrain?.()?.getHeightAt(x, z) ?? frame.y; } catch { y = frame.y; }
    }
    return { x, y: y + liftM, z };
  }

  /**
   * Every mode event the controller emits (modeSounds.ts MODE_EVENT_SOUND names each, and its recordings or why it is
   * heard as nothing). Objective cues by our side: a flag by whose flag it is (FLAG_CUE), a zone, a goal and a score by
   * who took it.
   */
  function onMode(type: ModeEventType, payload: Record<string, unknown>): void {
    const mode = getGameMode?.() || 'standard';
    const perspective = getObjectiveTeam?.();
    const ours = perspective === 'alpha' || perspective === 'bravo' ? perspective : objectiveTeam(playerTeam);
    const team = payload.team === 'alpha' || payload.team === 'bravo' ? payload.team : null;
    const side = team === ours ? 'ours' : 'theirs';
    const byMe = payload.by != null && payload.by === playerId;
    switch (type) {
      case 'zone_captured':
        if (team === ours) { play('ui_objective_gain'); say('objective_captured', { delayS: 0.3 }); }
        else { play('ui_objective_loss'); say('objective_lost', { delayS: 0.3 }); }
        break;
      case 'zone_contested':
        // The other side has driven onto a point we hold.
        if (team === ours) say('objective_contested', { delayS: 0.3 });
        break;
      case 'flag_taken':
        play(FLAG_CUE.flag_taken[side]);
        say(team === ours ? 'flag_taken_theirs' : 'flag_taken_ours', { delayS: 0.25 });
        break;
      case 'flag_captured':
        play(FLAG_CUE.flag_captured[side]);
        if (team === ours) say('flag_captured', { delayS: 0.3 });
        break;
      case 'flag_returned':
        play(FLAG_CUE.flag_returned[side]);
        if (team === ours) say('flag_returned', { delayS: 0.3 });
        break;
      case 'flag_dropped':
        play(FLAG_CUE.flag_dropped[side]);
        break;
      case 'wave_started':
        // The Horde's waves come on the air-raid siren (its special waves on the attack warning's warble); the
        // Frontline's counter-attacks under a barrage.
        play(mode === 'endless_horde' ? hordeWaveSiren(payload.special) : mode === 'frontline_assault' ? 'mode_frontline_barrage' : 'sting_wave');
        say('wave_incoming', { delayS: 0.6 });
        break;
      case 'wave_cleared':
        play(mode === 'endless_horde' ? 'mode_horde_all_clear' : 'ui_wave_clear');
        say('wave_cleared', { delayS: 0.4 });
        break;
      case 'counter_attack': {
        // The defenders' signal flare goes up over the sector they drive at, heard from there.
        const at = modeEventAt(payload, 40);
        if (at) play('mode_counter_attack', at);
        break;
      }
      case 'line_advanced':
        // The line moves forward behind its own guns.
        play(mode === 'frontline_assault' ? 'mode_frontline_barrage' : 'ui_line_advance');
        say('line_advanced', { delayS: 0.4 });
        break;
      case 'pickup_spawned': {
        // A cache arrives (Horde repair and ammunition, Gravity boosts): heard where it lands.
        const at = modeEventAt(payload);
        if (at) play('cache_drop', { ...at, delayS: 0.15 });
        // Our AC-130's own drop: the crew calls it away.
        if (payload.airDrop === true && byMe) say(payload.kind === 'heal' ? 'supply_repair' : 'supply_ammo', { delayS: 0.2 });
        break;
      }
      case 'goal_scored':
        if (team === ours) { play('ui_goal'); say('goal_scored', { delayS: 0.2 }); } else play('ui_objective_loss');
        break;
      case 'ball_hit': {
        // The steel buoy struck, by anyone, heard where it is (the ball's position; a ram's striker otherwise). A shot
        // rings it harder than a shove.
        const striker = typeof payload.by === 'string' ? tanks.get(payload.by)?.pos : null;
        const at = modeEventAt(payload) ?? (striker ? { x: striker.x, y: striker.y + 1.5, z: striker.z } : null);
        if (at) play('ball_strike', { ...at, gainDb: payload.kind === 'shot' ? 0 : -3 });
        break;
      }
      case 'ball_reset':
        // An untouched ball back on the kick-off spot: the kick-off's horn again, lower.
        play('mode_turbo_horn', { gainDb: -8 });
        break;
      case 'pickup_collected':
        if (byMe) { play('ui_pickup'); say('pickup_collected', { delayS: 0.2 }); }
        break;
      case 'destruction_scored':
        if (team === ours) play('ui_score');
        break;
      case 'respawn':
        // a respawn re-arms that hull's death (one this seat never saw alive again included) and starts its new life
        // with whole modules, as the presentation mends them at this edge (battlePresentation reviveAtRespawn): the new
        // life's first break of a module the last life broke sounds its track_break, crew call and radio damage
        if (typeof payload.id === 'string') {
          deathLatch.delete(payload.id);
          forgetModuleStates(payload.id);
        }
        if (playerId != null && payload.id === playerId) {
          // A fresh hull: alive before the next frame reads it (the event lands inside the sim step), and a new life's
          // one-shot calls (low hull, low ammunition) armed again.
          const info = tanks.get(playerId);
          if (info) info.alive = true;
          lowHpCalled = false;
          ammoLowCalled = false;
          heartbeatBelow = 0;
          radio?.setRadioDamage(0);
          play('ui_respawn');
          say('respawn', { delayS: 0.5 });
        }
        break;
      case 'infected': {
        // Infected: our crew turned to the other side (the sting, the radio breaking up); an ally turned (the net
        // breaking up as its crew is lost); one more of ours when we are the infected (the outbreak, low). The hull's
        // side is read before this frame re-indexes it: the side it fought for.
        const turned = typeof payload.id === 'string' ? tanks.get(payload.id) : null;
        if (payload.id === playerId) { play('sting_infected'); play('radio_interference', { space: 'flat', bus: 'voice', gainDb: -4 }); }
        else if (turned && playerTeam != null && turned.team === playerTeam) play('radio_interference', { space: 'flat', bus: 'voice', gainDb: -10 });
        else if (turned) play('mode_infected_outbreak', { gainDb: -12 });
        break;
      }
      case 'weapon_advanced':
        // Gun Game: the crew changes over to the next weapon on the ladder and loads it.
        if (payload.id === playerId) weaponChangeover(Number(payload.stage));
        break;
      case 'line_reinforced':
      case 'horde_retired':
      case 'horde_recycled':
      case 'completed':
        // heard as nothing (modeSounds.ts MODE_EVENT_SOUND says why)
        return;
      default: {
        const unnamed: never = type;
        return unnamed;
      }
    }
    logSound(`mode:${type}`, { team, byMe });
  }

  /** Gun Game stages in order: 30 mm AP, 105 and 120 mm APFSDS, 152 mm HE, the guided missile. */
  const LADDER_LOAD = ['load_kinetic', 'load_kinetic', 'load_kinetic', 'load_he', 'load_missile'];

  function weaponChangeover(stage: number): void {
    const missile = stage >= LADDER_LOAD.length - 1;
    play('breech_open', hullOptions());
    play(missile ? 'missile_tube_load' : 'shell_ram', hullOptions({ delayS: 0.55 }));
    if (!missile) play('breech_close', hullOptions({ delayS: 1.15 }));
    play('latch_ready', hullOptions({ delayS: missile ? 1.4 : 1.5 }));
    say(LADDER_LOAD[clamp(Math.floor(stage) || 0, 0, LADDER_LOAD.length - 1)], { delayS: 0.3 });
  }

  // ------------------------------------------------------------ alarms/edge ---

  function updatePlayerEdges(entity: AudioEntity, dt: number): void {
    if (!mixer || !ctx) return;
    const combat = entity.combat;
    const state = entity.state;
    const alive = !combat?.destroyed;
    if (!alive) return;
    // Critical damage heartbeat.
    if (alarmHeartbeat && combat && combat.maxHp > 0 && !battleMode.over) {
      const frac = combat.hp / combat.maxHp;
      if (frac > 0.25) heartbeatBelow = 0;
      else if (heartbeatBelow === 0 || frac < heartbeatBelow - 0.05) {
        heartbeatBelow = frac;
        heartbeatRig?.stop();
        heartbeatRig = loopRig('heartbeat_loop', { maxDurS: 6 });
        caption('criticalDamage');
      }
    }
    // First move after rollout.
    if (battleMode.rolledOut && !movedOnce && Math.abs(state.speed) > 2.5) {
      movedOnce = true;
      say('on_the_move', { delayS: 0.1 });
    }
    // Rolled over / back on tracks.
    const over = !!state.overturned;
    if (over && !wasOverturned) {
      play('rollover', { ...at(state.pos), gainDb: 0 });
      play('overturned_groan', hullOptions({ delayS: 1.2 }));
      say('flipped', { delayS: 0.6 });
    }
    wasOverturned = over;
    // Deep water: the crew's call and a flooding engine (the splash itself is the rig's, for every hull: vehicleRig WATER_SOUND).
    const info = surfaceCache.get(entity.id);
    const deep = !!info && info.depth > 1.25;
    if (deep && !wasDeep) {
      say('taking_water', { delayS: 0.5 });
      if (info && info.depth > 1.8) play('engine_flood', hullOptions({ delayS: 0.6 }));
    }
    wasDeep = deep;
    // Stuck: full throttle, no progress, on the ground. Never while our throttle flies the drone (the tank sits
    // still under it), in the gunship, or before the battle rolls out.
    const throttle = Math.abs(entity.input?.throttle ?? 0);
    const throttleDrivesTank = battleMode.rolledOut && !entity.aerial?.active && entity.aerial?.kind !== 'gunship';
    if (throttleDrivesTank && throttle > 0.6 && Math.abs(state.speed) < 0.35 && state.grounded !== false && !state.overturned && moduleHealth(entity, 'trackL') !== 'red' && moduleHealth(entity, 'trackR') !== 'red' && moduleHealth(entity, 'engine') !== 'red') {
      stuckS += dt;
      if (stuckS > 2.6) {
        stuckS = -8;
        say('stuck', { delayS: 0.1 });
        if (info?.surface === 'mud' || info?.surface === 'water') play('mud_suck', hullOptions({ bus: 'own' }));
      }
    } else if (stuckS > 0) stuckS = 0;
    else stuckS = Math.min(0, stuckS + dt);
    // Gun at its mechanical limit while the crew keeps laying: one clunk per
    // stop, not per frame the lay flickers against the stop.
    const now = ctx.currentTime;
    const limit = !!state.atGunLimit;
    const slewing = Math.abs(state.turretYawRate ?? 0) > 0.05;
    if (limit && !wasAtLimit && now - lastGunLimitAt > 2.5) {
      lastGunLimitAt = now;
      // The elevation drive straining against its stop: felt through the mount, not announced.
      play('gun_limit', hullOptions({ gainDb: slewing ? -12 : -9 }));
    }
    wasAtLimit = limit;
    // The turret drive's stop clunk ends a real slew (a quarter second or
    // more), not the servo settling; and a damaged ring's grind. An electric and a hydraulic drive start and stop as
    // themselves (TURRET_DRIVE_SOUND, world-sfx-269).
    const drive = TURRET_DRIVE_SOUND[tanks.get(entity.id)?.identity.turretDrive ?? 'electric'];
    const traverse = Math.abs(state.turretYawRate ?? 0);
    if (traverse > 0.12) {
      const before = slewS;
      slewS += dt;
      // The drive takes up the turret's weight: one start per real slew, never per servo flicker.
      if (before < 0.1 && slewS >= 0.1 && now - lastTurretStartAt > 0.8) {
        lastTurretStartAt = now;
        play(drive.start, hullOptions({ gainDb: -6 }));
      }
    } else if (traverse < 0.02) {
      if (slewS > 0.25 && now - lastTurretStopAt > 0.6) {
        lastTurretStopAt = now;
        play(drive.stop, hullOptions({ gainDb: -4 }));
      }
      slewS = 0;
    }
    if (moduleHealth(entity, 'turretRing') !== 'ok' && traverse > 0.08) play('traverse_grind_loop', hullOptions({ maxDurS: 0.6, gainDb: -6 }));
    // Ammunition stock.
    const ammo = combat?.ammo;
    const cap = combat?.ammoCapacity;
    if (ammo && cap && ammo.length && !ammoLowCalled) {
      let left = 0;
      let total = 0;
      for (let i = 0; i < ammo.length; i++) { left += Math.max(0, ammo[i] || 0); total += Math.max(0, cap[i] || 0); }
      if (total > 0 && left > 0 && left / total < 0.2) { ammoLowCalled = true; say('ammo_low', { delayS: 0.2 }); }
    }
  }

  /**
   * The crew's side counts (last tank, last enemy, outnumbered), from the whole field: a solo battle's list, or the
   * roster a network battle counts by (getTeamRoster). What a network seat spots is never the count (2026-10-14: its
   * first spotted enemy read as "last enemy" with the rest alive and hidden), so a spotted list without a roster calls
   * nothing.
   */
  function updateTeamCounts(): void {
    if (!playerId || battleMode.phase !== 'battle' || battleMode.over || !battleMode.rolledOut) return;
    const me = tanks.get(playerId);
    if (!me || !me.alive) return;
    let allies = 0;
    let enemies = 0;
    let field = 0;
    const roster = getTeamRoster?.() ?? null;
    if (roster) {
      for (let i = 0; i < roster.length; i++) {
        const hull = roster[i] as { team?: unknown; combat?: { destroyed?: unknown } | null } | null | undefined;
        if (!hull || typeof hull !== 'object') continue;
        field++;
        if (hull.combat?.destroyed) continue;
        if (String(hull.team ?? '') === me.team) allies++; else enemies++;
      }
    } else if (spottedField) {
      return;
    } else {
      field = tanks.size;
      for (const info of tanks.values()) {
        if (!info.alive) continue;
        if (info.team === me.team) allies++; else enemies++;
      }
    }
    if (field < 4) return;
    if (allies === 1 && enemies > 0 && !lastStanding.mine) { lastStanding.mine = true; say('last_tank', { delayS: 0.8 }); }
    if (enemies === 1 && !lastStanding.theirs) { lastStanding.theirs = true; say('last_enemy', { delayS: 0.8 }); }
    if (enemies >= 3 && enemies >= allies * 2 && !lastStanding.outnumbered) { lastStanding.outnumbered = true; say('outnumbered', { delayS: 0.6 }); }
  }

  // ------------------------------------------------------------ vehicle rigs ---

  /** A hull's sound identity from its whole spec: its rig's (identityFor) and the battle warm's (presenceAssets) alike. */
  function specIdentity(spec: AudioSpec | null | undefined, specId: string | undefined): VehicleAudioIdentity {
    const whole = spec || {};
    return resolveVehicleAudioIdentity({ ...whole, id: specId ?? whole.id });
  }

  function identityFor(entity: AudioEntity): VehicleAudioIdentity {
    return specIdentity(entity.spec, entity.specId);
  }

  /** A roster entry's identity before its hull exists: the fleet's spec for the id (getVehicleSpec), as its rig will read. */
  function rosterIdentity(specId: string): VehicleAudioIdentity {
    let spec: RuntimeValue = null;
    try { spec = getVehicleSpec?.(specId); } catch { /* an id the fleet does not know: the id alone */ }
    return specIdentity(spec && typeof spec === 'object' ? spec as AudioSpec : null, specId);
  }

  /**
   * Whether a hull wears a field net (V7): one walk of its visual the first time one is there (ghillieSuit.ts marks the
   * net and garnish meshes userData.fieldSuit); null while no visual has been built.
   */
  function fieldSuitOf(value: RuntimeValue): boolean | null {
    const root = (value as { visual?: { root?: { traverse?(fn: (o: { userData?: { fieldSuit?: unknown } }) => void): void } } | null } | null)?.visual?.root;
    if (!root || typeof root.traverse !== 'function') return null;
    let suited = false;
    root.traverse((o) => { if (o.userData?.fieldSuit === true) suited = true; });
    return suited;
  }

  function indexTanks(list: readonly RuntimeValue[], dt: number): void {
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      if (!entity) continue;
      // a network battle's presented hull (battlePresentation's actor): the list is what this seat's team spots
      if (!spottedField && typeof (entity as { networkVisible?: unknown }).networkVisible === 'boolean') spottedField = true;
      let info = tanks.get(entity.id);
      const p = entity.state.pos;
      if (!info) {
        info = {
          team: String(entity.team ?? ''), isPlayer: !!entity.isPlayer, pos: p, lastX: p.x, lastY: p.y, lastZ: p.z,
          vx: 0, vy: 0, vz: 0, identity: identityFor(entity), specId: String(entity.specId ?? entity.spec?.id ?? ''), nation: String(entity.spec?.nation ?? ''), alive: !entity.combat?.destroyed, spotted: false, suited: null,
          gun: null, mounts: [],
        };
        tanks.set(entity.id, info);
      }
      info.team = String(entity.team ?? info.team);
      info.isPlayer = !!entity.isPlayer;
      const specId = String(entity.specId ?? entity.spec?.id ?? '');
      const nation = String(entity.spec?.nation ?? '');
      const vehicleChanged = info.nation !== nation || info.specId !== specId;
      info.specId = specId;
      info.nation = nation;
      // our own banks follow the new hull's loaders and stations, so its spec is recorded first
      const gun = entity.spec?.gun ?? null;
      const gunChanged = info.gun !== gun;
      if (gunChanged) {
        info.gun = gun;
        info.mounts = weaponMounts(gun);
      }
      if (entity.isPlayer && (gunChanged || vehicleChanged)) preloadOwnWeapons(info);
      info.pos = p;
      if (dt > 1e-4) {
        const k = clamp(dt / 0.15, 0, 1);
        info.vx += ((p.x - info.lastX) / dt - info.vx) * k;
        info.vy += ((p.y - info.lastY) / dt - info.vy) * k;
        info.vz += ((p.z - info.lastZ) / dt - info.vz) * k;
      }
      info.lastX = p.x; info.lastY = p.y; info.lastZ = p.z;
      info.alive = !entity.combat?.destroyed;
      if (deathLatch.size) {
        // a latched death re-arms once its hull has been seen destroyed and then alive again (a respawn)
        const seenDead = deathLatch.get(entity.id);
        if (seenDead !== undefined) {
          if (!info.alive) { if (!seenDead) deathLatch.set(entity.id, true); }
          else if (seenDead) deathLatch.delete(entity.id);
        }
      }
      if (info.suited == null) info.suited = fieldSuitOf(list[i]);
      if (entity.isPlayer && playerId !== entity.id) {
        playerId = entity.id;
        playerTeam = info.team;
        applyCrewLanguage();
        preloadVehicle(info.identity);
        preloadOwnWeapons(info);
      } else if (entity.isPlayer && vehicleChanged) applyCrewLanguage();
    }
    if (listenerOwnerId == null && listenerKind === 'player-tank') listenerOwnerId = playerId;
    if (!bossChecked && getGameMode?.() === 'juggernaut') markJuggernaut(list);
  }

  /**
   * Juggernaut: the boss (eight times anyone's hull) sounds like one. Its engine bank runs deeper, it lands and
   * rams with a superheavy's mass and its gun reports carry further (fireWeapon). Found once per battle by its hull.
   */
  function markJuggernaut(list: readonly RuntimeValue[]): void {
    let top: AudioEntity | null = null;
    let topHp = 0;
    let nextHp = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      const hp = entity?.combat?.maxHp ?? 0;
      if (hp > topHp) { nextHp = topHp; topHp = hp; top = entity; } else if (hp > nextHp) nextHp = hp;
    }
    if (!top || nextHp <= 0) return;
    bossChecked = true;
    if (topHp < 3 * nextHp) return;
    bossId = top.id;
    const info = tanks.get(top.id);
    if (info) info.identity = Object.freeze({ ...info.identity, enginePitch: info.identity.enginePitch * 0.86, mass: 1 });
    const rig = rigs.get(top.id);
    if (rig) { rig.kill(0.2); rigs.delete(top.id); }
    logSound('mode:juggernaut-boss', { id: top.id });
  }

  function preloadVehicle(identity: VehicleAudioIdentity): void {
    if (!library) return;
    const ids: string[] = ['idle', 'low', 'mid', 'high', 'start', 'stop'].map((b) => `engine_${identity.engine}_${b}`);
    // our hull is heard from the countdown's first frame: ahead of the battle's combat banks
    void library.load(ids, { front: true });
  }

  /**
   * Our own weapons (gun-reports-269): every mount's own and closed-turret reports and its loader's machinery, decoded
   * and pinned once our hull is known (long before the rollout lets the guns speak), and again when the gun changes.
   */
  function ownWeaponAssets(info: TankInfo | null | undefined): string[] {
    const ids = new Set<string>();
    if (!info) return [];
    for (const m of info.mounts) {
      const row = m.row;
      if (!row) continue;
      if (row.own) ids.add(row.own);
      if (row.interior) ids.add(row.interior);
      for (const id of reloadAssets(m, loaderFor(info.specId, m))) ids.add(id);
    }
    // our roof stations' own and closed-turret reports, by the census of our hull's stations
    for (const row of stationRows(info.specId)) for (const id of [row.own, row.interior]) if (id) ids.add(id);
    return [...ids];
  }
  function preloadOwnWeapons(info: TankInfo): void {
    if (!library) return;
    const ids = ownWeaponAssets(info);
    if (!ids.length) return;
    library.pin(ids);
    void library.load(ids);
  }

  /** QA override (debug surface only): audition one crew pack in any battle. */
  let forcedCrewLanguage: CrewLanguage | null = null;

  function applyCrewLanguage(): void {
    if (!radio) return;
    const player = playerId ? tanks.get(playerId) : null;
    radio.setLanguage(forcedCrewLanguage ?? resolveCrewLanguage(player?.specId, player?.nation, crewVoice));
  }

  // Per-frame scratch (no allocation in the update loop).
  interface RigCandidate { id: string; entity: AudioEntity; d: number }
  const candidates: RigCandidate[] = [];
  const candidateSlots: RigCandidate[] = [];
  const keep = new Map<string, RigLod>();
  const byDistance = (a: RigCandidate, b: RigCandidate): number => a.d - b.d;

  function updateRigs(list: readonly RuntimeValue[], dt: number): void {
    if (!mixer || !library || !pool || !ctx) return;
    candidates.length = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      if (!entity || entity.combat?.destroyed || entity.modeActive === false) continue;
      if (entity.aerial?.kind === 'gunship') continue;
      if (probeSolo != null && entity.id !== probeSolo) continue;
      const p = entity.state.pos;
      const d = Math.hypot(p.x - frame.x, p.y - frame.y, p.z - frame.z);
      // Flying the drone, our tank is heard from the drone like any other.
      const own = entity.id === listenerOwnerId && listenerKind !== 'player-drone';
      const existing = rigs.has(entity.id);
      if (!own && d > (existing ? VEHICLE_LOD.farOutM : VEHICLE_LOD.farInM)) continue;
      let slot = candidateSlots[candidates.length];
      if (!slot) { slot = { id: '', entity, d: 0 }; candidateSlots.push(slot); }
      slot.id = entity.id;
      slot.entity = entity;
      slot.d = own ? -1 : Math.max(0, d - (existing ? 25 : 0));
      candidates.push(slot);
    }
    candidates.sort(byDistance);
    keep.clear();
    let near = 0;
    let far = 0;
    for (const c of candidates) {
      if (c.d < 0) { keep.set(c.id, 'own'); continue; }
      const rig = rigs.get(c.id);
      const nearLimit = rig?.lod === 'near' ? VEHICLE_LOD.nearOutM : VEHICLE_LOD.nearInM;
      if (c.d < nearLimit && near < budget.nearVehicles) { keep.set(c.id, 'near'); near++; }
      else if (far < budget.farVehicles) { keep.set(c.id, 'far'); far++; }
    }
    for (const [id, rig] of rigs) {
      if (!keep.has(id)) { rig.kill(0.4); rigs.delete(id); logSound('engine:stop', { id, reason: 'range-or-priority' }); }
    }
    const now = ctx.currentTime;
    const cabin = mixer.cabinLevel();
    for (const c of candidates) {
      const lod = keep.get(c.id);
      if (!lod) continue;
      const entity = c.entity;
      const info = tanks.get(c.id);
      if (!info) continue;
      let rig = rigs.get(c.id);
      if (!rig) {
        rig = createVehicleRig({ mixer, library, pool, random, reverb: budget.reverb }, c.id, info.identity, lod);
        rigs.set(c.id, rig);
        logSound('engine:start', { id: c.id, own: lod === 'own', family: info.identity.engine });
      } else rig.setLod(lod);
      const p = entity.state.pos;
      let cached = surfaceCache.get(c.id);
      if (!cached) {
        cached = { surface: 'earth', depth: 0, occluded: 0, at: -Infinity };
        surfaceCache.set(c.id, cached);
      }
      if (now - cached.at > (lod === 'own' ? 0.12 : 0.35)) {
        const s = surfaceAt(p.x, p.z);
        cached.surface = s.surface;
        cached.depth = s.depth;
        cached.occluded = lod === 'own' ? 0 : occlusionAt(p.x, p.y, p.z);
        cached.at = now;
      }
      toListenerFrame(frame, p.x, p.y, p.z, rigFrame.rel);
      const d = rigFrame.rel.distance;
      const radial = d > 0.5 ? -((p.x - frame.x) * info.vx + (p.y - frame.y) * info.vy + (p.z - frame.z) * info.vz) / d : 0;
      const spec = entity.spec || {};
      const top = Math.max(1, (spec.topSpeedKmh || 50) / 3.6);
      fillVehicleInput(input, dt, entity.state.speed, top, Math.max(1, (spec.reverseSpeedKmh || 15) / 3.6),
        entity.input?.throttle ?? 0, !!entity.input?.brake, entity.state.yawRate ?? 0, entity.state.grounded !== false,
        entity.state.verticalSpeed ?? 0, entity.state.landingImpactMps ?? 0, !!entity.state.gripLost, moduleHealth(entity, 'engine'),
        moduleHealth(entity, 'trackL') === 'red' || moduleHealth(entity, 'trackR') === 'red');
      rigFrame.dtS = dt;
      rigFrame.x = p.x; rigFrame.y = p.y; rigFrame.z = p.z;
      rigFrame.own = lod === 'own';
      rigFrame.scoped = rigFrame.own && listenerScoped;
      rigFrame.surface = cached.surface;
      rigFrame.waterDepthM = cached.depth;
      rigFrame.atmosphere = atmosphere;
      rigFrame.occluded = cached.occluded;
      rigFrame.doppler = rigFrame.own ? 1 : dopplerRatio(radial, atmosphere);
      rigFrame.suited = info.suited === true;
      if (rigFrame.own) {
        const pitch = entity.state.gunPitch ?? 0;
        rigFrame.pitchRate = lastPitch != null && dt > 1e-4 ? (pitch - lastPitch) / dt : 0;
        lastPitch = pitch;
        rigFrame.turretRate = entity.state.turretYawRate ?? 0;
        rigFrame.cabin = cabin;
      } else {
        rigFrame.pitchRate = 0;
        rigFrame.turretRate = 0;
        rigFrame.cabin = 0;
      }
      rig.update(rigFrame);
      if (rigFrame.own) updatePlayerEdges(entity, dt);
    }
  }

  // ------------------------------------------------------------- aircraft ---

  // Drones heard from outside (by shell id), gunships heard from the ground (by
  // entity id), and the listener's own aircraft: its drone's feed or the cabin.
  const droneRigs = new Map<number, AerialRig>();
  const gunshipRigs = new Map<string, AerialRig>();
  let ownAerial: AerialRig | null = null;
  let ownDroneFlying = false;
  // Our drone's launch time and last velocity (its motors work hardest while it corrects).
  let ownDroneSince = 0;
  let ownDroneVx = 0, ownDroneVy = 0, ownDroneVz = 0, ownDroneAccel = 0;
  const DRONE = AERIAL_RULES.drone;
  let aerialWarmed = false;
  const seenAerial = new Set<number | string>();
  const aerialFrame: AerialFrame = { rel: { right: 0, up: 0, ahead: 0, distance: 0 }, atmosphere, doppler: 1, speedK: 0, strain: 0, load: 1, spool: 1, sag: 0 };

  interface DroneShell { id?: number; shooterId?: string; dead?: boolean; pos?: { x: number; y: number; z: number }; vel?: { x: number; y: number; z: number }; spec?: { tracer?: string } }

  function aerialDeps() {
    return { mixer: mixer!, library: library!, random, reverb: budget.reverb };
  }

  /** Doppler of a source at p moving at v, from the listener frame. */
  function radialDoppler(p: { x: number; y: number; z: number }, vx: number, vy: number, vz: number, distance: number): number {
    if (distance < 0.5) return 1;
    return dopplerRatio(-((p.x - frame.x) * vx + (p.y - frame.y) * vy + (p.z - frame.z) * vz) / distance, atmosphere);
  }

  function updateAerial(list: readonly RuntimeValue[], shells: readonly RuntimeValue[], dt: number): void {
    if (!mixer || !library || !pool) return;
    seenAerial.clear();
    aerialFrame.atmosphere = atmosphere;
    let me: AudioEntity | null = null;
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      if (!entity?.aerial?.kind) continue;
      if (!aerialWarmed) { aerialWarmed = true; library.pin(AERIAL_SET, false, 'aerial'); void library.load(AERIAL_SET); }
      if (entity.id === listenerOwnerId) me = entity;
      if (entity.aerial.kind !== 'gunship' || entity.combat?.destroyed || entity.id === listenerOwnerId) continue;
      // A gunship circling overhead, heard from the ground.
      seenAerial.add(entity.id);
      let rig = gunshipRigs.get(entity.id);
      if (!rig) { rig = createAerialRig(aerialDeps(), 'gunship', 'world'); gunshipRigs.set(entity.id, rig); logSound('aerial:start', { id: entity.id, kind: 'gunship' }); }
      const p = entity.state.pos;
      const info = tanks.get(entity.id);
      toListenerFrame(frame, p.x, p.y, p.z, aerialFrame.rel);
      aerialFrame.doppler = info ? radialDoppler(p, info.vx, info.vy, info.vz, aerialFrame.rel.distance) : 1;
      aerialFrame.speedK = 1;
      aerialFrame.strain = 0;
      rig.update(aerialFrame);
    }
    for (const [id, rig] of gunshipRigs) if (!seenAerial.has(id)) { rig.kill(1.5); gunshipRigs.delete(id); }

    // Drones in flight are shells; the listener's own drone is heard through its feed instead.
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i] as DroneShell;
      if (shell?.spec?.tracer !== 'DRONE' || shell.dead || shell.id == null || !shell.pos) continue;
      if (listenerShot(shell.shooterId)) continue;
      const p = shell.pos;
      // where each carrier's drone was last heard: a drone shot down falls there (drone:down names its carrier)
      if (shell.shooterId) {
        const last = droneLastAt.get(shell.shooterId);
        if (last) { last.x = p.x; last.y = p.y; last.z = p.z; } else droneLastAt.set(shell.shooterId, { x: p.x, y: p.y, z: p.z });
      }
      toListenerFrame(frame, p.x, p.y, p.z, aerialFrame.rel);
      let rig = droneRigs.get(shell.id);
      if (!rig) {
        if (aerialFrame.rel.distance > 520) continue;
        if (!aerialWarmed) { aerialWarmed = true; library.pin(AERIAL_SET, false, 'aerial'); void library.load(AERIAL_SET); }
        rig = createAerialRig(aerialDeps(), 'drone', 'world');
        droneRigs.set(shell.id, rig);
        logSound('aerial:start', { id: shell.id, kind: 'drone' });
      }
      seenAerial.add(shell.id);
      const v = shell.vel;
      const speed = v ? Math.hypot(v.x, v.y, v.z) : 0;
      aerialFrame.doppler = v ? radialDoppler(p, v.x, v.y, v.z, aerialFrame.rel.distance) : 1;
      aerialFrame.speedK = clamp(speed / DRONE.speedMps, 0, 1);
      aerialFrame.strain = 0;
      rig.update(aerialFrame);
      // An enemy drone closing on us: the commander calls it once, inside 150 m (never a missile).
      if (!droneWarned.has(shell.id) && aerialFrame.rel.distance < 150 && aerialFrame.doppler > 1.005
        && playerId && !sameTeam(shell.shooterId, playerId) && tanks.get(playerId)?.alive !== false) {
        droneWarned.add(shell.id);
        say('drone_incoming', { delayS: 0.05 });
      }
    }
    for (const [id, rig] of droneRigs) if (!seenAerial.has(id)) { rig.kill(0.25); droneRigs.delete(id); droneWarned.delete(id); }

    // Our own aircraft: the gunship's cabin, or the drone's feed while it flies.
    const view = me?.aerial;
    const flying = view?.kind === 'drone' && !!view.active && !me?.combat?.destroyed;
    const cabin = view?.kind === 'gunship' && !me?.combat?.destroyed;
    if (flying && !ownDroneFlying) {
      // The quadcopter spins up and lifts off our hull; from here we listen through it.
      play('drone_spinup', { space: 'flat', bus: 'own', lowpassHz: 9000 });
      say('drone_launch', { delayS: 0.3 });
      ownDroneSince = mixer.ctx.currentTime;
      ownDroneVx = ownDroneVy = ownDroneVz = ownDroneAccel = 0;
      ownDroneLast.batteryS = view?.batteryS ?? DRONE.batteryS;
      ownDroneLast.rangeM = 0;
      logSound('aerial:launch', { id: me?.id });
    } else if (!flying && ownDroneFlying) {
      play('drone_link_lost', { space: 'flat', bus: 'own', lowpassHz: 5000 });
      // Lost to its battery or past the link's range (a hit is the gunner's call, a recall is ours, a dead tank says nothing).
      const spent = ownDroneLast.batteryS <= 0.75 || ownDroneLast.rangeM >= DRONE.rangeM * 0.96;
      if (spent && me && !me.combat?.destroyed) say('drone_lost', { delayS: 0.35 });
      logSound('aerial:feed-lost', { id: me?.id, spent });
    }
    ownDroneFlying = flying;
    const wantKind = flying ? 'drone' : cabin ? 'gunship' : null;
    if (ownAerial && ownAerial.kind !== wantKind) { ownAerial.kill(flying || cabin ? 0.3 : 0.15); ownAerial = null; }
    if (!wantKind || !me || !view) return;
    if (!ownAerial) ownAerial = createAerialRig(aerialDeps(), wantKind, 'own');
    aerialFrame.doppler = 1;
    aerialFrame.rel.distance = 0;
    aerialFrame.rel.right = 0;
    if (wantKind === 'drone') {
      const p = me.state.pos;
      const range = Math.hypot((view.x ?? p.x) - p.x, (view.y ?? p.y) - p.y, (view.z ?? p.z) - p.z);
      ownDroneLast.batteryS = view.batteryS ?? ownDroneLast.batteryS;
      ownDroneLast.rangeM = range;
      const battery = rampBetween(10 - (view.batteryS ?? DRONE.batteryS), 0, 10);
      // The link frays over the last third of its range and the last ten seconds of battery.
      aerialFrame.strain = Math.max(rampBetween(range, DRONE.rangeM * 0.65, DRONE.rangeM), battery);
      let vx = 0, vy = 0, vz = 0;
      for (let i = 0; i < shells.length; i++) {
        const shell = shells[i] as DroneShell;
        if (shell?.spec?.tracer === 'DRONE' && !shell.dead && shell.vel && listenerShot(shell.shooterId)) { vx = shell.vel.x; vy = shell.vel.y; vz = shell.vel.z; break; }
      }
      // Motor load: forward speed, climbing, and how hard the controller is correcting.
      const accel = dt > 1e-4 ? Math.hypot(vx - ownDroneVx, vy - ownDroneVy, vz - ownDroneVz) / dt : 0;
      ownDroneAccel += (accel - ownDroneAccel) * Math.min(1, dt * 6);
      ownDroneVx = vx; ownDroneVy = vy; ownDroneVz = vz;
      aerialFrame.speedK = clamp(Math.hypot(vx, vy, vz) / DRONE.speedMps, 0, 1);
      aerialFrame.load = clamp(0.3 + 0.45 * aerialFrame.speedK + 0.25 * clamp(vy / DRONE.climbMps, 0, 1) + 0.25 * clamp(ownDroneAccel / 25, 0, 1), 0, 1);
      aerialFrame.spool = clamp((mixer.ctx.currentTime - ownDroneSince) / DRONE.launchS, 0, 1);
      aerialFrame.sag = battery;
    } else {
      aerialFrame.strain = 0;
      aerialFrame.speedK = 1;
      aerialFrame.load = 1;
      aerialFrame.spool = 1;
      aerialFrame.sag = 0;
    }
    ownAerial.update(aerialFrame);
  }

  function stopAerial(): void {
    for (const rig of droneRigs.values()) rig.kill(0.3);
    for (const rig of gunshipRigs.values()) rig.kill(0.3);
    droneRigs.clear();
    gunshipRigs.clear();
    ownAerial?.kill(0.3);
    ownAerial = null;
    ownDroneFlying = false;
    aerialWarmed = false;
    droneWarned.clear();
    // the aircraft set goes with the aircraft (the next battle pins its own)
    library?.pin([], true, 'aerial');
  }

  function stopWorld(reason: string): void {
    stopAerial();
    for (const [id, rig] of rigs) { rig.kill(0.3); logSound('engine:stop', { id, reason }); }
    rigs.clear();
    // the rigs' loops go with the rigs (the next battle's rigs pin their own)
    library?.pin([], true, 'rigs');
    surfaceCache.clear();
    for (const wreck of wrecks) for (const loop of wreck.loops) loop.stop(0.4);
    wrecks.length = 0;
    // a wanted loop still decoding never starts in the next phase (the loader's bed excepted, as below)
    for (let i = waitingLoops.length - 1; i >= 0; i--) {
      const want = waitingLoops[i];
      if (loadingActive && want.id === LOADING_BED) continue;
      want.state = 'off';
      waitingLoops.splice(i, 1);
    }
    // The ambience director's scene goes with its loops (2026-11-02 audit F11): left holding a scene whose voices this
    // teardown kills, its self-repair (ensureLoops) brought the garage hangar back under the battle loader.
    ambience?.stop(0.4);
    // every world loop, never the loader's bed: a solo battle starts behind the loader, which keeps its sound to the reveal
    pool?.stop((v) => v.end === Infinity && !(loadingActive && v.id === LOADING_BED), 0.4);
    probeSolo = null;
  }

  // ---------------------------------------------------------------- snapshots ---

  function chooseSnapshot(): void {
    if (!mixer) return;
    if (battleMode.phase !== 'battle') { mixer.setSnapshot('garage', 0.4); return; }
    if (battleMode.paused) { mixer.setSnapshot('paused', 0.2); return; }
    if (battleMode.killcam) { mixer.setSnapshot('killcam', 0.15); return; }
    const me = playerId ? tanks.get(playerId) : null;
    if (listenerKind === 'spectated-tank' || (me && !me.alive)) { mixer.setSnapshot('spectating', 0.5); return; }
    mixer.setSnapshot(listenerScoped ? 'scoped' : 'battle', listenerScoped ? 0.18 : 0.3);
  }

  // -------------------------------------------------------------- scenes ---

  function applyScene(): void {
    if (!ambience || !mixer || !pool) return;
    bellTowers = null;
    if (battleMode.phase === 'battle') {
      const mapId = getMapId?.() || 'verdant';
      scene = sceneForMap(mapId);
      atmosphere = atmosphereForMap(mapId);
      pool.setAtmosphere(atmosphere);
      // the battle's room from its edge (U34, round 2): the loader's bed and the battle's vehicle rigs, heard under the
      // loader, never ring in the Garage hangar's reverb; the reveal's ambientOn brings the world's loops (the director's
      // play sets the same room again).
      // The battle's scene waits for the reveal or the rollout (ambientOn); until then nothing of the hangar's plays. Every
      // entry reaches this on its battle phase edge (a solo start, an online activation, a rematch), and the garage scene's
      // bed and workshop spots ran on under the loading screen while the director kept it.
      mixer.setReverb(scene.reverb);
      if (ambientWanted) ambience.play(scene, true);
      else ambience.stop(0.3);
    } else {
      scene = GARAGE_SCENE;
      atmosphere = atmosphereForMap(null);
      pool.setAtmosphere(atmosphere);
      ambience.play(GARAGE_SCENE, false);
    }
  }

  // ------------------------------------------------------------- battle mode ---

  /**
   * Every per-battle field back to a new battle's (2026-11-02 audit F11): the one place they are reset, at every battle
   * edge (from the garage, or from the last battle: a network match's next round). A field that lives for one battle
   * is reset here or in resetBattlePlay, beside its siblings, never by hand in an event branch. Here: the field, the seat
   * and the battle's opening, which a network battle's restart keeps (the same roster on the same map, this seat's
   * engine running, its captions on screen); resetBattlePlay holds the rest.
   */
  function resetBattleFields(): void {
    tanks.clear();
    structureSounds.clear();
    // (world-sfx-269) where each carrier's drone was last heard belongs to the battle it flew in
    droneLastAt.clear();
    playerId = null;
    playerTeam = null;
    latestPlayer = null;
    lastPlayerYaw = null;
    bossId = null;
    bossChecked = false;
    spottedField = false;
    startEngineSoon = true;
    startEngineUntil = -1;
    captions.reset();
    pendingCaptions.length = 0;
    resetBattlePlay();
  }

  /**
   * What the battle's play has laid down (round 4 E6b review r2): its one-shot calls and their clocks, its watermarks on
   * the battle's sim clock, the module states and rounds it told, and the own hull's last look. A network battle's restart
   * opens a new battle (the session's decision, battlePresentation.ts resetSettledWorld), so restartLives runs this too, and
   * a field added here is reset at a restart as at a battle's start. Before, the restart kept them: a smoke screen launched
   * in the restarted battle before the abandoned battle's last launch time was silent (lastSmokeBorn is on the sim clock,
   * which restarts at 0), a module state the abandoned battle told stood (moduleStates: the restarted battle's same break
   * was no change, so no thrown-track sound, no crew call and no radio damage), a kill in the restarted battle within 12 s
   * of the abandoned battle's last was a double kill, and the once-a-battle think line and first-shot cue stayed spent.
   */
  function resetBattlePlay(): void {
    deathLatch.clear();
    moduleStates.clear();
    ownRounds.clear();
    droneWarned.clear();
    movedOnce = false;
    lowHpCalled = false;
    ammoLowCalled = false;
    lastStanding = { mine: false, theirs: false, outnumbered: false };
    lastKillAt = -99;
    thinkStage = 'idle';
    thinkUntil = 0;
    thoughtThisBattle = false;
    firstShotHeard = false;
    lastSpots = [];
    lastSpotCallAt = -99;
    lastSixthSenseAt = -99;
    lastSixthAlertAt = -99;
    heartbeatBelow = 0;
    wasOverturned = false;
    wasDeep = false;
    stuckS = 0;
    wasAtLimit = false;
    lastGunLimitAt = -99;
    slewS = 0;
    lastTurretStopAt = -99;
    lastTurretStartAt = -99;
    lastPitch = null;
    lastSmokeBorn = -1;
    auxGunOn = null;
    auxLights = null;
    resetQuietRadio();
  }

  /**
   * (round 3 merge review r1) A network battle restarted under this seat (battlePresentation.ts resetSettledWorld tells
   * 'battle:restarted' on MatchFrame.battleRestarts): every hull stands at its spawn again, a revive of each with no cue
   * (the 'respawn' mode event's re-arming, for the whole field). Every death latch re-arms, so a hull that died in the
   * abandoned battle and is hidden now is heard when it dies again (update() re-arms only the hulls it is given, the
   * visible ones); every known hull is alive in this engine's own map (the miss call's live enemies). The side counts'
   * one-shot calls re-arm, as the restarted battle may make them again; a network seat counts its sides from the roster
   * (getTeamRoster: main.ts game.rosterTanks), never this map, and the presentation revives every actor of that roster
   * before it tells the restart (review r2), so the re-armed calls count the restarted field. The player's per-life
   * calls re-arm and its fire alarm, heartbeat and radio damage go with its old hull; and the abandoned battle's wrecks
   * stop burning where no wreck stands now. (round 4 E6b review r2) The restart opens a new battle, so the battle's play
   * starts over as at a battle's start (resetBattlePlay: the death latches and the one-shot calls above among them).
   */
  function restartLives(): void {
    resetBattlePlay();
    for (const info of tanks.values()) info.alive = true;
    heartbeatRig?.stop(); heartbeatRig = null;
    fireAlarm?.stop(); fireAlarm = null;
    playerBurning = false;
    radio?.setRadioDamage(0);
    for (const wreck of wrecks) for (const loop of wreck.loops) loop.stop(0.4);
    wrecks.length = 0;
  }

  /** A battle's world torn down: on leaving it, or as the next one opens over it. */
  function teardownBattle(reason: string): void {
    stopWorld(reason);
    fireAlarm?.stop(); fireAlarm = null;
    heartbeatRig?.stop(); heartbeatRig = null;
    radio?.silence();
    playerBurning = false;
    listenerOwnerId = null;
    listenerScoped = false;
  }

  /**
   * The battle mode's one writer: a bus fact moves it (battleMode.ts ignores a move it rejects: a second rollout, verdict
   * or presentation), and the edge it took has its effects here. Facts arrive whether or not the graph exists; their
   * sounds wait for it, and resume() reads the mode back.
   */
  function applyMode(fact: AudioBattleEvent): void {
    const prev = battleMode.phase;
    const edge = stepAudioBattleMode(battleMode, fact);
    if (edge) modeEdge(edge, prev);
  }

  function modeEdge(edge: AudioBattleEdge, prev: string): void {
    if (edge === 'enter-battle' || edge === 'leave-battle' || edge === 'phase') {
      // The battle's world is wanted per battle, from its reveal (ambientOn): a new battle starts behind its loader in
      // silence, and leaving one ends the intent (as the lazy facade's copy does).
      ambientWanted = false;
      reloadCalled = false;
      reload.active = false;
      reload.plan = null;
    }
    switch (edge) {
      case 'enter-battle':
        void warmBattle();
        teardownBattle('battle-reset');
        resetBattleFields();
        radio?.setRadioDamage(0);
        applyScene();
        break;
      case 'leave-battle':
        loadingOn(false);
        teardownBattle(`phase:${battleMode.phase}`);
        applyScene();
        break;
      case 'phase':
        if (battleMode.phase === 'garage' && prev !== 'garage') {
          loadingOn(false);
          applyScene();
        }
        break;
      case 'rollout':
      case 'rollout-late':
        resetQuietRadio();
        if (edge === 'rollout-late' || !ready()) { logSound('battle:rollout', { late: edge === 'rollout-late' }); break; }
        rolloutCues();
        break;
      case 'ended':
        radio?.cancelPending(['shot_result'], true);
        fireAlarm?.stop(); fireAlarm = null;
        break;
      case 'presented': {
        if (!ready()) break;
        const result = battleMode.result ?? 'draw';
        play(result === 'victory' ? 'sting_victory' : result === 'defeat' ? 'sting_defeat' : 'sting_draw');
        say(result, { delayS: 0.4 });
        break;
      }
      case 'killcam':
        if (ready()) play(battleMode.killcam ? 'killcam_in' : 'killcam_out');
        break;
      case 'pause':
        break;
    }
    chooseSnapshot();
  }

  function rolloutCues(): void {
    // each mode's own opener (modeSounds.ts MODE_OPENER: Realistic opens on silence, an unnamed mode on the battle horn)
    const opener = modeOpener(getGameMode?.() || 'standard');
    if (opener) play(opener, opener === 'gunship_flyover' ? { space: 'flat', bus: 'environment' } : undefined);
    // The commander buttons up as the column moves off (a gunship crew has no hatch).
    if (latestPlayer?.aerial?.kind !== 'gunship') play('hatch', hullOptions({ gainDb: -4, delayS: 0.15 }));
    play('ui_countdown_go', { gainDb: -6 });
    say('battle_start', { delayS: 0.5 });
  }

  // ------------------------------------------------------------- public API ---

  function resume(): void {
    if (!ctx && getContext) {
      // the facade owns the device: adopt its context, or wait for it (never a second one)
      ctx = getContext();
      if (!ctx) return;
    }
    if (!ctx) {
      const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AC = scope.AudioContext || scope.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    // a context the browser stopped under us: suspended, or WebKit's 'interrupted' (a call, another app's audio)
    const state: string = ctx.state;
    if (state === 'suspended' || state === 'interrupted') void ctx.resume().catch(() => {});
    if (mixer) return;
    mixer = createMixer({ context: ctx, reverb: budget.reverb, channelVolumes: chan, masterVolume, muted });
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    library = createAssetLibrary({ context: ctx, base, lowMemory: tier === 'mobile', maxDecodedMb: budget.maxDecodedMb, maxVariants: budget.maxVariants,
      seed: interfaceSeed });
    pool = createVoicePool({ mixer, library, random, budget: budget.voices, reverb: budget.reverb });
    pool.setOcclusionProbe((x, y, z) => occlusionAt(x, y, z));
    radio = createCrewRadio({ mixer, library, random,
      onTransmit: (id, take, lang, durationS, priority) => { captions.radio(id, take, lang, durationS, priority); } });
    // Bells wait for the rollout: the countdown's frozen pre-battle (and every probe that holds a battle there) never tolls.
    ambience = createAmbienceDirector({ mixer, library, pool, random, getBellTowers: currentBellTowers, bellsAllowed: () => battleMode.rolledOut,
      isNight: () => battleMode.phase === 'battle' && getTimeOfDay?.() === 'night' });
    // the session's own pins: the interface and the radio net stay decoded whatever the battle warm pins
    library.pin([...UI_SET, ...RADIO_SET], false, 'session');
    void library.load([...UI_SET, ...RADIO_SET]);
    // A battle hull may already be indexed (late adoption mid-battle).
    if (playerId || crewVoice !== 'national') applyCrewLanguage();
    installDebugSurface();
    applyScene();
    chooseSnapshot();
    // Adopted after the battle phase edge: warm the battle set now (its edge has passed).
    if (battleMode.phase === 'battle') void warmBattle();
    // the loops wanted before the graph existed (the loader's bed)
    for (const want of [...waitingLoops]) startLoop(want);
  }

  /** The garage's and menus' controls (interfaceSounds.ts classifies the pressed element). */
  const INTERFACE_ASSET: Readonly<Record<InterfaceSound, string>> = Object.freeze({
    click: 'ui_click', tab: 'ui_tab', select: 'ui_toggle', toggle: 'ui_toggle', slider: 'ui_slider',
    back: 'ui_back', confirm: 'ui_confirm', vehicle: 'ui_tank_select',
  });
  let lastInterfaceAt = -1;
  /** How late a press's own click may still play (the coordinator, 2026-10-13: a late click reads as input lag, worse than
   *  silence; the interface set decodes at boot idle, so this only covers a press that beat that decode). */
  const FIRST_PRESS_MS = 120;

  /** One interface sound per press: a control's own 'ui:click' never doubles the delegated one. */
  function interfaceOnce(): boolean {
    if (!ctx) return false;
    if (ctx.currentTime - lastInterfaceAt < 0.09) return false;
    lastInterfaceAt = ctx.currentTime;
    return true;
  }

  const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let pressPending = false;

  /**
   * A control's sound. The interface set decodes at boot idle (prepareInterfaceSounds), and the mixer module it loads
   * means the engine exists before the first press's click arrives, so that press finds its sound ready. One that beat
   * the decode waits for it only while the wait stays within FIRST_PRESS_MS of the click; later it is dropped: a late
   * click reads as input lag, worse than silence (AU.07). A press before the boot-idle warm stays silent.
   */
  function interfaceSound(sound: InterfaceSound, inMenu: boolean): void {
    const pressedAt = nowMs();
    if (!ready() || (battleMode.phase === 'battle' && !inMenu)) return;
    const asset = INTERFACE_ASSET[sound];
    if (library && !library.has(asset)) {
      if (pressPending || nowMs() - pressedAt > FIRST_PRESS_MS) return;
      pressPending = true;
      void library.load([asset]).then(() => {
        pressPending = false;
        if (nowMs() - pressedAt <= FIRST_PRESS_MS && interfaceOnce()) play(asset);
      });
      return;
    }
    if (!interfaceOnce()) return;
    play(asset);
  }


  const busSubscriptions: (() => void)[] = [];
  let detachTurretLanding: (() => void) | null = null;
  let detachDebrisLanding: (() => void) | null = null;
  let lastRubbleAt = -1;
  let lastNearMissAt = -1;

  function uiClick(): void {
    if (!interfaceOnce()) return;
    play('ui_click');
  }

  function bindBus(bus: EventBus): void {
    // a rebinding retires the last bus's subscriptions: a second bindBus never doubles a cue (2026-11-02 audit F11)
    for (const off of busSubscriptions.splice(0)) off();
    captionBus = bus;
    const listen = (event: string, listener: (payload: unknown) => void): void => { busSubscriptions.push(bus.on(event, listener)); };
    // A cue sounds only through a built graph: its event is dropped until then.
    const on = <T>(event: string, listener: (payload: T) => void): void => {
      listen(event, (payload) => { if (ready()) listener(payload as T); });
    };
    // physics lane (2026-10-10): a popped turret lands where its rigid body hits, heard there (a hard landing, louder)
    detachTurretLanding?.();
    detachTurretLanding = onTurretLanding((x, y, z, speed) => {
      if (!ready() || speed < 3) return;
      play('turret_land', { x, y, z, gainDb: Math.max(-9, Math.min(0, (speed - 9) * 0.9)) });
    });
    // B7 (2026-10-13): a collapse's heavy rubble lands where its rigid body hits (fx/rubbleBodies.ts reports the debris
    // pool's hard landings): a masonry thud for a piece of 20 kg or more at 2.5 m/s or more, one per 0.15 s at most (a
    // heap is dozens of landings in a second), louder for a heavier, faster piece
    detachDebrisLanding?.();
    detachDebrisLanding = onDebrisLanding((x, y, z, speed, mass) => {
      if (!ready() || !ctx || speed < 2.5 || mass < 20 || ctx.currentTime - lastRubbleAt < 0.15) return;
      lastRubbleAt = ctx.currentTime;
      play('rubble_chunk_land', { x, y, z, gainDb: clamp(-10 + 4 * Math.log10(mass / 20) + (speed - 2.5) * 0.8, -10, 0) });
    });
    on<{ id: string; x: number; y: number; z: number; caliberMm: number }>('auxiliary:fired', (e) => {
      if (battleMode.phase === 'battle' && !battleMode.over) fireWeapon([e.x, e.y, e.z], stationShot(e.caliberMm), null, isOwn(e.id));
    });
    on<ShellFiredEvent>('shell:fired', onShellFired);
    // (world-sfx-269) an active protection system defeating a missile or rocket played nothing: the interceptor's charge
    // and the warhead blown apart where it was caught, and on our own hull the fragments rattling off it
    on<{ id?: string; x?: number; y?: number; z?: number }>('aps:intercept', (e) => {
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
      play('aps_intercept', { x: Number(e.x), y: Number.isFinite(e.y) ? Number(e.y) : frame.y, z: Number(e.z) });
      if (isOwn(e.id)) play('hull_debris_patter', hullOptions({ delayS: 0.06, gainDb: -6 }));
      logSound('aps:intercept', { id: e.id ?? null });
    });
    // (world-sfx-269) a drone shot down played nothing (its buzz just stopped): it breaks up where it was last heard
    on<{ id?: string; killerId?: string }>('drone:down', (e) => {
      const at = e?.id ? droneLastAt.get(e.id) : null;
      if (at) play('drone_shot_down', { x: at.x, y: at.y, z: at.z });
      logSound('drone:down', { id: e?.id ?? null, heard: !!at });
    });
    on<ShellFiredEvent>('weapon:predicted', onPredictedWeapon);
    on<ShellHitEvent>('shell:hit', onShellHit);
    on<ShellExpiredEvent>('shell:expired', onShellExpired);
    on<TankDestroyedEvent>('tank:destroyed', (e) => {
      // A hull dies once a life: a re-sent network event (a host migration's replay) adds no second wreck, blast or call.
      if (!e?.id || deathLatch.has(e.id)) return;
      deathLatch.set(e.id, false);
      onTankDestroyed(e);
      updateTeamCounts();
    });
    // a network battle restarted under this seat: a new life for every hull (state, taken whether or not the graph
    // exists: restartLives)
    listen('battle:restarted', () => restartLives());
    on<TankImpactEvent>('tank:impact', onTankImpact);
    on<TankRamEvent>('tank:ram', (e) => onTankRam(e));
    on<PropEvent>('prop:crushed', (e) => onProp(e, false));
    // destruction-fx lane: a building crossing a stage (DESTRUCTION.md §11); a settled stage is laid down silently
    on<StructureStageEvent>('structure:stage', (e) => {
      if (!e || e.settled) return;
      // (2026-10-13) by what its walls are made of; a collapse sounds from the building's middle, not the blow's point,
      // and past a few hundred metres its distant recording carries it
      const sound = structureSound(e.structureId, e.massClass);
      const collapse = e.stage === 'collapsed';
      const x = collapse && Number.isFinite(e.cx) ? e.cx : e.x;
      const z = collapse && Number.isFinite(e.cz) ? e.cz : e.z;
      const y = collapse && Number.isFinite(e.baseY) && Number.isFinite(e.topY) ? e.baseY + 0.4 * (e.topY - e.baseY) : e.y;
      structureLayers(structureStageSounds(e.stage, sound), x, y, z,
        collapse ? STRUCTURE_FAR.collapse : e.stage === 'breached' ? STRUCTURE_FAR.breach : null);
      // a building coming down near us is news to the crew
      if (collapse && listenerValid && distanceTo(x, y, z) < 160) {
        caption('collapse', x, y, z);
        say('building_down', { prob: 0.7, delayS: 0.9 });
      }
      logSound('structure:stage', { id: e.structureId, stage: e.stage, material: sound.material });
    });
    // a section falling inside a standing building (P2): the roof caving in, a storey dropping, a wall panel going
    on<StructureBreachEvent>('structure:breach', (e) => {
      if (!e || e.settled || !e.sectionDown) return;
      const sound = structureSound(e.structureId, e.massClass);
      structureLayers(sectionFallSounds(e.sectionKind === 'roof' ? 'roof' : 'wall', !!e.storeyDown, sound), e.x, e.y, e.z,
        e.storeyDown ? STRUCTURE_FAR.breach : null, -2);
      logSound('structure:breach', { id: e.structureId, kind: e.sectionKind, storeyDown: !!e.storeyDown, material: sound.material });
    });
    on<PropEvent>('prop:destroyed', (e) => onProp(e, true));
    on<{ id: string; burning?: boolean }>('tank:fire', (e) => {
      const rig = rigs.get(e.id);
      rig?.setBurning(!!e.burning);
      const info = tanks.get(e.id);
      if (e.burning && info) play('fire_ignite', isOwn(e.id) ? hullOptions({ bus: 'own' }) : at(info.pos));
      if (playerId != null && e.id === playerId && mixer) {
        if (e.burning && !playerBurning) {
          playerBurning = true;
          fireAlarm?.stop();
          fireAlarm = loopRig('alarm_fire_loop');
          caption('fire');
          say('fire');
        } else if (!e.burning && playerBurning) {
          playerBurning = false;
          fireAlarm?.stop();
          fireAlarm = null;
          say('fire_out');
        }
      }
      logSound('tank:fire', { id: e.id, burning: !!e.burning });
    });
    on<ModuleStateEvent>('module:state', (e) => { if (e) onModuleState(e); });
    on<{ id: string; team?: string; spotterId?: string | null }>('tank:spotted', (e) => {
      if (!e || battleMode.phase !== 'battle' || playerTeam == null || e.team !== playerTeam) return;
      const info = tanks.get(e.id);
      if (!info || info.team === playerTeam || e.spotterId !== playerId || e.id === bossId) return;
      const now = ctx?.currentTime ?? 0;
      lastSpots = lastSpots.filter((t) => now - t < 2.5);
      lastSpots.push(now);
      if (lastSpots.length >= 3) { say('spotted_multiple', { delayS: 0.1 }); lastSpotCallAt = now; return; }
      if (now - lastSpotCallAt < 5) return;
      lastSpotCallAt = now;
      const me = playerId ? tanks.get(playerId) : null;
      if (me && random() < 0.65) {
        const dx = info.pos.x - me.pos.x;
        const dz = info.pos.z - me.pos.z;
        const own = playerId ? (lastPlayerYaw ?? 0) : 0;
        const bearing = Math.atan2(dx, dz) - own;
        const a = Math.atan2(Math.sin(bearing), Math.cos(bearing));
        const abs = Math.abs(a);
        const id = abs < Math.PI / 4 ? 'spotted_front' : abs > (3 * Math.PI) / 4 ? 'spotted_rear' : a > 0 ? 'spotted_left' : 'spotted_right';
        say(id, { delayS: 0.1 });
      } else say('enemy_spotted', { delayS: 0.1 });
    });
    on<undefined>('player:spotted', () => {
      const now = ctx?.currentTime ?? 0;
      if (battleMode.phase !== 'battle' || battleMode.over) return;
      // The lamp lights 3 s after we are seen and burns for 8: its alert sounds each time it lights, the crew's
      // call once per exposure.
      if (now - lastSixthAlertAt > 12) {
        lastSixthAlertAt = now;
        play('ui_alert', { delayS: 3.0, gainDb: -6 });
      }
      if (now - lastSixthSenseAt > 20) {
        lastSixthSenseAt = now;
        say('sixth_sense', { delayS: 3.0 });
      }
    });
    on<{ slot?: number }>('ui:consumableUsed', (e) => {
      if (!e || battleMode.phase !== 'battle' || battleMode.over) return;
      if (e.slot === 0) { play('repair_kit', hullOptions()); say('repairs', { delayS: 1.4 }); }
      else if (e.slot === 1) { play('first_aid', hullOptions()); say('crew_recovered', { delayS: 1.2 }); }
      else if (e.slot === 2) { play('extinguisher', hullOptions()); say('extinguishing', { delayS: 0.05 }); }
    });
    on<undefined>('ui:consumableDenied', () => play('ui_error'));
    on<undefined>('ui:click', uiClick);
    on<{ slot?: number }>('ui:shellSelectionChanged', (e) => onShellSelect(e?.slot));
    // A feature the sim accepted sounds and is called; one it refused is refused (never the sound of a reload that
    // is not happening: 'ui:magazineReload' is only the key).
    on<undefined>('ui:magazineReloadStarted', () => { play('magazine_swap', hullOptions()); say('reloading', { delayS: 0.15 }); });
    on<undefined>('ui:magazineReloadDenied', () => play('ui_error'));
    on<undefined>('ui:specialActionDenied', () => play('ui_error'));
    on<{ reason?: string }>('ui:ammoSelectionDenied', (e) => {
      play('ui_error');
      if (e?.reason === 'AMMO_EMPTY') say('ammo_empty', { delayS: 0.1 });
    });
    on<{ kind?: string; active?: boolean }>('ui:specialActionResult', (e) => {
      const kind = String(e?.kind || '');
      if (/hydro|suspension/.test(kind)) { play('hydro_susp', hullOptions({ bus: 'own' })); if (e?.active) say('suspension_set', { delayS: 0.9 }); }
      else if (/missile|guided/.test(kind)) { play('missile_mode', hullOptions()); if (e?.active) say('load_missile', { delayS: 0.1 }); }
      else if (/magazine|reload/.test(kind)) play('magazine_swap', hullOptions());
    });
    on<{ id?: string; slot?: number }>('ammo:empty', (e) => {
      if (!isOwn(e?.id ?? playerId)) return;
      play('dry_fire', hullOptions());
      say('ammo_empty', { delayS: 0.1 });
    });
    on<{ id?: string }>('ammo:depleted', (e) => {
      if (!isOwn(e?.id ?? playerId)) return;
      const me = latestPlayer;
      const ammo = me?.combat?.ammo;
      const empty = !!ammo && ammo.every((n) => !n);
      say(empty ? 'ammo_out_all' : 'ammo_empty', { delayS: 0.15 });
    });
    on<{ on?: boolean; reason?: string }>('ui:autoAimState', (e) => {
      if (e?.on) { play('lock_on'); say('target_locked', { prob: 0.6, delayS: 0.1 }); }
      else { play('lock_off'); if (e?.reason && !/off/i.test(e.reason)) say('target_lost', { prob: 0.4, delayS: 0.1 }); }
    });
    on<undefined>('ui:armorOverlayState', () => play('ui_toggle'));
    on<undefined>('ui:minimapZoom', () => play('ui_tab', { gainDb: -6 }));
    on<undefined>('spectate:cycle', () => play('spectate_switch'));
    // Drone mode: the launch and the recall are heard from the flight itself (spin-up, crew call, the feed cutting);
    // a press while the drone is still recharging or flying home, or a recall before its feed is live, is refused.
    on<undefined>('ui:drone', () => {
      const view = latestPlayer?.aerial;
      if (battleMode.phase === 'battle' && view?.kind === 'drone' && (view.active ? (view.recallS ?? 0) > 0 : (view.cooldownS ?? 0) > 0)) play('ui_error');
    });
    // The optics' sensor changing (the tank sight or the drone and gunship cameras).
    on<undefined>('ui:visionChanged', () => { if (battleMode.phase === 'battle') play('zoom_step', hullOptions({ gainDb: -6 })); });
    on<{ id?: string }>('service:medal', (e) => { if (e?.id && THINK_MEDALS.has(e.id)) requestThink(); });
    on<{ isPlayer?: boolean }>('shell:fired', (e) => {
      if (!e?.isPlayer || firstShotHeard || battleMode.phase !== 'battle') return;
      firstShotHeard = true;
      if (thinkRandom() < THINK_FIRST_SHOT_P) requestThink();
    });
    on<{ id?: string }>('tank:jump', (e) => { if (isOwn(e?.id)) play('jump_launch', hullOptions({ bus: 'own' })); });
    const righted = (e: { id?: string } | undefined) => {
      const id = e?.id ?? null;
      const info = id ? tanks.get(id) : null;
      if (info) play('self_right', isOwn(id) ? hullOptions({ bus: 'own' }) : at(info.pos));
      if (isOwn(id)) say('back_on_tracks', { delayS: 0.8 });
    };
    on<{ id?: string }>('tank:selfRight', righted);
    on<{ id?: string }>('tank:autoflip', righted);
    on<{ screens?: SmokeScreen[] }>('auxiliary:smokeScreens', (e) => {
      for (const screen of e?.screens || []) {
        const born = Number(screen.born);
        if (!Number.isFinite(born) || born <= lastSmokeBorn) continue;
        lastSmokeBorn = born;
        const src = screen.source || [];
        const sx = Number(src[1]); const sy = Number(src[2]); const sz = Number(src[3]);
        if (Number.isFinite(sx)) play('smoke_launcher', { x: sx, y: sy, z: sz });
        if (Number.isFinite(screen.x)) play('smoke_burst', { x: screen.x, y: screen.y, z: screen.z, delayS: 0.65 });
        const me = playerId ? tanks.get(playerId) : null;
        if (me && Number.isFinite(sx) && Math.hypot(sx - me.pos.x, sz - me.pos.z) < 4) say('smoke_out', { delayS: 0.05 });
      }
    });
    on<{ pos?: Vec3; size?: number }>('atmosphere:artillery', (e) => {
      if (!e?.pos) return;
      play('distant_artillery', { ...at(e.pos), gainDb: gainToDb(clamp(e.size ?? 0.6, 0.3, 1.4)) });
      // the loader hears the far guns, rarely (flavour that yields to any real call)
      if (battleMode.phase === 'battle' && !battleMode.over && battleMode.rolledOut) say('artillery_far', { prob: 0.25, delayS: 1.2 });
    });
    on<{ pos?: Vec3; delayS?: number }>('atmosphere:flak', (e) => { if (e?.pos) play('distant_flak', { ...at(e.pos), delayS: Math.max(0, e.delayS ?? 0) }); });
    on<{ pos?: Vec3; shots?: number; gapS?: number }>('atmosphere:aa', (e) => { if (e?.pos) play('distant_mg', at(e.pos)); });
    on<{ p0?: Vec3; v?: Vec3; durationS?: number; aircraft?: string }>('atmosphere:flyover', (e) => {
      if (!e?.p0 || !e.v) return;
      const half = clamp(e.durationS ?? 20, 4, 60) / 2;
      play(flyoverAsset(e.aircraft), { x: e.p0[0] + e.v[0] * half, y: e.p0[1] + e.v[1] * half, z: e.p0[2] + e.v[2] * half, propagate: false, delayS: Math.max(0, half - 3.5) });
      // the crew notes aircraft that pass near (the path's closest approach to us within 900 m), now and then
      if (listenerValid && battleMode.phase === 'battle' && !battleMode.over) {
        const vv = e.v[0] * e.v[0] + e.v[1] * e.v[1] + e.v[2] * e.v[2];
        const tc = vv > 1e-6 ? clamp(((frame.x - e.p0[0]) * e.v[0] + (frame.y - e.p0[1]) * e.v[1] + (frame.z - e.p0[2]) * e.v[2]) / vv, 0, half * 2) : 0;
        if (distanceTo(e.p0[0] + e.v[0] * tc, e.p0[1] + e.v[1] * tc, e.p0[2] + e.v[2] * tc) < 900) {
          caption('aircraft', e.p0[0] + e.v[0] * tc, e.p0[1] + e.v[1] * tc, e.p0[2] + e.v[2] * tc, Math.max(0, half - 3.5));
          say('aircraft_overhead', { prob: 0.5, delayS: clamp(tc - 2, 0, 5) });
        }
      }
    });
    on<ReloadEvent>('player:reload', onReload);
    // The battle mode's facts are state, not cues: they are taken whether or not the graph exists yet (resume() replays
    // the mode), and only their sounds wait for it (2026-11-02 audit F11).
    // The battle rolls out once (a second edge never sounds the horn twice). A client that joins a running battle (a late
    // join, a rejoin, a host migration: `late`) rolls out with no cues: it never saw the count. A kill-cam edge's fact is
    // the replay's own flag (audioBattleFact, killcamLive). The lazy facade builds the same facts (lazyAudio.ts).
    modeBus = bus;
    for (const event of AUDIO_BATTLE_FACT_EVENTS) {
      listen(event, (payload) => {
        const fact = audioBattleFact(event, payload, killcamLive);
        if (fact) applyMode(fact);
      });
    }
    // The count's last whole seconds tick (the frame owner reports each whole second once, never while PREPARING holds it).
    on<{ seconds?: number }>('battle:countdown', (e) => {
      const seconds = e?.seconds;
      if (battleMode.phase !== 'battle' || battleMode.over || battleMode.rolledOut || typeof seconds !== 'number' || seconds < 1 || seconds > COUNTDOWN_TICK_S) return;
      play('ui_countdown_tick', { gainDb: -8 });
    });
    on<{ pos: Vec3; cause?: string; timeScale?: number }>('killcam:impact', (e) => {
      if (!e?.pos) return;
      const slowRate = clamp(e.timeScale ?? 0.55, 0.25, 1);
      onTankDestroyed({ id: '__killcam__', pos: e.pos, cause: e.cause }, true, slowRate);
      killcamLog.push({ t: ctx?.currentTime ?? 0, cause: e.cause || 'shot', slowRate, baked: !!library?.has('tank_explode') });
      if (killcamLog.length > 32) killcamLog.shift();
    });
    on<ShellFiredEvent & { shooterId?: string }>('killcam:shot', (e) => {
      if (!e?.muzzlePos) return;
      fireWeapon(e.muzzlePos, shotMount(e.shooterId ?? null, e.shellName ?? null, e.caliberMm, e.weaponSound), e.weaponSound, !!e.isPlayer,
        e.muzzleIndex, true, null, e.shellName ?? null, e.dir);
      logSound('killcam:shot', { shooterId: e.shooterId, caliberMm: e.caliberMm });
    });
    on<TankRamEvent>('killcam:collision', (e) => onTankRam(e, true));
    // Preferences are state, so retain them even before the first audio gesture.
    listen('ui:volumes', (payload) => {
      const v = payload as VolumeEvent | undefined;
      if (!v) return;
      if (typeof v.master === 'number') { masterVolume = clamp(v.master, 0, 1); mixer?.setMaster(masterVolume); }
      for (const channel of ['engine', 'combat', 'ambience', 'ui', 'voice'] as const) {
        if (typeof v[channel] === 'number') { chan[channel] = unit(v[channel], chan[channel]); mixer?.setChannel(channel, chan[channel]); }
      }
      if (typeof v.alarmHeartbeat === 'boolean') alarmHeartbeat = v.alarmHeartbeat;
      if (typeof v.concussion === 'boolean') concussionFx = v.concussion;
      if (isCrewVoiceSetting(v.crewVoice) && v.crewVoice !== crewVoice) { crewVoice = v.crewVoice; applyCrewLanguage(); }
      volumeEvents++;
    });
    for (const type of MODE_EVENT_TYPES) on<Record<string, unknown>>(`mode:${type}`, (payload) => onMode(type, payload || {}));
    crew.bind(on);
  }

  let volumeEvents = 0;
  let startEngineSoon = false;
  /** When our start-up stops waiting for its recording (ctx time; -1 until our rig first asks). */
  let startEngineUntil = -1;
  let lastPlayerYaw: number | null = null;
  let latestPlayer: AudioEntity | null = null;

  function onShellSelect(slot: number | undefined): void {
    if (slot == null || battleMode.phase !== 'battle') return;
    const shells = latestPlayer?.spec?.gun?.shells;
    const shell = shells?.[slot];
    // The selection as the mount's loader makes it: an autoloader turning to the round, a dual feed switching belts.
    const me = playerId ? tanks.get(playerId) : null;
    const m = me?.mounts.length ? mountForRound(me.mounts, shell?.name ?? null) : null;
    const loader = m ? loaderFor(me?.specId, m) : 'manual';
    if (latestPlayer?.aerial?.kind === 'gunship') play('gunship_weapon_select', hullOptions());
    else if (loader === 'carousel_az' || loader === 'carousel_unmanned') play('autoloader_carousel', hullOptions({ gainDb: -4, maxDurS: 1.2 }));
    else if (loader === 'basket_mz') play('basket_turn', hullOptions({ gainDb: -4, maxDurS: 1.2 }));
    else if (loader === 'bustle') play('bustle_index', hullOptions({ gainDb: -3 }));
    else if (loader === 'autocannon' && m?.row?.family === 'autocannon') play('dual_feed_switch', hullOptions({ gainDb: -2 }));
    else play('ammo_select', hullOptions());
    if (!shell) return;
    const type = String(shell.type || '');
    const profile = String((shell as { soundProfile?: unknown }).soundProfile || '');
    // The AC-130's gunner names the weapon (30 mm, the howitzer, the missiles); a tank's loader names the round.
    const id = profile === 'gunship-autocannon' ? 'gunship_cannon' : profile === 'gunship-howitzer' ? 'gunship_howitzer'
      : profile === 'gunship-missile' ? 'gunship_missile'
        : shell.guided ? 'load_missile' : type === 'HEAT' ? 'load_heat' : type === 'HE' || type === 'HESH' ? 'load_he' : 'load_kinetic';
    say(id, { delayS: 0.12 });
  }

  function update(dt: number, listener: AudioListenerPose, list: readonly RuntimeValue[], shells: readonly RuntimeValue[] = []): void {
    syncKillcam();
    if (!ready() || !mixer || !pool || !ctx) return;
    // Keep the last finite pose: one NaN camera frame would otherwise poison every cue that frame.
    const { x: lx, y: ly, z: lz } = listener.pos;
    if (Number.isFinite(lx) && Number.isFinite(ly) && Number.isFinite(lz)) {
      frame.x = lx;
      frame.y = ly;
      frame.z = lz;
    }
    const fl = Math.hypot(listener.forward.x, listener.forward.z);
    if (Number.isFinite(fl) && fl > 1e-3) { frame.fx = listener.forward.x / fl; frame.fz = listener.forward.z / fl; }
    listenerKind = listener.kind || 'camera';
    listenerOwnerId = listener.ownerId ?? null;
    listenerScoped = !!listener.scoped && listenerKind !== 'killcam-camera';
    listenerValid = true;
    pool.setListener(frame);
    if (listenerScoped !== wasScoped) {
      // Track the edge everywhere so a garage trip never leaves a stale scope state.
      if (battleMode.phase === 'battle') play(listenerScoped ? 'scope_in' : 'scope_out', hullOptions({ gainDb: -8 }));
      wasScoped = listenerScoped;
    }
    const now = ctx.currentTime;
    pool.prune(now);
    if (pendingCaptions.length) flushCaptions(now);
    sweepWaitingLoops(now);
    mixer.update(dt);
    radio?.update();
    updateThink(now);
    updateQuietRadio(now);
    if (list) {
      indexTanks(list, dt);
      if (playerId) {
        for (let i = 0; i < list.length; i++) {
          const entity = toEntity(list[i]);
          if (entity && entity.id === playerId) { latestPlayer = entity; lastPlayerYaw = entity.state.yaw ?? null; break; }
        }
      }
      if (battleMode.phase === 'battle') {
        updateRigs(list, dt);
        updateAerial(list, shells, dt);
        trackOwnSystems();
        if (startEngineSoon && playerId) {
          // The starter fires with our rig's first frame, the countdown's; on a cold first battle its recording may still
          // be decoding (the front lane has it next), so it is asked again briefly, the bank held down, before giving up.
          const rig = rigs.get(playerId);
          if (rig) {
            if (startEngineUntil < 0) startEngineUntil = now + START_WAIT_S;
            if (rig.startEngine() || now >= startEngineUntil) startEngineSoon = false;
          } else if (latestPlayer?.id === playerId && latestPlayer.aerial?.kind === 'gunship') {
            // the AC-130 has no ground rig (it is heard from its cabin): no start-up to wait for (2026-11-02 audit F11)
            startEngineSoon = false;
          }
        }
        updateTeamCounts();
        crew.frame(dt, listener, list as readonly CrewFrameEntity[]);
      }
    }
    updateWrecks(now);
    chooseSnapshot();
    ambience?.update(now, frame.x, frame.y, frame.z);
  }

  /**
   * Our roof gun and lights switching, from the sim's auxiliary state (the same object solo and in a network battle,
   * so only a switch the sim accepted sounds): the weapon station powers up and the gunner confirms it; the lights
   * clunk on and click off. The first look of a battle only records the state.
   */
  function trackOwnSystems(): void {
    const me = latestPlayer;
    if (!me || me.id !== playerId || me.combat?.destroyed) return;
    const aux = me.combat?.auxiliary;
    const gunOn = !!aux?.gunOn;
    const lights = typeof aux?.lights === 'number' ? aux.lights : -1;
    if (auxGunOn != null && gunOn !== auxGunOn) {
      if (gunOn) { play('roof_gun_servo', hullOptions()); say('roof_gun_on', { delayS: 0.6 }); }
      else play('switch_toggle', hullOptions({ gainDb: -4 }));
    }
    if (auxLights != null && lights !== auxLights && lights >= 0) play(lights === 1 ? 'lights_on' : 'switch_toggle', hullOptions({ gainDb: -3 }));
    auxGunOn = gunOn;
    auxLights = lights;
  }

  /** The battle's planned roster (spec ids), as last given: every warm of the battle (its phase edge, a late mixer) keeps it. */
  let battleRoster: readonly string[] = [];

  /**
   * What a battle sounds like before anything happens (2026-10-14, the owner: the tanks and the world were silent through
   * the countdown): the roster's powertrains, the map's beds, the running gear and the hull's machinery loops, and the
   * countdown's own cues. Ordered as they are heard: each powertrain's start-up and idle, the beds, the slow running
   * gear, then the rest. Each hull's powertrain is the one its rig will run (rosterIdentity: its whole spec).
   */
  function presenceAssets(mapId: string, mode: string, roster: readonly string[] = battleRoster): string[] {
    const ids = new Set<string>();
    const families = new Set<string>();
    for (const specId of roster) families.add(rosterIdentity(specId).engine);
    // one band of every family when the roster is unknown (our own hull's whole bank follows once indexed: preloadVehicle)
    if (!families.size) for (const family of ENGINE_FAMILY_IDS) ids.add(`engine_${family}_mid`);
    for (const family of families) for (const band of ['start', 'idle']) ids.add(`engine_${family}_${band}`);
    // (world-sfx-269, 2026-11-03) the one-shots bound to a moment of the count decode next, before any loop: its ticks,
    // the mode's opener, the hatch and the horn. Behind every loop (and in the aircraft modes all 18 aircraft sounds)
    // an AC-130 battle decoded its opener 56th and its tick 79th of 85 files, so on a loaded machine they were still
    // decoding when they were due, and silent; a loop that decodes late only fades in late.
    ids.add('ui_countdown_tick');
    const opener = modeOpener(mode);
    if (opener) ids.add(opener);
    ids.add('hatch');
    ids.add('ui_countdown_go');
    const scene = sceneForMap(mapId);
    ids.add(scene.bed);
    if (scene.layer) ids.add(scene.layer.asset);
    if (scene.war > 0) ids.add('amb_distant_battle');
    for (const cls of ['light', 'heavy']) for (const s of ['earth', 'hard']) ids.add(`tracks_${cls}_${s}_slow`);
    for (const family of families) for (const band of ['low', 'mid', 'high', 'stop']) ids.add(`engine_${family}_${band}`);
    for (const cls of ['light', 'heavy']) for (const s of ['earth', 'hard']) ids.add(`tracks_${cls}_${s}_fast`);
    for (const id of RIG_LOOPS) ids.add(id);
    // the aircraft modes fly from their first second
    if (mode === 'drone' || mode === 'ac130') for (const id of AERIAL_SET) ids.add(id);
    return [...ids];
  }

  /**
   * Decode and pin a battle's sound set: every report bank, the combat,
   * hull, interface and mode sets, the map's scene, running gear and the
   * roster's powertrains (or one band of every family when the roster is
   * unknown). Runs at every battle phase edge whatever the entry path (solo
   * loader, multiplayer, debug start), so no first shot is silent while its
   * bank decodes; the solo loader also awaits it before the reveal.
   *
   * The presence set (presenceAssets) decodes first, in the library's front lane: the countdown is heard from its first
   * frame, never after the six decode slots have worked through the combat banks queued ahead of it (a cold Verdant entry
   * queues about 670 files: our idle was the 638th, the map's bed the 603rd; now the 7th and the 12th).
   */
  /**
   * The report banks a battle can hear (gun-reports-269): the close and distant reports of every mount the roster's
   * vehicles fire, and of the machine guns and 30 mm cannons on roof stations; every row when the roster is unknown
   * (a network join) or the mode hands out other weapons (the Gun Game's ladder). Our own reports follow our hull.
   */
  function battleReportAssets(mode: string): string[] {
    const rows = new Set<WeaponRow>(ROOF_STATION_ROWS);
    let known = mode !== 'gun_game' && battleRoster.length > 0;
    for (const specId of known ? battleRoster : []) {
      let spec: RuntimeValue = null;
      try { spec = getVehicleSpec?.(specId); } catch { /* an id the fleet does not know */ }
      const gun = spec && typeof spec === 'object' ? (spec as AudioSpec).gun : null;
      if (!gun) { known = false; break; }
      for (const m of weaponMounts(gun)) if (m.row) rows.add(m.row);
    }
    if (!known) for (const row of Object.values(WEAPON_ROWS)) rows.add(row);
    if (mode === 'ac130') for (const row of Object.values(WEAPON_ROWS)) if (row.key.startsWith('ac130')) rows.add(row);
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.close);
      ids.add(row.far);
      if (row.key === 'guided/missile') for (const id of Object.values(LAUNCH_ASSET)) ids.add(id);
    }
    return [...ids];
  }

  function warmBattle(): Promise<void> {
    if (!library) return Promise.resolve();
    const mapId = getMapId?.() || 'verdant';
    const mode = getGameMode?.() || 'standard';
    const presence = presenceAssets(mapId, mode);
    const ids = new Set<string>(presence);
    for (const id of CORE_BATTLE) ids.add(id);
    for (const id of UI_SET) ids.add(id);
    for (const id of PLAYER_HULL) ids.add(id);
    for (const id of MODE_SET) ids.add(id);
    // The report banks the battle can hear: the roster's mounts and the roof stations' (every row when unknown), and
    // our own hull's reports and loader machinery once it is known (preloadOwnWeapons pins them when it is found).
    for (const id of battleReportAssets(mode)) ids.add(id);
    for (const id of ownWeaponAssets(playerEntityInfo())) ids.add(id);
    // Every prop's sound (propSounds.ts): the first pole, cart or drum a hull meets is never silent while it decodes.
    for (const id of propSoundAssets()) ids.add(id);
    // Every impact by material, the near misses, the spall and the debris (impactMaterials.ts): any round may strike any
    // material from the first shot.
    for (const id of impactAssetIds()) ids.add(id);
    for (const id of sceneAssets(sceneForMap(mapId), true)) ids.add(id);
    // The mode's opener plays at rollout, decoded by then (presence); the aircraft modes fly from their first second.
    if (mode === 'drone' || mode === 'ac130') aerialWarmed = true;
    // The battle set stays decoded for the whole battle (rigs and scenes pin their own loops): a new warm replaces the
    // battle's pins only, never the session's radio net, the aircraft set or a live rig's loop (2026-11-02 audit F11).
    library.pin(ids, true, 'battle');
    return Promise.all([library.load(presence, { front: true }), library.load(ids)]).then(() => {});
  }

  function loadingOn(on: boolean): void {
    // the intent is kept before the graph exists (its bed starts with it); the deploy cue is a one-off
    if (on && !loadingActive) {
      loadingActive = true;
      loading = loopRig(LOADING_BED);
      if (ready()) play('ui_deploy', { gainDb: -3 });
      logSound('loading:start');
    } else if (!on && loadingActive) {
      loadingActive = false;
      loading?.stop(0.3);
      loading = null;
      logSound('loading:stop');
    }
  }

  // ----------------------------------------------------------- debug surface ---

  let tap: { sp: ScriptProcessorNode; sink: GainNode; chunks: Int16Array[]; data: Int16Array | null } | null = null;

  function installDebugSurface(): void {
    if (typeof window === 'undefined') return;
    const surface = {
      get ctx() { return ctx; },
      get voiceLog() { return radio?.log ?? []; },
      get sayLog() { return sayLog; },
      get captionLog() { return captions.log; },
      get voicesLoaded() { return !!radio && !!library?.voiceReady(radio.language); },
      get crewLanguage() { return radio?.language ?? null; },
      get sfxLog() { return pool?.log ?? []; },
      get sfxLoaded() { return !!library?.supported && (library?.stats().assets ?? 0) > 0; },
      get sfxCount() { return library?.stats().assets ?? 0; },
      get killcamSfxLog() { return killcamLog; },
      get soundLog() { return soundLog; },
      /** The loader's bed is wanted (the engine's flag); loadingSounding: its recording is playing. */
      get loadingActive() { return loadingActive; },
      get loadingSounding() { return !!loading?.sounding; },
      /** The battle mode and the per-battle intents it gates (2026-11-02 audit F11). */
      battleState: () => ({ ...battleMode, ambientWanted, startEngineArmed: startEngineSoon, deathsLatched: deathLatch.size, loopsWaiting: waitingLoops.length }),
      get snapshot() { return mixer?.snapshot ?? null; },
      get reverb() { return mixer?.reverb ?? null; },
      get tier() { return tier; },
      library: () => library?.stats() ?? null,
      /** Whether any owner pins an asset (2026-11-02 audit F11: the battle warm replaces the battle's pins only). */
      pinned: (id: string) => library?.isPinned(id) ?? false,
      /** Hold each named asset on one variant (tools/audio-mix-balance.mjs: every moment at its loudest take); null releases. */
      holdVariants: (held: Readonly<Record<string, number>> | null) => { library?.holdVariants(held); },
      /** Resolves when every sound and voice load in flight has settled (receipts await the real load, never ticks). */
      libraryIdle: () => library?.idle() ?? Promise.resolve(),
      /** The countdown's presence set, decoded first by the battle warm: this battle's roster, or the one given. */
      presence: (roster?: readonly string[]) => presenceAssets(getMapId?.() || 'verdant', getGameMode?.() || 'standard', roster ?? battleRoster),
      limiterReduction: () => mixer?.limiterReduction() ?? 0,
      ambientState: () => ambience?.state() ?? { active: false },
      listenerState: () => ({ x: frame.x, y: frame.y, z: frame.z, fx: frame.fx, fz: frame.fz, kind: listenerKind, ownerId: listenerOwnerId, scoped: listenerScoped }),
      spatialAt(x: number, y: number, z: number) {
        toListenerFrame(frame, x, y, z, rel);
        return { dist: rel.distance, gain: dbToGain(distanceAttenuationDb(rel.distance, 12, 1)), pan: panFromRelative(rel, 0.92) };
      },
      engineState: () => [...rigs.values()].map((rig) => ({
        id: rig.id, lod: rig.lod, own: rig.lod === 'own', scoped: listenerScoped, dist: rig.lastDistance, gain: rig.lastGain, family: rig.identity.engine,
        airHz: Math.round(rig.lastAirHz),
        // Effective lowpass: the rig's air absorption under the snapshot's world/hull filter.
        cutoffHz: Math.min(rig.lastCutoff, mixer ? SNAPSHOTS[mixer.snapshot][rig.lod === 'own' ? 'ownHz' : 'worldHz'] : 20000),
        rpm: +rig.state.rpm.toFixed(3), gear: rig.state.gear, load: +rig.state.load.toFixed(2), scrub: +rig.state.scrub.toFixed(2),
        net: +rig.netGain.toFixed(3), surface: rig.surface,
      })).sort((a, b) => a.dist - b.dist),
      aerialState: () => ({
        drones: [...droneRigs.entries()].map(([id, rig]) => ({ id, gain: +rig.lastGain.toFixed(4), rate: +rig.lastRate.toFixed(3) })),
        gunships: [...gunshipRigs.entries()].map(([id, rig]) => ({ id, gain: +rig.lastGain.toFixed(4), rate: +rig.lastRate.toFixed(3) })),
        own: ownAerial ? { kind: ownAerial.kind, gain: +ownAerial.lastGain.toFixed(4) } : null,
      }),
      interfaceSound: (sound: InterfaceSound, inMenu = false) => interfaceSound(sound, inMenu),
      setEngineProbeSolo(id: string | null = null) { probeSolo = id || null; return probeSolo; },
      sayVoice: (id: string) => radio?.say(id, { force: true }) ?? false,
      forceCrewLanguage(lang: string | null = null) {
        forcedCrewLanguage = (CREW_LANGUAGES as readonly string[]).includes(String(lang)) ? lang as CrewLanguage : null;
        applyCrewLanguage();
        return radio?.language ?? null;
      },
      clearVoiceQueue: () => radio?.silence(),
      play: (id: string, options?: PlayOptions) => play(id, options),
      preload: (ids: string[]) => library?.load(ids),
      startTap(maxS = 40) {
        if (!ctx || !mixer || tap) return false;
        const sp = ctx.createScriptProcessor(4096, 2, 2);
        const sink = ctx.createGain();
        sink.gain.value = 0;
        mixer.master.connect(sp);
        sp.connect(sink);
        sink.connect(ctx.destination);
        const maxChunks = Math.ceil((maxS * ctx.sampleRate) / 4096);
        const chunks: Int16Array[] = [];
        sp.onaudioprocess = (ev) => {
          if (chunks.length >= maxChunks) return;
          const l = ev.inputBuffer.getChannelData(0);
          const r = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : l;
          const out = new Int16Array(l.length * 2);
          for (let i = 0; i < l.length; i++) {
            out[i * 2] = Math.max(-32768, Math.min(32767, (l[i] * 32767) | 0));
            out[i * 2 + 1] = Math.max(-32768, Math.min(32767, (r[i] * 32767) | 0));
          }
          chunks.push(out);
        };
        tap = { sp, sink, chunks, data: null };
        return true;
      },
      stopTap() {
        if (!tap || !mixer) return 0;
        try { mixer.master.disconnect(tap.sp); } catch { /* detached */ }
        try { tap.sp.disconnect(); tap.sink.disconnect(); } catch { /* detached */ }
        tap.sp.onaudioprocess = null;
        let n = 0;
        for (const c of tap.chunks) n += c.length;
        const all = new Int16Array(n);
        let o = 0;
        for (const c of tap.chunks) { all.set(c, o); o += c.length; }
        tap.data = all;
        tap.chunks = [];
        return n;
      },
      readTapB64(offset: number, count: number) {
        if (!tap?.data) return '';
        const view = tap.data.subarray(offset, offset + count);
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
      clearTap() { tap = null; },
      get sampleRate() { return ctx ? ctx.sampleRate : 0; },
      busGains() {
        if (!mixer) return null;
        const g = mixer.busGains();
        // Effective per-channel levels after the snapshot (1 = nominal), for
        // tools/pause-probe.mjs and tools/audio-probe.mjs.
        const engine = (g.own / BUS_LEVELS.own) * g.ownSnap;
        const sfx = (g.weapons / BUS_LEVELS.weapons) * g.worldSnap;
        const music = g.music / BUS_LEVELS.music;
        return { ...g, engine, sfx, music, chanVol: { ...chan }, pauseK: battleMode.paused ? 0 : 1, duckK: battleMode.killcam ? 0.35 : 1, uiVolEvents: volumeEvents, snapshot: mixer.snapshot };
      },
      get _nodes() { return mixer ? { master: mixer.master } : {}; },
    };
    (window as unknown as { __COT_AUDIO?: unknown }).__COT_AUDIO = surface;
  }

  // Every control in the garage and the menus sounds (not the battle controls).
  if (typeof document !== 'undefined') bindInterfaceSounds(document, (hit) => interfaceSound(hit.sound, hit.inMenu));

  return {
    resume,
    bindBus,
    update,
    setMasterVolume(value) {
      masterVolume = clamp(value, 0, 1);
      mixer?.setMaster(masterVolume);
    },
    mute(on) {
      muted = !!on;
      mixer?.setMuted(muted);
    },
    playGarageSting() {
      if (!ready()) return;
      play('sting_garage');
    },
    loadingOn,
    warmBattleEvents(roster) {
      // kept for the battle's later warms (its phase edge, a mixer adopted late), which name no roster
      if (roster?.length) battleRoster = [...roster];
      if (!library) return;
      // Battle entry waits for the decode, but never longer than the loader's patience.
      return Promise.race([warmBattle(), new Promise<void>((resolve) => setTimeout(resolve, 3500))]);
    },
    ambientOn(on) {
      ambientWanted = !!on;
      if (!ready() || !ambience) return;
      if (on) applyScene();
      else if (battleMode.phase === 'battle') ambience.stop(0.5);
    },
  };
}
