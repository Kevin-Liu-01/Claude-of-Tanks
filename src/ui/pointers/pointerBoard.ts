/**
 * pointerBoard.ts — where a surface outside the HUD hands the battle's pointer layer its follow pointer
 * (guidance-pointers-275). Copyright © 2026 Kevin B. Liu.
 *
 * The tutorial's guide (ui/tutorial/tutorialGuide.ts) loads with the tutorial's chunk and the pointer layer with the HUD's
 * (pointerLayer.ts, drawn by hud.ts), so neither imports the other: the guide posts its step's place here while it shows,
 * and the HUD reads it each frame beside the mode's own (pointerPlan.ts pickFollow puts the tutorial's first). Tiny and
 * dependency-free, so either chunk may carry it.
 */
import type { FollowPointer } from './pointerPlan.ts';

let guide: FollowPointer | null = null;

/** The tutorial's follow pointer while its guide shows one, or null. */
export function setGuideFollow(pointer: FollowPointer | null): void {
  guide = pointer;
}

export function guideFollow(): FollowPointer | null {
  return guide;
}
