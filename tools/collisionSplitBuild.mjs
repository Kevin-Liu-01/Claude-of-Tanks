// The split Node build of tools/capture-world-collision-manifests.mjs (speed, 2026-10-13): asked with --jobs=N, a
// regeneration or a check of more than one map deals its maps round-robin into N shares (the drift receipt's split), and
// a child of the tool builds each share with the same arguments and `--maps <share>`. The parent prints every map's lines
// in map order and returns the verdict; the tool prints the check's summary or publishes the index from the children's
// entries.
//
// What a split gives up (2026-10-14, the coverage check's counterexamples): the serial build makes every map after every
// earlier map in one process, so it sees state one map's build leaves behind for a later one (a cache entry a builder
// mutates; a page that changes battlefields reads it). A split builds each map after its share's earlier maps only, and
// no split that is much faster than the serial build can build every map after all the maps before it. So the tool
// builds serially unless --jobs=N asks for a split (collisionBuildMode), a split check says so in its summary, and the
// landing check stays the serial `--check`.
//
// The child protocol (tools/collisionSplitBuild.selftest.mjs drives it with stub children):
//   job-map <id>              before each map's build; the map's lines follow it
//   job-entry <label> <json>  a regeneration's index entry for the shard it wrote (the parent publishes the index)
//   job-done <json>           the closing line, {maps, drifted}: the share it built and, for a check, the maps it found
//                             DRIFTED or MISSING; the child then exits 0, drift or not
// A child is sound only when it exits 0, its job-done names its share, its drifted list equals the maps whose lines say
// DRIFTED or MISSING, and every map of its share printed its result line (and, regenerating, its entry). Anything
// else (an exit 1 from an uncaught error after the last map's line, a signal, a missing job-done) fails the run with
// exit 2 and the child's stderr tail; a drift is never inferred from an exit code.
//
// A child is bound to the one process that spawned it, and never outlives it:
//   - the child mode's marker (env COT_COLLISION_JOB) holds the parent's pid; a process whose parent is another (an
//     inherited or hand-set variable, or a child whose parent died before it started) is refused with exit 2, never run
//     in the protocol's quiet mode nor as a serial build, and the child deletes the marker so nothing it starts inherits it;
//   - a watchdog thread in each child kills it (SIGKILL) as soon as its parent is gone, whatever ended the parent (a
//     wall-clock alarm, memcap's or anyone's SIGKILL, a crash), even while the child's main thread is busy in a build,
//     and the child checks its parent again before every map and every shard it writes;
//   - so the parent installs no signal handler: it dies of whatever signal ends it, with the serial run's status.
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';

/** The child mode's marker: the parent's pid, so only that parent's own children take the protocol's quiet exit. */
const COLLISION_JOB_ENV = 'COT_COLLISION_JOB';
/** How often a child's watchdog looks for its parent (a dead parent's child is reparented at once). */
const WATCHDOG_MS = 100;

/** The line a child of a split build closes with (its drift is reported here, never through its exit code). */
export function collisionJobDoneLine(maps, drifted = []) {
  return `job-done ${JSON.stringify({ maps, drifted })}`;
}

/** Deal the maps round-robin into at most `jobs` non-empty shares (the drift receipt's split). */
export function collisionJobShares(mapIds, jobs) {
  const workers = Math.max(1, Math.min(jobs, mapIds.length));
  return Array.from({ length: workers }, (_, w) => mapIds.filter((_, index) => index % workers === w));
}

/** The tool's arguments for a child: everything but --maps and --jobs (the child is handed its share). */
export function collisionJobArgs(argv) {
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--maps') i++;
    else if (!argv[i].startsWith('--maps=') && !argv[i].startsWith('--jobs=')) args.push(argv[i]);
  }
  return args;
}

/**
 * How the tool runs: `serial` (every map one after another in this process: the default, and always for a browser
 * capture or one map), `split` over `jobs` children (only when --jobs=N asks for more than one), or `child` of the split
 * build whose pid the marker holds. A marker that names any other process throws (the tool exits 2): the protocol's
 * quiet exit (drift reported in job-done, exit 0, no summary, no index) is taken only when the marker names this process's
 * own parent, never on an inherited variable, a stale one, or one set by hand to anything else.
 */
export function collisionBuildMode(options, { env = process.env, ppid = process.ppid } = {}) {
  const marker = env[COLLISION_JOB_ENV];
  if (marker !== undefined) {
    if (options.node && marker === String(ppid)) return { mode: 'child', parent: ppid };
    // refused, not ignored: a child whose parent died before it started must not run on as a serial build and write
    throw new Error(`${COLLISION_JOB_ENV}=${marker} marks a split build's child, but this process's parent is ${ppid}`
      + `${options.node ? '' : ' and it is no Node build'} (a split build that has ended, or an inherited or hand-set`
      + ' variable: unset it to run the tool)');
  }
  const jobs = options.jobs ?? 1;
  return options.node && jobs > 1 && options.mapIds.length > 1 ? { mode: 'split', jobs } : { mode: 'serial', jobs: 1 };
}

/**
 * Arm a split build's child (collisionBuildMode said `child`): delete the marker, so nothing this process starts
 * inherits it, and start the watchdog thread that kills this process as soon as its parent is gone. Returns the
 * synchronous check the child makes before each map and each shard it writes (it kills the process the same way).
 */
export function armCollisionJobChild(parent) {
  delete process.env[COLLISION_JOB_ENV];
  const orphaned = () => process.ppid !== parent;
  // its own event loop, so it fires while the main thread is busy in a build; SIGKILL, as a dead parent reads no status
  const watchdog = new Worker(`
    const { workerData: { parent, ms } } = require('node:worker_threads');
    setInterval(() => { if (process.ppid !== parent) process.kill(process.pid, 'SIGKILL'); }, ms);
  `, { eval: true, workerData: { parent, ms: WATCHDOG_MS } });
  watchdog.unref();
  if (orphaned()) process.kill(process.pid, 'SIGKILL');
  return () => { if (orphaned()) process.kill(process.pid, 'SIGKILL'); };
}

