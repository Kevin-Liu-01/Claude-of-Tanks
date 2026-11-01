// Every browser goes through the guard (2026-10-26, item 244): no module of this checkout calls puppeteer's or
// playwright's launch, launchServer or launchPersistentContext itself; tools/browser-launch.mjs launchGuardedBrowser is
// the one caller, so every capture, probe, critic pair and receipt runs with the heap cap and the RSS watchdog. The
// census lists the sources (tracked and new) and names each direct call; its negative controls prove the pattern.
//
// Tank ids per browser (2026-10-31, item 266): a browser grows its renderer with every tank id it works through, and the
// guard kills it past 6 GB (265: genIcons, then tank-assets-check, over the fleet in one browser). A tool that opens a
// browser and reads a tank-id list (the fleet roster, an --ids or --tanks flag, the icons page's fleet, the Garage's
// cards) takes its chunks from tools/browser-id-chunks.mjs eachBrowserChunk under its own BROWSER_ID_CAPS row, or is
// named in ID_LOOP_EXEMPT with the reason it holds no id loop in one browser. eachBrowserChunk proves at run time that
// each chunk launched and closed a browser of its own.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_ID_CAPS } from './browser-id-caps.mjs';
import { browserIdCap, browserIdChunks, eachBrowserChunk } from './browser-id-chunks.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'tools/browser-launch.mjs';
// built from parts so this file is not its own finding
const LAUNCH = new RegExp(['\\b(?:puppeteer|chromium|firefox|webkit|default)', '\\s*\\.\\s*', 'launch(?:Server|PersistentContext)?\\s*\\('].join(''));

/** The direct launches in one source text: [{ line, text }]. */
function directLaunches(text) {
  return text.split('\n').flatMap((line, index) => (LAUNCH.test(line) ? [{ line: index + 1, text: line.trim().slice(0, 160) }] : []));
}

const call = (who, method = 'launch') => `${who}.${method}(`;
assert.equal(directLaunches(`const browser = await ${call('puppeteer')}{ headless: true });`).length, 1);
assert.equal(directLaunches(`browser=await ${call('chromium')}{channel:'chrome'})`).length, 1);
assert.equal(directLaunches(`owner = await ${call('chromium', 'launchServer')}{})`).length, 1);
assert.equal(directLaunches(`ctx = await ${call('chromium', 'launchPersistentContext')}dir, {})`).length, 1);
assert.equal(directLaunches(`await (await import('puppeteer')).${call('default')}{})`).length, 1, 'a dynamic import\'s default too');
assert.equal(directLaunches(`const browser = await launchGuardedBrowser(puppeteer, { headless: true });`).length, 0);
assert.equal(directLaunches(`game._wreckTurrets?.launch(entity, cause, tick);`).length, 0, 'other launch() methods are not browsers');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'scripts', 'server', 'src', 'tools'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(file) && file !== OWNER);
assert.ok(files.length > 500, `the census lists the sources (${files.length})`);
const findings = [];
for (const file of files) {
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; } // deleted in the working tree
  for (const hit of directLaunches(text)) findings.push(`${file}:${hit.line}: ${hit.text}`);
}
assert.deepEqual(findings, [], `launch every browser through ${OWNER} launchGuardedBrowser (the heap cap and the RSS watchdog):\n  `
  + findings.join('\n  '));
console.log(`browser-launch-census.selftest: ${files.length} sources, every browser launch through ${OWNER}`);

