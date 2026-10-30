// destruction-slab-kinds.selftest.mjs — the stray-slab detector over every destructible kind of every map (destruction-
// slabs 227, 2026-10-17; the owner: "for building destruction, these weird ugly boxes/surfaces still randomly come up.
// fix"). Each map is built and every kind on it (a builder under its damage kit) is struck on the battle's path,
// sections on, the fracture on, from the face its name picks of its four (the wider or narrower side, the near or the far:
// the critic's variant census struck a building from another face and found what the widest never showed; across the
// fleet every face is struck, and the round's census strikes every kind from all four — DESTRUCTION.md §19), on a short
// staging (28 rounds over 3 m bands up the drawn height, a 5 s settle, the late joiner's replays). The work runs in a pool of
// worker threads (no child process: the selftest cache reads this file's imports, not the whole tree). Every kind passes:
// no plate or wall standing past the walls of its height band, none floating, none
// untextured or degenerate, no run off the walls, no remnant taller than the building is drawn there, no fallen roof slab
// drawn off its body, nothing left hanging (destruction-hanging.mjs: a piece held in the intact building and held no more,
// or one touching nothing that stands — a chimney over a roof that fell, a mill's sails over its fallen body). Each roofed
// kind is also struck until its roof falls and judged standing roofless (the roof pass, `wide+roof`). A finding KNOWN names
// (its building, the mesh, the reason) is a judged exception; one that stops flagging leaves the list (the ratchet).
// (round 3, the critic: minutes in npm test, any world change ran it all again) Each kind's run carries a fingerprint — the
// structure as built (its spans, its anatomy, its enclosure), its face and staging, and the destruction code's hash (the
// closures of the stages, the fracture, the kits, the enclosure, the ruin, the sim's table and this detector) — and a
// fingerprint a clean run (no finding at all) passed before is not run again: a world change runs the kinds it changed, a
// change to the destruction code runs them all.
// (destruction-slab-kinds-perf 265, 2026-10-30: Ruinspires past the suite's 25-min map limit, over 45 min alone, 3.3 GB)
// The pool's work is builds and runs, not maps. A worker builds a map and lists its runs with their fingerprints, then takes
// that map's runs one at a time; a worker with no map left to build builds the map with the most work left and takes its
// runs too, so no map is the long pole. Each run stands every record and span back up as built (it reads nothing an earlier
// one left: the fingerprint cache already skips any of them), and its fingerprint as it starts must be its listing's. Maps
// go heaviest first and a map's runs costliest first, by the CPU each took last time. A run whose findings were all judged
// exceptions keeps them with its fingerprint: the same fingerprint gives the same findings, judged again against KNOWN (the
// ratchet reads them; it ran every time before). A map listed from the same inputs (the detector's whole import closure:
// the world's build, the kits, the wreck builders, the props model pack, the destruction code; this file; the staging) with
// every run passed at its fingerprint is not built. Guards: a build or run past its CPU or wall limit is stopped and named;
// the receipt fails past its CPU budget; and whenever a map is built, a control run — a stray slab planted in one of its
// buildings — must fail the verdict.
//   COT_SLAB_KINDS_WORKERS=<n> (default a third of the CPUs, at most 6); COT_SLAB_KINDS_MAPS=<map,...> (a subset);
//   COT_SLAB_KINDS_RUN_CPU_S=<s> (a build's or run's CPU limit, default 240); COT_SLAB_KINDS_JOB_MIN=<min> (its wall limit,
//   default 30; the old COT_SLAB_KINDS_MAP_MIN is read as it); COT_SLAB_KINDS_CPU_MIN=<min> (the receipt's CPU budget,
//   default 90: the whole detector over every kind, uncached);
//   COT_SLAB_KINDS_DUMP=<file> (write the runs' findings) and COT_SLAB_KINDS_FROM=<file> (judge a dump, no runs: KNOWN's edits);
//   COT_SELFTEST_CACHE=0 or --all: every kind runs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
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
/** A run's row as the verdict reads it (what a worker sends back). */
const slim = (r) => ({ id: r.id, face: r.face, builder: r.builder, kit: r.kit, pass: r.pass,
  fingerprint: r.fingerprint ?? null, cached: !!r.cached,
  spanIssues: r.spanIssues, snapshots: r.snapshots.length,
  findings: r.snapshots.flatMap((p) => p.findings.map((f) => ({ t: p.t, phase: p.phase, mesh: f.mesh, orientation: f.orientation,
    extentsM: f.extentsM, reasons: f.reasons }))) });

