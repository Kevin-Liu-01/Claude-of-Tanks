import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ts from 'typescript-compiler-api';
import { TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, TREE_SPECIES } from './treeSpecies.ts';
import { bendMangroveRoot, shapeMangroveFarStem } from './tidalMangrove.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Original jitter remains at 0823acd74e7bcf573e717f96f28ef5f1551dbef7.
// Literal also authenticated by the earlier R12 seam control; no Git needed.
const originalJitter = `function jitterRadial(
  geo: THREE.BufferGeometry,
  rng: RandomSource,
  amount: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}`;
assert.equal(createHash('sha256').update(originalJitter).digest('hex'),
  '8e925b97cc9ab4f2fcd80318de4c1bfc9856d1afe8fc356f1d8c0a68888a1c2c');
const originalMerge = `function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false) as THREE.BufferGeometry;
}`;
assert.equal(createHash('sha256').update(originalMerge).digest('hex'),
  '2b104c8be4fe3850c58be7b2ddb9b426e2cdb069410f4b1fbae14f86d70aa456');
const text = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = source.statements.filter(ts.isFunctionDeclaration);
const farNames = ['buildOakFarGeometry', 'buildPineFarGeometry', 'buildPalmFarGeometry', 'buildBirchFarGeometry'];
const callOwners = [];
for (const fn of functions) {
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'jitterFarShell') callOwners.push(fn.name.text);
    node.forEachChild(visit);
  }
  visit(fn);
}
assert.deepEqual(callOwners, [farNames[0], farNames[1], farNames[1], farNames[2], farNames[2], farNames[3]],
  'only the six far-shell callsites opt in; near palms cannot silently change');
for (const name of ['canopyJitterNoise', 'canopyCornerKey', 'jitterFarShell']) {
  const fn = functions.find(node => node.name.text === name);
  assert.ok(fn);
  function visit(node) {
    assert.ok(!ts.isNewExpression(node) && !ts.isArrayLiteralExpression(node)
      && !ts.isObjectLiteralExpression(node) && !ts.isArrowFunction(node), `${name}: no per-shell scratch allocation`);
    node.forEachChild(visit);
  }
  visit(fn.body);
}

