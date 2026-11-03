/**
 * The versioned movement-integrator checkpoint the snapshot's viewer section
 * carries (`movementVersion`, `movementFlags`, `movementValues`). It restores
 * the dynamic state a pose alone cannot reconstruct — springs, ride, spool,
 * retained support — before the unacknowledged ticks are replayed, so the
 * replay forces the suspension exactly as the authority did. There is one
 * codec, `src/sim/movementPredictionState.ts`'s (audit 2026-11-02: this module
 * kept a field-for-field copy that had to move in lockstep with it); this
 * module names it for the wire. The history of the layout:
 * Version 2 (impact physics, 2026-09-25) adds the terrain fit's pure
 * least-squares pitch, which the two-point settle now measures against.
 * Version 3 (bots lane, 2026-10-02) adds the roof a hull rests on
 * (`_body.restSupportY`, flag bit 10): the authority's contact pass seats a
 * hull that settled on another hull's roof every tick, and the client's replay
 * has no contact pass, so without it a hull resting on a wreck sank toward the
 * terrain in every replay and was pulled back up by every snapshot.
 * Version 4 (physics lane, 2026-10-03) adds the gravity tip of a hull whose centre of mass overhangs its loaded
 * track samples (`_terr.tipPitch`, `_terr.tipRoll`, 48 values): the attitude step reads it before the support solve
 * re-derives it, so a replay starting on an edge tipped like the authority only with it.
 * Version 5 (physics lane, 2026-10-03) appends, after the version-4 layout, the rebound a landing's springs still owe and
 * the landing stroke (`_ride.rebound`, `_ride.stroke`) and the weight-transfer share of the suspension rock (`_susp.d`,
 * `_susp.dv`), 52 values: the springs now take a landing at the stroke's damping and return its rebound as they extend,
 * and the tracks are seated without the dive, so a replay mid-landing or mid-stop needs them. A version-4 checkpoint (an
 * older authority) still decodes, as a hull with no landing or dive in progress.
 * Version 6 (physics lane round 3, 2026-10-03) appends the hull's highest track contact beside the seat (`_sup.top`,
 * 53 values): the springs carry a hull on uneven ground under its highest contact, and the ride reads both, so a replay
 * needs the pair. A version-5 or version-4 checkpoint (an older authority) still decodes, its top contact at its seat.
 * Version 7 (physics lane round 5, 2026-10-04) appends the posture a hull holds over its planted tracks on a grade and
 * its share seated with them off a whole-track seat (`_hold`, `_holdSeat`: pitch, roll and their rates, 61 values):
 * they are part of the hull's attitude beside the attitude spring, so a replay on a grade needs them. An older checkpoint
 * still decodes, holding none.
 * Version 8 (physics lane round 8, 2026-10-04) appends the share of the dive the bump stops took when the travel ran out
 * under it (`_susp.c`, `_susp.cv`, 63 values): it is part of the dive's stored value but no part of the dive the travel
 * holds, nor of what joins the rock off a whole-track seat, so a replay needs it to split the two as the authority does.
 * An older checkpoint still decodes, the stops holding nothing.
 * Version 9 (physics, 268) adds the ends at which the last support solve stood the hull on a body contact (`_body.bodyRest`,
 * flag bits 11 and 12, its front and rear; the values are version 8's): an end that rested on one keeps resting on one
 * within a band under the tracks' support (movement.ts keepBodyRest), so a replay on a roof's eave or a parapet fits the
 * plane the authority fitted only with it. A version-8 checkpoint still decodes, resting on no body contact; a build that
 * decodes only version 8 never meets a version-9 host, whose prediction digest refuses it at join
 * (src/mp/wire/matchBuild.ts).
 * The wire carries at most 64 values (`MAX_MOVEMENT_VALUES`; the codec rejects more): version 9 uses 63, so a version
 * adding more than one value widens that limit first.
 */
import type { MovementContactGeometry, TankState } from '../../sim/movement.ts';
import {
  MOVEMENT_PREDICTION_STATE_VALUES, MOVEMENT_PREDICTION_STATE_VERSION, applyMovementPredictionState,
  captureMovementPredictionState,
} from '../../sim/movementPredictionState.ts';

export const MOVEMENT_CHECKPOINT_VERSION = MOVEMENT_PREDICTION_STATE_VERSION;
export const MOVEMENT_CHECKPOINT_VALUES = MOVEMENT_PREDICTION_STATE_VALUES;

export interface MovementCheckpoint {
  version: number;
  values: number[];
  flags: number;
}

/** Capture the checkpoint (the server, the scripted server fixture and the receipts all capture this one layout). */
export const captureMovementCheckpoint: (state: TankState) => MovementCheckpoint | null = captureMovementPredictionState;

/**
 * Restore a checkpoint onto a state; false (and no change) when the layout is not the current version, version 8
 * (decoded resting on no body contact), version 7 (also with nothing in the bump stops), version 6 (also holding no
 * posture over its tracks), version 5 (also with its top contact at its seat) or version 4 (also with no landing stroke
 * or dive in progress), or a value is unsafe.
 */
export const applyMovementCheckpoint: (
  state: TankState, checkpoint: MovementCheckpoint, contact?: MovementContactGeometry | null,
) => boolean = applyMovementPredictionState;
