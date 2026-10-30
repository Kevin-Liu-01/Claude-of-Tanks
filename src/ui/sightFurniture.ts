/**
 * The HUD panels and controls the reticle's marks keep clear of (owner 2026-10-17, out of ammo). battleHudLayout measures
 * them on every relayout, the same pass that seats the rows and the lanes, so the reticle canvas reads boxes that move
 * with the stylesheet and is never measured per frame (critic r9: the scope readouts met the consumables column at
 * 667x375, the left FIRE button on small portrait phones and the touch warning chip; the floors hud.ts modelled as
 * constants missed every one of them).
 */
interface SightFurnitureBox { x0: number; y0: number; x1: number; y1: number }

const CAPACITY = 48;
/** The latest relayout's furniture, in CSS px; `count` boxes are live (the rest are spare, reused by the next pass).
 *  `version` steps whenever a pass changes them (settleSightFurniture), so the reticle repaints a reused frame. */
export const sightFurniture = {
  count: 0,
  version: 0,
  boxes: Array.from({ length: CAPACITY }, (): SightFurnitureBox => ({ x0: 0, y0: 0, x1: 0, y1: 0 })),
};
/** The centre notices' settled boxes while they show, on either layout (battleHudLayout): the scope's cross arms end
 *  short of them (hud.ts appendScopeRun). At 1024 x 600 no place over the upper arm holds the detection and the alert
 *  together, and the alert's foot sat on the arm's tip at full bloom. Only the arms yield: no mark moves for a notice. */
export const sightNoticeCuts = {
  count: 0,
  boxes: Array.from({ length: 4 }, (): SightFurnitureBox => ({ x0: 0, y0: 0, x1: 0, y1: 0 })),
};
/** The panels the world plates (hud.ts: the target plate, the hull bars) also keep clear of, from the same pass: the
 *  kill feed's rows, Watch's and the spectator's bars and the network strip (the plates critic, r20: on a phone the target
 *  plate's name met the feed's last row and stood under Watch's bar). A `soft` one (a feed row, its element in `nodes`)
 *  stops the hull bars but gives way to the target plate, which stands where the gun points: on a phone landscape the
 *  feed's lane starts a plate's half-width from the sight. The reticle never reads them. */
export const plateObstacles = {
  count: 0,
  boxes: Array.from({ length: 24 }, (): SightFurnitureBox => ({ x0: 0, y0: 0, x1: 0, y1: 0 })),
  soft: Array.from({ length: 24 }, () => false),
  nodes: Array.from({ length: 24 }, (): unknown => null),
  /** A soft one standing aside this frame (hud.ts yieldFeedRows): hidden, it stops nothing. */
  yielded: Array.from({ length: 24 }, () => false),
};
let passPrevious = 0;
let cutsPrevious = 0;
let passChanged = false;

/** Starts a pass: the boxes added until settleSightFurniture replace the last pass's. */
export function clearSightFurniture(): void {
  passPrevious = sightFurniture.count;
  cutsPrevious = sightNoticeCuts.count;
  passChanged = false;
  sightFurniture.count = 0;
  sightNoticeCuts.count = 0;
  plateObstacles.count = 0;
}

/** Adds one box (a box under a pixel either way is nothing to keep clear of; past the capacity the rest are dropped). */
export function addSightFurniture(x0: number, y0: number, x1: number, y1: number): void {
  if (sightFurniture.count >= CAPACITY || !(x1 - x0 >= 1 && y1 - y0 >= 1)) return;
  const index = sightFurniture.count++;
  const box = sightFurniture.boxes[index];
  if (index >= passPrevious || box.x0 !== x0 || box.y0 !== y0 || box.x1 !== x1 || box.y1 !== y1) passChanged = true;
  box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
}

/** Adds one panel the world plates keep clear of, `soft` with its element where it gives way to the target plate (past
 *  the capacity the rest are dropped). */
export function addPlateObstacle(x0: number, y0: number, x1: number, y1: number, soft = false, node: unknown = null): void {
  if (plateObstacles.count >= plateObstacles.boxes.length || !(x1 - x0 >= 1 && y1 - y0 >= 1)) return;
  const index = plateObstacles.count++;
  const box = plateObstacles.boxes[index];
  box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
  plateObstacles.soft[index] = soft;
  plateObstacles.nodes[index] = node;
  plateObstacles.yielded[index] = false;
}

/** The sixth-sense notice's settled box while it shows on a touch layout (battleHudLayout): the warning chip the reticle
 *  seats there is a DOM chip like the notice, and yields to it (r10e: at 320x568 the chip seated over the sight sat under
 *  the DETECTED notice). The canvas's marks never dodge a notice, which comes and goes. */
export const sightNotice = { on: false, x0: 0, y0: 0, x1: 0, y1: 0 };

