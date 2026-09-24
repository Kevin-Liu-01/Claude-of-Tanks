// Shared scaffolding of the map / battle capture probes (tools/map-view-probe.mjs, terrain-layer-flag-probe.mjs,
// terrain-uniform-iso-probe.mjs, world-layer-isolation-probe.mjs, salvo-indicator-probe.mjs, water-drive-probe.mjs):
// the argument parser and --help, one private vite server + one headless browser per run, the game page boot, the
// solo-battle entry through window.__DEBUG.beginSoloBattle, the two pose helpers and the JSON receipt every run
// writes next to its captures. Owner approval to commit the round 41–47 QA probes as tools: 2026-09-23.
//
// The probe mutex is the CALLER's business. A run owns a vite dev server and a GPU browser for a minute or more, so
// agents hold the shared scratch mutex around the whole process and run it at low priority:
//   until mkdir "$SP/probe.lock" 2>/dev/null; do sleep 5; done
//   nice -n 19 node tools/map-view-probe.mjs --root=<worktree> --out=<dir> --maps=badlands --views=sw-corner-close
//   rmdir "$SP/probe.lock"
// These tools take neither that mutex nor the /tmp/cot-shots FIFO of the release harnesses (tools/capture-lock.mjs):
// never run one beside `npm test` or `tank:release:check`. The server binds 127.0.0.1 on 5300 + (pid % 90) and
// walks upward when busy (owner rule: probe servers live in 5300–5399, never on 5197–5199); vite serves the tree
// live, so do not edit tracked source while a run is capturing.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

export const MAP_PROBE_PORT_BASE = 5300;
export const MAP_PROBE_PORT_SPAN = 90;
/** The repository's headless capture flags (procedural-fidelity, tank-standard-check, the marketing shots). */
export const MAP_PROBE_BROWSER_ARGS = Object.freeze(['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage']);
/** Settle times (ms) the rounds captured with; the receipt records them so a re-run is comparable. */
export const MAP_PROBE_SETTLE_MS = Object.freeze({ battle: 1500, pose: 1400, recompile: 2500, toggle: 500, uniform: 400 });
/** Desktop tier, no splash, fresh graphics settings: the query every map capture booted with. */
const MAP_PROBE_GAME_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
const MAP_PROBE_DEFAULT_SPEC = 't90m_x';
/** |x|,|z| clamp for the ground-height lookup (the playable square's height field). */
export const MAP_PROBE_HEIGHT_CLAMP = 511;
export const MAP_PROBE_FOV = 55;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------- arguments

const FLAGS = Object.freeze({
  root: { kind: 'string', doc: 'checkout to serve (default: the current directory)' },
  out: { kind: 'string', doc: 'capture directory (default: <root>/.qa-dev/reports/<tool>)' },
  maps: { kind: 'list', doc: 'comma-separated map ids' },
  views: { kind: 'list', doc: 'comma-separated view names from tools/map-view-probe-views.mjs (default: every view)' },
  tag: { kind: 'string', doc: 'tag written into every capture name, <map>-<tag>-<view>.png (default: a)' },
  spec: { kind: 'string', doc: `player vehicle spec id (default: ${MAP_PROBE_DEFAULT_SPEC})` },
  speed: { kind: 'number', doc: 'target fording speed in m/s (default: 7)' },
  'iso-uniforms': { kind: 'list', doc: 'terrain splat uniforms zeroed one at a time (uRipple,uMacro,...)' },
  'flat-normals': { kind: 'boolean', doc: 'also capture every view with flat normal maps on the four splat layers' },
  hide: { kind: 'hide', doc: 'suffix=regex;suffix=regex — world mesh names hidden one pattern at a time' },
  ids: { kind: 'list', doc: 'specId:label cases, the label names the capture files' },
  'cache-dir': { kind: 'string', doc: 'reuse a warm vite optimizer cache of your own (default: a fresh temporary directory)' },
  'executable-path': { kind: 'string', doc: 'Chrome binary for the real-input path (default: the system Chrome when present)' },
});

