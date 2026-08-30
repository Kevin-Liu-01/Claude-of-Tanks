import type * as THREE from 'three';
import type { EventBus, GameState } from '../game/stateCore.ts';
import type { RosterEntity, RosterGameState } from '../game/rosterState.ts';
import type { KillcamRuntime } from '../game/killcamAccess.ts';
import type { InputLayer } from '../game/input.ts';
import type { MobileAutoAimRuntime } from '../game/mobileAutoAimRuntime.ts';
import type { BattleHudRuntime, DamagePanelRuntime } from '../ui/battleHudAccess.ts';
import type { CombatState } from '../sim/damage.ts';
import type { TankState } from '../sim/movement.ts';
import type { SpecialActionState } from '../sim/specialActionPolicy.ts';
import type { WorldRuntime } from '../world/map.ts';
import type { getSpec } from '../vehicles/specs.ts';
import type { FxRuntime } from '../fx/effects.ts';
import type { GarageRuntime } from '../ui/garage.ts';

export interface MainLightingRuntime {
  setupShadowMaterial(material: THREE.Material, extraHook?: unknown): void;
  releaseShadowMaterial(material: THREE.Material): unknown;
  setFarCascadeDormant(dormant: boolean): void;
  setStaticPresentationDormant(dormant: boolean): void;
  setSun(direction: THREE.Vector3, config?: unknown): void;
  update(force?: boolean, dt?: number): void;
  updateFov(): void;
  updateFrustums(): void;
  getShadowTelemetry(): unknown;
  primeShadowMaps(...args: unknown[]): unknown;
  preservePrimedCascadesForNextFrame(): void;
}

export type MainGarageRuntime = GarageRuntime;

export type MainVisual = NonNullable<RosterEntity['visual']>;

export interface MainFxRuntime extends Omit<
  FxRuntime,
  'bindBus' | 'preloadTextures' | 'update'
> {
  bindBus(bus: EventBus): void;
  preloadTextures(): Promise<unknown>;
  update(
    dt: number,
    shells: unknown[],
    camera: THREE.Camera,
    resolveSubject?: ((id: string) => unknown) | null,
  ): void;
}

export interface MainFxModule {
  createFx(...args: unknown[]): MainFxRuntime;
}

export interface MainEntity extends Omit<
  RosterEntity,
  'spec' | 'state' | 'combat' | 'specialAction' | 'visual'
> {
  spec: ReturnType<typeof getSpec> & { name: string };
  state: TankState | null;
  combat: CombatState | null;
  specialAction: SpecialActionState | null;
  equip?: readonly string[] | null;
  visual: MainVisual | null;
}

interface MainSpottingRuntime {
  isSpotted(entityId: string, observerId: string, observer: MainEntity | null): boolean;
}

export type MainGameState = Omit<
  GameState,
  'tanks' | 'allTanks' | 'tankById' | 'player' | 'spotting'
> & Omit<RosterGameState, 'tanks' | 'allTanks' | 'tankById'> & {
  tanks: MainEntity[];
  allTanks: MainEntity[];
  tankById: Map<string, MainEntity>;
  player: MainEntity | null;
  spotting: MainSpottingRuntime | null;
  killcam?: unknown;
};

export type MainWorld = WorldRuntime;

export type MainHudRuntime = BattleHudRuntime;
export type MainDamagePanelRuntime = DamagePanelRuntime;

export interface SoloBattleRequest {
  specId?: string;
  mapId?: string | null;
  randomRoster?: boolean;
  gameMode?: string;
}

export interface MainKillcamRuntime extends KillcamRuntime {
  bindBus(bus: EventBus): void;
}

export type MainInputRuntime = InputLayer;

export type MainMobileAutoAimRuntime = MobileAutoAimRuntime;

declare global {
  interface Window {
    __BATTLE_REVEAL?: unknown;
    __BOOT_MS?: number;
    __BOOT_TIMINGS?: Record<string, number>;
    __GAME_READY?: boolean;
    __GARAGE_ENTRY?: unknown;
    __GARAGE_IDLE_WORK?: unknown;
    __GARAGE_WORKSHOP?: unknown;
    __MINIMAP_LOAD?: unknown;
    __NETWORK_ENTRY_FAILURE?: unknown;
    __NETWORK_LOAD?: unknown;
    __PERF_HUD?: unknown;
    __SHOTS?: unknown;
    __SWITCH_TIMINGS?: Array<Record<string, unknown>>;
    __PED_TRACE?: Array<Record<string, unknown>>;
    __START_BATTLE_TIMINGS?: unknown;
    __STUDIO?: unknown;
    __STUDIO_LOAD?: unknown;
    __STUDIO_WARM?: unknown;
    __VISUAL_LOAD_TIMINGS?: unknown[];
    __WORLD_LOAD?: unknown;
    __WORLD_PREFETCH?: unknown;
  }
}
