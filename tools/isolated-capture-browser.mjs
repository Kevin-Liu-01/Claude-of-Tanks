import { launchGuardedBrowser } from './browser-launch.mjs';
import { withCaptureHold } from './capture-hold.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

/** Own one comparison server/browser and its optimizer cache. Queue ownership,
 * page setup, scoring, timeouts and output remain with the calling tool.
 * `dependencies.capture` = { lock, waitMs, place, warm, atCap, label, log } (2026-10-22, tools/capture-hold.mjs): the cache,
 * the server, the browser and `warm({ server, browser })` open while the capture ticket waits (the lock's `prepare`), `run`
 * gets the hold, and the lock is released once the browser is closed. Without it the caller holds the lock around this
 * call. The hold is withCaptureHold's (2026-11-02 audit S4, round 2: this wrapper acquired, refreshed and released the lock
 * itself, with no signal handling): refresh, signals (the browser closes, the lock goes, one exit) and the release after
 * the browser. `run` gets no checkpoint and is one whole audit pass, so past the cap it is logged, not stopped (atCap
 * 'keep', unless `capture.atCap` says 'stop'). */
export async function withIsolatedCaptureBrowser(serverOptions, launchOptions, run, dependencies = {}) {
  const {
    mkdtempSync = fs.mkdtempSync,
    temporaryDirectory = tmpdir,
    createViteServer = createServer,
    launchBrowser = options => launchGuardedBrowser(puppeteer, options),
    removeCache = fs.rmSync,
    logCleanupError = (resource, error) => console.error(`[isolated-capture cleanup ${resource}]`, String(error)),
    capture = null,
  } = dependencies;
  let cacheDir = null, server = null, browser = null;
  let primaryFailed = false;
  const failures = [];
  const closeBrowser = async () => {
    const open = browser;
    browser = null;
    if (!open) return;
    try { await open.close(); } catch (error) { failures.push({ resource: 'browser', error }); }
  };
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
      // nothing draws once the browser is closed: the hold ends there (its teardown), before the server and cache
      return await withCaptureHold(() => run({ server, browser }), {
        label: capture.label ?? 'isolated-capture', lock: capture.lock, timeoutMs: capture.waitMs ?? 4 * 3600 * 1000,
        place: capture.place ?? null, prepare: open, atCap: capture.atCap ?? 'keep', log: capture.log ?? (() => {}),
        teardown: closeBrowser,
      });
    }
    await open();
    return await run({ server, browser });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    for (const [resource, close] of [
      // a hold's browser is closed by its teardown, before the release; this closes one a failed wait left open
      ['browser', async () => { await closeBrowser(); }],
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
