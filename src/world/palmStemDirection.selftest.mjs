import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { TREE_SPECIES } from './treeSpecies.ts';

const url = new URL('./vegetation.ts', import.meta.url);
const text = readFileSync(url, 'utf8');
const source = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name) {
  const matches = source.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.equal(matches.length, 1, name + ': one real declaration');
  return matches[0].getText(source);
}
function variable(name) {
  const matches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) matches.push(node.initializer);
    node.forEachChild(visit);
  }
  visit(source); assert.equal(matches.length, 1, name);
  return matches[0].getText(source);
}
function replaceOnce(code, from, to) {
  assert.equal(code.split(from).length, 2, 'one executable anchor: ' + from);
  return code.replace(from, to);
}
const owners = ['buildPalmGeometry', 'buildPalmFarGeometry'];
const axes = [
  ['seg.rotateZ(Math.atan2(Math.hypot(x1 - x0, z1 - z0), H / NSEG) * -1);',
    'seg.rotateZ(Math.atan2(x1 - x0, H / NSEG) * -1);'],
  ['seg.rotateZ(-Math.atan2(Math.hypot(x1 - x0, z1 - z0), H / NSEG));',
    'seg.rotateZ(-Math.atan2(x1 - x0, H / NSEG));'],
]; // Literal predecessor expressions from 7145bf3f1; no Git dependency in CI.
const targets = new Map(['current', 'before'].map(mode => [url.href + '?palm-direction-' + mode, mode]));
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context), mode = targets.get(href);
  if (!mode) return result;
  let code = result.source.toString();
  assert.equal(code, text, 'execute the complete current module, not a copied builder');
  owners.forEach((name, index) => {
    const original = declaration(name);
    const axis = axes[index];
    let observed = replaceOnce(original, axis[0], mode === 'before' ? axis[1] : axis[0]);
    const translation = 'seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);';
    observed = replaceOnce(observed, translation, translation + '\n' +
      'palmSegments.push({geometry: seg, start: [x0, t0 * H, z0], end: [x1, t1 * H, z1]});');
    code = replaceOnce(code, original, observed);
  });
  const merge = declaration('mergeParts');
  code = replaceOnce(code, merge, replaceOnce(merge, '  return mergeGeometries(',
    '  palmParts.push(parts);\n  return mergeGeometries('));
  return { ...result, source: code + `
    const palmSegments = [], palmParts = [];
    export const palmVariantsForTest = ${variable('PALM_VAR')};
    export const palmFarCountForTest = ${variable('FAR_VARIANTS')};
    export function palmBuildForTest(kind, rng, variant) {
      palmSegments.length = 0; palmParts.length = 0;
      const pair = kind === 'near' ? buildPalmGeometry(rng, {}, variant) : buildPalmFarGeometry(rng, {}, variant);
      const result = { pair, segments: palmSegments.slice(), parts: palmParts.slice() };
      palmSegments.length = 0; palmParts.length = 0;
      return result;
    }
  ` };
} });
let current, before;
try {
  current = await import(url.href + '?palm-direction-current');
  before = await import(url.href + '?palm-direction-before');
} finally { hook.deregister(); }

