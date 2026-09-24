// Receipt of the map probe tools' shared runtime (round 48, 2026-09-23): argument parsing fails closed before any
// server or browser exists, the AAA map program's view table is pinned by count and digest, the pose math the page
// runs (stringified into it) is exact, the mirrored-frame note holds against a real three.js camera, every tool's
// --help and a bad flag return without a network, and the receipt writer records what a re-run needs. Never starts a
// vite server or a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  HULL_RELATIVE_POSES, MAP_PROBE_BROWSER_ARGS, MAP_PROBE_HEIGHT_CLAMP, MAP_PROBE_PORT_BASE, MAP_PROBE_PORT_SPAN,
  MAP_PROBE_SETTLE_MS, mapProbeLaunchOptions, mapProbeServerOptions, parseProbeArgs, probeHelp, receiptPath,
  resolveGroundPose, resolveHullRelativePose, screenRightOf, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_FOV, MAP_VIEW_PROBE_HALF, MAP_VIEW_PROBE_VIEWPORT, MAP_VIEW_PROBE_VIEWS, selectMapViews } from './map-view-probe-views.mjs';
import { parseMapViewProbeArgs } from './map-view-probe.mjs';
import { LAYER_FLAG_PALETTE, parseLayerFlagArgs } from './terrain-layer-flag-probe.mjs';
import { parseUniformIsoArgs } from './terrain-uniform-iso-probe.mjs';
import { DEFAULT_HIDDEN_LAYERS, parseLayerIsolationArgs } from './world-layer-isolation-probe.mjs';
import { SALVO_PROBE_DEFAULT_CASES, parseSalvoCases, parseSalvoIndicatorArgs } from './salvo-indicator-probe.mjs';
import { WATER_DRIVE_ENTRIES, parseWaterDriveArgs } from './water-drive-probe.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

// ------------------------------------------------------------------ argument parsing (fails closed, no launch)
const base = { tool: 'x-probe', accepts: ['root', 'out', 'maps', 'views', 'tag', 'spec', 'speed', 'iso-uniforms', 'flat-normals', 'hide', 'ids', 'cache-dir', 'executable-path'] };
assert.deepEqual(parseProbeArgs(['--help'], base), { help: true });
assert.deepEqual(parseProbeArgs(['--maps=a', '-h'], base), { help: true }, '-h is --help');
const parsed = parseProbeArgs(['--root=/tmp/wt', '--maps=badlands, desert', '--views=sky-w,sky-s', '--tag=b2', '--speed=6.5',
  '--iso-uniforms=uRipple,uMacro', '--flat-normals', '--hide=no-apron=shallowWaterSeaApron;no-sheet=^shallow_water_', '--ids=a_b:salvo,c'], base).options;
assert.equal(parsed.root, path.resolve('/tmp/wt'));
assert.equal(parsed.out, path.resolve('/tmp/wt/.qa-dev/reports/x-probe'), 'default out sits under <root>/.qa-dev/reports/<tool>');
assert.deepEqual(parsed.maps, ['badlands', 'desert']); assert.deepEqual(parsed.views, ['sky-w', 'sky-s']);
assert.equal(parsed.tag, 'b2'); assert.equal(parsed.spec, 't90m_x'); assert.equal(parsed.speed, 6.5);
assert.deepEqual(parsed.isoUniforms, ['uRipple', 'uMacro']); assert.equal(parsed.flatNormals, true);
assert.deepEqual(parsed.hide, [{ suffix: 'no-apron', pattern: 'shallowWaterSeaApron' }, { suffix: 'no-sheet', pattern: '^shallow_water_' }]);
assert.deepEqual(parsed.ids, ['a_b:salvo', 'c']); assert.equal(parsed.cacheDir, null); assert.equal(parsed.executablePath, null);
const defaulted = parseProbeArgs(['--maps=a'], { ...base, defaults: { tag: 'iso', speed: 7, hide: DEFAULT_HIDDEN_LAYERS } }).options;
assert.equal(defaulted.tag, 'iso'); assert.equal(defaulted.speed, 7); assert.equal(defaulted.hide, DEFAULT_HIDDEN_LAYERS); assert.equal(defaulted.flatNormals, false);
assert.equal(parseProbeArgs(['--maps=a', '--out=rel/dir'], base).options.out, path.resolve('rel/dir'), '--out resolves against the cwd');
for (const [argv, message] of [
  [['--maps=a', '--bogus=1'], /Unknown argument --bogus/],
  [['--maps=a', 'positional'], /Unknown argument "positional"/],
  [['--maps=a', '--maps=b'], /Duplicate --maps/],
  [['--maps'], /requires an explicit =value/],
  [['--maps='], /requires an explicit =value/],
  [['--maps=,'], /at least one entry/],
  [[], /--maps=<id,...> is required/],
  [['--maps=a', '--speed=0'], /positive number/],
  [['--maps=a', '--speed=fast'], /positive number/],
  [['--maps=a', '--flat-normals=1'], /takes no value/],
  [['--maps=a', '--tag=a b'], /--tag must be a file-name token/],
  [['--maps=a', '--hide=nosuffix'], /suffix=regex/],
  [['--maps=a', '--hide=x=(unclosed'], /not a regex/],
  [['--maps=a', '--hide=x=a;x=b'], /given twice/],
  [['--maps=a', '--hide=bad suffix=a'], /file-name token/],
]) assert.throws(() => parseProbeArgs(argv, base), message, argv.join(' '));
assert.throws(() => parseProbeArgs(['--maps=a', '--tag=x'], { tool: 'view-only', accepts: ['root', 'out', 'maps'] }), /Unknown argument --tag for view-only/,
  'a flag outside the tool allowlist is unknown even though the runtime knows it');
