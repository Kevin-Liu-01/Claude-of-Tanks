import { nextPaintFrame } from '../engine/frameScheduler.ts';

interface TransitionCoverOptions {
  isCurrent(): boolean;
  yieldPaint?: () => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
  /**
   * Rendered frames the fade gets before the deadline applies (2026-10-24, transitions-250): a loaded main thread paints
   * few frames a second, and its delayed fade-in timer starts late, so a wall-clock second alone ran out mid-fade (a
   * probe polling every 25 ms stranded a Studio exit).
   */
  minFrames?: number;
  /**
   * Make the cover opaque at once, without its fade, when the fade has not finished by the deadline. The wait then
   * proceeds behind the forced cover; it fails only when even the forced cover does not read opaque (broken CSS).
   */
  forceOpaque?: () => void;
}

/** Wait for actual CSS opacity, then leave the pre-paint checkpoint before work.
 * This is a rendering opportunity, not a physical display acknowledgement.
 * Hidden documents may continue: waiting for a paint there would deadlock entry.
 */
export async function waitForOpaqueTransition(
  root: HTMLElement,
  {
    isCurrent, yieldPaint = nextPaintFrame, now = () => performance.now(), maxWaitMs = 1000, minFrames = 12, forceOpaque,
  }: TransitionCoverOptions,
): Promise<void> {
  if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) throw new RangeError('Invalid transition cover deadline');
  if (!Number.isInteger(minFrames) || minFrames < 1) throw new RangeError('Invalid transition cover frame count');
  const startedAt = now();
  const assertCurrent = (): void => {
    if (!isCurrent()) throw new DOMException('Transition cover was superseded', 'AbortError');
  };
  let frames = 0;
  let forced = false;
  for (;;) {
    assertCurrent();
    if (document.hidden) return;
    if (root.getClientRects().length > 0 && Number(getComputedStyle(root).opacity) >= 0.999) {
      await yieldPaint();
      assertCurrent();
      return;
    }
    if (now() - startedAt >= maxWaitMs && frames >= minFrames) {
      if (forced || !forceOpaque) throw new Error('Transition cover did not become opaque');
      forceOpaque();
      forced = true;
      // the forced cover is read again after one more frame (and fails then only if it still is not opaque)
      frames = minFrames - 1;
    }
    await yieldPaint();
    frames++;
  }
}
