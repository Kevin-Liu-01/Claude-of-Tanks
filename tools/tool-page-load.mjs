// Dev servers and first page loads for the fleet's browser tools (2026-10-16, test-speed PLAN R4c).
//
// In the 226 release the icons page's 30 s navigation timeout failed holds under load (icons, centering) and a fixed
// strict port collided with another tool (`Port 7641 is already in use`, slice s4). Every fleet browser tool now:
//   - asks Vite for a process-spread port on 127.0.0.1 with strictPort false, so a busy port moves to the next free one,
//     and builds every URL from the address the server really bound: never `localhost`, which can resolve to an IPv6
//     bind while 127.0.0.1 at that port belongs to another checkout's server (the hazard muzzle-bore-probe documented);
//   - waits up to 180 s for the first navigation and retries a load that timed out once.
// COT_NAV_TIMEOUT_MS, COT_READY_TIMEOUT_MS and COT_NAV_RETRIES (0 disables the retry) override the defaults.

export const NAV_TIMEOUT_MS = 180_000;
export const READY_TIMEOUT_MS = 60_000;
export const NAV_RETRIES = 1;

const positive = (value) => (Number(value) > 0 ? Number(value) : null);

/** The navigation and ready budgets, from the environment over the defaults. */
export function pageLoadBudget(env = process.env, { readyTimeoutMs = READY_TIMEOUT_MS } = {}) {
  const retries = env.COT_NAV_RETRIES;
  return {
    navTimeoutMs: positive(env.COT_NAV_TIMEOUT_MS) ?? NAV_TIMEOUT_MS,
    readyTimeoutMs: positive(env.COT_READY_TIMEOUT_MS) ?? readyTimeoutMs,
    retries: retries === undefined || retries === '' || !Number.isFinite(Number(retries))
      ? NAV_RETRIES : Math.max(0, Math.floor(Number(retries))),
  };
}

/** True for a Puppeteer navigation or wait timeout (only these are retried). */
export function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || /timeout/i.test(String(error?.message ?? error));
}

/**
 * Navigate to `url` and wait for `ready` (a page expression), retrying a timed-out attempt up to budget.retries
 * times. Any other failure (a page error, a refused connection) throws at once. Returns the attempts used.
 */
export async function loadReadyPage(page, url, { label, ready, budget = pageLoadBudget(), warn = console.warn } = {}) {
  if (!ready) throw new Error('loadReadyPage needs a ready expression');
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: budget.navTimeoutMs });
      await page.waitForFunction(ready, { timeout: budget.readyTimeoutMs });
      return attempt + 1;
    } catch (error) {
      if (attempt >= budget.retries || !isTimeoutError(error)) throw error;
      warn(`[${label ?? 'page-load'}] page load timed out (attempt ${attempt + 1} of ${budget.retries + 1}); retrying`);
    }
  }
}

/** Vite `server` options for a tool: 127.0.0.1, a port spread by pid from `base`, strictPort false, no HMR or watch. */
export function toolServerOptions(base, { span = 200, pid = process.pid } = {}) {
  return { host: '127.0.0.1', port: base + (pid % span), strictPort: false, hmr: false, watch: null };
}

/** The origin a listening Vite server really bound: its address and port, never `localhost`. */
export function boundOrigin(server) {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('the tool server did not expose a TCP port');
  const host = address.family === 'IPv6' || address.family === 6 ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}
