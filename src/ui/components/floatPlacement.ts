// Where a floating label sits beside its anchor, for the kit's hover tip (hoverTip.ts) and the rich tooltip
// (src/ui/richTooltip.ts): below the anchor when there is at least as much room below as above, else above it, `gap` px
// off the anchor and at least `edge` px inside the viewport on every side. Pure geometry, so its receipt runs in Node.
// Copyright © 2026 Kevin B. Liu.

interface Box { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number }
interface Size { readonly width: number; readonly height: number }

interface FloatPlacement {
  readonly x: number;
  readonly y: number;
  /** Whether it opens below the anchor. */
  readonly below: boolean;
  /** The height free on the side it opens to. */
  readonly room: number;
}

export function placeFloat(anchor: Box, size: Size, viewport: Size, gap = 10, edge = 8): FloatPlacement {
  const roomAbove = Math.max(0, anchor.top - gap - edge);
  const roomBelow = Math.max(0, viewport.height - anchor.bottom - gap - edge);
  const below = roomBelow >= roomAbove;
  const x = Math.max(edge, Math.min(viewport.width - size.width - edge, anchor.left + anchor.width / 2 - size.width / 2));
  const y = below
    ? Math.min(viewport.height - size.height - edge, anchor.bottom + gap)
    : Math.max(edge, anchor.top - size.height - gap);
  return { x, y, below, room: below ? roomBelow : roomAbove };
}