/**
 * Run a split build and return its verdict: `code` 0 (sound; a check found no drift), 1 (a check found drift) or 2 (a
 * child failed: its reason and stderr tail are written to `error`; nothing is to be published), the drifted map ids in
 * map order, and a regeneration's index entries by map id.
 */
export async function runCollisionSplitBuild({
  tool, argv, mapIds, jobs, check, variant = null,
  execPath = process.execPath, execArgv = process.execArgv, env = process.env,
  log = (line) => console.log(line), error = (line) => console.error(line), stderr = (text) => process.stderr.write(text),
}) {
  const shares = collisionJobShares(mapIds, jobs);
  const args = collisionJobArgs(argv);
  // a receipt that must build serially asserts this line's absence; a split check's summary says it too
  error(`${mapIds.length} maps split over ${shares.length} jobs: no map is built after the maps of the other shares, so state`
    + ' one build leaves for a later one goes unchecked (without --jobs the tool builds them one after another in one process)');
  const label = (mapId) => (variant ? `${mapId}@${variant}` : mapId);
  const result = (mapId, line) => line.startsWith(`${label(mapId)}: `);
  const drift = (mapId, line) => line.startsWith(`${label(mapId)}: DRIFTED`) || line.startsWith(`${label(mapId)}: MISSING`);
  const blocks = new Map(), entries = new Map(), preambles = shares.map(() => []), children = new Set();
  let printed = 0;
  const flush = () => {
    while (printed < mapIds.length && blocks.get(mapIds[printed])?.done) {
      if (printed === 0) for (const line of preambles[0]) log(line);
      for (const line of blocks.get(mapIds[printed]).lines) log(line);
      printed++;
    }
  };
  const stopAll = () => { for (const child of children) { child.stopped = true; child.kill('SIGKILL'); } };
  // no signal handler here: the parent dies of whatever signal ends it (the serial run's status), and each child's
  // watchdog (armCollisionJobChild) then kills that child
  const run = (share, w) => new Promise((resolve) => {
    const child = spawn(execPath, [...execArgv, tool, ...args, '--maps', share.join(',')], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, [COLLISION_JOB_ENV]: String(process.pid) },
    });
    children.add(child);
    let rest = '', err = '', current = null, settled = false, done = null, malformed = null;
    const take = (line) => {
      const marker = /^job-map ([a-z_]+)$/.exec(line);
      if (marker) {
        if (current) current.done = true;
        current = { lines: [], done: false };
        blocks.set(marker[1], current);
        return;
      }
      const entry = /^job-entry ([a-z_]+)(?:@[a-z-]+)? (\{.*\})$/.exec(line);
      if (entry) { try { entries.set(entry[1], JSON.parse(entry[2])); } catch { malformed = line; } return; }
      if (line.startsWith('job-done ')) {
        try { done = JSON.parse(line.slice('job-done '.length)); } catch { malformed = line; }
        if (current) current.done = true;
        current = null;
        return;
      }
      (current ? current.lines : preambles[w]).push(line);
    };
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      if (rest) take(rest);
      rest = '';
      if (current) current.done = true;
      flush();
      const reasons = child.stopped ? ['stopped after another job failed'] : [];
      if (!child.stopped) {
        if (code !== 0) reasons.push(`exited ${code ?? signal}`);
        if (malformed) reasons.push(`wrote an unreadable protocol line (${malformed.slice(0, 80)})`);
        else if (!done) reasons.push('closed without its job-done line');
        else if (JSON.stringify(done.maps) !== JSON.stringify(share)) reasons.push(`reported maps ${JSON.stringify(done.maps)}`);
        const missing = share.filter((mapId) => !blocks.get(mapId)?.lines.some((line) => result(mapId, line))
          || (!check && !entries.has(mapId)));
        if (missing.length) reasons.push(`no result for ${missing.join(', ')}`);
        else if (check && done && !malformed) {
          // the drift a child reports must be the drift its lines show, map for map
          const seen = share.filter((mapId) => blocks.get(mapId).lines.some((line) => drift(mapId, line)));
          const told = Array.isArray(done.drifted) ? done.drifted : null;
          if (!told || JSON.stringify(share.filter((mapId) => told.includes(mapId))) !== JSON.stringify(seen) || told.length !== seen.length) {
            reasons.push(`reported drift ${JSON.stringify(done.drifted)} where its lines show ${JSON.stringify(seen)}`);
          }
        }
        if (reasons.length) stopAll();
      }
      resolve({ share, reasons, err, drifted: Array.isArray(done?.drifted) ? done.drifted : [] });
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      for (const line of lines) take(line);
      flush();
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (spawnError) => { err += `\n${spawnError.stack ?? spawnError}`; settle(null, 'spawn-error'); });
    child.on('close', settle);
  });
  const results = await Promise.all(shares.map(run));
  const failed = results.filter(({ reasons }) => reasons.length);
  if (failed.length) {
    for (const { share, reasons, err } of failed) {
      const tail = err.split('\n').filter((line) => line.trim()).slice(-20).join('\n');
      error(`collision job ${share.join(',')} ${reasons.join('; ')}${tail ? `:\n${tail}` : ''}`);
    }
    return { code: 2, drifted: [], entries };
  }
  for (const { err } of results) if (err) stderr(err);
  const drifted = mapIds.filter((mapId) => results.some((child) => child.drifted.includes(mapId)));
  return { code: check && drifted.length ? 1 : 0, drifted, entries };
}
