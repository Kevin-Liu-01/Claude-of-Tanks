#!/usr/bin/env node
// Source-pinned, CPU-only wreck attribution; runtime changes exist only in memory.
// node tools/wreck-build-profile.mjs --root=/absolute/source --out=/absolute/new-output
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript-compiler-api';
import { createCaptureLock } from './capture-lock.mjs';
import { createPropsProfiler, registerProfileCancellation } from './props-build-profile.mjs';

const TOOL = fileURLToPath(import.meta.url);
const ROOT = process.env.COT_WRECK_PROFILE_ROOT ?? process.argv.find(arg => arg.startsWith('--root='))?.slice(7);
const INPUTS = Object.freeze({ specId: 't90m', seed: 2526, pop: false, camoSeed: 4532,
  quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only', proceduralOnly: true, anisotropy: 4 });
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const BODY_STAGES = new Map([
  ['collectWreckGeometrySteps', 'collectWreckGeometry'], ['normalizeGeometry', 'normalizeGeometry'],
  ['normalizeGeometrySetSteps', 'normalizeGeometrySet'], ['mergeRequired', 'mergeRequired'],
  ['paintWreckGeometrySteps', 'paintWreckGeometry'], ['mergeShadowGeometrySteps', 'mergeShadowGeometry'],
  ['wreckBakeResult', 'wreckBakeResult'],
]);
// Both generic and pre-paint entrypoints delegate their actual compaction to
// this one body. Keep the metric single-counted whichever path is selected.
const GEOMETRY_STAGES = new Map([['compactInputSteps', 'compactWreckGeometry']]);
const CALL_STAGES = new Map([
  ['createTank', 'createTank'], ['visual.setDestroyed', 'visual.setDestroyed'], ['owner.visual.dispose', 'visual.dispose'],
]);
const FACTORY_STAGES = new Set(['boxUV', 'bakeDirt', 'mergeAll', 'buildRunningGear', 'batchMobileStaticChildren',
  'installCoplanarDepthLayers', 'fittedEraSurfaces', 'resolveTankPresentationSetup', 'createNonRenderingTankMaterials']);
const PROFILE_STAGES = new Set(['buildT90MProryvNative2026', 'buildT90MProryv', 'replaceT90MProryvHull',
  'replaceT90MProryvTurret', 'enhanceT90MProryvSurface2026', 'finishT90MProryvOwner2026', 'refineT90MProryvArmor2026']);

function identity() {
  assert.ok(ROOT && isAbsolute(ROOT), 'An explicit absolute pinned source root is required');
  const digest = createHash('sha256'); let files = 0;
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:ts|js|mjs|json|bin\.gz)$/.test(path)) {
        digest.update(path.slice(ROOT.length)).update(readFileSync(path)); files++;
      }
    }
  };
  visit(join(ROOT, 'src')); digest.update(readFileSync(join(ROOT, 'package-lock.json')));
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sourceHash: digest.digest('hex'), sourceFiles: files, toolHash: hash(readFileSync(TOOL)),
    profilerHash: hash(readFileSync(join(dirname(TOOL), 'props-build-profile.mjs'))),
    wreckHash: hash(readFileSync(join(ROOT, 'src/world/wrecks.ts'))) };
}

