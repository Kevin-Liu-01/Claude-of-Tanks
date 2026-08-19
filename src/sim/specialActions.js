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
const RESULT_RELOAD = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD, active: true });
const RESULT_SUSPENSION_ON = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: true });
const RESULT_SUSPENSION_OFF = Object.freeze({ ok: true, kind: SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM, active: false });
const DESCRIPTOR_NONE = Object.freeze({ kind: SPECIAL_ACTION_KINDS.NONE, label: '', shortLabel: '' });
const DESCRIPTOR_MISSILE = Object.freeze({
  kind: SPECIAL_ACTION_KINDS.GUIDED_MISSILE, label: 'Launch ATGM', shortLabel: 'ATGM',
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
    pendingFire: false,
    restoringShell: false,
    returnShellSlot: 0,
  };
}

/** True while an ATGM launch owns the shell selector. */
export function specialActionLocksShell(entity) {
  const action = entity?.specialAction;
  return !!(action && (action.pendingFire || action.restoringShell));
}

/**
 * Consume one special-action press.
 * Missile requests select the existing guided shell and let the normal reload
 * and firing pipeline launch it when ready. No parallel weapon simulation is
 * introduced.
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
    if (action.pendingFire || action.restoringShell) return RESULT_BUSY;
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

/** Does the normal firing path need to launch a queued missile this tick? */
export function specialActionWantsFire(entity) {
  const action = entity?.specialAction;
  return !!(action?.pendingFire && entity.combat?.shellSlot === action.missileSlot &&
    entity.combat.reload?.t <= 0);
}

/** Mark the queued missile as fired; retain its slot through its real reload. */
export function finishSpecialActionFire(entity) {
  const action = entity?.specialAction;
  if (!action?.pendingFire) return;
  action.pendingFire = false;
  action.restoringShell = action.returnShellSlot !== action.missileSlot;
  if (!action.restoringShell) action.active = false;
}

/**
 * Complete an ATGM cycle and return to the shell that was selected before the
 * special press. The missile's full post-shot reload has already elapsed, so
 * this bookkeeping switch does not start a second load.
 */
export function tickSpecialAction(entity) {
  const action = entity?.specialAction;
  if (!action?.restoringShell || entity.combat?.reload?.t > 0) return false;
  const maxSlot = Math.max(0, (entity.spec?.gun?.shells?.length || 1) - 1);
  const slot = Math.max(0, Math.min(maxSlot, action.returnShellSlot | 0));
  entity.combat.shellSlot = slot;
  if (entity.input) entity.input.shellSlot = slot;
  action.restoringShell = false;
  action.active = false;
  return true;
}
