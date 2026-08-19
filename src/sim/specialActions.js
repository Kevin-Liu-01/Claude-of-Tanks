/**
 * Context-sensitive vehicle special actions.
 *
 * This module owns only deterministic simulation state. The input layer maps
 * keyboard, controller, and touch presses onto one action bit; solo and
 * authoritative matches call the same edge-triggered functions below.
 */
import {
  selectShell,
  startMagazineReload,
} from './damage.js';

export const SPECIAL_ACTION_KINDS = Object.freeze({
  NONE: 'none',
  GUIDED_MISSILE: 'guided_missile',
  HYDROPNEUMATIC_AIM: 'hydropneumatic_aim',
  MAGAZINE_RELOAD: 'magazine_reload',
});

const HYDROPNEUMATIC_IDS = new Set(['strv103', 'strv103a']);

const RESULT_NONE = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.NONE, reason: 'UNAVAILABLE' });
const RESULT_BUSY = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, reason: 'BUSY' });
const RESULT_RELOAD_DENIED = Object.freeze({ ok: false, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, reason: 'FULL_OR_RELOADING' });
const RESULT_MISSILE = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, active: true });
const RESULT_MISSILE_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, active: false });
const RESULT_RELOAD = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, active: true });
const RESULT_SUSPENSION_ON = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: true });
const RESULT_SUSPENSION_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: false });
const DESCRIPTOR_NONE = Object.freeze({ kind: SPECIAL_ACTION_KINDS.NONE, label: '', shortLabel: '' });
const DESCRIPTOR_MISSILE = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, label: 'ATGM Guidance', shortLabel: 'ATGM',
});
const DESCRIPTOR_SUSPENSION = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM,
  label: 'Suspension Aim',
  shortLabel: 'Suspension',
});
const DESCRIPTOR_RELOAD = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD,
  label: 'Reload Magazine',
  shortLabel: 'Reload',
});

/** Return the guided shell slot, or -1 when this vehicle has no ATGM. */
export function guidedMissileSlot(spec) {
  const shells = spec?.gun?.shells;
  if (!Array.isArray(shells)) return -1;
  for (let i = 0; i < shells.length; i++) {
    if (shells[i]?.guided === true) return i;
  }
  return -1;
}

/** Resolve the single primary action presented by the context button. */
export function specialActionKind(spec) {
  if (!spec) return SPECIAL_ACTION_KINDS.NONE;
  if (HYDROPNEUMATIC_IDS.has(spec.id)) return SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM;
  if (guidedMissileSlot(spec) >= 0) return SPECIAL_ACTION_KINDS.GUIDED_MISSILE;
  if (spec.gun?.autoloader) return SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD;
  return SPECIAL_ACTION_KINDS.NONE;
}

/** Immutable presentation copy for a spec; safe to cache for an entire battle. */
export function specialActionDescriptor(spec) {
  const kind = specialActionKind(spec);
  if (kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) return DESCRIPTOR_MISSILE;
  if (kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) return DESCRIPTOR_SUSPENSION;
  if (kind === SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD) return DESCRIPTOR_RELOAD;
  return DESCRIPTOR_NONE;
}

/** Create the small per-entity state record used by special actions. */
export function createSpecialActionState(spec) {
  return {
    kind: specialActionKind(spec),
    missileSlot: guidedMissileSlot(spec),
    active: false,
    // For ATGMs, pendingFire means the guidance channel is armed and waiting
    // for the player's normal fire click. E never pulls the trigger itself.
    pendingFire: false,
    inFlightShellId: null,
    returnShellSlot: 0,
  };
}

/** True while an engaged ATGM channel owns the shell selector. */
export function specialActionLocksShell(entity) {
  const action = entity?.specialAction;
  return !!(action?.kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE && action.active);
}

function restoreMissileSelection(entity) {
  const action = entity?.specialAction;
  const combat = entity?.combat;
  if (!action || !combat) return false;
  const maxSlot = Math.max(0, (entity.spec?.gun?.shells?.length || 1) - 1);
  const slot = Math.max(0, Math.min(maxSlot, action.returnShellSlot | 0));
  action.active = false;
  action.pendingFire = false;
  action.inFlightShellId = null;
  if (combat.shellSlot !== slot) selectShell(combat, slot, entity.spec);
  if (entity.input) entity.input.shellSlot = slot;
  return true;
}

/**
 * Consume one special-action press.
 * Missile requests select the existing guided shell and arm cursor guidance.
 * The normal fire input launches it only after the selected rail is ready.
 */
export function activateSpecialAction(entity) {
  const action = entity?.specialAction;
  const combat = entity?.combat;
  if (!action || !combat || combat.destroyed) return RESULT_NONE;

  if (action.kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) {
    action.active = !action.active;
    if (entity.state) entity.state.suspensionAim = action.active;
    return action.active ? RESULT_SUSPENSION_ON : RESULT_SUSPENSION_OFF;
  }

  if (action.kind === SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD) {
    return startMagazineReload(combat, entity.spec) ? RESULT_RELOAD : RESULT_RELOAD_DENIED;
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
    action.pendingFire = true;
    action.active = true;
    if (combat.shellSlot !== slot) selectShell(combat, slot, entity.spec);
    if (entity.input) entity.input.shellSlot = slot;
    return RESULT_MISSILE;
  }

  return RESULT_NONE;
}

/** Mark the click-fired missile as the one currently guided by the cursor. */
export function finishSpecialActionFire(entity, shellId) {
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
export function specialActionGuidesShell(entity, shell) {
  const action = entity?.specialAction;
  return !!(action?.active && action.inFlightShellId === shell?.id && shell?.spec?.guided);
}

/** Disengage guidance on impact/expiry and restore the pre-E weapon. */
export function completeGuidedMissileFlight(entity, shellId) {
  const action = entity?.specialAction;
  if (!action?.active || action.inFlightShellId !== shellId) return false;
  return restoreMissileSelection(entity);
}