assert.throws(() => parseProbeArgs([], { tool: 't', accepts: ['nope'] }), /unknown flag spec/);
const help = probeHelp({ tool: 't', summary: 'S', accepts: ['root', 'maps', 'flat-normals', 'hide'], defaults: { maps: ['a', 'b'] }, notes: ['N'] });
assert.match(help, /^node tools\/t\.mjs \[flags\]\n\nS\n\nFlags:\n {2}--root=<value>/);
assert.match(help, /--maps=<a,b> .*\[default a,b\]/); assert.match(help, /--flat-normals {2,}/); assert.match(help, /--hide=<suffix=regex;\.\.\.>/);
assert.match(help, /--help\n/); assert.match(help, /probe mutex/); assert.match(help, /5300–5399/); assert.match(help, /\nN$/);

// ------------------------------------------------------------------ per-tool parsers
assert.deepEqual(parseMapViewProbeArgs(['--maps=badlands', '--views=sky-w,canyon-in']).options.viewList.map((v) => v.name), ['sky-w', 'canyon-in'],
  'view order follows the table, not the flag');
assert.equal(parseMapViewProbeArgs(['--maps=badlands']).options.viewList.length, MAP_VIEW_PROBE_VIEWS.length);
assert.throws(() => parseMapViewProbeArgs(['--maps=badlands', '--views=nope']), /Unknown view\(s\): nope/);
assert.throws(() => parseMapViewProbeArgs(['--maps=badlands', '--speed=7']), /Unknown argument --speed/, 'the view probe has no speed');
assert.equal(parseLayerFlagArgs(['--maps=monsoon']).options.tag, 'flag');
assert.deepEqual(Object.keys(LAYER_FLAG_PALETTE), ['uAlbG', 'uAlbD', 'uAlbR', 'uAlbM']);
assert.deepEqual(parseUniformIsoArgs(['--maps=desert', '--iso-uniforms=uRipple']).options.isoUniforms, ['uRipple']);
assert.equal(parseUniformIsoArgs(['--maps=desert', '--flat-normals']).options.flatNormals, true);
assert.throws(() => parseUniformIsoArgs(['--maps=desert']), /--iso-uniforms=<name,...> and\/or --flat-normals/);
assert.throws(() => parseUniformIsoArgs(['--maps=desert', '--iso-uniforms=ripple']), /shader uniforms/);
assert.equal(parseLayerIsolationArgs(['--maps=coastal']).options.hide, DEFAULT_HIDDEN_LAYERS);
assert.deepEqual(DEFAULT_HIDDEN_LAYERS.map((h) => h.suffix), ['no-apron', 'no-forest', 'no-ringmesh', 'no-sheet'], 'round 40 layers');
assert.deepEqual(parseLayerIsolationArgs(['--maps=coastal', '--hide=only=^horizon-ring$']).options.hide, [{ suffix: 'only', pattern: '^horizon-ring$' }]);
assert.deepEqual(parseSalvoCases([...SALVO_PROBE_DEFAULT_CASES]), [
  { id: 'ztz100_prototype', label: 'salvo' }, { id: 'leclerc_x', label: 'autoloader' }, { id: 't72b3m', label: 'single' }]);
