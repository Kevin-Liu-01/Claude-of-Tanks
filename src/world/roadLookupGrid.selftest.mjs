import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { beforeRoadCompletionConstructor } from '../../tools/road-constructor-history-fixture.mjs';

// Exact private declarations from origin/main at 5b322420483210485dc802bf3f40af0f250ca59e.
// Only the construction lookup algorithm is replaced; every map, elevation,
// query and retained grid stays on current main. CI requires no Git history.
const legacyLookup = `function buildRoadLookupGrid(): void {
    for (let gz = 0; gz < GN; gz++) {
      const z = gz * CELL - HALF;
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * CELL - HALF;
        const i = gz * GN + gx;
        for (let r = 0; r < roads.length; r++) {
          const nodes = roads[r];
          for (let s = 0; s < nodes.length - 1; s++) {
            const { d, t } = segDist(x, z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
            if (d < gRoadDist[i]) { gRoadDist[i] = d; gSegRoad[i] = r; gSegIdx[i] = s; gSegT[i] = t; }
          }
        }
        let cw = 0;
        for (const c of corridors) {
          const { d } = segDist(x, z, c[0], c[1], c[2], c[3]);
          cw = Math.max(cw, 1 - smoothstep(8, 30, d));
        }
        gCorridor[i] = cw;
      }
    }
  }`;
