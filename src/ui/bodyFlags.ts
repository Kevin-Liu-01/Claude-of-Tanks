/**
 * bodyFlags.ts — a body class several owners raise for their own reasons (2026-11-02 audit F8). The class is on while
 * any reason holds it, so one owner dropping its reason never strips another's: body.cot-spectating is raised by the
 * battle HUD's spectate bar (the ally chase after a death) and by the Watch HUD flying its drone, and the stylesheets
 * read the one class (the own-tank furniture off). Each write happens only when the class must change.
 */

const reasons = new Map<string, Set<string>>();

export function setBodyFlag(flag: string, reason: string, on: boolean): void {
  let held = reasons.get(flag);
  if (!held) { held = new Set(); reasons.set(flag, held); }
  if (on) held.add(reason);
  else held.delete(reason);
  if (typeof document === 'undefined' || !document.body) return;
  const wanted = held.size > 0;
  if (document.body.classList.contains(flag) !== wanted) document.body.classList.toggle(flag, wanted);
}

