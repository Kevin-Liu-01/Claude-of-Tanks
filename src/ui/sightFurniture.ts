/**
 * The HUD panels and controls the reticle's marks keep clear of (owner 2026-10-17, out of ammo). battleHudLayout measures
 * them on every relayout, the same pass that seats the rows and the lanes, so the reticle canvas reads boxes that move
 * with the stylesheet and is never measured per frame (critic r9: the scope readouts met the consumables column at
 * 667x375, the left FIRE button on small portrait phones and the touch warning chip; the floors hud.ts modelled as
 * constants missed every one of them).
 */
export interface SightFurnitureBox { x0: number; y0: number; x1: number; y1: number }

const CAPACITY = 48;
/** The latest relayout's furniture, in CSS px; `count` boxes are live (the rest are spare, reused by the next pass).
 *  `version` steps whenever a pass changes them (settleSightFurniture), so the reticle repaints a reused frame. */
export const sightFurniture = {
  count: 0,
  version: 0,
  boxes: Array.from({ length: CAPACITY }, (): SightFurnitureBox => ({ x0: 0, y0: 0, x1: 0, y1: 0 })),
};
let passPrevious = 0;
let passChanged = false;

/** Starts a pass: the boxes added until settleSightFurniture replace the last pass's. */
export function clearSightFurniture(): void {
  passPrevious = sightFurniture.count;
  passChanged = false;
  sightFurniture.count = 0;
}

/** Adds one box (a box under a pixel either way is nothing to keep clear of; past the capacity the rest are dropped). */
export function addSightFurniture(x0: number, y0: number, x1: number, y1: number): void {
  if (sightFurniture.count >= CAPACITY || !(x1 - x0 >= 1 && y1 - y0 >= 1)) return;
  const index = sightFurniture.count++;
  const box = sightFurniture.boxes[index];
  if (index >= passPrevious || box.x0 !== x0 || box.y0 !== y0 || box.x1 !== x1 || box.y1 !== y1) passChanged = true;
  box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
}

/** Ends a pass: the version steps when its boxes differ from the last pass's. */
export function settleSightFurniture(): void {
  if (passChanged || sightFurniture.count !== passPrevious) sightFurniture.version++;
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

/**
 * The lowest baseline at or above `y` where a mark spanning [x0, x1], `top` over its baseline and `foot` under it, keeps
 * `gap` from every furniture box that crosses its columns and sits under its top (the boxes over it stay where they are:
 * a mark only ever rises past what lies under it).
 */
export function sightFurnitureRise(x0: number, x1: number, y: number, top: number, foot: number, gap: number): number {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < sightFurniture.count; i++) {
      const box = sightFurniture.boxes[i];
      if (box.x0 - x1 >= gap || x0 - box.x1 >= gap) continue;
      if (box.y1 + gap <= y - top || box.y0 - gap >= y + foot) continue;
      // (a box whose top sits over the mark's own top is over it, not under it)
      if (box.y0 < y - top) continue;
      y = box.y0 - gap - foot;
      moved = true;
    }
    if (!moved) break;
  }
  return y;
}