const legacyDistance = `function segDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}`;
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(legacyLookup), 'fcfd54a5b81ff74cf7fc31c445a13f2984b05119dd3366a8db970adc227e85a2');
assert.equal(sha(legacyDistance), '74a5e3afbeb8fb5b0dda372e4cb9bce2ec3b377ccf5b4ceb87223d141fa2b9f8');
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
function declaration(text, name) {
  const ast = ts.createSourceFile('terrain.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, `unique actual declaration: ${name}`);
  return matches[0];
}
const lookup = declaration(source, 'buildRoadLookupGrid').getText();
const segment = declaration(source, 'stampRoadLookupSegment').getText();
const support = ['clamp', 'smoothstep', 'segDist'].map(name => declaration(source, name).getText()).join('\n');
// Reconstruct the complete unsliced constructor at 3c2abead2. The later
// d948cb573 relief phase and d23529c05 Redrock contribution are explicitly
// projected out of this HISTORICAL source hash only. The actual current
// optimized/legacy lookup comparisons below retain both terrain additions.
// Their own playableRelief/badlandsRelief checks certify the changed terrain.
// No old golden or arbitrary source region is replaced.
function historicalHeightFieldSource(text) {
  text = beforeRoadCompletionConstructor(text);
  for (const [current, historical] of [
    ["  const redrockCanyon = cfg?.id === 'badlands' && T.redrockCanyon === true;\n", ''],
    ["  let landformPhase: 'legacy-support' | 'authored-relief' = 'legacy-support';\n", ''],
    [`    // Unlike the held decorative relief pilot, these are the actual support
    // heights from the first construction sample onward. Roads and pads below
    // therefore conform to the canyon instead of retaining obsolete mesa levels.
    if (redrockCanyon) h += sampleRedrockCanyon(x, z);
`, ''],
    ['sampleLandformHeight(form, x, z, landformPhase)', 'sampleLandformHeight(form, x, z)'],
    [`  // Explicit second phase: all legacy support targets above are frozen.
  // Exact mesh/physics and the existing one-metre live cache share this surface.
  landformPhase = 'authored-relief';
`, ''],
  ]) {
    assert.equal(text.split(current).length, 2, 'each declared historical delta occurs exactly once');
    text = text.replace(current, historical);
  }
  return text;
}
const originalHeightField = historicalHeightFieldSource(declaration(source, 'heightFieldBuildSteps').getText())
  .replace('function* heightFieldBuildSteps(', 'export function createHeightField(')
  .replace('): Generator<number, HeightField, void> {', '): HeightField {')
  .replace(/  \/\/ Count completed segments, corridor rows, support setup and range rows;\n  \/\/ this is construction progress, not elapsed-time or work-cost prediction\.\n  const totalHeightSlices = roads\.reduce\(\(sum, nodes\) => sum \+ Math\.max\(0, nodes\.length - 1\), 0\)\n    \+ GN \+ 1 \+ 129;\n  let completedHeightSlices = 0;\n/, '')
  .replace('function* buildRoadLookupGrid(): Generator<number, void, void>', 'function buildRoadLookupGrid(): void')
  .replace(/^ *yield \+\+completedHeightSlices \/ totalHeightSlices;\n/gm, '')
  .replace('yield* buildRoadLookupGrid();', 'buildRoadLookupGrid();')
  .replace('function* measureHeightRange(): Generator<number, [number, number], void>', 'function measureHeightRange(): [number, number]')
  .replace(`    for (let gz = 0; gz <= 128; gz++) {
      for (let gx = 0; gx <= 128; gx++) {
        const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }`, `    for (let gz = 0; gz <= 128; gz++) for (let gx = 0; gx <= 128; gx++) {
      const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }`)
  .replace('const [minY, maxY] = yield* measureHeightRange();', 'const [minY, maxY] = measureHeightRange();');
assert.equal(sha(originalHeightField + '\n'),
  '0767b9f0a0ceeb827665c61a57ec6313a939ad875fea7e7ff2d8fb104fc8bc36');
assert.throws(() => historicalHeightFieldSource(declaration(source, 'heightFieldBuildSteps').getText()
  .replace('sampleRedrockCanyon(x, z)', 'sampleRedrockCanyon(x, z) * 2')),
'an undeclared terrain contribution cannot disappear in historical projection');
for (const name of ['stampRoadLookupSegment', 'buildRoadLookupGrid']) {
  function inspect(node) {
    assert.ok(!ts.isNewExpression(node) && !ts.isArrayLiteralExpression(node)
      && !ts.isObjectLiteralExpression(node), `${name}: no added construction arrays/objects`);
    ts.forEachChild(node, inspect);
  }
  inspect(declaration(source, name).body);
}
function compileLookup(body, distance = support) {
  // Only repository-owned, AST-selected declarations and the literal above;
  // no CLI, downloaded, user or rendered input enters this evaluation.
  return new Function('fixture', stripTypeScriptTypes(`
    const { GN, CELL, HALF, roads, corridors, gRoadDist, gSegRoad, gSegIdx, gSegT, gCorridor } = fixture;
    let completedHeightSlices = 0;
    const totalHeightSlices = 1;
    ${distance}\n${body}
    const steps = buildRoadLookupGrid();
    if (steps) for (const _ of steps) { /* execute every current-generator write */ }`));
}
const current = compileLookup(`${segment}\n${lookup}`);
const previous = compileLookup(legacyLookup,
  `${declaration(source, 'clamp').getText()}\n${declaration(source, 'smoothstep').getText()}\n${legacyDistance}`);
function fixture(roads, Distance = Float32Array) {
  return { GN: 9, CELL: 8, HALF: 32, roads,
    corridors: [[-32, -32, 32, 32], [32, -32, -32, 32]],
    gRoadDist: new Distance(81).fill(1e9), gSegRoad: new Int16Array(81),
    gSegIdx: new Int16Array(81), gSegT: new Float32Array(81), gCorridor: new Float32Array(81) };
}
const names = ['gRoadDist', 'gSegRoad', 'gSegIdx', 'gSegT', 'gCorridor'];
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function exactFixture(factory, roads) {
  const before = JSON.stringify(roads), expected = fixture(roads), actual = fixture(roads);
  previous(expected); factory(actual);
  for (const name of names) assert.deepEqual(bytes(actual[name]), bytes(expected[name]), `exact ${name}`);
  assert.equal(JSON.stringify(roads), before, 'input coordinates/order remain unchanged');
  return actual;
}
const tie = [[[-32, 0], [32, 0]], [[-32, 0], [32, 0]]];
const zero = [[[0, 0], [0, 0]], [[-32, 24], [32, 24]]];
const first = 1 + 2 ** -24 + 2 ** -40, second = 1 + 2 ** -23 - 2 ** -40;
const rounded = [[[-32, first], [32, first]], [[-32, second], [32, second]]];
for (const roads of [tie, zero, rounded,
  [[[-32, -32], [0, 0], [0, 0], [32, 16]], [[32, -32], [-32, 32]]],
  [[[32, 32], [-32, -32]], [[-31.3, 4.7], [29.9, -8.1], [7.4, 31.2]]]]) exactFixture(current, roads);
assert.equal(exactFixture(current, tie).gSegRoad[40], 0, 'equal-distance winner remains first route');
assert.equal(exactFixture(current, zero).gSegT[40], 0, 'zero-length segment keeps t=0');
assert.equal(exactFixture(current, rounded).gSegRoad[40], 1,
  'a slightly farther distance still wins against the prior rounded-up Float32 value');
const promoted = fixture(rounded, Float64Array); current(promoted);
assert.equal(promoted.gSegRoad[40], 0, 'Float64 nearest storage is a real ownership-changing negative');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length - 1, 1, `unique mutation/tap: ${before}`);
  return text.replace(before, after);
}
assert.throws(() => exactFixture(compileLookup(`${replaceOnce(segment,
  'd < gRoadDist[i]', 'd <= gRoadDist[i]')}\n${lookup}`), tie), /exact gSegRoad/);
