/**
 * The touch action dock yields to the reticle wherever the reticle actually draws (verifier 2026-10-15).
 *
 * touchActionDock.ts keeps the dock off everything the reticle draws around the screen centre. Three things the reticle
 * canvas (.cot-ret, hud.ts) draws are not there:
 * - the dispersion ring and the physical gun mark ride the gun's own point (view.gunX/gunY), which separates from the
 *   crosshair whenever the turret or gun lags the camera, hits a limit or is blocked; a turretless sight (Strv 103,
 *   Jagdpanzer E100) moves its whole sight there, readouts included, held 40 px inside the screen edge;
 * - the incoming-hit wedges, drawn round the centre from max(0.185 x shorter side, ring + 26) px out, about 64 px thick,
 *   with the damage figure ("-420", "CRIT") beyond them;
 * - the hit-confirm shards round the crosshair.
 * How far the gun mark drifts has no useful bound: a 60 px touch flick turns the camera 8.9 degrees, and with the
 * slowest turret (9.2 deg/s) the mark leaves the screen, so a static keep-out sized for it would leave no room for any
 * tile (docs/BATTLE-UI-QA.md, "Gun mark drift"). Instead the dock sits under the reticle canvas (battleHudLayout.css),
 * so nothing the reticle draws is ever covered, and each tile the live ink reaches dims (data-ret-yield) so that ink
 * reads clearly over it; the tile stays where it is and still takes taps. hud.ts reports the ink each frame it paints
 * (discs, boxes, wedge sectors); a tile dims once ink comes within ENTER_PX of it and clears only when all ink is
 * LEAVE_PX away, so a ring breathing at a tile's edge cannot flicker it.
 *
 * DOM-light and allocation-free per frame: the zones live in fixed typed arrays, and an attribute is written only when
 * a tile's state changes. touchDockYield.selftest.mjs checks the geometry and the hysteresis in plain Node.
 */

export interface DockYieldTile {
  readonly el: { toggleAttribute(name: string, force?: boolean): boolean };
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** A control waiting behind More: it shows, and so yields, only while the More panel is open. */
  readonly panel: boolean;
}

/** Ink this close to a tile dims it. */
export const DOCK_YIELD_ENTER_PX = 2;
/** A dimmed tile clears only when all ink is at least this far away. */
export const DOCK_YIELD_LEAVE_PX = 10;
export const DOCK_YIELD_ATTRIBUTE = 'data-ret-yield';
const MAX_DISCS = 24;
const MAX_RECTS = 48;
const MAX_SECTORS = 8;
/** Sector boundaries are sampled at this spacing at most (px of arc or edge), well inside the tile margins. */
const SECTOR_STEP_PX = 3;

