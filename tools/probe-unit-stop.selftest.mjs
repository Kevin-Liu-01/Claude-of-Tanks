// (round 3 A5) A cap stop that lands mid-unit, in each caller of frame-budget-probe's acquireProbeLocks. Round two moved the
// pair's FIFO onto the one hold wrapper, so past the 20-min cap with anyone waiting the hold's signal aborts (a 30 s cap
// check) and its guarded browsers are stopped one grace (60 s) later. A unit runs for minutes (a frame-budget slot, a
// three-battle memory scenario, a spike battle, a shadow map, a time-to-battle build), and each caller read the signal only
// before a unit: the unit in flight was killed and counted as a failure, or crashed the tool.
//   frame-budget-probe recorded the cut slot as failed and exited 1 ('FAILED'); battle-memory-probe crashed uncaught;
//   battle-spike-census counted the battle as a failure, skipped census.json and exited 1 (and perf:spikes:check judged
//   its missing records 'FAIL (no record)'); shadow-cache-truth crashed before result.json; time-to-battle-probe
//   --warm=relaunch threw the refused relaunch out of the tool.
// Each run is driven here through its real loop and the real acquireProbeLocks (openCaptureHold, its phases and its
// launch refusal) on a fake FIFO lock with a 30 ms cap and a waiter; the hold's teardown stops a stand-in browser, so the
// unit in flight fails as a killed page call does. No browser or server starts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { acquireProbeLocks, parseFrameProbeArgs, runFrameProbe, runProbeUnit } from './frame-budget-probe.mjs';
import { parseMemoryArgs, runMemoryProbe } from './battle-memory-probe.mjs';
import { parseCensusArgs, reanalyze, runCensus } from './battle-spike-census.mjs';
import { runBudget } from './battle-spike-budget.mjs';
import { parseArgs as parseShadowArgs, runShadowTruth } from './shadow-cache-truth.mjs';
import { runTimeToBattle } from './time-to-battle-probe.mjs';

const signalListeners = () => ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name));
// (round 3 B16 review) after every import above, before any case: what importing these tools leaves on the process
const signalsAtImport = signalListeners();

const roots = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'cot-probe-unit-')); roots.push(dir); return dir; };
/** A tree with a built dist, as the callers check before they start. */
const builtTree = () => { const dir = scratch(); mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'index.html'), ''); return dir; };
const quietly = async (run) => {
  const saved = process.exitCode, log = console.log, said = [];
  console.log = (...parts) => { said.push(parts.join(' ')); };
  process.exitCode = undefined;
  // a live browser or server keeps a real run's event loop alive; the hold's own timers do not
  const alive = setInterval(() => {}, 1000);
  try {
    const value = await run().then((result) => ({ result }), (error) => ({ error }));
    return { ...value, exitCode: process.exitCode, said: said.join(' | ') };
  } finally {
    clearInterval(alive);
    console.log = log;
    process.exitCode = saved;
  }
};
/** The pair's FIFO on a fake lock (a 30 ms cap, one waiter): its hold is stopped at once, and its teardown (one 50 ms grace
 *  later) stops the stand-in browser, so a unit still in flight then fails as a killed page call does. */
