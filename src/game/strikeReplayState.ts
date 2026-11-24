/**
 * strikeReplayState.ts — the aircraft a kill cam replay shows (killcam-strike-shot-276). While a replay of an Air Support
 * kill is on screen the kill cam writes its strike's record and the replay's own clock here; the air-support world
 * (airSupportWorld.ts) then draws that strike's aircraft and stores flown from the record at that time, and hides every
 * live one, so the aircraft in the replay is where its run put it when the round left, never where it flies now. The
 * kill cam clears it when its replay leaves the screen. Presentation state, as strikeViewState.ts is.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { RunRecord } from '../sim/strikeRuns.ts';

interface StrikeReplayStage {
  /** The replayed strike's record, or null: no replay is staging an aircraft. */
  record: RunRecord | null;
  /** The replay's clock (game seconds on the strike's own timeline). */
  timeS: number;
}

export const strikeReplay: StrikeReplayStage = { record: null, timeS: 0 };