// Tank ids per browser. The scan reads code only (comments removed): a tool opens a browser and reads tank ids.
const OPENS = /\b(?:launchGuardedBrowser|withIsolatedCaptureBrowser|withMapProbeSession|withDistProbeSession)\s*\(/;
const TANK_IDS = new RegExp(['\\buniqueIds\\s*\\(', '\\b(?:ALL_TANK_IDS|DEVELOPMENT_TANK_IDS|PLAYABLE_TANK_IDS|FLEET_GROUP_BY_ID)\\b',
  '\\bfleetIds\\s*\\(', '__FLEET_IDS', 'mode=list', 'data-spec-id', '[\'"`]--(?:ids|tanks)\\b',
  '\\b(?:opt|arg|option|list|value)\\s*\\(\\s*\'(?:ids|tanks)\''].join('|'));
const CHUNKED = /\beachBrowserChunk\s*\(\s*'([^']+)'/g;
/** Files the scan names that hold no tank-id loop in one browser, and why. */
const ID_LOOP_EXEMPT = Object.freeze({
  'tools/marking-flicker-probe.mjs': 'a fresh browser for each id and checkout (openGallery), with its own 6 GB RSS guard',
  'tools/griffin-viper-garage-probe.mjs': 'two fixed vehicles (griffin_viper and griffin50mm) selected in one Garage session',
  'tools/standard-check-stages.selftest.mjs': 'fixture doubles of tank-standard-check\'s stages: it opens no browser',
  'tools/marketing-shots/capture-showcase-r2-ui.mjs': 'its --ids name showcase shots in a fixed config, not tank ids',
});
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
/** What one source says about tank ids per browser: { loops, chunked: [tool names it passes eachBrowserChunk] }. */
function idLoop(text) {
  const body = code(text);
  return { loops: OPENS.test(body) && TANK_IDS.test(body), chunked: [...body.matchAll(CHUNKED)].map((match) => match[1]) };
}
function idLoopFindings(file, text) {
  const { loops, chunked } = idLoop(text);
  const out = [];
  if (loops && !chunked.length && !ID_LOOP_EXEMPT[file]) out.push(`${file}: opens a browser over tank ids without eachBrowserChunk (tools/browser-id-chunks.mjs)`);
  for (const tool of chunked) {
    if (tool !== file) out.push(`${file}: eachBrowserChunk('${tool}') names another tool's row`);
    else if (!(browserIdCap(tool) > 0)) out.push(`${file}: no BROWSER_ID_CAPS row`);
  }
  if (ID_LOOP_EXEMPT[file] && (!loops || chunked.length)) out.push(`${file}: stale ID_LOOP_EXEMPT row (${loops ? 'it chunks now' : 'no tank-id browser left'})`);
  return out;
}

// Controls: the scan, the stale rows, the chunking and the run-time proof.
const launchCall = `const browser = await ${'launchGuardedBrowser'}(puppeteer, {});`;
assert.equal(idLoopFindings('tools/a.mjs', `${launchCall}\nfor (const id of ALL_TANK_IDS) await shoot(id);`).length, 1, 'a fleet loop in one browser');
assert.equal(idLoopFindings('tools/a.mjs', `${launchCall}\nconst ids = uniqueIds(opt('ids').split(','));`).length, 1, 'an --ids list in one browser');
assert.equal(idLoopFindings('tools/a.mjs', `await withIsolatedCaptureBrowser(s, l, run);\nconst all = await page.evaluate(() => window.__FLEET_IDS);`).length, 1,
  'a wrapper over the icons page\'s fleet');
