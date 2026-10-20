// Receipt for src/world/maps/regional/lunarWorks.ts (the Earthrise 228 rebuild, 2026-10-18): a lunar station's field works
// and street clutter in its own stock, on the polar works' law (polarWorks.selftest.mjs). The owner's order keeps the works
// on every map; on the Moon they stand in the station's materials. Checked here:
//   - the variant table names the eight forms, and the Moon names them for the sandbag stacks, the wire, the barrier, the
//     cone, the bin and the yards' fence;
//   - each form spends exactly the draws its generic kind spent from the props' shared destructible stream (intact and
//     broken: brokenDraws.ts law), so every later pool keeps its geometry, and builds the same geometry twice;
//   - each breastwork stands in its sandbag stack's envelope (the same length and depth, its top within a third of a metre
//     of the stack's), the tether in the wire's span, the block row in the barrier's, the fence in the plank fence's run;
//   - each form keeps its kind's record radius, class, cover (collider), resistance and crush threshold, carries the
//     inhabit kit's attributes, faces every triangle along its normals, is posed on the ground (props.ts groundPose) with
//     a footprint (hw, hl) round its geometry, and a stack carries at most 60 % of a sandbag stack's triangles.
import assert from 'node:assert/strict';
import { STRUCTURE_VARIANTS } from './ksarGate.ts';
import { LUNAR_STRUCTURE_VARIANTS, LUNAR_WALL_PLANS } from './lunarWorks.ts';
import { DESTRUCTIBLE_TYPES } from '../inhabitKit.ts';
import { bSandbagBroken, buildSandbagStack } from '../fieldworksKit.ts';
import { getMapConfig } from '../index.ts';

const FORMS = LUNAR_STRUCTURE_VARIANTS;
// the sandbag stacks' records (props.ts LOCAL_TYPES): radius and resistance
const STACKS = { sandbagwall: { r: 1.5, keep: 0.975 }, sandbagbig: { r: 2.0, keep: 0.97 }, sandbagsmall: { r: 1.7, keep: 0.975 } };

assert.deepEqual(Object.keys(FORMS).sort(), ['barbedwire', 'barrier', 'cone', 'fenceplank', 'sandbagbig', 'sandbagsmall', 'sandbagwall', 'trashcan']);
assert.deepEqual(getMapConfig('moon').props.structureVariants, FORMS, 'the Moon dresses its works in the station\'s stock');
for (const id of ['mars', 'whiteout', 'verdant']) {
  const own = getMapConfig(id).props.structureVariants ?? {};
  assert.ok(!Object.values(own).some((name) => String(name).startsWith('lunar')), `${id}: no lunar form off the Moon`);
}

function counted(seed) {
  let a = seed >>> 0;
  const rng = () => { rng.draws++; a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  rng.draws = 0;
  return rng;
}
function draws(build, seed = 11) {
  const rng = counted(seed);
  build?.(rng)?.dispose?.();
  return rng.draws;
}
function bounds(g) {
  g.computeBoundingBox();
  return g.boundingBox;
}
function facing(g, label) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  let bad = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const ux = p.getX(i + 1) - ax, uy = p.getY(i + 1) - ay, uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax, vy = p.getY(i + 2) - ay, vz = p.getZ(i + 2) - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (Math.hypot(cx, cy, cz) < 1e-10) continue;
    const mx = n.getX(i) + n.getX(i + 1) + n.getX(i + 2), my = n.getY(i) + n.getY(i + 1) + n.getY(i + 2), mz = n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2);
    if (cx * mx + cy * my + cz * mz < 0) bad++;
  }
  assert.equal(bad, 0, `${label}: every triangle faces its normals`);
}
const tris = (g) => g.getAttribute('position').count / 3;