function parseHideSpec(text) {
  const entries = [];
  for (const part of text.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0 || eq === part.length - 1) throw new Error(`--hide entries are suffix=regex, got "${part}"`);
    const suffix = part.slice(0, eq), pattern = part.slice(eq + 1);
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(suffix)) throw new Error(`--hide suffix must be a file-name token, got "${suffix}"`);
    if (entries.some((e) => e.suffix === suffix)) throw new Error(`--hide suffix "${suffix}" given twice`);
    try { new RegExp(pattern, 'i'); } catch (error) { throw new Error(`--hide pattern for ${suffix} is not a regex: ${error.message}`); }
    entries.push({ suffix, pattern });
  }
  if (!entries.length) throw new Error('--hide needs at least one suffix=regex entry');
  return entries;
}

/**
 * Parse a probe's argv against its flag allowlist. Every flag is --name=value (booleans bare); anything else fails
 * closed before a server or browser exists. Returns { help: true } for --help.
 */
export function parseProbeArgs(argv, { tool, accepts, defaults = {} }) {
  if (!tool || !Array.isArray(accepts)) throw new TypeError('parseProbeArgs needs a tool name and its flag allowlist');
  for (const name of accepts) if (!FLAGS[name]) throw new Error(`parseProbeArgs: unknown flag spec ${name}`);
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const values = {};
  for (const arg of argv) {
    const match = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(arg);
    if (!match) throw new Error(`Unknown argument "${arg}" (flags are --name=value; see --help)`);
    const [, name, raw] = match;
    if (!accepts.includes(name)) throw new Error(`Unknown argument --${name} for ${tool} (see --help)`);
    if (name in values) throw new Error(`Duplicate --${name}`);
    const spec = FLAGS[name];
    if (spec.kind === 'boolean') {
      if (raw !== undefined) throw new Error(`--${name} takes no value`);
      values[name] = true;
      continue;
    }
    if (raw === undefined || raw === '') throw new Error(`--${name} requires an explicit =value`);
    if (spec.kind === 'string') values[name] = raw;
    else if (spec.kind === 'list') {
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) throw new Error(`--${name} needs at least one entry`);
      values[name] = list;
    } else if (spec.kind === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number, got "${raw}"`);
      values[name] = n;
    } else if (spec.kind === 'hide') values[name] = parseHideSpec(raw);
  }
  const root = path.resolve(values.root ?? process.cwd());
  const options = { tool, root, tag: values.tag ?? defaults.tag ?? 'a' };
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(options.tag)) throw new Error(`--tag must be a file-name token, got "${options.tag}"`);
  options.out = path.resolve(values.out ?? defaults.out ?? path.join(root, '.qa-dev', 'reports', tool));
  for (const name of accepts) {
    if (name === 'root' || name === 'out' || name === 'tag') continue;
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (name in values) options[key] = values[name];
    else if (name in defaults) options[key] = defaults[name];
    else if (FLAGS[name].kind === 'boolean') options[key] = false;
    else options[key] = null;
  }
  if (accepts.includes('spec') && !options.spec) options.spec = MAP_PROBE_DEFAULT_SPEC;
  if (accepts.includes('maps') && !options.maps) throw new Error('--maps=<id,...> is required');
  return { help: false, options };
}

/** One usage text per tool, built from the same flag table the parser enforces. */
export function probeHelp({ tool, summary, accepts, defaults = {}, notes = [] }) {
  const flags = accepts.map((name) => {
    const spec = FLAGS[name];
    const shown = spec.kind === 'boolean' ? `--${name}` : `--${name}=<${spec.kind === 'list' ? 'a,b' : spec.kind === 'hide' ? 'suffix=regex;...' : 'value'}>`;
    const def = name in defaults && spec.kind !== 'boolean' ? ` [default ${Array.isArray(defaults[name]) ? defaults[name].join(',') : defaults[name]}]` : '';
    return `  ${shown.padEnd(30)} ${spec.doc}${def}`;
  });
  return [
    `node tools/${tool}.mjs [flags]`, '', summary, '', 'Flags:', ...flags, '  --help',
    '',
    'Writes its PNG captures and <tool>-<tag>.receipt.json into --out. Hold the probe mutex and run under nice -n 19',
    '(see the header of tools/map-probe-runtime.mjs); the server takes a 5300–5399 port on 127.0.0.1.',
    ...(notes.length ? ['', ...notes] : []),
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------- session

/** Private optimizer cache directory: the caller's own (--cache-dir) or a fresh temporary one removed at exit. */
function resolveProbeCacheDir(cacheDir) {
  if (cacheDir) { mkdirSync(cacheDir, { recursive: true }); return { dir: path.resolve(cacheDir), temporary: false }; }
  return { dir: mkdtempSync(path.join(tmpdir(), 'cot-map-probe-vite-')), temporary: true };
}

export function mapProbeServerOptions(root, cacheDir) {
  return {
    root, configFile: false, cacheDir, logLevel: 'error',
    optimizeDeps: {
      entries: ['index.html'],
      include: ['three', 'three/examples/jsm/utils/BufferGeometryUtils.js', 'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
    },
    server: {
      host: '127.0.0.1', port: MAP_PROBE_PORT_BASE + (process.pid % MAP_PROBE_PORT_SPAN), strictPort: false, hmr: false,
      watch: { ignored: ['**/*'] },
    },
  };
}

export function mapProbeLaunchOptions({ width, height, executablePath = null, protocolTimeout = 400000 } = {}) {
  const args = [...MAP_PROBE_BROWSER_ARGS];
  if (width && height) args.push(`--window-size=${width},${height}`);
  return { headless: 'new', protocolTimeout, args, ...(executablePath ? { executablePath } : {}) };
}

/**
 * Own one vite server and one browser for the run. Cleanup runs browser → server → temporary cache, and a cleanup
 * failure never replaces the run's own error (the same discipline as tools/isolated-capture-browser.mjs).
 */
export async function withMapProbeSession({ root, cacheDir = null, launch = {} }, run) {
  if (!existsSync(path.join(root, 'index.html'))) throw new Error(`--root ${root} has no index.html to serve`);
  const cache = resolveProbeCacheDir(cacheDir);
  let server = null, browser = null, primaryFailed = false;
  try {
    server = await createServer(mapProbeServerOptions(root, cache.dir));
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await puppeteer.launch(mapProbeLaunchOptions(launch));
    return await run({ server, browser, port, baseUrl: `http://127.0.0.1:${port}`, cacheDir: cache.dir });
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    const failures = [];
    for (const [resource, close] of [
      ['browser', async () => { if (browser) await browser.close(); }],
      ['server', async () => { if (server) await server.close(); }],
      ['cache', () => { if (cache.temporary) rmSync(cache.dir, { recursive: true, force: true }); }],
    ]) {
      try { await close(); } catch (error) { failures.push({ resource, error }); }
    }
    for (const { resource, error } of failures) console.error(`[map-probe cleanup ${resource}]`, String(error));
    if (failures.length && !primaryFailed) throw new AggregateError(failures.map((f) => f.error), 'map probe cleanup failed');
  }
}

