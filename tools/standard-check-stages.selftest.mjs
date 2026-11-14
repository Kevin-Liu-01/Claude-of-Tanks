// tank-standard-check --stages (2026-10-16, test-speed R4b part 1). Two halves:
//  1. the stage runner and summary in tools/standard-check-stages.mjs;
//  2. the real tools/tank-standard-check.mjs, end to end, in a scratch directory: its child tools (concept and photo
//     checks, track clip) are stubs there, and only three of the CLI's own imports are redirected (the capture queue,
//     the lock and the browser), so this receipt never takes the GPU lock, never opens a browser and never writes into
//     the repository. Every policy module stays real. Owner 2026-11-12: no stage runs an outside-model comparison; the
//     scratch directory carries stubs of the two comparison tools that record any run, and every scenario asserts none.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createStageRunner, formatStageSummary, stageStatus, STANDARD_STAGES, summarizeStages,
} from './standard-check-stages.mjs';
import { firstPartyConcept, partitionConceptIds } from './first-party-concept-policy.mjs';
import { isPhotoReference } from './photo-reference-policy.mjs';
import { latticeCellScan } from './contig-grid.mjs';
import { readPhotoReference } from './photo-reference-record.mjs';
import { BARAK_OPENING_CELLS } from './barak-source-openings.mjs';
import { pinnedRoofWeaponCount } from '../src/vehicles/roofWeaponPolicy.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CLI = fileURLToPath(new URL('./tank-standard-check.mjs', import.meta.url));

// --- 1. runner and summary ------------------------------------------------------------------------------------------
{
  // Without --stages a failure propagates: the tool stops at the first failing stage, exactly as before.
  const strict = createStageRunner({ runAll: false });
  const ran = [];
  await assert.rejects(strict.run('photo', () => { ran.push('photo'); throw new Error('red'); }), /red/);
  await assert.rejects(strict.run('concept', async () => { ran.push('concept'); throw new Error('stale'); }, 't72_rys'), /stale/);
  assert.equal(await strict.run('clip', () => 7), 7, 'a passing stage returns its value');
  assert.deepEqual(strict.failures, [], 'the default mode records nothing: it throws');

  // With --stages a failure is recorded with its stage and id, and the next stage still runs.
  const logged = [];
  const all = createStageRunner({ runAll: true, log: line => logged.push(line) });
  const order = [];
  await all.run('photo', async () => { order.push('photo'); throw new Error('photo-reference-check exited 1'); });
  await all.run('concept', () => { order.push('concept'); throw new Error('missing/stale concept proof'); }, 't72_rys');
  assert.equal(await all.run('clip', () => { order.push('clip'); return 'rows'; }), 'rows');
  await all.run('render', () => { order.push('render'); });
  assert.deepEqual(order, ['photo', 'concept', 'clip', 'render'], 'every stage runs after a failing one');
  assert.throws(() => all.fail('geometry', 'x'), /unknown standard-check stage geometry/, 'no outside-model stage remains');
  assert.deepEqual(all.failures, [
    { stage: 'photo', id: null, reason: 'photo-reference-check exited 1' },
    { stage: 'concept', id: 't72_rys', reason: 'missing/stale concept proof' },
  ]);
  assert.equal(logged.length, 2);
  assert.match(logged[1], /stage concept t72_rys FAILED: missing\/stale concept proof/);
  all.fail('clip', new Error('track-clip exited 3'));
  assert.equal(all.failures.at(-1).stage, 'clip');
  assert.throws(() => all.fail('B9', 'x'), /unknown standard-check stage B9/);

  assert.equal(stageStatus(true, true), 'PASS');
  assert.equal(stageStatus(true, false), 'FAIL');
  assert.equal(stageStatus(false, false), 'SKIP', '--no-render leaves B2/B3 out; it never passes or fails them');

  const pass = (id, a = 'procedural') => ({ id, stages: { [a]: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } });
  const ok = summarizeStages([pass('leo2a6'), pass('t72_rys', 'concept'), pass('marder2', 'photo')]);
  assert.equal(ok.passed, true);
  assert.equal(ok.exitCode, 0);
  assert.deepEqual(ok.stages.map(stage => stage.key), STANDARD_STAGES.map(stage => stage.key));
  const skipped = summarizeStages([{ id: 'leo2a6', stages: { procedural: 'N/A', clip: 'PASS', contiguity: 'SKIP', decor: 'SKIP' } }]);
  assert.equal(skipped.exitCode, 0, 'SKIP and N/A never fail a run');
  assert.deepEqual(skipped.stages.find(stage => stage.key === 'contiguity').skip, ['leo2a6']);

  // One failing B stage on one id fails the run, whatever its A stage did.
  const b2 = summarizeStages([pass('leo2a6'), { id: 'mbt70', stages: { procedural: 'N/A', clip: 'PASS', contiguity: 'FAIL', decor: 'PASS' } }]);
  assert.equal(b2.exitCode, 2);
  assert.deepEqual(b2.failedIds, ['mbt70']);
  assert.deepEqual(b2.stages.find(stage => stage.key === 'contiguity').fail, ['mbt70']);
  // A stage that failed as a whole fails the run even when every id reads PASS.
  const errored = summarizeStages([pass('leo2a6')], [{ stage: 'clip', id: null, reason: 'exited 1' }]);
  assert.equal(errored.passed, false);
  assert.equal(errored.exitCode, 2);

  // Completeness: a stage that was never reported, a second A stage, an unknown status or a repeated id fails loudly.
  const missing = { id: 'leo2a6', stages: { procedural: 'N/A', clip: 'PASS', decor: 'PASS' } };
  assert.throws(() => summarizeStages([missing]), /leo2a6: stage contiguity was not reported/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { procedural: 'N/A', photo: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]),
    /exactly one A stage/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]), /exactly one A stage, got none/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { photo: 'ok', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]), /unknown photo status ok/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { geometry: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]), /unknown stage geometry|exactly one A stage/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { photo: 'PASS', clip: 'SKIP', contiguity: 'PASS', decor: 'PASS' } }]), /always run/);
  assert.throws(() => summarizeStages([pass('leo2a6'), pass('leo2a6')]), /reported twice/);

  // The summary names every failing id: no sampling, no truncation.
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `tank_${i}`, stages: { procedural: 'N/A', clip: 'PASS', contiguity: 'FAIL', decor: 'PASS' } }));
  const lines = formatStageSummary(summarizeStages(many, [{ stage: 'render', id: null, reason: 'lock timeout' }]));
  const contiguityLine = lines.find(line => line.includes('B2 contiguity'));
  for (const row of many) assert.ok(contiguityLine.includes(row.id), `${row.id} is listed`);
  assert.ok(lines.some(line => /stage error\s+render: lock timeout/.test(line)));
  assert.match(lines.at(-1), /verdict: FAIL \(30 ids fail a gated stage, 1 stage error\)/);
}

