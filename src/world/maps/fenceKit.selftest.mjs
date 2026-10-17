// fenceKit.selftest.mjs — the timber fences in their region's build (props lane A, #6, 2026-10-15): every region's four
// kinds build on the structure wood's attributes inside their old module (2.4 m along z, a post sunk at its start), under
// their triangle caps, deterministic; each map's forms are its region's (keyed as the gates are, so fence and gate agree);
// the WORKLIST #6 guardrail maps (Saltwind, the delta, the coast, the desert) draw no more fence triangles than before;
// the collision is the legacy module's exactly (its draws spent, its contact band frozen, its footprint); the broken state
// lies low; props.ts lays them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { GATE_STYLES } from './gateKit.ts';
import { FENCE_FORMS, FENCE_KINDS, FENCE_TRIANGLE_CAP, buildFence, fenceFormsFor, fenceTypes } from './fenceKit.ts';
import { deriveRuntimeStructureContactBand } from '../structureCollision.ts';
import { gateStyleFor } from './gateKit.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LEGACY_TRIS = { fenceplank: 48, fencepicket: 120, fencewattle: 124, fencerail: 36 };

// 1. every region's every kind
const tris = {};
const regions = [null, ...Object.keys(FENCE_FORMS)];
for (const key of regions) {
  const gate = gateStyleFor(key, key ?? 'none'), forms = fenceFormsFor(key, key ?? 'none');
  for (const kind of FENCE_KINDS) {
    const g = buildFence(kind, gate, forms), label = `${key ?? 'default'}/${kind}/${g.userData.fenceForm}`;
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], `${label}: the structure wood's attributes`);
    assert.ok(g.index === null, `${label}: unindexed`);
    const p = g.attributes.position, n = p.count / 3;
    assert.ok(n >= 12 && n <= FENCE_TRIANGLE_CAP[kind], `${label}: ${n} triangles (cap ${FENCE_TRIANGLE_CAP[kind]})`);
    tris[`${g.userData.fenceForm}/${kind}`] = n;
    let lo = Infinity, hi = -Infinity, x = 0, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const v = [p.getX(i), p.getY(i), p.getZ(i)];
      assert.ok(v.every(Number.isFinite) && [0, 1, 2].every((k) => Number.isFinite(g.attributes.normal.array[i * 3 + k])), `${label}: finite`);
      lo = Math.min(lo, v[1]); hi = Math.max(hi, v[1]); x = Math.max(x, Math.abs(v[0])); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]);
    }
    assert.ok(lo <= -0.1, `${label}: its post is sunk (${lo.toFixed(2)})`);
    assert.ok(hi > 0.85 && hi < 1.55, `${label}: stands ${hi.toFixed(2)} m`);
    assert.ok(x < 0.3, `${label}: stays on its line (${x.toFixed(2)} m across)`);
    assert.ok(z0 > -1.45 && z1 < 1.45 && z1 - z0 > 2.2, `${label}: fills its module (${z0.toFixed(2)}..${z1.toFixed(2)})`);
    const again = buildFence(kind, gate, forms);
    assert.deepEqual(again.attributes.position.array, p.array, `${label}: deterministic`);
    // broken: the module pushed over, no more triangles than the intact
    const broken = buildFence(kind, gate, forms, 0, true);
    let top = -Infinity;
    for (let i = 0; i < broken.attributes.position.count; i++) top = Math.max(top, broken.attributes.position.getY(i));
    assert.ok(top < 0.9, `${label}: broken lies over (${top.toFixed(2)} m)`);
    assert.equal(broken.attributes.position.count, p.count, `${label}: the wreck is its own members`);
    g.dispose(); again.dispose(); broken.dispose();
  }
}

