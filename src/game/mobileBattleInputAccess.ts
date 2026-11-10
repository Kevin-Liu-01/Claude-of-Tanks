import type { RuntimeValue } from '../runtimeTypes.ts';
import type { Camera, Vector3 } from 'three';

import type { InputLayer } from './input.ts';
import type {
  MobileAutoAimCandidate,
  MobileAutoAimEntity,
} from './mobileAutoAim.ts';
import type {
  MobileAutoAimRuntime,
  MobileAutoAimRuntimeOptions,
} from './mobileAutoAimRuntime.ts';
import type { EventBus } from './stateCore.ts';
import {
  createTouchControlsAccess,
  type TouchControlsAccess,
  type TouchControlsOptions,
  type TouchControlsRuntime,
} from '../ui/touchControlsAccess.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

interface MobileBattleInputTank extends MobileAutoAimCandidate {
  aerial?: {active:boolean;kind:string};
  id: string;
  spec: MobileAutoAimCandidate['spec'] & { name?: string };
}

interface MobileAutoAimModule<TTank extends MobileBattleInputTank> {
  createMobileAutoAimRuntime(
    options: MobileAutoAimRuntimeOptions<TTank>,
  ): MobileAutoAimRuntime;
}

interface MobileBattleInputOptions<
  TTank extends MobileBattleInputTank = MobileBattleInputTank,
> {
  input: InputLayer;
  bus: EventBus;
  camera: Camera;
  isBattleActive(): boolean;
  openSettings(): void;
  setSoundMuted(muted: boolean): void;
  isSniper(): boolean;
  getPhase(): string;
  getTanks(): readonly TTank[];
  getPlayer(): TTank | null;
  getTankById(id: string): TTank | null;
  isVisible(entity: TTank): boolean;
  pickTarget(
    tanks: readonly TTank[],
    player: TTank & MobileAutoAimEntity,
    camera: Camera,
    isVisible: (entity: TTank) => boolean,
  ): TTank | null;
  targetCenter(entity: TTank & MobileAutoAimEntity, out: Vector3): Vector3;
}

interface MobileBattleInputDependencies<TTank extends MobileBattleInputTank> {
  createTouchAccess(options: TouchControlsOptions): TouchControlsAccess;
  loadAutoAim(): Promise<MobileAutoAimModule<TTank>>;
}

interface MobileBattleInputAccess {
  preload(): Promise<TouchControlsRuntime | null>;
  getAutoAim(): MobileAutoAimRuntime | null;
}

/**
 * Owns the coupled battle-only mobile UI and auto-aim acquisition. Desktop
 * sessions transfer neither chunk. Touch sessions join one retryable request,
 * while the sound toggle and current lock owner stay out of the composition
 * root.
 */
export function createMobileBattleInputAccess<
  TTank extends MobileBattleInputTank = MobileBattleInputTank,
>(
  options: MobileBattleInputOptions<TTank>,
  dependencies?: Partial<MobileBattleInputDependencies<TTank>>,
): MobileBattleInputAccess {
  const {
    input,
    bus,
    camera,
    isBattleActive,
    openSettings,
    setSoundMuted,
    isSniper,
    getPhase,
    getTanks,
    getPlayer,
    getTankById,
    isVisible,
    pickTarget,
    targetCenter,
  } = options;
  const createTouchAccess = dependencies?.createTouchAccess ?? createTouchControlsAccess;
  const loadAutoAim = dependencies?.loadAutoAim
    ?? (async (): Promise<MobileAutoAimModule<TTank>> => await import('./mobileAutoAimRuntime.ts'));
  const required = [isBattleActive, openSettings, setSoundMuted, isSniper,
    getPhase, getTanks, getPlayer, getTankById, isVisible, pickTarget,
    targetCenter, createTouchAccess, loadAutoAim];
  if (!input || typeof input.isTouchLayout !== 'function'
    || !bus || typeof bus.emit !== 'function'
    || !camera
    || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('mobile battle input access requires every lifecycle port');
  }

  let soundMuted = false;
  let autoAim: MobileAutoAimRuntime | null = null;
  let pending: Promise<TouchControlsRuntime | null> | null = null;
  const touch = createTouchAccess({
    input,
    bus,
    isBattleActive,
    onOpenSettings: openSettings,
    onToggleSound: () => {
      soundMuted = !soundMuted;
      setSoundMuted(soundMuted);
      return soundMuted;
    },
    isSniper: () => getPlayer()?.aerial?.kind==='gunship' || isSniper(),
    getFlightKind: () => {const flight=getPlayer()?.aerial;return flight?.active?flight.kind:undefined;},
  });

  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: the auto-aim had no memo (two preloads in flight each
  // made a runtime) and every call asked a failed chunk again at once; now the one policy (at once after one failure, then
  // past its backoff; a removed chunk shows the reload action). The touch controls' access is on it too, and the join below
  // only shares the two loads' one wait.
  const autoAimChunk = createLazyChunk(() => loadAutoAim().then((module) => (autoAim = module.createMobileAutoAimRuntime({
    bus,
    input,
    camera,
    getPhase,
    getTanks,
    getPlayer,
    getTankById,
    isVisible,
    pickTarget,
    targetCenter,
  }))));
  const ensureAutoAim = (): Promise<MobileAutoAimRuntime> => autoAimChunk.load();

  const preload = (): Promise<TouchControlsRuntime | null> => {
    // round 30: the auto-aim lock serves the desktop T key as well, so the runtime loads on every layout;
    // only the touch controls stay touch-only
    if (!input.isTouchLayout()) return autoAim ? Promise.resolve(null) : ensureAutoAim().then(() => null);
    if (touch.current && autoAim) return Promise.resolve(touch.current);
    if (pending) return pending;
    const request = Promise.all([touch.preload(), ensureAutoAim()])
      .then(([controls]) => controls)
      .catch((error: RuntimeValue) => {
        if (pending === request) pending = null;
        throw error;
      });
    pending = request;
    return request;
  };

  return {
    preload,
    getAutoAim: () => autoAim,
  };
}
