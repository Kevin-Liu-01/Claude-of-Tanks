/**
 * reportBackdrop.ts — the battle report's opaque backdrop (perf-246).
 *
 * The report no longer stands over the live scene: it covers it with the battlefield's end still. When a map has no
 * still, the backdrop owner (src/app/battleEndGarageWarm.ts, installed with the first battle) supplies a frozen
 * copy of the battle's last frame. The owner also learns here that the report has the screen, which is when the
 * Garage swap and its program warm can run on the canvas behind it.
 */

type ReportBackdropOwner = (still: string | null) => string | null;

let owner: ReportBackdropOwner | null = null;

export function setReportBackdropOwner(next: ReportBackdropOwner | null): void {
  owner = next;
}

/** Called once per report as it takes the screen: the still, or the owner's frozen frame when there is none. */
export function reportBackdrop(still: string | null): string | null {
  return owner ? owner(still) : still;
}