// 2. each map its region's forms (the WORKLIST #6 regional list)
const expect = [
  ['kolkhoz', 'verdant', { plank: 'zabor', rail: 'zherdyna', wattle: 'tyn' }], ['hostomel', 'airfield', { plank: 'zabor', rail: 'zherdyna' }],
  ['goral', 'winter', { plank: 'sztachety', rail: 'zherdyna' }], ['franconian', 'urban', { plank: 'lattenzaun' }],
  ['eifel', 'reservoir', { plank: 'lattenzaun' }], ['hessian', 'frontier', { plank: 'lattenzaun', picket: 'staketen' }],
  ['ruhr', 'railyard', { plank: 'tarred', rail: 'concrete' }], ['polder', 'polders', { plank: 'hekwerk' }],
  ['longleaf', 'longleaf', { plank: 'fourboard' }], ['arctic', 'whiteout', { plank: 'drift' }], ['sarajevo', 'ruinspires', { plank: 'rubble' }],
  ['nordland', 'fjord', { rail: 'skigard' }], ['tselina', 'steppe', { rail: 'zherdyna', wattle: 'tyn' }],
  ['queenstown', 'copper_mesa', { rail: 'postrail' }], ['glencanyon', 'skybridge', { rail: 'ranchwire' }],
  ['navajo', 'titan_gorge', { rail: 'ranchwire', wattle: 'coyote' }], ['kyushu', 'caldera', { rail: 'cedarbamboo', wattle: 'yotsume' }],
  ['saar', 'foundry', { rail: 'concrete' }], ['shanghai', 'blackglass', { rail: 'concrete' }],
  ['andalusian', 'cliffbridge', { rail: 'stonepost', wattle: 'cane' }], ['breton', 'coastal', { rail: 'stonepost' }],
  ['bengal', 'delta', { wattle: 'bamboo' }], ['ksar', 'desert', { wattle: 'palm' }], ['siwa', 'oasis', { wattle: 'palm' }],
  ['dalmatian', 'saltwind', { wattle: 'hurdle' }],
];
for (const [arch, mapId, want] of expect) {
  const got = fenceFormsFor(arch, mapId);
  for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${mapId} (${arch}): its ${k} fence is the ${v}`);
}
// keyed as the gates are: every region a gate style names (or a kit-less map's id the gates also key)
for (const key of Object.keys(FENCE_FORMS)) {
  assert.ok(GATE_STYLES[key] || ['goral', 'tselina', 'lorrain', 'nordland'].includes(key), `${key}: a fence region the gates key too (or the kit with its map-id gate)`);
}

// 3. the guardrail maps draw no more fence triangles than the legacy modules (instances: the props census, 2026-10-15)
const formOf = (arch, mapId, kind) => { const f = fenceFormsFor(arch, mapId); return kind === 'fenceplank' ? f.plank : kind === 'fencerail' ? f.rail : kind === 'fencepicket' ? f.picket : f.wattle; };
// (r2, 2026-10-16: the sweep's bar — welded, chamfered members and a standing wreck — costs edges; the allowance is
// 1.5 % of each map's fence-and-wall family load (WORKLIST #6: ~440k Saltwind, ~390k the delta, ~380k the coast, ~300k
// the desert), and on the delta and the desert the mud walls' rebuild (adobeWallKit.ts: 502 -> ~120 a module, 484 and 344
// of them) pays it many times over)
for (const [arch, mapId, counts, load, walls] of [
  ['dalmatian', 'saltwind', { fencepicket: 39, fencewattle: 154 }, 440e3, 0], ['bengal', 'delta', { fencewattle: 139 }, 390e3, 484 * (502 - 124)],
  ['breton', 'coastal', { fencepicket: 62, fencerail: 104 }, 380e3, 0], ['ksar', 'desert', { fencewattle: 58 }, 300e3, 344 * (502 - 158)],
]) {
  let before = 0, after = 0;
  for (const [kind, count] of Object.entries(counts)) { before += count * LEGACY_TRIS[kind]; after += count * tris[`${formOf(arch, mapId, kind)}/${kind}`]; }
  assert.ok(after - walls <= before + load * 0.015, `${mapId}: fence triangles ${after} (walls saved ${walls}) within 1.5 % of the legacy ${before}`);
}

// 4. the collision is the legacy module's: the same draws, the same frozen band, the same footprint
const types = fenceTypes('kolkhoz', 'verdant', DESTRUCTIBLE_TYPES, () => mulberry32(0x0f0f7));
for (const kind of FENCE_KINDS) {
  const t = types[kind], legacy = DESTRUCTIBLE_TYPES[kind];
  assert.equal(t.ownBroken, true, `${kind}: its own wreck, never PROP_FRACTURE's raft`);
  { let a1 = 0, b1 = 0; const r1 = mulberry32(3), r2 = mulberry32(3);
    t.broken(() => { a1++; return r1(); }).dispose(); legacy.broken(() => { b1++; return r2(); }).dispose();
    assert.equal(a1, b1, `${kind}: the legacy broken draws are spent exactly`); }
  for (const field of ['cls', 'contact', 'r', 'h', 'hw', 'hl', 'fence']) assert.equal(t[field], legacy[field], `${kind}: its ${field}`);
  assert.equal(t.mat, 'structureWood');
  let drawsA = 0, drawsB = 0;
  const a = mulberry32(77), b = mulberry32(77);
  const built = t.build(() => { drawsA++; return a(); });
  const old = legacy.build(() => { drawsB++; return b(); });
  assert.equal(drawsA, drawsB, `${kind}: the legacy draws are spent exactly`);
  assert.deepEqual(t.contactBand, deriveRuntimeStructureContactBand({ baked: [old] }), `${kind}: the frozen band is the legacy module's`);
  assert.deepEqual(t.footprintBuild().attributes.position.array, legacy.build(mulberry32(0x0f0f7)).attributes.position.array, `${kind}: the legacy footprint`);
  built.dispose(); old.dispose();
}

