import { Vector3, type Camera } from 'three';
import type { EventBus } from './stateCore.ts';
import type { MobileAutoAimEntity } from './mobileAutoAim.ts';

interface AutoAimTank extends MobileAutoAimEntity {
  id: string;
  spec: MobileAutoAimEntity['spec'] & { name?: string };
}

interface AutoAimPlayer extends AutoAimTank {
  combat: AutoAimTank['combat'] & { destroyed?: boolean };
}

interface MobileAutoAimInput {
  isTouchLayout(): boolean;
}

export interface MobileAutoAimRuntimeOptions {
  bus: EventBus;
  input: MobileAutoAimInput;
  camera: Camera;
  getPhase(): string;
  getTanks(): readonly AutoAimTank[];
  getPlayer(): AutoAimPlayer | null;
  getTankById(id: string): AutoAimTank | null;
  isVisible(entity: AutoAimTank): boolean;
  pickTarget(
    tanks: readonly AutoAimTank[],
    player: AutoAimPlayer,
    camera: Camera,
    isVisible: (entity: AutoAimTank) => boolean,
  ): AutoAimTank | null;
  targetCenter(entity: AutoAimTank, out: Vector3): Vector3;
}

export interface MobileAutoAimRuntime {
  readonly targetId: string | null;
  sample(active: boolean): Vector3 | null;
  clear(reason?: string): void;
  dispose(): void;
}

function eventId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('id' in payload)) return null;
  return typeof payload.id === 'string' ? payload.id : null;
}

function eventPhase(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('phase' in payload)) return null;
  return typeof payload.phase === 'string' ? payload.phase : null;
}

/**
 * Own the mobile lock target and its UI event lifecycle.
 *
 * `sample` is allocation-free and returns one retained center-mass vector.
 * Acquisition and target geometry stay injected so this lifecycle does not
 * pull the battle client graph into Garage boot.
 */
export function createMobileAutoAimRuntime({
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
}: MobileAutoAimRuntimeOptions): MobileAutoAimRuntime {
  let disposed = false;
  let targetId: string | null = null;
  const point = new Vector3();

  const publish = (target: AutoAimTank | null, reason = ''): void => {
    targetId = target?.id ?? null;
    bus.emit('ui:autoAimState', {
      on: target !== null,
      targetId,
      targetName: target?.spec.name ?? '',
      reason,
    });
  };

  const clear = (reason = ''): void => {
    if (targetId === null && reason === '') return;
    publish(null, reason);
  };

  const stopToggle = bus.on('ui:autoAimToggle', () => {
    if (disposed) return;
    const player = getPlayer();
    if (getPhase() !== 'battle' || !input.isTouchLayout() || !player ||
        !player.combat || player.combat.destroyed) return;
    if (targetId !== null) {
      clear('AUTO-AIM OFF');
      return;
    }
    const target = pickTarget(getTanks(), player, camera, isVisible);
    publish(target, target ? '' : 'NO TARGET NEAR RETICLE');
  });

  const stopDestroyed = bus.on('tank:destroyed', (payload) => {
    if (eventId(payload) === targetId) clear('TARGET DESTROYED');
  });

  const stopPhase = bus.on('phase:change', (payload) => {
    if (eventPhase(payload) !== 'battle' && targetId !== null) clear();
  });

  return {
    get targetId(): string | null { return targetId; },
    sample(active: boolean): Vector3 | null {
      if (disposed || targetId === null) return null;
      // Pause and kill-cam temporarily stop camera ownership without dropping
      // the player's lock. The original frame loop skipped validation in
      // those states and resumed the same target afterwards.
      if (!active) return null;
      const target = getTankById(targetId);
      if (!input.isTouchLayout() || !target || !target.combat ||
          target.combat.destroyed || !isVisible(target)) {
        clear('TARGET LOST');
        return null;
      }
      return targetCenter(target, point);
    },
    clear,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stopToggle();
      stopDestroyed();
      stopPhase();
      targetId = null;
    },
  };
}
