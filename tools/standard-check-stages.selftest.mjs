// tank-standard-check --stages (2026-10-16, test-speed R4b part 1). Two halves:
//  1. the stage runner and summary in tools/standard-check-stages.mjs;
//  2. the real tools/tank-standard-check.mjs, end to end, in a scratch directory: its child tools (geometry gate,
//     concept and photo checks, track clip) are stubs there, and only four of the CLI's own imports are redirected
//     (the capture queue, the lock, the browser and the opening measurement), so this receipt never takes the GPU
//     lock, never opens a browser and never writes into the repository. Every policy module stays real.
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
import { readPhotoReference } from './photo-reference-record.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CLI = fileURLToPath(new URL('./tank-standard-check.mjs', import.meta.url));

// --- 1. runner and summary ------------------------------------------------------------------------------------------
{
  // Without --stages a failure propagates: the tool stops at the first failing stage, exactly as before.
  const strict = createStageRunner({ runAll: false });
  const ran = [];
  await assert.rejects(strict.run('geometry', () => { ran.push('geometry'); throw new Error('red'); }), /red/);
  await assert.rejects(strict.run('concept', async () => { ran.push('concept'); throw new Error('stale'); }, 't72_rys'), /stale/);
  assert.equal(await strict.run('clip', () => 7), 7, 'a passing stage returns its value');
  assert.deepEqual(strict.failures, [], 'the default mode records nothing: it throws');

  // With --stages a failure is recorded with its stage and id, and the next stage still runs.
  const logged = [];
  const all = createStageRunner({ runAll: true, log: line => logged.push(line) });
  const order = [];
  await all.run('geometry', async () => { order.push('geometry'); throw new Error('geometry-gate exited 1'); });
  await all.run('concept', () => { order.push('concept'); throw new Error('missing/stale concept proof'); }, 't72_rys');
  assert.equal(await all.run('clip', () => { order.push('clip'); return 'rows'; }), 'rows');
  await all.run('render', () => { order.push('render'); });
  assert.deepEqual(order, ['geometry', 'concept', 'clip', 'render'], 'every stage runs after a failing one');
  assert.deepEqual(all.failures, [
    { stage: 'geometry', id: null, reason: 'geometry-gate exited 1' },
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

  const pass = (id, a = 'geometry') => ({ id, stages: { [a]: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } });
  const ok = summarizeStages([pass('leo2a6'), pass('t72_rys', 'concept'), pass('marder2', 'photo')]);
  assert.equal(ok.passed, true);
  assert.equal(ok.exitCode, 0);
  assert.deepEqual(ok.stages.map(stage => stage.key), STANDARD_STAGES.map(stage => stage.key));
  const skipped = summarizeStages([{ id: 'leo2a6', stages: { geometry: 'N/A', clip: 'PASS', contiguity: 'SKIP', decor: 'SKIP' } }]);
  assert.equal(skipped.exitCode, 0, 'SKIP and N/A never fail a run');
  assert.deepEqual(skipped.stages.find(stage => stage.key === 'contiguity').skip, ['leo2a6']);

  // One failing B stage on one id fails the run, whatever its A stage did.
  const b2 = summarizeStages([pass('leo2a6'), { id: 'mbt70', stages: { geometry: 'FAIL', clip: 'PASS', contiguity: 'FAIL', decor: 'PASS' } }]);
  assert.equal(b2.exitCode, 2);
  assert.deepEqual(b2.failedIds, ['mbt70']);
  assert.deepEqual(b2.stages.find(stage => stage.key === 'contiguity').fail, ['mbt70']);
  // A stage that failed as a whole fails the run even when every id reads PASS.
  const errored = summarizeStages([pass('leo2a6')], [{ stage: 'geometry', id: null, reason: 'exited 1' }]);
  assert.equal(errored.passed, false);
  assert.equal(errored.exitCode, 2);

  // Completeness: a stage that was never reported, a second A stage, an unknown status or a repeated id fails loudly.
  const missing = { id: 'leo2a6', stages: { geometry: 'PASS', clip: 'PASS', decor: 'PASS' } };
  assert.throws(() => summarizeStages([missing]), /leo2a6: stage contiguity was not reported/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { geometry: 'PASS', photo: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]),
    /exactly one A stage/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]), /exactly one A stage, got none/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { geometry: 'ok', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } }]), /unknown geometry status ok/);
  assert.throws(() => summarizeStages([{ id: 'x', stages: { geometry: 'PASS', clip: 'SKIP', contiguity: 'PASS', decor: 'PASS' } }]), /always run/);
  assert.throws(() => summarizeStages([pass('leo2a6'), pass('leo2a6')]), /reported twice/);

  // The summary names every failing id: no sampling, no truncation.
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `tank_${i}`, stages: { geometry: 'PASS', clip: 'PASS', contiguity: 'FAIL', decor: 'PASS' } }));
  const lines = formatStageSummary(summarizeStages(many, [{ stage: 'render', id: null, reason: 'lock timeout' }]));
  const contiguityLine = lines.find(line => line.includes('B2 contiguity'));
  for (const row of many) assert.ok(contiguityLine.includes(row.id), `${row.id} is listed`);
  assert.ok(lines.some(line => /stage error\s+render: lock timeout/.test(line)));
  assert.match(lines.at(-1), /verdict: FAIL \(30 ids fail a gated stage, 1 stage error\)/);
}