/** A booted game page: viewport pinned, page errors collected, window.__GAME_READY seen. */
export async function openGamePage(browser, { port, viewport, query = MAP_PROBE_GAME_QUERY, readyTimeoutMs = 300000 }) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: readyTimeoutMs });
  return { page, errors };
}

/** Enter a solo battle the way the rounds did and wait until the pre-battle clock has run out. */
export async function beginSoloBattle(page, { specId, mapId, gameMode = 'standard', timeoutMs = 300000, settleMs = MAP_PROBE_SETTLE_MS.battle }) {
  await page.evaluate((request) => { setTimeout(() => window.__DEBUG.beginSoloBattle(request), 0); }, { specId, mapId, gameMode });
  await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0', { timeout: timeoutMs, polling: 250 });
  await sleep(settleMs);
}

// ---------------------------------------------------------------------------------------------- poses

/**
 * A table view resolved against the ground: the metres in cam[1] / at[1] are added to the height at the CLAMPED XZ
 * (|x|,|z| <= half), while the XZ itself stays where the table put it. Self-contained on purpose — applyGroundPose
 * stringifies this exact function into the page, so the receipt exercises the code the browser runs.
 */
export function resolveGroundPose(view, heightAt, half = 511, fov = 55) {
  const clamp = (n) => Math.max(-half, Math.min(half, n));
  const cam = view.cam, at = view.at;
  const cy = heightAt(clamp(cam[0]), clamp(cam[2])) + cam[1];
  const ay = heightAt(clamp(at[0]), clamp(at[2])) + at[1];
  return { cam: [cam[0], cy, cam[2]], at: [at[0], ay, at[2]], fov };
}