const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function geometryContract(a, b, exact = true) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const [name, p] of Object.entries(a.attributes)) {
    const q = b.attributes[name];
    assert.equal(p.count, q.count); assert.equal(p.itemSize, q.itemSize);
    assert.equal(p.normalized, q.normalized); assert.equal(p.array.constructor, q.array.constructor);
    assert.equal(p.array.byteLength, q.array.byteLength);
    assert.ok(p.array.every(Number.isFinite));
    if (exact || !['position', 'normal'].includes(name)) assert.ok(bytes(p.array).equals(bytes(q.array)), name);
  }
  assert.deepEqual(a.index?.array, b.index?.array);
  assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.drawRange, b.drawRange);
  assert.deepEqual(a.userData, b.userData);
}
function build(module, kind, variant, seed, heading) {
  const next = module.mulberry32(seed), rolls = [], headingIndex = kind === 'near' ? 1 : 0;
  const rng = () => {
    const original = next(), value = heading !== null && rolls.length === headingIndex
      ? heading / (Math.PI * 2) : original;
    rolls.push([original, value]); return value;
  };
  return { ...module.palmBuildForTest(kind, rng, variant), rng: { rolls, tail: [next(), next(), next()] } };
}
function capCenters(g) {
  const { radialSegments: radial, heightSegments: vertical } = g.parameters;
  const top = (radial + 1) * (vertical + 1), bottom = top + radial * 2 + 1;
  const p = g.attributes.position;
  return { top: new THREE.Vector3().fromBufferAttribute(p, top), bottom: new THREE.Vector3().fromBufferAttribute(p, bottom) };
}
function aligned(segment) {
  const { top, bottom } = capCenters(segment.geometry);
  const start = new THREE.Vector3(...segment.start), end = new THREE.Vector3(...segment.end);
  const direction = end.clone().sub(start), actual = top.clone().sub(bottom);
  assert.ok(actual.clone().normalize().distanceTo(direction.clone().normalize()) < 2e-6,
    'actual cap-center axis follows the full XZ segment direction');
  const middle = top.clone().add(bottom).multiplyScalar(.5);
  assert.ok(middle.distanceTo(start.clone().add(end).multiplyScalar(.5)) < 2e-6, 'original segment center');
  assert.ok(Math.abs(actual.length() - segment.geometry.parameters.height) < 2e-6, 'original segment length');
  // The pre-existing 4% extension encloses both joint stations, not separated caps.
  for (const station of [start, end]) {
    const fromBottom = station.clone().sub(bottom), projection = fromBottom.dot(actual) / actual.lengthSq();
    assert.ok(projection > .01 && projection < .99, 'joint station inside the actual extended stem');
    assert.ok(fromBottom.addScaledVector(actual, -projection).length() < 2e-6, 'joint lies on emitted stem axis');
  }
}
function insideClosed(g, point) {
  // Independent ray/triangle parity on the emitted flare/collar/crown, not its nominal radius.
  const ray = new THREE.Ray(point, new THREE.Vector3(.37, .61, .71).normalize());
  const p = g.attributes.position, index = g.index, hits = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const vertex = i => index ? index.getX(i) : i;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, vertex(i)); b.fromBufferAttribute(p, vertex(i + 1)); c.fromBufferAttribute(p, vertex(i + 2));
    if (ray.intersectTriangle(a, b, c, false, hit)) hits.push(hit.distanceTo(point));
  }
  hits.sort((x, y) => x - y);
  return hits.filter((distance, i) => distance > 1e-7 && (i === 0 || distance - hits[i - 1] > 1e-6)).length % 2 === 1;
}
function attachments(result, kind) {
  const first = result.segments[0], last = result.segments.at(-1);
  assert.equal(new THREE.Vector3(...first.start).lengthSq(), 0, 'root anchor unchanged (signed zero is immaterial)');
  const tip = capCenters(last.geometry).top;
  if (kind === 'near') {
    assert.ok(insideClosed(result.parts[0][0], new THREE.Vector3(...first.start)), 'actual root flare contains the stem foot');
    // Original parts: flare, four roots, six stem sections, collar, nuts/core.
    assert.ok(insideClosed(result.parts[0][11], tip), 'actual collar still encloses the emitted stem tip');
  } else {
    assert.ok(insideClosed(result.parts[1][0], tip), 'actual unchanged far crown encloses the emitted stem tip');
  }
}
function compare(a, b) {
  assert.deepEqual(a.rng, b.rng, 'identical original draw values/order and future RNG tail');
  assert.equal(a.parts.length, 2); assert.equal(b.parts.length, 2);
  assert.equal(a.segments.length, b.segments.length);
  geometryContract(a.pair.trunk, b.pair.trunk, false);
  geometryContract(a.pair.cards ?? a.pair.canopy, b.pair.cards ?? b.pair.canopy);
  const stems = new Set(a.segments.map(row => row.geometry));
  a.parts.forEach((parts, group) => {
    assert.equal(parts.length, b.parts[group].length);
    parts.forEach((g, index) => geometryContract(g, b.parts[group][index], !stems.has(g)));
  });
  a.segments.forEach((row, index) => {
    assert.deepEqual(row.geometry.parameters, b.segments[index].geometry.parameters, 'exact radii/length/topology');
    assert.deepEqual(row.start, b.segments[index].start); assert.deepEqual(row.end, b.segments[index].end);
  });
}
function dispose(result) {
  for (const g of new Set([...Object.values(result.pair), ...result.parts.flat()])) g.dispose();
}
let cases = 0, oldFailures = 0;
const headings = [null, ...Array.from({ length: 8 }, (_, i) => i * Math.PI / 4)];
function checkVariant(kind, variant, seed) {
  for (const heading of headings) {
    const a = build(current, kind, variant, seed, heading), b = build(before, kind, variant, seed, heading);
    try {
      compare(a, b); a.segments.forEach(aligned); attachments(a, kind);
      assert.equal(a.segments.length, kind === 'near' ? 6 : 3);
      if (heading === null) {
        const repeat = build(current, kind, variant, seed, heading);
        try {
          assert.deepEqual(a.rng, repeat.rng);
          geometryContract(a.pair.trunk, repeat.pair.trunk);
          geometryContract(a.pair.cards ?? a.pair.canopy, repeat.pair.cards ?? repeat.pair.canopy);
        } finally { dispose(repeat); }
      }
      if (heading !== null && heading !== 0) {
        assert.throws(() => b.segments.forEach(aligned), /actual cap-center axis/, 'the old signed-X-only tilt must fail');
        oldFailures++;
      }
      cases++;
    } finally { dispose(a); dispose(b); }
  }
}
for (const seed of [0, 2001]) {
  current.palmVariantsForTest.forEach((variant, i) => checkVariant('near', variant, seed + 81 + i * 7));
  for (let i = 0; i < current.palmFarCountForTest; i++) checkVariant('far', i, seed + 75 + i * 101);
}
for (const species of TREE_SPECIES.filter(name => name !== 'palm')) {
  const a = current.buildTreeTrunkAuditGeometry(species, 2001), b = before.buildTreeTrunkAuditGeometry(species, 2001);
  try { geometryContract(a, b); } finally { a.dispose(); b.dispose(); }
}
assert.ok(oldFailures > 0);
console.log(`palmStemDirection: ${cases} actual near/far builds; ${oldFailures} old-direction negatives; exact RNG/non-stem geometry/storage; centerline ground/crown contact PASS. No native art or performance claim.`);
