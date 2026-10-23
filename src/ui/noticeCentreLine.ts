/**
 * Every battle centre notice sits on the window's vertical centre line, on the mouse and the touch layouts alike: the
 * detection, the alert (module, crew, ammunition and mode notices), the pre-battle countdown and its rules panel, the
 * revive count and the medal card (owner, 2026-10-22, on live 240: "notifiations in 240 still arent fixed / centered,
 * for example spotting or broken equipment stuff, they are nnot actually centered in screen"; 2026-10-21 for the
 * countdown). The planners (mouseNoticePlan.ts, touchNoticePlan.ts, countdownPlace.ts) keep the crosshair and the
 * instruments clear by moving a notice up or down, narrowing it, shrinking it or holding it back, never sideways: each
 * reckons its boxes from this centre and writes only tops, widths and scales, and battleHudLayout.css centres every one
 * with a single rule (left 50 %, translated back by half its own width).
 */
export const noticeCentreX = (width: number): number => width / 2;
