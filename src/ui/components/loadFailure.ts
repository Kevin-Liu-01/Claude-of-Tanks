// The kit's load failure (loading states 264, Main's ruling on the garage lane's probe). Copyright © 2026 Kevin B. Liu.
//
// An opener's lazy chunk that failed is never asked for again in its document, because what a browser does with one
// asked again is not stable (tools/offline-import-probe.mjs, offline then online, 2026-10-28). Chrome 151 keeps a failed import()
// for the document's life and fails every importer of a failed modulepreload (a never-tried importer, and a fresh query
// of one, too); Chrome 156 loads both once the network is back; in both, a failed stylesheet <link> stands and never
// applies, and Vite's preload never asks for it again (it skips an href that has a link, or that its `seen` map holds),
// so a chunk asked again would run unstyled. A reload recovers in every case. So no opener offers an in-page retry of
// its chunk (src/ui/components/loadFailure.selftest.mjs): its trigger keeps a quiet error state that needs no chunk,
// data-load-state="error" (the kit's danger dot, components.css) with an aria-description, and the trigger's next press
// reloads the page once online. The page never reloads by itself (the post-ready ruling).
// (2026-11-02 audit R6) Every createLazyChunk site's load is one app/lazyChunk.ts policy; a new lazy chunk starts
// there. Terminal for the document: an opener's chunk (`opener: true`: its trigger's next press reloads the page
// instead of asking again), a failed stylesheet and a removed chunk. Every other site's callers ask a failed module
// again under the policy (at once after one failure, then past the backoff, never offline; a battle's covered entry
// whatever the backoff, round 4 F2), pressed and dragged triggers among them: the consumables slot
// (garageConsumables.ts), the Studio's sun dial and sliders (the battle atmosphere's chunks, the map's air, the Moon's
// land mask) and the battle canvas's press that resumes the audio (pointerLockFeedbackRuntime.ts). (round 4 E9) Not
// every lazy load is one: the older memos that differ (stylesheets kept for the document, memos asked once per
// lifecycle edge or open, the docs pages that do not boot the policy and the icon sprite every page's boot holds,
// initializations and joins over chunks it holds, data fetches, a warm task, an unused HDRI experiment) are named with
// their reasons in app/lazyChunkSites.selftest.mjs KNOWN. One of them, the field guide's technical drawing section
// (infoGuides.ts), asks its module again on its next open; the drawing keeps its own stylesheet.
// This module and its two strings ride in the boot runtime chunk on every page (tools/viteI18nPageCatalogs.ts
// BOOT_RUNTIME_MODULES, about 0.5 KB), so a failure can always say so: the notice is a chunk of its own, and a network
// that dropped one chunk drops that one too.
import { t } from '../i18n.ts';

type Trigger = Element | null | undefined;

/** A failure no in-page retry can mend: a module, or a chunk's stylesheet, that did not arrive (Chrome and Firefox name
 *  the dynamic import, Safari its module script, Vite the stylesheet its preload could not add). A fetch of data can be
 *  asked again. */
export function isChunkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /dynamically imported module|importing a module script failed|unable to preload css/i.test(message);
}

/** Mark `triggers` as openers whose surface did not load: the danger dot, and `what` (else a plain "did not load") with
 *  the press's reload in their description. */
export function markLoadFailed(triggers: Iterable<Trigger>, what: string = t('loadFailed.generic')): void {
  for (const trigger of triggers) {
    if (!(trigger as HTMLElement | null)?.dataset) continue;
    (trigger as HTMLElement).dataset.loadState = 'error';
    trigger!.setAttribute('aria-description', `${what} ${t('loadFailed.reload')}`);
  }
}

/** Whether `trigger` is an opener whose surface did not load. */
export const loadFailed = (trigger: Trigger): boolean => (trigger as HTMLElement | null)?.dataset?.loadState === 'error';

/** A press on an opener whose surface did not load: the page reloads once online (offline a reload is the browser's
 *  error page, so the press waits and the trigger keeps saying so). True when it was one, so the opener stops there. */
export function pressFailed(...triggers: Trigger[]): boolean {
  if (!triggers.some(loadFailed)) return false;
  if (navigator.onLine !== false) location.reload();
  return true;
}

/** A page's enhancement (its players, its archive, its reel): its chunk is asked for once, never while the browser is
 *  offline (that would spend its one try), and a failure leaves the page as it was served, with `failed` told. */
export function importWhenOnline(load: () => Promise<unknown>, failed: (error: unknown) => void = () => {}): void {
  if (navigator.onLine === false) { addEventListener('online', () => importWhenOnline(load, failed), { once: true }); return; }
  void load().catch(failed);
}
