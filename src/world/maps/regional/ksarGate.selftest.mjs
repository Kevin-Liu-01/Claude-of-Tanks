// ksarGate.selftest — the ksar gate post in place of the steel checkpoint hut (the scenery lane, b16; gauntlet wave
// 121: "a modern prefab with blue glass windows" at Sirocco Wadi's gates) and, b25, its walls on the desert mud walls'
// own render (waves 173 and 174: "carved, pharaonic-looking glyphs", "a flat, unweathered decal with straight crowns and
// a hard ground line") and the ksar watch hut in place of the steel guard post ("the corrugated-metal shed is the wrong
// building type for ksour country"). Pinned:
//   1. the gate post: position, normal, uv and colour; two groups, the mud render's and the timber's, by KSAR_GATE_MATS;
//      inside the checkpoint hut's footprint (its key, ground fit and beats are kept); its door timber on the road side
//      (+z), recessed between mud jambs under a timber lintel; its parapet's crown worn (bitten and wandering, never
//      level); its foot in an apron of washed-off mud that sinks under the ground; within its budget; deterministic;
//   2. the broken heap: low, inside the footprint, a corner standing, the same groups;
//   3. the watch hut: the same law inside the guard post's footprint: groups, a timber door on +z under its lintel, the
//      joists' ends out of the front and back faces under the roof, a ladder to the terrace, a worn crown, an apron;
//      its fallen heap;
//   4. the wiring: the variant table; the props' local types merging a map's variants by name (an unknown name throws);
//      every checkpoint on Desert and Redrock the gate post and every guard post the watch hut; each build spending its
//      key's draws exactly; the props' building mud (a clone of the walls' mud on the walls' program, its own shape
//      uniform with no crown slump) and the pools' materials by group.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../structureKit.ts';
import {
  KSAR_GATE_MATS, KSAR_GATE_POST, KSAR_WATCH_HUT, STRUCTURE_VARIANTS,
  buildKsarGatePost, buildKsarGatePostBroken, buildKsarWatchHut, buildKsarWatchHutBroken,
} from './ksarGate.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hut = DESTRUCTIBLE_BUILDING_TYPES.checkpointhut, guard = DESTRUCTIBLE_BUILDING_TYPES.guardpost;

