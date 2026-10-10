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
import { createAssetLibrary, type AssetLibrary } from './assetLibrary.ts';
import { createMixer, type Mixer } from './mixer.ts';
import { createVoicePool, type PlayOptions, type VoicePool } from './voicePool.ts';
import { createCrewRadio, type CrewRadio } from './crewRadio.ts';
import { createAmbienceDirector, sceneAssets, type AmbienceDirector, type BellTower } from './ambienceDirector.ts';
import { BELL_TOWERS, FLYOVER_BY_AIRCRAFT, GARAGE_SCENE, sceneForMap, type EnvironmentScene } from './environmentScenes.ts';
import { propSoundAssets, propSoundRecipe } from './propSounds.ts';
import { DESTRUCTION_SOUND_IDS, blastSoundCaliberMm, munitionExplodes, munitionFromType, structureStageSounds } from './destructionSounds.ts';
import { collapseImpactLayers, onCollapseImpact } from '../fx/collapseImpacts.ts';
import type { MunitionClass, StructureStageEvent } from '../sim/destructionEvents.ts';
import { BUDGETS, BUS_LEVELS, CONCUSSION, SNAPSHOTS, VEHICLE_LOD, type DeviceTier, type SettingsChannel } from './mixPolicy.ts';
import { createVehicleRig, fillVehicleInput, type RigFrame, type RigLod, type VehicleRig } from './vehicleRig.ts';
import { createAerialRig, type AerialFrame, type AerialRig } from './aerialRig.ts';
import { cueProfile } from './soundCues.ts';
import { AERIAL_RULES } from '../sim/matchRuleset.ts';
import { bindInterfaceSounds, type InterfaceSound } from './interfaceSounds.ts';
import { resolveVehicleAudioIdentity, CREW_LANGUAGES, ENGINE_FAMILY_IDS, type CrewLanguage, type VehicleAudioIdentity } from './vehicleAudioProfiles.ts';
import type { ModuleHealth, SurfaceId, VehicleAudioInput } from './vehicleAudioModel.ts';
import { resolveReloadCuePlan, resolveWeaponReport, type ReloadCuePlan, type ReloadCueType, type WeaponClassId } from './weaponAudio.ts';
import { isCrewVoiceSetting, normalizeCrewVoiceSetting, resolveCrewLanguage, type CrewVoiceSetting } from './crewVoice.ts';

type Vec3 = readonly [number, number, number];
type ResultKind = 'victory' | 'defeat' | 'draw';

/** Terrain queries the engine needs (the live height-field proxy satisfies it). */
export interface AudioTerrainProbe {
  getHeightAt(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
  getTrackSurfaceAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
}

interface AudioMixerOptions {
  context?: AudioContext | null;
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
  initialPhase?: string;
  tier?: DeviceTier;
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
    shells?: readonly { type?: string; guided?: boolean; soundProfile?: string }[];
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
  aerial?: { kind?: string; active?: boolean; launching?: boolean; x?: number; y?: number; z?: number; batteryS?: number; cooldownS?: number };
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
  nation: string;
  alive: boolean;
  spotted: boolean;
}

function toEntity(value: RuntimeValue): AudioEntity | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as { id?: unknown; state?: { pos?: { x?: unknown; y?: unknown; z?: unknown }; speed?: unknown } };
  if (typeof e.id !== 'string' || !e.state?.pos || typeof e.state.pos.x !== 'number'
    || typeof e.state.pos.y !== 'number' || typeof e.state.pos.z !== 'number' || typeof e.state.speed !== 'number') return null;
  return value as AudioEntity;
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
}

interface ShellExpiredEvent { shellId?: number; shooterId?: string; hitTerrain?: boolean; hitKind?: string; surfaceKind?: string; caliberMm?: number; pos?: Vec3;
  /** the building the round struck (2026-10-10), when it struck one */
  structureId?: number;
  /** the round's type, and the destruction catalog's class and charge when published (destruction-fx lane) */
  shellType?: string; munition?: MunitionClass; chargeKg?: number }
interface TankDestroyedEvent { id: string; killerId?: string | null; pos: Vec3; cause?: string }
interface ModuleStateEvent { id: string; module: string; state: string; source?: string; repaired?: boolean }
interface TankImpactEvent { id?: string; pos: Vec3; speedMps: number }
interface TankRamEvent { aId?: string; bId?: string; aIsPlayer?: boolean; bIsPlayer?: boolean; pos: Vec3; closingMps?: number; dmgA?: number; dmgB?: number }
/** `loose`: a loose prop (a drum, a bucket) knocked about rather than destroyed (props.ts kickLooseRecord). */
interface PropEvent { id?: string; kind?: string; pos: Vec3; h?: number; cause?: string; speedMps?: number; loose?: boolean }
interface ReloadEvent { total?: number; kind?: string; caliberMm?: number; t?: number; progress?: number; done?: boolean }
interface VolumeEvent { master?: number; engine?: number; combat?: number; ambience?: number; ui?: number; voice?: number; alarmHeartbeat?: boolean; crewVoice?: string; concussion?: boolean }
interface SmokeScreen { born?: number; x?: number; y?: number; z?: number; source?: readonly unknown[] }

// ------------------------------------------------------------------ engine ---

const WEAPON_CLOSE: Readonly<Record<WeaponClassId, string>> = Object.freeze({
  mg_rifle: 'mg_rifle_close', mg_heavy: 'mg_heavy_close',
  ac_20: 'ac_20_close', ac_25: 'ac_25_close', ac_30: 'ac_30_close', ac_40: 'ac_40_close', ac_50: 'ac_50_close',
  gun_90: 'gun_90_close', gun_105: 'gun_105_close', gun_120: 'gun_120_close', gun_125: 'gun_125_close',
  gun_130: 'gun_130_close', gun_152: 'gun_152_close', atgm: 'atgm_launch', rocket_heavy: 'rocket_salvo',
  gunship_30: 'ac_30_close', gunship_howitzer: 'gun_152_close', gunship_missile: 'atgm_launch',
});

/**
 * The crew's own gun: a dedicated report, fuller than anyone else's, as World
 * of Tanks keeps the player's shot apart. Classes without one use their close bank.
 */
const OWN_REPORT: Readonly<Partial<Record<WeaponClassId, string>>> = Object.freeze({
  gun_90: 'gun_own_medium', gun_105: 'gun_own_medium', gun_120: 'gun_own_large', gun_125: 'gun_own_large',
  gun_130: 'gun_own_heavy', gun_152: 'gun_own_heavy', atgm: 'missile_launch_own',
  // The AC-130's crew hears its guns inside the cargo cabin, the missile leaving the wing pylon.
  gunship_30: 'gunship_30mm_own', gunship_howitzer: 'gunship_howitzer_own', gunship_missile: 'gunship_missile_own',
});

const WEAPON_FAR: Readonly<Record<WeaponClassId, string>> = Object.freeze({
  mg_rifle: 'mg_far', mg_heavy: 'mg_far',
  ac_20: 'ac_far_light', ac_25: 'ac_far_light', ac_30: 'ac_far_light', ac_40: 'ac_far_heavy', ac_50: 'ac_far_heavy',
  gun_90: 'gun_far_light', gun_105: 'gun_far_light', gun_120: 'gun_far_medium', gun_125: 'gun_far_medium',
  gun_130: 'gun_far_heavy', gun_152: 'gun_far_heavy', atgm: 'ac_far_light', rocket_heavy: 'gun_far_heavy',
  gunship_30: 'gunship_30mm_far', gunship_howitzer: 'gunship_howitzer_far', gunship_missile: 'ac_far_light',
});

/** A running loop the engine can stop (the fire alarm, the heartbeat, the loading bed). */
interface Rig {
  stop(fadeS?: number): void;
}

/** Assets every battle needs before the first shot. */
const CORE_BATTLE = [
  'pen_heavy', 'pen_light', 'pen_interior', 'ricochet_heavy', 'ricochet_light', 'nonpen_heavy', 'nonpen_interior',
  'impact_far_pen', 'impact_far_nonpen', 'impact_far_ricochet',
  'heat_impact', 'he_armor', 'era_det', 'bullet_armor', 'bullet_dirt', 'bullet_water', 'ground_dirt', 'ground_rock',
  'ground_sand', 'ground_snow', 'ground_mud', 'ground_concrete', 'ground_wood', 'ground_metal', 'water_big', 'water_small',
  'expl_he_small', 'expl_he_medium', 'expl_he_large', 'expl_far', 'debris_dirt', 'tank_explode', 'tank_explode_ammo',
  'turret_land', 'debris_metal', 'cookoff_loop', 'wreck_fire_loop', 'fire_ignite', 'burnout_blast', 'metal_creak',
  'shell_flyby_sabot', 'shell_flyby_he', 'bullet_crack', 'missile_flyby', 'ram_heavy', 'ram_light', 'hit_rock',
  'hit_wall', 'tree_snap', 'tree_fall', 'fence_wood', 'fence_metal', 'car_crush', 'crate_break', 'rubble_crunch',
  'gear_shift', 'brake_squeal', 'brake_hiss', 'susp_bump', 'susp_land', 'susp_creak', 'track_break', 'track_squeal_loop',
  'track_skid_loop', 'water_wade_loop', 'water_enter', 'engine_knock_loop', 'turret_stop',
  'tail_open', 'tail_forest', 'tail_urban', 'tail_mountain', 'gun_far_light', 'gun_far_medium', 'gun_far_heavy',
  'ac_far_light', 'ac_far_heavy', 'mg_far', 'mg_rifle_close', 'mg_heavy_close', 'smoke_launcher', 'smoke_burst',
  'radio_interference', 'ui_alert',
  'blast_punch_light', 'blast_punch_medium', 'blast_punch_heavy', 'blast_sub',
  ...DESTRUCTION_SOUND_IDS,
  'gear_whine_loop', 'electric_drive_loop', 'turbo_whistle_loop',
  'sting_battle', 'distant_artillery', 'distant_flak', 'distant_mg', 'jet_flyover',
];