assert.deepEqual(parseSalvoCases(['t90m_x']), [{ id: 't90m_x', label: 't90m_x' }], 'label defaults to the id');
assert.throws(() => parseSalvoCases(['T90:x']), /specId\[:label\]/); assert.throws(() => parseSalvoCases(['t90m_x:a b']), /file-name token/);
const salvo = parseSalvoIndicatorArgs(['--out=/tmp/o']).options;
assert.deepEqual(salvo.cases.map((c) => c.id), ['ztz100_prototype', 'leclerc_x', 't72b3m']); assert.equal(salvo.tag, 'salvo');
assert.ok(salvo.executablePath === null || salvo.executablePath.endsWith('Google Chrome'), 'system Chrome when present, else puppeteer');
assert.equal(parseSalvoIndicatorArgs(['--executable-path=/x/chrome']).options.executablePath, '/x/chrome');
assert.throws(() => parseSalvoIndicatorArgs(['--maps=a']), /Unknown argument --maps/, 'the salvo probe takes ids, not maps');
assert.equal(parseWaterDriveArgs(['--maps=reservoir,coastal']).options.speed, 7);
assert.throws(() => parseWaterDriveArgs(['--maps=badlands']), /No shore entry point for badlands/);
assert.deepEqual(Object.keys(WATER_DRIVE_ENTRIES), ['reservoir', 'coastal', 'fjord', 'oasis', 'skybridge', 'alpine']);
for (const e of Object.values(WATER_DRIVE_ENTRIES)) assert.ok([0, Math.PI / 2].includes(e.yaw) && Math.abs(e.x) < 512 && Math.abs(e.z) < 512, 'entry inside the square');

// ------------------------------------------------------------------ the view table (pinned)
// owner 2026-09-23: the table is the acceptance record of rounds 35–47; re-pin count and digest with a dated note.
assert.equal(MAP_VIEW_PROBE_VIEWS.length, 31);
assert.equal(createHash('sha256').update(JSON.stringify(MAP_VIEW_PROBE_VIEWS)).digest('hex'),
  '76914e102003e1004a2ba955aba7d3b4ae829a0ec753d0a89fee91be90a17d9e', 'view table digest (2026-09-23)');
assert.ok(Object.isFrozen(MAP_VIEW_PROBE_VIEWS));
assert.equal(new Set(MAP_VIEW_PROBE_VIEWS.map((v) => v.name)).size, 31, 'unique names');
for (const v of MAP_VIEW_PROBE_VIEWS) {
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.cam) && Object.isFrozen(v.at), v.name);
  assert.match(v.name, /^[a-z0-9]+(?:-[a-z0-9.]+)*$/, `${v.name}: kebab file-name token`);
  assert.ok([35, 36, 40, 47].includes(v.round), `${v.name}: round`);
  for (const p of [v.cam, v.at]) { assert.equal(p.length, 3); for (const n of p) assert.ok(Number.isFinite(n), `${v.name}: finite`); }
  assert.ok(Math.abs(v.cam[0]) <= 560 && Math.abs(v.cam[2]) <= 560, `${v.name}: camera near or inside the square`);
}
assert.deepEqual(MAP_VIEW_PROBE_VIEWS.filter((v) => v.round === 47).map((v) => v.name), ['bird-e-edge', 'bird-w-edge', 'bird-e-edge-n', 'shore-e-oblique', 'shore-w-oblique'], 'round-47 edge views');
assert.deepEqual(selectMapViews(['canyon-in', 'sw-corner-close']).map((v) => v.name), ['sw-corner-close', 'canyon-in']);
assert.equal(selectMapViews(null).length, 31); assert.equal(selectMapViews([]).length, 31);
assert.throws(() => selectMapViews(['sw-corner-close', 'x', 'y']), /Unknown view\(s\): x, y/);
assert.deepEqual(MAP_VIEW_PROBE_VIEWPORT, { width: 1600, height: 900 }); assert.equal(MAP_VIEW_PROBE_FOV, 55); assert.equal(MAP_VIEW_PROBE_HALF, MAP_PROBE_HEIGHT_CLAMP);

// ------------------------------------------------------------------ pose math
const heightAt = (x, z) => 100 + x * 0.1 + z * 0.01; // a plane, so the clamp shows in the numbers
const corner = resolveGroundPose({ cam: [-470, 6, -470], at: [-640, 40, -640] }, heightAt);
near(corner.cam[1], heightAt(-470, -470) + 6, 1e-12, 'camera height = ground at the camera + 6');
near(corner.at[1], heightAt(-511, -511) + 40, 1e-12, 'look-at height = ground at the CLAMPED xz + 40');
assert.deepEqual([corner.at[0], corner.at[2]], [-640, -640], 'the look-at xz itself is not clamped');
assert.equal(corner.fov, 55);
assert.equal(resolveGroundPose({ cam: [0, 6, 0], at: [-900, 260, 0] }, heightAt, 100, 40).fov, 40);
near(resolveGroundPose({ cam: [0, 6, 0], at: [-900, 260, 0] }, heightAt, 100).at[1], heightAt(-100, 0) + 260, 1e-12, 'custom clamp');
assert.equal(new Function(`return (${resolveGroundPose.toString()})`)()({ cam: [1, 2, 3], at: [4, 5, 6] }, () => 10).cam[1], 12,
  'the function is self-contained: its source runs standalone, as applyGroundPose stringifies it into the page');
