import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

// Independent original math from tankFactoryCore.ts at published
// 47e86743d098b868513aa841a9e9c00675ad49fd, unchanged through R9 before
// scratch reuse. Inline intentionally: a shallow CI checkout needs no git
// history. Do not regenerate this oracle from the candidate implementation.
function originalDistance(point, plate) {
  const verts = plate.verts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (verts.length < 3) return Infinity;
  const closest = new THREE.Vector3();
  let best = Infinity;
  for (let index = 1; index + 1 < verts.length; index++) {
    const triangle = new THREE.Triangle(verts[0], verts[index], verts[index + 1]);
    triangle.closestPointToPoint(point, closest);
    best = Math.min(best, closest.distanceTo(point));
  }
  return best;
}
function originalNearest(point, candidates) {
  let selected = candidates[0];
  let distanceM = originalDistance(point, selected);
  for (let index = 1; index < candidates.length; index++) {
    const distance = originalDistance(point, candidates[index]);
    if (distance < distanceM) { selected = candidates[index]; distanceM = distance; }
  }
  return { plate: selected, distanceM };
}

const source = readFileSync(new URL('./tankFactoryCore.ts', import.meta.url), 'utf8');
const names = ['plateDistanceTriangle', 'plateDistanceClosest', 'pointToPlateDistance', 'nearestEraPlate'];
function load(actualSource = source, three = THREE) {
  const tree = ts.createSourceFile('tankFactoryCore.ts', actualSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) declarations.push(node);
    node.forEachChild(visit);
  };
  visit(tree);
  for (const name of names) assert.equal(declarations.filter(node => node.name.text === name).length, 1, `${name}: exact production declaration`);
  const code = ts.transpileModule(declarations.map(node => `const ${node.getText(tree)};`).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('THREE', `${code}\nreturn { distance: pointToPlateDistance, nearest: nearestEraPlate, triangle: plateDistanceTriangle, closest: plateDistanceClosest };`)(three);
}

const plate = verts => ({ verts });
const point = (x, y, z) => new THREE.Vector3(x, y, z);
const fixed = [
  plate([]), plate([[0, 0, 0]]), plate([[0, 0, 0], [1, 0, 0]]),
  plate([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
  plate([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]),
  plate([[0, 0, 0], [1, 0, 0], [0, 1, 0]]),
  plate([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]),
  plate([[0, 0, 0], [2, 0, 0], [0.5, 0.5, 1], [2, 2, 0], [0, 2, 0]]),
  plate([[NaN, 0, 0], [1, 0, 0], [0, 1, 0]]),
  plate([[Infinity, 0, 0], [1, 0, 0], [0, 1, 0]]),
];
const points = [point(0, 0, 0), point(0.2, 0.3, 0), point(0.2, 0.3, 2),
  point(-2, 4, -1), point(1e-12, -1e-12, 1e-12), point(1e9, -1e9, 3)];
let randomState = 0x1749ab3f;
const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 0x100000000; };
const randomPlates = Array.from({ length: 64 }, (_, index) => plate(Array.from({ length: index % 10 }, () =>
  [(random() - 0.5) * 30, (random() - 0.5) * 30, (random() - 0.5) * 30])));
const randomPoints = Array.from({ length: 16 }, () => point((random() - 0.5) * 50, (random() - 0.5) * 50, (random() - 0.5) * 50));
const cases = [...fixed, ...randomPlates], allPoints = [...points, ...randomPoints];

function verifyNumbers(api) {
  for (const candidate of cases) for (const location of allPoints) {
    assert.equal(api.distance(location, candidate), originalDistance(location, candidate), 'exact fan distance, including NaN/Infinity semantics');
  }
  for (let index = 0; index < randomPlates.length - 4; index++) {
    const candidates = randomPlates.slice(index, index + 5), location = allPoints[index % allPoints.length];
    const expected = originalNearest(location, candidates), actual = api.nearest(location, candidates);
    assert.equal(actual.plate, expected.plate, 'nearest plate identity and original order');
    assert.equal(actual.distanceM, expected.distanceM, 'nearest exact distance');
  }
  const tie = [fixed[5], plate(fixed[5].verts.map(vertex => [...vertex]))];
  assert.equal(api.nearest(point(0.1, 0.1, 1), tie).plate, tie[0], 'equal distances retain first candidate');
  assert.throws(() => api.nearest(points[0], []), TypeError, 'existing empty-candidate error is not converted to success');
}
const first = load(), second = load();
verifyNumbers(first);
assert.notEqual(first.triangle, second.triangle, 'separate build owners do not share scratch triangles');
assert.notEqual(first.closest, second.closest, 'separate build owners do not share closest-point scratch');
const mutable = plate([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
for (let index = 0; index < 12; index++) {
  mutable.verts[index % 3][2] += 0.25;
  assert.equal(first.distance(points[2], mutable), originalDistance(points[2], mutable));
  second.distance(points[3], fixed[7]);
  assert.equal(first.distance(points[2], mutable), originalDistance(points[2], mutable), 'interleaved build calls preserve current inputs');
}
mutable.verts = [[3, 0, 0], [3, 1, 0], [3, 0, 1], [3, 1, 1]];
assert.equal(first.distance(points[0], mutable), originalDistance(points[0], mutable), 'whole vertex-array replacement is observed');

let vectors = 0, triangles = 0;
class CountedVector extends THREE.Vector3 { constructor(...args) { super(...args); vectors++; } }
class CountedTriangle extends THREE.Triangle { constructor(...args) { super(...args); triangles++; } }
const counted = load(source, { ...THREE, Vector3: CountedVector, Triangle: CountedTriangle });
const acquired = { vectors, triangles };
assert.deepEqual(acquired, { vectors: 1, triangles: 1 }, 'one explicit closest vector and triangle per build owner');
for (const candidate of cases) for (const location of points) counted.distance(location, candidate);
assert.deepEqual({ vectors, triangles }, acquired, 'distance calls allocate no new Vector3 or Triangle');

function mutateDeclaration(name, before, after) {
  const tree = ts.createSourceFile('tankFactoryCore.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declaration = node;
    node.forEachChild(visit);
  };
  visit(tree);
  assert.ok(declaration);
  const text = declaration.getText(tree);
  assert.equal(text.split(before).length, 2, 'negative control mutates exactly one actual declaration anchor');
  return source.slice(0, declaration.getStart(tree)) + text.replace(before, after) + source.slice(declaration.end);
}
for (const [name, before, after] of [
  ['pointToPlateDistance', 'verts.length < 3', 'verts.length < 4'],
  ['pointToPlateDistance', 'index + 1 < verts.length', 'index + 2 < verts.length'],
  ['pointToPlateDistance', 'Math.min(best,', 'Math.max(best,'],
  ['pointToPlateDistance', 'plateDistanceClosest.distanceTo(point)', 'plateDistanceClosest.distanceToSquared(point)'],
  ['pointToPlateDistance', 'plateDistanceTriangle.a.fromArray(verts[0]);', 'plateDistanceTriangle.a.set(0, 0, 0);'],
  ['nearestEraPlate', 'candidateDistanceM < seatDistanceM', 'candidateDistanceM <= seatDistanceM'],
]) assert.throws(() => verifyNumbers(load(mutateDeclaration(name, before, after))), assert.AssertionError,
  `${name}: wrong distance/fan/tie policy must fail the independent oracle`);

console.log(`plateDistanceScratch.selftest: exact original distances for ${cases.length * allPoints.length} cases, nearest identity/ties, live input mutation, build-local allocation ownership and six negative controls passed`);
