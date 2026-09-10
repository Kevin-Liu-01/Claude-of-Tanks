import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { TREE_ARCHETYPES, TREE_SPECIES } from './treeSpecies.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const url = new URL('./vegetation.ts', import.meta.url), text = readFileSync(url, 'utf8');
const ast = ts.createSourceFile('vegetation.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const owners = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildBushCards');
assert.equal(owners.length, 1, 'one actual bush owner');
function replaceOnce(code, from, to) {
  assert.equal(code.split(from).length, 2, 'unique source anchor: ' + from);
  return code.replace(from, to);
}
// Literal29217600a predecessor: no runtime Git and neither rejected shrub experiment.
const oldBush = `function buildBushCards(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const parts: THREE.BufferGeometry[] = [];
  const cy = 0.55;
  for (let i = 0; i < 16; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.72 + rng() * 0.55;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const vGrad = 0.78 + 0.42 * clamp(dy * 0.5 + 0.5, 0, 1);
    const shade = (0.34 + 0.62 * rad) * vGrad * (0.9 + rng() * 0.2);
    parts.push(foliageCard(w, w * 0.8, dx * rad * 0.85, cy + dy * rad * 0.38, dz * rad * 0.85,
      _e, shade, hue0 + (rng() - 0.5) * 0.055, sat0 + rng() * 0.06, 0.22, 0, cy, 0, 0.75, 0.45));
  }
  return mergeParts(parts);
}`;
const variants = new Map(['current', 'before'].map(k => [url.href + '?sprays-' + k, k]));
const hook = registerHooks({ load(href, context, next) {
  const result = next(href, context), mode = variants.get(href);
  if (!mode) return result;
  let code = result.source.toString();
  assert.equal(code, text, 'complete actual module loaded');
  if (mode === 'before') code = replaceOnce(code, owners[0].getText(ast), oldBush);
  code = replaceOnce(code, "import * as THREE from 'three';", `import * as RealTHREE from 'three';
    let counts = null;
    const traced = (Base, key) => class extends Base {
      constructor(...args) { super(...args); if (counts) counts[key]++; }
    };
    const THREE = { ...RealTHREE, BufferGeometry: traced(RealTHREE.BufferGeometry, 'geometry'),
      PlaneGeometry: traced(RealTHREE.PlaneGeometry, 'plane'), BufferAttribute: traced(RealTHREE.BufferAttribute, 'attribute') };`);
  code = replaceOnce(code, "import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';",
    `import { mergeGeometries as realMerge } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
    const mergeGeometries = (...args) => { if (counts) counts.merge++; return realMerge(...args); };`);
  return { ...result, source: code + `
    export function bushForTest(rng, palette) {
      counts = { geometry: 0, plane: 0, attribute: 0, merge: 0 };
      try { return { geometry: buildBushCards(rng, palette), constructors: counts }; }
      finally { counts = null; }
    }
    export { buildBroadleafCards, buildPineCards, buildPalmGeometry, buildBirchGeometry,
      buildOakFarGeometry, buildPineFarGeometry, buildPalmFarGeometry, buildBirchFarGeometry };
  ` };
} });
let current, before;
try { current = await import(url.href + '?sprays-current'); before = await import(url.href + '?sprays-before'); }
finally { hook.deregister(); }
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const point = (g, i) => new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
function identical(a, b) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const [name, p] of Object.entries(a.attributes)) {
    const q = b.attributes[name];
    assert.equal(p.itemSize, q.itemSize); assert.equal(p.count, q.count); assert.equal(p.normalized, q.normalized);
    assert.equal(p.array.constructor, q.array.constructor); assert.ok(bytes(p.array).equals(bytes(q.array)), name + ' exact bytes');
  }
  assert.deepEqual(a.index?.array, b.index?.array); assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.drawRange, b.drawRange);
}
function spray(g, offset) {
  const uv = g.attributes.uv, corners = new Map(), cross = [], areas = [];
  for (let i = 0; i < 6; i++) {
    const j = offset + i, u = uv.getX(j), v = uv.getY(j), key = `${u},${v}`, p = point(g, j);
    assert.ok((u === 0 || u === 1) && (v === 0 || v === 1), 'complete corner UVs');
    if (corners.has(key)) assert.deepEqual(p.toArray(), corners.get(key), 'shared triangle corners coincide');
    else corners.set(key, p.toArray());
  }
  for (const j of [offset, offset + 3]) {
    const a = point(g, j), b = point(g, j + 1), c = point(g, j + 2);
    const n = b.sub(a).cross(c.sub(a));
    assert.ok(n.lengthSq() > 1e-12, 'nonzero triangle area'); cross.push(n.normalize());
    areas.push((uv.getX(j + 1) - uv.getX(j)) * (uv.getY(j + 2) - uv.getY(j))
      - (uv.getY(j + 1) - uv.getY(j)) * (uv.getX(j + 2) - uv.getX(j)));
  }
  assert.equal(corners.size, 4, 'four complete spray corners');
  assert.ok(cross[0].dot(cross[1]) > 1 - 2e-6, 'paired triangles have consistent flat winding');
  assert.ok(Math.abs(areas[0]) === 1 && areas[0] === areas[1], 'two triangles cover entire atlas once');
}
function contract(g) {
  assert.equal(g.index, null); assert.equal(g.attributes.position.count, 192);
  assert.deepEqual(Object.keys(g.attributes).sort(), ['aFlex', 'color', 'normal', 'position', 'uv']);
  assert.deepEqual(Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, a.itemSize])),
    { position: 3, normal: 3, uv: 2, color: 3, aFlex: 1 });
  for (const a of Object.values(g.attributes)) {
    assert.equal(a.count, 192); assert.equal(a.array.constructor, Float32Array); assert.ok(a.array.every(Number.isFinite));
  }
  assert.equal(Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0), 9216);
  for (let i = 0; i < 192; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i);
    assert.ok(Math.abs(n.length() - 1) < 2e-6 && n.y > 0, 'positive-up unit authored normals');
    assert.equal(g.attributes.aFlex.getX(i), Math.fround(.22), 'same wind flex');
  }
  for (let i = 0; i < 192; i += 6) spray(g, i);
}
function build(module, seed, palette) {
  const next = module.mulberry32(seed), draws = [];
  const rng = () => { const v = next(); draws.push(v); return v; };
  return { ...module.bushForTest(rng, palette), draws, tail: [next(), next(), next()] };
}
function bounds(g) {
  g.computeBoundingBox(); const b = g.boundingBox;
  return { min: b.min.toArray(), max: b.max.toArray(), size: b.getSize(new THREE.Vector3()).toArray() };
}
const receipts = [], failures = [];
function check(id, seed, palette) {
  const a = build(current, seed, palette), b = build(before, seed, palette), repeat = build(current, seed, palette);
  try {
    receipts.push({ id, seed, before: bounds(b.geometry), current: bounds(a.geometry), constructors: a.constructors });
    assert.equal(a.draws.length, 176); assert.deepEqual(a.draws, b.draws); assert.deepEqual(a.tail, b.tail);
    assert.deepEqual(a.constructors, { geometry: 1, plane: 0, attribute: 5, merge: 0 }, 'direct final buffers, no planes/merge');
    assert.equal(b.constructors.plane, 16); assert.equal(b.constructors.merge, 1, 'constructor observer sees legacy path');
    contract(a.geometry); identical(a.geometry, repeat.geometry); assert.deepEqual(a.tail, repeat.tail);
  } finally { a.geometry.dispose(); b.geometry.dispose(); repeat.geometry.dispose(); }
}
function negatives() {
  const a = build(current, 2032, {}), b = build(before, 2032, {});
  const reject = (mutate, pattern) => {
    const g = a.geometry.clone(); try { mutate(g); assert.throws(() => contract(g), pattern); } finally { g.dispose(); }
  };
  try {
    assert.throws(() => contract(b.geometry), /positive-up|corner UVs|entire atlas/, 'legacy bowed sheets rejected');
    reject(g => g.attributes.normal.array.fill(0), /unit authored normals/);
    reject(g => g.attributes.position.setXYZ(1, ...point(g, 0).toArray()), /shared triangle|nonzero triangle/);
    reject(g => { for (let i = 0; i < 6; i++) g.attributes.uv.setX(i, g.attributes.uv.getX(i) * .5); }, /corner UVs/);
    reject(g => { const p = point(g, 4); g.attributes.position.setXYZ(4, ...point(g, 5).toArray()); g.attributes.position.setXYZ(5, ...p.toArray()); }, /shared triangle|winding/);
  } finally { a.geometry.dispose(); b.geometry.dispose(); }
}
function nonBush() {
  const calls = [['buildBroadleafCards', [58, 1, {}]], ['buildPineCards', [.6, 1, {}]], ['buildPalmGeometry', [{}]],
    ['buildBirchGeometry', [{}]], ['buildOakFarGeometry', [{}, 0]], ['buildPineFarGeometry', [{}]],
    ['buildPalmFarGeometry', [{}, 1]], ['buildBirchFarGeometry', [{}]]];
  for (const [name, args] of calls) {
    const ar = current.mulberry32(2001), br = before.mulberry32(2001), a = current[name](ar, ...args), b = before[name](br, ...args);
    const ga = a.isBufferGeometry ? [a] : Object.values(a), gb = b.isBufferGeometry ? [b] : Object.values(b);
    try { assert.equal(ga.length, gb.length); ga.forEach((g, i) => identical(g, gb[i])); assert.equal(ar(), br()); }
    finally { for (const g of [...ga, ...gb]) g.dispose(); }
  }
  for (const species of TREE_SPECIES) {
    const a = current.buildTreeTrunkAuditGeometry(species, 2001), b = before.buildTreeTrunkAuditGeometry(species, 2001);
    try { identical(a, b); } finally { a.dispose(); b.dispose(); }
  }
}
assert.equal(MAP_IDS.length, 30);
for (const id of MAP_IDS) {
  const v = { species: ['pine', 'oak'], bushSpecies: 'oak', palettes: {}, ...getMapConfig(id).vegetation };
  assert.ok(v.species.every(s => TREE_SPECIES.includes(s)));
  const sp = v.species.includes(v.bushSpecies) ? v.bushSpecies : v.species[0], family = TREE_ARCHETYPES[sp].family;
  const key = family === 'conifer' ? 'pine' : family === 'birch' ? 'birch' : family === 'palm' ? 'palm' : 'oak';
  for (const seed of [2032, 2033]) {
    try { check(id, seed, v.palettes[sp] || v.palettes[key] || {}); } catch (error) { failures.push(error); }
  }
}
try { negatives(); nonBush(); } catch (error) { failures.push(error); }
console.log(JSON.stringify({ receipts, limits: '60 actual map-palette/production-seed builds, not rendered maps. Local bounds are measurements, not coverage/contact/art/performance acceptance. Constructor counts cover local THREE and merge calls, not total JS allocations.' }, null, 2));
if (failures.length) throw new AggregateError(failures, 'bushOverlappingSprays failed');
console.log('bushOverlappingSprays:32 complete flat sprays/64tris/192verts/9216B per owner;176 draws/tail, unit normals, topology/UV negatives and non-bush parity passed.');
