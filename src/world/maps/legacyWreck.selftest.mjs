// legacyWreck.selftest.mjs — (the destructible-kits lane, round 3, 2026-10-11; the owner: "the destruction of buildings
// needs to be a lot better too, rn its way to sporadic and ugly instead of behaving like it would with physics") the
// part-built light kinds' broken states settled from their own parts (legacyWreck.ts), the families and the regional
// kits' variants alike: each spends exactly the shared litter's draws from the props stream (every later pool and
// placement keeps its seat), builds the same wreck eagerly and deferred, stays deterministic, comes to rest no higher
// than it stood and round its own footprint, keeps the intact's layout (the deferred pool's stand-in) with its windows
// dark, and is made of the kind's own parts rather than the litter.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DESTRUCTIBLE_BUILDING_TYPES, REGIONAL_DESTRUCTIBLE_TYPES, SETTLED_WRECK_KINDS, debris } from './structureKit.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../engine/nightEmissionMaterial.ts';

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function counting(seed) {
  const rng = mulberry32(seed);
  const wrapped = () => { wrapped.calls++; return rng(); };
  wrapped.calls = 0;
  return wrapped;
}
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function digest(g) {
  const h = createHash('sha256');
  for (const [name, a] of Object.entries(g.attributes)) h.update(`${name}:${a.itemSize}`).update(bytes(a.array));
  return h.digest('hex');
}
// (by name: three binds a program's attributes by name, in any order)
const layout = (g) => Object.entries(g.attributes).map(([n, a]) => `${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(' ');
function bounds(g) {
  g.computeBoundingBox();
  return g.boundingBox;
}

const kinds = [];
for (const id of SETTLED_WRECK_KINDS) kinds.push({ label: id, meta: DESTRUCTIBLE_BUILDING_TYPES[id] });
for (const [kit, table] of Object.entries(REGIONAL_DESTRUCTIBLE_TYPES)) {
  for (const [key, meta] of Object.entries(table)) if (SETTLED_WRECK_KINDS.has(key)) kinds.push({ label: `${kit}/${key}`, meta });
}
assert.equal(SETTLED_WRECK_KINDS.size, 17, 'the seventeen part-built light families');
assert.ok(kinds.length >= 29, `the families and the regional kits' variants (${kinds.length})`);

const rows = [];
for (const { label, meta } of kinds) {
  assert.ok(meta.brokenDeferred, `${label}: a deferred wreck`);
  const material = meta.surfaceMaterial === 'structureCanvas' ? 'canvas' : meta.surfaceMaterial === 'structureMetal' ? 'metal' : 'wood';
  for (const seed of [3, 41]) {
    // the draw law: the shared litter's draws, exactly, eagerly and deferred
    const litter = counting(seed);
    debris(meta, [0x808080, 0x808080, 0x808080], litter, material).dispose();
    const eagerRng = counting(seed), deferredRng = counting(seed);
    const eager = meta.broken(eagerRng);
    const make = meta.brokenDeferred(deferredRng);
    assert.equal(eagerRng.calls, litter.calls, `${label}/${seed}: the wreck spends the litter's ${litter.calls} draws from the props stream`);
    assert.equal(deferredRng.calls, litter.calls, `${label}/${seed}: and so does its deferred form, at load`);
    assert.ok(make.job && make.job.kit === 'legacy', `${label}/${seed}: the deferred wreck carries its worker job`);
    const lazy = make();
    assert.equal(digest(lazy), digest(eager), `${label}/${seed}: deferred and eager build the same wreck`);
    const again = meta.broken(counting(seed));
    assert.equal(digest(again), digest(eager), `${label}/${seed}: the same stream settles the same wreck`);

    const intact = meta.build(mulberry32(seed));
    const ib = bounds(intact), wb = bounds(eager);
    const reach = Math.max(-ib.min.x, ib.max.x, -ib.min.z, ib.max.z) + 0.5 * ib.max.y + 2.5;
    assert.ok(wb.max.y <= ib.max.y + 0.05, `${label}/${seed}: the wreck no higher than the building stood (${wb.max.y.toFixed(2)} > ${ib.max.y.toFixed(2)})`);
    assert.ok(wb.max.y >= 0.2, `${label}/${seed}: the wreck has volume (${wb.max.y.toFixed(2)} m)`);
    // (the settle samples a big body's points at a stride, so a corner may rest a few centimetres into the ground)
    assert.ok(wb.min.y >= Math.min(ib.min.y, 0) - 0.15, `${label}/${seed}: nothing sunk deeper than the building's own footings (${wb.min.y.toFixed(2)})`);
    assert.ok(Math.max(-wb.min.x, wb.max.x, -wb.min.z, wb.max.z) <= reach,
      `${label}/${seed}: the wreck round its footprint (${Math.max(-wb.min.x, wb.max.x, -wb.min.z, wb.max.z).toFixed(2)} > ${reach.toFixed(2)})`);
    assert.equal(layout(eager), layout(intact), `${label}/${seed}: the intact's layout (the deferred pool's stand-in)`);
    const mask = eager.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    assert.ok(mask && mask.array.every((v) => v === 0), `${label}/${seed}: a wreck's windows are dark`);
    const tris = eager.getAttribute('position').count / 3, intactTris = intact.getAttribute('position').count / 3;
    assert.ok(tris >= intactTris * 0.6, `${label}/${seed}: made of the kind's own parts (${tris} of ${intactTris} triangles)`);
    if (seed === 3) rows.push(`${label} ${tris}/${intactTris} tris, top ${wb.max.y.toFixed(2)}/${ib.max.y.toFixed(2)} m`);
    for (const g of [eager, lazy, again, intact]) g.dispose();
  }
}
console.log(rows.join('\n'));
console.log(`legacyWreck.selftest: ${kinds.length} part-built light kinds (the families and the regional variants) settle from their own parts — the litter's draws spent exactly, eager = deferred, deterministic, no higher than they stood, round their footprints, the intact's layout, windows dark`);
