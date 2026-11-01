/**
 * One human hull's input stage (268, couch mode; docs/ARCHITECTURE.md "One core, two drivers"): what a driver hands
 * the core for a seat each tick. The authority applies a network seat's controls through it, and the page's local
 * seats apply a phone's, so a seat on either driver drives, selects its ammunition and lays its gun the same way
 * (src/sim/driverStepParity.selftest.mjs). Lifted out of authoritativeMatch.ts so the page can call it without the
 * authority. Call it once per simulation tick, before the step: the aim intent is decoded against the hull's position
 * (its drone's, while one flies) at that tick. Action bits are presses, consumed and cleared by the step: a driver
 * hands a held control's bit on its first tick only.
 */
import type { RuntimeValue } from '../runtimeTypes.ts';
import { decodeAimIntent } from './aimIntent.ts';
import type { AimIntentInput, MutableVector3Like, Vector3Like } from './aimIntent.ts';
import { selectShell } from './damage.ts';
import type { CombatState, DamageShellSpec, DamageTankSpec } from './damage.ts';

export interface AuthoritativePlayerInput extends AimIntentInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  fireIntentSeq?: number | null;
  aimLocked?: boolean;
  shellSlot: number;
  actionBits: number;
  auxiliaryBits?: number;
}

/** The hull fields the stage reads and writes: the authority's entity and the page's both carry them. */
interface PlayerInputEntity {
  id: string;
  spec: DamageTankSpec & { gun: { shells: DamageShellSpec[] } };
  combat: CombatState;
  state: { pos: Vector3Like };
  input: {
    throttle: number;
    steer: number;
    brake: boolean;
    fire: boolean;
    fireIntentSeq?: number | null;
    aimLocked: boolean;
    actionBits: number;
    shellSlot: number;
    aimPoint: MutableVector3Like;
  };
  aerial?: Vector3Like & { active: boolean };
  modeActive?: boolean;
  _deniedShellSlot?: number;
}

/** The driver's event sink: the authority's emit, or the page's bus. */
type PlayerInputEmit = (type: string, payload: Record<string, RuntimeValue>) => unknown;

/** A seat's controls for this tick onto its hull; no input (no driver), an inactive hull or a wreck brakes and holds the lay. */
export function applyPlayerInput(
  entity: PlayerInputEntity,
  input: AuthoritativePlayerInput | null | undefined,
  emit: PlayerInputEmit,
): void {
  if (!input || entity.modeActive === false || entity.combat.destroyed) {
    entity.input.throttle = 0;
    entity.input.steer = 0;
    entity.input.brake = true;
    entity.input.fire = false;
    // No driver must also stop sight-driven hull traverse/hydraulic lay.
    entity.input.aimLocked = true;
    entity.input.actionBits = 0;
    return;
  }
  entity.input.throttle = input.throttle;
  entity.input.steer = input.steer;
  entity.input.brake = input.brake;
  entity.input.fire = input.fire;
  entity.input.fireIntentSeq = Number.isSafeInteger(input.fireIntentSeq) ? input.fireIntentSeq : null;
  entity.input.aimLocked = !!input.aimLocked;
  entity.input.actionBits = input.actionBits | 0;
  const shellSlot = Math.max(0, Math.min(
    entity.spec.gun.shells.length - 1,
    input.shellSlot | 0,
  ));
  if (shellSlot !== entity.combat.shellSlot) {
    if (selectShell(entity.combat, shellSlot, entity.spec)) {
      entity._deniedShellSlot = undefined;
    } else {
      // A stale/depleted ammo request must not fire a different, ready
      // weapon merely because its fallback no longer starts a reload.
      entity.input.fire = false;
      if (entity._deniedShellSlot !== shellSlot) {
        emit('ammo_selection_denied', {
          id: entity.id,
          slot: shellSlot,
          reason: 'AMMO_EMPTY',
          guided: entity.spec.gun.shells[shellSlot]?.guided === true,
        });
        entity._deniedShellSlot = shellSlot;
      }
    }
  }
  entity.input.shellSlot = entity.combat.shellSlot;
  decodeAimIntent(input, entity.aerial?.active ? entity.aerial : entity.state.pos, entity.input.aimPoint);
}