assert.equal(idLoopFindings('tools/a.mjs', `${launchCall}\n// for (const id of ALL_TANK_IDS)`).length, 0, 'a comment is not a loop');
assert.equal(idLoopFindings('tools/a.mjs', `${launchCall}\nconst tanks = list('tanks', 'leo2a4,kv2');`).length, 1, 'a --tanks list read by a flag helper');
assert.equal(idLoopFindings('tools/a.mjs', `${launchCall}\nawait page.goto(url);`).length, 0, 'a browser without tank ids');
assert.equal(idLoopFindings('tools/genIcons.mjs', `${launchCall}\nawait eachBrowserChunk('tools/genIcons.mjs', uniqueIds(ids), run);`).length, 0);
assert.match(idLoopFindings('tools/a.mjs', `await eachBrowserChunk('tools/genIcons.mjs', uniqueIds(ids), run);`).join(), /another tool's row/);
assert.match(idLoopFindings('tools/a.mjs', `await eachBrowserChunk('tools/a.mjs', uniqueIds(ids), run);`).join(), /no BROWSER_ID_CAPS row/);
assert.deepEqual(browserIdChunks('tools/genIcons.mjs', Array.from({ length: 255 }, (_, i) => i)).map((chunk) => chunk.length), [51, 51, 51, 51, 51]);
assert.deepEqual(browserIdChunks('tools/genIcons.mjs', Array.from({ length: 52 }, (_, i) => i)).map((chunk) => chunk.length), [26, 26]);
assert.throws(() => browserIdChunks('tools/a.mjs', [1]), /no BROWSER_ID_CAPS row/);
{
  // a launcher double: launchGuardedBrowser hands back what starts no browser of this process, unwatched
  const fake = () => ({ launch: async () => { const browser = { connected: true, close: async () => { browser.connected = false; } }; return browser; } });
  const quiet = { log: () => {} };
  const ids = Array.from({ length: 5 }, (_, i) => `id${i}`);
  const seen = await eachBrowserChunk('tools/genIcons.mjs', ids, async (chunk, { launch }) => {
    const browser = await launch(fake(), {});
    await browser.close();
    return chunk;
  }, { cap: 2, ...quiet });
  assert.deepEqual(seen, [['id0', 'id1'], ['id2', 'id3'], ['id4']], 'one browser per chunk, in order');
  const shared = await fake().launch();
  await assert.rejects(eachBrowserChunk('tools/genIcons.mjs', ids, async () => shared, { cap: 2, ...quiet }), /launched no browser/,
    'a browser shared across chunks fails');
  await assert.rejects(eachBrowserChunk('tools/genIcons.mjs', ids, async (chunk, { launch }) => launch(fake(), {}), { cap: 2, ...quiet }),
    /left its browser connected/, 'a chunk that leaves its browser open fails');
  const wrapped = await eachBrowserChunk('tools/genIcons.mjs', ids, async (chunk, { track }) => {
    const browser = track(await fake().launch());
    await browser.close();
    return chunk.length;
  }, { cap: 3, ...quiet });
  assert.deepEqual(wrapped, [3, 2], 'a wrapper\'s browser counts once tracked');
}

const idFindings = [];
const loopers = [];
const SELF = new Set(['tools/browser-launch-census.selftest.mjs', 'tools/browser-id-chunks.mjs', 'tools/browser-id-caps.mjs']); // their fixtures name rows
for (const file of files.filter((name) => !SELF.has(name))) {
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
  idFindings.push(...idLoopFindings(file, text));
  if (idLoop(text).chunked.includes(file)) loopers.push(file);
}
for (const [file, reason] of Object.entries(ID_LOOP_EXEMPT)) {
  if (!files.includes(file)) idFindings.push(`${file}: ID_LOOP_EXEMPT names a file that is gone (${reason})`);
}
const loopNames = new Set(loopers.map((file) => file.replace(/^.*\//, '').replace(/(\.browser)?\.mjs$/, '')));
for (const name of Object.keys(BROWSER_ID_CAPS)) {
  if (!loopNames.has(name)) idFindings.push(`BROWSER_ID_CAPS '${name}': no tool of that name calls eachBrowserChunk with its own path`);
}
assert.ok(Object.keys(BROWSER_ID_CAPS).every((name) => !name.includes('/') && !name.includes('.')),
  'the caps are keyed by tool name, never a path (browserIdCap and this census match rows by name)');
assert.deepEqual(idFindings, [], `every tank-id browser loop through tools/browser-id-chunks.mjs eachBrowserChunk:\n  ${idFindings.join('\n  ')}`);
console.log(`browser-launch-census.selftest: ${loopers.length} tools chunk tank ids per browser, ${Object.keys(ID_LOOP_EXEMPT).length} exempt`);