// --- 2. the real CLI, end to end ------------------------------------------------------------------------------------
// NO_RECORD has neither a concept design nor a photo packet: its A stage is N/A, with or without --gate. BARAK carries an
// approved exterior opening (its pinned bow-bay cells) and a pinned roof-weapon count, both checked on the build alone.
const NO_RECORD = 'leo2a6', CONCEPT = 't72_rys', PHOTO = 'marder2', OTHER = 'amx30b', BARAK = 'merkava4_barak';
// The fixture ids must stay in their classes; this receipt fails loudly if the fleet reclassifies them.
assert.deepEqual(partitionConceptIds([NO_RECORD, CONCEPT, PHOTO]).concepts, [CONCEPT]);
assert.equal(isPhotoReference(PHOTO), true);
for (const id of [NO_RECORD, OTHER, BARAK]) {
  assert.equal(isPhotoReference(id), false, id);
  assert.deepEqual(partitionConceptIds([id]).concepts, [], id);
}
assert.equal(pinnedRoofWeaponCount(BARAK), 1);
const conceptGuns = firstPartyConcept(CONCEPT).roofMachineGuns;
const photoGuns = readPhotoReference(PHOTO, file => readFileSync(path.join(REPO, file))).target.roofMachineGuns;

const scratch = mkdtempSync(path.join(tmpdir(), 'cot-standard-stages-'));
const stubDir = path.join(scratch, 'stubs');
mkdirSync(stubDir);
const toolUrl = name => pathToFileURL(path.join(REPO, 'tools', name)).href;
const stub = (name, source) => { writeFileSync(path.join(stubDir, name), source); return pathToFileURL(path.join(stubDir, name)).href; };
const appendLine = `const note = (file, line) => appendFileSync(path.join(process.cwd(), file), line + '\\n');`;
const redirects = {
  [toolUrl('capture-lock.mjs')]: stub('capture-lock.mjs', `
    import { appendFileSync } from 'node:fs'; import path from 'node:path'; ${appendLine}
    export async function acquireCaptureLock() { note('lock.txt', 'acquire'); }
    export function refreshCaptureLock() {}
    export function releaseCaptureLock() {}
    export function createCaptureLock() {
      return { async acquire(_ms, { prepare } = {}) { if (prepare) await prepare(); note('lock.txt', 'acquire'); },
        refresh() { return true; }, release() { return true; } };
    }
  `),
  [toolUrl('capture-command.mjs')]: stub('capture-command.mjs', `
    import { spawn } from 'node:child_process'; import { appendFileSync } from 'node:fs'; import path from 'node:path'; ${appendLine}
    export function runCommand(command, args, options = {}) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(Object.assign(new Error(command + ' exited ' + code), { status: code })));
      });
    }
    export async function runCapturedCommand(command, args, options = {}) { note('lock.txt', 'captured ' + args[0]); return runCommand(command, args, options); }
  `),
  [toolUrl('isolated-capture-browser.mjs')]: stub('isolated-capture-browser.mjs', `
    import { appendFileSync, readFileSync } from 'node:fs'; import path from 'node:path'; ${appendLine}
    export async function withIsolatedCaptureBrowser(serverOptions, launchOptions, run, { capture = null } = {}) {
      const scenario = JSON.parse(readFileSync(path.join(process.cwd(), 'scenario.json'), 'utf8'));
      // the capture hold (2026-10-22): the tool queues through the helper, which opens the server while queued
      if (capture) await capture.lock.acquire(capture.waitMs, { prepare: async () => {} });
      if (scenario.renderThrows) throw new Error('vite failed to start (stub)');
      let id = null;
      const page = {
        setDefaultTimeout() {}, on() {},
        async goto(url) {
          // the page loads from the address the server bound (boundOrigin), never from a configured port
          if (new URL(url).origin !== 'http://127.0.0.1:1') throw new Error('page loaded from ' + new URL(url).origin);
          id = new URL(url).searchParams.get('id'); note('render.txt', id);
        },
        async waitForFunction() {},
        async evaluate(expression) {
          if (expression === 'window.__STANDARD') return scenario.standard[id] ?? { error: 'no stub result for ' + id };
          throw new Error('unexpected evaluate ' + expression);
        },
      };
      // the CLI builds its page URL from the address the server really bound (tools/tool-page-load.mjs boundOrigin)
      const address = { address: '127.0.0.1', family: 'IPv4', port: 1 };
      return run({ server: { httpServer: { address: () => address } },
        browser: { newPage: async () => page } });
    }
  `),
};
const hooks = path.join(stubDir, 'hooks.mjs');
writeFileSync(hooks, `
  import { registerHooks } from 'node:module';
  const CLI = ${JSON.stringify(pathToFileURL(CLI).href)};
  const REDIRECTS = ${JSON.stringify(redirects)};
  registerHooks({ resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return context.parentURL === CLI && Object.hasOwn(REDIRECTS, resolved.url)
      ? { url: REDIRECTS[resolved.url], format: 'module', shortCircuit: true } : resolved;
  } });
`);

