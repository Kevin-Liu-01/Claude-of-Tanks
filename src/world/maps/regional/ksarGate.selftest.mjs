// ksarGate.selftest — the ksar gate post in place of the steel checkpoint hut (the scenery lane, b16; gauntlet wave
// 121: "a modern prefab with blue glass windows" at Sirocco Wadi's gates). Pinned:
//   1. the build: position, normal, uv and colour; inside the checkpoint hut's footprint (its key, ground fit and beats
//      are kept) and over its own collider; its render bright, its openings dark and never glazed (no blue), a door on
//      the road side (+z) under a timber lintel, a parapet over the flat roof; within its budget; deterministic;
//   2. the broken heap: low, inside the footprint, a corner standing;
//   3. the wiring: the variant table, the props' local types merging a map's variants by name (an unknown name
//      throws), every checkpoint on Desert and Redrock the gate post, the destructible geometry stream kept.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_BUILDING_TYPES, REGIONAL_DESTRUCTIBLE_TYPES } from '../structureKit.ts';
import { KSAR_GATE_POST, STRUCTURE_VARIANTS, buildKsarGatePost, buildKsarGatePostBroken } from './ksarGate.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hut = DESTRUCTIBLE_BUILDING_TYPES.checkpointhut;

// ---------------------------------------------------------------------------------------------- 1. the build
for (const seed of [1, 7, 2024]) {
  const g = buildKsarGatePost(mulberry32(seed));
  const p = g.attributes.position, c = g.attributes.color;
  assert.ok(g.attributes.normal && g.attributes.uv && c && c.itemSize === 3, 'position, normal, uv and a colour per vertex');
  const tris = (g.index ? g.index.count : p.count) / 3;
  assert.ok(tris <= 400, `within its budget (${tris} triangles)`);
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(Math.max(-b.min.x, b.max.x) <= hut.hw + 1e-6 && Math.max(-b.min.z, b.max.z) <= hut.hl + 1e-6 && b.max.y <= hut.h + 1e-6 && b.min.y >= -1e-6,
    `inside the checkpoint hut's footprint (${b.max.x.toFixed(2)} x ${b.max.z.toFixed(2)} x ${b.max.y.toFixed(2)} of ${hut.hw} x ${hut.hl} x ${hut.h})`);
  // the collider over the body (the gate post's own half extents, plus the contact margin, cover its walls at the foot)
  let footX = 0, footZ = 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.3 && p.getY(i) > 0.05 && c.getX(i) > 0.5) { footX = Math.max(footX, Math.abs(p.getX(i))); footZ = Math.max(footZ, Math.abs(p.getZ(i))); }
  assert.ok(KSAR_GATE_POST.hw >= footX - 0.1 && KSAR_GATE_POST.hl >= 2.6, `its collider over its walls (${KSAR_GATE_POST.hw} x ${KSAR_GATE_POST.hl} for ${footX.toFixed(2)} x ${footZ.toFixed(2)})`);
  // the colours: render bright, openings dark, timber brown, and nothing glazed (no blue-dominant vertex)
  let dark = 0, darkFront = 0, timberHigh = 0, render = 0, blue = 0;
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i), gg = c.getY(i), bl = c.getZ(i), l = 0.2126 * r + 0.7152 * gg + 0.0722 * bl;
    if (bl > r + 0.03 && bl > gg + 0.03) blue++;
    if (l < 0.1) { dark++; if (p.getZ(i) > 2.6 && p.getY(i) < 2.2) darkFront++; }
    else if (r > gg * 1.15 && l < 0.4 && p.getY(i) > 1.9) timberHigh++;
    else if (l > 0.65) render++; // (the render, its damp foot included)
  }
  assert.equal(blue, 0, 'no glazing: no blue in its colours');
  assert.ok(dark > 0 && darkFront >= 12, `a dark, unglazed door on the road side (${darkFront} vertices)`);
  assert.ok(timberHigh >= 24, `timber lintels over the openings (${timberHigh} vertices)`);
  assert.ok(render > c.count * 0.5, 'most of it the render');
  // the parapet: render standing over the roof's edge, the roof inside it lower
  let parapetTop = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) > 1.7 && c.getX(i) > 0.5) parapetTop = Math.max(parapetTop, p.getY(i));
  assert.ok(parapetTop > 3.0, `a parapet round the roof (${parapetTop.toFixed(2)} m)`);
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
}

