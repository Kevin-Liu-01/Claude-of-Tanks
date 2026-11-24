// gen-interior-fills frees each build's native canvases before the next id (fills-leak-276, 2026-11-24).
// First-party tooling: Kevin B. Liu.
//
// The 276 regen's `gen-interior-fills --all` grew ~4 GB/min to 31 GB resident over 313 ids while its V8 heap stayed
// flat: every build paints 10-16 napi-rs canvases (~60-80 MB of native pixels), a canvas's pixels are freed only by the
// addon's N-API finalizer, Node runs those finalizers in a later macrotask, and the per-id loop never left its turn.
// build-loop-yield.mjs betweenBuilds() is the yield the loop now awaits after tank.dispose().
//
// This runs the real generator (release flags, --stats: writes nothing) on a few ids with a probe preloaded that forces
// a GC at each id's result line and counts the canvases of earlier builds whose FinalizationRegistry callback has run.
// Those callbacks, like the N-API finalizers, run only when the event loop turns: the leaking loop reports 0 of 39 at
// its last id, the yielding one 36 of 39. The resident set is reported, not bounded: over five ids it is still the
// first builds' warm-up (module caches, the JIT); the flat peak is the --all run's receipt (2.74 GiB over 313 ids,
// 1.75 MB an id fitted, against 31 GB and ~124 MB an id before).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const collect = pathToFileURL(fileURLToPath(new URL('./tank-surface-collect.mjs', import.meta.url))).href;
// Five ids from five builder families, each 0.8-1.5 s and painting canvases.
const IDS = ['marksman_t55', 'm41a3', 'm6_linebacker', 't80u', 'type89'];

const probe = `
await import(${JSON.stringify(collect)});
const doc = globalThis.document, create = doc.createElement.bind(doc);
let made = 0, finalized = 0;
const registry = new FinalizationRegistry(() => { finalized++; });
doc.createElement = (tag) => { const el = create(tag); if (String(tag).toLowerCase() === 'canvas') { made++; registry.register(el, 0); } return el; };
const log = console.log.bind(console);
console.log = (...a) => {
  log(...a);
  const hit = /^([\\w-]+): leak /.exec(String(a[0] ?? ''));
  if (hit) { globalThis.gc(); log('@@mem ' + JSON.stringify({ id: hit[1], rss: process.memoryUsage().rss, made, finalized })); }
};`;

const run = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=4096',
  '--import', `data:text/javascript,${encodeURIComponent(probe)}`,
  'tools/gen-interior-fills.mjs', '--voxel=0.025', '--cell=2', '--rounds=8', '--min-fine=1', '--stats', `--ids=${IDS.join(',')}`],
{ cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
assert.equal(run.status, 0, `generator failed:\n${run.stdout}\n${run.stderr}`);
const lines = run.stdout.split('\n').filter((l) => l.startsWith('@@mem ')).map((l) => JSON.parse(l.slice(6)));
assert.equal(lines.length, IDS.length, `one probe line per id:\n${run.stdout}`);
const last = lines.at(-1), mb = (b) => b / 1048576;
const builds = lines.map((l, i) => l.made - (i ? lines[i - 1].made : 0));
assert.ok(builds.every((n) => n > 0), `every probe id paints canvases (${builds.join(', ')}): pick ids that do`);

// By the last id, the builds two and more ids back have released their canvases (the previous build's are still
// referenced until the GC after its dispose, so they are not counted). A few canvases are shared module caches that
// outlive every build (3 of 39 on these ids when written), so most, not all, are owed; the leaking loop frees none.
const owed = lines.at(-3).made;
assert.ok(last.finalized >= 0.75 * owed,
  `canvases of finished builds are still alive at the last id: ${last.finalized} finalized of ${owed} owed (made ${last.made}); `
  + 'the per-id loop must yield (betweenBuilds) after tank.dispose()');

const slope = (mb(last.rss) - mb(lines[1].rss)) / (lines.length - 2);
console.log(`gen-interior-fills memory: ${last.finalized}/${last.made} canvases finalized by the last of ${IDS.length} ids, `
  + `resident ${mb(lines[1].rss).toFixed(0)} -> ${mb(last.rss).toFixed(0)} MB (${slope.toFixed(1)} MB an id) PASS`);