// Child tools, resolved by the CLI against its working directory. Each notes that it ran; the two comparison tools
// would note MODEL, which no scenario may show.
const CHILD_HEADER = `import { appendFileSync, readFileSync } from 'node:fs'; import path from 'node:path'; ${appendLine}
  const scenario = JSON.parse(readFileSync(path.join(process.cwd(), 'scenario.json'), 'utf8'));`;
const CHILDREN = {
  'geometry-gate.mjs': `${CHILD_HEADER}
    note('ran.txt', 'MODEL geometry-gate'); process.exitCode = 1;`,
  'procedural-fidelity.mjs': `${CHILD_HEADER}
    note('ran.txt', 'MODEL procedural-fidelity'); process.exitCode = 1;`,
  'first-party-concept-check.mjs': `${CHILD_HEADER}
    note('ran.txt', 'concept'); process.exitCode = scenario.conceptExit ?? 0;`,
  'photo-reference-check.mjs': `${CHILD_HEADER}
    note('ran.txt', 'photo'); process.exitCode = scenario.photoExit ?? 0;`,
  'track-clip-audit.mjs': `${CHILD_HEADER}
    note('ran.txt', 'clip');
    for (const [id, [front, rear, band, shoe]] of Object.entries(scenario.clip ?? {}))
      console.log('[track-clip] ' + id.padEnd(18) + ' front ' + String(front).padStart(5) + ' rear ' + String(rear).padStart(5) +
        ' | shoe front     0 rear     0 | strict sweep ' + band + '/' + shoe);
    process.exitCode = scenario.clipExit ?? 0;`,
};

