// A regen chain stops in the middle of a rows read (round 8 Y10 s6-06, tools/changed-only/fingerprint.mjs readRowsAsync).
// The chain's rows read (the roster and every per-id row, before and after each step) was a synchronous child
// (childBudget.mjs budgetedSync): it held the chain's event loop, so the stop handler (chain-lifecycle stopOnSignal) waited
// for the whole read, minutes under load, and a run of zero-change steps chained their reads through microtasks without
// one turn of the loop between them. The read now runs in the chain's own child groups and is awaited. In real processes:
//   1. the real chain (tools/tank-regen-changed.mjs, a dry run on a fixture fleet) reads its rows from a stand-in that
//      sleeps 15 s: a SIGTERM 1 s into the read ends the chain with 143 inside 5 s and no stand-in survives (red before:
//      the chain sat out the read);
//   2. the same chain whose reads come one after another with no other await (a dry run: every step resolves and moves
//      on), each read 3 s: the stop lands during the first read, and no second read starts (red before: the stop waited
//      through every read the chain had left);
//   3. the groups' phase: 'running' -> 'stopping' once (beginStop), a spawn refused with a stop marker while stopping, and
//      only stopOnSignal makes that move (a census of the tools);
//   4. a caller outside a chain (budgetedSync, as changed-ids and the receipts read rows): its runner and child sit in the
//      caller's process group; when the caller is killed (SIGKILL by its exact pid) the runner stops the child inside 8 s
//      (red before: the child ran on, unowned, to its end), and a SIGTERM to the runner reaches the child, the runner
//      exiting 143 (red before: the runner died at once and left the child running).
// Every process this receipt starts or finds (the chain, the runner, the stand-ins) is SIGKILLed by its exact pid at the
// end, whatever happened; a stand-in also ends itself within 20 s.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const base = mkdtempSync(join(tmpdir(), 'cot-rows-read-stop-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const started = new Set();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const put = (rel, text) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); };
/** The stand-in's log: one `<pid> <ppid>` line per read it started. */
const readsOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.split(' ').map(Number)) : []);
const remember = (file) => { for (const [pid, ppid] of readsOf(file)) { started.add(pid); started.add(ppid); } };
async function until(test, ms, step = 25) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await sleep(step); }
  return test();
}

// The fixture fleet: two ids, two CPU steps. src/vehicles/fleetRegistration.ts is the first module rows-child imports
// (tools/changed-only/rows-child.mjs): with COT_ROWS_STANDIN_LOG set it logs its pid and parent and sleeps
// COT_ROWS_STANDIN_MS, the rows read's stand-in. Without it the fixture reads at once (the chain's own control run).
const R = join(base, 'tree');
put('tree/package-lock.json', '{"lockfileVersion":3}\n');
put('tree/node_modules/.package-lock.json', '{}\n');
put('tree/src/vehicles/specs.ts', [
  "export const ALL_TANK_IDS = ['a1', 'b1'];",
  'export const SAVED_TANK_IDS = ALL_TANK_IDS;',
  'export const DEVELOPMENT_TANK_IDS = [];',
  "export const TANK_SPECS = { a1: { id: 'a1' }, b1: { id: 'b1' } };", ''].join('\n'));
put('tree/src/vehicles/fleetRegistration.ts', [
  "import { appendFileSync } from 'node:fs';",
  "import './specs.ts';",
  'const standIn = process.env.COT_ROWS_STANDIN_LOG;',
  'if (standIn) {',
  '  appendFileSync(standIn, `${process.pid} ${process.ppid}\\n`);',
  '  await new Promise((done) => setTimeout(done, Number(process.env.COT_ROWS_STANDIN_MS)));',
  '}', ''].join('\n'));
