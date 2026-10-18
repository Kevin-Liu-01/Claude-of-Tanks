// destruction-slab-kinds.selftest.mjs — the stray-slab detector over every destructible kind of every map (destruction-
// slabs 227, 2026-10-17; the owner: "for building destruction, these weird ugly boxes/surfaces still randomly come up.
// fix"). Each map is built once and every kind on it (a builder under its damage kit) is struck on the battle's path,
// sections on, the fracture on, from the face its name picks of its four (the wider or narrower side, the near or the far:
// the critic's variant census struck a building from another face and found what the widest never showed; across the
// fleet every face is struck, and the round's census strikes every kind from all four — DESTRUCTION.md §19), on a short
// staging (28 rounds over 3 m bands up the drawn height, a 5 s settle, the late joiner's replays). The maps run in a pool of worker threads,
// each loading the world once for all its maps (no child process: the selftest cache reads this file's imports, not the
// whole tree). Every kind passes: no plate or wall standing past the walls of its height band, none floating, none
// untextured or degenerate, no run off the walls, no remnant taller than the building is drawn there, no fallen roof slab
// drawn off its body, nothing left hanging (destruction-hanging.mjs: a piece held in the intact building and held no more,
// or one touching nothing that stands — a chimney over a roof that fell, a mill's sails over its fallen body). Each roofed
// kind is also struck until its roof falls and judged standing roofless (the roof pass, `wide+roof`). A finding KNOWN names
// (its building, the mesh, the reason) is a judged exception; one that stops flagging leaves the list (the ratchet).
// (round 3, the critic: minutes in npm test, any world change ran it all again) Each kind's run carries a fingerprint — the
// structure as built (its spans, its anatomy, its enclosure), its face and staging, and the destruction code's hash (the
// closures of the stages, the fracture, the kits, the enclosure, the ruin, the sim's table and this detector) — and a
// fingerprint a clean run (no finding at all) passed before is not run again: a world change runs the kinds it changed, a
// change to the destruction code runs them all. Each map is still built (what a kind is comes from its build).
//   COT_SLAB_KINDS_WORKERS=<n> (default a third of the CPUs, at most 6); COT_SLAB_KINDS_MAPS=<map,...> (a subset);
//   COT_SLAB_KINDS_DUMP=<file> (write the runs' findings) and COT_SLAB_KINDS_FROM=<file> (judge a dump, no runs: KNOWN's edits);
//   COT_SELFTEST_CACHE=0 or --all: every kind runs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** The receipt's staging: the census's (60 rounds, 40 snapshots, four faces) cut to what a kind's phases need. */
const STAGING = Object.freeze({ perBuilder: 1, storeys: [0, 1, 2, 3], rounds: 28, settleS: 5, maxSnapshots: 12 });
/** The face a kind is struck from: one of four, by its name (FNV-1a). */
const FACES = Object.freeze(['wide', 'wide-back', 'narrow', 'narrow-back']);
function faceOf(builder, kit) {
  let h = 2166136261;
  for (const ch of `${builder}|${kit}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return FACES[h % FACES.length];
}

if (!isMainThread) {
  // a worker: maps one at a time until the queue runs dry, each report back slimmed to what the verdict reads
  const { runSlabCheck } = await import('./destruction-slab-check.mjs');
  const passed = new Set(workerData?.passed ?? []);
  const fingerprint = workerData?.salt ? { salt: workerData.salt, cached: (fp) => passed.has(fp) } : null;
  parentPort.on('message', async (mapId) => {
    if (mapId === null) { parentPort.close(); return; }
    try {
      // (round 3, the engineering critic: the roof furniture a roof's fall left in the sky passed every receipt) each roofed
      // kind's roof pass too: struck until its roof falls, judged standing roofless at the end of the settle
      const report = await runSlabCheck({ mapId, ...STAGING, facesFor: (_id, builder, kit) => [faceOf(builder, kit), 'wide+roof'], fingerprint });
      parentPort.postMessage({ mapId, rows: report.rows.map((r) => ({ id: r.id, face: r.face, builder: r.builder, kit: r.kit, pass: r.pass,
        fingerprint: r.fingerprint ?? null, cached: !!r.cached,
        spanIssues: r.spanIssues, snapshots: r.snapshots.length,
        findings: r.snapshots.flatMap((p) => p.findings.map((f) => ({ t: p.t, phase: p.phase, mesh: f.mesh, orientation: f.orientation,
          extentsM: f.extentsM, reasons: f.reasons }))) })) });
    } catch (e) {
      parentPort.postMessage({ mapId, error: String(e?.stack ?? e).slice(0, 1200) });
    }
  });
  parentPort.postMessage({ ready: true });
} else {
  const { MAP_IDS } = await import('../src/world/maps/index.ts');

  /**
   * Judged exceptions, one finding each: [`map #id`, the mesh it is drawn in, the reason the detector gives, why it is
   * not a stray slab] (destruction-slabs 227 round 2, each looked at in the detector's renders). A finding passes only
   * when an entry names its building, its mesh and its reason; anything else the building shows still fails it.
   */
  const REMNANT = /^fx-structure-remnant-/, RUBBLE = /^fx-structure-rubble-/, RIM = /^fx-structure-rim-/, BAKED = /^fx-collapse-baked-/;
  const TALL = /^too tall/, OUTSIDE = /^outside/, OFF = /^off the walls/, FLOATING = /^floating/;
  const WORLD = /^world-/, FACE = /^fx-fracture-face-/, HEAP = /^fx-fracture-heap-/, ROOF = /^fx-collapse-roof-/, LANDMARK = /^fx-landmark-piece-/;
  const HANGING = /^hanging/, LOOSE = /^cut loose/, HEADS = /^on the wall heads/;
  const KNOWN = Object.freeze([
    // low remnants over the collapse heap, where the drawn wall there stands lower (the regional kits' ruin and remnant
    // walls over the sim's mound; the detector reads the intact top in a 1.5 m window): a metre or two, never a slab
    ['airfield #25', REMNANT, TALL, 'a timber remnant 1.2 m over the drawn wall, banked by the heap'],
    ['badlands #54', REMNANT, TALL, "the ruin's collapse stub over the banked heap in a gap of its drawn wall (1.8 m)"],
    ['blackglass #9', REMNANT, TALL, 'a remnant pier 1.2 m over the drawn wall head, on the heap'],
    ['blackglass #14', REMNANT, TALL, 'a remnant pier 1.1 m over the drawn wall head, on the heap'],
    ['caldera #34', REMNANT, TALL, "the stack's stump 1.3 m over the drawn top at its spot, its heap banked round it"],
    ['fjord #0', REMNANT, TALL, 'a remnant wall 1.4 m over the drawn wall, banked by the heap'],
    ['fjord #9', REMNANT, TALL, "the ruin's collapse stub over the banked heap (1.7 m: its drawn wall there is a stump)"],
    ['polders #13', REMNANT, TALL, "the ruin's collapse stub over the banked heap (1.2 m)"],
    ['titan_gorge #3', REMNANT, TALL, "the ruin's collapse stub over the banked heap (1.5 m)"],
    ['steppe #10', REMNANT, TALL, "the stack's steel stub 1.8 m over its drawn base"],
    ['whiteout #40', REMNANT, TALL, "the airstrip's steel stub (its 5 m grid reads a post where its edge is drawn low)"],
    ['whiteout #21', REMNANT, TALL, "the troposcatter hut's wall stub on the reflector's fallen frame (pre-existing, unchanged from main)"],
    // held storeys (DESTRUCTION.md §3.4): what stands with a storey the simulation holds over a destroyed one
    ['ruinspires #1', REMNANT, TALL, "a held upper storey's joist end at the megatower's top, 2.5 m proud"],
    ['skybridge #7', REMNANT, TALL, "a held upper storey's member end in the needle tower's open frame, 1.6 m proud"],
    // fallen objects lying on the ground: a face of the object, not a plate in the open
    ['longleaf #16', RUBBLE, OUTSIDE, "the fire lookout's cab on its side at the fallen frame's end (its floor stands on edge)"],
    ['orchard #4', RUBBLE, OUTSIDE, "the bell tower's fallen drum beyond the walls (its broken end)"],
    // a collapse's rest on what holds it, rims at holes in open walls
    ['ruinspires #7', BAKED, FLOATING, "the collapse's baked rest lying on the heap's records, 1.9 m up"],
    ['skybridge #7', RIM, OFF, "breach rims in the needle tower's open steel frame, past its thin members"],
    // round 3 (the hanging judge reads any drawn piece: held then not, cut loose; and each roofed kind's roof pass)
    ['copper_mesa #38', WORLD, HANGING, "the sheave's bearing stands on the deck once the hit takes its wheel: bolted at their feet, their diagonal legs' envelope reads 50 %"],
    ['foundry #4', REMNANT, HANGING, "the hose tower's bent legs rising inside its lattice from their buckles, read as members of their own (14-33 % held)"],
    ['delta #12', REMNANT, HANGING, "a 1 m steel remnant 1.1 m up on the late joiner's ruin, held at one end (50 %)"],
    ['whiteout #21', REMNANT, LOOSE, "the troposcatter hut's wall stub chunks lying on the reflector's fallen frame (pre-existing, unchanged from main)"],
    ['ruinspires #1', REMNANT, LOOSE, "a joist end 61 m up in the megatower's held upper storeys (DESTRUCTION.md §3.4)"],
    ['skybridge #13', HEAP, OUTSIDE, "a fracture heap piece on its edge at the ground beside the fallen water tower (round 2's open item: panels on edge beside ruins)"],
    ['badlands #0', ROOF, HEADS, "pre-existing: a roof slab the rigid world launched 200 m up in the roof pass (round 2's collapseBodies does the same) — open"],
    ['airfield #8', LANDMARK, FLOATING, "a dropped piece 47 m up in a late joiner's page (a launched body) — open"],
    ['airfield #12', FACE, LOOSE, "a fracture face's piece 1.5 m up at the roof pass's standing end the sweep reads touching (its samples within 0.2 m) — open"],
    ['polders #46', WORLD, LOOSE, "a late joiner's page after the first hit: the windmill's cap read touching nothing (19 parts, 19 m up) — open"],
    ['reservoir #1', ROOF, HEADS, "a roof slab 3.4 m up across the depot's wall heads in the roof pass (23 % past the walls) — open"],
    ['winter #11', ROOF, HEADS, "a roof slab 2.0 m up across the warehouse's wall heads in the roof pass — open"],
    ['ruinspires #3', RIM, LOOSE, "an arcology's breach rim 1.8 m up left by a hole beside it — open"],
    ['skybridge #20', WORLD, LOOSE, "the terrace tower's thin steel members 3 m up the roof pass leaves after its sections fell — open"],
  ]);

  // the destruction code's hash (each entry's import closure, as the selftest cache reads it) and the passed fingerprints
  const { createSelftestCache, REPO_ROOT } = await import('./selftest-cache.mjs');
  const { resolveSelftestCacheDir } = await import('./selftest-cache-dir.mjs');
  const useCache = process.env.COT_SELFTEST_CACHE !== '0' && !process.argv.includes('--all') && !process.env.COT_SLAB_KINDS_FROM;
  const CODE = ['src/fx/structureStages.ts', 'src/fx/fractureStages.ts', 'src/fx/structureDebris.ts', 'src/fx/rubbleBodies.ts', 'src/fx/structureMask.ts',
    'src/sim/structureDamage.ts', 'src/sim/matchRuleset.ts', 'src/game/studioDestruction.ts', 'src/world/structureDamageSeam.ts',
    'src/world/destructionKit.ts', 'src/world/destructionDefaultKit.ts', 'src/world/maps/regional/damage.ts', 'src/world/landmarks/damage.ts',
    'src/world/collapseRuin.ts', 'src/world/structureEnclosure.ts', 'tools/destruction-hanging.mjs', 'tools/destruction-slab-check.mjs'];
  let salt = null, storePath = null, passedStore = { v: 1, fingerprints: [] };
  if (useCache) {
    const cache = createSelftestCache({ root: REPO_ROOT, env: { ...process.env, COT_SELFTEST_CACHE: '1' } });
    const h = createHash('sha1');
    for (const f of CODE) {
      // (the detector and this file by their own bytes: their dynamic imports of the world build are the fingerprint's)
      if (f.startsWith('tools/destruction-slab')) h.update(`${f}:${readFileSync(path.join(REPO_ROOT, f))}\n`);
      else h.update(`${f}:${cache.inputKey(f).key}\n`);
    }
    h.update(JSON.stringify(STAGING));
    salt = h.digest('hex');
    const dir = resolveSelftestCacheDir(REPO_ROOT, process.env).dir;
    storePath = path.join(dir, 'destruction-slab-kinds.json');
    try { passedStore = JSON.parse(readFileSync(storePath, 'utf8')); } catch { /* none yet */ }
    if (passedStore?.v !== 1 || !Array.isArray(passedStore.fingerprints)) passedStore = { v: 1, fingerprints: [] };
  }
  const maps = process.env.COT_SLAB_KINDS_MAPS ? process.env.COT_SLAB_KINDS_MAPS.split(',') : [...MAP_IDS];
  const workers = Math.max(1, Number(process.env.COT_SLAB_KINDS_WORKERS ?? Math.min(6, Math.max(1, Math.floor(os.availableParallelism() / 3)))));
  const queue = process.env.COT_SLAB_KINDS_FROM ? [] : [...maps];
  const results = process.env.COT_SLAB_KINDS_FROM ? JSON.parse(readFileSync(process.env.COT_SLAB_KINDS_FROM, 'utf8')).filter((r) => maps.includes(r.mapId)) : [];
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, () => new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 4096 },
      workerData: { salt, passed: passedStore.fingerprints } });
    let current = null, timer = null;
    const feed = () => {
      clearTimeout(timer);
      current = queue.shift() ?? null;
      if (current === null) { worker.postMessage(null); return; }
      // (a map that hangs is reported, not waited on: its worker goes and the rest finish)
      timer = setTimeout(() => { results.push({ mapId: current, error: 'timed out (25 min)' }); current = null; worker.terminate(); }, 25 * 60 * 1000);
      worker.postMessage(current);
    };
    worker.on('message', (m) => {
      if (m.ready) { feed(); return; }
      results.push(m);
      feed();
    });
    worker.on('error', (e) => { if (current) results.push({ mapId: current, error: String(e?.stack ?? e).slice(0, 1200) }); });
    worker.on('exit', () => { clearTimeout(timer); resolve(); });
  })));

  if (process.env.COT_SLAB_KINDS_DUMP) writeFileSync(process.env.COT_SLAB_KINDS_DUMP, JSON.stringify(results));
  // the fingerprints of the clean runs (no finding at all, no span issue) join the store
  if (storePath) {
    const all = new Set(passedStore.fingerprints);
    for (const r of results) for (const row of r.rows ?? []) if (row.fingerprint && !row.cached && !row.findings.length && !row.spanIssues.length) all.add(row.fingerprint);
    try { mkdirSync(path.dirname(storePath), { recursive: true }); writeFileSync(storePath, JSON.stringify({ v: 1, fingerprints: [...all].slice(-20000) })); } catch { /* a store that cannot be written runs them next time */ }
  }
  let runs = 0, snaps = 0, cachedRuns = 0;
  const kinds = new Set(), flagged = [], used = new Set();
  const excused = (key, f) => {
    const why = KNOWN.findIndex(([at, mesh, reason]) => at === key && mesh.test(f.mesh) && f.reasons.some((r) => reason.test(r)));
    if (why >= 0) used.add(why);
    return why >= 0;
  };
  for (const r of results.sort((a, b) => a.mapId.localeCompare(b.mapId))) {
    assert.ok(!r.error, `${r.mapId}: the detector reported: ${r.error}`);
    for (const row of r.rows) {
      runs++;
      if (row.cached) cachedRuns++;
      kinds.add(`${r.mapId} ${row.builder}|${row.kit}`);
      snaps += row.snapshots;
      const key = `${r.mapId} #${row.id}`;
      const open = row.findings.filter((f) => !excused(key, f));
      if (!open.length && !row.spanIssues.length) continue;
      const worst = open.sort((p, q) => (q.extentsM[0] * q.extentsM[1]) - (p.extentsM[0] * p.extentsM[1]))[0];
      flagged.push(`${key} ${row.builder}/${row.kit} [${row.face}]: ${open.length} findings; worst ${worst?.mesh} ${worst?.orientation} `
        + `${worst?.extentsM?.join(' x ')} m [${worst?.phase}, t ${worst?.t} s]: ${worst?.reasons?.join('; ')}`
        + `${row.spanIssues.length ? `; spans: ${row.spanIssues.join('; ')}` : ''}`);
    }
  }
  assert.deepEqual(flagged, [], `every destructible kind passes the stray-slab check:\n${flagged.join('\n')}`);
  const stale = KNOWN.filter(([at], i) => maps.includes(at.split(' ')[0]) && !used.has(i)).map(([at, mesh, reason]) => `${at} ${mesh} ${reason}`);
  assert.deepEqual(stale, [], `known exceptions that no longer flag leave KNOWN: ${stale.join(', ')}`);
  console.log(`destruction-slab-kinds selftest: ${kinds.size} kinds on ${results.length} maps (${runs} runs, a face each by name; ${cachedRuns} passed before at the same fingerprint), ${snaps} snapshots, `
    + `none flags a stray slab${used.size ? ` (${used.size} judged exceptions)` : ''} — ok`);
}