function compile(input = text, mode = 'current') {
  const src = ts.createSourceFile('fixture.ts', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fns = src.statements.filter(ts.isFunctionDeclaration);
  const first = fns.findIndex(n => n.name.text === 'paintFlat'), last = fns.findIndex(n => n.name.text === 'buildBushCards');
  assert.ok(first >= 0 && last > first);
  const get = name => fns.find(n => n.name.text === name).getText(src).replace(/^export /, '');
  const variable = name => {
    let value;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(src) === name) {
        assert.equal(value, undefined); value = node.initializer.getText(src);
      }
      node.forEachChild(visit);
    }
    visit(src); assert.ok(value, name); return value;
  };
  const code = fns.slice(first, last + 1).map(node => {
    const name = node.name.text;
    if (mode === 'historical' && name === 'jitterRadial') return originalJitter;
    if (mode === 'historical' && name === 'jitterFarShell') return originalJitter.replace('jitterRadial', 'jitterFarShell');
    if (mode === 'historical' && name === 'mergeParts') return originalMerge;
    let code = node.getText(src).replace(/^export /, '');
    if (mode === 'near-palm' && name === 'buildPalmGeometry') {
      assert.ok(code.includes('jitterRadial(core, rng, 0.25)'));
      code = code.replace('jitterRadial(core, rng, 0.25)', 'jitterFarShell(core, rng, 0.25)');
    }
    if (mode === 'indexed' && name === 'mergeParts') return 'function mergeParts(parts) { return mergeGeometries(parts, false); }';
    if (mode === 'poisoned' && name === 'jitterFarShell') code = code.replace('  return geo;', "  geo.getAttribute('normal').array.fill(NaN);\n  return geo;");
    return code;
  }).join('\n');
  const start = input.indexOf('  const OAK_SHAPES:'), end = input.indexOf('  const foliageTex =', start);
  assert.ok(start > 0 && end > start);
  return runInNewContext(stripTypeScriptTypes(`${get('attribute')}\n${get('clamp')}\n${get('mulberry32').replace('function mulberry32(', 'function randomCore(')}
    const streams = [];
    function mulberry32(seed) {
      const next = randomCore(seed), entry = {seed, calls: 0, next}; streams.push(entry);
      return () => { entry.calls++; return next(); };
    }
    function rngReceipt() {
      const receipt = streams.map(({seed, calls, next}) => ({seed, calls, tail: [next(), next(), next(), next()]}));
      streams.length = 0; return receipt;
    }
    const BIRCH_VAR = ${variable('BIRCH_VAR')};\n${code}
    function library(seed, input) {
      const cfg = { vegetation: input }, veg = ${variable('veg')};
      ${input.slice(start, end)}
      return { SPECIES, palOf, speciesList, bushSpecies }; }
    ({library, mulberry32, randomCore, rngReceipt, buildBushCards, buildBroadleafCards, buildPalmGeometry, sphereNormals,
      jitterShell: typeof jitterFarShell === 'function' ? jitterFarShell : jitterRadial,
      ${farNames.join(',')}});`), {
    THREE, mergeGeometries, Float32Array, TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, bendMangroveRoot, shapeMangroveFarStem,
    _c: new THREE.Color(), _v3: new THREE.Vector3(), _e: new THREE.Euler(),
    _qq: new THREE.Quaternion(), _m: new THREE.Matrix4(), _scale: new THREE.Vector3(1, 1, 1),
  });
}
// Optional one-time full frozen-source replay, never a shallow-checkout dependency.
const baselinePath = process.argv.find(arg => arg.startsWith('--baseline-source='))?.slice('--baseline-source='.length);
const joinedPath = process.argv.find(arg => arg.startsWith('--joined-source='))?.slice('--joined-source='.length);
const current = compile(), historical = compile(baselinePath ? readFileSync(baselinePath, 'utf8') : text, 'historical');
const poisoned = compile(text, 'poisoned');
const frozenJoined = joinedPath ? compile(readFileSync(joinedPath, 'utf8')) : null;
function random(seed) {
  const next = current.randomCore(seed); let calls = 0;
  return { rng: () => { calls++; return next(); }, receipt: () => ({ calls, tail: [next(), next(), next(), next()] }) };
}
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function budget(g) {
  return { attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => [name,
    [a.count, a.itemSize, a.normalized, a.array.constructor.name, a.array.byteLength]])),
  index: g.index ? [g.index.count, g.index.array.constructor.name, g.index.array.byteLength] : null };
}
function exact(a, b, label) {
  assert.deepEqual(budget(a), budget(b), label + ': exact storage and draw API');
  for (const name of Object.keys(a.attributes)) assert.ok(bytes(a.attributes[name].array).equals(bytes(b.attributes[name].array)), label + '/' + name + ': exact bytes');
  assert.deepEqual(a.index?.array, b.index?.array); assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.drawRange, b.drawRange);
  assert.deepEqual(JSON.parse(JSON.stringify(a.userData)), JSON.parse(JSON.stringify(b.userData)));
  a.computeBoundingBox(); b.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingSphere();
  assert.deepEqual(a.boundingBox, b.boundingBox); assert.deepEqual(a.boundingSphere, b.boundingSphere);
}
function cornerGroups(p) {
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i);
  }
  return [...groups.values()].filter(g => g.length > 1);
}
function gap(p, groups) {
  let max = 0;
  for (const ids of groups) for (const a of ids) for (const b of ids) max = Math.max(max,
    Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b)));
  return max;
}
const joined = (g, corners) => assert.ok(gap(g.attributes.position, corners) < 1e-6, 'shared shell corners stay joined');
const factories = [() => new THREE.IcosahedronGeometry(.25, 0), () => new THREE.IcosahedronGeometry(1.5, 0),
  () => new THREE.IcosahedronGeometry(1.5, 1), () => new THREE.ConeGeometry(1.5, 3, 7, 1, true),
  () => new THREE.ConeGeometry(.8, 1.6, 9, 2, false)];
