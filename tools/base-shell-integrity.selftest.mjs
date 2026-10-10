import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { shellPart } from './base-shell-audit-math.mjs';
import { properSurfaceCrossings, shellEdgeTopology } from './base-shell-integrity.mjs';
import { baseShellAuditScope, baseShellInputFingerprint } from './base-shell-audit-inputs.mjs';
import { sectionSolid } from '../src/vehicles/profiles/sectionSolid.ts';

function partFromTriangles(triangles) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(triangles.flat(2), 3));
  const part = shellPart(geometry); geometry.dispose(); return part;
}

// An independent exhaustive oracle uses finite segment/plane intersections
// and barycentric containment, rather than the sweep's AABB and Ray predicate.
function exhaustiveCrossings(part) {
  const tolerance = .00002, result = [];
  const key = p => p.map(n => Math.round(n * 1e6)).join(',');
  const planeDistances = (a, b) => {
    const normal = b.triangle.getNormal(new Vector3());
    return a.points.map(p => new Vector3(...p).sub(b.triangle.a).dot(normal));
  };
  const intersections = (a, b, distances) => {
    const points = [];
    for (let k = 0; k < 3; k++) {
      const start = new Vector3(...a.points[k]), end = new Vector3(...a.points[(k + 1) % 3]);
      const fraction = distances[k] / (distances[k] - distances[(k + 1) % 3]);
      const length = start.distanceTo(end);
      if (!(fraction >= 0 && fraction <= 1 && length > tolerance)) continue;
      const point = start.lerp(end, fraction);
      if (b.triangle.containsPoint(point)) points.push(point);
    }
    return points;
  };
  for (let i = 0; i < part.triangles.length; i++) for (let j = i + 1; j < part.triangles.length; j++) {
    const a = part.triangles[i], b = part.triangles[j];
    if (a.points.some(p => b.points.some(q => key(p) === key(q)))) continue;
    const ab = planeDistances(a, b), ba = planeDistances(b, a);
    if (![ab, ba].every(d => Math.min(...d) < -tolerance && Math.max(...d) > tolerance)) continue;
    const points = [...intersections(a, b, ab), ...intersections(b, a, ba)];
    if (points.some(p => points.some(q => p.distanceTo(q) > tolerance))) result.push([i, j]);
  }
  return result;
}

const crossing = [[[-1, 0, -1], [1, 0, -1], [0, 0, 1]],
  [[0, -1, -.5], [0, 1, -.5], [.2, 0, .5]]];
const distant = Array.from({ length: 260 }, (_, i) => [[20 + 3 * i, 0, 0], [21 + 3 * i, 0, 0], [20 + 3 * i, 1, 0]]);
const large = partFromTriangles([...distant, ...crossing]);
assert.equal(large.triangles.length, 262);
assert.deepEqual(properSurfaceCrossings(large).map(hit => hit.triangles), [[260, 261]],
  'the crossing at the end of a large shell must not be skipped');
const scattered = Array.from({ length: 34 }, (_, i) => {
  const a = i * .71, b = i * .37, x = Math.sin(i * .43) * .8;
  return [[x + Math.cos(a), Math.sin(a), Math.sin(b)],
    [x - Math.cos(a), -Math.sin(a), Math.sin(b)], [x, Math.cos(b), -Math.sin(b) - .3]];
});
for (const triangles of [scattered, [...scattered].reverse(), [...scattered.slice(9), ...scattered.slice(0, 9)]]) {
  const part = partFromTriangles(triangles), expected = exhaustiveCrossings(part);
  assert.ok(expected.length > 10, 'independent oracle exercises multiple crossings');
  assert.deepEqual(properSurfaceCrossings(part).map(hit => hit.triangles), expected,
    'sweep must agree with exhaustive finite triangle intersections after input permutation');
}
assert.equal(properSurfaceCrossings(partFromTriangles(distant)).length, 0, 'separated stock remains clear');
assert.equal(properSurfaceCrossings(partFromTriangles([
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [-1, 0, 1], [0, -1, -1]],
])).length, 0, 'a shared corner is outside the proper-crossing predicate');

