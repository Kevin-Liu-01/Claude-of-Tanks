/**
 * killcamStage.ts — what a live kill cam replay asks of the world (killcam-strike-shot-276). The kill cam sets `live`
 * when a replay begins and clears it when the replay leaves the screen; while it is set the mode world
 * (matchModeWorldPresentation.ts) hides its world-anchored markers (the capture plates and arcs, the objective icons,
 * the beacons, the spawn and flag-base rings, the range's lane boards) and gives each its own visibility back after,
 * as the body's cot-kc-live veil hides the HUD trays. While a replay of an Air Support kill is on screen the kill cam
 * also writes its strike's record and the replay's own clock here; the air-support world (airSupportWorld.ts) then
 * draws that strike's aircraft and stores flown from the record at that time, and hides every live one, so the aircraft
 * in the replay is where its run put it when the round left, never where it flies now. Presentation state, as
 * strikeViewState.ts is. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { RunRecord } from '../sim/strikeRuns.ts';

interface KillcamStage {
  /** A kill cam replay owns the screen (from its begin to its teardown). */
  live: boolean;
  /** The replayed strike's record, or null: no replay is staging an aircraft. */
  strike: RunRecord | null;
  /** The replay's clock (game seconds on the strike's own timeline). */
  strikeTimeS: number;
}

export const killcamStage: KillcamStage = { live: false, strike: null, strikeTimeS: 0 };