function stoppedPair() {
  let held = false, die;
  const lock = { nested: false, acquire: async () => { held = true; }, release: () => { held = false; return true; }, refresh: () => held,
    waiting: () => 1, get held() { return held; }, get heldCapMs() { return held ? 30 : null; } };
  const killed = new Promise((_, reject) => { die = reject; });
  killed.catch(() => {});
  const acquireLocks = (options = {}) => acquireProbeLocks({ ...options, lock,
    hold: { ...options.hold, capCheckMs: 10, graceSeconds: 0.05, log: () => {}, teardown: async () => { die(new Error('Protocol error: Target closed')); } } });
  return { acquireLocks, inFlight: () => killed };
}
const standIn = { close: async () => {} };
// each caller is its own case: one that fails does not hide the others
const failed = [];
const check = async (name, run) => { try { await run(); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

try {
  // ---- the owner: a unit's end under the pair's hold ------------------------------------------------------------------------
  await check('runProbeUnit', async () => {
    const controller = new AbortController(), locks = { signal: controller.signal };
    assert.deepEqual(await runProbeUnit(locks, async () => 'measured'), { outcome: 'done', value: 'measured' }, 'a unit that returns is done');
    const held = await runProbeUnit(locks, async () => { throw new Error('page error'); });
    assert.deepEqual([held.outcome, held.error.message], ['failed', 'page error'], 'a unit that throws while the hold holds failed');
    const cut = await runProbeUnit(locks, async () => { controller.abort(new Error('hold cap 20.0 min with 1 waiting')); throw new Error('Target closed'); });
    assert.deepEqual([cut.outcome, cut.why, cut.error.message], ['left', 'hold cap 20.0 min with 1 waiting', 'Target closed'], 'one the stop cut is left');
    let ran = false;
    const after = await runProbeUnit(locks, async () => { ran = true; });
    assert.deepEqual([after.outcome, ran], ['left', false], 'one the stop came before is left without running');
    const finished = await runProbeUnit({ signal: new AbortController().signal }, async (signal) => signal.aborted);
    assert.deepEqual(finished, { outcome: 'done', value: false }, 'the unit gets the hold\'s signal');
  });

  // ---- frame-budget-probe: the cut slot is left for the next hold (a 'failed' record it measures again), not FAILED --------
  await check('frame-budget-probe', async () => {
    const out = scratch(), root = builtTree();
    const options = parseFrameProbeArgs([`--roots=${root}`, '--labels=a', '--maps=verdant', '--pattern=AA', `--out=${out}`, '--scene-check=off', '--tag=t']);
    const { acquireLocks, inFlight } = stoppedPair();
    const measured = [];
    const { result, error, exitCode } = await quietly(() => runFrameProbe(options, { acquireLocks, launchBrowser: async () => standIn,
      openServer: async () => standIn, measure: async (_browser, _options, slot) => { measured.push(slot.key); return inFlight(); } }));
    assert.equal(error, undefined, `frame-budget-probe: no throw (${error?.message})`);
    assert.deepEqual(measured, ['verdant-s0-a'], 'the second slot never starts once the hold is stopped');
    assert.deepEqual(result, { ok: true, remaining: 2 }, 'the slot the stop cut is left, as the slot after it, and the run is not FAILED');
    assert.equal(exitCode, 3, 'exit 3: slots left for the next hold');
    const record = JSON.parse(readFileSync(join(out, 't-verdant-s0-a.json'), 'utf8'));
    assert.equal(record.left, true, 'the cut slot\'s record says it was left');
    assert.match(record.failed, /^left for the next hold/, 'and still reads as not measured, so the next run measures it');
  });

  // ---- battle-memory-probe: a scenario the stop cut is left (exit 3), not an uncaught crash ---------------------------------
  await check('battle-memory-probe', async () => {
    const out = scratch();
    const options = parseMemoryArgs(['--scenarios=urban:zone_control,steppe:standard', `--out=${out}`]);
    const { acquireLocks, inFlight } = stoppedPair();
    const probed = [];
    const { error, exitCode, said } = await quietly(() => runMemoryProbe(options, { acquireLocks, openServer: async () => standIn,
      probe: async (_options, scenario) => { probed.push(scenario); return inFlight(); } }));
    assert.equal(error, undefined, `battle-memory-probe: a scenario cut by the hold's stop is no crash (${error?.message})`);
    assert.deepEqual(probed, ['urban:zone_control'], 'the next scenario waits for the next run');
    assert.equal(exitCode, 3, 'exit 3: scenarios left');
    assert.deepEqual(readdirSync(out), [], 'no record for the cut scenario');
    // (round 3 A5 review) the probe keeps no list of what it measured: the log names the run that finishes the rest
    assert.ok(said.includes('--scenarios=urban:zone_control,steppe:standard'), `the finishing run is named (${said})`);
  });

  // ---- battle-spike-census and perf:spikes:check: the cut battle is left, census.json is written, the gate says LEFT --------
  await check('battle-spike-census', async () => {
    const out = scratch(), root = builtTree();
    const options = parseCensusArgs(['--scenarios=urban:zone_control', '--sizes=7,14', `--out=${out}`, `--root=${root}`]);
    const { acquireLocks, inFlight } = stoppedPair();
    let battles = 0;
    const { result, error } = await quietly(() => runCensus(options, { acquireLocks, openServer: async () => standIn,
      runOne: async () => { battles++; return inFlight(); } }));
    assert.equal(error, undefined, `battle-spike-census: ${error?.message}`);
    assert.equal(battles, 1, 'the next battle never starts once the hold is stopped');
    assert.deepEqual(result.failures, [], 'the battle the stop cut is no failure');
    assert.equal(result.stopped, true);
    assert.equal(result.left, 2, 'the cut battle and the one after it are left');
    assert.ok(existsSync(join(out, 'census.json')), 'census.json is written for what was measured');
    const { censusExitCode } = await import('./battle-spike-census.mjs');
    assert.equal(censusExitCode(result), 3, 'the census exits 3: battles left');
  });
  // the gate (perf:spikes:check) runs the census itself: a stopped census is incomplete (exit 3, the resume command named),
  // never a FAIL of its missing records
  await check('battle-spike-budget', async () => {
    const gateOut = scratch(), gateRoot = builtTree();
    const budget = { scenarios: ['urban:zone_control'], sizes: [7], passes: ['cold', 'warm'], seconds: 10, driver: 'watch',
      limits: { cold: { links: 0 }, warm: { links: 0 } } };
    const pair = stoppedPair();
    const lines = [];
    const gate = await quietly(() => runBudget(['--gate', `--out=${gateOut}`, `--root=${gateRoot}`], { budget, log: (line) => lines.push(line),
      census: (censusOptions) => runCensus(censusOptions, { acquireLocks: pair.acquireLocks, openServer: async () => standIn, runOne: () => pair.inFlight() }) }));
    assert.equal(gate.error, undefined, `perf:spikes:check: ${gate.error?.message}`);
    assert.equal(gate.exitCode, 3, `a stopped census is incomplete, not failed (${lines.join(' | ')})`);
    assert.ok(lines.some((line) => /urban-zone_control-7v7-cold: LEFT/.test(line)) && !lines.some((line) => /FAIL \(no record\)/.test(line)),
      `the missing battles read LEFT, not FAIL (${lines.join(' | ')})`);
    assert.ok(lines.some((line) => line.includes(`--out=${gateOut}`) && line.includes('--resume')), 'and the resume command is named');
  });
  // (round 3 A5 review) a battle that failed while held, then a stop before the next: the failed battle stays a FAIL (the
  // gate exits 1), only the unplayed one is LEFT; census.json carries the failures, so --report judges the folder the same.
  // The judge read every missing record as LEFT once the census was stopped: 'no limit failed so far', exit 3.
  await check('battle-spike-budget failed then stopped', async () => {
    const gateOut = scratch(), gateRoot = builtTree();
    const budget = { scenarios: ['urban:zone_control', 'steppe:standard'], sizes: [7], passes: ['cold', 'warm'], seconds: 10, driver: 'watch',
      limits: { cold: { links: 0 }, warm: { links: 0 } } };
    const pair = stoppedPair();
    let battles = 0;
    const runOne = async () => { if (battles++ === 0) throw new Error('page crashed'); return pair.inFlight(); };
    const lines = [];
    const gate = await quietly(() => runBudget(['--gate', `--out=${gateOut}`, `--root=${gateRoot}`], { budget, log: (line) => lines.push(line),
      census: (censusOptions) => runCensus(censusOptions, { acquireLocks: pair.acquireLocks, openServer: async () => standIn, runOne }) }));
    const said = lines.join(' | ');
    assert.equal(gate.error, undefined, `perf:spikes:check: ${gate.error?.message}`);
    assert.equal(gate.exitCode, 1, `a battle that failed fails the gate, though the census was stopped after it (${said})`);
    assert.ok(lines.some((line) => /urban-zone_control-7v7-cold: FAIL \(no record: the battle failed: page crashed\)/.test(line)), `the failed battle reads FAIL (${said})`);
    assert.ok(lines.some((line) => /steppe-standard-7v7-cold: LEFT/.test(line)), `the unplayed battle reads LEFT (${said})`);
    assert.deepEqual([gate.result?.failed, gate.result?.left], [2, 1], 'two passes failed; one battle left (the census\'s own count)');
    assert.ok(lines.some((line) => /INCOMPLETE: 1 battle\(s\) left/.test(line)), `the left count is battles, as the census counts them (${said})`);
    const summary = JSON.parse(readFileSync(join(gateOut, 'census.json'), 'utf8'));
    assert.deepEqual([summary.failures?.map((f) => `${f.scenario} ${f.size}`), summary.stopped], [['urban:zone_control 7'], { left: 1 }],
      'census.json carries the failures beside stopped.left');
    const reportLines = [];
    const report = await quietly(() => runBudget(['--gate', `--report=${gateOut}`], { budget, log: (line) => reportLines.push(line) }));
    assert.equal(report.exitCode, 1, `--report judges the stopped folder's failed battle FAIL too (${reportLines.join(' | ')})`);
    assert.deepEqual([report.result?.failed, report.result?.left], [2, 1]);
    // a reanalysis rewrites census.json: it keeps the failures and the stop (it wrote the summary alone, so --report then
    // read the unplayed battle FAIL and the failed one 'no record')
    await quietly(async () => reanalyze(gateOut));
    const kept = JSON.parse(readFileSync(join(gateOut, 'census.json'), 'utf8'));
    assert.deepEqual([kept.failures?.length, kept.stopped], [1, { left: 1 }], 'a reanalysis keeps census.json\'s failures and stop');
    const again = await quietly(() => runBudget(['--gate', `--report=${gateOut}`], { budget, log: () => {} }));
    assert.deepEqual([again.exitCode, again.result?.failed, again.result?.left], [1, 2, 1], '--report after a reanalysis judges the same');
  });

  // ---- (round 3 B16 review) the census's signal handler is runCensus's, not its importers' --------------------------------
  // battle-spike-census installed process.once('SIGTERM'|'SIGINT') at import, exiting 130 a microtask after the signal.
  // battle-memory-probe imports it (driveBattle) and holds through acquireProbeLocks, whose hold owns the signal: two owners,
  // and the census's exit cut the hold's unwind (the scenario left, the server stopped, the release) on SIGINT and SIGTERM.
  await check('battle-spike-census signal owner', async () => {
    assert.deepEqual(signalsAtImport, [0, 0], 'importing the census (battle-memory-probe does) adds no SIGINT or SIGTERM handler');
    const out = scratch(), root = builtTree(), pair = stoppedPair();
    let during = null;
    await quietly(() => runCensus(parseCensusArgs(['--scenarios=urban:zone_control', '--sizes=7', `--out=${out}`, `--root=${root}`]),
      { acquireLocks: pair.acquireLocks, openServer: async () => standIn, runOne: async () => { during = signalListeners(); } }));
    assert.deepEqual(during, [1, 1], 'the census owns SIGINT and SIGTERM while it runs (its hold leaves signals to it)');
    assert.deepEqual(signalListeners(), [0, 0], 'and gives them back when it returns');
  });
  // battle-memory-probe in a process of its own, a signal mid-scenario: the hold unwinds (the scenario is left, its server
  // stopped) and the process exits 128 + n after it
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    await check(`battle-memory-probe ${signal}`, async () => {
      const dir = scratch(), script = join(dir, 'memory-probe-signal.mjs');
      const href = (name) => JSON.stringify(new URL(name, import.meta.url).href);
      writeFileSync(script, [
        `import { acquireProbeLocks } from ${href('./frame-budget-probe.mjs')};`,
        `import { parseMemoryArgs, runMemoryProbe } from ${href('./battle-memory-probe.mjs')};`,
        'let held = false, die;',
        'const lock = { nested: false, acquire: async () => { held = true; }, release: () => { held = false; return true; }, refresh: () => held,',
        '  waiting: () => 0, get held() { return held; }, get heldCapMs() { return null; } };',
        'const killed = new Promise((_, reject) => { die = reject; });',
        'killed.catch(() => {});',
        'const acquireLocks = (options = {}) => acquireProbeLocks({ ...options, lock, hold: { ...options.hold, log: () => {},',
        '  teardown: async () => { die(new Error(\'Protocol error: Target closed\')); } } });',
        `await runMemoryProbe(parseMemoryArgs(['--scenarios=urban:zone_control', ${JSON.stringify(`--out=${dir}`)}]), { acquireLocks,`,
        '  openServer: async () => ({ close: async () => { console.log(\'server closed\'); } }),',
        // a live browser keeps a real run's event loop alive until the teardown stops it
        '  probe: async () => { const alive = setInterval(() => {}, 1000); console.log(\'probing\'); return killed.finally(() => clearInterval(alive)); } });',
      ].join('\n'));
      const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', sent = false;
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (!sent && stdout.includes('probing')) { sent = true; child.kill(signal); }
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const wall = setTimeout(() => child.kill('SIGKILL'), 120_000);
      const [exit] = await once(child, 'exit');
      clearTimeout(wall);
      const tail = `${stdout}${stderr}`.split('\n').slice(-6).join(' | ');
      assert.ok(sent, `the probe reached its scenario (${tail})`);
      assert.ok(stdout.includes('server closed'), `${signal}: the hold's unwind ran to the caller's finally (${tail})`);
      assert.equal(exit, code, `${signal}: the process exits 128 + n after the unwind (${tail})`);
    });
  }
  // (round 4 review) the same with --gate and a unit that failed before the signal: the failure writer set 1 over the
  // signal's 128 + n (`process.exitCode = 1`, after markUnitsLeft kept it), so the process exited 1. (round 5 U9) The
  // process's exit alone cannot pin the writer: the signal owner's exit listener (capture-hold.mjs onHoldSignal) puts 128 +
  // n back however the process ends, so a writer that sets 1 still exits 143 (round 4 review mutant N6). Each child prints
  // process.exitCode once its run returns, before the exit: that is the writer's own code. One child per failure writer
  // (heldRunExitCode({ failed: true }) in frame-budget-probe's run, battle-memory-probe's gate, shadow-cache-truth's gate),
  // each a unit that failed while held and one the signal cut.
  const failedThenSignalled = (name, imports, run) => {
    const dir = scratch(), root = builtTree(), script = join(dir, `${name}-failed-signal.mjs`);
    const href = (file) => JSON.stringify(new URL(file, import.meta.url).href);
    writeFileSync(script, [
      `import { acquireProbeLocks } from ${href('./frame-budget-probe.mjs')};`,
      ...imports.map(([names, file]) => `import { ${names} } from ${href(file)};`),
      'let held = false, die;',
      'const lock = { nested: false, acquire: async () => { held = true; }, release: () => { held = false; return true; }, refresh: () => held,',
      '  waiting: () => 0, get held() { return held; }, get heldCapMs() { return null; } };',
      'const killed = new Promise((_, reject) => { die = reject; });',
      'killed.catch(() => {});',
      'const acquireLocks = (options = {}) => acquireProbeLocks({ ...options, lock, hold: { ...options.hold, log: () => {},',
      '  teardown: async () => { die(new Error(\'Protocol error: Target closed\')); } } });',
      'const standIn = { close: async () => {} };',
      // the unit the signal cuts: a live browser keeps a real run's event loop alive until the teardown stops it
      'const cut = () => { const alive = setInterval(() => {}, 1000); console.log(\'probing\'); return killed.finally(() => clearInterval(alive)); };',
      run({ out: JSON.stringify(`--out=${dir}`), root: (flag) => JSON.stringify(`--${flag}=${root}`) }),
      'console.log(`after the run: exit code ${process.exitCode}`);',
    ].join('\n'));
    return new Promise((done) => {
      const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', sent = false;
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (!sent && stdout.includes('probing')) { sent = true; child.kill('SIGTERM'); }
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const wall = setTimeout(() => child.kill('SIGKILL'), 120_000);
      child.once('exit', (exit) => {
        clearTimeout(wall);
        const said = `${stdout}${stderr}`;
        done({ exit, sent, said, tail: said.split('\n').slice(-6).join(' | ') });
      });
    });
  };
  // started together (each child imports its tool); checked in turn
  const writers = {
    'frame-budget-probe': failedThenSignalled('frame-budget-probe', [['parseFrameProbeArgs, runFrameProbe', './frame-budget-probe.mjs']], ({ out, root }) => [
      `let slots = 0;`,
      `await runFrameProbe(parseFrameProbeArgs([${root('roots')}, '--labels=a', '--maps=verdant', '--pattern=AA', ${out}, '--scene-check=off', '--tag=t']), {`,
      '  acquireLocks, launchBrowser: async () => standIn, openServer: async () => standIn,',
      // the first slot fails while held; the second is cut by the signal
      '  measure: async () => { if (slots++ === 0) throw new Error(\'page crashed\'); return cut(); } });',
    ].join('\n')),
    'battle-memory-probe': failedThenSignalled('battle-memory-probe', [['parseMemoryArgs, runMemoryProbe', './battle-memory-probe.mjs']], ({ out }) => [
      `await runMemoryProbe(parseMemoryArgs(['--scenarios=urban:zone_control,verdant:zone_control', '--gate', ${out}]), { acquireLocks,`,
      '  openServer: async () => ({ close: async () => { console.log(\'server closed\'); } }),',
      // the first scenario measures nothing, so every limit fails ('not measured'); the second is cut by the signal
      '  probe: async (_options, scenario) => (scenario.startsWith(\'urban\') ? { growth: {}, peakRss: {} } : cut()) });',
    ].join('\n')),
    'shadow-cache-truth': failedThenSignalled('shadow-cache-truth', [['parseArgs, runShadowTruth', './shadow-cache-truth.mjs']], ({ out, root }) => [
      `await runShadowTruth(parseArgs([${root('root')}, '--maps=verdant,steppe', ${out}, '--gate']), { acquireLocks,`,
      '  openServer: async () => standIn, launchBrowser: async () => standIn,',
      // the first map differs; the second is cut by the signal
      '  probe: async (_browser, _options, mapId) => (mapId === \'verdant\' ? { failures: [\'verdant: the cached shadow differs\'], record: {} } : cut()) });',
    ].join('\n')),
  };
  const failure = { 'frame-budget-probe': /verdant-s0-a FAILED: page crashed/, 'battle-memory-probe': /limit\(s\) FAILED/,
    'shadow-cache-truth': /DIFFERENCES: verdant: the cached shadow differs/ };
  const leftLine = { 'frame-budget-probe': /verdant-s1-a left for the next hold/, 'battle-memory-probe': /verdant:zone_control left for the next run/,
    'shadow-cache-truth': /steppe left for the next run/ };
  for (const [name, child] of Object.entries(writers)) {
    await check(`${name} SIGTERM after a failure`, async () => {
      const { exit, sent, said, tail } = await child;
      assert.ok(sent && failure[name].test(said), `${name}: a unit failed while held, then the next was signalled (${tail})`);
      assert.match(said, leftLine[name], `${name}: the unit cut is left (${tail})`);
      assert.match(said, /after the run: exit code 143\b/, `${name}: the failure writer keeps the signal's 128 + n (${tail})`);
      assert.equal(exit, 143, `${name}: the process exits 128 + n (${tail})`);
    });
  }

  // ---- shadow-cache-truth: a map the stop cut is left; result.json is written; exit 3 ---------------------------------------
  await check('shadow-cache-truth', async () => {
    const out = scratch(), root = builtTree();
    const options = parseShadowArgs([`--root=${root}`, '--maps=verdant,steppe', `--out=${out}`, '--gate']);
    const { acquireLocks, inFlight } = stoppedPair();
    const maps = [];
    const { result, error, exitCode, said } = await quietly(() => runShadowTruth(options, { acquireLocks, openServer: async () => standIn,
      launchBrowser: async () => standIn, probe: async (_browser, _options, mapId) => { maps.push(mapId); return inFlight(); } }));
    assert.equal(error, undefined, `shadow-cache-truth: a map cut by the hold's stop is no crash (${error?.message})`);
    assert.deepEqual(maps, ['verdant'], 'the next map waits for the next run');
    assert.deepEqual(result.left, ['verdant', 'steppe'], 'both maps are left');
    assert.equal(result.pass, false, 'a run with maps left is no pass');
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')).left, ['verdant', 'steppe'], 'result.json is written');
    assert.equal(exitCode, 3, 'exit 3, even with --gate: maps left, nothing failed');
    // (round 3 A5 review) a run writes result.json for its own maps: the log names the run that finishes the rest
    assert.ok(said.includes('--maps=verdant,steppe') && said.includes('a fresh --out'), `the finishing run is named (${said})`);
  });

  // ---- time-to-battle-probe --warm=relaunch: a cold run the stop cuts leaves the unit; the warm run never starts ----------
  await check('time-to-battle-probe', async () => {
    const out = scratch(), root = builtTree(), roster = join(scratch(), 'roster.json');
    writeFileSync(roster, JSON.stringify({ specId: 't90m', opponents: ['t72b3'] }));
    const { acquireLocks, inFlight } = stoppedPair();
    const runs = [];
    // the launch goes through the guarded launcher (a test double): a stopped hold refuses it, as it refuses Chrome
    const double = { launch: async () => ({ close: async () => {} }) };
    const { error, exitCode } = await quietly(() => runTimeToBattle({ roots: root, labels: 'a', maps: 'verdant', runs: 'cold,warm', warm: 'relaunch',
      out, roster }, { acquireLocks, startPreview: async () => standIn, catalog: async () => [], launchBrowser: (launchOptions) => launchGuardedBrowser(double, launchOptions),
      runPage: async (_browser, { run }) => { runs.push(run); return inFlight(); } }));
    assert.equal(error, undefined, `time-to-battle-probe: a cold run the stop cuts leaves the unit (${error?.message})`);
    assert.deepEqual(runs, ['cold'], 'the warm run never starts on a stopped hold');
    assert.equal(exitCode, 3, 'exit 3: the unit is left');
    assert.deepEqual(readdirSync(out).filter((name) => name.endsWith('.json') && name !== 'roster.json'), [], 'no failed record for the cut unit');
  });
  // (round 3 A5 review) the cold run ends inside the grace, after the stop: the --warm=relaunch launch is refused by the
  // stopped hold, inside the unit, so the unit is left (exit 3) and the refusal never leaves the tool
  await check('time-to-battle-probe relaunch', async () => {
    const out = scratch(), root = builtTree(), roster = join(scratch(), 'roster.json');
    writeFileSync(roster, JSON.stringify({ specId: 't90m', opponents: ['t72b3'] }));
    const pair = stoppedPair();
    let locks = null;
    const runs = [], launches = [];
    const double = { launch: async () => ({ close: async () => {} }) };
    const launchBrowser = async (launchOptions) => {
      try { const browser = await launchGuardedBrowser(double, launchOptions); launches.push('ok'); return browser; } catch (error) { launches.push('refused'); throw error; }
    };
    const stopped = () => new Promise((resolve) => { if (locks.signal.aborted) resolve(); else locks.signal.addEventListener('abort', resolve, { once: true }); });
    const record = { openMs: 1, trace: { totalMs: 1, stages: {} }, network: { requests: 0, bytes: 0 }, load1: 0 };
    const { error, exitCode } = await quietly(() => runTimeToBattle({ roots: root, labels: 'a', maps: 'verdant', runs: 'cold,warm', warm: 'relaunch',
      out, roster }, { acquireLocks: async (options) => (locks = await pair.acquireLocks(options)), startPreview: async () => standIn,
      catalog: async () => [], launchBrowser, runPage: async (_browser, { run }) => { runs.push(run); await stopped(); return { ...record }; } }));
    assert.equal(error, undefined, `time-to-battle-probe: the refused relaunch stays inside the unit (${error?.message})`);
    assert.deepEqual(launches, ['ok', 'refused'], 'the cold run\'s launch, then the relaunch the stopped hold refuses');
    assert.deepEqual(runs, ['cold'], 'the warm run never starts');
    assert.equal(exitCode, 3, 'exit 3: the unit is left');
    assert.deepEqual(readdirSync(out).filter((name) => name.endsWith('-failed.json')), [], 'no failed record');
  });
} finally {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
}
assert.deepEqual(failed, [], `a cap stop mid-unit leaves the unit for the next run:\n  ${failed.join('\n  ')}`);

console.log('probe-unit-stop.selftest: a cap stop mid-unit leaves the unit for the next run in frame-budget-probe, battle-memory-probe, battle-spike-census (and its gate, which still fails a failed battle), shadow-cache-truth and time-to-battle-probe --warm=relaunch (a cut cold run or a refused relaunch): exit 3, never FAILED or a crash, the finishing run named; a signal unwinds battle-memory-probe\'s hold, and its 128 + n stands over each failure writer (frame-budget-probe\'s run, battle-memory-probe\'s and shadow-cache-truth\'s gates) PASS');
