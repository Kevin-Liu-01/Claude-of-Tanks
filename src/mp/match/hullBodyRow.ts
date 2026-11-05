/**
 * A hull's body bits on a snapshot row (audit M8, 2026-11-02): ground contact, the body mode (src/sim/hullBodyMode.ts)
 * and whether the hull is supported by another hull or elevated above its own static support (src/sim/tankBodyContacts.ts
 * hullBearsOnBody; a plain jump more than 0.5 m up sets it too). The authority's row capture packs them
 * (server/match/entityRows.ts) through the sim's one packer (tankBodyContacts.ts hullBodyFlags, which the viewer snapshot
 * uses too); the clients restore them onto their copies of the hull: the viewer's predicted hull before its checkpoint
 * (prediction.ts applyAuthorityRow) and every presented hull (battlePresentation.ts applySamplePose), whose state the
 * prediction world's tank contacts read (prefersVerticalTankContact). The remote interpolator reads the rigid phase from
 * the same bits (RIGID_PHASE_ROW_FLAGS: interpolation.ts continueRow).
 *
 * Wire 10 carries the rigid phase itself (TUMBLING) and the support (STACKED). Before, a client rebuilt the tumble as
 * overturned-or-righting, so a remote hull in a plain tumble on the ground (a stack kick, a landing on its side: rigid,
 * neither overturned nor righting) was a supported hull to the client; and the client judged a stack from its copy's
 * support cache, which a copy never fills (it stays at the copy's creation at the origin): every presented hull standing
 * more than 0.5 m above world zero read as a stack, hill traffic included, and a roof rest lower than that read as ground.
 * Either way the client's prediction resolved the pair one way (a horizontal push, or none) and the authority the other,
 * and the next snapshot corrected the viewer's hull.
 *
 * Pure flag logic, Node-runnable, no allocation.
 */
import { ENTITY_FLAGS } from '../wire/constants.ts';
import { restoreHullBodyMode, setHullGrounded } from '../../sim/hullBodyMode.ts';
import type { HullBodyState, HullGroundState } from '../../sim/hullBodyMode.ts';
import { hullBodyFlags } from '../../sim/tankBodyContacts.ts';

/** The row flags this module owns. */
export const HULL_BODY_ROW_FLAGS = ENTITY_FLAGS.AIRBORNE | ENTITY_FLAGS.OVERTURNED | ENTITY_FLAGS.AUTO_RIGHTING |
  ENTITY_FLAGS.TUMBLING | ENTITY_FLAGS.STACKED;
/**
 * The rigid phase on a row: TUMBLING itself and its two sub-states, which imply it (hullBodyMode.ts). A plain tumble is
 * TUMBLING alone; before wire 10 a reader could only test OVERTURNED|AUTO_RIGHTING and missed it (round 2, U14).
 */
export const RIGID_PHASE_ROW_FLAGS = ENTITY_FLAGS.TUMBLING | ENTITY_FLAGS.OVERTURNED | ENTITY_FLAGS.AUTO_RIGHTING;
/** The body bits whose change between two rows ends a pose's continuation: ground contact and the rigid phase. */
export const BODY_PHASE_ROW_FLAGS = ENTITY_FLAGS.AIRBORNE | RIGID_PHASE_ROW_FLAGS;

/** The authority's hull state the row reads. */
export interface HullBodyRowSource extends HullBodyState, HullGroundState {
  pos: { y: number };
  _sup?: { y: number; top?: number };
  _body?: { tumbling?: boolean; autoRighting?: boolean; dynamicSupport?: boolean; restSupportY?: number };
}

/** A client's presented copy of another hull: never stepped, no contact pass, no support cache of its own. */
export interface PresentedHullState extends HullBodyState, HullGroundState {
  _sup: { top?: number };
  _body: { tumbling?: boolean; autoRighting?: boolean; dynamicSupport?: boolean };
}

/** The authority hull's body bits for its row (the rest of the row's flags are combat and input). */
export function hullBodyRowFlags(state: HullBodyRowSource): number {
  return hullBodyFlags(state, ENTITY_FLAGS);
}

/**
 * A row's ground contact and body mode onto a client copy of the hull: both copies of ground contact, and the mode through
 * its owner. The bits of a legal authority mode restore it exactly; a row without TUMBLING but with a sub-state (a
 * hand-built row) still restores the rigid phase it implies (restoreHullBodyMode), never a dead end.
 */
export function applyHullBodyRowFlags(state: HullBodyState & HullGroundState, flags: number): void {
  setHullGrounded(state, (flags & ENTITY_FLAGS.AIRBORNE) === 0);
  restoreHullBodyMode(state, (flags & ENTITY_FLAGS.OVERTURNED) !== 0, (flags & ENTITY_FLAGS.TUMBLING) !== 0,
    (flags & ENTITY_FLAGS.AUTO_RIGHTING) !== 0);
}

/**
 * A row's body bits onto a presented copy of another hull (battlePresentation.ts): the ground contact and body mode, and
 * the support as the authority judged it. The copy's support cache is not its own, so it stands at Infinity (never
 * elevated) and the row's STACKED holds the copy's support flag: the tank contacts read the authority's answer
 * (tankBodyContacts.ts hullBearsOnBody). Never for the viewer's predicted hull, whose cache the checkpoint restores.
 */
export function applyPresentedHullRowFlags(state: PresentedHullState, flags: number): void {
  applyHullBodyRowFlags(state, flags);
  state._sup.top = Infinity;
  state._body.dynamicSupport = (flags & ENTITY_FLAGS.STACKED) !== 0;
}