assert.throws(() => exactFixture(compileLookup(`${replaceOnce(segment,
  '/ l2 : 0;', '/ l2 : 0.5;')}\n${lookup}`), zero), /exact gSegT/);
assert.throws(() => exactFixture(compileLookup(`${segment}\n${replaceOnce(lookup,
  'gCorridor[i] = cw;', 'gCorridor[i] = 0;')}`), tie), /exact gCorridor/);

// Two test-only module projections tap actual complete constructors. One
// substitutes only the immutable original-main lookup and distance declarations;
// road layouts, hardstands, liquids and queries remain the same on both sides.
// Taps retain scalar digests, not grids.
async function constructor(legacy) {
  let text = source;
  if (legacy) {
    text = replaceOnce(text, lookup, legacyLookup);
    text = replaceOnce(text, declaration(source, 'segDist').getText(), legacyDistance);
    text = replaceOnce(text, '  yield* buildRoadLookupGrid();', '  buildRoadLookupGrid();');
  }
  text += '\nlet __lookupTap = (_stage: string, _grids: any): void => {};\nexport function setLookupTap(fn: typeof __lookupTap): void { __lookupTap = fn; }\n';
  const tap = stage => `__lookupTap('${stage}', { gRoadDist, gRoadElev, gSegRoad, gSegIdx, gSegT, gCorridor });`;
  const lookupCall = legacy ? '  buildRoadLookupGrid();' : '  yield* buildRoadLookupGrid();';
  text = replaceOnce(text, lookupCall, `${lookupCall}\n${tap('lookup')}`);
  const afterRoadSupport = '  gSegRoad = null; gSegIdx = null; gSegT = null;';
  text = replaceOnce(text, afterRoadSupport, `${tap('final')}\n${afterRoadSupport}`);
  const url = new URL(`./terrain.ts?selftest=road-lookup-${legacy ? 'legacy' : 'current'}`, import.meta.url).href;
  const hooks = registerHooks({ load(request, context, next) {
    return request === url ? { format: 'module-typescript', source: text, shortCircuit: true } : next(request, context);
  } });
  try { return await import(url); } finally { hooks.deregister(); }
}
const modules = [await constructor(true), await constructor(false)];
function construct(module, id, cooperative = false) {
  const snapshots = [];
  module.setLookupTap((stage, grids) => snapshots.push({ stage, grids: Object.fromEntries(
    Object.entries(grids).map(([name, array]) => [name,
      { type: array.constructor.name, length: array.length, bytes: array.byteLength, sha256: sha(bytes(array)) }])) }));
  const finish = field => {
    assert.deepEqual(snapshots.map(row => row.stage), ['lookup', 'final']);
    return { field, snapshots };
  };
  if (cooperative) {
    const fractions = [];
    return module.createHeightFieldAsync(1337, getMapConfig(id), fraction => fractions.push(fraction))
      .then(field => ({ ...finish(field), fractions }))
      .finally(() => module.setLookupTap(() => {}));
  }
  try {
    return finish(module.createHeightField(1337, getMapConfig(id)));
  } finally { module.setLookupTap(() => {}); }
}
function fieldSamples(field) {
  const samples = [];
  for (let z = -512; z <= 512; z += 32) for (let x = -512; x <= 512; x += 32) {
    const px = x + .375, pz = z + .625, normal = field.getNormalAt(px, pz);
    const values = [field.getHeightAt(px, pz), field.getHeightAtFast(px, pz), normal.x, normal.y, normal.z,
      field._roadDist(px, pz), field.getWaterMaskAt(px, pz),
      field.getWaterDepthAt(px, pz), field.getTrackSurfaceAt(px, pz)];
    assert(values.every(Number.isFinite), 'actual field samples remain finite');
    samples.push([...values, field.getGroundType(px, pz)]);
  }
  return samples;
}
const receipts = [];
for (const id of MAP_IDS) {
  const before = construct(modules[0], id), after = construct(modules[1], id);
  const paced = await construct(modules[1], id, true);
  assert.deepEqual(after.snapshots, before.snapshots, `${id}: exact raw and final grid bytes/budgets`);
  assert.deepEqual(Object.keys(after.field).sort(), Object.keys(before.field).sort(), 'same returned API');
  assert.deepEqual(after.field._layout, before.field._layout, `${id}: road layouts and placements unchanged`);
  assert.deepEqual([after.field.minY, after.field.maxY], [before.field.minY, before.field.maxY]);
  assert.deepEqual(fieldSamples(after.field), fieldSamples(before.field), `${id}: actual exact/fast/normal/water/ground output`);
  assert.deepEqual(paced.snapshots, after.snapshots, `${id}: yielded raw and final grid bytes`);
  assert.deepEqual(Object.keys(paced.field).sort(), Object.keys(after.field).sort());
  assert.deepEqual(paced.field._layout, after.field._layout);
  assert.deepEqual([paced.field.minY, paced.field.maxY], [after.field.minY, after.field.maxY]);
  assert.deepEqual(fieldSamples(paced.field), fieldSamples(after.field), `${id}: yielded exact/fast/normal/water/depth/track output`);
  const expectedSlices = after.field._layout.roads.reduce((sum, nodes) => sum + nodes.length - 1, 0) + 257 + 1 + 129;
  assert.deepEqual(paced.fractions, Array.from({ length: expectedSlices }, (_, index) => (index + 1) / expectedSlices),
    `${id}: completed segment, corridor/support/range progress is monotonic and exact`);
  const warmPoints = [{ x: 0, z: 0 }, { x: 15.75, z: 16.25, radiusM: 1 }];
  assert.deepEqual([...paced.field.warmFastTilesAround(warmPoints)], [...after.field.warmFastTilesAround(warmPoints)]);
  assert.deepEqual([...paced.field.warmFastTilesAround(warmPoints)], [], 'completed fast tiles are not rebuilt');
  receipts.push({ id, grids: 18, fieldSamples: 1089, checkpoints: expectedSlices, exact: true });
}

