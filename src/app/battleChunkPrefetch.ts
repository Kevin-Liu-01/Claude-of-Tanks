/**
 * The solo battle's code, preloaded behind an interactive Garage (entry-cpu-278; Kevin 2026-11-25, a friend stuck
 * loading: "it didnt load fast enough").
 *
 * A cold press on a 4 Mbps link waited 6 s at 2 % "Surveying terrain" for one wave of ~196 chunks (2.8 MB on the wire)
 * while the main thread sat idle. The build lists those chunks in the game document (tools/viteBattleChunkPrefetch.ts:
 * the static closure of the solo entry's dynamic imports, less the boot graph). Once the Garage is ready and the page has
 * been quiet for a moment, this adds a low-priority `<link rel="modulepreload">` for each, a few at a time, at the 'idle'
 * fetch class (engine/fetchClasses.ts): a battle entry that opens meanwhile holds the rest behind its own requests, and its
 * import() takes whatever has landed from the module map. A modulepreload fetches and compiles; nothing is evaluated
 * before the press, so a passive Garage still constructs nothing for battle (main.ts: passive dwell is not Battle intent).
 *
 * Skipped with Save-Data, without modulepreload support, and in a document with no list (the dev server). The links Vite's
 * own preload helper adds are found by href, so a chunk already preloaded is never asked for twice, and Vite skips ours.
 */
import { classFetch } from '../engine/fetchClasses.ts';

export const BATTLE_CHUNKS_ELEMENT_ID = 'cot-battle-chunks';
/** At most this many preloads in flight: the Garage's own streaming keeps most of the link. */
export const BATTLE_CHUNK_LANES = 2;
/** Quiet time after the Garage is ready before the first preload starts. */
export const BATTLE_CHUNK_DELAY_MS = 1500;

export interface BattleChunkPrefetchPorts {
  readonly document: Pick<Document, 'getElementById' | 'createElement' | 'getElementsByTagName' | 'head' | 'baseURI'>;
  readonly saveData?: () => boolean;
  readonly schedule?: (run: () => void, delayMs: number) => void;
  readonly fetchAs?: typeof classFetch;
}

export interface BattleChunkPrefetchStats { listed: number; requested: number; skipped: number; landed: number; failed: number; done: boolean }

/** The hrefs the build listed, or [] (no list, a malformed list). */
export function listedBattleChunks(document: Pick<Document, 'getElementById'>): string[] {
  const text = document.getElementById(BATTLE_CHUNKS_ELEMENT_ID)?.textContent;
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((href): href is string => typeof href === 'string' && href.length > 0) : [];
  } catch { return []; }
}

const defaultSaveData = (): boolean => {
  const connection = (globalThis.navigator as Navigator & { connection?: { saveData?: boolean } } | undefined)?.connection;
  return connection?.saveData === true;
};
const defaultSchedule = (run: () => void, delayMs: number): void => {
  const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  setTimeout(() => (idle ? idle(run, { timeout: 4000 }) : run()), delayMs);
};

/**
 * Start the preloads once (call when the Garage is ready). Returns the live stats (also on
 * globalThis.__BATTLE_CHUNK_PREFETCH for the probes).
 */
export function startBattleChunkPrefetch({
  document, saveData = defaultSaveData, schedule = defaultSchedule, fetchAs = classFetch,
}: BattleChunkPrefetchPorts): BattleChunkPrefetchStats {
  const hrefs = listedBattleChunks(document);
  const stats: BattleChunkPrefetchStats = { listed: hrefs.length, requested: 0, skipped: 0, landed: 0, failed: 0, done: false };
  (globalThis as { __BATTLE_CHUNK_PREFETCH?: BattleChunkPrefetchStats }).__BATTLE_CHUNK_PREFETCH = stats;
  const probe = document.createElement('link');
  if (!hrefs.length || saveData() || !probe.relList?.supports?.('modulepreload')) {
    stats.done = true;
    return stats;
  }
  const absolute = (href: string): string => new URL(href, document.baseURI).href;
  const present = (): Set<string> => {
    const seen = new Set<string>();
    const links = document.getElementsByTagName('link');
    for (let index = 0; index < links.length; index++) seen.add(links[index].href);
    return seen;
  };
  const preload = (href: string): Promise<void> => new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    (link as HTMLLinkElement & { fetchPriority?: string }).fetchPriority = 'low';
    link.onload = () => { stats.landed++; resolve(); };
    link.onerror = () => { stats.failed++; resolve(); };
    document.head.append(link);
  });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < hrefs.length) {
      const href = hrefs[next++];
      // (the press, or the Garage, may have preloaded it meanwhile: Vite's helper adds a link per dependency)
      if (present().has(absolute(href))) { stats.skipped++; continue; }
      stats.requested++;
      // (and again when the class starts it: an entry window may have held it while the press preloaded the same chunk)
      await fetchAs('idle', () => (present().has(absolute(href)) ? Promise.resolve() : preload(href)));
    }
  };
  schedule(() => {
    void Promise.all(Array.from({ length: BATTLE_CHUNK_LANES }, () => lane())).then(() => { stats.done = true; });
  }, BATTLE_CHUNK_DELAY_MS);
  return stats;
}
