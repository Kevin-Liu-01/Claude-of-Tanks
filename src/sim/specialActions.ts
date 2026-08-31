/**
 * Context-sensitive vehicle special actions.
 *
 * This module owns only deterministic simulation state. The input layer maps
 * keyboard, controller, and touch presses onto one action bit; solo and
 * authoritative matches call the same edge-triggered functions below.
 */
import {
  magazineReloadDenialReason,
  selectShell,
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
  guidedMissileSlot,
  specialActionDescriptor,
  specialActionIsActive,
  specialActionKind,
} from './specialActionPolicy.ts';

export interface SpecialActionResult {
  ok: boolean;
  kind: SpecialActionKind;
  reason?: string;
  active?: boolean;
  slot?: number;
}

export interface SpecialActionEntity {
  spec?: (SpecialActionSpec & DamageTankSpec) | null;
  state?: { suspensionAim?: boolean } | null;
  combat?: CombatState | null;
  input?: { shellSlot?: number };
  specialAction?: SpecialActionState | null;
}

interface GuidedShellLike {
  spec?: { guided?: unknown };
}

const RESULT_NONE: Readonly<SpecialActionResult> = Object.freeze({
  ok: false, kind: SPECIAL_ACTION_KINDS.NONE, reason: 'UNAVAILABLE',
});
const RESULT_RELOAD_FULL = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'MAGAZINE_FULL' });
const RESULT_RELOAD_ACTIVE = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'MAGAZINE_RELOADING' });
const RESULT_RELOAD_UNAVAILABLE = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'NO_MAGAZINE' });
const RESULT_RELOAD = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, active: true });
const RESULT_SUSPENSION_ON = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: true });
const RESULT_SUSPENSION_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: false });

/**
 * Consume one special-action press.
 * Missile requests are ordinary ammunition selection. The normal fire input
 * launches the selected round after its own authored reload.
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
    const slot = action.missileSlot;
    if (slot < 0 || !entity.spec?.gun?.shells?.[slot]) return RESULT_NONE;
    selectShell(combat, slot, entity.spec!);
    if (entity.input) entity.input.shellSlot = slot;
    return Object.freeze({
      ok: true,
      kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE,
      // `active` describes the visible selected state, not a second hidden
      // missile mode. The canonical state remains combat.shellSlot.
      active: true,
      slot,
    });
  }

  return RESULT_NONE;
}

/**
 * Every guided round uses the same cursor-steering behavior. Ammunition choice
 * no longer depends on a hidden special-action mode.
 */
export function specialActionGuidesShell(
  entity: SpecialActionEntity | null | undefined,
  shell: GuidedShellLike | null | undefined,
): boolean {
  return !!(entity?.combat && !entity.combat.destroyed && shell?.spec?.guided === true);
}