export interface DockYield {
  /** The placed tiles in viewport px (battleHudLayout.ts publishes them whenever the dock is placed or cleared). */
  setTiles(tiles: readonly DockYieldTile[]): void;
  setOpen(open: boolean): void;
  /** True while there are tiles to yield: hud.ts skips reporting ink otherwise. */
  readonly active: boolean;
  /** Starts a painted frame's ink. */
  begin(): void;
  disc(x: number, y: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  /** An annular sector round (cx, cy): radii r0..r1, centred on angle `a` (canvas radians), `half` either side. */
  sector(cx: number, cy: number, r0: number, r1: number, a: number, half: number): void;
  /** Ends the frame: dims the tiles the ink reaches, clears those it has left. */
  commit(): void;
}

/** Distance from (x, y) to the rect (0 inside). */
function rectDistance(x: number, y: number, rx: number, ry: number, rw: number, rh: number): number {
  const dx = Math.max(rx - x, 0, x - rx - rw), dy = Math.max(ry - y, 0, y - ry - rh);
  return Math.hypot(dx, dy);
}

function angleIn(a: number, centre: number, half: number): boolean {
  let d = (a - centre) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= half;
}

/** Whether the point lies in the annular sector. */
export function pointInSector(x: number, y: number, cx: number, cy: number, r0: number, r1: number, a: number, half: number): boolean {
  const r = Math.hypot(x - cx, y - cy);
  return r >= r0 && r <= r1 && (half >= Math.PI || angleIn(Math.atan2(y - cy, x - cx), a, half));
}

/**
 * Whether the annular sector comes within `margin` px of the rect. Exact up to SECTOR_STEP_PX: a corner of the rect in
 * the sector, or a sampled point of the sector's outline within `margin` + SECTOR_STEP_PX of the rect (any crossing of
 * the two outlines puts an outline sample that close), or the rect inside the sector.
 */
export function sectorNearRect(cx: number, cy: number, r0: number, r1: number, a: number, half: number,
  rx: number, ry: number, rw: number, rh: number, margin: number): boolean {
  if (!(r1 > 0) || r1 < r0) return false;
  const reach = margin + SECTOR_STEP_PX;
  // Cheap reject: the whole annulus is far from the rect.
  if (rectDistance(cx, cy, rx, ry, rw, rh) > r1 + reach) return false;
  if (pointInSector(rx, ry, cx, cy, r0, r1, a, half) || pointInSector(rx + rw, ry, cx, cy, r0, r1, a, half)
    || pointInSector(rx, ry + rh, cx, cy, r0, r1, a, half) || pointInSector(rx + rw, ry + rh, cx, cy, r0, r1, a, half)
    || pointInSector(rx + rw / 2, ry + rh / 2, cx, cy, r0, r1, a, half)) return true;
  const span = Math.min(half, Math.PI);
  for (let k = 0; k < 2; k++) {
    const r = k === 0 ? r0 : r1;
    const steps = Math.max(2, Math.ceil((2 * span * Math.max(r, 1)) / SECTOR_STEP_PX));
    for (let i = 0; i <= steps; i++) {
      const t = a - span + (2 * span * i) / steps;
      if (rectDistance(cx + Math.cos(t) * r, cy + Math.sin(t) * r, rx, ry, rw, rh) <= reach) return true;
    }
  }
  if (span < Math.PI) {
    const steps = Math.max(1, Math.ceil((r1 - r0) / SECTOR_STEP_PX));
    for (let k = 0; k < 2; k++) {
      const t = k === 0 ? a - span : a + span;
      for (let i = 0; i <= steps; i++) {
        const r = r0 + ((r1 - r0) * i) / steps;
        if (rectDistance(cx + Math.cos(t) * r, cy + Math.sin(t) * r, rx, ry, rw, rh) <= reach) return true;
      }
    }
  }
  return false;
}

export function createDockYield(): DockYield {
  let tiles: readonly DockYieldTile[] = [];
  let open = false;
  let dimmed = new Uint8Array(16);
  const discs = new Float64Array(MAX_DISCS * 3);
  const rects = new Float64Array(MAX_RECTS * 4);
  const sectors = new Float64Array(MAX_SECTORS * 6);
  let nd = 0, nr = 0, ns = 0;

  function reached(t: DockYieldTile, margin: number): boolean {
    for (let i = 0; i < nd; i++) {
      if (rectDistance(discs[i * 3], discs[i * 3 + 1], t.x, t.y, t.w, t.h) < discs[i * 3 + 2] + margin) return true;
    }
    for (let i = 0; i < nr; i++) {
      const x = rects[i * 4], y = rects[i * 4 + 1], w = rects[i * 4 + 2], h = rects[i * 4 + 3];
      if (x < t.x + t.w + margin && x + w > t.x - margin && y < t.y + t.h + margin && y + h > t.y - margin) return true;
    }
    for (let i = 0; i < ns; i++) {
      const o = i * 6;
      if (sectorNearRect(sectors[o], sectors[o + 1], sectors[o + 2], sectors[o + 3], sectors[o + 4], sectors[o + 5],
        t.x, t.y, t.w, t.h, margin)) return true;
    }
    return false;
  }

  function clearAll(): void {
    for (let i = 0; i < tiles.length; i++) {
      if (dimmed[i]) { dimmed[i] = 0; tiles[i].el.toggleAttribute(DOCK_YIELD_ATTRIBUTE, false); }
    }
  }

  return {
    setTiles(next) {
      clearAll();
      tiles = next.slice();
      if (dimmed.length < tiles.length) dimmed = new Uint8Array(tiles.length * 2);
      dimmed.fill(0);
    },
    setOpen(next) { open = next; },
    get active() { return tiles.length > 0; },
    begin() { nd = nr = ns = 0; },
    disc(x, y, r) {
      if (nd >= MAX_DISCS || !Number.isFinite(x + y + r)) return;
      discs[nd * 3] = x; discs[nd * 3 + 1] = y; discs[nd * 3 + 2] = r; nd++;
    },
    rect(x, y, w, h) {
      if (nr >= MAX_RECTS || !Number.isFinite(x + y + w + h)) return;
      rects[nr * 4] = x; rects[nr * 4 + 1] = y; rects[nr * 4 + 2] = w; rects[nr * 4 + 3] = h; nr++;
    },
    sector(cx, cy, r0, r1, a, half) {
      if (ns >= MAX_SECTORS || !Number.isFinite(cx + cy + r0 + r1 + a + half)) return;
      const o = ns * 6;
      sectors[o] = cx; sectors[o + 1] = cy; sectors[o + 2] = Math.max(0, r0); sectors[o + 3] = r1; sectors[o + 4] = a; sectors[o + 5] = half;
      ns++;
    },
    commit() {
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const shown = !t.panel || open;
        const next = shown && reached(t, dimmed[i] ? DOCK_YIELD_LEAVE_PX : DOCK_YIELD_ENTER_PX) ? 1 : 0;
        if (next !== dimmed[i]) { dimmed[i] = next; t.el.toggleAttribute(DOCK_YIELD_ATTRIBUTE, next === 1); }
      }
    },
  };
}