// Actual Dragun roof join: a source section vertex terminates in the next
// section's cap edge. Both plane tests straddle, but the overlap has zero
// length. Moving the joining vertex across that edge creates a true piercing
// segment, so this is not an unconditional exception for a vehicle or seam.
const joined = [
 [[.3865319788455963,.354111909866333,.8748629689216614],
  [.2316824495792389,.5222740173339844,.8748629689216614],
  [.21676677465438843,.4950000047683716,.9089999794960022]],
 [[.46799999475479126,.4950000047683716,.9089999794960022],
  [-.46799999475479126,.4950000047683716,.9089999794960022],
  [-.3059999942779541,.4410000145435333,1.3949999809265137]],
];
for(const faces of [joined, [...joined].reverse()]){
 const part=partFromTriangles(faces);
 assert.equal(properSurfaceCrossings(part).length,0,'native vertex-on-edge cap seam is not a through-face crossing');
 assert.deepEqual(exhaustiveCrossings(part),[],'independent finite segment oracle agrees');
}
const piercing=structuredClone(joined);piercing[0][2][2]+=.025;
assert.equal(properSurfaceCrossings(partFromTriangles(piercing)).length,1,'crossing beyond the same cap edge remains detected');
assert.deepEqual(exhaustiveCrossings(partFromTriangles(piercing)),[[0,1]]);

// Near-collinear datums can become zero-area Earcut triangles after Float32
// emission. The opt-in repair preserves the contour in real cap triangles.
const ring = [[-1, 0], [1, 0], [1, 1], [.4, 1], [.2, .999999999999], [0, 1], [-1, 1]];
const rows = [{ z: -1, ring }, { z: 1, ring }];
const old = sectionSolid(rows), fixed = sectionSolid(rows, { preserveCapBoundary: true });
assert.ok(shellEdgeTopology(shellPart(old)).boundary > 0, 'old zero-area cap is a real open-edge control');
const fixedPart = shellPart(fixed);
assert.deepEqual(shellEdgeTopology(fixedPart), { boundary: 0, nonmanifold: 0, inconsistent: 0 });
assert.ok(Math.abs(fixedPart.volume - 4) < 1e-6, 'cap repair does not change the enclosed rectangular volume');
for (const z of [-1, 1]) for (const [x, y] of ring)
  assert.ok(fixedPart.triangles.some(face => face.points.every(p => p[2] === z)
    && face.points.some(p => Math.abs(p[0] - x) < 1e-7 && Math.abs(p[1] - y) < 1e-7)),
  'each original cap boundary datum belongs to a nondegenerate cap triangle');
old.dispose(); fixed.dispose();

const playable = ['base', 'source_x', 'another'];
assert.deepEqual(baseShellAuditScope(playable), {
  ids: playable, qualities: ['high', 'low'], excluded: [], completePlayableScope: true,
}, 'default census includes X variants and both quality paths');
assert.deepEqual(baseShellAuditScope(playable, 'source_x', 'low'), {
  ids: ['source_x'], qualities: ['low'], excluded: ['base', 'another'], completePlayableScope: false,
}, 'a requested subset discloses every omitted ID and cannot claim full coverage');
assert.throws(() => baseShellAuditScope(playable, 'base,base'), /unique playable/);
assert.throws(() => baseShellAuditScope(playable, 'missing'), /unique playable/);
assert.throws(() => baseShellAuditScope(playable, '', 'medium'), /Quality/);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cot-shell-inputs-'));
try {
  fs.mkdirSync(path.join(directory, 'src')); fs.mkdirSync(path.join(directory, 'tools'));
  const source = path.join(directory, 'src', 'example.ts'), tool = path.join(directory, 'tools', 'example.mjs');
  fs.writeFileSync(source, 'export const value = 1;'); fs.writeFileSync(tool, 'export const tool = 1;');
  const before = baseShellInputFingerprint(directory);
  assert.equal(baseShellInputFingerprint(directory), before, 'unchanged inputs produce deterministic fingerprints');
  fs.writeFileSync(source, 'export const value = 2;');
  assert.notEqual(baseShellInputFingerprint(directory), before, 'source mutation invalidates evidence');
  fs.writeFileSync(source, 'export const value = 1;');
  fs.writeFileSync(tool, 'export const tool = 2;');
  assert.notEqual(baseShellInputFingerprint(directory), before, 'checker mutation also invalidates evidence');
  fs.writeFileSync(tool, 'export const tool = 1;');
  fs.renameSync(source, path.join(directory, 'src', 'renamed.ts'));
  assert.notEqual(baseShellInputFingerprint(directory), before, 'input identity is part of the digest');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
console.log('base-shell integrity: exhaustive crossing oracle, large shells, cap boundaries, scope and freshness controls passed');
