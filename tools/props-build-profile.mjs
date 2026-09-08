#!/usr/bin/env node
// CPU-only, source-pinned Winter attribution. No browser, GPU or runtime edits.
// node tools/props-build-profile.mjs --root=/absolute/pinned-source --out=/absolute/new-output
// node tools/props-build-profile.mjs --selftest
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript-compiler-api';
import { createCaptureLock } from './capture-lock.mjs';

const TOOL = fileURLToPath(import.meta.url), ROOT = resolve(dirname(TOOL), '..');
const requestedRoot = process.env.COT_PROPS_PROFILE_ROOT ?? process.argv.find(arg => arg.startsWith('--root='))?.slice(7) ?? ROOT;
assert.ok(isAbsolute(requestedRoot), 'Source root must be absolute');
const SOURCE_ROOT = resolve(requestedRoot);
const PROPS = join(SOURCE_ROOT, 'src/world/props.ts');
const COLLISION = join(SOURCE_ROOT, 'src/world/structureCollision.ts');
const FIXTURE = join(SOURCE_ROOT, 'src/world/deltaPlasterPalette.selftest.mjs');
const INPUTS = Object.freeze({ mapId: 'winter', heightSeed: 1337, propsSeed: 2002,
  fineSlices: true, deviceTier: 'desktop', anisotropy: 4, expectedSlices: 121, vegetation: null });
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

function sourceIdentity() {
  const digest = createHash('sha256'); let files = 0;
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(?:ts|js|mjs|json|bin\.gz)$/.test(file)) {
        digest.update(file.slice(SOURCE_ROOT.length)).update(readFileSync(file)); files++;
      }
    }
  };
  visit(join(SOURCE_ROOT, 'src'));
  digest.update(readFileSync(join(SOURCE_ROOT, 'package-lock.json')));
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SOURCE_ROOT, encoding: 'utf8' }).trim(),
    runtimeSourceHash: digest.digest('hex'), sourceFiles: files, toolHash: hash(readFileSync(TOOL)),
    propsHash: hash(readFileSync(PROPS)), collisionHash: hash(readFileSync(COLLISION)), fixtureHash: hash(readFileSync(FIXTURE)) };
}

function totals() { return { calls: 0, inclusiveMs: 0, selfMs: 0, maxMs: 0 }; }
function addTiming(target, elapsed, self) {
  target.calls++; target.inclusiveMs += elapsed; target.selfMs += self; target.maxMs = Math.max(target.maxMs, elapsed);
}

/** Inclusive parent/child durations intentionally overlap; self durations do not.
 * Timed collision function bodies exclude argument evaluation. Props callsite
 * timers include argument evaluation and any timed descendants.
 */
export function createPropsProfiler(now = () => performance.now()) {
  const atoms = [], operations = {}, stack = [], inputCalls = new WeakMap();
  const repeatedTriangles = { uniqueInputs: 0, repeatedCalls: 0, repeatedInclusiveMs: 0 };
  let current = null;
  const begin = (operation, detail = {}) => {
    const token = { operation, detail, at: now(), childrenMs: 0 };
    stack.push(token); return token;
  };
  const end = token => {
    assert.equal(stack.pop(), token, 'Profiler operation nesting must remain balanced');
    const elapsed = now() - token.at, self = Math.max(0, elapsed - token.childrenMs);
    if (stack.length) stack.at(-1).childrenMs += elapsed;
    addTiming(operations[token.operation] ??= totals(), elapsed, self);
    if (current) {
      addTiming(current.operations[token.operation] ??= totals(), elapsed, self);
      if (Object.keys(token.detail).length && !token.detail.input && current.details.length < 48) {
        current.details.push({ operation: token.operation, ...token.detail, inclusiveMs: elapsed });
      }
    }
    if (token.detail.input) {
      const prior = inputCalls.get(token.detail.input) ?? 0;
      if (prior) { repeatedTriangles.repeatedCalls++; repeatedTriangles.repeatedInclusiveMs += elapsed; }
      else repeatedTriangles.uniqueInputs++;
      inputCalls.set(token.detail.input, prior + 1);
    }
  };
  return { atoms, operations, repeatedTriangles, begin, end,
    measure(operation, action, detail) {
      const token = begin(operation, detail);
      try { return action(); } finally { end(token); }
    },
    yieldBoundary(line) { if (current) current.endYieldLine = line; },
    next(generator) {
      assert.equal(current, null); assert.equal(stack.length, 0);
      const atom = { index: atoms.length, endYieldLine: null, operations: {}, details: [] };
      current = atom; const started = now();
      try {
        const result = generator.next();
        atom.done = result.done;
        atom.stage = result.done ? 'finalize' : result.value?.stage ?? `slice-${atom.index}`;
        atom.nextTankBuilder = result.value?.tankBuilder ?? null;
        return result;
      } finally {
        atom.synchronousMs = now() - started; atoms.push(atom); current = null;
      }
    },
  };
}

