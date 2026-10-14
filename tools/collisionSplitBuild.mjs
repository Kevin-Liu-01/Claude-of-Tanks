// The split Node build of tools/capture-world-collision-manifests.mjs (speed, 2026-10-13): a regeneration or a check
// of more than one map deals its maps round-robin into `jobs` shares (the drift receipt's split), and a child of the
// tool builds each share with the same arguments and `--maps <share>` (env COT_COLLISION_JOB=1). The parent prints
// every map's lines in map order, so its stdout is the serial run's, and returns the verdict; the tool prints the
// check's summary or publishes the index from the children's entries.
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
import { spawn } from 'node:child_process';

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
  // on stderr, so stdout stays the serial run's; a receipt that must build serially asserts its absence
  error(`${mapIds.length} maps split over ${shares.length} jobs (--jobs=1 builds them in one process)`);
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
  const stopAll = () => { for (const child of children) { child.stopped = true; child.kill('SIGTERM'); } };
  const onSignal = (signal) => { stopAll(); process.exit(signal === 'SIGINT' ? 130 : 143); };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.once(signal, onSignal);
  const run = (share, w) => new Promise((resolve) => {
    const child = spawn(execPath, [...execArgv, tool, ...args, '--maps', share.join(',')], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, COT_COLLISION_JOB: '1' },
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
  let results;
  try {
    results = await Promise.all(shares.map(run));
  } finally {
    for (const signal of signals) process.removeListener(signal, onSignal);
  }
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
