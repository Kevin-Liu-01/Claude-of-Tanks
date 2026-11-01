// Tank ids per browser (2026-10-31, item 266).
//
// A browser that works through a list of tank ids grows its renderer with every id: built models, textures, readbacks
// and returned images stay in the page and its GPU process until the browser closes, and tools/browser-launch.mjs kills
// a renderer past 6 GB (exit 86). 265 met the class twice in one round: genIcons over the fleet in one browser, then a
// whole-fleet tank-assets-check. Every tool that opens a browser over tank ids takes its chunks here:
//
//   import { eachBrowserChunk } from './browser-id-chunks.mjs';
//   await eachBrowserChunk('tools/my-audit.mjs', ids, async (chunk, { launch }) => {
//     const browser = await launch(puppeteer, { headless: 'new' });   // launchGuardedBrowser's arguments
//     try { /* load the page, then work through `chunk` */ } finally { await browser.close(); }
//   });
//
// - BROWSER_ID_CAPS (tools/browser-id-caps.mjs, out of every changed-only key) is each tool's cap of ids per browser, with
//   the measurement behind it; browserIdChunks splits a list into the fewest chunks within the cap, evenly (255 ids at
//   51: five of 51). gpuChunks (tools/changed-only/steps.mjs) adds a GPU step's time cap through it. COT_BROWSER_ID_CAP
//   lowers every cap (a smoke run of the chunked path; a scheduling variable, out of the keys too); it never raises one.
// - eachBrowserChunk runs `run(chunk, { index, count, launch, track })` once per chunk. `launch` is launchGuardedBrowser;
//   `track(browser)` registers a browser a wrapper launched (withIsolatedCaptureBrowser's `launchBrowser` takes `launch`
//   instead). A chunk that launched no browser of its own (one browser shared across chunks) or left one connected
//   fails. Each chunk logs its guard peaks, so a cap can be re-measured from any run's log.
// - tools/browser-launch-census.selftest.mjs fails a tool that opens a browser over tank ids without eachBrowserChunk.

import { BROWSER_ID_CAPS } from './browser-id-caps.mjs';

/** COT_BROWSER_ID_CAP, read by name: a lower cap for every tool, or Infinity. */
function envCap() {
  const value = Number(process.env.COT_BROWSER_ID_CAP);
  return value >= 1 ? Math.floor(value) : Infinity;
}

/** A tool's BROWSER_ID_CAPS row, by its path (tools/genIcons.mjs) or name (genIcons); undefined without one. */
export function browserIdCap(tool) {
  return BROWSER_ID_CAPS[tool.replace(/^.*\//, '').replace(/(\.browser)?\.mjs$/, '')];
}

/** A tool's ids in browser chunks: at most its BROWSER_ID_CAPS row (and `cap`, when the caller has a tighter one), the
 *  fewest chunks, split evenly and in order. */
export function browserIdChunks(tool, list, cap = Infinity) {
  const maxIds = browserIdCap(tool);
  if (!(maxIds > 0)) throw new Error(`browser-id-chunks: ${tool} has no BROWSER_ID_CAPS row (measure its peak per id and add one)`);
  const size = Math.max(1, Math.floor(Math.min(maxIds, cap, envCap())));
  const count = Math.ceil(list.length / size), even = Math.ceil(list.length / Math.max(1, count));
  const chunks = [];
  for (let index = 0; index < list.length; index += even) chunks.push(list.slice(index, index + even));
  return chunks;
}

const gb = (mb) => `${(mb / 1024).toFixed(2)} GB`;
const connected = (browser) => (typeof browser?.isConnected === 'function' ? browser.isConnected() : browser?.connected === true);

/**
 * Run `run(chunk, { index, count, launch, track })` for each browser chunk of `ids` in order and return each chunk's
 * result. `log` gets one line per chunk with its guard peaks (stderr by default: some tools print a report on stdout).
 */
export async function eachBrowserChunk(tool, ids, run, { cap = Infinity, log = (line) => console.error(line) } = {}) {
  const { browserGuardOf, launchGuardedBrowser } = await import('./browser-launch.mjs');
  const chunks = browserIdChunks(tool, [...ids], cap);
  const results = [];
  for (const [index, chunk] of chunks.entries()) {
    const browsers = [];
    const track = (browser) => { browsers.push(browser); return browser; };
    const launch = async (...args) => track(await launchGuardedBrowser(...args));
    results.push(await run(chunk, { index, count: chunks.length, launch, track }));
    const where = `${tool} chunk ${index + 1}/${chunks.length}`;
    if (!browsers.length) throw new Error(`browser-id-chunks: ${where} launched no browser: launch one inside each chunk`);
    if (browsers.some(connected)) throw new Error(`browser-id-chunks: ${where} left its browser connected: close it inside the chunk`);
    const guards = browsers.map(browserGuardOf).filter(Boolean);
    const peak = (key) => Math.max(0, ...guards.map((guard) => guard[key]));
    log(`[browser-chunks] ${where}: ${chunk.length} id(s) (cap ${browserIdCap(tool)})`
      + (guards.length ? `, peak renderer ${gb(peak('peakRendererMb'))}, tree ${gb(peak('peakTreeMb'))}` : ''));
  }
  return results;
}