const north = { pos: { x: 10, y: 2, z: 20 }, yaw: 0 };
const chase = resolveHullRelativePose(north, 'chase');
assert.deepEqual(chase.cam, [10, 10, 2], 'chase: 18 m behind (−Z when facing north), 8 m up');
assert.deepEqual(chase.at, [10, 3, 24], 'chase: looks 4 m ahead, 1 m up');
const side = resolveHullRelativePose(north, 'side');
assert.deepEqual(side.cam, [32, 6, 20], 'side: 22 m to starboard (+X when facing north), 4 m up');
assert.deepEqual(side.at, [10, 2.5, 14], 'side: looks 6 m behind the hull');
const east = resolveHullRelativePose({ pos: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2 }, 'bird');
near(east.cam[0], -10, 1e-9, 'bird: 10 m behind (−X when facing east)'); near(east.cam[1], 55, 1e-12, 'bird: 55 m up'); near(east.cam[2], 0, 1e-9, 'bird: no side offset');
near(east.at[0], -8, 1e-9, 'bird: looks 8 m behind');
assert.throws(() => resolveHullRelativePose(north, 'orbit'), /Unknown hull-relative pose/);
assert.deepEqual(Object.keys(HULL_RELATIVE_POSES), ['chase', 'bird', 'side']);

// ------------------------------------------------------------------ the mirrored-frame note against a real camera
const camera = new PerspectiveCamera(55, 16 / 9, 0.5, 4000);
for (const [label, fx, fz] of [['north', 0, 1], ['east', 1, 0], ['south', 0, -1], ['west', -1, 0], ['north-east', Math.SQRT1_2, Math.SQRT1_2]]) {
  camera.position.set(0, 10, 0); camera.up.set(0, 1, 0); camera.lookAt(new Vector3(fx * 100, 10, fz * 100)); camera.updateMatrixWorld(true);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0); // camera local +X in world space
  const [rx, rz] = screenRightOf(fx, fz);
  near(right.x, rx, 1e-9, `${label}: screen-right x`); near(right.z, rz, 1e-9, `${label}: screen-right z`); near(right.y, 0, 1e-9, `${label}: level`);
}
assert.deepEqual(screenRightOf(0, 1), [-1, 0], 'looking north, screen-right is WEST: the frame mirrors a north-up map');
assert.deepEqual(screenRightOf(0, 2), [-1, 0], 'normalised');
const starboard = [Math.cos(0), -Math.sin(0)]; // (fz, -fx) for yaw 0, the hull's +X
assert.deepEqual(starboard, [1, -0], 'a hull facing north has east to starboard — the opposite side from screen-right');
assert.throws(() => screenRightOf(0, 0), /non-zero/);