put('tree/src/vehicles/fleetManifest.ts', "export const FLEET_GROUP_BY_ID = { a1: 'alpha', b1: 'beta' };\n");
put('tree/src/vehicles/tankIdAliases.ts', 'export const TANK_ID_RENAMES = {};\nexport const TANK_ID_SCHEMA = 1;\n');
put('tree/src/vehicles/profiles/alpha.ts', 'export const ALPHA = { a1: 1 };\n');
put('tree/src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 2 };\n');
put('tree/src/vehicles/tankFactory.ts', "import './fleetRegistration.ts';\nimport { ALPHA } from './profiles/alpha.ts';\nimport { BETA } from './profiles/beta.ts';\nexport const createTank = (id) => ({ id, base: { ...ALPHA, ...BETA }[id] });\n");
put('tree/src/vehicles/fleetFactory.ts', "import './fleetRegistration.ts';\nconst GROUP_LOADERS = Object.freeze({\n  alpha: () => import('./profiles/alpha.ts'),\n  beta: () => import('./profiles/beta.ts'),\n});\nexport { GROUP_LOADERS };\n");
for (const [table, exportName] of [['controls', 'CONTROLS'], ['fills', 'FILLS']]) {
  put(`tree/src/vehicles/${table}.generated.ts`, `export const ${exportName} = {};\n`);
  put(`tree/tools/gen-${table}.mjs`, "import { createTank } from '../src/vehicles/tankFactory.ts';\nconsole.log(createTank('a1').base);\n");
}
const tableModule = join(base, 'table.mjs');
writeFileSync(tableModule, [
  'export const TABLES = {',
  "  controls: { kind: 'module', files: ['src/vehicles/controls.generated.ts'], exportName: 'CONTROLS' },",
  "  fills: { kind: 'module', files: ['src/vehicles/fills.generated.ts'], exportName: 'FILLS' },",
  '};',
  'export const CONFIG = { tables: TABLES, aggregates: [],',
  "  fleetEntries: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/specs.ts', 'src/vehicles/fleetRegistration.ts'],",
  "  loaderFiles: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts'],",
  "  groupLoadersFile: 'src/vehicles/fleetFactory.ts', declared: {}, accessors: {} };",
  "const step = (name) => ({ name, device: 'cpu', tool: `tools/gen-${name}.mjs`, flags: [], full: [], scoped: (list) => [`--ids=${list.join(',')}`],",
  "  check: ['--check'], checkScoped: (list) => ['--check', `--ids=${list.join(',')}`], outputs: [name], files: [], gb: 0.1, timeoutS: 120, perIdS: 1 });",
  "export const STEPS = [step('controls'), step('fills')];", ''].join('\n'));