// ---------------------------------------------------------------------------------------------- 3. the wiring
{
  assert.equal(STRUCTURE_VARIANTS.ksargate, KSAR_GATE_POST, 'the variant table names the gate post');
  assert.ok(KSAR_GATE_POST.cls === 'break' && KSAR_GATE_POST.contact === 'ob' && KSAR_GATE_POST.collider === true
    && KSAR_GATE_POST.keep === hut.keep && KSAR_GATE_POST.crushMin === hut.crushMin, 'the hut\'s class, resistance and crush threshold');
  assert.equal(KSAR_GATE_POST.mat, 'regionalPlaster', 'on the map\'s regional plaster');
  // the destructible geometry stream (one for every pool) keeps its place: the post takes exactly the hut's draws
  const count = (fn) => { let n = 0; const base = mulberry32(77); fn(() => { n++; return base(); }); return n; };
  assert.equal(count((rng) => KSAR_GATE_POST.build(rng)), count((rng) => hut.build(rng)), 'the build takes the hut\'s draws, no more, no fewer');
  assert.equal(count((rng) => KSAR_GATE_POST.broken(rng)), count((rng) => hut.broken(rng)), 'and so does the broken build');
  const once = KSAR_GATE_POST.build(mulberry32(1)), again = KSAR_GATE_POST.build(mulberry32(999));
  assert.deepEqual(Array.from(once.attributes.position.array), Array.from(again.attributes.position.array), 'the post from its own seed, whatever the stream');
  const props = readFileSync(new URL('../../props.ts', import.meta.url), 'utf8');
  assert.match(props, /structureVariants\?: Readonly<Record<string, keyof typeof STRUCTURE_VARIANTS>>;/, 'a map names its variants');
  assert.match(props, /\.\.\.Object\.fromEntries\(Object\.entries\(P\.structureVariants \?\? \{\}\)\.map\(\(\[key, name\]\) => \{\n\s*const variant = STRUCTURE_VARIANTS\[name\];\n\s*if \(!variant\) throw new Error\(`world\/props: unknown structure variant \$\{name\} for \$\{key\}`\);/,
    'the props\' local types take them by name, last, and an unknown name throws');
  const desert = readFileSync(new URL('../desert.ts', import.meta.url), 'utf8');
  const badlands = readFileSync(new URL('../badlands.ts', import.meta.url), 'utf8');
  assert.match(desert, /destructibleBuildings: \['deserttent', 'commandtent', 'checkpointhut', 'guardpost'\],\n\s*structureVariants: \{ checkpointhut: 'ksargate' \},/,
    'Desert: its gates\' checkpoints and the scattered one the gate post (the list keeps its entry: every later seat stays)');
  // (the Redrock lane, round 9: Redrock's checkpoints are the Wadi Rum kit's own fuel and water post now — the gauntlet's
  // wave 261 read the gate post at its fuel points as "a plain tan cube" — and its pillboxes the desert post's sangar)
  // (round 10: the barrack and the post on the map's plaster, its desert and camp tents the Bedouin's: wadiRumPosts.ts)
  assert.match(badlands, /structureVariants: \{ bunker: 'sangar', quonsethut: 'rumbarrack', checkpointhut: 'rumpost', motorpool: 'rumshed',\n\s*deserttent: 'bedouintent', tent: 'bedouincamp' \},/,
    'Redrock: its pillboxes the sangar, its checkpoints the Desert Patrol\'s post, its barrack and tents the Wadi Rum ones');
  assert.ok(STRUCTURE_VARIANTS.rumpost && !REGIONAL_DESTRUCTIBLE_TYPES.wadirum, 'Redrock: its checkpoints the post on the map\'s plaster (no timber-printed kit variant)');
  assert.ok(STRUCTURE_VARIANTS.sangar, 'the variant table names the sangar');
  assert.match(desert, /structure: 'checkpointhut'/, 'the gate beats keep their key (and with it their footprint and ground fit)');
}
console.log('ksarGate.selftest: the gate post of plastered mud brick inside the hut\'s footprint (a dark door under a lintel, no glazing, a parapet), its heap, Desert\'s checkpoints by name, Redrock\'s the Wadi Rum kit\'s post and its sangar');