/** The vertices of one group of a non-indexed grouped geometry. */
function groupVerts(g, materialIndex) {
  const p = g.attributes.position, out = [];
  for (const grp of g.groups) if (grp.materialIndex === materialIndex) for (let i = grp.start; i < grp.start + grp.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return out;
}
function common(g, label, budget, foot) {
  const p = g.attributes.position;
  assert.ok(g.attributes.normal && g.attributes.uv && g.attributes.color, `${label}: position, normal, uv and colour`);
  assert.ok(!g.index, `${label}: grouped, not indexed`);
  assert.deepEqual(g.groups.map((x) => x.materialIndex), [0, 1], `${label}: the mud's group and the timber's`);
  assert.equal(g.groups[0].start, 0); assert.equal(g.groups[1].start, g.groups[0].count);
  assert.equal(g.groups[0].count + g.groups[1].count, p.count, `${label}: every vertex in a group`);
  const tris = p.count / 3;
  assert.ok(tris <= budget, `${label}: within its budget (${tris} triangles of ${budget})`);
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(Math.max(-b.min.x, b.max.x) <= foot.hw + 1e-6 && Math.max(-b.min.z, b.max.z) <= foot.hl + 1e-6 && b.max.y <= foot.h + 1e-6,
    `${label}: inside its key's footprint (${b.max.x.toFixed(2)} x ${b.max.z.toFixed(2)} x ${b.max.y.toFixed(2)} of ${foot.hw} x ${foot.hl} x ${foot.h})`);
  return b;
}
/** The crown of a parapet run: the tops of its mud vertices in a band, by position along it. */
function crownSpread(mud, select, along) {
  const tops = new Map();
  for (const v of mud) if (select(v)) { const k = Math.round(along(v) * 10); tops.set(k, Math.max(tops.get(k) ?? -Infinity, v[1])); }
  const ys = [...tops.values()];
  return Math.max(...ys) - Math.min(...ys);
}

// ---------------------------------------------------------------------------------------------- 1. the gate post
for (const seed of [1, 7, 2024]) {
  const g = buildKsarGatePost(mulberry32(seed));
  common(g, 'the gate post', 600, hut);
  const mud = groupVerts(g, 0), wood = groupVerts(g, 1);
  // the door: timber on the road side, low, between mud jambs that stand proud of it; a timber lintel over it
  const door = wood.filter(([x, y, z]) => z > 2.6 && Math.abs(x) < 0.55 && y < 2.1);
  assert.ok(door.length >= 12, `a timber door on the road side (${door.length} vertices)`);
  const doorFront = Math.max(...door.map((v) => v[2]));
  const jambs = mud.filter(([x, y, z]) => z > 2.6 && Math.abs(x) > 0.5 && Math.abs(x) < 0.75 && y < 2.1);
  assert.ok(jambs.length >= 12 && Math.max(...jambs.map((v) => v[2])) > doorFront + 0.05, 'recessed between mud jambs');
  const lintel = wood.filter(([x, y, z]) => z > 2.6 && y > 2.1 && y < 2.32);
  assert.ok(lintel.length >= 12, `a timber lintel over it (${lintel.length} vertices)`);
  // the parapet's crown worn: the front run's tops (between the merlons) spread by its bites and its wander
  const spread = crownSpread(mud, ([x, y, z]) => y > 2.9 && y < 3.2 && z > 2.3 && z < 2.6 && Math.abs(x) < 1.7, (v) => v[0]);
  assert.ok(spread > 0.06, `its crown bitten and wandering, never level (${spread.toFixed(3)} m)`);
  // the apron: mud at the foot out past the walls, sinking under the ground at its edge
  const under = mud.filter(([, y]) => y < -0.04);
  assert.ok(under.length >= 24, `its foot in an apron sinking under the ground (${under.length} vertices)`);
}
{
  const a = buildKsarGatePost(mulberry32(9)), b = buildKsarGatePost(mulberry32(9));
  assert.deepEqual(Array.from(a.attributes.position.array), Array.from(b.attributes.position.array), 'deterministic for a seed');
}

// ---------------------------------------------------------------------------------------------- 2. the broken heap
{
  const g = buildKsarGatePostBroken(mulberry32(5));
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(b.max.y < 1.8 && Math.max(-b.min.x, b.max.x) <= hut.hw && Math.max(-b.min.z, b.max.z) <= hut.hl, 'a low heap inside the footprint');
  assert.ok(b.max.y > 1.2, 'a corner of its walls still standing');
  assert.deepEqual(g.groups.map((x) => x.materialIndex), [0, 1], 'the same groups');
}

// ---------------------------------------------------------------------------------------------- 3. the watch hut
for (const seed of [2, 11]) {
  const g = buildKsarWatchHut(mulberry32(seed));
  common(g, 'the watch hut', 660, guard);
  const mud = groupVerts(g, 0), wood = groupVerts(g, 1);
  const door = wood.filter(([x, y, z]) => z > 1.3 && Math.abs(x) < 0.45 && y < 1.95);
  assert.ok(door.length >= 12, `a timber door on its front (${door.length} vertices)`);
  assert.ok(wood.filter(([x, y, z]) => z > 1.3 && y > 1.95 && y < 2.2).length >= 12, 'under a timber lintel');
  // the joists' ends out of the front and back faces, a hand under the roof
  for (const sz of [-1, 1]) {
    const ends = wood.filter(([, y, z]) => y > 2.5 && y < 2.8 && z * sz > 1.3);
    assert.ok(ends.length >= 4 * 24 * 0.9, `the joists' ends out of the ${sz > 0 ? 'front' : 'back'} face (${ends.length} vertices)`);
  }
  // the ladder leaning on its right side wall, up to the terrace
  const ladder = wood.filter(([x]) => x > 1.45);
  assert.ok(ladder.length >= 7 * 24 * 0.9 && Math.max(...ladder.map((v) => v[1])) > 3.0, `a ladder to the terrace (${ladder.length} vertices)`);
  const spread = crownSpread(mud, ([x, y, z]) => y > 3.15 && y < 3.5 && z > 1.1 && z < 1.4 && Math.abs(x) < 1.3, (v) => v[0]);
  assert.ok(spread > 0.06, `its crown worn (${spread.toFixed(3)} m)`);
  assert.ok(mud.filter(([, y]) => y < -0.04).length >= 24, 'its apron');
}
{
  const g = buildKsarWatchHutBroken(mulberry32(3));
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(b.max.y < 2.0 && b.max.y > 1.2 && Math.max(-b.min.x, b.max.x) <= guard.hw && Math.max(-b.min.z, b.max.z) <= guard.hl, 'the hut fallen: a heap round a standing corner');
  assert.deepEqual(g.groups.map((x) => x.materialIndex), [0, 1], 'the same groups');
}

// ---------------------------------------------------------------------------------------------- 4. the wiring
{
  assert.deepEqual([...KSAR_GATE_MATS], ['fieldMudBuilding', 'wood'], 'the mud render and the timber, by group');
  assert.equal(STRUCTURE_VARIANTS.ksargate, KSAR_GATE_POST, 'the variant table names the gate post');
  assert.equal(STRUCTURE_VARIANTS.ksarwatchhut, KSAR_WATCH_HUT, 'and the watch hut');
  for (const [variant, key] of [[KSAR_GATE_POST, hut], [KSAR_WATCH_HUT, guard]]) {
    assert.ok(variant.cls === 'break' && variant.contact === 'ob' && variant.collider === true
      && variant.keep === key.keep && variant.crushMin === key.crushMin, 'its key\'s class, resistance and crush threshold');
    assert.ok(variant.mat === 'fieldMudBuilding' && variant.mats === KSAR_GATE_MATS && !variant.instanceTintStrength,
      'the building mud and the timber; no instance tint (the walls\' program carries no instance colour)');
    // the destructible geometry stream (one for every pool) keeps its place: the build takes exactly its key's draws
    const count = (fn) => { let n = 0; const base = mulberry32(77); fn(() => { n++; return base(); }); return n; };
    assert.equal(count((rng) => variant.build(rng)), count((rng) => key.build(rng)), 'the build takes its key\'s draws, no more, no fewer');
    assert.equal(count((rng) => variant.broken(rng)), count((rng) => key.broken(rng)), 'and so does the broken build');
    const once = variant.build(mulberry32(1)), again = variant.build(mulberry32(999));
    assert.deepEqual(Array.from(once.attributes.position.array), Array.from(again.attributes.position.array), 'its geometry from its own seed, whatever the stream');
  }
  const props = readFileSync(new URL('../../props.ts', import.meta.url), 'utf8');
  assert.match(props, /structureVariants\?: Readonly<Record<string, keyof typeof STRUCTURE_VARIANTS>>;/, 'a map names its variants');
  assert.match(props, /\.\.\.Object\.fromEntries\(Object\.entries\(P\.structureVariants \?\? \{\}\)\.map\(\(\[key, name\]\) => \{\n\s*const variant = STRUCTURE_VARIANTS\[name\];\n\s*if \(!variant\) throw new Error\(`world\/props: unknown structure variant \$\{name\} for \$\{key\}`\);/,
    'the props\' local types take them by name, last, and an unknown name throws');
  assert.match(props, /mats\.fieldMudBuilding = mats\.fieldMud\.clone\(\);/, 'the building mud: a clone of the walls\' mud');
  assert.match(props, /const mudShapeBuilding: THREE\.IUniform<THREE\.Vector3> = \{ value: new THREE\.Vector3\(3\.3, 1\.8, 0\) \};/, 'its own shape uniform, no crown slump');
  assert.match(props, /materialKind === 'fieldMudBuilding' \? mudBuildingHook/, 'the walls\' mud hook on it');
  assert.match(props, /: materialKind === 'fieldMudBuilding' \? 'fieldMud' : materialKind;/, 'on the walls\' program');
  assert.match(props, /\? meta\.mats\.map\(\(key\) => mats\[key\] \|\| mats\.baked\) : single;/, 'a pool\'s materials by its geometry\'s groups');
  assert.match(props, /mudShapeFor\(geoI\.boundingBox!, mudShapeBuilding\.value\)\.setZ\(0\);/, 'the building\'s top and shoulder, its crown whole');
  const desert = readFileSync(new URL('../desert.ts', import.meta.url), 'utf8');
  const badlands = readFileSync(new URL('../badlands.ts', import.meta.url), 'utf8');
  assert.match(desert, /destructibleBuildings: \['deserttent', 'commandtent', 'checkpointhut', 'guardpost'\],\n\s*structureVariants: \{ checkpointhut: 'ksargate', guardpost: 'ksarwatchhut' \},/,
    'Desert: its checkpoints the gate post and its guard posts the watch hut (the list keeps its entries: every later seat stays)');
  assert.match(badlands, /structureVariants: \{ checkpointhut: 'ksargate', guardpost: 'ksarwatchhut' \},/, 'Redrock likewise');
  assert.match(desert, /structure: 'checkpointhut'/, 'the gate beats keep their key (and with it their footprint and ground fit)');
}
console.log('ksarGate.selftest: the gate post and the watch hut on the desert mud walls\' render with timber doors, lintels and joists (two groups), crowns worn, feet in their aprons, inside their keys\' footprints; their heaps; Desert\'s and Redrock\'s checkpoints and guard posts by name; the building mud on the walls\' program');
