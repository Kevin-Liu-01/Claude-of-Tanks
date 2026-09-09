import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

/** Own one comparison server/browser and its optimizer cache. Queue ownership,
 * page setup, scoring, timeouts and output remain with the calling tool. */
export async function withIsolatedCaptureBrowser(serverOptions, launchOptions, run, dependencies = {}) {
  const {
    mkdtempSync = fs.mkdtempSync,
    temporaryDirectory = tmpdir,
    createViteServer = createServer,
    launchBrowser = options => puppeteer.launch(options),
    removeCache = fs.rmSync,
    logCleanupError = (resource, error) => console.error(`[isolated-capture cleanup ${resource}]`, String(error)),
  } = dependencies;
  let cacheDir = null, server = null, browser = null;
  let primaryFailed = false;
  try {
    cacheDir = mkdtempSync(path.join(temporaryDirectory(), 'cot-release-vite-'));
    server = await createViteServer({
      ...serverOptions,
      cacheDir,
      optimizeDeps: { ...serverOptions.optimizeDeps, noDiscovery:true },
    });
    await server.listen();
    browser = await launchBrowser(launchOptions);
    return await run({ server, browser });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    const failures = [];
    for (const [resource, close] of [
      ['browser', async () => { if (browser) await browser.close(); }],
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