const chainEnv = { ...process.env, COT_CHANGED_ONLY_CACHE_DIR: join(base, 'graph-cache'), NODE_OPTIONS: '' };
/** The real chain, a dry run of every step on the fixture (no table: --all); resolves { code, signal, out } once it closes. */
function runChain(env) {
  const child = spawn(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), `--root=${R}`, `--table=${tableModule}`,
    '--dry-run', '--all', '--no-gpu', '--no-world', '--jobs=1'], { cwd: R, env: { ...chainEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  started.add(child.pid);
  let out = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
  let result = null;
  const closed = new Promise((done) => child.once('close', (code, signal) => { result = { code, signal, out }; done(result); }));
  return { child, closed, get result() { return result; }, get out() { return out; } };
}

try {
  // ---- 0. control: the fixture chain reads its rows and runs through (one read per step and the final resolve) -----------
  {
    const log = join(base, 'control.reads');
    const run = runChain({ COT_ROWS_STANDIN_LOG: log, COT_ROWS_STANDIN_MS: '0' });
    const { code, out } = await run.closed;
    remember(log);
    assert.equal(code, 0, `the fixture chain's dry run passes:\n${out}`);
    assert.equal(readsOf(log).length, 3, `it reads its rows three times (controls, fills, the final resolve):\n${out}`);
  }

  // ---- 1. a SIGTERM in the middle of a 15 s read ---------------------------------------------------------------------
  {
    const log = join(base, 'long.reads');
    const run = runChain({ COT_ROWS_STANDIN_LOG: log, COT_ROWS_STANDIN_MS: '15000' });
    assert.ok(await until(() => readsOf(log).length >= 1 || run.result, 180_000), 'the first rows read starts');
    remember(log);
    assert.equal(run.result, null, `the chain is still reading:\n${run.out}`);
    await sleep(1000);
    const signalledAt = Date.now();
    run.child.kill('SIGTERM');
    const stoppedInTime = await until(() => run.result, 5000);
    const seconds = ((Date.now() - signalledAt) / 1000).toFixed(1);
    remember(log);
    const [standIn, parent] = readsOf(log)[0];
    if (!stoppedInTime) {
      for (const pid of [run.child.pid, parent, standIn]) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      await run.closed;
    }
    assert.ok(stoppedInTime, `a SIGTERM 1 s into a 15 s rows read ends the chain inside 5 s (still running after ${seconds} s: the stop `
      + `waited for the read; the read's parent was pid ${parent}, the chain ${run.child.pid})\n${run.out}`);
    assert.equal(run.result.code, 143, `the chain exits 128 + SIGTERM (${JSON.stringify({ code: run.result.code, signal: run.result.signal })})\n${run.out}`);
    assert.equal(parent, run.child.pid, 'the read was the chain\'s own child (its own process group), not a runner\'s');
    await sleep(200);
    assert.equal(alive(standIn), false, `no stand-in survives the stop (pid ${standIn})`);
    assert.match(run.out, /\[regen\] stopped by SIGTERM: the chain is stopping \(SIGTERM\): the rows read ended/, `the chain names the stop, not a failure:\n${run.out}`);
    assert.doesNotMatch(run.out, /\[regen\] FAILED/, 'and never reads as FAILED');
    const summaries = readdirSync(join(R, '.qa-dev/changed-only')).filter((name) => /^\d{4}-.*Z\.json$/.test(name)).sort();
    const summary = JSON.parse(readFileSync(join(R, '.qa-dev/changed-only', summaries.at(-1)), 'utf8'));
    assert.deepEqual([summary.ok, summary.stopped], [false, 'SIGTERM'], 'its summary records the stop');
  }

  // ---- 2. reads one after another with no other await: the stop lands during the first --------------------------------
  {
    const log = join(base, 'chained.reads');
    const run = runChain({ COT_ROWS_STANDIN_LOG: log, COT_ROWS_STANDIN_MS: '3000' });
    assert.ok(await until(() => readsOf(log).length >= 1 || run.result, 180_000), 'the first rows read starts');
    assert.equal(run.result, null, `the chain is still reading:\n${run.out}`);
    await sleep(1000);
    const signalledAt = Date.now();
    run.child.kill('SIGTERM');
    // a chain that defers its stop reads on, 3 s a read, until its last one; it ends by itself well inside 30 s
    const stopped = await until(() => run.result, 30_000);
    remember(log);
    if (!stopped) { for (const pid of [run.child.pid, ...readsOf(log).flat()]) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } await run.closed; }
    const seconds = (Date.now() - signalledAt) / 1000, reads = readsOf(log).length;
    assert.equal(reads, 1, `the stop lands during the first read: no second read starts (${reads} read(s) started, the chain gone `
      + `${seconds.toFixed(1)} s after the SIGTERM)\n${run.out}`);
    assert.ok(seconds < 5, `and the chain is gone inside 5 s (${seconds.toFixed(1)} s)`);
    assert.equal(run.result.code, 143, `exit 128 + SIGTERM\n${run.out}`);
  }

  // ---- 3. the groups' phase and its one owner --------------------------------------------------------------------------
  {
    const { CHAIN_PHASES, createChildGroups, isChainStop, stopOnSignal } = await import('../chain-lifecycle.mjs');
    assert.deepEqual(CHAIN_PHASES, ['running', 'stopping']);
    const spawned = [];
    const groups = createChildGroups({ killGroup: () => {}, spawnProcess: (command) => { spawned.push(command); return { pid: 0, once() {} }; } });
    assert.deepEqual([groups.phase, groups.stopping], ['running', null]);
    groups.spawn('a', []);
    assert.throws(() => groups.stopMarker('x'), /no stop began/, 'no stop marker while running');
    // the table: running --beginStop--> stopping; stopping --beginStop--> refused; stopping --spawn--> refused
    assert.equal(groups.beginStop('SIGTERM'), true, 'running -> stopping');
    assert.deepEqual([groups.phase, groups.stopping], ['stopping', 'SIGTERM']);
    assert.equal(groups.beginStop('SIGINT'), false, 'a second stop is refused');
    assert.equal(groups.stopping, 'SIGTERM', 'and keeps the first signal');
    let refused = null;
    try { groups.spawn('b', []); } catch (error) { refused = error; }
    assert.ok(isChainStop(refused) && refused.signal === 'SIGTERM', `a spawn while stopping is refused with a stop marker (${refused?.message})`);
    assert.deepEqual(spawned, ['a'], 'and starts nothing');
    assert.ok(isChainStop(groups.stopMarker('the rows read ended')), 'the stop marker of work the stop ended');
    // stopOnSignal makes the move: a signal begins the stop, a second sweeps
    const handlers = new Map(), swept = [];
    const owned = createChildGroups({ killGroup: (pid, signal) => swept.push(signal), spawnProcess: () => ({ pid: 0, once() {} }) });
    const remove = stopOnSignal(owned, { exit: () => {}, signals: { on: (name, fn) => handlers.set(name, fn), removeListener: () => {} } });
    handlers.get('SIGHUP')('SIGHUP');
    assert.deepEqual([owned.phase, owned.stopping], ['stopping', 'SIGHUP'], 'a stop signal moves the groups to stopping');
    remove();
    // census: no other module of the tools begins a stop
    const callers = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(path); continue; }
        if (!/\.m?[jt]s$/.test(entry.name) || /\.selftest\.mjs$/.test(entry.name)) continue;
        if (/\.beginStop\(/.test(readFileSync(path, 'utf8'))) callers.push(path.slice(repo.length + 1));
      }
    };
    walk(join(repo, 'tools'));
    assert.deepEqual(callers, ['tools/chain-lifecycle.mjs'], 'only chain-lifecycle (stopOnSignal) begins a chain\'s stop');
    const lifecycle = readFileSync(join(repo, 'tools/chain-lifecycle.mjs'), 'utf8');
    assert.equal((lifecycle.match(/\.beginStop\(/g) ?? []).length, 1, 'stopOnSignal\'s one call');
    const chain = readFileSync(join(repo, 'tools/tank-regen-changed.mjs'), 'utf8');
    assert.match(chain, /readRowsAsync\(root, childEnv, table\.path, \{ groups: children \}\)/, 'the chain reads its rows through its groups');
    assert.doesNotMatch(chain, /computeState\(\{(?![^}]*\brows\b)[^}]*\}\)/, 'every state the chain computes is on rows it read that way');
    assert.doesNotMatch(chain, /\b(?:execFileSync|budgetedSync)\b/, 'and it starts no synchronous child of its own');
  }

  // ---- 4. outside a chain: the runner owns its child ------------------------------------------------------------------
  {
    const STANDIN = (file) => `require('node:fs').appendFileSync(${JSON.stringify(file)}, process.pid + ' ' + process.ppid + '\\n'); setTimeout(() => {}, 20000);`;
    const caller = (file) => `import { budgetedSync } from ${JSON.stringify(new URL('./childBudget.mjs', import.meta.url).href)};
      try { budgetedSync(process.execPath, ['-e', ${JSON.stringify(STANDIN(file))}], { budgetS: 60, pollMs: 200, graceMs: 1000, stdio: 'ignore' }); console.log('returned'); }
      catch (error) { console.log(JSON.stringify({ status: error.status, signal: error.signal })); }`;
    const callerRun = (file) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', caller(file)], { stdio: ['ignore', 'pipe', 'pipe'] });
      started.add(child.pid);
      let out = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      const closed = new Promise((done) => child.once('close', (code, signal) => done({ code, signal, out })));
      return { child, closed };
    };
    // 4a. the caller is killed by its exact pid while it blocks on the read
    {
      const file = join(base, 'orphan.reads');
      const run = callerRun(file);
      assert.ok(await until(() => readsOf(file).length >= 1, 60_000), 'the stand-in starts under its runner');
      remember(file);
      const [standIn, runner] = readsOf(file)[0];
      run.child.kill('SIGKILL');
      await run.closed;
      const gone = await until(() => !alive(standIn), 8000, 100);
      assert.ok(gone, `the runner stops its child once its caller is gone (stand-in pid ${standIn} under runner ${runner} still alive after 8 s)`);
      assert.ok(await until(() => !alive(runner), 3000, 100), 'and exits');
    }
    // 4b. a SIGTERM to the runner reaches its child
    {
      const file = join(base, 'forward.reads');
      const run = callerRun(file);
      assert.ok(await until(() => readsOf(file).length >= 1, 60_000), 'the stand-in starts under its runner');
      remember(file);
      const [standIn, runner] = readsOf(file)[0];
      process.kill(runner, 'SIGTERM');
      const gone = await until(() => !alive(standIn), 8000, 100);
      assert.ok(gone, `a SIGTERM to the runner (pid ${runner}) reaches its child (stand-in pid ${standIn} still alive after 8 s)`);
      const { out } = await run.closed;
      assert.deepEqual(JSON.parse(out.trim().split('\n').at(-1)), { status: 143, signal: null }, `the runner exits 128 + SIGTERM: ${out}`);
    }
  }
  console.log('rowsReadStop.selftest: a SIGTERM in the middle of a chain\'s rows read ends it at once (143, no reader left); reads one after '
    + 'another stop at the first; the groups\' stop is one move that refuses every spawn after it; outside a chain the read\'s runner '
    + 'stops its child when its caller dies or when it is signalled');
} finally {
  for (const file of ['control.reads', 'long.reads', 'chained.reads', 'orphan.reads', 'forward.reads']) remember(join(base, file));
  // only a live process whose command line is one of this receipt's (its fixture, the runner, the chain): never a pid reused
  const ours = (pid) => {
    try { const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }); return command.includes(base) || command.includes(repo); }
    catch { return false; }
  };
  for (const pid of started) { if (pid && pid !== process.pid && pid > 1 && ours(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
  rmSync(base, { recursive: true, force: true });
}
