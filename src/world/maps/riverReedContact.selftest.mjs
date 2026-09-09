import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { MAP_IDS, getMapConfig } from './index.ts';

// Exact private predecessor from published1db45b0ad. This small negative/control
// fixture requires no Git history; existing kit tests still execute current code.
const oldReed = `function reedClump(
  buckets: DressingBuckets,
  rng: Rng,
  x: number,
  y: number,
  z: number,
): void {
  // stalks sized to survive establishing-shot minification (~350 m): a
  // 5 cm-wide stick disappears at that range, so the clump reads through a
  // few taller, thicker rimed stems over a skirt of short ones
  const n = 8 + ((rng() * 7) | 0);
  for (let k = 0; k < n; k++) {
    const tall = k < 3;
    const h = tall ? 1.15 + rng() * 0.6 : 0.6 + rng() * 0.6;
    const w = tall ? 0.10 + rng() * 0.05 : 0.06 + rng() * 0.04;
    const st = box(w, h, w, 2.0);
    st.rotateX((rng() - 0.5) * 0.24);
    st.rotateZ((rng() - 0.5) * 0.24);
    st.rotateY(rng() * Math.PI);
    st.translate(x + (rng() - 0.5) * 2.2, y + h / 2 - 0.06, z + (rng() - 0.5) * 2.2);
    buckets.straw.push(st);
  }
  // the odd broken-over head
  if (rng() < 0.6) {
    const bh = box(0.07, 0.55, 0.07, 2.0);
    bh.rotateZ(1.2 + rng() * 0.3);
    bh.translate(x + (rng() - 0.5) * 1.2, y + 0.55, z + (rng() - 0.5) * 1.2);
    buckets.straw.push(bh);
  }
}`;
assert.equal(createHash('sha256').update(oldReed + '\n').digest('hex'),
  '5fae7a38a3df92dd6b3bef1920b38f36780fa845f22d621b6c507812c274ddbc');