const PLAYER_HULL = [
  'gun_own_medium', 'gun_own_large', 'gun_own_heavy', 'missile_launch_own', 'gun_recoil_mech', 'charge_ram',
  'ammo_door_open', 'ammo_door_close', 'drum_rotate', 'drum_load_round', 'launcher_raise', 'turret_start',
  'breech_open', 'breech_close', 'case_eject_brass', 'case_eject_stub', 'shell_grab', 'shell_ram', 'autoloader_carousel',
  'autoloader_lift', 'autoloader_chain_ram', 'bustle_index', 'ac_feed', 'magazine_swap', 'missile_tube_load', 'latch_ready',
  'gun_interior_medium', 'gun_interior_large', 'gun_interior_heavy', 'repair_kit', 'first_aid', 'extinguisher',
  'ammo_select', 'missile_mode', 'dry_fire', 'gun_limit', 'traverse_grind_loop', 'rollover', 'overturned_groan',
  'engine_flood', 'bubbles_loop', 'hull_debris_patter', 'scope_in', 'scope_out', 'lock_on', 'lock_off',
  'missile_warning', 'roof_gun_servo', 'tinnitus', 'hydro_susp', 'jump_launch', 'self_right', 'hatch', 'switch_toggle',
  'hull_thud_sub', 'alarm_fire_loop', 'alarm_ammo', 'heartbeat_loop', 'lights_on', 'zoom_step',
];

const UI_SET = [
  'ui_click', 'ui_toggle', 'ui_back', 'ui_confirm', 'ui_error', 'ui_tab', 'ui_tank_select', 'ui_deploy',
  'ui_slider', 'ui_ready', 'sting_garage', 'loading_bed_loop',
];

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
  'gunship_casing_drop', 'gunship_round_load', 'gunship_weapon_select',
];

const MODE_SET = [
  'sting_infected',
  'ui_capture_tick', 'ui_objective_gain', 'ui_objective_loss', 'ui_pickup', 'ui_goal', 'ui_ball_hit', 'ui_respawn',
  'ui_flag_taken', 'ui_flag_captured', 'ui_flag_returned', 'ui_flag_dropped', 'ui_wave_clear', 'ui_line_advance',
  'ui_score', 'sting_wave', 'sting_victory', 'sting_defeat', 'sting_draw', 'killcam_in', 'killcam_out', 'spectate_switch',
  'ui_countdown_tick', 'ui_countdown_go',
  'mode_horde_siren', 'mode_horde_all_clear', 'mode_frontline_barrage', 'mode_juggernaut', 'mode_infected_outbreak',
  'mode_turbo_horn', 'mode_gungame_armory', 'cache_drop',
];

/**
 * Each mode opens on its own sound (2026-10-02), field sounds rather than music: the Horde's air-raid siren, the
 * Frontline's preparatory barrage, the Juggernaut's vault door, the Infected's broken radio, Turbo Ball's foghorn,
 * Gun Game's armory, the AC-130 passing overhead. Realistic opens on none; the rest on the battle horn.
 */
const MODE_OPENER: Readonly<Record<string, string>> = Object.freeze({
  endless_horde: 'mode_horde_siren', frontline_assault: 'mode_frontline_barrage', juggernaut: 'mode_juggernaut',
  infected: 'mode_infected_outbreak', turbo_ball: 'mode_turbo_horn', gun_game: 'mode_gungame_armory', ac130: 'gunship_flyover',
});

function detectTier(): DeviceTier {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { deviceMemory?: number } : null;
  if (!nav) return 'desktop';
  const touch = (nav.maxTouchPoints || 0) > 1 && /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '');
  return touch || (nav.deviceMemory != null && nav.deviceMemory <= 4) ? 'mobile' : 'desktop';
}

