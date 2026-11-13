/**
 * strikeViewState.ts — the crew's own strike view (air-support-270; owner 2026-11-05: "if you ativatee the thing it goes in
 * with a transition to an airstrike view where you can enter a special binocular view and theres a giant aiming reticle on
 * the ground"): whether the binoculars are up, which call-in is picked, and where its reticle stands. The HUD and the input
 * write it; the world presentation draws the reticle from it (game/airSupportWorld.ts), the camera rig reads `open` and the
 * transition. Presentation state, and the order's owner (game/strikeOrder.ts): the call itself is the action bit at the
 * aim point (sim/playerActions.ts).
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { AirStrikeKind } from '../sim/matchRuleset.ts';
import { createStrikeOrder, type StrikeOrder } from './strikeOrder.ts';

/** The call-ins' names, for the owners that take the sim's rules as ports (game/playerBattleActions.ts). */
export type { AirStrikeKind };

export interface StrikeViewState {
  /** The binoculars are up (or going up: `blend` rises 0 -> 1 over the transition, falls back on the way out). */
  open: boolean;
  blend: number;
  kind: AirStrikeKind;
  /** The reticle's ground point (the aim point's), the run's heading from the hull toward it and its range (m). */
  x: number; y: number; z: number;
  heading: number;
  rangeM: number;
  /** The crew's call: sent, called, refused (game/strikeOrder.ts owns every transition; readers only read it). */
  readonly order: StrikeOrder;
}

export const strikeView: StrikeViewState = {
  open: false, blend: 0, kind: 'recon', x: 0, y: 0, z: 0, heading: 0, rangeM: 0, order: createStrikeOrder(),
};

/** The transition's length (s): the camera rises into the binoculars and settles. */
export const STRIKE_VIEW_TRANSITION_S = 0.6;