// --- 2. the real CLI, end to end ------------------------------------------------------------------------------------
const COMPARISON = 'leo2a6', CONCEPT = 't72_rys', PHOTO = 'marder2';
// The fixture ids must stay in their classes; this receipt fails loudly if the fleet reclassifies them.
assert.deepEqual(partitionConceptIds([COMPARISON, CONCEPT, PHOTO]).concepts, [CONCEPT]);
assert.equal(isPhotoReference(PHOTO), true);
assert.equal(isPhotoReference(COMPARISON), false);
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
    export async function withIsolatedCaptureBrowser(serverOptions, launchOptions, run) {
      const scenario = JSON.parse(readFileSync(path.join(process.cwd(), 'scenario.json'), 'utf8'));
      if (scenario.renderThrows) throw new Error('vite failed to start (stub)');
      let id = null;
      const page = {
        setDefaultTimeout() {}, on() {},
        async goto(url) { id = new URL(url).searchParams.get('id'); note('render.txt', id); },
        async waitForFunction() {},
        async evaluate(expression) {
          if (expression === 'window.__STANDARD') return scenario.standard[id] ?? { error: 'no stub result for ' + id };
          throw new Error('unexpected evaluate ' + expression);
        },
      };
      return run({ server: { config: { server: { port: 1 } } }, browser: { newPage: async () => page } });
    }
  `),
  // The real measurement for every id outside the registered opening targets is exactly this policy call
  // (tools/source-opening-check.mjs measureQuality); the stub refuses the registered targets instead of guessing.
  [toolUrl('source-opening-check.mjs')]: stub('source-opening-check.mjs', `
    import { sourceOpeningsVerdict } from ${JSON.stringify(toolUrl('source-openings-policy.mjs'))};
    import { isArieteOpeningTarget } from ${JSON.stringify(toolUrl('ariete-source-openings.mjs'))};
    export async function measureSourceOpenings(id, scan) {
      if (['aft10', 'warrior_tes_h', 'merkava4_barak'].includes(id) || isArieteOpeningTarget(id))
        throw new Error(id + ': registered opening target needs the real measurement');
      return sourceOpeningsVerdict({ id, scan });
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

// Child tools, resolved by the CLI against its working directory. Each notes that it ran.
const CHILD_HEADER = `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path'; ${appendLine}
  const scenario = JSON.parse(readFileSync(path.join(process.cwd(), 'scenario.json'), 'utf8'));`;
const CHILDREN = {
  'geometry-gate.mjs': `${CHILD_HEADER}
    note('ran.txt', 'geometry');
    mkdirSync('docs/geometry-gate', { recursive: true });
    for (const [id, packet] of Object.entries(scenario.geometry ?? {}))
      writeFileSync(path.join('docs/geometry-gate', id + '.json'), JSON.stringify({ id, ...packet }));
    process.exitCode = scenario.geometryExit ?? 0;`,
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

const PASSING_PACKET = { geoMin: 95.1, requiredMinimum: 90, qualityBar: 'fleet', gatePassed: true,
  components: { hullCurves: 95.1, wholeCurves: 96, turretCurves: 97, stations: 98, dims: 99, floaters: 99 } };
const FAILING_PACKET = { ...PASSING_PACKET, geoMin: 85.2, gatePassed: false,
  components: { ...PASSING_PACKET.components, hullCurves: 85.2 } };
const census = mg => ({ mg, roofMg: mg, dressing: 0, invalidWeaponMarkers: 0 });
const render = (holeCells, mg) => ({ census: census(mg),
  holes: { holeCells, clusters: holeCells ? [{ x: 0.1, z: -2.3, cells: holeCells }] : [] } });

// Every stage red somewhere: the geometry gate, the concept and photo proofs, B4, B2 and B3.
const RED_EVERYWHERE = {
  geometry: { [COMPARISON]: FAILING_PACKET }, geometryExit: 1, conceptExit: 1, photoExit: 1,
  clip: { [COMPARISON]: [0, 0, 0, 0], [CONCEPT]: [3, 0, 0, 0], [PHOTO]: [0, 0, 0, 0] },
  standard: { [COMPARISON]: render(2, 0), [CONCEPT]: render(0, conceptGuns), [PHOTO]: render(0, photoGuns) },
};
const ALL_GREEN = {
  geometry: { [COMPARISON]: PASSING_PACKET }, clip: { [COMPARISON]: [0, 0, 0, 0] }, standard: { [COMPARISON]: render(0, 1) },
};

function runScenario(name, scenario, args, prewritten = {}) {
  const cwd = path.join(scratch, name);
  mkdirSync(path.join(cwd, 'tools'), { recursive: true });
  mkdirSync(path.join(cwd, 'docs/geometry-gate'), { recursive: true });
  // The concept and photo records are read relative to the working directory: read-only access to the real ones.
  symlinkSync(path.join(REPO, 'docs/references'), path.join(cwd, 'docs/references'), 'dir');
  for (const [file, source] of Object.entries(CHILDREN)) writeFileSync(path.join(cwd, 'tools', file), source);
  for (const [id, packet] of Object.entries(prewritten))
    writeFileSync(path.join(cwd, 'docs/geometry-gate', `${id}.json`), JSON.stringify({ id, ...packet }));
  writeFileSync(path.join(cwd, 'scenario.json'), JSON.stringify(scenario));
  const out = path.join(cwd, 'out');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=1024', '--import', pathToFileURL(hooks).href, CLI, ...args, `--out=${out}`],
      { cwd, env: { ...process.env, NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer);
      const lines = file => existsSync(path.join(cwd, file)) ? readFileSync(path.join(cwd, file), 'utf8').trim().split('\n').filter(Boolean) : [];
      const stagesFile = path.join(out, 'stages.json');
      resolve({ name, code, stdout, stderr, ran: lines('ran.txt'), rendered: lines('render.txt'), lock: lines('lock.txt'),
        report: existsSync(stagesFile) ? JSON.parse(readFileSync(stagesFile, 'utf8')) : null });
    });
  });
}
const rowsOf = report => Object.fromEntries(report.rows.map(row => [row.id, row.stages]));
const explain = result => `${result.name}: exit ${result.code}\n${result.stdout}\n${result.stderr}`;