const kitUrl = new URL('./mapKits.ts', import.meta.url);
const source = readFileSync(kitUrl, 'utf8');
const call = 'reedClump(buckets, rng, heightField, x, z);';
assert.equal(source.split(call).length, 2, 'one actual river-only dispatch');
let moduleId = 0;
async function loadKit(legacy = false, mutate = text => text) {
  const url = new URL(`?river-reed-test=${moduleId++}`, kitUrl).href;
  let text = source;
  if (legacy) {
    const start = text.indexOf('function reedClump('), end = text.indexOf('\nfunction winterSurface(', start);
    assert.ok(start >= 0 && end > start);
    text = text.slice(0, start) + oldReed + '\n' + text.slice(end);
    text = text.replace(call, 'reedClump(buckets, rng, x, heightField.getHeightAt(x, z), z);');
  }
  text = mutate(text);
  text += `\nexport const probeReed = (b, r, f, x, z) => ${legacy
    ? 'reedClump(b, r, x, f.getHeightAt(x, z), z)' : 'reedClump(b, r, f, x, z)'};`;
  const hook = registerHooks({ load(target, context, next) {
    const result = next(target, context);
    return target === url ? { ...result, source: text } : result;
  } });
  try { return await import(url); } finally { hook.deregister(); }
}
const current = await loadKit(), previous = await loadKit(true);
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const buckets = () => Object.fromEntries(names.map(name => [name, []]));
function rng(seed) {
  const random = mulberry32(seed), result = { calls: 0, next: 0 };
  result.draw = () => { result.calls++; return random(); };
  result.tail = () => random();
  return result;
}
function dispose(parts) {
  for (const list of Object.values(parts)) for (const geometry of list) geometry.dispose();
}
function inventory(parts) {
  const hash = createHash('sha256');
  let bytes = 0, vertices = 0, indices = 0, geometries = 0;
  for (const [name, list] of Object.entries(parts)) {
    hash.update(name);
    for (const geometry of list) {
      geometries++; vertices += geometry.attributes.position.count;
      indices += geometry.index?.count ?? geometry.attributes.position.count;
      const attributes = Object.values(geometry.attributes);
      if (geometry.index) attributes.push(geometry.index);
      for (const attr of attributes) {
        bytes += attr.array.byteLength;
        hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
      }
    }
  }
  return { bytes, vertices, indices, geometries, hash: hash.digest('hex') };
}
function mergedBudget(parts) {
  // Explicit nonindexed expansion model, not a lock on the destination owner's
  // implementation. Final native owner census remains a separate release check.
  // Primitive savings must not be advertised as final GPU savings.
  const expanded = parts.map(geometry => geometry.toNonIndexed());
  const merged = mergeGeometries(expanded, false);
  try {
    return { vertices: merged.attributes.position.count, attributes: Object.keys(merged.attributes).sort(),
      bytes: Object.values(merged.attributes).reduce((total, attribute) => total + attribute.array.byteLength, 0) };
  } finally { merged.dispose(); for (const geometry of expanded) geometry.dispose(); }
}
function ringCenter(p, start) {
  const center = [0, 0, 0];
  for (let i = start; i < start + 4; i++) {
    center[0] += p.getX(i) / 4; center[1] += p.getY(i) / 4; center[2] += p.getZ(i) / 4;
  }
  return center;
}
function auditStem(geometry, field) {
  const p = geometry.attributes.position;
  assert.equal(p.count, 14, 'tapered two-ring stem, not the old24-vertex box');
  assert.equal(geometry.index.count, 36);
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  const base = ringCenter(p, 0), middle = ringCenter(p, 5);
  assert.ok(Math.abs(base[1] - field.getHeightAt(base[0], base[2]) + .06) < .0001,
    'actual Float32 root sits6cm into its own bed, not the clump-center bed');
  const radius = Math.hypot(p.getX(0) - base[0], p.getZ(0) - base[2]);
  const midRadius = Math.hypot(p.getX(5) - middle[0], p.getZ(5) - middle[2]);
  assert.ok(radius > .0089 && radius < .0226, 'thin physical culm radius');
  assert.ok(Math.abs(midRadius / radius - .64) < .003, 'visible taper before pointed tip');
  assert.ok(p.getY(10) > middle[1] && middle[1] > base[1]);
  for (let i = 11; i < 14; i++) assert.deepEqual([p.getX(i), p.getY(i), p.getZ(i)],
    [p.getX(10), p.getY(10), p.getZ(10)], 'four faces meet at the same tip');
}
function auditHead(parts) {
  const head = parts.at(-1);
  if (head.name !== 'winter-reed-head') return false;
  const base = ringCenter(head.attributes.position, 0), tip = parts[0].attributes.position;
  assert.ok(Math.hypot(base[0] - tip.getX(10), base[1] - tip.getY(10), base[2] - tip.getZ(10)) < .0001,
    'actual head base intersects the first stem tip');
  return true;
}
function auditClump(kit, field, seed) {
  const parts = buckets(), random = rng(seed);
  kit.probeReed(parts, random.draw, field, 20, -30);
  try {
    const hasHead = auditHead(parts.straw), stems = parts.straw.slice(0, hasHead ? -1 : undefined);
    assert.ok(stems.length >= 8 && stems.length <= 14);
    for (const stem of stems) auditStem(stem, field);
    return { count: parts.straw.length, head: hasHead };
  } finally { dispose(parts); }
}
function auditDraws(field, seed) {
  const expected = mulberry32(seed), count = 8 + ((expected() * 7) | 0), roots = [];
  for (let i = 0; i < count; i++) {
    for (let draw = 0; draw < 5; draw++) expected(); // height, width, two bends, twist
    roots.push([20 + (expected() - .5) * 2.2, -30 + (expected() - .5) * 2.2]);
  }
  const parts = buckets(), random = rng(seed);
  let queries = 0;
  current.probeReed(parts, random.draw,
    { getHeightAt: (x, z) => { queries++; return field.getHeightAt(x, z); } }, 20, -30);
  try {
    assert.equal(queries, count, 'one bed query per existing stem; no head query or extra support scan');
    for (let i = 0; i < count; i++) {
      const base = ringCenter(parts.straw[i].attributes.position, 0);
      assert.ok(Math.hypot(base[0] - roots[i][0], base[2] - roots[i][1]) < .00001,
        'exact original seeded root XZ draws, not relocated clumps');
    }
    const head = expected() < .6;
    if (head) { expected(); expected(); expected(); }
    assert.equal(parts.straw.length, count + Number(head));
    assert.equal(random.tail(), expected(), 'same per-clump RNG tail');
  } finally { dispose(parts); }
}
let heads = 0;
for (const slope of [0, .8, -.8]) for (const seed of [1337, 2049, 7719, 7, 19, 31]) {
  const field = { getHeightAt: (x, z) => slope * x + .3 * z + .02 * Math.sin(x) };
  heads += Number(auditClump(current, field, seed).head);
  auditDraws(field, seed);
  assert.throws(() => auditClump(previous, field, seed), assert.AssertionError, 'actual old box negative');
}
assert.ok(heads > 0);
for (const [from, to] of [
  ['heightField.getHeightAt(px, pz) - 0.06', 'heightField.getHeightAt(x, z) - 0.06'],
  ['head.translate(headX, headY, headZ)', 'head.translate(headX + 1, headY, headZ)'],
]) {
  assert.ok(source.includes(from));
  const broken = await loadKit(false, text => text.replace(from, to));
  assert.throws(() => {
    for (const seed of [1337, 2049, 7719, 7, 19, 31]) auditClump(broken, { getHeightAt: (x, z) => x * .8 + z * .3 }, seed);
  }, assert.AssertionError, 'actual source mutation must fail contact/attachment');
}

