/**
 * Typecheck fixture (round 8 Y3): never imported; `npm run typecheck` compiles it with the rest of src. Each expectation
 * below is a type error the audio owners must keep raising, and `@ts-expect-error` turns its absence into the
 * typecheck's own failure (an unused directive).
 *
 * - s1-14: the crew's mode events are the controller's (modeSounds.ts MODE_EVENT_TYPES): a list that names an event the
 *   controller does not emit is refused, as the crew's own list (crewProcedure.ts CREW_MODE_EVENTS) is typed.
 */
import type { ModeEventType } from './modeSounds.ts';

// @ts-expect-error a name the mode controller never emits is no mode event: the crew would wait for it in silence
void (['flag_dropped', 'not_a_mode_event'] as const satisfies readonly ModeEventType[]);