let primitives = 0;
for (const make of factories) for (const seed of [0, 1, 1337, 2049, 0xffffffff]) for (const amount of [0, .25, .28, .30, .34, .36, .40, .45, .46]) {
  const g = make(), before = g.clone(), repeat = g.clone(), old = g.clone(), corners = cornerGroups(g.attributes.position);
  const a = random(seed), b = random(seed), c = random(seed), refs = Object.values(g.attributes).map(x => x.array);
  current.jitterShell(g, a.rng, amount); current.jitterShell(repeat, b.rng, amount); historical.jitterShell(old, c.rng, amount);
  const receipt = a.receipt(); assert.deepEqual(receipt, b.receipt());
  assert.deepEqual(receipt, c.receipt(), 'exact historical RNG draw count and subsequent values');
  assert.deepEqual(budget(g), budget(before));
  assert.deepEqual(g.index?.array, before.index?.array); joined(g, corners);
  if (amount === 0) assert.deepEqual(g.attributes.position.array, before.attributes.position.array);
  assert.deepEqual(g.attributes.position.array, repeat.attributes.position.array);
  Object.values(g.attributes).forEach((x, i) => assert.equal(x.array, refs[i]));
  const p = g.attributes.position, q = before.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const radius = Math.hypot(q.getX(i), q.getZ(i)), next = Math.hypot(p.getX(i), p.getZ(i));
    assert.ok(Number.isFinite(next) && Number.isFinite(p.getY(i)));
    if (radius <= 1e-4) assert.deepEqual([p.getX(i), p.getY(i), p.getZ(i)], [q.getX(i), q.getY(i), q.getZ(i)]);
    else { assert.ok(Math.abs(next / radius - 1) <= amount + 2e-7); assert.ok(Math.abs(p.getY(i) - q.getY(i)) <= amount * .4 + 3e-7); }
  }
  for (const geometry of [g, before, repeat, old]) geometry.dispose(); primitives++;
}
const tornGaps = [];
for (const make of [factories[1], factories[3]]) {
  const g = make(), corners = cornerGroups(g.attributes.position); historical.jitterShell(g, historical.randomCore(1337), .36);
  tornGaps.push(gap(g.attributes.position, corners)); assert.throws(() => joined(g, corners), /shared shell corners/); g.dispose();
}
assert.ok(tornGaps[0] > .7 && tornGaps[1] > .15, 'authentic old physical tears remain negative evidence');

let near = 0, far = 0, bushes = 0;
function attachmentDelta(actual, old, label) {
  assert.deepEqual(budget(actual), budget(old), label + ': exact attachment storage');
  assert.deepEqual(actual.index?.array, old.index?.array);
  assert.deepEqual(actual.groups, old.groups); assert.deepEqual(actual.drawRange, old.drawRange);
  assert.deepEqual(actual.userData, old.userData);
  const p = old.attributes.position, q = actual.attributes.position;
  const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  assert.equal(new Set(Array.from({ length: p.count }, (_, i) => p.getY(i))).size, 2);
  let cap = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) === top) cap++;
    else assert.deepEqual([q.getX(i), q.getY(i), q.getZ(i)], [p.getX(i), p.getY(i), p.getZ(i)],
      label + ': exact ground ring; only the pre-existing cap may move to its changed crown');
  }
  assert.equal(cap, 30);
  for (const [name, attr] of Object.entries(actual.attributes)) {
    assert.ok(attr.array.every(Number.isFinite));
    if (name !== 'position' && name !== 'normal') assert.ok(bytes(attr.array).equals(bytes(old.attributes[name].array)), label + '/' + name);
  }
}
function compareFarPart(actual, old, poisonedNormals, held, key, label, crownAttachment) {
  assert.deepEqual(budget(actual), budget(old)); assert.deepEqual(actual.index?.array, old.index?.array);
  // Only Mangrove's willow cap follows its changed actual crown. Independent
  // packed-vertex/triangle ray containment remains in tidalMangrove.selftest.
  if (key === 'trunk' && crownAttachment) attachmentDelta(actual, old, label + '/far trunk');
  else if (key === 'trunk') exact(actual, old, label + '/far trunk');
  else {
    assert.deepEqual(actual.attributes.uv.array, old.attributes.uv.array);
    const n = actual.attributes.normal;
    for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-6);
  }
  exact(actual, poisonedNormals, label + '/all final transforms overwrite intermediate normals');
  if (held) {
    if (key === 'trunk' && crownAttachment) attachmentDelta(actual, held, label + '/frozen joined far attachment');
    else exact(actual, held, label + '/frozen joined far output');
    held.dispose();
  }
  actual.dispose(); old.dispose(); poisonedNormals.dispose();
}
function compareLibrary(seed, veg, label) {
  const a = current.library(seed, veg), b = historical.library(seed, veg), p = poisoned.library(seed, veg);
  const frozen = frozenJoined?.library(seed, veg);
  assert.deepEqual(a.speciesList, b.speciesList);
  for (const species of a.speciesList) {
    for (let k = 0; k < 3; k++) {
      const actual = a.SPECIES[species].near(k, a.palOf(species)), old = b.SPECIES[species].near(k, b.palOf(species));
      assert.deepEqual(JSON.parse(JSON.stringify(current.rngReceipt())), JSON.parse(JSON.stringify(historical.rngReceipt())),
        label + '/near exact constructor RNG tails');
      for (const key of Object.keys(actual)) { exact(actual[key], old[key], `${label}/${species}/${k}/near/${key}`); actual[key].dispose(); old[key].dispose(); }
      near++;
    }
    for (let k = 0; k < 2; k++) {
      const r = random(seed + a.SPECIES[species].farSeed + k * 101), s = random(seed + b.SPECIES[species].farSeed + k * 101), t = random(seed + a.SPECIES[species].farSeed + k * 101);
      const actual = a.SPECIES[species].far(r.rng, a.palOf(species), k), old = b.SPECIES[species].far(s.rng, b.palOf(species), k), poisonedNormals = p.SPECIES[species].far(t.rng, p.palOf(species), k);
      const receipt = r.receipt(); assert.deepEqual(receipt, s.receipt()); assert.deepEqual(receipt, t.receipt());
      const frozenRng = random(seed + a.SPECIES[species].farSeed + k * 101);
      const held = frozen?.SPECIES[species].far(frozenRng.rng, frozen.palOf(species), k);
      if (held) assert.deepEqual(receipt, frozenRng.receipt());
      for (const key of Object.keys(actual)) {
        compareFarPart(actual[key], old[key], poisonedNormals[key], held?.[key], key, label,
          species === 'willow' && veg.willowForm === 'tidalMangrove');
      }
      far++;
    }
  }
  const r = random(seed + 491), s = random(seed + 491);
  const actual = current.buildBushCards(r.rng, a.palOf(a.bushSpecies)), old = historical.buildBushCards(s.rng, b.palOf(b.bushSpecies));
  exact(actual, old, label + '/bush'); assert.deepEqual(r.receipt(), s.receipt()); actual.dispose(); old.dispose(); bushes++;
}
for (const id of MAP_IDS) compareLibrary(1337, getMapConfig(id).vegetation, id);
for (const seed of [0, 1337, 7719]) for (const snow of [0, .65]) compareLibrary(seed, {
  species: TREE_SPECIES, bushSpecies: 'oak', palettes: { pine: { snow, cardHue: .23 }, birch: { snow, cardHue: .57 },
    oak: { cardHue: .2 }, palm: { frond: { hue: .18, sat: .2, l: .4 } } },
}, `all-species/${seed}/${snow}`);