function build(kit, id, seed, field) {
  const config = getMapConfig(id), parts = buckets(), random = rng(seed ^ 0x5a17);
  const receipts = [], obstacles = [], colliders = [];
  kit.dressMapExtras({ mapId: id, extraKits: config.props.extraKits, riverLandings: config.props.riverLandings,
    L: field._layout, heightField: field, rng: random.draw, buckets: parts,
    groundingReceipts: receipts, obstacles, colliders });
  return { parts, calls: random.calls, next: random.tail(), receipts, obstacles, colliders };
}
const riverMaps = MAP_IDS.filter(id => {
  const p = getMapConfig(id).props, kits = p.extraKits || (id === 'autumn' ? ['river'] : []);
  return kits.includes('river') && (!p.riverLandings || p.riverLandings.some(site => site.shoreReeds !== false));
});
assert.deepEqual(riverMaps, ['autumn', 'delta', 'mangrove'], 'all actual wet-reed callers; Saltwind remains reed-free');
const kitMaps = MAP_IDS.filter(id => getMapConfig(id).props.extraKits?.length
  || ['winter', 'coastal', 'autumn', 'railyard'].includes(id));
const results = [];
for (const id of kitMaps) for (const seed of riverMaps.includes(id) ? [1337, 2049, 7719] : [1337]) {
  const field = createHeightField(seed, getMapConfig(id));
  const actual = build(current, id, seed, field), old = build(previous, id, seed, field);
  try {
    const a = inventory(actual.parts), b = inventory(old.parts), selected = riverMaps.includes(id);
    assert.deepEqual([actual.calls, actual.next, actual.receipts, actual.obstacles, actual.colliders],
      [old.calls, old.next, old.receipts, old.obstacles, old.colliders], `${id}: exact RNG/placement/collision`);
    assert.equal(a.indices, b.indices); assert.equal(a.geometries, b.geometries);
    for (const name of names) if (!selected || name !== 'straw') {
      assert.deepEqual(inventory({ [name]: actual.parts[name] }), inventory({ [name]: old.parts[name] }),
        `${id}/${name}: nonreed and winter bytes exact`);
    }
    if (selected) {
      assert.ok(actual.parts.straw.length > 0);
      assert.equal(b.bytes - a.bytes, actual.parts.straw.length * 320);
      assert.equal(b.vertices - a.vertices, actual.parts.straw.length * 10);
      assert.deepEqual(mergedBudget(actual.parts.straw), mergedBudget(old.parts.straw),
        'actual Three bucket expansion preserves final vertex/attribute byte budget');
      for (const geometry of actual.parts.straw) if (geometry.name === 'winter-reed') auditStem(geometry, field);
    }
    if (id === 'saltwind') assert.equal(actual.parts.straw.length, 0);
    results.push({ id, seed, calls: actual.calls, tail: actual.next, reedPieces: selected ? actual.parts.straw.length : 0,
      representativeRoot: selected ? ringCenter(actual.parts.straw[0].attributes.position, 0) : null,
      before: b, after: a });
  } finally { dispose(actual.parts); dispose(old.parts); }
}
console.log(JSON.stringify(results));
console.log('riverReedContact.selftest: source-executed bed/attachment negatives, RNG/topology/buckets and nonreed/winter parity pass');
