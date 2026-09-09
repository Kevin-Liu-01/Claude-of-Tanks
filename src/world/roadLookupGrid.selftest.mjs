import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

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
    ${distance}\n${body}\nbuildRoadLookupGrid();`));
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
  }
  text += '\nlet __lookupTap = (_stage: string, _grids: any): void => {};\nexport function setLookupTap(fn: typeof __lookupTap): void { __lookupTap = fn; }\n';
  const tap = stage => `__lookupTap('${stage}', { gRoadDist, gRoadElev, gSegRoad, gSegIdx, gSegT, gCorridor });`;
  text = replaceOnce(text, '  buildRoadLookupGrid();', `  buildRoadLookupGrid();\n${tap('lookup')}`);
  const afterRoadSupport = '  // --- lake sheet levels (pipeline without lakes/pads), then spawn pads ---';
  text = replaceOnce(text, afterRoadSupport, `${tap('final')}\n${afterRoadSupport}`);
  const url = new URL(`./terrain.ts?selftest=road-lookup-${legacy ? 'legacy' : 'current'}`, import.meta.url).href;
  const hooks = registerHooks({ load(request, context, next) {
    return request === url ? { format: 'module-typescript', source: text, shortCircuit: true } : next(request, context);
  } });
  try { return await import(url); } finally { hooks.deregister(); }
}
const modules = [await constructor(true), await constructor(false)];
function construct(module, id) {
  const snapshots = [];
  module.setLookupTap((stage, grids) => snapshots.push({ stage, grids: Object.fromEntries(
    Object.entries(grids).map(([name, array]) => [name,
      { type: array.constructor.name, length: array.length, bytes: array.byteLength, sha256: sha(bytes(array)) }])) }));
  try {
    const field = module.createHeightField(1337, getMapConfig(id));
    assert.deepEqual(snapshots.map(row => row.stage), ['lookup', 'final']);
    return { field, snapshots };
  } finally { module.setLookupTap(() => {}); }
}
function fieldSamples(field) {
  const samples = [];
  for (let z = -512; z <= 512; z += 32) for (let x = -512; x <= 512; x += 32) {
    const px = x + .375, pz = z + .625, normal = field.getNormalAt(px, pz);
    const values = [field.getHeightAt(px, pz), field.getHeightAtFast(px, pz), normal.x, normal.y, normal.z,
      field._roadDist(px, pz), field.getWaterMaskAt(px, pz)];
    assert(values.every(Number.isFinite), 'actual field samples remain finite');
    samples.push([...values, field.getGroundType(px, pz)]);
  }
  return samples;
}
const receipts = [];
for (const id of MAP_IDS) {
  const before = construct(modules[0], id), after = construct(modules[1], id);
  assert.deepEqual(after.snapshots, before.snapshots, `${id}: exact raw and final grid bytes/budgets`);
  assert.deepEqual(Object.keys(after.field).sort(), Object.keys(before.field).sort(), 'same returned API');
  assert.deepEqual(after.field._layout, before.field._layout, `${id}: road layouts and placements unchanged`);
  assert.deepEqual([after.field.minY, after.field.maxY], [before.field.minY, before.field.maxY]);
  assert.deepEqual(fieldSamples(after.field), fieldSamples(before.field), `${id}: actual exact/fast/normal/water/ground output`);
  receipts.push({ id, grids: 12, fieldSamples: 1089, exact: true });
}
console.log('roadLookupGrid selftest: PASS', JSON.stringify({ fixtures: 5, maps: receipts }));
