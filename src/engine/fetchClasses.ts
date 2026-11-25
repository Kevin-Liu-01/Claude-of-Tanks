/**
 * Fetch classes (entry-bytes-278; Kevin 2026-11-25, a friend's join stuck loading: "it didnt load fast enough").
 *
 * A battle entry on a thin link shares one link among the bytes it waits for (script chunks, the props' models, the
 * simulation, the effects' atlases) and bytes it never waits for (the terrain and building photographs, which swap in
 * whenever they land, and the sound banks). The link has no priority order of its own: on 4 Mbps the photographs held
 * every HTTP/1.1 socket for ~12 s apiece, and on HTTP/2 they take equal shares of the bandwidth, so the structure kits the
 * props build awaited took 5 s for 170 KB and the effects' atlases held the loader at 55 % "Preparing effects" for 4 s
 * (cold Verdant, 4 Mbps / 100 ms / 4x CPU; tools/mp-two-peer-e2e.mjs --solo, the per-URL fetch table).
 *
 * Every fetch the entry does not wait for names its class here, and while a battle entry is open (the loading card is
 * up: battleLoad.ts opens and closes the window) the lower classes are held to a few at a time:
 * - 'critical' (the default, and anything that never calls this): starts at once, always.
 * - 'decor': drawn when it lands, never awaited (the sourced photographs). At most DECOR_SLOTS run at once, in request
 *   order, so the link stays full while critical requests always find a socket and most of the bandwidth.
 * - 'idle': wanted later (the bulk sound banks, the crew's voice pack). Starts only while no decor is waiting or running,
 *   at most IDLE_SLOTS at once.
 * With no entry open every class starts at once (the Garage, the Studio, a fast link's idle time), and closing the
 * window starts everything still held. A window left open past WINDOW_MAX_MS closes itself, so a lost hide can never hold
 * a fetch for good. Nothing here changes what is fetched or what any loader awaits: only when a held fetch starts.
 */

export type FetchClass = 'critical' | 'decor' | 'idle';

export const DECOR_SLOTS = 2;
export const IDLE_SLOTS = 3;
export const WINDOW_MAX_MS = 180_000;

interface Held { readonly cls: 'decor' | 'idle'; readonly start: () => void }

const running = { decor: 0, idle: 0 };
const held: Held[] = [];
/** Each open window's deadline (now() + WINDOW_MAX_MS); a window past it counts as closed. */
const windows = new Set<{ deadline: number }>();
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let stats = { held: 0, maxWaitMs: 0 };

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function openWindowCount(): number {
  const at = now();
  for (const entry of windows) if (entry.deadline <= at) windows.delete(entry);
  return windows.size;
}

/**
 * While something is held, one timer stands at the earliest window deadline, so a window whose close was lost still
 * lets its fetches go. Nothing held, no timer: an entry that holds nothing arms none (the card's own tests drive a fake
 * timer queue).
 */
function armExpiry(): void {
  if (expiryTimer !== null || held.length === 0 || windows.size === 0) return;
  let earliest = Infinity;
  for (const entry of windows) earliest = Math.min(earliest, entry.deadline);
  expiryTimer = setTimeout(() => { expiryTimer = null; pump(); armExpiry(); }, Math.max(0, earliest - now()) + 1);
}

/** True while a battle entry holds the lower classes. */
export function fetchWindowOpen(): boolean {
  return openWindowCount() > 0;
}

function canStart(cls: 'decor' | 'idle'): boolean {
  if (openWindowCount() === 0) return true;
  if (cls === 'decor') return running.decor < DECOR_SLOTS;
  return running.idle < IDLE_SLOTS && running.decor === 0 && !held.some((entry) => entry.cls === 'decor');
}

function pump(): void {
  for (let index = 0; index < held.length;) {
    const entry = held[index];
    if (!canStart(entry.cls)) { index++; continue; }
    held.splice(index, 1);
    entry.start();
    // a start may change what the next entry is allowed (a decor slot taken): read the queue again from its head
    index = 0;
  }
}

/**
 * Run `start` (the fetch, or the image load, and whatever reads its body) under `cls`: at once when nothing holds it,
 * else when a slot of its class frees. The returned promise settles as `start`'s does.
 */
export function classFetch<T>(cls: FetchClass, start: () => Promise<T>): Promise<T> {
  if (cls === 'critical') return start();
  return new Promise<T>((resolve, reject) => {
    const queuedAt = now();
    const run = (): void => {
      running[cls]++;
      const waited = now() - queuedAt;
      if (waited > stats.maxWaitMs) stats.maxWaitMs = waited;
      let result: Promise<T>;
      try { result = Promise.resolve(start()); } catch (error) { result = Promise.reject(error); }
      result.then(resolve, reject).finally(() => { running[cls]--; pump(); });
    };
    if (held.length === 0 && canStart(cls)) { run(); return; }
    stats.held++;
    held.push({ cls, start: run });
    pump();
    armExpiry();
  });
}

/**
 * Open the entry window (the loading card is up). The handle's close() is idempotent; every held fetch starts once the
 * last window closes. The window closes itself after `maxMs` (WINDOW_MAX_MS).
 */
export function openFetchWindow(maxMs = WINDOW_MAX_MS): { close(): void } {
  const entry = { deadline: now() + maxMs };
  windows.add(entry);
  return {
    close() {
      if (!windows.delete(entry)) return;
      if (windows.size === 0 && expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
      pump();
    },
  };
}

/** (receipts, the harness) what the classes did: fetches held, the longest hold, and what is running or held now. */
export function fetchClassStats(): { open: boolean; held: number; maxWaitMs: number; running: { decor: number; idle: number }; waiting: number } {
  return { open: openWindowCount() > 0, held: stats.held, maxWaitMs: Math.round(stats.maxWaitMs), running: { ...running }, waiting: held.length };
}

/** (selftests) back to a fresh page's state. */
export function resetFetchClassesForTest(): void {
  running.decor = 0; running.idle = 0; held.length = 0; windows.clear();
  if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
  stats = { held: 0, maxWaitMs: 0 };
}