const census = mg => ({ mg, roofMg: mg, dressing: 0, invalidWeaponMarkers: 0 });
// The page's hole scan as tools/standard-check-page.html reports it since guards 229: a hull-anchored lattice raster
// (tools/contig-grid.mjs latticeCellScan, the receipts' stand-in for a real scan) with every sub-cell phase and no
// phase-only gaps, so contig-hidden.json is never consulted for these ids; the holes sit in lattice cells at (0.1, -2.3).
const PLAN = { minX: -1.8, maxX: 1.8, minZ: -3.6, maxZ: 3.6 };
const scanOf = cells => ({ ...latticeCellScan(cells, { aabb: PLAN }), clusters: [], phaseOnlyGaps: [] });
const render = (holeCells, mg) => ({ census: census(mg),
  holes: { ...scanOf(Array.from({ length: holeCells }, (_, i) => [1 + i, -39])),
    clusters: holeCells ? [{ x: 0.1, z: -2.3, cells: holeCells }] : [] } });
const BARAK_PLAN = { minX: -1.9, maxX: 1.9, minZ: -4.8, maxZ: 4.6 };
const barakRender = (extraCells, mg) => ({ census: census(mg),
  holes: { ...latticeCellScan([...BARAK_OPENING_CELLS, ...extraCells], { aabb: BARAK_PLAN }), clusters: [], phaseOnlyGaps: [] } });

// Every stage red somewhere: the concept and photo proofs, B4, B2 and B3.
const RED_EVERYWHERE = {
  conceptExit: 1, photoExit: 1,
  clip: { [NO_RECORD]: [0, 0, 0, 0], [CONCEPT]: [3, 0, 0, 0], [PHOTO]: [0, 0, 0, 0] },
  standard: { [NO_RECORD]: render(2, 0), [CONCEPT]: render(0, conceptGuns), [PHOTO]: render(0, photoGuns) },
};
const ALL_GREEN = { clip: { [NO_RECORD]: [0, 0, 0, 0] }, standard: { [NO_RECORD]: render(0, 1) } };
const BARAK_GREEN = { clip: { [BARAK]: [0, 0, 0, 0] }, standard: { [BARAK]: barakRender([], 1) } };
const BARAK_RED = { clip: { [BARAK]: [0, 0, 0, 0] }, standard: { [BARAK]: barakRender([[0, 0]], 2) } };

const HANG_GUARD_MS = 600_000;
const SCENARIOS = [];
function runScenario(name, scenario, args) {
  SCENARIOS.push(name);
  const cwd = path.join(scratch, name);
  mkdirSync(path.join(cwd, 'tools'), { recursive: true });
  mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  // The concept and photo records are read relative to the working directory: read-only access to the real ones.
  symlinkSync(path.join(REPO, 'docs/references'), path.join(cwd, 'docs/references'), 'dir');
  for (const [file, source] of Object.entries(CHILDREN)) writeFileSync(path.join(cwd, 'tools', file), source);
  writeFileSync(path.join(cwd, 'scenario.json'), JSON.stringify(scenario));
  const out = path.join(cwd, 'out');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=1024', '--import', pathToFileURL(hooks).href, CLI, ...args, `--out=${out}`],
      { cwd, env: { ...process.env, NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    // A hang guard only: a scenario finishes in seconds, so the bound is generous enough that machine load (the gate
    // runs at load 200+) can never cut a healthy child short; a killed child is named in every assertion message.
    let killed = false;
    const timer = setTimeout(() => {
      killed = true; child.kill('SIGKILL');
      // a hung grandchild (the stubs inherit these pipes) would otherwise hold 'close' open past the guard
      child.stdout.destroy(); child.stderr.destroy();
    }, HANG_GUARD_MS);
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer);
      const lines = file => existsSync(path.join(cwd, file)) ? readFileSync(path.join(cwd, file), 'utf8').trim().split('\n').filter(Boolean) : [];
      const stagesFile = path.join(out, 'stages.json');
      const reportFile = id => path.join(out, `${id}.json`);
      resolve({ name, code, killed, stdout, stderr, ran: lines('ran.txt'), rendered: lines('render.txt'), lock: lines('lock.txt'),
        report: existsSync(stagesFile) ? JSON.parse(readFileSync(stagesFile, 'utf8')) : null,
        idReport: id => existsSync(reportFile(id)) ? JSON.parse(readFileSync(reportFile(id), 'utf8')) : null });
    });
  });
}
const rowsOf = report => Object.fromEntries(report.rows.map(row => [row.id, row.stages]));
const explain = result => `${result.name}: exit ${result.code}${result.killed ? ` (killed by the ${HANG_GUARD_MS / 1000} s hang guard)` : ''}\n${result.stdout}\n${result.stderr}`;
const procedural = (clip, contiguity, decor) => ({ procedural: 'N/A', clip, contiguity, decor });