try {
  const ids = `--ids=${COMPARISON},${CONCEPT},${PHOTO}`;
  const [stagesRun, defaultRun, green, stageError, clipCrash, noRender] = await Promise.all([
    runScenario('stages', RED_EVERYWHERE, [ids, '--gate', '--stages']),
    runScenario('default', RED_EVERYWHERE, [ids, '--gate']),
    runScenario('green', ALL_GREEN, [`--ids=${COMPARISON}`, '--gate', '--stages']),
    runScenario('stage-error', { ...ALL_GREEN, geometryExit: 1 }, [`--ids=${COMPARISON}`, '--gate', '--stages']),
    runScenario('clip-crash', { clip: { [COMPARISON]: [0, 0, 0, 0] }, clipExit: 3 }, [`--ids=${COMPARISON}`, '--no-render', '--stages'],
      { [COMPARISON]: PASSING_PACKET }),
    runScenario('no-render', { clip: { [COMPARISON]: [0, 0, 0, 0] } }, [`--ids=${COMPARISON}`, '--no-render', '--stages'],
      { [COMPARISON]: PASSING_PACKET }),
  ]);
  for (const result of [stagesRun, defaultRun, green, stageError, clipCrash, noRender])
    assert.ok(!result.lock.length || result.lock.every(line => /^(acquire|captured )/.test(line)), explain(result));

  // --stages: a red geometry gate, red concept and photo proofs and a red B4 no longer hide B2 and B3.
  assert.equal(stagesRun.code, 2, explain(stagesRun));
  assert.deepEqual(stagesRun.ran, ['geometry', 'concept', 'photo', 'clip'], explain(stagesRun));
  assert.deepEqual(stagesRun.rendered, [COMPARISON, CONCEPT, PHOTO], 'B2/B3 rendered every id after the red A stages');
  assert.deepEqual(rowsOf(stagesRun.report), {
    [COMPARISON]: { geometry: 'FAIL', clip: 'PASS', contiguity: 'FAIL', decor: 'FAIL' },
    [CONCEPT]: { concept: 'FAIL', clip: 'FAIL', contiguity: 'PASS', decor: 'PASS' },
    // The photo id's equipment configuration comes from its document, so B3 reads its own verdict here.
    [PHOTO]: { photo: 'FAIL', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' },
  }, explain(stagesRun));
  assert.deepEqual(stagesRun.report.summary.failedIds, [COMPARISON, CONCEPT, PHOTO]);
  assert.deepEqual(stagesRun.report.summary.failures.map(failure => [failure.stage, failure.id]),
    [['geometry', null], ['concept', null], ['concept', CONCEPT], ['photo', null], ['photo', PHOTO]], explain(stagesRun));
  assert.match(stagesRun.stdout, /stage error\s+geometry: tools\/geometry-gate\.mjs exited 1/, 'a stage error names its tool');
  assert.equal(stagesRun.report.gate, true);
  assert.match(stagesRun.stdout, /B2 contiguity\s+2 pass, 1 FAIL: leo2a6/);
  assert.match(stagesRun.stdout, /B3 decor\s+2 pass, 1 FAIL: leo2a6/);
  assert.match(stagesRun.stdout, /B4 track clip\s+2 pass, 1 FAIL: t72_rys/);
  assert.match(stagesRun.stdout, /--stages verdict: FAIL \(3 ids fail a gated stage, 5 stage errors\)/);
  assert.match(stagesRun.stdout, /0\/3 pass the machine-checkable gates/);

  // Without --stages the tool still stops at the first failing stage (the 226 behaviour this flag exists to avoid).
  assert.notEqual(defaultRun.code, 0, explain(defaultRun));
  assert.deepEqual(defaultRun.ran, ['geometry'], explain(defaultRun));
  assert.deepEqual(defaultRun.rendered, []);
  assert.equal(defaultRun.report, null);
  assert.doesNotMatch(defaultRun.stdout, /clip f\/r\+sweep/);

  // All green stays green: --stages adds no failure of its own.
  assert.equal(green.code, 0, explain(green));
  assert.deepEqual(green.ran, ['geometry', 'clip']);
  assert.deepEqual(green.rendered, [COMPARISON]);
  assert.deepEqual(rowsOf(green.report), { [COMPARISON]: { geometry: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } });
  assert.equal(green.report.summary.passed, true);

  // A stage that fails as a whole fails the run even when every id reads PASS.
  assert.equal(stageError.code, 2, explain(stageError));
  assert.deepEqual(rowsOf(stageError.report), { [COMPARISON]: { geometry: 'PASS', clip: 'PASS', contiguity: 'PASS', decor: 'PASS' } });
  assert.deepEqual(stageError.report.summary.failures.map(failure => failure.stage), ['geometry']);

  // A track-clip audit that dies keeps the rows it printed and still fails the run.
  assert.equal(clipCrash.code, 2, explain(clipCrash));
  assert.deepEqual(rowsOf(clipCrash.report), { [COMPARISON]: { geometry: 'PASS', clip: 'PASS', contiguity: 'SKIP', decor: 'SKIP' } });
  assert.deepEqual(clipCrash.report.summary.failures.map(failure => failure.stage), ['clip']);

  // --no-render skips B2/B3 (reported SKIP) and never opens the browser; skipped stages do not fail the run.
  assert.equal(noRender.code, 0, explain(noRender));
  assert.deepEqual(noRender.rendered, []);
  assert.deepEqual(noRender.lock, [], 'no capture phase ran');
  assert.deepEqual(rowsOf(noRender.report), { [COMPARISON]: { geometry: 'PASS', clip: 'PASS', contiguity: 'SKIP', decor: 'SKIP' } });
  assert.equal(noRender.report.render, false);
} finally {
  for (const name of ['stages', 'default', 'green', 'stage-error', 'clip-crash', 'no-render']) {
    const link = path.join(scratch, name, 'docs/references');
    try { unlinkSync(link); } catch { /* never created */ }
  }
  rmSync(scratch, { recursive: true, force: true });
}

console.log('standard-check-stages: the runner, complete per-stage summaries and the real CLI end to end — --stages runs ' +
  'every stage after red A/B4 stages and fails on any gated red or stage error; the default still stops at the first');
