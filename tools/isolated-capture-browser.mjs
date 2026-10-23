import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

/** Own one comparison server/browser and its optimizer cache. Queue ownership,
 * page setup, scoring, timeouts and output remain with the calling tool.
 * `dependencies.capture` = { lock, waitMs, place, warm } (2026-10-22, tools/capture-hold.mjs): the cache, the server,
 * the browser and `warm({ server, browser })` open while the capture ticket waits (the lock's `prepare`), `run` gets the
 * hold, and the lock is released once the browser is closed. Without it the caller holds the lock around this call. */
export async function withIsolatedCaptureBrowser(serverOptions, launchOptions, run, dependencies = {}) {
  const {
    mkdtempSync = fs.mkdtempSync,
    temporaryDirectory = tmpdir,
    createViteServer = createServer,
    launchBrowser = options => puppeteer.launch(options),
    removeCache = fs.rmSync,
    logCleanupError = (resource, error) => console.error(`[isolated-capture cleanup ${resource}]`, String(error)),
    capture = null,
  } = dependencies;
  let cacheDir = null, server = null, browser = null;
  let primaryFailed = false, held = false, refresher = null;
  const open = async () => {
    cacheDir = mkdtempSync(path.join(temporaryDirectory(), 'cot-release-vite-'));
    server = await createViteServer({
      ...serverOptions,
      cacheDir,
      optimizeDeps: { ...serverOptions.optimizeDeps, noDiscovery:true },
    });
    await server.listen();
    browser = await launchBrowser(launchOptions);
    if (capture?.warm) await capture.warm({ server, browser });
  };
  try {
    if (capture) {
      await capture.lock.acquire(capture.waitMs ?? 4 * 3600 * 1000, { prepare: open, place: capture.place ?? null });
      held = true;
      refresher = setInterval(() => capture.lock.refresh(), 30_000);
      refresher.unref?.();
    } else {
      await open();
    }
    return await run({ server, browser });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    const failures = [];
    for (const [resource, close] of [
      ['browser', async () => { if (browser) await browser.close(); }],
      // nothing draws once the browser is closed: the hold ends here, before the server and cache
      ['lock', () => { if (refresher) clearInterval(refresher); if (held) capture.lock.release(); }],
      ['server', async () => { if (server) await server.close(); }],
      ['cache', () => { if (cacheDir) removeCache(cacheDir, { recursive:true, force:true }); }],
    ]) {
      try { await close(); }
      catch (error) { failures.push({ resource, error }); }
    }
    const cleanupErrors = failures.map(({ error }) => error);
    for (const { resource, error } of failures) {
      // Reporting failure must not interrupt resource cleanup or replace the
      // original acquisition/callback exception either.
      try { logCleanupError(resource, error); }
      catch (reportingError) { cleanupErrors.push(reportingError); }
    }
    if (cleanupErrors.length && !primaryFailed) {
      throw new AggregateError(cleanupErrors, 'isolated capture resource cleanup failed');
    }
  }
}
