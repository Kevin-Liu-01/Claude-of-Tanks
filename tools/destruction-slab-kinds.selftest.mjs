// destruction-slab-kinds.selftest.mjs — the stray-slab detector over every destructible kind of every map (destruction-
// slabs 227, 2026-10-17; the owner: "for building destruction, these weird ugly boxes/surfaces still randomly come up.
// fix"). Each map is built once and every kind on it (a builder under its damage kit) is struck on the battle's path,
// sections on, the fracture on, from two faces: its widest (the census's) and one more the kind's name picks (the critic's
// variant census: a building struck from another face flagged what the widest never showed), on a short staging (32 rounds
// over 3 m bands up the drawn height, a 6 s settle, the late joiner's replays). The maps run in a pool of worker threads,
// each loading the world once for all its maps (no child process: the selftest cache reads this file's imports, not the
// whole tree). Every kind passes: no plate or wall standing past the walls of its height band, none floating, none
// untextured or degenerate, no run off the walls, no remnant taller than the building is drawn there, no fallen roof slab
// drawn off its body. A finding KNOWN names (its building, the mesh, the reason) is a judged exception; one that stops
// flagging leaves the list (the ratchet).
//   COT_SLAB_KINDS_WORKERS=<n> (default a third of the CPUs, at most 6); COT_SLAB_KINDS_MAPS=<map,...> (a subset)
import assert from 'node:assert/strict';
import os from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

/** The receipt's staging: the census's (60 rounds, 40 snapshots) cut to what a kind's phases need. */
const STAGING = Object.freeze({ perBuilder: 1, storeys: [0, 1, 2, 3], rounds: 32, settleS: 6, maxSnapshots: 14 });
/** The second face a kind is struck from: one of the other three, by its name. */
const OTHER_FACES = Object.freeze(['wide-back', 'narrow', 'narrow-back']);
function secondFace(builder, kit) {
  let h = 2166136261;
  for (const ch of `${builder}|${kit}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return OTHER_FACES[h % OTHER_FACES.length];
}

if (!isMainThread) {
  // a worker: maps one at a time until the queue runs dry, each report back slimmed to what the verdict reads
  const { runSlabCheck } = await import('./destruction-slab-check.mjs');
  parentPort.on('message', async (mapId) => {
    if (mapId === null) { parentPort.close(); return; }
    try {
      const report = await runSlabCheck({ mapId, ...STAGING, facesFor: (_id, builder, kit) => ['wide', secondFace(builder, kit)] });
      parentPort.postMessage({ mapId, rows: report.rows.map((r) => ({ id: r.id, face: r.face, builder: r.builder, kit: r.kit, pass: r.pass,
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
  const KNOWN = Object.freeze([
    // (filled from the round's census: see docs/DESTRUCTION.md §19)
  ]);

  const maps = process.env.COT_SLAB_KINDS_MAPS ? process.env.COT_SLAB_KINDS_MAPS.split(',') : [...MAP_IDS];
  const workers = Math.max(1, Number(process.env.COT_SLAB_KINDS_WORKERS ?? Math.min(6, Math.max(1, Math.floor(os.availableParallelism() / 3)))));
  const queue = [...maps];
  const results = [];
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, () => new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 4096 } });
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

  let runs = 0, snaps = 0;
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
  console.log(`destruction-slab-kinds selftest: ${kinds.size} kinds on ${results.length} maps (${runs} runs, two faces each), ${snaps} snapshots, `
    + `none flags a stray slab${used.size ? ` (${used.size} judged exceptions)` : ''} — ok`);
}
