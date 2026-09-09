import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { TREE_SPECIES } from './treeSpecies.ts';

// Exact woody branch at 7351f0b4ad92c97be03e7be0bb7a700a3f332484.
// Local literal keeps the negative control usable in shallow checkouts.
const oldWoody = `{
      root.rotateZ(Math.PI / 2 - 0.10 - tiltRoll);
      root.rotateY(-angle);
      root.scale(1, 0.48, 1);
      root.translate(Math.cos(angle) * length * 0.42, radius * 0.24, Math.sin(angle) * length * 0.42);
    }`;
const url = new URL('./vegetation.ts', import.meta.url);
const text = readFileSync(url, 'utf8');
const source = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const rootFn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'addRootButtresses');
const branches = [];
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(source) === 'tidalMangrove') branches.push(node.elseStatement);
  node.forEachChild(visit);
}
visit(rootFn);
assert.equal(branches.length, 1, 'one actual woody branch, not a comment match');
const randomFn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'mulberry32');
const renamedRandom = randomFn.getText(source).replace('export function mulberry32(', 'function rootTestRandomCore(');
assert.notEqual(renamedRandom, randomFn.getText(source));
const targets = new Map(['current', 'before'].map(mode => [url.href + '?woody-root-' + mode, mode]));
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context), mode = targets.get(href);
  if (!mode) return result;
  let code = result.source.toString();
  assert.equal(code, text, 'execute the actual current module, changing only the historical branch/observers');
  if (mode === 'before') code = code.replace(branches[0].getText(source), oldWoody);
  code = code.replace(randomFn.getText(source), renamedRandom);
  return { ...result, source: code + `
    const rootTestStreams = [];
    export function mulberry32(seed) {
      const next = rootTestRandomCore(seed), row = {seed, calls: 0, next};
      rootTestStreams.push(row); return () => { row.calls++; return next(); };
    }
    export function rootTestRngReceipt() {
      const rows = rootTestStreams.map(({seed, calls, next}) => ({seed, calls, tail: [next(), next(), next()]}));
      rootTestStreams.length = 0; return rows;
    }
    export { addRootButtresses, buildBroadleafTrunk };
  ` };
} });
const current = await import(url.href + '?woody-root-current');
const before = await import(url.href + '?woody-root-before');
hook.deregister();

const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function contract(a, b, exact = false) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const [name, attribute] of Object.entries(a.attributes)) {
    const other = b.attributes[name];
    assert.equal(attribute.count, other.count); assert.equal(attribute.itemSize, other.itemSize);
    assert.equal(attribute.array.byteLength, other.array.byteLength);
    assert.equal(attribute.normalized, other.normalized);
    if (exact || !['position', 'normal'].includes(name)) assert.ok(bytes(attribute.array).equals(bytes(other.array)), name);
    assert.ok(attribute.array.every(Number.isFinite), name + ' finite');
  }
  assert.deepEqual(a.index?.array, b.index?.array);
  assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.drawRange, b.drawRange);
  assert.deepEqual(a.userData, b.userData);
}

function roots(module, seed, radius, count, tidal = false) {
  module.rootTestRngReceipt();
  const parts = [];
  module.addRootButtresses(parts, module.mulberry32(seed), new THREE.Color('#635749'), radius, count, tidal);
  const rng = module.rootTestRngReceipt();
  assert.equal(rng.length, 1); assert.equal(rng[0].calls, 1 + count * 5);
  return { parts, rng };
}

function rootShape(geometry, radius) {
  const p = geometry.attributes.position;
  assert.equal(p.count, 34); assert.equal(geometry.index.count, 72);
  // Actual ConeGeometry: first 7 vertices duplicate the apex; bottom cap
  // has 6 duplicate center vertices starting at 21. No expected transform.
  const tip = new THREE.Vector3().fromBufferAttribute(p, 0);
  const base = new THREE.Vector3().fromBufferAttribute(p, 21);
  const outward = new THREE.Vector3(tip.x, 0, tip.z).normalize();
  assert.ok(Math.hypot(tip.x, tip.z) > Math.hypot(base.x, base.z) + radius, 'taper points outward, not into trunk');
  assert.ok(tip.dot(outward) - base.dot(outward) > radius * 1.5, 'taper points outward, not into trunk');
  assert.ok(base.y > tip.y, 'wide base rises toward the trunk');
  assert.ok(Math.abs(tip.y) < 1e-7, 'outward apex sits on local ground before ordinary -.06m placement');
  assert.ok(Math.hypot(base.x, base.z) < radius * .19, 'wide-cap center stays tucked into flare');
  for (let i = 0; i < p.count; i++) {
    assert.ok(p.getY(i) >= -.16 && p.getY(i) < radius * .5, 'bounded local seating, no buried trunk');
    assert.ok(Math.hypot(p.getX(i), p.getZ(i)) < radius * 2.03, 'existing radial envelope');
  }
  const normal = geometry.attributes.normal;
  for (let i = 0; i < normal.count; i++) {
    assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 2e-7);
  }
}

let rootCases = 0;
for (const seed of [0, 0x71ee, 0x8b3d, 0xc041, 0xffffffff]) {
  for (const radius of [.21, .28, .31, .38, .45]) {
    const a = roots(current, seed, radius, 5), b = roots(before, seed, radius, 5);
    assert.deepEqual(a.rng, b.rng);
    for (let i = 0; i < a.parts.length; i++) {
      contract(a.parts[i], b.parts[i]); rootShape(a.parts[i], radius);
      assert.throws(() => rootShape(b.parts[i], radius), /taper points outward/, 'old inward cones fail the physical guard');
      a.parts[i].dispose(); b.parts[i].dispose(); rootCases++;
    }
    const tidalA = roots(current, seed, radius, 5, true), tidalB = roots(before, seed, radius, 5, true);
    assert.deepEqual(tidalA.rng, tidalB.rng);
    tidalA.parts.forEach((g, i) => { contract(g, tidalB.parts[i], true); g.dispose(); tidalB.parts[i].dispose(); });
  }
}

let fullCases = 0;
for (const species of TREE_SPECIES) {
  for (const seed of [0x71ee, 0x8b3d, 0xc041]) {
    current.rootTestRngReceipt(); before.rootTestRngReceipt();
    const a = current.buildTreeTrunkAuditGeometry(species, seed), b = before.buildTreeTrunkAuditGeometry(species, seed);
    assert.deepEqual(current.rootTestRngReceipt(), before.rootTestRngReceipt(), species + ' full-builder RNG');
    contract(a, b);
    a.computeBoundingBox();
    assert.ok(a.boundingBox.min.y >= -.16 && a.boundingBox.min.y <= .02, species + ' existing full-builder ground tolerance');
    const p = a.attributes.position, old = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (old.getY(i) <= .4) continue;
      assert.deepEqual([p.getX(i), p.getY(i), p.getZ(i)], [old.getX(i), old.getY(i), old.getZ(i)], species + ' upper trunk/cards untouched');
      assert.deepEqual(a.attributes.normal.array.slice(i * 3, i * 3 + 3),
        b.attributes.normal.array.slice(i * 3, i * 3 + 3), species + ' upper normals untouched');
    }
    const repeated = current.buildTreeTrunkAuditGeometry(species, seed);
    contract(a, repeated, true);
    a.dispose(); b.dispose(); repeated.dispose(); fullCases++;
  }
}
console.log(`woodyRootOrientation.selftest: ${rootCases} real root cones; ${fullCases} complete near trunks; exact tidal branch/RNG/UV/color/storage; old inward negative PASS`);