export function transform(source, mode, kind = 'wreck') {
  assert.ok(['control', 'normalize-first'].includes(mode));
  assert.ok(['wreck', 'geometry'].includes(kind), 'Known wreck source kind');
  const bodies = kind === 'wreck' ? BODY_STAGES : GEOMETRY_STAGES;
  const calls = kind === 'wreck' ? CALL_STAGES : new Map();
  const file = ts.createSourceFile('wrecks.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [], counts = {};
  const add = (at, text, end) => edits.push({ at, text, end });
  const count = name => { counts[name] = (counts[name] ?? 0) + 1; };
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.body && bodies.has(node.name?.text)) {
      const name = bodies.get(node.name.text);
      // This tool drains bakeTankWreck synchronously. Time the generator body,
      // not iterator creation; do not reuse these spans for an async consumer.
      let observe = name === 'normalizeGeometry'
        ? 'globalThis.__WRECK_PROFILE.observeNormalization(geometry, keepNormal);' : '';
      const begin = `const __wreckToken = globalThis.__WRECK_PROFILE.begin(${JSON.stringify(name)}); try {${observe}`;
      const end = '} finally { globalThis.__WRECK_PROFILE.end(__wreckToken); }';
      if (name === 'normalizeGeometry' && mode === 'normalize-first') {
        // The input is an owned bake clone. Preserve the original normal
        // generation, attribute ordering and conversion arithmetic; discard
        // only streams/groups/morphs which the control discards immediately.
        add(node.body.getStart(file) + 1, `${begin}
          for (const key of Object.keys(geometry.attributes)) {
            if (key !== 'position' && (!keepNormal || key !== 'normal')) geometry.deleteAttribute(key);
          }
          geometry.morphAttributes = {};
          geometry.clearGroups();
          const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
          owner?.geometries.add(normalized);
          if (keepNormal && !normalized.attributes.normal) normalized.computeVertexNormals();
          normalized.morphAttributes = {};
          normalized.clearGroups();
          return normalized;
          ${end}`, node.body.end - 1);
      } else {
        add(node.body.getStart(file) + 1, begin);
        add(node.body.end - 1, end);
      }
      count(name);
    }
    if (ts.isCallExpression(node)) {
      const name = calls.get(node.expression.getText(file));
      if (name) {
        add(node.getStart(file), `globalThis.__WRECK_PROFILE.measure(${JSON.stringify(name)}, () => (`);
        add(node.end, '))'); count(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let transformed = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    transformed = transformed.slice(0, edit.at) + edit.text + transformed.slice(edit.end ?? edit.at);
  }
  assert.equal(ts.createSourceFile('wrecks.ts', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics.length, 0);
  for (const name of [...bodies.values(), ...calls.values()]) assert.equal(counts[name], 1, `Exact ${name} hook`);
  return { source: transformed, counts };
}

export function transformConstructor(source, kind) {
  assert.ok(['factory', 'profile'].includes(kind), 'Known constructor source kind');
  const file = ts.createSourceFile(`${kind}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [], stages = {};
  const instrument = (node, label, body = false) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const key = `${kind}.${label}:${line}`;
    stages[key] = { line, expression: label };
    if (body) {
      edits.push({ at: node.body.getStart(file) + 1, text: `const __constructorToken = globalThis.__WRECK_PROFILE.begin(${JSON.stringify(key)}); try {` });
      edits.push({ at: node.body.end - 1, text: '} finally { globalThis.__WRECK_PROFILE.end(__constructorToken); }' });
    } else {
      edits.push({ at: node.getStart(file), text: `globalThis.__WRECK_PROFILE.measure(${JSON.stringify(key)}, () => (` });
      edits.push({ at: node.end, text: '))' });
    }
  };
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.body && (kind === 'factory' ? FACTORY_STAGES : PROFILE_STAGES).has(node.name?.text)) {
      instrument(node, node.name.text, true);
    }
    if (kind === 'factory' && ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      let enclosing = node.parent;
      while (enclosing && !ts.isFunctionLike(enclosing)) enclosing = enclosing.parent;
      const topStage = /^createTank\w*Stage\d+$/.test(name) && ts.isFunctionDeclaration(enclosing) && enclosing.name?.text === 'createTank';
      const explicit = ['finalizeVehicleMarkingSeats', 'applyVerifiedVehicleMarkingSeats', 'installProceduralShadowProxies',
        'normalizeTankAppearance', 'finalizeVehicleNightLighting', 'attachTankDecorations'].includes(name);
      if (topStage || explicit) instrument(node, name);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let transformed = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) transformed = transformed.slice(0, edit.at) + edit.text + transformed.slice(edit.at);
  assert.equal(ts.createSourceFile(`${kind}.ts`, transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics.length, 0);
  assert.ok(Object.keys(stages).length >= (kind === 'factory' ? 30 : PROFILE_STAGES.size), 'Expected constructor attribution coverage');
  return { source: transformed, stages };
}

function outputIdentity(baked) {
  const geometry = geo => geo ? {
    attributes: Object.fromEntries(Object.entries(geo.attributes).map(([key, attr]) => [key, {
      count: attr.count, itemSize: attr.itemSize, normalized: attr.normalized, usage: attr.usage,
      gpuType: attr.gpuType, arrayType: attr.array.constructor.name, hash: hash(bytes(attr.array)),
    }])),
    index: geo.index ? { count: geo.index.count, arrayType: geo.index.array.constructor.name, hash: hash(bytes(geo.index.array)) } : null,
    groups: geo.groups, drawRange: [geo.drawRange.start, String(geo.drawRange.count)],
    bounds: geo.boundingBox ? [geo.boundingBox.min.toArray(), geo.boundingBox.max.toArray()] : null,
  } : null;
  return { hx: baked.hx, hz: baked.hz, h: baked.h, tris: baked.tris,
    geometry: geometry(baked.geo), shadow: geometry(baked.shadowGeo) };
}

async function worker(mode) {
  const profiler = createPropsProfiler(), normalization = { calls: 0, indexed: 0, removedExpandedBytes: 0, discardedAttributes: {} };
  profiler.observeNormalization = (geometry, keepNormal) => {
    normalization.calls++;
    if (!geometry.index) return;
    normalization.indexed++;
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      if (name === 'position' || (keepNormal && name === 'normal')) continue;
      normalization.discardedAttributes[name] = (normalization.discardedAttributes[name] ?? 0) + 1;
      normalization.removedExpandedBytes += geometry.index.count * attr.itemSize * attr.array.BYTES_PER_ELEMENT;
    }
    for (const attrs of Object.values(geometry.morphAttributes)) for (const attr of attrs) {
      normalization.removedExpandedBytes += geometry.index.count * attr.itemSize * attr.array.BYTES_PER_ELEMENT;
    }
  };
  globalThis.__WRECK_PROFILE = profiler;
  const target = pathToFileURL(join(ROOT, 'src/world/wrecks.ts')).href;
  const wreckTargets = new Map([
    [target, 'wreck'], [pathToFileURL(join(ROOT, 'src/world/exactWreckGeometry.ts')).href, 'geometry'],
  ]);
  const constructorTargets = new Map([
    [pathToFileURL(join(ROOT, 'src/vehicles/tankFactoryCore.ts')).href, 'factory'],
    [pathToFileURL(join(ROOT, 'src/vehicles/profiles/t90.ts')).href, 'profile'],
  ]);
  const hooks = {}, observedModules = new Set(), constructorStages = {};
  const loader = registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (mode === 'constructor' && constructorTargets.has(url)) {
      const transformed = transformConstructor(result.source.toString(), constructorTargets.get(url));
      Object.assign(constructorStages, transformed.stages);
      return { ...result, source: transformed.source };
    }
    if (!wreckTargets.has(url)) return result;
    const kind = wreckTargets.get(url);
    assert.ok(!observedModules.has(kind), `Duplicate ${kind} module hook`);
    const transformed = transform(result.source.toString(), mode === 'constructor' ? 'control' : mode, kind);
    Object.assign(hooks, transformed.counts); observedModules.add(kind);
    return { ...result, source: transformed.source };
  } });
  let baked;
  try {
    assert.equal(typeof globalThis.document, 'undefined', 'No Canvas/browser fixture is needed for the real geometry-only bake');
    const { ensureTankBuilder } = await import(pathToFileURL(join(ROOT, 'src/vehicles/fleetFactory.ts')).href);
    const { bakeTankWreck } = await import(target);
    assert.equal(observedModules.size, 2, 'Both wreck and geometry modules must be instrumented');
    const acquisitionStart = performance.now(); await ensureTankBuilder(INPUTS.specId);
    const builderAcquisitionMs = performance.now() - acquisitionStart;
    const start = performance.now();
    baked = bakeTankWreck({ anisotropy: INPUTS.anisotropy, setupShadowMaterial() {} }, INPUTS.specId,
      { seed: INPUTS.seed, pop: INPUTS.pop });
    const bakeMs = performance.now() - start;
    assert.ok(baked, 'Exact real T-90M bake must succeed');
    for (const name of [...BODY_STAGES.values(), ...GEOMETRY_STAGES.values(), ...CALL_STAGES.values()]) {
      assert.equal(hooks[name], 1, `Exact ${name} hook`);
      assert.ok(profiler.operations[name]?.calls > 0, `Executed ${name} hook`);
    }
    process.stdout.write(`${JSON.stringify({ mode, pid: process.pid, builderAcquisitionMs, bakeMs,
      operations: profiler.operations, normalization, hooks, constructorStages, output: outputIdentity(baked) })}\n`);
  } finally { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); loader.deregister(); }
}

async function runWorker(mode, ordinal, output, onChild) {
  const child = spawn(process.execPath, [TOOL, `--worker=${mode}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, COT_WRECK_PROFILE_ROOT: ROOT, COT_WRECK_PROFILE_OWNER_PID: String(process.pid) } });
  onChild(child); console.log(`[wreck-build-profile] sample=${ordinal} mode=${mode} childPid=${child.pid}`);
  let stdout = '', stderr = '', force, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); force = setTimeout(() => child.kill('SIGKILL'), 3000); }, 30000);
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  try {
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
    const stem = `${ordinal}-${mode}`;
    writeFileSync(join(output, `${stem}.json`), stdout, { flag: 'wx' });
    writeFileSync(join(output, `${stem}-stderr.txt`), stderr, { flag: 'wx' });
    assert.equal(timedOut, false, 'Worker exceeded its 30-second bound'); assert.equal(code, 0, `Failed ${stem}`);
    return JSON.parse(stdout);
  } finally { clearTimeout(timer); clearTimeout(force); onChild(null); }
}

async function run(output, constructorOnly = false) {
  assert.ok(isAbsolute(output)); assert.equal(existsSync(output), false, 'Output must be new');
  const pinned = identity(); mkdirSync(output);
  const report = { protocol: 'exact-wreck-cpu-profile-v1', pid: process.pid, sourceRoot: ROOT,
    inputs: INPUTS, identity: pinned, startedAt: new Date().toISOString(), samples: [], errors: [],
    limitations: ['Node CPU diagnostic; not native GPU, raster, loading or visual evidence',
      'Constructor modules acquired before each measured bake; fresh processes, no warmed repeat builds',
      'Inclusive stages overlap; self durations exclude instrumented descendants',
      'Generator-body spans require the synchronous bakeTankWreck drain; async suspension is not measured',
      'Compaction spans cover the shared compactInputSteps body, excluding entrypoint eligibility checks',
      'Control and normalization-only candidate modify source in memory; no runtime files are changed'] };
  const write = () => writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lock = createCaptureLock(); let refresh, child;
  const cancellation = registerProfileCancellation(() => child);
  write();
  console.log(`[wreck-build-profile] pid=${process.pid} stage=capture_lock output=${output}`);
  try {
    await lock.acquire(45 * 60 * 1000);
    report.captureAcquiredAt = new Date().toISOString(); write();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    assert.equal(cancellation.isInterrupted(), false, 'Interrupted while queued (lock admission itself is not abortable)');
    assert.deepEqual(identity(), pinned, 'Pinned source changed while queued');
    // Reverse the middle pair to reduce simple order bias. Every sample has
    // its own process/module/cache lifetime, and the entire job is bounded.
    const modes = constructorOnly ? ['control', 'constructor']
      : ['control', 'normalize-first', 'normalize-first', 'control', 'control', 'normalize-first'];
    for (const mode of modes) {
      assert.equal(cancellation.isInterrupted(), false);
      report.samples.push(await runWorker(mode, report.samples.length + 1, output, owner => { child = owner; })); write();
    }
    for (const sample of report.samples) assert.deepEqual(sample.output, report.samples[0].output, 'Exact geometry/index/color/shadow/bounds output');
    assert.deepEqual(identity(), pinned, 'Pinned source changed during attribution');
    report.outputIdentityVerified = true;
  } catch (error) { report.errors.push(String(error)); }
  finally {
    clearInterval(refresh); lock.release(); report.captureLeaseReleased = true;
    cancellation.dispose();
    report.finishedAt = new Date().toISOString(); report.ok = !cancellation.isInterrupted() && !report.errors.length && report.outputIdentityVerified === true; write();
  }
  console.log(JSON.stringify({ ok: report.ok, errors: report.errors, report: join(output, 'report.json') }));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0].startsWith('--worker=')) {
    assert.equal(process.env.COT_WRECK_PROFILE_OWNER_PID, String(process.ppid), 'Worker requires capture-owning parent');
    await worker(args[0].slice(9));
  } else if ([2, 3].includes(args.length) && args.every(arg => /^--(?:root|out)=/.test(arg) || arg === '--constructor')
    && args.some(arg => arg.startsWith('--root=')) && args.some(arg => arg.startsWith('--out='))) {
    await run(args.find(arg => arg.startsWith('--out=')).slice(6), args.includes('--constructor'));
  } else if (args.length === 2 && args.includes('--selftest') && args.some(arg => arg.startsWith('--root='))) {
    const source = readFileSync(join(ROOT, 'src/world/wrecks.ts'), 'utf8');
    const geometrySource = readFileSync(join(ROOT, 'src/world/exactWreckGeometry.ts'), 'utf8');
    for (const mode of ['control', 'normalize-first']) {
      transform(source, mode);
      transform(geometrySource, mode, 'geometry');
    }
    transformConstructor(readFileSync(join(ROOT, 'src/vehicles/tankFactoryCore.ts'), 'utf8'), 'factory');
    transformConstructor(readFileSync(join(ROOT, 'src/vehicles/profiles/t90.ts'), 'utf8'), 'profile');
    console.log('wreck-build-profile: exact hooks and in-memory candidate syntax pass; no tank built');
  } else { console.error('Use --root=/absolute/pinned-source --out=/absolute/new-output (or --selftest instead of --out).'); process.exitCode = 2; }
}
