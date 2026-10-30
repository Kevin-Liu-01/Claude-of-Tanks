/**
 * battleSight.ts — the arcade sight's place and the HUD bands the chase framing reads (battle-camera-264).
 *
 * One datum, one owner each way: battleHudLayout.ts measures the bottom chrome that never moves with the sight (the
 * controls strip's seat, the vehicle-actions row, the ammunition and consumables, a touch layout's buttons and
 * instruments) and the head band over the centre column, and publishes them here; the camera rig solves its chase
 * framing from them (engine/chaseFraming.ts) and publishes how far its lens shift raises the arcade sight over the
 * screen centre. The HUD's sight bands (the notice planners, the countdown, the warning chip: `--hud-sight-shift`) take
 * the sight's place from here instead of the screen centre. The scope's sight is always the screen centre.
 *
 * DOM-light (the CSS variable is written only where a document exists) and boot-safe: no imports.
 */

/** A screen box, CSS px (engine/chaseFraming.ts ChaseRect). */
export interface BattleBandBox { x0: number; y0: number; x1: number; y1: number }

/** The HUD's bands (engine/chaseFraming.ts ChaseBands). */
interface BattleBands {
  width: number;
  height: number;
  touch: boolean;
  floor: readonly BattleBandBox[];
  /** Bottom chrome that comes and goes (the first battles' controls strip, while it shows). */
  transient?: readonly BattleBandBox[];
  ceiling: number;
  /** The most the layout lets the sight rise over the centre (its places that follow the sight hold up to it). */
  riseCap?: number;
}

let bands: BattleBands | null = null;
let shiftPx = 0;
const listeners = new Set<() => void>();

const sameBox = (a: BattleBandBox, b: BattleBandBox) => a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

/** battleHudLayout.ts, each relayout: the bands as measured (whole px). A copy equal to the last keeps its identity, so
 *  the rig's change test is one comparison. */
export function publishBattleBands(next: BattleBands): void {
  if (bands && bands.width === next.width && bands.height === next.height && bands.touch === next.touch
    && bands.ceiling === next.ceiling && bands.riseCap === next.riseCap && bands.floor.length === next.floor.length
    && bands.floor.every((box, i) => sameBox(box, next.floor[i]))
    && (bands.transient?.length ?? 0) === (next.transient?.length ?? 0)
    && (bands.transient ?? []).every((box, i) => sameBox(box, next.transient![i]))) return;
  bands = next;
}

/** The bands last measured, or null before the battle HUD's first layout. */
export function battleBands(): BattleBands | null {
  return bands;
}

/** The camera rig: the arcade sight's rise over the screen centre, CSS px (0: the centre; negative: under it, a framing
 *  setting that lowers the picture). Whole px; a change writes `--hud-sight-shift` on the body and asks the HUD for a
 *  relayout. */
export function setBattleSightShift(px: number): void {
  const next = Math.round(Number.isFinite(px) ? px : 0);
  if (next === shiftPx) return;
  shiftPx = next;
  if (typeof document !== 'undefined' && document.body) {
    if (next) document.body.style.setProperty('--hud-sight-shift', `${next}px`);
    else document.body.style.removeProperty('--hud-sight-shift');
  }
  for (const listener of listeners) listener();
}

/** The arcade sight's rise over the screen centre, CSS px. */
export function battleSightShift(): number {
  return shiftPx;
}

/** The arcade sight's y in a window `height` tall (the scope's is always height / 2). */
export function battleSightY(height: number): number {
  return height / 2 - shiftPx;
}

/** Called after each change of the sight's place; returns the unsubscribe. */
export function onBattleSightShift(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