/** Sets this pass's notice (between clearSightFurniture and settleSightFurniture); `on` false clears it. */
export function setSightNotice(on: boolean, x0 = 0, y0 = 0, x1 = 0, y1 = 0): void {
  const notice = sightNotice;
  if (notice.on === on && (!on || (notice.x0 === x0 && notice.y0 === y0 && notice.x1 === x1 && notice.y1 === y1))) return;
  notice.on = on;
  notice.x0 = x0; notice.y0 = y0; notice.x1 = x1; notice.y1 = y1;
  passChanged = true;
}

/** Adds one shown notice's box to this pass's cuts (past the capacity the rest are dropped). */
export function addSightNoticeCut(x0: number, y0: number, x1: number, y1: number): void {
  if (sightNoticeCuts.count >= sightNoticeCuts.boxes.length || !(x1 - x0 >= 1 && y1 - y0 >= 1)) return;
  const index = sightNoticeCuts.count++;
  const box = sightNoticeCuts.boxes[index];
  if (index >= cutsPrevious || box.x0 !== x0 || box.y0 !== y0 || box.x1 !== x1 || box.y1 !== y1) passChanged = true;
  box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
}

/** How far the box keeps from the notice (negative: it runs into it; Infinity: none shows). */
export function sightNoticeGap(x0: number, y0: number, x1: number, y1: number): number {
  const notice = sightNotice;
  return notice.on ? Math.max(notice.x0 - x1, x0 - notice.x1, notice.y0 - y1, y0 - notice.y1) : Infinity;
}

/** Ends a pass: the version steps when its boxes (or the notice) differ from the last pass's. */
export function settleSightFurniture(): void {
  if (passChanged || sightFurniture.count !== passPrevious || sightNoticeCuts.count !== cutsPrevious) sightFurniture.version++;
  passChanged = false;
}

/** How far the box keeps from the nearest furniture (negative: it runs into one; Infinity: there is none). */
export function sightFurnitureGap(x0: number, y0: number, x1: number, y1: number): number {
  let gap = Infinity;
  for (let i = 0; i < sightFurniture.count; i++) {
    const box = sightFurniture.boxes[i];
    const apart = Math.max(box.x0 - x1, x0 - box.x1, box.y0 - y1, y0 - box.y1);
    if (apart < gap) gap = apart;
  }
  return gap;
}

/** How far a world plate's box keeps from the furniture and the plates' own obstacles, the soft ones left out where
 *  `hard` (negative: it runs into one). */
export function worldPlateGap(x0: number, y0: number, x1: number, y1: number, hard = false): number {
  let gap = sightFurnitureGap(x0, y0, x1, y1);
  for (let i = 0; i < plateObstacles.count; i++) {
    if (plateObstacles.soft[i] && (hard || plateObstacles.yielded[i])) continue;
    const box = plateObstacles.boxes[i];
    const apart = Math.max(box.x0 - x1, x0 - box.x1, box.y0 - y1, y0 - box.y1);
    if (apart < gap) gap = apart;
  }
  return gap;
}

/** The lowest foot of the furniture and the hard obstacles a world plate's box runs into (-Infinity where it meets none):
 *  the target plate sinks under it (hud.ts positionTargetPlate). */
export function worldPlateSink(x0: number, y0: number, x1: number, y1: number): number {
  let foot = -Infinity;
  for (let i = 0; i < sightFurniture.count + plateObstacles.count; i++) {
    const obstacle = i - sightFurniture.count;
    if (obstacle >= 0 && plateObstacles.soft[obstacle]) continue;
    const box = obstacle < 0 ? sightFurniture.boxes[i] : plateObstacles.boxes[obstacle];
    if (box.x0 < x1 && box.x1 > x0 && box.y0 < y1 && box.y1 > y0 && box.y1 > foot) foot = box.y1;
  }
  return foot;
}

/**
 * The lowest baseline at or above `y` where a mark spanning [x0, x1], `top` over its baseline and `foot` under it, keeps
 * `gap` from every furniture box that crosses its columns and sits under its top (the boxes over it stay where they are:
 * a mark only ever rises past what lies under it). `over` is the top that tells under from over where the mark hangs
 * under another that it rises with (the scope's zoom plate under its readout line: at 360x640 the left FIRE button's top
 * sat 4 px over the plate's own top, under the line's, and the row stayed on it).
 */
export function sightFurnitureRise(x0: number, x1: number, y: number, top: number, foot: number, gap: number,
  over = top): number {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < sightFurniture.count; i++) {
      const box = sightFurniture.boxes[i];
      if (box.x0 - x1 >= gap || x0 - box.x1 >= gap) continue;
      if (box.y1 + gap <= y - top || box.y0 - gap >= y + foot) continue;
      // (a box whose top sits over the mark's own top is over it, not under it)
      if (box.y0 < y - over) continue;
      y = box.y0 - gap - foot;
      moved = true;
    }
    if (!moved) break;
  }
  return y;
}
