/**
 * lazyImportRetry.ts — bounded automatic retries for lazily imported chunks (INFRA-P11).
 *
 * On 2026-09-27 one long-lived tab requested a removed garage chunk 33,875 times in a
 * day: the workshop scheduler retried every 140 ms for as long as the Garage stayed
 * open, after the tab's deployment had left the skew-protection window. Automatic
 * retries now back off exponentially and stop after a few failures, and a 404 on a
 * content-hashed chunk stops at once: only a fresh document (the newest deployment)
 * can load it, which the inline watchdog's reload surface offers.
 *
 * DOM-free: the probe ports default to the platform and are injectable in Node.
 */

export interface ImportRetryPolicy {
  /** Delay after the first failure; each further failure doubles it. */
  readonly baseMs: number;
  /** Upper bound of one delay. */
  readonly maxMs: number;
  /** Consecutive failures after which automatic retries stop. */
  readonly maxFailures: number;
}

export const LAZY_IMPORT_RETRY: ImportRetryPolicy = Object.freeze({ baseMs: 2_000, maxMs: 60_000, maxFailures: 5 });

/**
 * Delay before the next automatic attempt after `failures` consecutive failures
 * (1 = the first), or null once the budget is spent.
 */
export function importRetryDelayMs(failures: number, policy: ImportRetryPolicy = LAZY_IMPORT_RETRY): number | null {
  if (!Number.isFinite(failures) || failures < 1) throw new RangeError(`failure count must be >= 1, got ${failures}`);
  if (failures >= policy.maxFailures) return null;
  return Math.min(policy.maxMs, policy.baseMs * 2 ** (failures - 1));
}

const HASHED_CHUNK = /(?:https?:\/\/[^\s'"()<>]+)?\/assets\/[^\s'"()<>?#/]+-[A-Za-z0-9_-]{8}\.(?:m?js|css)\b/;

/**
 * The content-hashed `/assets/` chunk a failed dynamic import names: Chrome and
 * Firefox put the module URL in the message, Vite's preload helper names CSS.
 * Safari's "Importing a module script failed." names none.
 */
export function failedChunkUrl(error: unknown): string | null {
  const text = error instanceof Error ? `${error.message} ${error.stack ?? ''}` : String(error ?? '');
  return HASHED_CHUNK.exec(text)?.[0] ?? null;
}

type ChunkFailure = 'missing' | 'transient';

interface ChunkFailureProbe {
  fetchImpl?: (url: string, init: RequestInit) => Promise<{ status: number }>;
  timing?: { getEntriesByName?(name: string): ArrayLike<unknown> } | null;
  baseUrl?: string;
}

/**
 * 'missing' when the hashed chunk a failed import names answers 404 — this
 * document's deployment is gone — else 'transient' (offline, a flaky network,
 * an evaluation error, or no chunk named). Resource Timing answers without a
 * request where the browser exposes `responseStatus`; otherwise one HEAD probe.
 */
export async function classifyChunkFailure(error: unknown, probe: ChunkFailureProbe = {}): Promise<ChunkFailure> {
  const chunk = failedChunkUrl(error);
  if (!chunk) return 'transient';
  const {
    fetchImpl = typeof fetch === 'function' ? fetch : undefined,
    timing = typeof performance === 'object' ? performance : null,
    baseUrl = typeof location === 'object' && location?.href ? location.href : 'http://localhost/',
  } = probe;
  let url: string;
  try { url = new URL(chunk, baseUrl).href; } catch { return 'transient'; }
  try {
    const entries = Array.from(timing?.getEntriesByName?.(url) ?? []);
    if (entries.some((entry) => (entry as { responseStatus?: number }).responseStatus === 404)) return 'missing';
  } catch { /* Resource Timing is optional */ }
  if (!fetchImpl) return 'transient';
  try {
    const response = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    return response.status === 404 ? 'missing' : 'transient';
  } catch {
    return 'transient';
  }
}