export function createAudio({
  context: initialContext = null,
  getMapId,
  getGameMode,
  getObjectiveTeam,
  getTerrain,
  getLandmarks,
  initialPhase = 'garage',
  tier: forcedTier,
}: AudioMixerOptions = {}): AudioMixer {
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
  let listenerValid = false;
  let listenerKind: AudioListenerPose['kind'] = 'camera';
  let listenerOwnerId: string | null = null;
  let listenerScoped = false;
  let wasScoped = false;
  let phase = initialPhase;
  let battleOver = false;
  let pendingResult: ResultKind | null = null;
  let paused = false;
  let killcam = false;
  let loading: Rig | null = null;
  let loadingActive = false;
  let ambientWanted = false;
  let playerId: string | null = null;
  let playerTeam: string | null = null;
  let atmosphere: AtmosphereProfile = atmosphereForMap(null);
  let scene: EnvironmentScene = GARAGE_SCENE;
  const tanks = new Map<string, TankInfo>();
  const rigs = new Map<string, VehicleRig>();
  const moduleStates = new Map<string, string>();
  const wrecks: { until: number; voices: ReturnType<VoicePool['play']>[]; nextCreak: number; x: number; y: number; z: number }[] = [];
  let probeSolo: string | null = null;
  const soundLog: Record<string, unknown>[] = [];
  let soundSeq = 0;
  const killcamLog: Record<string, unknown>[] = [];

  // The listener's main-gun rounds in flight (muzzle and unit direction), for the gunner's miss call.
  const ownRounds = new Map<number, { x: number; y: number; z: number; dx: number; dy: number; dz: number }>();

  // Player battle bookkeeping.
  let rolledOut = false;
  let bossId: string | null = null;
  let bossChecked = false;
  let movedOnce = false;
  let lowHpCalled = false;
  let ammoLowCalled = false;
  let lastStanding = { mine: false, theirs: false, outnumbered: false };
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
  let loaderKind: VehicleAudioIdentity['loader'] = 'manual';
  const surfaceCache = new Map<string, { surface: SurfaceId; depth: number; occluded: number; at: number }>();
  const input: VehicleAudioInput = {
    dtS: 0, speedMps: 0, topSpeedMps: 1, reverseTopMps: 1, throttle: 0, brake: false, yawRate: 0,
    grounded: true, verticalSpeedMps: 0, landingImpactMps: 0, gripLost: false, engine: 'ok', immobilized: false,
  };
  const rigFrame: RigFrame = {
    dtS: 0, rel: { right: 0, up: 0, ahead: 0, distance: 0 }, x: 0, y: 0, z: 0, own: false, scoped: false,
    surface: 'earth', waterDepthM: 0, atmosphere, occluded: 0, doppler: 1, turretRate: 0, pitchRate: 0, cabin: 0, input,
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

  /** A looping cue as a stoppable handle; null while its asset decodes (a missing loop stays silent). */
  function loopRig(id: string, options: PlayOptions = {}): Rig | null {
    const voice = pool?.play(id, { ...options, loop: true }) ?? null;
    if (!voice) return null;
    return { stop: (fadeS = 0.2) => { pool?.stop((v) => v === voice, fadeS); } };
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

  function say(id: string, options?: Parameters<CrewRadio['say']>[1]): boolean {
    let why: string | undefined;
    if (!radio || phase !== 'battle') why = 'phase';
    else if (playerId != null && tanks.get(playerId)?.alive === false && id !== 'victory' && id !== 'defeat' && id !== 'draw') why = 'dead';
    const ok = why == null && !!radio?.say(id, options);
    sayLog.push({ id, t: ctx ? +ctx.currentTime.toFixed(3) : 0, ok, ...(why ? { why } : !ok ? { why: 'net' } : {}) });
    if (sayLog.length > 160) sayLog.shift();
    return ok;
  }

  /**
   * "Let me think step by step." A reasoning medal (Chain of Thought, or five hits in a row) and, rarely, our first
   * shot of a battle ask for it, once a battle. It is flavour that gives way to any real call: the commander speaks
   * only on a quiet net (waiting up to THINK_WAIT_S, so the kill call goes first), and the gunner's "Step one: aim.
   * Step two: fire." follows only when the net is quiet again and the commander's line was the last thing said.
   */
  function requestThink(): void {
    if (thoughtThisBattle || thinkStage !== 'idle' || !ctx || phase !== 'battle' || battleOver) return;
    thinkStage = 'wait';
    thinkUntil = ctx.currentTime + THINK_WAIT_S;
  }

  function updateThink(now: number): void {
    if (thinkStage === 'idle' || !radio) return;
    if (now > thinkUntil || battleOver || phase !== 'battle') { thinkStage = 'idle'; return; }
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
    if (ground === 'hard') return { surface: 'hard', depth };
    let track = 0;
    try { track = terrain.getTrackSurfaceAt?.(x, z) ?? 0; } catch { track = 0; }
    if (track === 2) return { surface: 'sand', depth };
    if (track === 3) return { surface: 'snow', depth };
    if (ground === 'soft') return { surface: 'mud', depth };
    return { surface: 'earth', depth };
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

  function fireWeapon(pos: Vec3, caliberMm: number, soundProfile: string | null | undefined, own: boolean, muzzleIndex = -1, cinematic = false, shooterId: string | null = null): void {
    if (!ready()) return;
    const resolved = resolveWeaponReport(caliberMm, soundProfile);
    // The Juggernaut's gun carries further and sits a little deeper.
    const report = shooterId != null && shooterId === bossId ? { ...resolved, gainDb: resolved.gainDb + 2.5, rate: resolved.rate * 0.94 } : resolved;
    const cls = report.cls;
    const [x, y, z] = pos;
    const distance = own ? 2 : distanceTo(x, y, z);
    const close = WEAPON_CLOSE[cls.id];
    const far = WEAPON_FAR[cls.id];
    const closeK = own ? 1 : 1 - rampBetween(distance, cls.closeFadeM[0], cls.closeFadeM[1]);
    // Our own shot keeps a trace of its distant report; a gunship's distant report is the ground's, not its crew's.
    const farK = own ? (cls.id.startsWith('gunship_') ? 0 : 0.18) : rampBetween(distance, cls.farFadeM[0], cls.farFadeM[1]);
    const bus = cinematic ? 'cinematic' as const : own ? 'ownCombat' as const : undefined;
    const base: PlayOptions = { x, y, z, rate: report.rate, gainDb: report.gainDb, ...(bus ? { bus } : {}) };
    if (own) { base.propagate = false; base.priority = 95; }
    const ownReport = own ? OWN_REPORT[cls.id] : undefined;
    // The blast belongs to the close report: past its range the distant bank carries the shot.
    const blastDb = closeK > 0.05 ? BLAST_DB[cls.family] : undefined;
    if (blastDb != null) {
      const punch = punchFor(cls.family, caliberMm);
      play(punch.id, { ...base, rate: punch.rate, maxDurS: punch.maxDurS, loudDb: cls.loudDb + 1, gainDb: (base.gainDb ?? 0) + blastDb + (own ? 2 : 0) });
    }
    // The crew's own report when the class has one (pinned with the hull set), the close report otherwise: never
    // the bank everyone else hears standing in for ours while it decodes or rests (owner 2026-10-04, no fallbacks).
    if (ownReport) play(ownReport, { ...base, gainDb: (base.gainDb ?? 0) + 2.5 });
    else if (closeK > 0.03) play(close, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(closeK) + (own ? 2.5 : 0) });
    // The distant banks are loudness-mastered booms, the close reports peak-mastered cracks: the boom sits under.
    if (farK > 0.03) play(far, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(farK) - 3 });
    if (report.twin) play(close, { ...base, delayS: 0.016, rate: report.rate * (muzzleIndex === 1 ? 1.04 : 0.97), gainDb: (base.gainDb ?? 0) + gainToDb(Math.max(closeK, 0.05)) - 2 });
    if (scene.tail !== 'none' && mixer) {
      const now = mixer.ctx.currentTime;
      if (cls.family !== 'mg' || now - (lastBurstTail.get(cls.id) ?? -1) > 0.22) {
        if (cls.family === 'mg') lastBurstTail.set(cls.id, now);
        // The echo sits well under the crack (2026-10-02): at the old level it was nearly as loud as a
        // peak-mastered report and held a near shot within 2–9 dB of its peak for half a second, a blast.
        play(`tail_${scene.tail}`, { ...base, rate: cls.tailRate * report.rate, delayS: 0.035 + random() * 0.02, gainDb: gainToDb(cls.tailGain) - (own ? 14 : 12) });
      }
    }
    if (own && listenerScoped && cls.family === 'cannon') {
      const size = caliberMm >= 128 ? 'heavy' : caliberMm >= 111 ? 'large' : 'medium';
      play(`gun_interior_${size}`, hullOptions({ bus: 'ownCombat', gainDb: 3 }));
    }
    // The machinery of our own shot: the breech recoiling and running back into
    // battery, the buffer's hiss, the turret's loose gear rattling.
    if (own && !cinematic && cls.id === 'gunship_howitzer') {
      // In the gunship the breech runs open on counter-recoil and throws the hot case onto the deck.
      play('gunship_casing_drop', hullOptions({ delayS: 0.45 }));
    } else if (own && !cinematic && cls.family === 'cannon') {
      play('gun_recoil_mech', hullOptions({ delayS: 0.035, rate: clamp(1.15 - (caliberMm - 100) / 300, 0.85, 1.15) }));
    }
    // (A synthesized sub sweep used to sit under every cannon; 0.5–0.8 s of falling sine is a trailer boom,
    // and it made gunfire read as explosions. The recorded punch is the weight now.)
    if ((own || distance < 45) && cls.family === 'autocannon') {
      play('ac_feed', own ? hullOptions({ delayS: cls.actionDelayS, gainDb: -8 }) : { x, y, z, delayS: cls.actionDelayS, gainDb: -10 });
    }
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
    const reach = small ? 6 : launcher ? 30 : 16;
    const velocity = event.velocityMps && event.velocityMps > 0 ? event.velocityMps : launcher ? 280 : 900;
    if (launcher && miss < 30 && !sameTeam(event.shooterId, playerId) && playerId && tanks.get(playerId)?.alive !== false) {
      play('missile_warning', { delayS: 0 });
      say('missile_incoming', { delayS: 0.05 });
    }
    if (miss > reach) return;
    const passIn = along / velocity;
    const asset = launcher ? 'missile_flyby' : small ? 'bullet_crack'
      : event.shellType === 'HE' || event.shellType === 'HEAT' ? 'shell_flyby_he' : 'shell_flyby_sabot';
    const lead = asset === 'bullet_crack' ? 0.01 : 0.12;
    play(asset, { x: cx, y: cy, z: cz, propagate: false, delayS: Math.max(0, passIn - lead), gainDb: -3 * (miss / reach), priority: 82 });
    if (!small && !launcher && miss < 9 && !sameTeam(event.shooterId, playerId)) say('near_miss', { prob: 0.25, delayS: passIn + 0.25 });
  }

  function onShellFired(event: ShellFiredEvent): void {
    const ownShot = listenerOwnerId != null ? event.shooterId === listenerOwnerId : !!event.isPlayer;
    if (!event.feedbackPredicted) fireWeapon(event.muzzlePos, event.caliberMm, event.weaponSound, ownShot, event.muzzleIndex, false, event.shooterId);
    if (!ownShot) shellFlyby(event);
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
      report: resolveWeaponReport(event.caliberMm, event.weaponSound).cls.id,
      dist: +dist.toFixed(1), gain: +dbToGain(distanceAttenuationDb(dist, 12, 1)).toFixed(4),
    });
  }

  function onPredictedWeapon(event: ShellFiredEvent): void {
    if (!ctx || phase !== 'battle' || battleOver || !event.isPlayer) return;
    if (listenerOwnerId == null || event.shooterId !== listenerOwnerId) return;
    // Intent-only report: no flyby, crew call or shell bookkeeping.
    fireWeapon(event.muzzlePos, event.caliberMm, event.weaponSound, true, event.muzzleIndex);
  }

  // --------------------------------------------------------------- impacts ---

  /**
   * A blast close to the occupied hull muffles the mix and rings the ears
   * (setting-gated). Strength falls off across the bore-scaled radius.
   */
  function blastNearHull(distance: number, caliberMm: number): void {
    if (!concussionFx || !mixer || !listenerValid || phase !== 'battle' || playerEntityInfo()?.alive === false) return;
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
    if (distance < 40 && caliberMm >= 61) play('debris_dirt', { x, y, z, delayS: 0.35, gainDb: -4 });
  }

  function groundImpactAsset(surface: SurfaceId, x: number, z: number): string {
    switch (surface) {
      case 'hard': return 'ground_concrete';
      case 'sand': return 'ground_sand';
      case 'snow': return 'ground_snow';
      case 'mud': return 'ground_mud';
      case 'water': return 'water_big';
      default: return random() < 0.18 && (getTerrain?.()?.getGroundType(x, z) === 'medium') ? 'ground_rock' : 'ground_dirt';
    }
  }

  /** Whether a round came from the listener's tank (the occupied one, or the one being watched). */
  function listenerShot(shooterId: string | null | undefined): boolean {
    if (shooterId == null) return false;
    return listenerOwnerId != null ? shooterId === listenerOwnerId : shooterId === playerId;
  }

  /**
   * An armour hit crossfaded by range: the close bank's detail within a few
   * hundred metres, the distant bank's crack, knock or clang beyond. Machine-gun
   * hits have no distant bank.
   */
  function armourHit(close: string, far: string | null, x: number, y: number, z: number, gainDb: number, rate: number, focus: boolean): void {
    const distance = distanceTo(x, y, z);
    const closeK = far ? 1 - rampBetween(distance, 260, 620) : 1;
    const farK = far ? rampBetween(distance, 140, 440) : 0;
    if (closeK > 0.03) play(close, { x, y, z, rate, focus, gainDb: gainDb + gainToDb(closeK) });
    if (far && farK > 0.03) play(far, { x, y, z, focus, gainDb: gainDb + gainToDb(farK) });
  }

  function playerHull(event: ShellHitEvent): boolean {
    return (listenerOwnerId != null && event.targetId === listenerOwnerId)
      || (listenerOwnerId == null && playerId != null && event.targetId === playerId);
  }

  function impactSounds(event: ShellHitEvent, ownHull: boolean): void {
    const [x, y, z] = event.pos;
    const caliber = event.caliberMm || 100;
    const small = caliber < 23;
    const medium = caliber >= 23 && caliber < 61;
    const heat = event.shellType === 'HEAT';
    // Our own cannon and autocannon hits carry (OWN_HIT_FOCUS); machine-gun pings stay local.
    const focus = !small && listenerShot(event.attackerId);
    // Reactive armour is additive to the deeper result: every positioned
    // cassette detonates, and a pass-through activation without positions
    // still gets its blast at the impact point.
    let cassettes = 0;
    for (const activation of event.eraActivations || []) {
      if (activation?.pos?.length === 3) { play('era_det', { ...at(activation.pos), focus }); cassettes++; }
    }
    if (!cassettes && isEraActivation(event) && event.kind !== 'era') play('era_det', { x, y, z, focus });
    switch (event.kind) {
      case 'pen':
        if (small) play('bullet_armor', { x, y, z });
        else armourHit(medium ? 'pen_light' : 'pen_heavy', 'impact_far_pen', x, y, z, medium ? -5 : 0, 1, focus);
        if (heat) play('heat_impact', { x, y, z, gainDb: -3, focus });
        if (ownHull && (event.damage || 0) > 0) {
          play('pen_interior', hullOptions({ bus: 'ownCombat', gainDb: small ? -14 : medium ? -6 : 0 }));
          if (!small) play('hull_thud_sub', hullOptions({ bus: 'ownCombat', gainDb: medium ? -5 : 0 }));
        }
        break;
      case 'ricochet':
        if (small) play('ricochet_light', { x, y, z });
        else armourHit(medium ? 'ricochet_light' : 'ricochet_heavy', 'impact_far_ricochet', x, y, z, medium ? -5 : 0, 1, focus);
        if (ownHull && !small) play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: medium ? -10 : -5 }));
        break;
      case 'nonpen':
      case 'spaced_absorb':
        if (small) play('bullet_armor', { x, y, z });
        else armourHit('nonpen_heavy', 'impact_far_nonpen', x, y, z, medium ? -4 : 0, medium ? 1.18 : 1, focus);
        if (heat) play('heat_impact', { x, y, z, gainDb: -5, focus });
        if (ownHull && !small) play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: medium ? -8 : 0 }));
        break;
      case 'era':
        if (!(event.eraActivations || []).length) play('era_det', { x, y, z, focus });
        break;
      case 'he_pen':
      case 'he_splash':
        play('he_armor', { x, y, z, focus });
        explosion(x, y, z, caliber, undefined, focus);
        if (ownHull) play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: -2 }));
        break;
      case 'terrain': {
        explosion(x, y, z, caliber, undefined, focus);
        const { surface } = surfaceAt(x, z);
        play(groundImpactAsset(surface, x, z), { x, y, z, gainDb: -4, focus });
        break;
      }
      default:
        break;
    }
    // Hull-borne debris from a close blast.
    if (!ownHull && (event.kind === 'he_splash' || event.kind === 'terrain') && listenerValid && distanceTo(x, y, z) < 14 && playerEntityInfo()?.alive) {
      play('hull_debris_patter', hullOptions({ bus: 'ownCombat', delayS: 0.3 }));
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
    else if (event.kind === 'ricochet') call('ricochet');
    else if (event.kind === 'nonpen' || event.kind === 'spaced_absorb') call('nonpen');
    // A splash or a cassette that stopped the round without hurting the tank is no penetration too.
    else if ((event.kind === 'he_splash' || event.kind === 'era') && !damaged) call('nonpen');
  }

  /**
   * The gunner calls our main-gun miss: "short" (the line's second take) when
   * the round came down before the enemy it was laid on, the live enemy
   * nearest the line of fire, and a plain "miss" otherwise.
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
    say('miss', { take: landed < laidOn - 8 ? 1 : 0, delayS: 0.45 + random() * 0.15 });
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
    if (event.targetId === playerId) reportIncoming(event);
    else if (event.attackerId === playerId) reportOutgoing(event);
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
    if (small) {
      play(water ? 'bullet_water' : 'bullet_dirt', { x, y, z });
    } else if (water) {
      play(caliber >= 61 ? 'water_big' : 'water_small', { x, y, z, focus, ...(blastCal > 0 ? { gainDb: -4 } : {}) });
    } else if (event.hitKind === 'prop') {
      play(propImpactAsset(String(event.surfaceKind || '')), { x, y, z, focus });
      // a round into a building breaks its wall (structureStages punches the hole): the masonry crumbling out of it
      if (typeof event.structureId === 'number' || event.surfaceKind === 'structure') {
        play('rubble_crunch', { x, y, z, delayS: 0.06 + random() * 0.05, gainDb: blastCal > 0 ? -5 : -9 });
      }
    } else {
      play(groundImpactAsset(surfaceAt(x, z).surface, x, z), { x, y, z, focus, rate: clamp(1.1 - caliber / 900, 0.9, 1.08),
        ...(blastCal > 0 ? { gainDb: -4 } : {}) });
    }
    if (!small && listenerValid && playerEntityInfo()?.alive && distanceTo(x, y, z) < 10) {
      play('hull_debris_patter', hullOptions({ bus: 'ownCombat', delayS: 0.25, gainDb: -3 }));
    }
    logSound('shell:expired', { id: event.shellId, hitKind: water ? 'water' : (event.hitKind || 'terrain') });
  }

  // ----------------------------------------------------------- destruction ---

  /**
   * A destruction. The kill-cam replays it through the cinematic bus: the blast
   * transient stays crisp while the debris and turret layers stretch and pitch
   * down at the replay's slow-motion rate, timed to the slowed launch.
   */
  function onTankDestroyed(event: TankDestroyedEvent, cinematic = false, slowRate = 1): void {
    const [x, y, z] = event.pos;
    const cause = event.cause === 'ammorack' || event.cause === 'fire' ? event.cause : 'shot';
    const bus = cinematic ? { bus: 'cinematic' as const } : {};
    const slow = cinematic ? { ...bus, rate: slowRate } : bus;
    const stretch = cinematic ? 1 / slowRate : 1;
    // Our kill is confirmed by the target itself going up, carried like our hits.
    const focus = !cinematic && listenerShot(event.killerId);
    if (cause === 'fire') {
      play('burnout_blast', { x, y, z, focus, ...bus });
    } else {
      play(cause === 'ammorack' ? 'tank_explode_ammo' : 'tank_explode', { x, y, z, focus, ...bus });
      const blastM = distanceTo(x, y, z);
      if (blastM < (focus ? 1800 : 900)) {
        play('blast_sub', { x, y, z, rate: cause === 'ammorack' ? 0.8 : 0.88, gainDb: cause === 'ammorack' ? 2 : 1, focus, ...bus });
      }
      if (!cinematic && blastM > 600) play('expl_far', { x, y, z, focus, gainDb: -3 });
      play('debris_metal', { x, y, z, delayS: 0.25 * stretch, focus, ...slow });
      if (cause === 'ammorack') play('turret_land', { x: x + (random() - 0.5) * 8, y, z: z + (random() - 0.5) * 8, delayS: (1.5 + random() * 1.1) * stretch, focus, ...slow });
    }
    if (!cinematic && cause !== 'fire' && event.id !== playerId) blastNearHull(distanceTo(x, y, z), cause === 'ammorack' ? 160 : 110);
    if (!cinematic && ctx) {
      const now = ctx.currentTime;
      const voices: ReturnType<VoicePool['play']>[] = [];
      if (cause === 'ammorack') voices.push(pool?.play('cookoff_loop', { x, y, z, loop: true, delayS: 0.8 }) ?? null);
      if (cause !== 'shot' || random() < 0.45) voices.push(pool?.play('wreck_fire_loop', { x, y, z, loop: true, delayS: 0.5 }) ?? null);
      wrecks.push({ until: now + 22 + random() * 18, voices, nextCreak: now + 6 + random() * 6, x, y, z });
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
      say(now - lastKillAt < 12 ? 'double_kill' : 'target_destroyed', { delayS: 0.45 + random() * 0.15 });
      lastKillAt = now;
    } else if (playerId != null && info) {
      const near = listenerValid && distanceTo(x, y, z) < 300;
      if (sameTeam(event.id, playerId)) { if (near) say('ally_destroyed', { delayS: 0.3 }); }
      else if (event.killerId && sameTeam(event.killerId, playerId)) say('ally_kill', { prob: 0.3, delayS: 0.35 });
    }
    logSound('tank:destroyed', { id: event.id, killerId: event.killerId, cause, occupied: event.id === listenerOwnerId });
  }

  function updateWrecks(now: number): void {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const wreck = wrecks[i];
      if (now > wreck.until) {
        const doomed = new Set(wreck.voices.filter(Boolean));
        pool?.stop((v) => doomed.has(v), 2.5);
        wrecks.splice(i, 1);
        continue;
      }
      if (now > wreck.nextCreak) {
        wreck.nextCreak = now + 5 + random() * 9;
        play('metal_creak', { x: wreck.x, y: wreck.y, z: wreck.z });
      }
    }
  }

  // ------------------------------------------------------ props/collisions ---

  /**
   * A round striking a prop sounds of what it struck (the hit's record kind): steel clangs, timber splinters, earthworks
   * thump, stone and masonry crack, never a coin toss between wood and concrete.
   */
  function propImpactAsset(kind: string): string {
    const k = kind.toLowerCase();
    if (/car|truck|van|bus|jeep|vehicle|tractor|container|barrel|drum|tank|cylinder|hedgehog|tetra|metal|steel|iron|crane|gantry|wagon|locomotive|boat|ship|wreck|aagun|gun|artillery|pylon|mast|lamp/.test(k)) return 'ground_metal';
    if (/tree|sapling|stump|trunk|palm|pine|bush|shrub|reed|fence|gate|post|crate|wood|timber|log|pallet|hut|shed|barn|shack|kiosk/.test(k)) return 'ground_wood';
    if (/sandbag|bag|bale|berm|earth|trench|mound|dune|hay/.test(k)) return 'ground_dirt';
    if (/rock|stone|boulder|cliff|outcrop/.test(k)) return 'ground_rock';
    return 'ground_concrete';
  }

  /**
   * A prop crushed, broken, toppled or knocked about sounds of what it is (propSounds.ts names every world kind): its
   * recipe's layers at the prop, a topple's landing when it lands. The obstacle crush and the world's own report of
   * the same prop arrive in one tick; the props' 0.05 s cooldown keeps it to one sound.
   */
  function onProp(event: PropEvent, destroyed: boolean): void {
    if (!event?.pos) return;
    const [x, y, z] = event.pos;
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
    play(random() < 0.5 ? 'hit_rock' : 'hit_wall', { ...at(event.pos), gainDb: -10 + 10 * k });
    if (isOwn(event.id) && k > 0.4) play('nonpen_interior', hullOptions({ bus: 'ownCombat', gainDb: -16 + 8 * k }));
    logSound('tank:impact', { id: event.id, speedMps: event.speedMps });
  }

  function onTankRam(event: TankRamEvent, cinematic = false): void {
    if (!event?.pos) return;
    const closing = Math.max(0, Number(event.closingMps) || 0);
    const heavy = closing > 5.5 || Math.max(Number(event.dmgA) || 0, Number(event.dmgB) || 0) > 120;
    play(heavy ? 'ram_heavy' : 'ram_light', { ...at(event.pos), gainDb: -6 + clamp(closing / 11, 0, 1) * 6, ...(cinematic ? { bus: 'cinematic' as const } : {}) });
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
    if (playerId == null || event.id !== playerId || phase !== 'battle') return;
    if (event.source === 'hit') {
      if (worse && event.module === 'ammoRack') play('alarm_ammo', { delayS: 0.01 });
      return;
    }
    if (worse) {
      if (event.module === 'ammoRack') play('alarm_ammo', { delayS: 0.01 });
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

  function reloadCue(type: ReloadCueType, caliber: number): void {
    const mass = clamp(caliber / 110, 0.6, 1.4);
    const rate = clamp(1.12 - (mass - 1) * 0.25, 0.85, 1.25);
    const asset: Readonly<Record<ReloadCueType, string>> = {
      caseEject: caliber <= 105 ? 'case_eject_brass' : 'case_eject_stub', breechOpen: 'breech_open',
      ammoDoorOpen: 'ammo_door_open', shellGrab: 'shell_grab', ammoDoorClose: 'ammo_door_close',
      ram: 'shell_ram', chargeRam: 'charge_ram', breechClose: 'breech_close', carouselTurn: 'autoloader_carousel',
      cassetteLift: 'autoloader_lift', chainRam: 'autoloader_chain_ram', stubEject: 'case_eject_stub',
      bustleIndex: 'bustle_index', clipIndex: 'drum_rotate', drumRotate: 'drum_rotate', drumLoad: 'drum_load_round',
      feedClank: 'ac_feed', magazineSwap: 'magazine_swap', tubeLoad: 'missile_tube_load', launcherRaise: 'launcher_raise',
      latch: 'latch_ready', gunshipLoad: 'gunship_round_load',
    };
    // The doors are machinery the crew hears but does not lean on: a little under the rounds.
    const doors = type === 'ammoDoorOpen' || type === 'ammoDoorClose';
    play(asset[type], hullOptions({ rate: doors ? 1 : rate, gainDb: doors ? -3 : 0 }));
  }

  function onReload(event: ReloadEvent): void {
    if (!ctx || phase !== 'battle' || battleOver) return;
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
      // The AC-130's crew loads its howitzer by hand; its missiles arm on the pylon (whatever hull it fields).
      const loader = latestPlayer?.aerial?.kind === 'gunship' ? (caliber >= 170 ? 'missile' : 'gunship') : loaderKind;
      reload.plan = resolveReloadCuePlan(total, kind, caliber, loader);
      logSound('reload:start', { kind, total, caliberMm: caliber, loader });
    }
    const progress = Number.isFinite(event.progress) ? clamp(Number(event.progress), 0, 1) : clamp(1 - t / total, 0, 1);
    const cues = reload.plan?.cues || [];
    while (reload.next < cues.length && progress + 1e-6 >= cues[reload.next].at) {
      const cue = cues[reload.next++];
      reloadCue(cue.type, caliber);
      logSound('reload:cue', { cue: cue.type, kind, progress });
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

  function onMode(type: string, payload: Record<string, unknown>): void {
    const mode = getGameMode?.() || 'standard';
    const perspective = getObjectiveTeam?.();
    const ours = perspective === 'alpha' || perspective === 'bravo' ? perspective : objectiveTeam(playerTeam);
    const team = payload.team === 'alpha' || payload.team === 'bravo' ? payload.team : null;
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
        play('ui_flag_taken');
        say(team === ours ? 'flag_taken_theirs' : 'flag_taken_ours', { delayS: 0.25 });
        break;
      case 'flag_captured':
        if (team === ours) { play('ui_flag_captured'); say('flag_captured', { delayS: 0.3 }); } else play('ui_objective_loss');
        break;
      case 'flag_returned':
        play('ui_flag_returned');
        if (team === ours) say('flag_returned', { delayS: 0.3 });
        break;
      case 'flag_dropped':
        play('ui_flag_dropped');
        break;
      case 'wave_started':
        // The Horde's waves come on the air-raid siren; the Frontline's counter-attacks under a barrage.
        play(mode === 'endless_horde' ? 'mode_horde_siren' : mode === 'frontline_assault' ? 'mode_frontline_barrage' : 'sting_wave');
        say('wave_incoming', { delayS: 0.6 });
        break;
      case 'wave_cleared':
        play(mode === 'endless_horde' ? 'mode_horde_all_clear' : 'ui_wave_clear');
        say('wave_cleared', { delayS: 0.4 });
        break;
      case 'line_advanced':
        // The line moves forward behind its own guns.
        play(mode === 'frontline_assault' ? 'mode_frontline_barrage' : 'ui_line_advance');
        say('line_advanced', { delayS: 0.4 });
        break;
      case 'pickup_spawned': {
        // A cache arrives (Horde repair and ammunition, Gravity boosts): heard where it lands.
        const x = Number(payload.x), z = Number(payload.z);
        if (Number.isFinite(x) && Number.isFinite(z)) play('cache_drop', { x, y: Number(payload.y) || frame.y, z, delayS: 0.15 });
        // Our AC-130's own drop: the crew calls it away.
        if (payload.airDrop === true && byMe) say(payload.kind === 'heal' ? 'supply_repair' : 'supply_ammo', { delayS: 0.2 });
        break;
      }
      case 'goal_scored':
        if (team === ours) { play('ui_goal'); say('goal_scored', { delayS: 0.2 }); } else play('ui_objective_loss');
        break;
      case 'ball_hit':
        if (byMe) play('ui_ball_hit', { space: 'flat', gainDb: -6 });
        break;
      case 'pickup_collected':
        if (byMe) { play('ui_pickup'); say('pickup_collected', { delayS: 0.2 }); }
        break;
      case 'destruction_scored':
        if (team === ours) play('ui_score');
        break;
      case 'respawn':
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
      case 'infected':
        // Infected: our crew has been turned to the other side.
        if (payload.id === playerId) { play('sting_infected'); play('radio_interference', { space: 'flat', bus: 'voice', gainDb: -4 }); }
        break;
      case 'weapon_advanced':
        // Gun Game: the crew changes over to the next weapon on the ladder and loads it.
        if (payload.id === playerId) weaponChangeover(Number(payload.stage));
        break;
      default:
        break;
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
    if (alarmHeartbeat && combat && combat.maxHp > 0 && !battleOver) {
      const frac = combat.hp / combat.maxHp;
      if (frac > 0.25) heartbeatBelow = 0;
      else if (heartbeatBelow === 0 || frac < heartbeatBelow - 0.05) {
        heartbeatBelow = frac;
        heartbeatRig?.stop();
        heartbeatRig = loopRig('heartbeat_loop', { maxDurS: 6 });
      }
    }
    // First move after rollout.
    if (rolledOut && !movedOnce && Math.abs(state.speed) > 2.5) {
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
    // Deep water.
    const info = surfaceCache.get(entity.id);
    const deep = !!info && info.depth > 1.25;
    if (deep && !wasDeep) {
      play('water_enter', hullOptions({ bus: 'own' }));
      say('taking_water', { delayS: 0.5 });
      if (info && info.depth > 1.8) play('engine_flood', hullOptions({ delayS: 0.6 }));
    }
    wasDeep = deep;
    // Stuck: full throttle, no progress, on the ground. Never while our throttle flies the drone (the tank sits
    // still under it), in the gunship, or before the battle rolls out.
    const throttle = Math.abs(entity.input?.throttle ?? 0);
    const throttleDrivesTank = rolledOut && !entity.aerial?.active && entity.aerial?.kind !== 'gunship';
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
    // more), not the servo settling; and a damaged ring's grind.
    const traverse = Math.abs(state.turretYawRate ?? 0);
    if (traverse > 0.12) {
      const before = slewS;
      slewS += dt;
      // The drive takes up the turret's weight: one start per real slew, never per servo flicker.
      if (before < 0.1 && slewS >= 0.1 && now - lastTurretStartAt > 0.8) {
        lastTurretStartAt = now;
        play('turret_start', hullOptions({ gainDb: -6 }));
      }
    } else if (traverse < 0.02) {
      if (slewS > 0.25 && now - lastTurretStopAt > 0.6) {
        lastTurretStopAt = now;
        play('turret_stop', hullOptions({ gainDb: -4 }));
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

  function updateTeamCounts(): void {
    if (!playerId || phase !== 'battle' || battleOver || !rolledOut) return;
    const me = tanks.get(playerId);
    if (!me || !me.alive) return;
    let allies = 0;
    let enemies = 0;
    for (const info of tanks.values()) {
      if (!info.alive) continue;
      if (info.team === me.team) allies++; else enemies++;
    }
    if (tanks.size < 4) return;
    if (allies === 1 && enemies > 0 && !lastStanding.mine) { lastStanding.mine = true; say('last_tank', { delayS: 0.8 }); }
    if (enemies === 1 && !lastStanding.theirs) { lastStanding.theirs = true; say('last_enemy', { delayS: 0.8 }); }
    if (enemies >= 3 && enemies >= allies * 2 && !lastStanding.outnumbered) { lastStanding.outnumbered = true; say('outnumbered', { delayS: 0.6 }); }
  }

  // ------------------------------------------------------------ vehicle rigs ---

  function identityFor(entity: AudioEntity): VehicleAudioIdentity {
    const spec = entity.spec || {};
    return resolveVehicleAudioIdentity({ ...spec, id: entity.specId ?? spec.id });
  }

  function indexTanks(list: readonly RuntimeValue[], dt: number): void {
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      if (!entity) continue;
      let info = tanks.get(entity.id);
      const p = entity.state.pos;
      if (!info) {
        info = {
          team: String(entity.team ?? ''), isPlayer: !!entity.isPlayer, pos: p, lastX: p.x, lastY: p.y, lastZ: p.z,
          vx: 0, vy: 0, vz: 0, identity: identityFor(entity), nation: String(entity.spec?.nation ?? ''), alive: !entity.combat?.destroyed, spotted: false,
        };
        tanks.set(entity.id, info);
      }
      info.team = String(entity.team ?? info.team);
      info.isPlayer = !!entity.isPlayer;
      const nation = String(entity.spec?.nation ?? '');
      const nationChanged = info.nation !== nation;
      info.nation = nation;
      info.pos = p;
      if (dt > 1e-4) {
        const k = clamp(dt / 0.15, 0, 1);
        info.vx += ((p.x - info.lastX) / dt - info.vx) * k;
        info.vy += ((p.y - info.lastY) / dt - info.vy) * k;
        info.vz += ((p.z - info.lastZ) / dt - info.vz) * k;
      }
      info.lastX = p.x; info.lastY = p.y; info.lastZ = p.z;
      info.alive = !entity.combat?.destroyed;
      if (entity.isPlayer && playerId !== entity.id) {
        playerId = entity.id;
        playerTeam = info.team;
        loaderKind = info.identity.loader;
        applyCrewLanguage();
        preloadVehicle(info.identity);
      } else if (entity.isPlayer && nationChanged) applyCrewLanguage();
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
    void library.load(ids);
  }

  /** QA override (debug surface only): audition one crew pack in any battle. */
  let forcedCrewLanguage: CrewLanguage | null = null;

  function applyCrewLanguage(): void {
    if (!radio) return;
    const nation = playerId ? tanks.get(playerId)?.nation : null;
    radio.setLanguage(forcedCrewLanguage ?? resolveCrewLanguage(nation, crewVoice));
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
      if (!aerialWarmed) { aerialWarmed = true; library.pin(AERIAL_SET); void library.load(AERIAL_SET); }
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
      toListenerFrame(frame, p.x, p.y, p.z, aerialFrame.rel);
      let rig = droneRigs.get(shell.id);
      if (!rig) {
        if (aerialFrame.rel.distance > 520) continue;
        if (!aerialWarmed) { aerialWarmed = true; library.pin(AERIAL_SET); void library.load(AERIAL_SET); }
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
  }

  function stopWorld(reason: string): void {
    stopAerial();
    for (const [id, rig] of rigs) { rig.kill(0.3); logSound('engine:stop', { id, reason }); }
    rigs.clear();
    surfaceCache.clear();
    for (const wreck of wrecks) {
      const doomed = new Set(wreck.voices.filter(Boolean));
      pool?.stop((v) => doomed.has(v), 0.4);
    }
    wrecks.length = 0;
    pool?.stop((v) => v.end === Infinity, 0.4);
    probeSolo = null;
  }

  // ---------------------------------------------------------------- snapshots ---

  function chooseSnapshot(): void {
    if (!mixer) return;
    if (phase !== 'battle') { mixer.setSnapshot('garage', 0.4); return; }
    if (paused) { mixer.setSnapshot('paused', 0.2); return; }
    if (killcam) { mixer.setSnapshot('killcam', 0.15); return; }
    const me = playerId ? tanks.get(playerId) : null;
    if (listenerKind === 'spectated-tank' || (me && !me.alive)) { mixer.setSnapshot('spectating', 0.5); return; }
    mixer.setSnapshot(listenerScoped ? 'scoped' : 'battle', listenerScoped ? 0.18 : 0.3);
  }

  // -------------------------------------------------------------- scenes ---

  function applyScene(): void {
    if (!ambience || !mixer || !pool) return;
    bellTowers = null;
    if (phase === 'battle') {
      const mapId = getMapId?.() || 'verdant';
      scene = sceneForMap(mapId);
      atmosphere = atmosphereForMap(mapId);
      pool.setAtmosphere(atmosphere);
      if (ambientWanted) ambience.play(scene, true);
    } else {
      scene = GARAGE_SCENE;
      atmosphere = atmosphereForMap(null);
      pool.setAtmosphere(atmosphere);
      ambience.play(GARAGE_SCENE, false);
    }
  }

  // ------------------------------------------------------------- public API ---

  function resume(): void {
    if (!ctx) {
      const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AC = scope.AudioContext || scope.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    if (mixer) return;
    mixer = createMixer({ context: ctx, reverb: budget.reverb, channelVolumes: chan, masterVolume, muted });
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    library = createAssetLibrary({ context: ctx, base, lowMemory: tier === 'mobile', maxDecodedMb: budget.maxDecodedMb, maxVariants: budget.maxVariants });
    pool = createVoicePool({ mixer, library, random, budget: budget.voices, reverb: budget.reverb });
    pool.setOcclusionProbe((x, y, z) => occlusionAt(x, y, z));
    radio = createCrewRadio({ mixer, library, random });
    // Bells wait for the rollout: the countdown's frozen pre-battle (and every probe that holds a battle there) never tolls.
    ambience = createAmbienceDirector({ mixer, library, pool, random, getBellTowers: currentBellTowers, bellsAllowed: () => rolledOut });
    library.pin([...UI_SET, ...RADIO_SET]);
    void library.load([...UI_SET, ...RADIO_SET]);
    // A battle hull may already be indexed (late adoption mid-battle).
    if (playerId || crewVoice !== 'national') applyCrewLanguage();
    installDebugSurface();
    applyScene();
    chooseSnapshot();
    // Adopted after the battle phase edge: warm the battle set now (its edge has passed).
    if (phase === 'battle') void warmBattle();
  }

  /** The garage's and menus' controls (interfaceSounds.ts classifies the pressed element). */
  const INTERFACE_ASSET: Readonly<Record<InterfaceSound, string>> = Object.freeze({
    click: 'ui_click', tab: 'ui_tab', select: 'ui_toggle', toggle: 'ui_toggle', slider: 'ui_slider',
    back: 'ui_back', confirm: 'ui_confirm', vehicle: 'ui_tank_select',
  });
  let lastInterfaceAt = -1;

  /** One interface sound per press: a control's own 'ui:click' never doubles the delegated one. */
  function interfaceOnce(): boolean {
    if (!ctx) return false;
    if (ctx.currentTime - lastInterfaceAt < 0.09) return false;
    lastInterfaceAt = ctx.currentTime;
    return true;
  }

  function interfaceSound(sound: InterfaceSound, inMenu: boolean): void {
    if (!ready() || (phase === 'battle' && !inMenu) || !interfaceOnce()) return;
    play(INTERFACE_ASSET[sound]);
  }

  function uiClick(): void {
    if (!interfaceOnce()) return;
    play('ui_click');
  }

  /** The collapse pieces' landings listener (one at a time: a rebind replaces it). */
  let collapseImpactsDetach: (() => void) | null = null;

  function bindBus(bus: EventBus): void {
    const on = <T>(event: string, listener: (payload: T) => void): void => {
      bus.on(event, (payload) => { if (ready()) listener(payload as T); });
    };
    on<{ id: string; x: number; y: number; z: number; caliberMm: number }>('auxiliary:fired', (e) => {
      if (phase === 'battle' && !battleOver) fireWeapon([e.x, e.y, e.z], e.caliberMm, null, isOwn(e.id));
    });
    on<ShellFiredEvent>('shell:fired', onShellFired);
    on<ShellFiredEvent>('weapon:predicted', onPredictedWeapon);
    on<ShellHitEvent>('shell:hit', onShellHit);
    on<ShellExpiredEvent>('shell:expired', onShellExpired);
    on<TankDestroyedEvent>('tank:destroyed', (e) => { onTankDestroyed(e); updateTeamCounts(); });
    on<TankImpactEvent>('tank:impact', onTankImpact);
    on<TankRamEvent>('tank:ram', (e) => onTankRam(e));
    on<PropEvent>('prop:crushed', (e) => onProp(e, false));
    // destruction-fx lane: a building crossing a stage (DESTRUCTION.md §11); a settled stage is laid down silently
    on<StructureStageEvent>('structure:stage', (e) => {
      if (!e || e.settled) return;
      for (const l of structureStageSounds(e.stage)) {
        play(l.id, { x: e.x, y: e.y, z: e.z, delayS: l.delayS + (l.jitterS > 0 ? random() * l.jitterS : 0), gainDb: l.gainDb });
      }
    });
    // (dcore 2026-10-10) a collapsing building's pieces land where their bodies hit (fx/collapseBodies.ts): each heard in
    // its material from the recorded catalog (collapseImpacts.ts), sized by the blow
    collapseImpactsDetach?.();
    collapseImpactsDetach = onCollapseImpact((x, y, z, speed, mass, material) => {
      if (!ready()) return;
      const layers = collapseImpactLayers(speed, mass, material);
      if (layers) for (const l of layers) play(l.id, { x, y, z, delayS: l.delayS, gainDb: l.gainDb });
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
      if (!e || phase !== 'battle' || playerTeam == null || e.team !== playerTeam) return;
      const info = tanks.get(e.id);
      if (!info || info.team === playerTeam || e.spotterId !== playerId) return;
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
      if (phase !== 'battle' || battleOver) return;
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
      if (!e || phase !== 'battle' || battleOver) return;
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
    // a press while the drone is still recharging is refused.
    on<undefined>('ui:drone', () => {
      const view = latestPlayer?.aerial;
      if (phase === 'battle' && view?.kind === 'drone' && !view.active && (view.cooldownS ?? 0) > 0) play('ui_error');
    });
    // The optics' sensor changing (the tank sight or the drone and gunship cameras).
    on<undefined>('ui:visionChanged', () => { if (phase === 'battle') play('zoom_step', hullOptions({ gainDb: -6 })); });
    on<{ id?: string }>('service:medal', (e) => { if (e?.id && THINK_MEDALS.has(e.id)) requestThink(); });
    on<{ isPlayer?: boolean }>('shell:fired', (e) => {
      if (!e?.isPlayer || firstShotHeard || phase !== 'battle') return;
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
    on<{ pos?: Vec3; size?: number }>('atmosphere:artillery', (e) => { if (e?.pos) play('distant_artillery', { ...at(e.pos), gainDb: gainToDb(clamp(e.size ?? 0.6, 0.3, 1.4)) }); });
    on<{ pos?: Vec3; delayS?: number }>('atmosphere:flak', (e) => { if (e?.pos) play('distant_flak', { ...at(e.pos), delayS: Math.max(0, e.delayS ?? 0) }); });
    on<{ pos?: Vec3; shots?: number; gapS?: number }>('atmosphere:aa', (e) => { if (e?.pos) play('distant_mg', at(e.pos)); });
    on<{ p0?: Vec3; v?: Vec3; durationS?: number; aircraft?: string }>('atmosphere:flyover', (e) => {
      if (!e?.p0 || !e.v) return;
      const half = clamp(e.durationS ?? 20, 4, 60) / 2;
      play(flyoverAsset(e.aircraft), { x: e.p0[0] + e.v[0] * half, y: e.p0[1] + e.v[1] * half, z: e.p0[2] + e.v[2] * half, propagate: false, delayS: Math.max(0, half - 3.5) });
    });
    on<ReloadEvent>('player:reload', onReload);
    on<{ phase?: string }>('phase:change', (e) => {
      const next = e?.phase || 'garage';
      const prev = phase;
      phase = next;
      battleOver = false;
      pendingResult = null;
      reloadCalled = false;
      reload.active = false;
      reload.plan = null;
      if (next === 'battle' && prev !== 'battle') {
        void warmBattle();
        stopWorld('battle-reset');
        tanks.clear();
        moduleStates.clear();
        playerId = null;
        playerTeam = null;
        rolledOut = false;
        bossId = null;
        bossChecked = false;
        movedOnce = false;
        lowHpCalled = false;
        ammoLowCalled = false;
        lastStanding = { mine: false, theirs: false, outnumbered: false };
        heartbeatBelow = 0;
        lastSmokeBorn = -1;
        auxGunOn = null;
        auxLights = null;
        thinkStage = 'idle';
        thinkUntil = 0;
        thoughtThisBattle = false;
        firstShotHeard = false;
        radio?.setRadioDamage(0);
        applyScene();
        startEngineSoon = true;
      } else if (next !== 'battle' && prev === 'battle') {
        // Leaving from the pause menu or a kill-cam must not carry their mix into the next battle.
        paused = false;
        killcam = false;
        loadingOn(false);
        stopWorld(`phase:${next}`);
        fireAlarm?.stop(); fireAlarm = null;
        heartbeatRig?.stop(); heartbeatRig = null;
        radio?.silence();
        playerBurning = false;
        listenerOwnerId = null;
        listenerScoped = false;
        applyScene();
      } else if (next === 'garage' && prev !== 'garage') {
        loadingOn(false);
        applyScene();
      }
      chooseSnapshot();
    });
    on<undefined>('battle:rollout', () => {
      if (phase !== 'battle' || battleOver) return;
      rolledOut = true;
      const mode = getGameMode?.() || 'standard';
      if (mode !== 'realistic') {
        const opener = MODE_OPENER[mode] ?? 'sting_battle';
        play(opener, opener === 'gunship_flyover' ? { space: 'flat', bus: 'environment' } : undefined);
      }
      // The commander buttons up as the column moves off (a gunship crew has no hatch).
      if (latestPlayer?.aerial?.kind !== 'gunship') play('hatch', hullOptions({ gainDb: -4, delayS: 0.15 }));
      play('ui_countdown_go', { gainDb: -6 });
      say('battle_start', { delayS: 0.5 });
    });
    on<{ result?: ResultKind }>('battle:ended', (e) => {
      if (battleOver) return;
      battleOver = true;
      pendingResult = e?.result || 'draw';
      radio?.cancelPending(['shot_result'], true);
      fireAlarm?.stop(); fireAlarm = null;
    });
    on<{ result?: ResultKind }>('battle:presented', (e) => {
      const result = e?.result || pendingResult || 'draw';
      play(result === 'victory' ? 'sting_victory' : result === 'defeat' ? 'sting_defeat' : 'sting_draw');
      if (radio) radio.say(result, { delayS: 0.4 });
      pendingResult = null;
    });
    on<undefined>('killcam:begin', () => { killcam = true; chooseSnapshot(); play('killcam_in'); });
    on<undefined>('killcam:done', () => { killcam = false; chooseSnapshot(); play('killcam_out'); });
    on<{ pos: Vec3; cause?: string; timeScale?: number }>('killcam:impact', (e) => {
      if (!e?.pos) return;
      const slowRate = clamp(e.timeScale ?? 0.55, 0.25, 1);
      onTankDestroyed({ id: '__killcam__', pos: e.pos, cause: e.cause }, true, slowRate);
      killcamLog.push({ t: ctx?.currentTime ?? 0, cause: e.cause || 'shot', slowRate, baked: !!library?.has('tank_explode') });
      if (killcamLog.length > 32) killcamLog.shift();
    });
    on<ShellFiredEvent & { shooterId?: string }>('killcam:shot', (e) => {
      if (!e?.muzzlePos) return;
      fireWeapon(e.muzzlePos, e.caliberMm, e.weaponSound, !!e.isPlayer, e.muzzleIndex, true);
      logSound('killcam:shot', { shooterId: e.shooterId, caliberMm: e.caliberMm });
    });
    on<TankRamEvent>('killcam:collision', (e) => onTankRam(e, true));
    on<{ on?: boolean }>('ui:pause', (e) => { paused = !!e?.on; chooseSnapshot(); });
    // Preferences are state, so retain them even before the first audio gesture.
    bus.on('ui:volumes', (payload) => {
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
    for (const type of ['zone_captured', 'zone_contested', 'flag_taken', 'flag_captured', 'flag_returned', 'flag_dropped', 'wave_started', 'wave_cleared',
      'line_advanced', 'goal_scored', 'ball_hit', 'pickup_collected', 'pickup_spawned', 'destruction_scored', 'respawn', 'infected', 'weapon_advanced']) {
      on<Record<string, unknown>>(`mode:${type}`, (payload) => onMode(type, payload || {}));
    }
  }

  let volumeEvents = 0;
  let startEngineSoon = false;
  let lastPlayerYaw: number | null = null;
  let latestPlayer: AudioEntity | null = null;

  function onShellSelect(slot: number | undefined): void {
    if (slot == null || phase !== 'battle') return;
    const shells = latestPlayer?.spec?.gun?.shells;
    const shell = shells?.[slot];
    if (latestPlayer?.aerial?.kind === 'gunship') play('gunship_weapon_select', hullOptions());
    else if (loaderKind === 'carousel' || loaderKind === 'bustle') play('autoloader_carousel', hullOptions({ gainDb: -4, maxDurS: 1.2 }));
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
    if (!ready() || !mixer || !pool || !ctx) return;
    frame.x = listener.pos.x;
    frame.y = listener.pos.y;
    frame.z = listener.pos.z;
    const fl = Math.hypot(listener.forward.x, listener.forward.z);
    if (fl > 1e-3) { frame.fx = listener.forward.x / fl; frame.fz = listener.forward.z / fl; }
    listenerKind = listener.kind || 'camera';
    listenerOwnerId = listener.ownerId ?? null;
    listenerScoped = !!listener.scoped && listenerKind !== 'killcam-camera';
    listenerValid = true;
    pool.setListener(frame);
    if (listenerScoped !== wasScoped) {
      // Track the edge everywhere so a garage trip never leaves a stale scope state.
      if (phase === 'battle') play(listenerScoped ? 'scope_in' : 'scope_out', hullOptions({ gainDb: -8 }));
      wasScoped = listenerScoped;
    }
    const now = ctx.currentTime;
    pool.prune(now);
    mixer.update(dt);
    radio?.update();
    updateThink(now);
    if (list) {
      indexTanks(list, dt);
      if (playerId) {
        for (let i = 0; i < list.length; i++) {
          const entity = toEntity(list[i]);
          if (entity && entity.id === playerId) { latestPlayer = entity; lastPlayerYaw = entity.state.yaw ?? null; break; }
        }
      }
      if (phase === 'battle') {
        updateRigs(list, dt);
        updateAerial(list, shells, dt);
        trackOwnSystems();
        if (startEngineSoon && playerId) {
          const rig = rigs.get(playerId);
          if (rig) { rig.startEngine(); startEngineSoon = false; }
        }
        updateTeamCounts();
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

  /**
   * Decode and pin a battle's sound set: every report bank, the combat,
   * hull, interface and mode sets, the map's scene, running gear and the
   * roster's powertrains (or one band of every family when the roster is
   * unknown). Runs at every battle phase edge whatever the entry path (solo
   * loader, multiplayer, debug start), so no first shot is silent while its
   * bank decodes; the solo loader also awaits it before the reveal.
   */
  function warmBattle(roster?: readonly string[]): Promise<void> {
    if (!library) return Promise.resolve();
    const ids = new Set<string>(CORE_BATTLE);
    for (const id of UI_SET) ids.add(id);
    for (const id of PLAYER_HULL) ids.add(id);
    for (const id of MODE_SET) ids.add(id);
    // Every report bank: any calibre may appear (roof guns, mixed rosters, network joins).
    for (const id of Object.values(WEAPON_CLOSE)) ids.add(id);
    // Every prop's sound (propSounds.ts): the first pole, cart or drum a hull meets is never silent while it decodes.
    for (const id of propSoundAssets()) ids.add(id);
    const mapId = getMapId?.() || 'verdant';
    for (const id of sceneAssets(sceneForMap(mapId), true)) ids.add(id);
    for (const specId of roster || []) {
      const identity = resolveVehicleAudioIdentity({ id: specId });
      for (const band of ['idle', 'low', 'mid', 'high', 'start', 'stop']) ids.add(`engine_${identity.engine}_${band}`);
    }
    // The mode's opener plays at rollout, decoded by then; the aircraft modes fly from their first second.
    const mode = getGameMode?.() || 'standard';
    if (MODE_OPENER[mode]) ids.add(MODE_OPENER[mode]);
    if (mode === 'drone' || mode === 'ac130') { for (const id of AERIAL_SET) ids.add(id); aerialWarmed = true; }
    // A battle always has some running gear on the ground under it.
    for (const cls of ['light', 'heavy']) for (const s of ['earth', 'hard']) for (const v of ['slow', 'fast']) ids.add(`tracks_${cls}_${s}_${v}`);
    if (!roster?.length) for (const family of ENGINE_FAMILY_IDS) ids.add(`engine_${family}_mid`);
    // The battle set stays decoded for the whole battle (rigs and scenes pin their own loops).
    library.pin(ids, true);
    return library.load(ids);
  }

  function loadingOn(on: boolean): void {
    if (!mixer || !pool) return;
    if (on && !loadingActive) {
      loadingActive = true;
      loading = loopRig('loading_bed_loop');
      play('ui_deploy', { gainDb: -3 });
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
      get voicesLoaded() { return !!radio && !!library?.voiceReady(radio.language); },
      get crewLanguage() { return radio?.language ?? null; },
      get sfxLog() { return pool?.log ?? []; },
      get sfxLoaded() { return !!library?.supported && (library?.stats().assets ?? 0) > 0; },
      get sfxCount() { return library?.stats().assets ?? 0; },
      get killcamSfxLog() { return killcamLog; },
      get soundLog() { return soundLog; },
      get loadingActive() { return !!loading; },
      get snapshot() { return mixer?.snapshot ?? null; },
      get tier() { return tier; },
      library: () => library?.stats() ?? null,
      /** Resolves when every sound and voice load in flight has settled (receipts await the real load, never ticks). */
      libraryIdle: () => library?.idle() ?? Promise.resolve(),
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
        return { ...g, engine, sfx, music, chanVol: { ...chan }, pauseK: paused ? 0 : 1, duckK: killcam ? 0.35 : 1, uiVolEvents: volumeEvents, snapshot: mixer.snapshot };
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
      if (!library) return;
      // Battle entry waits for the decode, but never longer than the loader's patience.
      return Promise.race([warmBattle(roster), new Promise<void>((resolve) => setTimeout(resolve, 3500))]);
    },
    ambientOn(on) {
      ambientWanted = !!on;
      if (!ready() || !ambience) return;
      if (on) applyScene();
      else if (phase === 'battle') ambience.stop(0.5);
    },
  };
}
