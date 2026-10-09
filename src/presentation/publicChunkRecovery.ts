// Public-page chunk recovery (perf lane, 2026-10-09). Home, the field manual, its topic pages and the 404 load sections
// on demand (the media archive, capture recipes, topic references, the GitHub count, the other locale's catalog). A
// tab left open across a deploy still names the hashes of the deployment that served it, so one of those imports can
// 404 long after load and leave a section blank. The first such failure reloads the document once onto the current
// deployment; a second one inside 15 minutes leaves the page as it is (no loop). The entries of those pages install it
// (publicPages.ts for home and the manual, docs/topics.ts for the topic pages); the game (index.html CHUNK RECOVERY) and
// the Gallery (site/gallery.html) own inline guards, so publicNav.ts, which they also load, never installs this.
const KEY = 'cot.publicChunkRecovery.v1';
const RETRY_PARAM = '_chunkretry';
const RESET_PARAM = '_dplreset';
const WINDOW_MS = 15 * 60 * 1000;
const DYNAMIC_IMPORT_FAILURE = /dynamically imported module|module script|importing a module script failed|error loading dynamically imported/i;

interface RecoveryScope {
  addEventListener(type: string, listener: (event: Event) => void): void;
  location: { href: string; replace(url: string): void };
  history?: { replaceState(data: unknown, unused: string, url?: string): void };
  sessionStorage?: Storage;
  fetch?: typeof fetch;
}

function storedAt(scope: RecoveryScope): number | null {
  try {
    const value = JSON.parse(scope.sessionStorage?.getItem(KEY) ?? 'null') as { at?: number } | null;
    return value && Number.isFinite(value.at) ? Number(value.at) : 0;
  } catch { return null; } // blocked storage: only the URL receipt can guard the loop
}

/** Install the one-shot reload on this document (once per page, before any on-demand import can fail). */
export function installPublicChunkRecovery(scope: RecoveryScope = window as unknown as RecoveryScope): void {
  const url = new URL(scope.location.href);
  const receipt = url.searchParams.has(RETRY_PARAM);
  const at = storedAt(scope);
  // With working storage the receipt has done its job: drop it from the address bar (a shared link must not carry it).
  if (receipt && at !== null) {
    url.searchParams.delete(RETRY_PARAM);
    try { scope.history?.replaceState(null, '', url.href); } catch { /* cosmetic */ }
  }
  const spent = () => {
    const stored = storedAt(scope);
    if (stored === null) return receipt;
    return Date.now() - stored < WINDOW_MS;
  };
  let navigating = false;
  const recover = () => {
    if (navigating || spent()) return;
    navigating = true;
    try { scope.sessionStorage?.setItem(KEY, JSON.stringify({ at: Date.now() })); } catch { /* the URL receipt guards */ }
    const next = new URL(scope.location.href);
    next.searchParams.set(RETRY_PARAM, Date.now().toString(36));
    const replace = () => scope.location.replace(next.href);
    // The game's root route owns the deployment-pin reset (middleware.ts): clear a stale __vdpl before reloading, the
    // same handshake the Gallery's guard uses, so the reload resolves the newest deployment.
    if (typeof scope.fetch === 'function') {
      const reset = new URL('/', scope.location.href);
      reset.searchParams.set(RESET_PARAM, '1');
      scope.fetch(reset.href, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' }).then(replace, replace);
    } else replace();
  };
  // Never preventDefault: Vite would then resolve the failed import as undefined (index.html's note on battle re-entry).
  scope.addEventListener('vite:preloadError', () => recover());
  scope.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason as { message?: unknown } | undefined;
    if (DYNAMIC_IMPORT_FAILURE.test(String(reason?.message ?? reason ?? ''))) recover();
  });
}
