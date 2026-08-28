/**
 * Context-sensitive vehicle special actions.
 *
 * This module owns only deterministic simulation state. The input layer maps
 * keyboard, controller, and touch presses onto one action bit; solo and
 * authoritative matches call the same edge-triggered functions below.
 */
import {
  magazineReloadDenialReason,
  startMagazineReload,
} from './damage.ts';
import type { CombatState, DamageTankSpec } from './damage.ts';
import {
  SPECIAL_ACTION_KINDS,
} from './specialActionPolicy.ts';
import type {
  SpecialActionKind,
  SpecialActionSpec,
  SpecialActionState,
} from './specialActionPolicy.ts';
export {
  SPECIAL_ACTION_KINDS,
  createSpecialActionState,
  specialActionDescriptor,
  specialActionKind,
  specialActionLocksShell,
} from './specialActionPolicy.ts';

export interface SpecialActionResult {
  ok: boolean;
  kind: SpecialActionKind;
  reason?: string;
  active?: boolean;
}

interface SpecialActionEntity {
  spec?: SpecialActionSpec & DamageTankSpec;
  state?: { suspensionAim?: boolean };
  combat?: CombatState;
  input?: { shellSlot?: number };
  specialAction?: SpecialActionState;
}

interface GuidedShellLike {
  id?: string | number;
  spec?: { guided?: unknown };
}

const RESULT_NONE: Readonly<SpecialActionResult> = Object.freeze({
  ok: false, kind: SPECIAL_ACTION_KINDS.NONE, reason: 'UNAVAILABLE',
});
const RESULT_BUSY = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, reason: 'BUSY' });
const RESULT_RELOAD_FULL = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'MAGAZINE_FULL' });
const RESULT_RELOAD_ACTIVE = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'MAGAZINE_RELOADING' });
const RESULT_RELOAD_UNAVAILABLE = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'NO_MAGAZINE' });
const RESULT_MISSILE = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, active: true });
const RESULT_MISSILE_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, active: false });
const RESULT_RELOAD = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, active: true });
const RESULT_SUSPENSION_ON = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: true });
const RESULT_SUSPENSION_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: false });

function restoreMissileSelection(entity: SpecialActionEntity | null | undefined): boolean {
  const action = entity?.specialAction;
  const combat = entity?.combat;
  if (!action || !combat) return false;
  const maxSlot = Math.max(0, (entity.spec?.gun?.shells?.length || 1) - 1);
  const slot = Math.max(0, Math.min(maxSlot, action.returnShellSlot | 0));
  action.active = false;
  action.pendingFire = false;
  action.inFlightShellId = null;
  combat.shellSlot = slot;
  combat.reload.t = Math.max(0, Number(action.returnReloadT) || 0);
  combat.reload.totalS = Math.max(0, Number(action.returnReloadTotalS) || 0);
  combat.reload.kind = action.returnReloadKind || (combat.reload.t > 0 ? 'shell' : 'ready');
  if (entity.input) entity.input.shellSlot = slot;
  return true;
}

/**
 * Consume one special-action press.
 * Missile requests arm the guided launcher immediately. The normal fire input
 * launches it; E never starts a hidden ammunition-switch reload.
 */
export function activateSpecialAction(
  entity: SpecialActionEntity | null | undefined,
): Readonly<SpecialActionResult> {
  const action = entity?.specialAction;
  const combat = entity?.combat;
  if (!action || !combat || combat.destroyed) return RESULT_NONE;

  if (action.kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) {
    action.active = !action.active;
    if (entity.state) entity.state.suspensionAim = action.active;
    return action.active ? RESULT_SUSPENSION_ON : RESULT_SUSPENSION_OFF;
  }

  if (action.kind === SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD) {
    const denied = magazineReloadDenialReason(combat);
    if (denied === 'MAGAZINE_FULL') return RESULT_RELOAD_FULL;
    if (denied === 'MAGAZINE_RELOADING') return RESULT_RELOAD_ACTIVE;
    if (denied) return RESULT_RELOAD_UNAVAILABLE;
    return startMagazineReload(combat, entity.spec!) ? RESULT_RELOAD : RESULT_RELOAD_UNAVAILABLE;
  }

  if (action.kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) {
    if (action.inFlightShellId != null) return RESULT_BUSY;
    if (action.active) {
      restoreMissileSelection(entity);
      return RESULT_MISSILE_OFF;
    }
    const slot = action.missileSlot;
    if (slot < 0 || !entity.spec?.gun?.shells?.[slot]) return RESULT_NONE;
    action.returnShellSlot = combat.shellSlot;
    action.returnReloadT = combat.reload.t;
    action.returnReloadTotalS = combat.reload.totalS;
    action.returnReloadKind = combat.reload.kind;
    action.pendingFire = true;
    action.active = true;
    combat.shellSlot = slot;
    combat.reload.t = 0;
    combat.reload.totalS = 0;
    combat.reload.kind = 'ready';
    if (entity.input) entity.input.shellSlot = slot;
    return RESULT_MISSILE;
  }

  return RESULT_NONE;
}

/** Mark the click-fired missile as the one currently guided by the cursor. */
export function finishSpecialActionFire(
  entity: SpecialActionEntity | null | undefined,
  shellId: string | number,
): boolean {
  const action = entity?.specialAction;
  if (!action?.active || !action.pendingFire || action.inFlightShellId != null) return false;
  action.pendingFire = false;
  action.inFlightShellId = shellId;
  return true;
}

/**
 * True only for the live missile owned by this entity's engaged guidance
 * channel. Authorities use this gate before applying cursor steering.
 */
export function specialActionGuidesShell(
  entity: SpecialActionEntity | null | undefined,
  shell: GuidedShellLike | null | undefined,
): boolean {
  if (entity?.spec?.gun?.primaryGuided === true && shell?.spec?.guided === true) return true;
  const action = entity?.specialAction;
  return !!(action?.active && action.inFlightShellId === shell?.id && shell?.spec?.guided);
}

/** Disengage guidance on impact/expiry and restore the pre-E weapon. */
export function completeGuidedMissileFlight(
  entity: SpecialActionEntity | null | undefined,
  shellId: string | number,
): boolean {
  const action = entity?.specialAction;
  if (!action?.active || action.inFlightShellId !== shellId) return false;
  return restoreMissileSelection(entity);
}