/** Pin the live camera to a table view and let the frame settle; returns the resolved pose for the receipt. */
export async function applyGroundPose(page, view, { half = MAP_PROBE_HEIGHT_CLAMP, fov = MAP_PROBE_FOV, settleMs = MAP_PROBE_SETTLE_MS.pose } = {}) {
  const pose = await page.evaluate(`(() => {
    const resolveGroundPose = ${resolveGroundPose.toString()};
    const D = window.__DEBUG; const hf = D.world.heightField; const V = D.camera.position.constructor;
    const pose = resolveGroundPose(${JSON.stringify({ cam: view.cam, at: view.at })}, (x, z) => hf.getHeightAt(x, z), ${half}, ${fov});
    D.rig.setExternalPose(new V(...pose.cam), new V(...pose.at), pose.fov);
    return pose;
  })()`);
  await sleep(settleMs);
  return pose;
}

/** Camera poses relative to the live hull (water pass 8): behind and above, high and slightly behind, low abeam. */
export const HULL_RELATIVE_POSES = Object.freeze({
  chase: Object.freeze({ back: 18, up: 8, aheadAt: 4, upAt: 1 }),
  bird: Object.freeze({ back: 10, up: 55, aheadAt: -8, upAt: 0 }),
  side: Object.freeze({ back: 0, side: 22, up: 4, aheadAt: -6, upAt: 0.5 }),
});

/**
 * Resolve a hull-relative pose. The hull's forward is (sin yaw, cos yaw) — local +Z — and its starboard side is
 * (fz, -fx): a hull facing north (+Z) has east (+X) to starboard. `side` puts the camera off the starboard flank.
 */
export function resolveHullRelativePose(state, kind, poses = HULL_RELATIVE_POSES, fov = 55) {
  const p = poses[kind];
  if (!p) throw new Error(`Unknown hull-relative pose "${kind}"`);
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
  const sx = fz, sz = -fx, side = p.side || 0;
  return {
    cam: [state.pos.x - fx * p.back + sx * side, state.pos.y + p.up, state.pos.z - fz * p.back + sz * side],
    at: [state.pos.x + fx * p.aheadAt, state.pos.y + p.upAt, state.pos.z + fz * p.aheadAt],
    fov,
  };
}

/**
 * Mirrored-frame note. A three.js camera looking along the horizontal heading (fx, fz) with +Y up has screen-right
 * = (-fz, fx): looking north (+Z) puts WEST on the right of the frame, the mirror of a north-up minimap where east
 * is right — and the mirror of the hull, whose starboard is (fz, -fx). Read compass claims in captures with this.
 */
export function screenRightOf(fx, fz) {
  const len = Math.hypot(fx, fz);
  if (!(len > 0)) throw new Error('screenRightOf needs a non-zero horizontal heading');
  return [-fz / len, fx / len];
}

// ---------------------------------------------------------------------------------------------- receipts

function gitRevision(root) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

export function receiptPath(out, tool, tag) {
  return path.join(out, `${tool}-${tag}.receipt.json`);
}

/** Write the run's receipt next to its captures; returns its path. */
export function writeProbeReceipt(options, body) {
  mkdirSync(options.out, { recursive: true });
  const { tool, root, out, tag } = options;
  const receipt = {
    tool, tag, root, out, revision: gitRevision(root), writtenAt: new Date().toISOString(),
    settleMs: MAP_PROBE_SETTLE_MS, browserArgs: MAP_PROBE_BROWSER_ARGS, options, ...body,
  };
  const file = receiptPath(out, tool, tag);
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return file;
}

// ---------------------------------------------------------------------------------------------- CLI

export function isMainModule(importMetaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}

/**
 * The shared main: --help prints usage and exits 0; a parse error prints the message and usage and exits 1 without
 * touching a server or browser; otherwise run(options) returns { ok } and the process exits 1 when ok is false.
 */
export async function runProbeCli({ argv = process.argv.slice(2), help, parse, run }) {
  let parsed;
  try { parsed = parse(argv); }
  catch (error) { console.error(`${error.message}\n\n${help}`); process.exitCode = 1; return null; }
  if (parsed.help) { console.log(help); return null; }
  const result = await run(parsed.options);
  if (!result?.ok) process.exitCode = 1;
  return result;
}
