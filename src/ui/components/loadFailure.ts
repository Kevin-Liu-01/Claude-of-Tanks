// The kit's load failure (loading states 264, Main's ruling on the garage lane's probe). Copyright © 2026 Kevin B. Liu.
//
// A lazy chunk that failed is never asked for again in its document, because what a browser does with one asked again
// is not stable (tools/offline-import-probe.mjs, offline then online, 2026-10-28). Chrome 151 keeps a failed import()
// for the document's life and fails every importer of a failed modulepreload (a never-tried importer, and a fresh query
// of one, too); Chrome 156 loads both once the network is back; in both, a failed stylesheet <link> stands and never
// applies, and Vite's preload never asks for it again (it skips an href that has a link, or that its `seen` map holds),
// so a chunk asked again would run unstyled. A reload recovers in every case. So no opener offers an in-page retry of
// its chunk (src/ui/components/loadFailure.selftest.mjs): its trigger keeps a quiet error state that needs no chunk,
// data-load-state="error" (the kit's danger dot, components.css) with an aria-description, and the trigger's next press
// reloads the page once online. The page never reloads by itself (the post-ready ruling).
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