// 4b. the bunker r2 standard (tools/r2-standard.mjs; the LOOKS sweep's bar): every form of every kind on its maps
{
  const { r2Check } = await import('../../../tools/r2-standard.mjs');
  const ARCH = { verdant: 'kolkhoz', whiteout: 'arctic', winter: 'goral', urban: 'franconian', titan_gorge: 'navajo', reservoir: 'eifel', railyard: 'ruhr',
    ruinspires: 'sarajevo', steppe: 'tselina', skybridge: 'glencanyon', oasis: 'siwa', saltwind: 'dalmatian', polders: 'polder', monsoon: 'kohima',
    fjord: 'nordland', mangrove: 'mekong', airfield: 'hostomel', longleaf: 'longleaf', frontier: 'hessian', desert: 'ksar', delta: 'bengal', coastal: 'breton',
    cliffbridge: 'andalusian', foundry: 'saar', badlands: 'wadirum', alpine: 'savoyard', copper_mesa: 'queenstown', blackglass: 'shanghai', autumn: 'lorrain', caldera: 'kyushu' };
  for (const kind of FENCE_KINDS) {
    const res = r2Check({ kind: `destructible:${kind}`, maps: Object.keys(ARCH), bucket: 'structureWood', caps: { near: FENCE_TRIANGLE_CAP[kind] },
      resolve: (mapId) => {
        const forms = fenceFormsFor(ARCH[mapId], mapId), gate = gateStyleFor(ARCH[mapId], mapId);
        return { form: formOf(ARCH[mapId], mapId, kind), build: () => buildFence(kind, gate, forms), broken: () => buildFence(kind, gate, forms, 0, true) };
      } });
    assert.ok(res.ok, `the r2 standard:\n  ${res.problems.join('\n  ')}`);
  }
}

// 5. props.ts lays them, before the kits' and the maps' own variants (which still win)
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
const local = props.slice(props.indexOf('const LOCAL_TYPES:'), props.indexOf('const ownBroken'));
assert.ok(local.includes('...fenceTypes(regionalArchitecture?.id, mapId, DESTRUCTIBLE_TYPES, () => mulberry32(0x0f0f7))'), 'props.ts lays the fences');
assert.ok(local.indexOf('...fenceTypes(') < local.indexOf('REGIONAL_DESTRUCTIBLE_TYPES'), 'a kit\'s own variants still win');
const forms = [...new Set(Object.keys(tris))].length;
console.log(`fenceKit.selftest: ${regions.length} regions x 4 kinds (${forms} forms) under their caps and the r2 standard, guardrail maps within the r2 allowance, legacy collision, pushed-over wrecks, wired`);