// Tap the actual private construction phases and generator close in memory.
// An abandoned callback cannot continue a later grid/scan or publish a field.
async function cancellationModule() {
  const generator = declaration(source, 'heightFieldBuildSteps').getText();
  const body = declaration(source, 'heightFieldBuildSteps').body.getText();
  let observed = generator.replace(body, `{ try ${body} finally { __heightClosed++; } }`);
  const stamp = '        stampRoadLookupSegment(r, s, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);';
  observed = replaceOnce(observed, stamp, stamp + "\n        __heightEvents.push('segment');");
  observed = replaceOnce(observed, '  buildRoadElevationGrid();',
    "  __heightEvents.push('support');\n  buildRoadElevationGrid();");
  observed = replaceOnce(observed, '      for (let gx = 0; gx <= 128; gx++) {',
    "      __heightEvents.push('range');\n      for (let gx = 0; gx <= 128; gx++) {");
  const text = source.replace(generator, observed)
    + '\nexport let __heightClosed = 0;\nexport const __heightEvents: string[] = [];\n';
  const url = new URL('./terrain.ts?selftest=heightfield-close', import.meta.url).href;
  const hooks = registerHooks({ load(request, context, next) {
    return request === url ? { format: 'module-typescript', source: text, shortCircuit: true } : next(request, context);
  } });
  try { return await import(url); } finally { hooks.deregister(); }
}
const observedHeight = await cancellationModule();
const urban = getMapConfig('urban');
const segments = modules[1].createLayout(urban).roads.reduce((sum, nodes) => sum + nodes.length - 1, 0);
for (const [cancelAt, asynchronous] of [[1, false], [1, true], [segments, false],
  [segments + 257, true], [segments + 258, false], [segments + 259, false],
  [segments + 259, true], [segments + 387, true]]) {
  const failure = new Error('cancel private height field'), closedBefore = observedHeight.__heightClosed;
  observedHeight.__heightEvents.length = 0;
  let ticks = 0, lastFraction = 0, published = false;
  const pending = observedHeight.createHeightFieldAsync(1337, urban, fraction => {
    lastFraction = fraction;
    if (++ticks !== cancelAt) return;
    if (asynchronous) return Promise.reject(failure);
    throw failure;
  }).then(() => { published = true; });
  await assert.rejects(pending, error => error === failure);
  assert.equal(published, false);
  assert.equal(ticks, cancelAt);
  assert.equal(lastFraction, cancelAt / (segments + 387), 'even fraction=1 remains cancellable before publication');
  assert.equal(observedHeight.__heightClosed, closedBefore + 1, 'actual delegated construction closes once');
  assert.deepEqual(observedHeight.__heightEvents, [
    ...Array(Math.min(cancelAt, segments)).fill('segment'),
    ...(cancelAt > segments + 257 ? ['support'] : []),
    ...Array(Math.max(0, cancelAt - segments - 258)).fill('range'),
  ], 'no later road/support/range work after rejection');
}
{
  let release;
  const held = new Promise(resolve => { release = resolve; });
  observedHeight.__heightEvents.length = 0;
  let ticks = 0, published = false;
  const pending = observedHeight.createHeightFieldAsync(1337, urban, () => { if (++ticks === 1) return held; })
    .then(field => { published = true; return field; });
  assert.deepEqual(observedHeight.__heightEvents, ['segment']);
  await Promise.resolve();
  assert.equal(published, false, 'a pending pacing promise cannot expose a partial field');
  assert.equal(ticks, 1);
  release();
  assert.ok((await pending).getHeightAt, 'only the completed field reaches the caller');
}
{
  const failure = new Error('original pacing failure');
  let advances = 0, closes = 0;
  const run = new Function('heightFieldBuildSteps', stripTypeScriptTypes(
    declaration(source, 'createHeightFieldAsync').getText()).replace('export ', '')
    + '\nreturn createHeightFieldAsync;')(() => ({
    next() { advances++; return { done: false, value: 0.1 }; },
    return() { closes++; throw new Error('close failed'); },
  }));
  await assert.rejects(run(1337, null, () => { throw failure; }), error => error === failure);
  assert.equal(advances, 1);
  assert.equal(closes, 1, 'failed close never masks the original callback error');
}

