import { nextPaintFrame } from '../engine/frameScheduler.ts';

interface TransitionCoverOptions {
  isCurrent(): boolean;
  yieldPaint?: () => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
}

/** Wait for actual CSS opacity, then leave the pre-paint checkpoint before work.
 * This is a rendering opportunity, not a physical display acknowledgement.
 * Hidden documents may continue: waiting for a paint there would deadlock entry.
 */
export async function waitForOpaqueTransition(
  root: HTMLElement,
  { isCurrent, yieldPaint = nextPaintFrame, now = () => performance.now(), maxWaitMs = 1000 }: TransitionCoverOptions,
): Promise<void> {
  if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) throw new RangeError('Invalid transition cover deadline');
  const startedAt = now();
  const assertCurrent = (): void => {
    if (!isCurrent()) throw new DOMException('Transition cover was superseded', 'AbortError');
  };
  for (;;) {
    assertCurrent();
    if (document.hidden) return;
    if (root.getClientRects().length > 0 && Number(getComputedStyle(root).opacity) >= 0.999) {
      await yieldPaint();
      assertCurrent();
      return;
    }
    if (now() - startedAt >= maxWaitMs) throw new Error('Transition cover did not become opaque');
    await yieldPaint();
  }
}