const lines = [];
for (const [kind, name] of Object.entries(FORMS)) {
  const form = STRUCTURE_VARIANTS[name];
  assert.ok(form, `${name}: in the variant table`);
  const label = `${name} (for ${kind})`;
  // the draws: the stacks' intact builds draw nothing from the props stream, their breaks the burst-bag remnant's
  const stack = kind.startsWith('sandbag');
  const legacyBuild = stack ? 0 : draws(DESTRUCTIBLE_TYPES[kind].build);
  const legacyBroken = stack ? draws((rng) => bSandbagBroken(rng)) : draws(DESTRUCTIBLE_TYPES[kind].broken);
  for (const seed of [3, 11, 97]) {
    assert.equal(draws(form.build, seed), legacyBuild, `${label}: the intact build spends the generic draws (seed ${seed})`);
    if (form.broken) assert.equal(draws(form.broken, seed), legacyBroken, `${label}: the break spends the generic draws (seed ${seed})`);
  }
  assert.equal(!!form.broken, !!(stack || DESTRUCTIBLE_TYPES[kind].broken), `${label}: a break exactly where the kind has one`);
  // deterministic, the inhabit kit's attributes, facing
  const a = form.build(counted(5)), b = form.build(counted(5)), broken = form.broken?.(counted(5));
  assert.deepEqual(Array.from(a.getAttribute('position').array), Array.from(b.getAttribute('position').array), `${label}: the same geometry twice`);
  for (const g of [a, ...(broken ? [broken] : [])]) {
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${label}: position, normal, uv and colour`);
    assert.ok(g.index === null, `${label}: non-indexed`);
    assert.ok(Array.from(g.getAttribute('position').array).every(Number.isFinite), `${label}: finite`);
    facing(g, label);
    assert.ok(bounds(g).min.y > -0.3, `${label}: grounded, nothing buried deeper than a driven stake`);
  }
  // the record: the kind's own (radius, class, cover, resistance, crush threshold), posed on the ground
  const generic = stack ? { cls: 'break', collider: true, ...STACKS[kind] } : DESTRUCTIBLE_TYPES[kind];
  for (const key of ['r', 'cls', 'collider', 'keep', 'crushMin']) assert.equal(form[key], generic[key], `${label}: the kind's ${key}`);
  assert.equal(form.groundPose, true, `${label}: posed on the ground under it`);
  const box = bounds(a);
  if (form.hw !== undefined) {
    assert.ok(box.max.x <= form.hw + 0.02 && -box.min.x <= form.hw + 0.02 && box.max.z <= form.hl + 0.02 && -box.min.z <= form.hl + 0.02,
      `${label}: its footprint (${form.hw.toFixed(2)} x ${form.hl.toFixed(2)}) round its geometry`);
  }
  assert.ok(Math.abs(box.max.y - form.h) < 0.06, `${label}: its height the geometry's (${box.max.y.toFixed(2)} vs ${form.h.toFixed(2)})`);
  // the envelope it stands in
  const legacyGeo = stack ? buildSandbagStack(kind) : DESTRUCTIBLE_TYPES[kind].build(counted(5));
  const legacy = bounds(legacyGeo);
  if (stack || form.hw !== undefined) {
    const along = stack ? (LUNAR_WALL_PLANS[kind].along === 'z' ? 'z' : 'x') : 'z', across = along === 'z' ? 'x' : 'z';
    const half = (bb, ax) => Math.max(bb.max[ax], -bb.min[ax]);
    assert.ok(Math.abs(half(box, along) - half(legacy, along)) < 0.12, `${label}: the generic length (${half(box, along).toFixed(2)} vs ${half(legacy, along).toFixed(2)})`);
    // (the yards' bag course stands a bag deep where the plank fence stood a board's: its own footprint holds it, above)
    if (kind !== 'fenceplank') assert.ok(half(box, across) <= half(legacy, across) + 0.06, `${label}: within the generic depth (${half(box, across).toFixed(2)} vs ${half(legacy, across).toFixed(2)})`);
  }
  assert.ok(box.max.y >= legacy.max.y - 0.25 && box.max.y <= legacy.max.y + 0.32, `${label}: the generic height (${box.max.y.toFixed(2)} vs ${legacy.max.y.toFixed(2)})`);
  if (stack) assert.ok(tris(a) <= tris(legacyGeo) * 0.6, `${label}: ${tris(a)} triangles, at most 60 % of the sandbag stack's ${tris(legacyGeo)}`);
  lines.push(`${name} ${tris(a)} tris (${kind} ${tris(legacyGeo)})`);
  for (const g of [a, b, broken, legacyGeo]) g?.dispose();
}
console.log(`lunarWorks.selftest: the Moon's works and clutter in the station's stock, eight forms each spending its kind's draws, in its envelope, posed on the ground: ${lines.join(', ')}`);