// Execute the actual map composition seam without geometry or source IO.
// Fine callers pace Surveying; coarse callers retain their original callbacks.
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const mapAsync = declaration(mapSource, 'createMapAsync').getText();
function mapFixture(fine, fail = false) {
  const field = { _layout: { spawns: { player: { x: 0, z: 0 } } } };
  const events = [], fractions = [], failure = new Error('cancel map surveying');
  const dependencies = {
    getMapConfig: () => urban, preloadPropModels: () => Promise.resolve(), prepareSourcedTerrain: () => ({}),
    createHeightField() { assert.equal(fine, false); events.push('sync-field'); return field; },
    async createHeightFieldAsync(_seed, _config, tick) {
      assert.equal(fine, true); events.push('field-start');
      await tick(0.5); await tick(1);
      events.push('field-complete'); return field;
    },
    requireTerrainRoot: value => value,
    async buildTerrainMeshesAsync(actual) { assert.equal(actual, field); events.push('terrain'); return { userData: {} }; },
    async createVegetationAsync(actual) { assert.equal(actual, field); events.push('vegetation'); return {}; },
    async createPropsAsync(actual) { assert.equal(actual, field); events.push('props'); return {}; },
    assembleWorld(_engine, _config, actual) { assert.equal(actual, field); events.push('assembled'); return {}; },
  };
  const run = new Function(...Object.keys(dependencies), stripTypeScriptTypes(mapAsync).replace('export ', '')
    + '\nreturn createMapAsync;')(...Object.values(dependencies));
  const pending = run({}, { mapId: 'urban' }, (label, fraction) => {
    fractions.push([label, fraction]);
    if (fail && label === 'Surveying terrain' && fraction > 0) throw failure;
  }, { fineSlices: fine });
  return { pending, events, fractions, failure };
}
for (const fine of [false, true]) {
  const h = mapFixture(fine);
  await h.pending;
  assert.deepEqual(h.events, [...(fine ? ['field-start', 'field-complete'] : ['sync-field']),
    'terrain', 'vegetation', 'props', 'assembled']);
  assert.deepEqual(h.fractions, [['Surveying terrain', 0],
    ...(fine ? [['Surveying terrain', 0.17], ['Surveying terrain', 0.34]] : []),
    ['Building terrain meshes', 0.34], ['Planting vegetation', 0.58],
    ['Placing structures', 0.82], ['Sealing the battlefield', 0.96]]);
}
{
  const h = mapFixture(true, true);
  await assert.rejects(h.pending, error => error === h.failure);
  assert.deepEqual(h.events, ['field-start'], 'cancelled surveying cannot create a terrain/GPU owner');
}
console.log('roadLookupGrid selftest: PASS', JSON.stringify({ fixtures: 5, maps: receipts }));