// ------------------------------------------------------------------ server / launch options and receipts
const serverOptions = mapProbeServerOptions('/wt', '/cache');
assert.equal(serverOptions.server.host, '127.0.0.1'); assert.equal(serverOptions.server.hmr, false); assert.equal(serverOptions.configFile, false);
assert.ok(serverOptions.server.port >= MAP_PROBE_PORT_BASE && serverOptions.server.port < MAP_PROBE_PORT_BASE + MAP_PROBE_PORT_SPAN, 'port in 5300–5389 + walk-up');
assert.equal(MAP_PROBE_PORT_BASE, 5300); assert.equal(MAP_PROBE_PORT_SPAN, 90);
assert.ok(![5197, 5198, 5199].some((p) => p >= MAP_PROBE_PORT_BASE && p < MAP_PROBE_PORT_BASE + MAP_PROBE_PORT_SPAN), 'never the owner ports');
assert.deepEqual(serverOptions.server.watch, { ignored: ['**/*'] }); assert.equal(serverOptions.optimizeDeps.noDiscovery, undefined, 'discovery stays on: one three instance');
const launch = mapProbeLaunchOptions({ width: 1600, height: 900 });
assert.equal(launch.headless, 'new'); assert.deepEqual(launch.args, [...MAP_PROBE_BROWSER_ARGS, '--window-size=1600,900']); assert.equal(launch.executablePath, undefined);
assert.equal(mapProbeLaunchOptions({ executablePath: '/x' }).executablePath, '/x');
assert.deepEqual(MAP_PROBE_BROWSER_ARGS, ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage']);
assert.deepEqual(MAP_PROBE_SETTLE_MS, { battle: 1500, pose: 1400, recompile: 2500, toggle: 500, uniform: 400 });
const out = mkdtempSync(path.join(tmpdir(), 'cot-map-probe-receipt-'));
try {
  const options = { tool: 'x-probe', root: ROOT, out: path.join(out, 'nested'), tag: 'b', maps: ['badlands'] };
  const file = writeProbeReceipt(options, { ok: false, maps: { badlands: { failed: 'never reached the water' } } });
  assert.equal(file, receiptPath(options.out, 'x-probe', 'b')); assert.ok(existsSync(file), 'out is created');
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(receipt.tool, 'x-probe'); assert.equal(receipt.tag, 'b'); assert.equal(receipt.ok, false);
  assert.match(receipt.revision, /^[0-9a-f]{9}$/); assert.deepEqual(receipt.settleMs, MAP_PROBE_SETTLE_MS); assert.deepEqual(receipt.options, options);
  assert.equal(receipt.maps.badlands.failed, 'never reached the water'); assert.ok(!Number.isNaN(Date.parse(receipt.writtenAt)));
} finally { rmSync(out, { recursive: true, force: true }); }

// ------------------------------------------------------------------ every tool's CLI: --help and a bad flag end before any launch
const TOOLS = ['map-view-probe', 'terrain-layer-flag-probe', 'terrain-uniform-iso-probe', 'world-layer-isolation-probe', 'salvo-indicator-probe', 'water-drive-probe'];
for (const tool of TOOLS) {
  const source = readFileSync(path.join(ROOT, 'tools', `${tool}.mjs`), 'utf8');
  assert.match(source, /^\/\/ .*\brounds?\b[^\n]*\b(?:3[5-9]|4\d)\b/im, `${tool}: header names the round(s) it verified`);
  assert.match(source, /node tools\/[a-z-]+\.mjs --/, `${tool}: header shows a usage line`);
  assert.match(source, /from '\.\/map-probe-runtime\.mjs'/, `${tool}: built on the shared runtime`);
  assert.ok(!/puppeteer\.launch|createServer\(/.test(source), `${tool}: no private server or browser launch`);
  assert.match(source, /if \(isMainModule\(import\.meta\.url\)\) await runProbeCli\(/, `${tool}: main guard, importable without running`);
  const helpRun = spawnSync(process.execPath, [`tools/${tool}.mjs`, '--help'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.equal(helpRun.status, 0, `${tool} --help exits 0: ${helpRun.stderr}`);
  assert.match(helpRun.stdout, new RegExp(`^node tools/${tool}\\.mjs \\[flags\\]`), `${tool} --help usage`);
  for (const flag of ['--root=<value>', '--out=<value>', '--tag=<value>', '--help']) assert.ok(helpRun.stdout.includes(flag), `${tool} --help lists ${flag}`);
  const badRun = spawnSync(process.execPath, [`tools/${tool}.mjs`, '--maps=badlands', '--ids=x', '--not-a-flag=1'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.equal(badRun.status, 1, `${tool} bad flag exits 1`);
  assert.match(badRun.stderr, /Unknown argument/, `${tool} bad flag names the argument`);
  assert.ok(badRun.stderr.includes(`node tools/${tool}.mjs [flags]`), `${tool} bad flag prints usage`);
}
const runtime = readFileSync(path.join(ROOT, 'tools', 'map-probe-runtime.mjs'), 'utf8');
assert.match(runtime, /The probe mutex is the CALLER's business/, 'the mutex contract is documented in the runtime header');
assert.match(runtime, /probe\.lock/); assert.match(runtime, /never on 5197–5199/);
const metricsHelp = execFileSync(process.execPath, ['tools/map-metrics.mjs', '--help'], { cwd: ROOT, encoding: 'utf8' });
assert.match(metricsHelp, /skyline .*stripe .*boxes/s);

console.log(`map-probe-runtime.selftest: ${TOOLS.length} tools parse and --help without a network; ${MAP_VIEW_PROBE_VIEWS.length}-view table pinned (76914e10…); ground and hull-relative pose math exact; screen-right = (−fz, fx) against three.js lookAt (looking north, west is right); receipt fields recorded`);
