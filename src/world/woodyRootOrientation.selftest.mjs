import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { TREE_SPECIES } from './treeSpecies.ts';

// Published woody-root correction at 7351f0b4ad92c97be03e7be0bb7a700a3f332484
// turned the old cones outward. The 2026-09-11 root draft replaces those
// ordinary cones with low closed ridges that fall away from an eased collar;
// the tidal-Mangrove stilt branch keeps its reviewed bent cones byte-exact.
// This literal witness of the published outward-cone branch keeps the
// negative control usable in shallow checkouts.
const oldWoody = `{
      const length = radius * (1.65 + rng() * 0.55);
      const root = new THREE.ConeGeometry(radius * (0.34 + rng() * 0.10), length, 6, 2, false);
      const tiltRoll = rng() * 0.06;
      root.rotateZ(Math.PI / 2 - 0.10 - tiltRoll);
      root.rotateY(-angle);
      root.scale(1, 0.48, 1);
      root.translate(Math.cos(angle) * length * 0.42, radius * 0.24, Math.sin(angle) * length * 0.42);
      parts.push(paintFlat(root, color.clone().multiplyScalar(0.90 + rng() * 0.10), 0));
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
assert.match(branches[0].getText(source), /buildRootRidge\(radius \* 0\.50, length, width, radius \* 0\.82 \+ tiltRoll, angle\)/,
  'the woody branch emits the low ridge from the shared collar radius');
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

// Physical guard for one ordinary root ridge: a closed ten-quad box whose
// crest starts at the collar radius, falls to the soil along its reach and
// keeps a narrow, single-bearing footprint. Old cones (34 vertices) and any
// inward or hovering ridge fail here.
function rootShape(geometry, radius) {
  const p = geometry.attributes.position;
  assert.equal(p.count, 32, 'ridge box keeps its two reach segments'); assert.equal(geometry.index.count, 60);
  const inner = radius * 0.50;
  // Recover the ridge bearing from the vertices themselves, then measure in
  // that local frame: the box has no centreline vertices, only its two edges.
  let sx = 0, sz = 0;
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); sx += p.getX(i) / r; sz += p.getZ(i) / r; }
  const bearing = Math.atan2(sz, sx), cos = Math.cos(bearing), sin = Math.sin(bearing);
  let minAlong = Infinity, maxAlong = -Infinity, maxAcross = 0, minY = Infinity, maxY = -Infinity, spread = 0;
  const along = [], ys = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = x * cos + z * sin, c = -x * sin + z * cos;
    along.push(a); ys.push(y);
    minAlong = Math.min(minAlong, a); maxAlong = Math.max(maxAlong, a); maxAcross = Math.max(maxAcross, Math.abs(c));
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    const b = Math.atan2(z, x); spread = Math.max(spread, Math.abs(Math.atan2(Math.sin(b - bearing), Math.cos(b - bearing))));
  }
  const innerTop = Math.max(...ys.filter((_, i) => along[i] < minAlong + 1e-4));
  const outerTop = Math.max(...ys.filter((_, i) => along[i] > maxAlong - 1e-4));
  assert.ok(Math.abs(minAlong - inner) < 1e-4, 'ridge starts inside the eased collar');
  assert.ok(maxAlong >= inner + radius * 1.35 - 1e-6 && maxAlong <= inner + radius * 1.85 + 1e-6, 'reach stays within the authored 1.35-1.85 trunk radii');
  // The box has no centreline vertices: its two crest edges sit at 52% of the
  // authored height (zNorm 1), so the edge crest is what the inner ring shows.
  assert.ok(innerTop >= 0.012 + radius * 0.82 * 0.52 - 1e-6 && innerTop <= 0.012 + (radius * 0.82 + 0.06) * 0.52 + 1e-6,
    'crest rises to the authored collar height');
  assert.ok(outerTop <= 0.0121, 'crest reaches the soil at the far end: taper points outward and downward');
  assert.ok(Math.abs(minY - 0.006) < 1e-6, 'underside sits just below the placement plane, not hovering');
  assert.ok(maxAcross <= radius * 0.29 + 1e-6 && spread < 0.62, 'single outward bearing; the ridge is not a ring or a lateral tab');
  assert.ok(geometry.attributes.uv, 'BoxGeometry UVs survive for the shared bark draw');
  return maxY;
}

let rootCases = 0;
for (const seed of [0, 0x71ee, 0x8b3d, 0xc041, 0xffffffff]) {
  for (const radius of [.21, .28, .31, .38, .45]) {
    const a = roots(current, seed, radius, 5), b = roots(before, seed, radius, 5);
    assert.deepEqual(a.rng, b.rng, 'ridges draw the same random stream as the published outward cones');
    for (let i = 0; i < a.parts.length; i++) {
      rootShape(a.parts[i], radius);
      assert.throws(() => rootShape(b.parts[i], radius), /two reach segments/, 'the published cone witness fails the ridge guard');
      assert.equal(a.parts[i].attributes.color.count, 32, 'flat root colour is written per box vertex');
      a.parts[i].dispose(); b.parts[i].dispose(); rootCases++;
    }
    const tidalA = roots(current, seed, radius, 5, true), tidalB = roots(before, seed, radius, 5, true);
    assert.deepEqual(tidalA.rng, tidalB.rng);
    tidalA.parts.forEach((g, i) => { contract(g, tidalB.parts[i], true); g.dispose(); tidalB.parts[i].dispose(); });
  }
}

const key = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
function upperMultiset(geometry) {
  const p = geometry.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= .4) continue;
    const k = key(p.getX(i), p.getY(i), p.getZ(i)); map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}
let fullCases = 0;
for (const species of TREE_SPECIES) {
  for (const seed of [0x71ee, 0x8b3d, 0xc041]) {
    current.rootTestRngReceipt(); before.rootTestRngReceipt();
    const a = current.buildTreeTrunkAuditGeometry(species, seed), b = before.buildTreeTrunkAuditGeometry(species, seed);
    assert.deepEqual(current.rootTestRngReceipt(), before.rootTestRngReceipt(), species + ' full-builder RNG');
    assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
    assert.ok(a.attributes.position.count <= b.attributes.position.count, species + ' ridges never exceed the cone budget');
    assert.ok(a.attributes.position.array.every(Number.isFinite));
    a.computeBoundingBox();
    assert.ok(a.boundingBox.min.y >= -.16 && a.boundingBox.min.y <= .02, species + ' existing full-builder ground tolerance');
    assert.deepEqual(upperMultiset(a), upperMultiset(b), species + ' upper trunk/cards untouched');
    const repeated = current.buildTreeTrunkAuditGeometry(species, seed);
    contract(a, repeated, true);
    a.dispose(); b.dispose(); repeated.dispose(); fullCases++;
  }
}
console.log(`woodyRootOrientation.selftest: ${rootCases} real root ridges; ${fullCases} complete near trunks; exact tidal branch/RNG/storage; published outward-cone negative PASS`);