const PROP_OPERATIONS = new Set(['placePlannedBuilding', 'addCatalogExterior', 'groundFit', 'jitterBuildingUvs',
  'addStructureCollision', 'mergeInto', 'bakeTankWreck', 'bakeWreckDebris', 'mergeWreckGeometries', 'mergeGeometries',
  'deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureCollisionWithSolids', 'finalizeDestructiblePool',
  'placeGroundBlendDecals', 'dressMapExtras', 'makeGroundDecalTexture', 'makePlaster', 'makeRoofTiles', 'makeStone',
  'makeWood', 'makeStraw', 'makeStructureDetail', 'makeVehiclePaint', 'makeGrimeTexture',
  'prepareWorldStaticNightFixture', 'ensureWorldNightEmissionMask']);
const COLLISION_OPERATIONS = new Set(['collectSolids', 'deriveCollisionBands', 'collisionSource', 'mergeProjectedTriangles']);

function containingFunction(node) {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if (ts.isFunctionDeclaration(cursor) && cursor.name) return cursor.name.text;
  }
  return null;
}

/** Insert observers in memory. Original statements, argument order, RNG and
 * generator values stay intact. Original one-based yield lines are preserved
 * explicitly instead of reporting the shifted transformed-source positions.
 */
export function instrumentSource(source, kind) {
  const file = ts.createSourceFile(`${kind}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [], counts = {};
  const insert = (at, text) => edits.push({ at, text });
  const count = name => { counts[name] = (counts[name] ?? 0) + 1; };
  const line = node => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const instrumentCollision = node => {
    if (ts.isFunctionDeclaration(node) && node.body && COLLISION_OPERATIONS.has(node.name?.text)) {
      const name = node.name.text;
      const detail = name === 'mergeProjectedTriangles' ? '{ input: triangles }' : '{}';
      insert(node.body.getStart(file) + 1, `const __profileToken = globalThis.__PROPS_PROFILE.begin('collision.${name}', ${detail}); try {`);
      insert(node.body.end - 1, '} finally { globalThis.__PROPS_PROFILE.end(__profileToken); }');
      count(name);
    }
  };
  const instrumentProps = node => {
    if (ts.isYieldExpression(node) && !node.asteriskToken) {
      insert(node.getStart(file), `(globalThis.__PROPS_PROFILE.yieldBoundary(${line(node)}), `);
      insert(node.end, ')'); count('yield');
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file), owner = containingFunction(node);
      if (name === 'g.next' && owner === 'createPropsAsync') {
        edits.push({ at: node.getStart(file), text: 'globalThis.__PROPS_PROFILE.next(g)', end: node.end }); count('next');
      } else if (PROP_OPERATIONS.has(name) || ['builders[bi]', 'meta.build', 'meta.broken'].includes(name)) {
        let detail = `{ line: ${line(node)} }`;
        if (name === 'builders[bi]' || name === 'placePlannedBuilding') detail = `{ line: ${line(node)}, structure: P.plan[bi], planIndex: bi }`;
        else if (name === 'bakeTankWreck') detail = `{ line: ${line(node)}, specId, pop }`;
        else if (name === 'meta.build' || name === 'meta.broken' || name === 'finalizeDestructiblePool') detail = `{ line: ${line(node)}, pool: kind }`;
        else if (name === 'mergeGeometries' && owner === 'mergeMaterialBuckets') detail = `{ line: ${line(node)}, bucket: key, geometries: buckets[key].length }`;
        insert(node.getStart(file), `globalThis.__PROPS_PROFILE.measure(${JSON.stringify(`props.${name}`)}, () => (`);
        insert(node.end, `), ${detail})`); count(name);
      }
    }
  };
  const visit = node => {
    if (kind === 'collision') instrumentCollision(node);
    if (kind === 'props') instrumentProps(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  let transformed = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    transformed = transformed.slice(0, edit.at) + edit.text + transformed.slice(edit.end ?? edit.at);
  }
  const parsed = ts.createSourceFile(`${kind}.ts`, transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length, 0, 'Instrumentation must preserve valid source syntax');
  return { transformed, counts };
}

function installExistingCanvasFixture() {
  const source = readFileSync(FIXTURE, 'utf8');
  const file = ts.createSourceFile(FIXTURE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'installFixtureCanvas');
  assert.ok(declaration, 'Existing CPU Canvas fixture must remain discoverable');
  new Function(`return (${declaration.getText(file)})`)()();
}

function outputIdentity(props) {
  const digest = createHash('sha256'); let meshes = 0, vertices = 0;
  props.group.traverse(object => {
    if (!object.isMesh) return;
    meshes++; vertices += object.geometry.attributes.position?.count ?? 0;
    digest.update(JSON.stringify({ name: object.name, visible: object.visible, count: object.count,
      matrix: object.matrix.elements, material: object.material.customProgramCacheKey(),
      castShadow: object.castShadow, receiveShadow: object.receiveShadow }));
    for (const [key, attr] of Object.entries(object.geometry.attributes)) {
      digest.update(key).update(JSON.stringify([attr.itemSize, attr.normalized])).update(bytes(attr.array));
    }
    for (const attr of [object.geometry.index, object.instanceMatrix, object.instanceColor]) if (attr) digest.update(bytes(attr.array));
  });
  const physical = {};
  for (const key of ['obstacles', 'colliders', 'crushables', 'destructibles', 'looseRecords', 'tankWreckSpots',
    'utilityNetwork', 'utilityPolePlacements', 'decorationGroundingReceipts', 'features']) physical[key] = hash(JSON.stringify(props[key]));
  return { meshes, vertices, geometryHash: digest.digest('hex'), physical };
}

async function worker(mode) {
  assert.ok(['control', 'profile'].includes(mode));
  const profiler = createPropsProfiler(), hooks = {};
  globalThis.__PROPS_PROFILE = profiler;
  const loader = mode === 'profile' ? registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const kind = url === pathToFileURL(PROPS).href ? 'props' : url === pathToFileURL(COLLISION).href ? 'collision' : null;
    if (!kind) return result;
    const instrumented = instrumentSource(result.source.toString(), kind);
    hooks[kind] = instrumented.counts;
    return { ...result, source: instrumented.transformed };
  } }) : null;
  try {
    const { createPropsAsync, preloadPropModels } = await import(pathToFileURL(PROPS).href);
    const { createHeightField } = await import(pathToFileURL(join(SOURCE_ROOT, 'src/world/terrain.ts')).href);
    const { getMapConfig } = await import(pathToFileURL(join(SOURCE_ROOT, 'src/world/maps/index.ts')).href);
    // Exactly the existing Node fixture's local archive reader; sourced image
    // loading follows its Image fixture. Never fetch a remote asset in this probe.
    globalThis.fetch = async url => new Response(readFileSync(url));
    await preloadPropModels(); installExistingCanvasFixture();
    const config = getMapConfig(INPUTS.mapId);
    const heightStarted = performance.now();
    const field = createHeightField(INPUTS.heightSeed, config);
    const heightMs = performance.now() - heightStarted, started = performance.now(), progress = [];
    const props = await createPropsAsync(field, { anisotropy: INPUTS.anisotropy, setupShadowMaterial() {} },
      INPUTS.propsSeed, config, async (completed, total) => {
        progress.push({ completed, total }); await new Promise(resolve => setImmediate(resolve));
      }, INPUTS.fineSlices, INPUTS.vegetation);
    const propsWallMs = performance.now() - started;
    await props.sourcedTexturesReady;
    const result = { mode, pid: process.pid, heightMs, propsWallMs, buildDetail: props._buildDetail,
      progressCount: progress.length, hooks, output: outputIdentity(props),
      operations: profiler.operations, repeatedTriangles: profiler.repeatedTriangles, atoms: profiler.atoms };
    if (mode === 'profile') assert.equal(result.atoms.length, props._buildDetail.sliceCount);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { loader?.deregister(); }
}

async function runWorker(mode, output, onChild) {
  const child = spawn(process.execPath, [TOOL, `--worker=${mode}`], { cwd: SOURCE_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, COT_PROPS_PROFILE_ROOT: SOURCE_ROOT, COT_PROPS_PROFILE_OWNER_PID: String(process.pid) } });
  onChild(child); console.log(`[props-build-profile] ${mode} childPid=${child.pid}`);
  let stdout = '', stderr = '', timedOut = false, force;
  const timer = setTimeout(() => {
    timedOut = true; child.kill('SIGTERM'); force = setTimeout(() => child.kill('SIGKILL'), 3000);
  }, 120000);
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  try {
    const code = await new Promise((resolveResult, reject) => { child.once('error', reject); child.once('close', resolveResult); });
    writeFileSync(join(output, `${mode}-stderr.txt`), stderr, { flag: 'wx' });
    writeFileSync(join(output, `${mode}.json`), stdout, { flag: 'wx' });
    assert.equal(timedOut, false, `${mode} CPU worker exceeded its 120-second bound`);
    assert.equal(code, 0, `${mode} CPU worker failed; inspect its retained stderr`);
    return JSON.parse(stdout);
  } finally { clearTimeout(timer); clearTimeout(force); onChild(null); }
}

/** Keep cancellation owned until FIFO/worker drain finishes, even when the
 * operator repeats a signal. The getter never retains a stale worker handle. */
export function registerProfileCancellation(getChild, emitter = process) {
  let interrupted = false;
  const interrupt = () => { interrupted = true; getChild()?.kill('SIGTERM'); };
  emitter.on('SIGINT', interrupt); emitter.on('SIGTERM', interrupt);
  return { isInterrupted: () => interrupted,
    dispose() { emitter.off('SIGINT', interrupt); emitter.off('SIGTERM', interrupt); } };
}

async function run(output) {
  assert.ok(isAbsolute(output) && output !== resolve(output, '..'));
  assert.equal(existsSync(output), false, 'Evidence output must be new'); mkdirSync(output);
  const report = { protocol: 'winter-props-cpu-attribution-v1', ok: false, pid: process.pid,
    sourceRoot: SOURCE_ROOT, inputs: INPUTS, identity: sourceIdentity(), startedAt: new Date().toISOString(),
    limitations: ['Canvas fixture; not native raster, GPU, loading-latency or visual certification',
      'In-memory diagnostic hooks; source files and application outputs are not edited',
      'Operation inclusive timings overlap by nesting; do not sum parent and child durations',
      'Builder module waits are outside measured synchronous generator atoms',
      'Vegetation omitted: Winter props only consumes vegetation on the separate mangrove path'],
    errors: [], captureQueueTimeoutMs: 45 * 60 * 1000 };
  const write = () => writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  write();
  const lock = createCaptureLock(); let refresh, child;
  const cancellation = registerProfileCancellation(() => child);
  console.log(`[props-build-profile] pid=${process.pid} stage=capture_lock output=${output}`);
  try {
    await lock.acquire(report.captureQueueTimeoutMs);
    report.captureAcquiredAt = new Date().toISOString();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    assert.equal(cancellation.isInterrupted(), false, 'Interrupted before CPU acquisition');
    assert.deepEqual(sourceIdentity(), report.identity, 'Pinned source changed while queued');
    report.control = await runWorker('control', output, owner => { child = owner; }); write();
    assert.equal(report.control.buildDetail.sliceCount, INPUTS.expectedSlices,
      'Baseline must reproduce the native Winter 121-slice path before attribution');
    assert.equal(cancellation.isInterrupted(), false);
    report.profile = await runWorker('profile', output, owner => { child = owner; });
    assert.equal(report.profile.buildDetail.sliceCount, INPUTS.expectedSlices);
    assert.deepEqual(report.profile.output, report.control.output, 'Instrumentation must preserve geometry and physical output bytes');
    assert.deepEqual(sourceIdentity(), report.identity, 'Pinned source changed during CPU attribution');
    report.exactOrdinalMapping = true; report.outputIdentityVerified = true;
    report.topAtoms = [...report.profile.atoms].sort((a, b) => b.synchronousMs - a.synchronousMs).slice(0, 12);
    report.requestedAtoms = report.profile.atoms.filter(atom => [21, 64, 82].includes(atom.index));
  } catch (error) { report.errors.push(String(error)); }
  finally {
    clearInterval(refresh); lock.release(); report.captureLeaseReleased = true;
    cancellation.dispose();
    report.finishedAt = new Date().toISOString();
    report.ok = !cancellation.isInterrupted() && report.errors.length === 0 && report.exactOrdinalMapping && report.outputIdentityVerified;
    write();
  }
  console.log(JSON.stringify({ ok: report.ok, errors: report.errors, report: join(output, 'report.json') }));
  if (!report.ok) process.exitCode = 1;
}

function selftest() {
  let clock = 0; const profiler = createPropsProfiler(() => clock);
  profiler.measure('parent', () => { clock += 2; profiler.measure('child', () => { clock += 3; }); clock += 1; });
  assert.deepEqual(profiler.operations.parent, { calls: 1, inclusiveMs: 6, selfMs: 3, maxMs: 6 });
  assert.deepEqual(profiler.operations.child, { calls: 1, inclusiveMs: 3, selfMs: 3, maxMs: 3 });
  for (const [file, kind] of [[PROPS, 'props'], [COLLISION, 'collision']]) {
    const { counts } = instrumentSource(readFileSync(file, 'utf8'), kind);
    if (kind === 'props') { assert.equal(counts.next, 2); assert.ok(counts.yield > 20); }
    else for (const name of COLLISION_OPERATIONS) assert.equal(counts[name], 1);
  }
  console.log('props-build-profile: CPU-light instrumentation syntax and inclusive/self accounting passed; no world built');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--selftest') selftest();
  else if (args.length === 1 && args[0].startsWith('--worker=')) {
    assert.equal(process.env.COT_PROPS_PROFILE_OWNER_PID, String(process.ppid), 'CPU workers require their capture-owning parent');
    await worker(args[0].slice(9));
  } else if (args.length >= 1 && args.length <= 2 && args.every(arg => /^--(?:root|out)=/.test(arg)) && args.some(arg => arg.startsWith('--out='))) {
    await run(args.find(arg => arg.startsWith('--out=')).slice(6));
  } else { console.error('Use [--root=/absolute/pinned-source] --out=/absolute/new-output or --selftest. The parent owns the shared capture FIFO.'); process.exitCode = 2; }
}
