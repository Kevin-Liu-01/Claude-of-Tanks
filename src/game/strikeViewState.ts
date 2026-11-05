/**
 * strikeViewState.ts — the crew's own strike view (air-support-270; owner 2026-11-05: "if you ativatee the thing it goes in
 * with a transition to an airstrike view where you can enter a special binocular view and theres a giant aiming reticle on
 * the ground"): whether the binoculars are up, which call-in is picked, and where its reticle stands. The HUD and the input
 * write it; the world presentation draws the reticle from it (game/airSupportWorld.ts), the camera rig reads `open` and the
 * transition. Presentation state only: the call itself is the action bit at the aim point (sim/playerActions.ts).
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { AirStrikeKind } from '../sim/matchRuleset.ts';

export interface StrikeViewState {
  /** The binoculars are up (or going up: `blend` rises 0 -> 1 over the transition, falls back on the way out). */
  open: boolean;
  blend: number;
  kind: AirStrikeKind;
  /** The reticle's ground point (the aim point's), and the run's heading from the hull toward it. */
  x: number; y: number; z: number;
  heading: number;
  /** The mark can be called now (in reach, affordable, off cooldown, the side's air not full). */
  ready: boolean;
  /** A call just went out: the reticle locks and flashes until this time (presentation clock, s). */
  lockedUntilS: number;
}

export const strikeView: StrikeViewState = {
  open: false, blend: 0, kind: 'recon', x: 0, y: 0, z: 0, heading: 0, ready: false, lockedUntilS: 0,
};

/** The transition's length (s): the camera rises into the binoculars and settles. */
export const STRIKE_VIEW_TRANSITION_S = 0.6;