const badNear = compile(text, 'near-palm'), badIndex = compile(text, 'indexed');
const a = current.buildPalmGeometry(current.mulberry32(1337)), b = badNear.buildPalmGeometry(badNear.mulberry32(1337));
assert.throws(() => exact(a.trunk, b.trunk, 'near-palm opt-in'), /exact bytes/);
for (const g of [...Object.values(a), ...Object.values(b)]) g.dispose();
// Bush sprays now write final buffers directly. Exercise the still-merged
// broadleaf cards so the indexed-merge mutation changes the actual draw API.
const cardRng = random(77), indexedRng = random(77);
const cards = current.buildBroadleafCards(cardRng.rng, 58, 1);
const indexed = badIndex.buildBroadleafCards(indexedRng.rng, 58, 1);
assert.deepEqual(cardRng.receipt(), indexedRng.receipt(), 'index control preserves constructor RNG');
assert.equal(cards.index, null); assert.ok(indexed.index, 'mutation really retained an index');
const expanded = indexed.toNonIndexed();
try { exact(cards, expanded, 'index control expanded geometry'); } finally { expanded.dispose(); }
assert.throws(() => exact(cards, indexed, 'index regression'), /exact storage/);
for (const name of Object.keys(cards.attributes)) {
  const bad = cards.clone(); bad.attributes[name].array[0] += .125;
  assert.throws(() => exact(cards, bad, name), /exact bytes/); bad.dispose();
}
cards.dispose(); indexed.dispose();
console.log(JSON.stringify({ protocol: 'vegetation-far-seams-v1', primitives, near, far, bushes, tornGaps,
  baselineSource: baselinePath ?? 'literal original jitter/merge with current authored builders' }));
console.log('Far seams: near storage/geometry/transforms exact, far topology/RNG/budgets preserved, historical tears/near-palm/index/attribute mutations rejected. No native art or cost acceptance.');
