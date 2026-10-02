/**
 * src/audio/audioEngine.ts — the Claude of Tanks sound engine (SFX r5).
 *
 * Sample-driven, event-directed and physically placed:
 *   - ~350 generated sound assets (tools/audio/sfx-catalog.mjs, ElevenLabs
 *     sound-effects model, mastered by tools/audio/build-sfx.mjs) loaded in
 *     lazy groups — the battle roster's powertrains and guns, the map's scene,
 *     the core combat set — with procedural fallbacks while they decode;
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
  atmosphereForMap, clamp, dbToGain, dopplerRatio, gainToDb, mulberry32, propagationDelayS, rampBetween,
  toListenerFrame, distanceAttenuationDb, panFromRelative,
  type AtmosphereProfile, type ListenerFrame, type RelativePosition,
} from './audioMath.ts';
import { createAssetLibrary, type AssetLibrary } from './assetLibrary.ts';
import { createMixer, type Mixer } from './mixer.ts';
import { createVoicePool, type PlayOptions, type VoicePool } from './voicePool.ts';
import { createCrewRadio, type CrewRadio } from './crewRadio.ts';
import { createAmbienceDirector, sceneAssets, type AmbienceDirector } from './ambienceDirector.ts';
import { GARAGE_SCENE, sceneForMap, type EnvironmentScene } from './environmentScenes.ts';
import { BUDGETS, BUS_LEVELS, CONCUSSION, OWN_HIT_FOCUS, SNAPSHOTS, VEHICLE_LOD, type DeviceTier, type SettingsChannel } from './mixPolicy.ts';
import {
  ammoRackBeep, createNoiseBank, fireKlaxon, heartbeat, loadingBed, subThump, synthBoom, synthClick,
  synthImpact, synthShot, type NoiseBank, type Rig,
} from './procedural.ts';
import { createVehicleRig, fillVehicleInput, type RigFrame, type RigLod, type VehicleRig } from './vehicleRig.ts';
import { resolveVehicleAudioIdentity, CREW_LANGUAGES, ENGINE_FAMILY_IDS, type CrewLanguage, type VehicleAudioIdentity } from './vehicleAudioProfiles.ts';
import type { ModuleHealth, SurfaceId, VehicleAudioInput } from './vehicleAudioModel.ts';
import { resolveReloadCuePlan, resolveWeaponReport, type ReloadCuePlan, type ReloadCueType, type WeaponClassId } from './weaponAudio.ts';
import { isCrewVoiceSetting, resolveCrewLanguage, type CrewVoiceSetting } from './voiceLines.ts';

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
  getTerrain?(): AudioTerrainProbe | null;
  initialPhase?: string;
  tier?: DeviceTier;
}

export interface AudioMixer {
  resume(): void;
  bindBus(bus: EventBus): void;
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[]): void;
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
  combat?: {
    destroyed?: boolean;
    hp: number;
    maxHp: number;
    modules?: Partial<Record<string, { state?: string }>>;
    ammo?: readonly number[];
    ammoCapacity?: readonly number[];
    shellSlot?: number;
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

interface ShellExpiredEvent { shellId?: number; shooterId?: string; hitTerrain?: boolean; hitKind?: string; surfaceKind?: string; caliberMm?: number; pos?: Vec3 }
interface TankDestroyedEvent { id: string; killerId?: string | null; pos: Vec3; cause?: string }
interface ModuleStateEvent { id: string; module: string; state: string; source?: string; repaired?: boolean }
interface TankImpactEvent { id?: string; pos: Vec3; speedMps: number }
interface TankRamEvent { aId?: string; bId?: string; aIsPlayer?: boolean; bIsPlayer?: boolean; pos: Vec3; closingMps?: number; dmgA?: number; dmgB?: number }
interface PropEvent { id?: string; kind?: string; pos: Vec3; h?: number; cause?: string; speedMps?: number }
interface ReloadEvent { total?: number; kind?: string; caliberMm?: number; t?: number; progress?: number; done?: boolean }
interface VolumeEvent { master?: number; engine?: number; combat?: number; ambience?: number; ui?: number; voice?: number; alarmHeartbeat?: boolean; crewVoice?: string; concussion?: boolean }
interface SmokeScreen { born?: number; x?: number; y?: number; z?: number; source?: readonly unknown[] }

// ------------------------------------------------------------------ engine ---

const WEAPON_CLOSE: Readonly<Record<WeaponClassId, string>> = Object.freeze({
  mg_rifle: 'mg_rifle_close', mg_heavy: 'mg_heavy_close',
  ac_20: 'ac_20_close', ac_25: 'ac_25_close', ac_30: 'ac_30_close', ac_40: 'ac_40_close', ac_50: 'ac_50_close',
  gun_90: 'gun_90_close', gun_105: 'gun_105_close', gun_120: 'gun_120_close', gun_125: 'gun_125_close',
  gun_130: 'gun_130_close', gun_152: 'gun_152_close', atgm: 'atgm_launch', rocket_heavy: 'rocket_salvo',
});

const WEAPON_FAR: Readonly<Record<WeaponClassId, string>> = Object.freeze({
  mg_rifle: 'mg_far', mg_heavy: 'mg_far',
  ac_20: 'ac_far_light', ac_25: 'ac_far_light', ac_30: 'ac_far_light', ac_40: 'ac_far_heavy', ac_50: 'ac_far_heavy',
  gun_90: 'gun_far_light', gun_105: 'gun_far_light', gun_120: 'gun_far_medium', gun_125: 'gun_far_medium',
  gun_130: 'gun_far_heavy', gun_152: 'gun_far_heavy', atgm: 'ac_far_light', rocket_heavy: 'gun_far_heavy',
});

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
  'track_skid_loop', 'water_wade_loop', 'water_enter', 'engine_knock_loop', 'engine_stall', 'turret_stop',
  'tail_open', 'tail_forest', 'tail_urban', 'tail_mountain', 'gun_far_light', 'gun_far_medium', 'gun_far_heavy',
  'ac_far_light', 'ac_far_heavy', 'mg_far', 'mg_rifle_close', 'mg_heavy_close', 'smoke_launcher', 'smoke_burst',
  'radio_interference', 'ui_alert',
  'sting_battle', 'distant_artillery', 'distant_flak', 'distant_mg', 'jet_flyover',
];

const PLAYER_HULL = [
  'breech_open', 'breech_close', 'case_eject_brass', 'case_eject_stub', 'shell_grab', 'shell_ram', 'autoloader_carousel',
  'autoloader_lift', 'autoloader_chain_ram', 'bustle_index', 'ac_feed', 'magazine_swap', 'missile_tube_load', 'latch_ready',
  'gun_interior_medium', 'gun_interior_large', 'gun_interior_heavy', 'repair_kit', 'first_aid', 'extinguisher',
  'ammo_select', 'missile_mode', 'dry_fire', 'gun_limit', 'traverse_grind_loop', 'rollover', 'overturned_groan',
  'engine_flood', 'bubbles_loop', 'hull_debris_patter', 'scope_in', 'scope_out', 'lock_on', 'lock_off',
  'missile_warning', 'roof_gun_servo', 'tinnitus', 'hydro_susp', 'jump_launch', 'self_right', 'hatch', 'switch_toggle',
];

const UI_SET = [
  'ui_click', 'ui_toggle', 'ui_back', 'ui_confirm', 'ui_error', 'ui_tab', 'ui_tank_select', 'ui_deploy',
  'ui_slider', 'ui_ready', 'sting_garage',
];

const MODE_SET = [
  'ui_capture_tick', 'ui_objective_gain', 'ui_objective_loss', 'ui_pickup', 'ui_goal', 'ui_ball_hit', 'ui_respawn',
  'ui_flag_taken', 'ui_flag_captured', 'ui_flag_returned', 'ui_flag_dropped', 'ui_wave_clear', 'ui_line_advance',
  'ui_score', 'sting_wave', 'sting_victory', 'sting_defeat', 'sting_draw', 'killcam_in', 'killcam_out', 'spectate_switch',
  'ui_countdown_tick', 'ui_countdown_go',
];

function detectTier(): DeviceTier {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { deviceMemory?: number } : null;
  if (!nav) return 'desktop';
  const touch = (nav.maxTouchPoints || 0) > 1 && /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '');
  return touch || (nav.deviceMemory != null && nav.deviceMemory <= 4) ? 'mobile' : 'desktop';
}

export function createAudio({
  context: initialContext = null,
  getMapId,
  getTerrain,
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
  let noise: NoiseBank | null = null;
  const random = mulberry32(0x7a11c);

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
      if (isCrewVoiceSetting(s.crewVoice)) crewVoice = s.crewVoice;
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
  let movedOnce = false;
  let lowHpCalled = false;
  let ammoLowCalled = false;
  let lastStanding = { mine: false, theirs: false, outnumbered: false };
  let lastKillAt = -99;
  let lastSpots: number[] = [];
  let lastSpotCallAt = -99;
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
  let lastPitch: number | null = null;
  let lastSmokeBorn = -1;
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
    return !!pool.play(id, options);
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

  function say(id: string, options?: Parameters<CrewRadio['say']>[1]): void {
    if (!radio || phase !== 'battle') return;
    if (playerId != null && tanks.get(playerId)?.alive === false && id !== 'victory' && id !== 'defeat' && id !== 'draw') return;
    radio.say(id, options);
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

  function fireWeapon(pos: Vec3, caliberMm: number, soundProfile: string | null | undefined, own: boolean, muzzleIndex = -1, cinematic = false): void {
    if (!ready()) return;
    const report = resolveWeaponReport(caliberMm, soundProfile);
    const cls = report.cls;
    const [x, y, z] = pos;
    const distance = own ? 2 : distanceTo(x, y, z);
    const close = WEAPON_CLOSE[cls.id];
    const far = WEAPON_FAR[cls.id];
    const closeK = own ? 1 : 1 - rampBetween(distance, cls.closeFadeM[0], cls.closeFadeM[1]);
    const farK = own ? 0.35 : rampBetween(distance, cls.farFadeM[0], cls.farFadeM[1]);
    const bus = cinematic ? 'cinematic' as const : own ? 'ownCombat' as const : undefined;
    const base: PlayOptions = { x, y, z, rate: report.rate, gainDb: report.gainDb, ...(bus ? { bus } : {}) };
    if (own) { base.propagate = false; base.priority = 95; }
    const closePlayed = closeK > 0.03 && play(close, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(closeK) + (own ? 1.5 : 0) });
    const farPlayed = farK > 0.03 && play(far, { ...base, gainDb: (base.gainDb ?? 0) + gainToDb(farK) });
    // A report whose close bank is still decoding must not read as distant.
    const played = (closePlayed || closeK <= 0.4) && (closePlayed || farPlayed);
    if (report.twin) play(close, { ...base, delayS: 0.016, rate: report.rate * (muzzleIndex === 1 ? 1.04 : 0.97), gainDb: (base.gainDb ?? 0) + gainToDb(Math.max(closeK, 0.05)) - 2 });
    if (cls.family !== 'mg' && scene.tail !== 'none') {
      play(`tail_${scene.tail}`, { ...base, rate: cls.tailRate * report.rate, delayS: 0.035 + random() * 0.02, gainDb: gainToDb(cls.tailGain) - (own ? 4 : 2) });
    }
    if (own && listenerScoped && cls.family === 'cannon') {
      const size = caliberMm >= 128 ? 'heavy' : caliberMm >= 111 ? 'large' : 'medium';
      play(`gun_interior_${size}`, hullOptions({ bus: 'ownCombat', gainDb: 0 }));
    }
    // Weight: the pressure wave under a cannon (the generated reports are lean below 80 Hz).
    if (noise && mixer && (cls.family === 'cannon' || cls.id === 'rocket_heavy') && (own || distance < 700)) {
      const bore = clamp((caliberMm - 75) / 80, 0, 1);
      const level = own ? 0.9 : 0.75 * dbToGain(distanceAttenuationDb(distance, 25, 0.75)) * Math.max(closeK, 0.35);
      const when = mixer.ctx.currentTime + 0.004 + (own ? 0 : propagationDelayS(distance, atmosphere));
      subThump(mixer.ctx, mixer.input(bus ?? 'weapons'), noise, when, 78 - 18 * bore, 34 - 8 * bore, 0.45 + 0.35 * bore, level, random);
    }
    if ((own || distance < 45) && cls.family === 'autocannon') {
      play('ac_feed', own ? hullOptions({ delayS: cls.actionDelayS, gainDb: -8 }) : { x, y, z, delayS: cls.actionDelayS, gainDb: -10 });
    }
    if (!played && noise && mixer) {
      const gain = own ? 0.6 : dbToGain(distanceAttenuationDb(distance, 12, 1)) * 0.7;
      if (gain > 0.003) synthShot(mixer.ctx, mixer.input(bus ?? 'weapons'), noise, mixer.ctx.currentTime + (own ? 0.005 : Math.min(3, distance / atmosphere.speedOfSoundMps)), caliberMm, gain, random);
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
    if (!event.feedbackPredicted) fireWeapon(event.muzzlePos, event.caliberMm, event.weaponSound, ownShot, event.muzzleIndex);
    if (!ownShot) shellFlyby(event);
    if (event.isPlayer) {
      if (/launch/.test(String(event.weaponSound || ''))) say('missile_away', { prob: 0.5, delayS: 0.1 });
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

  /** A synthesized layer's level under a cue's distance law, carried by the own-hit focus law when it is ours. */
  function lawGain(distance: number, refM: number, rolloff: number, focus: boolean): number {
    return focus
      ? dbToGain(distanceAttenuationDb(distance, refM * OWN_HIT_FOCUS.refScale, Math.min(rolloff, OWN_HIT_FOCUS.maxRolloff)))
      : dbToGain(distanceAttenuationDb(distance, refM, rolloff));
  }

  function explosion(x: number, y: number, z: number, caliberMm: number, bus?: 'cinematic', focus = false): void {
    const id = caliberMm >= 140 ? 'expl_he_large' : caliberMm >= 61 ? 'expl_he_medium' : 'expl_he_small';
    const distance = distanceTo(x, y, z);
    if (noise && mixer && caliberMm >= 61 && distance < (focus ? 1200 : 600)) {
      const size = clamp((caliberMm - 61) / 90, 0, 1);
      subThump(mixer.ctx, mixer.input(bus ?? 'impacts'), noise, mixer.ctx.currentTime + 0.004 + propagationDelayS(distance, atmosphere),
        70 - 16 * size, 30 - 6 * size, 0.6 + 0.4 * size, 0.85 * lawGain(distance, 22, 0.7, focus), random);
    }
    if (!bus) blastNearHull(distance, caliberMm);
    const rate = clamp(1.08 - (caliberMm - 100) / 600, 0.86, 1.12);
    if (!play(id, { x, y, z, rate, focus, ...(bus ? { bus } : {}) }) && noise && mixer) {
      synthBoom(mixer.ctx, mixer.input('impacts'), noise, mixer.ctx.currentTime + Math.min(3, distance / atmosphere.speedOfSoundMps), 0.5 + caliberMm / 150, dbToGain(distanceAttenuationDb(distance, 14, 0.95)) * 0.8, random);
    }
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
    const seqBefore = pool?.log.at(-1)?.seq ?? 0;
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
          if (!small && noise && mixer) subThump(mixer.ctx, mixer.input('ownCombat'), noise, mixer.ctx.currentTime + 0.004, 96, 46, 0.3, medium ? 0.45 : 0.8, random);
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
    const anyPlayed = (pool?.log.at(-1)?.seq ?? 0) > seqBefore;
    if (!anyPlayed && noise && mixer && (event.kind === 'pen' || event.kind === 'ricochet' || event.kind === 'nonpen')) {
      synthImpact(mixer.ctx, mixer.input('impacts'), noise, mixer.ctx.currentTime, event.kind, 0.4, random);
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
    if (call) say(call, { delayS: 0.12 });
    const maxHp = event.targetMaxHp || 0;
    const crossed = !lowHpCalled && !event.destroyed && (event.damage || 0) > 0 && maxHp > 0 && event.targetHpAfter / maxHp <= 0.25;
    if (!crossed || (call && call !== 'were_hit')) return;
    lowHpCalled = true;
    say('low_hp', { delayS: 0.35 });
  }

  /**
   * The gunner's call on our own round, as a crew calls every main-gun shot:
   * what it did, about half a second after it lands (the time to see it).
   * Autocannon and machine-gun hits are called only now and then.
   */
  function reportOutgoing(event: ShellHitEvent): void {
    if (event.targetId == null || event.destroyed) return;
    if (sameTeam(event.targetId, playerId)) { say('friendly_fire', { delayS: 0.12 }); return; }
    const modules = new Map((event.modulesHit || []).map((m) => [m.module, m.newState] as const));
    const damaged = (event.damage || 0) > 0;
    const k = (event.caliberMm || 0) >= 60 ? 1 : 0.3;
    const call = (id: string, prob: number): void => { say(id, { prob: prob * k, delayS: 0.4 + random() * 0.15 }); };
    if (event.fireStarted) { call('enemy_fire', 1); return; }
    if (modules.has('ammoRack')) { call('enemy_ammo_rack', 1); return; }
    if (modules.get('trackL') === 'red' || modules.get('trackR') === 'red') { call('enemy_immobilized', 0.9); return; }
    if (modules.has('gun') || modules.has('gunMount')) { call('enemy_gun_damaged', 0.9); return; }
    if (modules.has('engine')) { call('enemy_engine_hit', 0.85); return; }
    if ((event.crewHit?.length || 0) > 0 && damaged) { call('enemy_crew_hit', 0.8); return; }
    if (modules.size > 0 && damaged) { call('enemy_crit', 0.8); return; }
    if ((event.kind === 'pen' || event.kind === 'he_pen') && damaged) { call('penetration', 0.95); return; }
    if (event.kind === 'ricochet') call('ricochet', 0.9);
    else if (event.kind === 'nonpen' || event.kind === 'spaced_absorb') call('nonpen', 0.9);
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
    if (small) {
      play(water ? 'bullet_water' : 'bullet_dirt', { x, y, z });
    } else if (water) {
      play(caliber >= 61 ? 'water_big' : 'water_small', { x, y, z, focus });
    } else if (event.hitKind === 'prop') {
      play(random() < 0.5 ? 'ground_wood' : 'ground_concrete', { x, y, z, focus });
    } else {
      play(groundImpactAsset(surfaceAt(x, z).surface, x, z), { x, y, z, focus, rate: clamp(1.1 - caliber / 900, 0.9, 1.08) });
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
      const ok = play(cause === 'ammorack' ? 'tank_explode_ammo' : 'tank_explode', { x, y, z, focus, ...bus });
      const blastM = distanceTo(x, y, z);
      if (noise && mixer && blastM < (focus ? 1800 : 900)) {
        subThump(mixer.ctx, mixer.input(cinematic ? 'cinematic' : 'impacts'), noise, mixer.ctx.currentTime + 0.004 + (cinematic ? 0 : propagationDelayS(blastM, atmosphere)),
          cause === 'ammorack' ? 58 : 64, cause === 'ammorack' ? 22 : 26, cause === 'ammorack' ? 1.3 : 1.0, 0.95 * lawGain(blastM, 30, 0.6, focus), random);
      }
      if (!ok && noise && mixer) synthBoom(mixer.ctx, mixer.input(cinematic ? 'cinematic' : 'impacts'), noise, mixer.ctx.currentTime, 1.8, 0.8 * dbToGain(distanceAttenuationDb(distanceTo(x, y, z), 18, 0.95)), random);
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
      if (sameTeam(event.id, playerId)) { if (near) say('ally_destroyed', { prob: 0.5, delayS: 0.3 }); }
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

  function propAsset(kind: string, height = 0): { id: string; follow?: string } {
    const k = kind.toLowerCase();
    if (/tree|sapling|stump|trunk|palm|pine|bush|shrub/.test(k)) return { id: 'tree_snap', ...(height > 4 ? { follow: 'tree_fall' } : {}) };
    if (/chain|wire|barbed/.test(k)) return { id: 'wire_snag' };
    if (/fence|rail|gate|post/.test(k)) return { id: /metal|steel|iron|chain/.test(k) ? 'fence_metal' : 'fence_wood' };
    if (/car|truck|van|bus|jeep|vehicle|tractor/.test(k)) return { id: 'car_crush' };
    if (/container/.test(k)) return { id: 'container_crush' };
    if (/barrel|drum|tank|cylinder/.test(k)) return { id: 'container_crush' };
    if (/hedgehog|obstacle|tetra/.test(k)) return { id: 'hedgehog_clang' };
    if (/sandbag|bag/.test(k)) return { id: 'sandbag_thump' };
    if (/rubble|rock|stone|debris|brick/.test(k)) return { id: 'rubble_crunch' };
    if (/glass|window|greenhouse/.test(k)) return { id: 'glass_shatter' };
    if (/wall|pillar|column/.test(k)) return { id: 'wall_brick' };
    if (/house|building|hut|shed|barn|tower|kiosk|shack|silo/.test(k)) return { id: 'building_collapse' };
    if (/aagun|gun/.test(k)) return { id: 'he_armor', follow: 'debris_metal' };
    return { id: 'crate_break' };
  }

  function onProp(event: PropEvent, destroyed: boolean): void {
    if (!event?.pos) return;
    const [x, y, z] = event.pos;
    const { id, follow } = propAsset(String(event.kind || 'tree'), event.h ?? 0);
    play(id, { x, y, z, gainDb: destroyed ? 0 : -1 });
    if (follow) play(follow, { x, y, z, delayS: 0.45 + random() * 0.3, gainDb: -2 });
    logSound(destroyed ? 'prop:destroyed' : 'prop:crushed', { kind: event.kind, id });
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
      else if (closing > 3) say('rammed', { prob: 0.45, delayS: 0.2 });
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
      if (worse && event.module === 'ammoRack' && mixer) ammoRackBeep(mixer.ctx, mixer.input('alarm'), mixer.ctx.currentTime + 0.01);
      return;
    }
    if (worse) {
      if (event.module === 'ammoRack' && mixer) ammoRackBeep(mixer.ctx, mixer.input('alarm'), mixer.ctx.currentTime + 0.01);
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
      caseEject: caliber <= 105 ? 'case_eject_brass' : 'case_eject_stub', breechOpen: 'breech_open', shellGrab: 'shell_grab',
      ram: 'shell_ram', chargeRam: 'shell_ram', breechClose: 'breech_close', carouselTurn: 'autoloader_carousel',
      cassetteLift: 'autoloader_lift', chainRam: 'autoloader_chain_ram', stubEject: 'case_eject_stub',
      bustleIndex: 'bustle_index', clipIndex: 'bustle_index', feedClank: 'ac_feed', magazineSwap: 'magazine_swap',
      tubeLoad: 'missile_tube_load', latch: 'latch_ready',
    };
    play(asset[type], hullOptions({ rate, gainDb: type === 'chargeRam' ? -4 : 0 }));
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
      reload.plan = resolveReloadCuePlan(total, kind, caliber, loaderKind);
      logSound('reload:start', { kind, total, caliberMm: caliber, loader: loaderKind });
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
      if (reload.plan?.ready) play('latch_ready', hullOptions({ gainDb: -6 }));
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
    const ours = objectiveTeam(playerTeam);
    const team = payload.team === 'alpha' || payload.team === 'bravo' ? payload.team : null;
    const byMe = payload.by != null && payload.by === playerId;
    switch (type) {
      case 'zone_captured':
        if (team === ours) { play('ui_objective_gain'); say('objective_captured', { delayS: 0.3 }); }
        else { play('ui_objective_loss'); say('objective_lost', { delayS: 0.3 }); }
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
        play('sting_wave');
        say('wave_incoming', { delayS: 0.6 });
        break;
      case 'wave_cleared':
        play('ui_wave_clear');
        say('wave_cleared', { delayS: 0.4 });
        break;
      case 'line_advanced':
        play('ui_line_advance');
        say('line_advanced', { prob: 0.5, delayS: 0.4 });
        break;
      case 'goal_scored':
        if (team === ours) { play('ui_goal'); say('goal_scored', { delayS: 0.2 }); } else play('ui_objective_loss');
        break;
      case 'ball_hit':
        if (byMe) play('ui_ball_hit', { space: 'flat', gainDb: -6 });
        break;
      case 'pickup_collected':
        if (byMe) { play('ui_pickup'); say('pickup_collected', { prob: 0.35, delayS: 0.2 }); }
        break;
      case 'destruction_scored':
        if (team === ours) play('ui_score');
        break;
      case 'respawn':
        if (payload.id === playerId) { play('ui_respawn'); say('respawn', { prob: 0.6, delayS: 0.5 }); }
        break;
      default:
        break;
    }
    logSound(`mode:${type}`, { team, byMe });
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
        heartbeatRig = heartbeat(mixer.ctx, mixer.input('alarm'), mixer.ctx.currentTime, 6);
      }
    }
    // First move after rollout.
    if (rolledOut && !movedOnce && Math.abs(state.speed) > 2.5) {
      movedOnce = true;
      say('on_the_move', { prob: 0.5, delayS: 0.1 });
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
    // Stuck: full throttle, no progress, on the ground.
    const throttle = Math.abs(entity.input?.throttle ?? 0);
    if (throttle > 0.6 && Math.abs(state.speed) < 0.35 && state.grounded !== false && !state.overturned && moduleHealth(entity, 'trackL') !== 'red' && moduleHealth(entity, 'trackR') !== 'red' && moduleHealth(entity, 'engine') !== 'red') {
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
    if (limit && !wasAtLimit && now - lastGunLimitAt > 1.5) {
      lastGunLimitAt = now;
      play('gun_limit', hullOptions({ gainDb: -4 }));
      if (slewing || random() < 0.3) say('gun_limit', { prob: 0.25, delayS: 0.2 });
    }
    wasAtLimit = limit;
    // The turret drive's stop clunk ends a real slew (a quarter second or
    // more), not the servo settling; and a damaged ring's grind.
    const traverse = Math.abs(state.turretYawRate ?? 0);
    if (traverse > 0.12) slewS += dt;
    else if (traverse < 0.02) {
      if (slewS > 0.25 && now - lastTurretStopAt > 0.6) {
        lastTurretStopAt = now;
        play('turret_stop', hullOptions({ gainDb: -6 }));
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
      }
    }
    if (listenerOwnerId == null && listenerKind === 'player-tank') listenerOwnerId = playerId;
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
    radio.setLanguage(forcedCrewLanguage ?? resolveCrewLanguage(nation, crewVoice, getLocale()));
  }

  // Per-frame scratch (no allocation in the update loop).
  interface RigCandidate { id: string; entity: AudioEntity; d: number }
  const candidates: RigCandidate[] = [];
  const candidateSlots: RigCandidate[] = [];
  const keep = new Map<string, RigLod>();
  const byDistance = (a: RigCandidate, b: RigCandidate): number => a.d - b.d;

  function updateRigs(list: readonly RuntimeValue[], dt: number): void {
    if (!mixer || !library || !pool || !noise || !ctx) return;
    candidates.length = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = toEntity(list[i]);
      if (!entity || entity.combat?.destroyed || entity.modeActive === false) continue;
      if (probeSolo != null && entity.id !== probeSolo) continue;
      const p = entity.state.pos;
      const d = Math.hypot(p.x - frame.x, p.y - frame.y, p.z - frame.z);
      const own = entity.id === listenerOwnerId;
      const existing = rigs.has(entity.id);
      if (!own && d > (existing ? VEHICLE_LOD.farOutM : VEHICLE_LOD.farInM)) continue;
      let slot = candidateSlots[candidates.length];
      if (!slot) { slot = { id: '', entity, d: 0 }; candidateSlots.push(slot); }
      slot.id = entity.id;
      slot.entity = entity;
      slot.d = own ? -1 : d - (existing ? 25 : 0);
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
        rig = createVehicleRig({ mixer, library, pool, noise, random, reverb: budget.reverb }, c.id, info.identity, lod);
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

  function stopWorld(reason: string): void {
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
    noise = createNoiseBank(ctx, random);
    pool = createVoicePool({ mixer, library, random, budget: budget.voices, reverb: budget.reverb });
    pool.setOcclusionProbe((x, y, z) => occlusionAt(x, y, z));
    radio = createCrewRadio({ mixer, library, noise, random });
    ambience = createAmbienceDirector({ mixer, library, pool, random });
    library.pin([...UI_SET, 'radio_interference']);
    void library.load([...UI_SET, 'radio_interference']);
    // A battle hull may already be indexed (late adoption mid-battle).
    if (playerId) applyCrewLanguage();
    installDebugSurface();
    applyScene();
    chooseSnapshot();
  }

  function uiClick(): void {
    if (!play('ui_click') && mixer) synthClick(mixer.ctx, mixer.input('ui'), mixer.ctx.currentTime, 0.25);
  }

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
          fireAlarm = fireKlaxon(mixer.ctx, mixer.input('alarm'));
          say('fire');
        } else if (!e.burning && playerBurning) {
          playerBurning = false;
          fireAlarm?.stop();
          fireAlarm = null;
          say('fire_out', { prob: 0.85 });
        }
      }
      logSound('tank:fire', { id: e.id, burning: !!e.burning });
    });
    on<ModuleStateEvent>('module:state', (e) => { if (e) onModuleState(e); });
    on<{ id: string; team?: string; spotterId?: string | null }>('tank:spotted', (e) => {
      if (!e || phase !== 'battle' || e.team !== 'player') return;
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
      if (phase === 'battle' && !battleOver) {
        say('sixth_sense', { delayS: 3.0 });
        play('ui_alert', { delayS: 3.0, gainDb: -6 });
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
    on<undefined>('ui:magazineReload', () => { play('magazine_swap', hullOptions()); say('reloading', { prob: 0.3, delayS: 0.15 }); });
    on<undefined>('ui:magazineReloadStarted', () => play('magazine_swap', hullOptions()));
    on<{ kind?: string; active?: boolean }>('ui:specialActionResult', (e) => {
      const kind = String(e?.kind || '');
      if (/hydro|suspension/.test(kind)) play('hydro_susp', hullOptions({ bus: 'own' }));
      else if (/missile|guided/.test(kind)) { play('missile_mode', hullOptions()); if (e?.active) say('load_missile', { prob: 0.8, delayS: 0.1 }); }
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
      if (e?.on) { play('lock_on'); say('target_locked', { prob: 0.35, delayS: 0.1 }); }
      else { play('lock_off'); if (e?.reason && !/off/i.test(e.reason)) say('target_lost', { prob: 0.4, delayS: 0.1 }); }
    });
    on<undefined>('ui:armorOverlayState', () => play('ui_toggle'));
    on<undefined>('ui:minimapZoom', () => play('ui_tab', { gainDb: -6 }));
    on<undefined>('spectate:cycle', () => play('spectate_switch'));
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
    on<{ p0?: Vec3; v?: Vec3; durationS?: number }>('atmosphere:flyover', (e) => {
      if (!e?.p0 || !e.v) return;
      const half = clamp(e.durationS ?? 20, 4, 60) / 2;
      play('jet_flyover', { x: e.p0[0] + e.v[0] * half, y: e.p0[1] + e.v[1] * half, z: e.p0[2] + e.v[2] * half, propagate: false, delayS: Math.max(0, half - 3.5) });
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
        movedOnce = false;
        lowHpCalled = false;
        ammoLowCalled = false;
        lastStanding = { mine: false, theirs: false, outnumbered: false };
        heartbeatBelow = 0;
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
      play('sting_battle');
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
    on<VolumeEvent>('ui:volumes', (v) => {
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
    for (const type of ['zone_captured', 'flag_taken', 'flag_captured', 'flag_returned', 'flag_dropped', 'wave_started', 'wave_cleared',
      'line_advanced', 'goal_scored', 'ball_hit', 'pickup_collected', 'destruction_scored', 'respawn']) {
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
    if (loaderKind === 'carousel' || loaderKind === 'bustle') play('autoloader_carousel', hullOptions({ gainDb: -4, maxDurS: 1.2 }));
    else play('ammo_select', hullOptions());
    if (!shell) return;
    const type = String(shell.type || '');
    const id = shell.guided ? 'load_missile' : type === 'HEAT' ? 'load_heat' : type === 'HE' || type === 'HESH' ? 'load_he' : 'load_kinetic';
    say(id, { delayS: 0.12 });
  }

  function update(dt: number, listener: AudioListenerPose, list: readonly RuntimeValue[]): void {
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
   * Decode and pin a battle's sound set: every report bank, the combat,
   * hull, interface and mode sets, the map's scene, running gear and the
   * roster's powertrains (or one band of every family when the roster is
   * unknown). Runs at every battle phase edge whatever the entry path (solo
   * loader, multiplayer, debug start), so no first shot falls back to the
   * synthesized report; the solo loader also awaits it before the reveal.
   */
  function warmBattle(roster?: readonly string[]): Promise<void> {
    if (!library) return Promise.resolve();
    const ids = new Set<string>(CORE_BATTLE);
    for (const id of UI_SET) ids.add(id);
    for (const id of PLAYER_HULL) ids.add(id);
    for (const id of MODE_SET) ids.add(id);
    // Every report bank: any calibre may appear (roof guns, mixed rosters, network joins).
    for (const id of Object.values(WEAPON_CLOSE)) ids.add(id);
    const mapId = getMapId?.() || 'verdant';
    for (const id of sceneAssets(sceneForMap(mapId), true)) ids.add(id);
    for (const specId of roster || []) {
      const identity = resolveVehicleAudioIdentity({ id: specId });
      for (const band of ['idle', 'low', 'mid', 'high', 'start']) ids.add(`engine_${identity.engine}_${band}`);
    }
    // A battle always has some running gear on the ground under it.
    for (const cls of ['light', 'heavy']) for (const s of ['earth', 'hard']) for (const v of ['slow', 'fast']) ids.add(`tracks_${cls}_${s}_${v}`);
    if (!roster?.length) for (const family of ENGINE_FAMILY_IDS) ids.add(`engine_${family}_mid`);
    // The battle set stays decoded for the whole battle (rigs and scenes pin their own loops).
    library.pin(ids, true);
    return library.load(ids);
  }

  function loadingOn(on: boolean): void {
    if (!mixer || !noise) return;
    if (on && !loading) {
      loading = loadingBed(mixer.ctx, mixer.input('music'), noise, random);
      play('ui_deploy', { gainDb: -3 });
      logSound('loading:start');
    } else if (!on && loading) {
      loading.stop(0.3);
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
      if (!play('sting_garage') && mixer && noise) synthBoom(mixer.ctx, mixer.input('music'), noise, mixer.ctx.currentTime, 0.6, 0.3, random);
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
