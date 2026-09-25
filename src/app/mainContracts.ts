import type { RuntimeValue } from '../runtimeTypes.ts';
import type * as THREE from 'three';
import type { EventBus, GameState } from '../game/stateCore.ts';
import type { RosterEntity, RosterGameState } from '../game/rosterState.ts';
import type { MobileAutoAimRuntime } from '../game/mobileAutoAimRuntime.ts';
import type { CombatState } from '../sim/damage.ts';
import type { TankState } from '../sim/movement.ts';
import type { SpecialActionState } from '../sim/specialActionPolicy.ts';
import type { WorldRuntime } from '../world/map.ts';
import type { getSpec } from '../vehicles/specs.ts';
import type { FxRuntime } from '../fx/effects.ts';
import type { GarageRuntime } from '../ui/garage.ts';
import type { createLighting } from '../engine/lighting.ts';
import type { ConcealmentView, HudMatchModeState } from '../ui/hud.ts';

export type MainLightingRuntime = ReturnType<typeof createLighting>;

export type MainGarageRuntime = GarageRuntime;

type MainVisual = NonNullable<RosterEntity['visual']>;

export interface MainFxRuntime extends Omit<
  FxRuntime,
  'bindBus' | 'preloadTextures' | 'update'
> {
  bindBus(bus: EventBus): void;
  preloadTextures(): Promise<RuntimeValue>;
  update(
    dt: number,
    shells: RuntimeValue[],
    camera: THREE.Camera,
    resolveSubject?: ((id: string) => RuntimeValue) | null,
  ): void;
}

export type MainFxModule = Pick<typeof import('../fx/effects.ts'), 'createFxChunked'>;

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
  getConcealment(entity: MainEntity, timeS: number): ConcealmentView;
}

export type MainGameState = Omit<
  GameState,
  'tanks' | 'allTanks' | 'tankById' | 'player' | 'spotting' | 'matchModeState'
> & Omit<RosterGameState, 'tanks' | 'allTanks' | 'tankById'> & {
  tanks: MainEntity[];
  allTanks: MainEntity[];
  tankById: Map<string, MainEntity>;
  player: MainEntity | null;
  spotting: MainSpottingRuntime | null;
  matchModeState: HudMatchModeState | null;
  killcam?: RuntimeValue;
};

export type MainWorld = WorldRuntime;

export type MainMobileAutoAimRuntime = MobileAutoAimRuntime;

declare global {
  interface Window {
    __BATTLE_REVEAL?: RuntimeValue;
    __BOOT_MS?: number;
    __BOOT_TIMINGS?: Record<string, number>;
    __GAME_READY?: boolean;
    __GARAGE_ENTRY?: RuntimeValue;
    __GARAGE_IDLE_WORK?: RuntimeValue;
    __MINIMAP_LOAD?: RuntimeValue;
    /** The Multiplayer v2 browser composition (diagnostics builds): tools/mp-browser-e2e.mjs reads its stats. */
    __MULTIPLAYER_V2?: RuntimeValue;
    __NETWORK_ENTRY_FAILURE?: RuntimeValue;
    __NETWORK_LOAD?: RuntimeValue;
    __PERF_HUD?: RuntimeValue;
    __SHOTS?: RuntimeValue;
    __SWITCH_TIMINGS?: Array<Record<string, RuntimeValue>>;
    __PED_TRACE?: Array<Record<string, RuntimeValue>>;
    __START_BATTLE_TIMINGS?: RuntimeValue;
    __STUDIO?: RuntimeValue;
    __STUDIO_LOAD?: RuntimeValue;
    __STUDIO_WARM?: RuntimeValue;
    __VISUAL_LOAD_TIMINGS?: RuntimeValue[];
    __WORLD_LOAD?: RuntimeValue;
    __WORLD_PREFETCH?: RuntimeValue;
  }
}