try {
  const ids = `--ids=${NO_RECORD},${CONCEPT},${PHOTO}`;
  const results = await Promise.all([
    runScenario('stages', RED_EVERYWHERE, [ids, '--gate', '--stages']),
    runScenario('default', RED_EVERYWHERE, [ids, '--gate']),
    runScenario('green', ALL_GREEN, [`--ids=${NO_RECORD}`, '--gate', '--stages']),
    runScenario('clip-crash', { clip: { [NO_RECORD]: [0, 0, 0, 0] }, clipExit: 3 }, [`--ids=${NO_RECORD}`, '--no-render', '--stages']),
    runScenario('no-render', { clip: { [NO_RECORD]: [0, 0, 0, 0], [OTHER]: [0, 0, 0, 0] } },
      [`--ids=${NO_RECORD},${OTHER}`, '--no-render', '--gate', '--stages']),
    runScenario('render-error', { ...ALL_GREEN, renderThrows: true }, [`--ids=${NO_RECORD}`, '--gate', '--stages']),
    runScenario('barak-green', BARAK_GREEN, [`--ids=${BARAK}`, '--gate', '--stages']),
    runScenario('barak-red', BARAK_RED, [`--ids=${BARAK}`, '--gate', '--stages']),
  ]);
  const [stagesRun, defaultRun, green, clipCrash, noRender, renderError, barakGreen, barakRed] = results;
  for (const result of results) {
    assert.equal(result.killed, false, explain(result));
    assert.ok(!result.lock.length || result.lock.every(line => /^(acquire|captured )/.test(line)), explain(result));
    // Owner 2026-11-12: no scenario runs an outside-model comparison, with or without --gate
    assert.deepEqual(result.ran.filter(line => line.startsWith('MODEL')), [], explain(result));
  }

  // --stages: red concept and photo proofs and a red B4 do not hide B2 and B3.
  assert.equal(stagesRun.code, 2, explain(stagesRun));
  assert.deepEqual(stagesRun.ran, ['concept', 'photo', 'clip'], explain(stagesRun));
  assert.deepEqual(stagesRun.rendered, [NO_RECORD, CONCEPT, PHOTO], `B2/B3 rendered every id after the red A stages\n${explain(stagesRun)}`);
  assert.deepEqual(rowsOf(stagesRun.report), {
    [NO_RECORD]: procedural('PASS', 'FAIL', 'FAIL'),
    [CONCEPT]: { concept: 'FAIL', clip: 'FAIL', contiguity: 'PASS', decor: 'PASS' },
    // The photo id's equipment configuration comes from its document, so B3 reads its own verdict here.
    [PHOTO]: { photo: 'FAIL', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' },
  }, explain(stagesRun));
  assert.deepEqual(stagesRun.report.summary.failedIds, [NO_RECORD, CONCEPT, PHOTO]);
  assert.deepEqual(stagesRun.report.summary.failures.map(failure => [failure.stage, failure.id]),
    [['concept', null], ['concept', CONCEPT], ['photo', null], ['photo', PHOTO]], explain(stagesRun));
  assert.match(stagesRun.stdout, /stage error\s+concept: tools\/first-party-concept-check\.mjs exited 1/, 'a stage error names its tool');
  assert.equal(stagesRun.report.gate, true);
  assert.match(stagesRun.stdout, /B2 contiguity\s+2 pass, 1 FAIL: leo2a6/);
  assert.match(stagesRun.stdout, /B3 decor\s+2 pass, 1 FAIL: leo2a6/);
  assert.match(stagesRun.stdout, /B4 track clip\s+2 pass, 1 FAIL: t72_rys/);
  assert.match(stagesRun.stdout, /--stages verdict: FAIL \(3 ids fail a gated stage, 4 stage errors\)/);
  assert.match(stagesRun.stdout, /0\/3 pass the machine-checkable gates/);

  // Without --stages the tool still stops at the first failing stage (the 226 behaviour this flag exists to avoid).
  assert.notEqual(defaultRun.code, 0, explain(defaultRun));
  assert.deepEqual(defaultRun.ran, ['concept'], explain(defaultRun));
  assert.deepEqual(defaultRun.rendered, []);
  assert.equal(defaultRun.report, null);
  assert.doesNotMatch(defaultRun.stdout, /clip f\/r\+sweep/);

  // All green stays green, under --gate, for an id with no A-stage record: N/A never fails.
  assert.equal(green.code, 0, explain(green));
  assert.deepEqual(green.ran, ['clip']);
  assert.deepEqual(green.rendered, [NO_RECORD]);
  assert.deepEqual(rowsOf(green.report), { [NO_RECORD]: procedural('PASS', 'PASS', 'PASS') });
  assert.equal(green.report.summary.passed, true);

  // A track-clip audit that dies keeps the rows it printed and still fails the run, even when every id reads PASS.
  assert.equal(clipCrash.code, 2, explain(clipCrash));
  assert.deepEqual(rowsOf(clipCrash.report), { [NO_RECORD]: procedural('PASS', 'SKIP', 'SKIP') });
  assert.deepEqual(clipCrash.report.summary.failures.map(failure => failure.stage), ['clip']);

  // --no-render skips B2/B3 (reported SKIP) and never opens the browser; skipped stages do not fail the run.
  assert.equal(noRender.code, 0, explain(noRender));
  assert.deepEqual(noRender.rendered, []);
  assert.deepEqual(noRender.lock, [], 'no capture phase ran');
  assert.deepEqual(rowsOf(noRender.report), {
    [NO_RECORD]: procedural('PASS', 'SKIP', 'SKIP'), [OTHER]: procedural('PASS', 'SKIP', 'SKIP'),
  }, explain(noRender));
  assert.equal(noRender.report.render, false);

  // A render stage that dies (lock, vite, browser) fails B2/B3 for every id and the run; the earlier stages stand.
  assert.equal(renderError.code, 2, explain(renderError));
  assert.deepEqual(renderError.rendered, []);
  assert.deepEqual(rowsOf(renderError.report), { [NO_RECORD]: procedural('PASS', 'FAIL', 'FAIL') });
  assert.deepEqual(renderError.report.summary.failures.map(failure => [failure.stage, failure.reason]),
    [['render', 'vite failed to start (stub)']]);

  // The Barak on the build alone: its pinned bow bay is its only allowed opening and its pinned roof gun its exact count.
  assert.equal(barakGreen.code, 0, explain(barakGreen));
  assert.deepEqual(rowsOf(barakGreen.report), { [BARAK]: procedural('PASS', 'PASS', 'PASS') }, explain(barakGreen));
  const barakReport = barakGreen.idReport(BARAK);
  assert.equal(barakReport.continuity.intentionalCells, BARAK_OPENING_CELLS.length);
  assert.equal(barakReport.sourceReceipt, null, 'no source model is hashed');
  assert.equal(barakReport.configuration, null, 'no source configuration is read');
  assert.deepEqual(barakReport.equipment, { passed: true, required: 1, observed: 1 });
  assert.equal(barakRed.code, 2, explain(barakRed));
  assert.deepEqual(rowsOf(barakRed.report), { [BARAK]: procedural('PASS', 'FAIL', 'FAIL') }, explain(barakRed));
} finally {
  for (const name of SCENARIOS) {
    const link = path.join(scratch, name, 'docs/references');
    try { unlinkSync(link); } catch { /* never created */ }
  }
  rmSync(scratch, { recursive: true, force: true });
}

console.log('standard-check-stages: the runner, complete per-stage summaries and the real CLI end to end — --stages runs ' +
  'every stage after red A/B4 stages and fails on any gated red or stage error; the default still stops at the first; ' +
  'no scenario reads an outside model, and the Barak passes B2/B3 on its pinned opening and roof count alone');