if (!isMainThread) {
  // a worker: a map's build and its listing, then runs of the map it holds, each report back slimmed to what the verdict reads
  const { createSlabCheck } = await import('./destruction-slab-check.mjs');
  const passed = new Set(workerData?.passed ?? []);
  const fingerprint = workerData?.salt ? { salt: workerData.salt, cached: (fp) => passed.has(fp) } : null;
  const cpuMs = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
  let check = null;
  parentPort.on('message', async (m) => {
    if (m === null) { parentPort.close(); return; }
    const c0 = cpuMs();
    try {
      if (m.build) {
        check = null;
        // (round 3, the engineering critic: the roof furniture a roof's fall left in the sky passed every receipt) each roofed
        // kind's roof pass too: struck until its roof falls, judged standing roofless at the end of the settle
        check = await createSlabCheck({ mapId: m.build, ...STAGING, facesFor: (_id, builder, kit) => [faceOf(builder, kit), 'wide+roof'], fingerprint });
        const runs = check.runs.map(([id, face]) => check.runOne(id, face, { list: true })).map((r) => r && slim(r));
        parentPort.postMessage({ mapId: m.build, runs, cpuMs: cpuMs() - c0, cpuNow: cpuMs() });
      } else {
        const [id, face] = check.runs[m.run];
        const row = check.runOne(id, face, { plant: !!m.plant });
        if (!m.plant && row?.fingerprint !== m.fingerprint) {
          throw new Error(`#${id} ${face}: its fingerprint moved from its listing's (${m.fingerprint} -> ${row?.fingerprint}): a run read what another left`);
        }
        parentPort.postMessage({ mapId: m.mapId, run: m.run, plant: !!m.plant, row: row && slim(row), cpuMs: cpuMs() - c0, cpuNow: cpuMs() });
      }
    } catch (e) {
      parentPort.postMessage({ mapId: m.build ?? m.mapId, run: m.run, plant: !!m.plant, error: String(e?.stack ?? e).slice(0, 1200),
        cpuMs: cpuMs() - c0, cpuNow: cpuMs() });
    }
  });
  parentPort.postMessage({ ready: true, cpuNow: cpuMs() });
} else {
  const t0 = performance.now();
  const { MAP_IDS } = await import('../src/world/maps/index.ts');

  /**
   * Judged exceptions, one finding each: [`map #id`, the mesh it is drawn in, the reason the detector gives, the largest
   * extent judged (m), why it is not a stray slab] (destruction-slabs 227 round 2, each looked at in the detector's renders;
   * the bound since round 4). A finding passes only when an entry names its building, its mesh and its reason and it is no
   * bigger than the one judged; anything else the building shows still fails it.
   */
  const REMNANT = /^fx-structure-remnant-/, RUBBLE = /^fx-structure-rubble-/, RIM = /^fx-structure-rim-/, BAKED = /^fx-collapse-baked-/;
  const TALL = /^too tall/, OUTSIDE = /^outside/, OFF = /^off the walls/, FLOATING = /^floating/;
  const WORLD = /^world-/, FACE = /^fx-fracture-face-/, HEAP = /^fx-fracture-heap-/, ROOF = /^fx-collapse-roof-/, LANDMARK = /^fx-landmark-piece-/;
  const HANGING = /^hanging/, LOOSE = /^cut loose/, HEADS = /^on the wall heads/, ON_END = /^on end/;
  // (2026-10-28, the world-reds lane: two entries left — the Glen Canyon switchyard is a yard open to the sky, no roof pass;
  // a guyed mast's guys anchored on a drift's slope go slack with it, landmarks/damage.ts ANCHORED_M)
  const KNOWN = Object.freeze([
    // held storeys (DESTRUCTION.md §3.4): what stands with a storey the simulation holds over a destroyed one
    ['ruinspires #1', REMNANT, TALL, 15.0, "a held upper storey's joist end at the megatower's top, 2.5 m proud"],
    // round 3 (the hanging judge reads any drawn piece: held then not, cut loose; and each roofed kind's roof pass); round 4
    // left the 29 other judged findings of rounds 1-3 flagging no more (the upright plates laid, remnants cut to the drawn
    // form, fallen objects' faces read as their sides, the launched slabs and the perched roof bodies gone)
    ['ruinspires #3', RIM, LOOSE, 2.2, "an arcology's breach rim 1.8 m up left by a hole beside it — open"],
    // round 4 (the on-end rule, the remnant cut and a fresh full run on d139fe6ee2): what the round leaves, named
    ['airfield #12', REMNANT, TALL, 3.8, "a ruin post's upper length on the hall's plan edge, 2.7 m over the ground where the slab check reads nothing drawn within 0.75 m (the enclosure reads the wall there) — open"],
    ['delta #11', REMNANT, HANGING, 1.2, "a 1 m steel remnant 1.1 m up held at one end in a late joiner's destroyed set (as delta #12) — open"],
    ['delta #31', REMNANT, TALL, 10.0, "the temple's roof beam 9 m up, wholly over the drawn height at its top's spot (a held member: not cut) — open"],
    ['foundry #0', REMNANT, OUTSIDE, 8.1, "the factory's steel remnant wall at the ground, 12 % of it past the intact plan on the downhill side (1.5 m under the ground there)"],
    ['foundry #0', REMNANT, TALL, 5.7, "the same steel remnant wall's edge 2.9 m over the ground at the plan's edge where the slab check reads nothing drawn (its foot on the downhill side) — open"],
    ['moon #11', WORLD, HANGING, 3.9, "the lunar mill's vane plates 17-19 m up in a late joiner's page at its collapse (live, none: the page's sweep leaves them) — open"],
    ['steppe #8', REMNANT, TALL, 1.9, "a container row's baked remnant 1 m tall, 1.2 m over the ground where nothing is drawn — open"],
  ]);
  const knownIndex = (key, f) => KNOWN.findIndex(([at, mesh, reason, maxM]) => at === key && mesh.test(f.mesh) && f.reasons.some((r) => reason.test(r))
    && Math.max(...(f.extentsM ?? [Infinity])) <= maxM);

  // the destruction code's hash (each entry's import closure, as the selftest cache reads it) and the passed fingerprints
  const { createSelftestCache, REPO_ROOT } = await import('./selftest-cache.mjs');
  const { resolveSelftestCacheDir } = await import('./selftest-cache-dir.mjs');
  const useCache = process.env.COT_SELFTEST_CACHE !== '0' && !process.argv.includes('--all') && !process.env.COT_SLAB_KINDS_FROM;
  const CODE = ['src/fx/structureStages.ts', 'src/fx/fractureStages.ts', 'src/fx/structureDebris.ts', 'src/fx/rubbleBodies.ts', 'src/fx/structureMask.ts',
    'src/sim/structureDamage.ts', 'src/sim/matchRuleset.ts', 'src/game/studioDestruction.ts', 'src/world/structureDamageSeam.ts',
    'src/world/destructionKit.ts', 'src/world/destructionDefaultKit.ts', 'src/world/maps/regional/damage.ts', 'src/world/landmarks/damage.ts',
    'src/world/collapseRuin.ts', 'src/world/structureEnclosure.ts', 'tools/destruction-hanging.mjs', 'tools/destruction-slab-check.mjs'];
  let salt = null, storePath = null, listingKey = null;
  const emptyStore = () => ({ v: 1, fingerprints: [], judged: {}, listings: {}, costs: {}, builds: {} });
  const readStore = () => {
    let s = null;
    try { s = JSON.parse(readFileSync(storePath, 'utf8')); } catch { /* none yet */ }
    if (s?.v !== 1 || !Array.isArray(s.fingerprints)) return emptyStore();
    // (a store an older receipt wrote has its passed fingerprints alone)
    return { ...emptyStore(), ...s };
  };
  let store = emptyStore();
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
    // (perf 265) what a map lists — its runs and their fingerprints — follows from the detector's whole import closure (the
    // world's build, the kits, the wreck builders, the props model pack, the destruction code), this file and the staging
    listingKey = createHash('sha1').update(`${salt}|${cache.inputKey('tools/destruction-slab-check.mjs').key}|`)
      .update(readFileSync(new URL(import.meta.url))).update(JSON.stringify(STAGING)).digest('hex');
    const dir = resolveSelftestCacheDir(REPO_ROOT, process.env).dir;
    storePath = path.join(dir, 'destruction-slab-kinds.json');
    store = readStore();
  }
  const passed = new Set(store.fingerprints);
  const maps = process.env.COT_SLAB_KINDS_MAPS ? process.env.COT_SLAB_KINDS_MAPS.split(',') : [...MAP_IDS];
  const workers = Math.max(1, Number(process.env.COT_SLAB_KINDS_WORKERS ?? Math.min(6, Math.max(1, Math.floor(os.availableParallelism() / 3)))));
  // the guards: a build's or run's CPU and wall limits (a hang is stopped and named, the rest finish), the receipt's CPU budget
  const RUN_CPU_S = Math.max(10, Number(process.env.COT_SLAB_KINDS_RUN_CPU_S ?? 240));
  const JOB_MIN = Math.max(1, Number(process.env.COT_SLAB_KINDS_JOB_MIN ?? process.env.COT_SLAB_KINDS_MAP_MIN ?? 30));
  const CPU_MIN = Math.max(1, Number(process.env.COT_SLAB_KINDS_CPU_MIN ?? 90));
  const runKey = (mapId, r) => `${mapId} #${r.id} ${r.face}`;
  // (what a run or a build took last time, CPU ms; a run never timed counts as the costliest known, a map never built as first)
  const knownRunMs = Object.values(store.costs);
  const unknownRunMs = knownRunMs.length ? Math.max(...knownRunMs) : 30000;
  const runMs = (mapId, r) => store.costs[runKey(mapId, r)] ?? unknownRunMs;
  const buildMs = (mapId) => store.builds[mapId] ?? 30000;
  const fromRuns = (r) => r && ((r.fingerprint && passed.has(r.fingerprint)) ? { ...r, pass: true, cached: true }
    : (r.fingerprint && store.judged[r.fingerprint]) ? { ...r, pass: false, cached: true, spanIssues: [], ...store.judged[r.fingerprint] } : null);

  const results = process.env.COT_SLAB_KINDS_FROM ? JSON.parse(readFileSync(process.env.COT_SLAB_KINDS_FROM, 'utf8')).filter((r) => maps.includes(r.mapId)) : [];
  /** Each map to build: its listing once made, the runs not yet handed out (costliest first), its rows by run, its errors. */
  const state = new Map();
  const toBuild = [];
  if (!process.env.COT_SLAB_KINDS_FROM) {
    for (const mapId of maps) {
      const l = listingKey ? store.listings[mapId] : null;
      if (l?.key === listingKey && l.runs.every((r) => !r || fromRuns(r))) {
        results.push({ mapId, rows: l.runs.filter(Boolean).map((r) => fromRuns(r)), built: false });
        continue;
      }
      state.set(mapId, { listing: null, pending: [], rows: [], errors: [], cpuMs: 0 });
      // heaviest first: its build and its runs not passed, by last time (a map never listed first: it may be the heaviest)
      const left = l ? l.runs.reduce((n, r) => n + (r && !fromRuns(r) ? runMs(mapId, r) : 0), 0) : Infinity;
      toBuild.push({ mapId, ms: buildMs(mapId) + left });
    }
    toBuild.sort((a, b) => b.ms - a.ms);
  }

  // ---- the pool
  const slots = new Set();
  const idle = new Set();
  let builds = 0, steals = 0;
  let control = null;
  const longest = { run: null, ms: 0, build: null, buildMs: 0 };
  const workLeft = () => toBuild.length > 0 || [...state.values()].some((st) => st.pending.length > 0) || [...slots].some((s) => s.job);
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  const dispatch = (slot, job, message) => {
    slot.job = { ...job, t0: performance.now(), cpu0: slot.cpuNow };
    slot.worker.postMessage(message);
  };
  const next = (slot) => {
    if (slot.job || slot.gone) return;
    idle.delete(slot);
    const own = slot.map ? state.get(slot.map) : null;
    if (own?.listing && own.pending.length) {
      const e = own.pending.shift();
      const r = own.listing[e.run];
      dispatch(slot, { kind: 'run', mapId: slot.map, run: e.run, plant: !!e.plant }, { mapId: slot.map, run: e.run, plant: !!e.plant, fingerprint: r.fingerprint });
      return;
    }
    if (toBuild.length) {
      const { mapId } = toBuild.shift();
      slot.map = null;
      dispatch(slot, { kind: 'build', mapId, first: true }, { build: mapId });
      return;
    }
    // a map with the most work left, built again here to share its runs (when that work is worth a build, or no live worker
    // holds the map any more)
    let best = null, bestMs = 0;
    for (const [mapId, st] of state) {
      if (!st.listing || !st.pending.length) continue;
      const held = [...slots].some((s) => !s.stopped && (s.map === mapId || (s.job?.kind === 'build' && s.job.mapId === mapId)));
      const left = st.pending.reduce((n, e) => n + runMs(mapId, st.listing[e.run]), 0);
      if (left > bestMs && (!held || (st.pending.length >= 2 && left >= 2 * buildMs(mapId)))) { best = mapId; bestMs = left; }
    }
    if (best) {
      steals++;
      slot.map = null;
      dispatch(slot, { kind: 'build', mapId: best, first: false }, { build: best });
      return;
    }
    idle.add(slot);
    if (!workLeft()) finish();
  };
  const wake = () => { for (const s of [...idle]) next(s); };
  const fail = (slot, text) => {
    const job = slot.job;
    const st = state.get(job.mapId);
    if (job.kind === 'build') st.errors.push(`build${job.first ? '' : ' (a second, to share its runs)'}: ${text}`);
    else if (job.plant) control = { ...control, error: text };
    else st.errors.push(`#${st.listing[job.run].id} ${st.listing[job.run].face}: ${text}`);
  };
  const onMessage = (slot, m) => {
    slot.cpuNow = m.cpuNow ?? slot.cpuNow;
    if (m.ready) { next(slot); return; }
    const job = slot.job;
    slot.job = null;
    const st = state.get(m.mapId);
    if (m.error) {
      fail({ job }, m.error);
      if (job.kind === 'build') slot.map = null;
    } else if (job.kind === 'build') {
      builds++;
      slot.map = m.mapId;
      st.cpuMs += m.cpuMs;
      store.builds[m.mapId] = Math.round(m.cpuMs);
      if (m.cpuMs > longest.buildMs) Object.assign(longest, { build: m.mapId, buildMs: m.cpuMs });
      if (!st.listing) {
        st.listing = m.runs;
        st.listing.forEach((r, i) => { const done = fromRuns(r); if (done) st.rows[i] = done; else if (r) st.pending.push({ run: i }); });
        st.pending.sort((a, b) => runMs(m.mapId, st.listing[b.run]) - runMs(m.mapId, st.listing[a.run]) || a.run - b.run);
        // the control: the first map built this time plants a stray slab in its cheapest run's building, judged as any run
        if (!control) {
          const pick = st.listing.map((r, i) => [r, i]).filter(([r]) => r).sort(([p, i], [q, j]) => runMs(m.mapId, p) - runMs(m.mapId, q) || i - j)[0];
          if (pick) { control = { mapId: m.mapId, run: pick[1], id: pick[0].id, face: pick[0].face }; st.pending.unshift({ run: pick[1], plant: true }); }
        }
      } else {
        // a second build of a map lists the same runs at the same fingerprints (the build is deterministic)
        const same = m.runs.length === st.listing.length && m.runs.every((r, i) => (r?.id ?? null) === (st.listing[i]?.id ?? null)
          && (r?.face ?? null) === (st.listing[i]?.face ?? null) && (r?.fingerprint ?? null) === (st.listing[i]?.fingerprint ?? null));
        if (!same) st.errors.push('a second build listed other runs or fingerprints than the first');
      }
    } else if (job.plant) {
      control = { ...control, row: m.row, cpuMs: m.cpuMs };
    } else {
      st.rows[m.run] = m.row;
      st.cpuMs += m.cpuMs;
      store.costs[runKey(m.mapId, m.row)] = Math.round(m.cpuMs);
      if (m.cpuMs > longest.ms) Object.assign(longest, { run: runKey(m.mapId, m.row), ms: m.cpuMs });
    }
    next(slot);
    wake();
  };
  const spawn = () => {
    const worker = new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 4096 },
      workerData: { salt, passed: store.fingerprints } });
    const slot = { worker, job: null, map: null, cpuNow: 0, gone: false };
    slots.add(slot);
    worker.on('message', (m) => onMessage(slot, m));
    worker.on('error', (e) => { if (slot.job) { fail(slot, String(e?.stack ?? e).slice(0, 1200)); slot.job = null; } });
    worker.on('exit', () => {
      slot.gone = true;
      slots.delete(slot);
      idle.delete(slot);
      if (slot.job) { fail(slot, 'its worker exited'); slot.job = null; }
      // (a worker the guard stopped is replaced while work is left; the others take what it held)
      if (slot.stopped && workLeft()) spawn();
      wake();
      if (!slots.size || !workLeft()) finish();
    });
    return slot;
  };
  // the guard: a build or run past its CPU limit (the worker thread's clock: a loaded machine is no excuse) or its wall limit
  const guard = setInterval(() => {
    for (const slot of slots) {
      const job = slot.job;
      if (!job || slot.stopped) continue;
      const stop = (why) => { fail(slot, why); slot.job = null; slot.stopped = true; slot.worker.terminate(); };
      if (performance.now() - job.t0 > JOB_MIN * 60000) { stop(`timed out (${JOB_MIN} min wall; COT_SLAB_KINDS_JOB_MIN)`); continue; }
      slot.worker.cpuUsage?.().then((u) => {
        const ms = (u.user + u.system) / 1000 - job.cpu0;
        if (slot.job === job && !slot.stopped && ms > RUN_CPU_S * 1000) stop(`over its CPU limit (${(ms / 1000).toFixed(0)} s; COT_SLAB_KINDS_RUN_CPU_S=${RUN_CPU_S})`);
      }, () => {});
    }
  }, 5000);
  if (toBuild.length) {
    // (every worker, though fewer maps are left to build: the rest share the heaviest maps' runs)
    for (let i = 0; i < workers; i++) spawn();
    await finished;
    for (const slot of slots) slot.worker.postMessage(null);
  }
  clearInterval(guard);

  for (const [mapId, st] of state) {
    const errors = [...st.errors];
    if (!st.listing && !errors.length) errors.push('never built');
    const missing = (st.listing ?? []).map((r, i) => (r && !st.rows[i] ? `#${r.id} ${r.face}` : null)).filter(Boolean);
    if (missing.length && !errors.length) errors.push(`runs never reported: ${missing.join(', ')}`);
    results.push({ mapId, rows: st.rows.filter(Boolean), built: true, ...(errors.length ? { error: errors.join('; ') } : {}) });
  }

  if (process.env.COT_SLAB_KINDS_DUMP) writeFileSync(process.env.COT_SLAB_KINDS_DUMP, JSON.stringify(results));
  let runs = 0, snaps = 0, cachedRuns = 0;
  const kinds = new Set(), flagged = [], used = new Set();
  const excused = (key, f) => {
    // (round 4, third pass; the round-3 critic: an entry matched on its building, mesh class and reason class, so any new
    // finding of that class there was hidden too) and no bigger than the finding judged (its largest extent, m)
    const why = knownIndex(key, f);
    if (why >= 0) used.add(why);
    return why >= 0;
  };
  const judgedRuns = new Set();
  for (const r of results.sort((a, b) => a.mapId.localeCompare(b.mapId))) {
    assert.ok(!r.error, `${r.mapId}: the detector reported: ${r.error}`);
    for (const row of r.rows) {
      runs++;
      if (row.cached) cachedRuns++;
      kinds.add(`${r.mapId} ${row.builder}|${row.kit}`);
      snaps += row.snapshots;
      const key = `${r.mapId} #${row.id}`;
      const open = row.findings.filter((f) => !excused(key, f));
      if (!open.length && !row.spanIssues.length) { if (row.findings.length && row.fingerprint && !row.cached) judgedRuns.add(row); continue; }
      const worst = open.sort((p, q) => (q.extentsM[0] * q.extentsM[1]) - (p.extentsM[0] * p.extentsM[1]))[0];
      flagged.push(`${key} ${row.builder}/${row.kit} [${row.face}]: ${open.length} findings; worst ${worst?.mesh} ${worst?.orientation} `
        + `${worst?.extentsM?.join(' x ')} m [${worst?.phase}, t ${worst?.t} s]: ${worst?.reasons?.join('; ')}`
        + `${row.spanIssues.length ? `; spans: ${row.spanIssues.join('; ')}` : ''}`);
    }
  }
  // the store: the fingerprints of the clean runs (no finding at all, no span issue), the findings of the runs whose every
  // finding is a judged exception, each map's listing and what each build and run took (merged into the store as it is now:
  // another checkout's receipt may have written it meanwhile)
  if (storePath) {
    const now = readStore();
    const all = new Set([...now.fingerprints, ...store.fingerprints]);
    for (const r of results) for (const row of r.rows ?? []) if (row.fingerprint && !row.cached && !row.findings.length && !row.spanIssues.length) all.add(row.fingerprint);
    const judged = { ...now.judged, ...store.judged };
    for (const row of judgedRuns) judged[row.fingerprint] = { findings: row.findings, snapshots: row.snapshots };
    const listings = { ...now.listings };
    for (const [mapId, st] of state) if (st.listing && !st.errors.length) listings[mapId] = { key: listingKey, runs: st.listing.map((r) => r && { id: r.id, face: r.face, builder: r.builder, kit: r.kit, fingerprint: r.fingerprint, spanIssues: [], snapshots: 0, findings: [] }) };
    const keep = (o, n) => Object.fromEntries(Object.entries(o).slice(-n));
    try {
      mkdirSync(path.dirname(storePath), { recursive: true });
      writeFileSync(storePath, JSON.stringify({ v: 1, fingerprints: [...all].slice(-20000), judged: keep(judged, 2000), listings,
        costs: { ...now.costs, ...store.costs }, builds: { ...now.builds, ...store.builds } }));
    } catch { /* a store that cannot be written runs them next time */ }
  }
  assert.deepEqual(flagged, [], `every destructible kind passes the stray-slab check:\n${flagged.join('\n')}`);
  const stale = KNOWN.filter(([at], i) => maps.includes(at.split(' ')[0]) && !used.has(i)).map(([at, mesh, reason, maxM]) => `${at} ${mesh} ${reason} (${maxM} m)`);
  assert.deepEqual(stale, [], `known exceptions that no longer flag leave KNOWN: ${stale.join(', ')}`);
  // (perf 265) the negative control: the planted slab fails the verdict (a detector or a pool that lost it would pass anything)
  if (control) {
    assert.ok(control.row, `the control run (a stray slab planted in ${control.mapId} #${control.id} ${control.face}) reported: ${control.error ?? 'nothing'}`);
    const planted = control.row.findings.filter((f) => /^fx-control-slab-/.test(f.mesh) && knownIndex(`${control.mapId} #${control.id}`, f) < 0);
    assert.ok(!control.row.pass && planted.length, `the control's planted slab (${control.mapId} #${control.id} ${control.face}) flagged nothing: the receipt misses a stray slab`);
  }
  const wallMin = (performance.now() - t0) / 60000;
  // (the process's clock: every worker thread and V8's own helpers)
  const cpuMin = (process.cpuUsage().user + process.cpuUsage().system) / 6e7;
  const rssGb = process.resourceUsage().maxRSS / 1048576;
  const built = results.filter((r) => r.built).length;
  console.log(`destruction-slab-kinds selftest: ${kinds.size} kinds on ${results.length} maps (${runs} runs, a face each by name; ${cachedRuns} passed before at the same fingerprint), ${snaps} snapshots, `
    + `none flags a stray slab${used.size ? ` (${used.size} judged exceptions)` : ''}${control ? `; the control's planted slab flagged (${control.mapId} #${control.id})` : ''} — ok`);
  console.log(`destruction-slab-kinds selftest: ${built} maps built (${builds} builds, ${steals} to share a map's runs; ${results.length - built} listed unchanged), `
    + `${wallMin.toFixed(1)} min wall, ${cpuMin.toFixed(1)} CPU min of ${CPU_MIN} (${workers} workers), peak RSS ${rssGb.toFixed(2)} GB; `
    + `longest run ${longest.run ?? '-'} ${(longest.ms / 1000).toFixed(0)} s CPU, longest build ${longest.build ?? '-'} ${(longest.buildMs / 1000).toFixed(0)} s CPU`);
  assert.ok(cpuMin <= CPU_MIN, `the receipt took ${cpuMin.toFixed(1)} CPU min, over its budget of ${CPU_MIN} (COT_SLAB_KINDS_CPU_MIN): a slower detector or more kinds — find the cost before raising it`);
}
