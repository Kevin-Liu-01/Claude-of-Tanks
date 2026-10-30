// Receipt: every national tree holds the shape rules and draws cleanly (no connector through a node, no two parents'
// connectors crossing or overlapping), and the trees hold every production vehicle once, in its own nation's tree. The
// tree view is read-only: its data carries no census rating or tier note, and neither the data nor the screen reaches
// a progression module. The trees' content hash pins their shape: a deliberate change re-pins it here.
// First-party: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import '../vehicles/fleetRegistration.ts';
import { TANK_CATALOGS, TANK_SPECS } from '../vehicles/specs.ts';
import { layoutProblems, layoutTree } from './layout.ts';
import { displayTier, tierNumeral } from './tiers.ts';
import { TECH_TREES, childrenOf, nodeForVehicle, rootOf, validateTree, vehiclesOf } from './trees.ts';

const tree = (id) => TECH_TREES.find((entry) => entry.id === id);

// ------------------------------------------------------------------------------------------------ shape and layout
assert.equal(TECH_TREES.length, 14, 'fourteen national trees'); // 265: Denmark
for (const entry of TECH_TREES) {
  assert.deepEqual(validateTree(entry), [], `${entry.id} breaks a shape rule`);
  assert.deepEqual(layoutProblems(entry), [], `${entry.id} draws a connector badly`);
  assert.equal(rootOf(entry).parents.length, 0, `${entry.id} opens on its root`);
}

// The layout check sees what it should: a run through a node, and two parents' runs crossing.
const synthetic = (id, tier, lane, parents) => ({ id, tier, line: 'a', lane, parents, slot: 'line' });
const bad = { id: 't', nations: [], flagNation: 'USA', name: 't', lines: [{ id: 'a', name: 'a' }], nodes: [
  synthetic('a', 1, 0, []), synthetic('b', 2, 0, ['a']), synthetic('c', 3, 0, ['a']),
  synthetic('d', 1, 2, ['a']), synthetic('f', 1, 1, ['a']), synthetic('g', 4, 1, ['f']), synthetic('e', 4, 0, ['d']),
] };
assert.deepEqual(layoutProblems(bad).sort(), ['a -> c runs through b', 'a -> d runs through f', 'f -> g and d -> e: crossing']);
// A second parent drops into its child from above or below rather than sharing the left entry.
const merge = layoutTree(tree('japan')).edges.find((edge) => edge.parent === 'type10b' && edge.child === 'type10');
assert.equal(merge.points.length, 3, 'the Type 10B enters the Type 10 from above or below');

// ------------------------------------------------------------------------------------------------ the fleet, once each
const production = [...TANK_CATALOGS.production].sort();
const drawn = TECH_TREES.flatMap((entry) => entry.nodes.flatMap((n) => vehiclesOf(n))).sort();
assert.deepEqual(drawn, production, 'the trees hold every production vehicle exactly once');
for (const entry of TECH_TREES) {
  for (const n of entry.nodes) {
    for (const id of vehiclesOf(n)) {
      assert.ok(entry.nations.includes(TANK_SPECS[id].nation), `${id} (${TANK_SPECS[id].nation}) drawn in ${entry.id}`);
      assert.equal(nodeForVehicle(id)?.node, n);
      // the shown tier everywhere in the game is this column (tiers.ts, generated with the trees)
      assert.equal(displayTier(id), n.tier, `${id}: the shown tier is its column`);
      assert.equal(tierNumeral(id), ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n.tier]);
    }
  }
}
assert.equal(nodeForVehicle('not_a_tank'), null);
assert.equal(displayTier('not_a_tank'), 0, 'an id no tree draws sorts last');
assert.equal(tierNumeral('not_a_tank'), '', 'and shows no numeral');
assert.equal(displayTier('toString'), 0, 'the table answers own ids only');
assert.deepEqual(childrenOf(tree('usa'), 'm1a1_abrams_hc').map((n) => n.id).sort(), ['m1a1_abrams_aim']);
assert.equal(nodeForVehicle('t90a')?.node.id, 't90a_2004', 'a twin build resolves to its node');

// ------------------------------------------------------------------------------------------------ the 257 order
// Owner 2026-10-26 (257): "fix tank ordering. we need more tier 9s, stuff like leopard 2a6m,2a5, m1a2s, like these are all
// powerful tanks". The shown tier follows a capability score (stats against the vehicle's own class, generation, era and
// the 251 tier; ~/cot-launch-state/streams/tech-tree/RETIER-257.md), with the owner's anchors. These rules hold whatever
// the scores: the anchors, the owner's Japan and Korea rulings, the T-90 line and the equal-rank lineages never stepping
// down, an upgrade never below its base, and a prototype never above its production type.
assert.deepEqual(['leo2a5', 'leo2a6', 'leo2a6m', 'm1a2_abrams', 'm1a2_abrams_sepv2', 'm1a2_abrams_tusk'].map(displayTier),
  [9, 9, 9, 9, 9, 9], "the owner's Tier IX anchors");
assert.deepEqual(['type10', 'type10_dozer', 'type10_tk_x', 'type10b'].map(displayTier), [10, 10, 9, 9], "the owner's Type 10 tiers");
// the owner's Korean order (2026-10-25): the K1A1 above the K1E1 and the K2B, the XK2 above the K21, the K2 above the K2B
for (const [above, below] of [['k1a1', 'k1e1'], ['k1a1', 'k2b'], ['xk2_black_panther', 'k21'], ['k2_black_panther', 'k2b']]) {
  assert.ok(displayTier(above) > displayTier(below), `${above} shows above ${below}`);
}
// the T-72 and T-80 lineages' 251 rank, the era breaking ties
const ERA = { ww2: 0, 'cold-war': 1, modern: 2, 'next-generation': 3 };
// (258: matchmaking now reads the shown tier, so the 251 tiers these lineages compare are kept here)
const AT_251 = Object.freeze({ t72b3m_2022: 9, t72bu_1989: 8, pt91m: 8, t80: 8, t80b: 9, t80bv: 9, t80uk: 8, t84: 9 });
const rank = (id) => [AT_251[id], ERA[TANK_SPECS[id].era]];
const t90Line = ['t90_1992', 't90a_2004', 't90a_2006', 't90a_burlak_proto', 't90sm_2013', 't90am', 't90ms_2011', 't90m_proryv'];
t90Line.forEach((a, i) => t90Line.slice(i + 1).forEach((b) => assert.ok(displayTier(a) <= displayTier(b), `${a} never shows above ${b}`)));
for (const line of [['t72b3m_2022', 't72bu_1989', 'pt91m'], ['t80', 't80b', 't80bv', 't80uk', 't84']]) {
  line.forEach((a, i) => line.slice(i + 1).forEach((b) => {
    if (String(rank(a)) === String(rank(b))) assert.ok(displayTier(a) <= displayTier(b), `${a} never shows above ${b}`);
  }));
}
// 258b (Main 2026-10-26: the Leopard 2A5M stood at VII under its 2A5 at IX): every big family's base -> upgrade steps
// (gen_trees.py FAMILY_UPGRADES holds the same map), so an upgrade never shows below its base
const after = (base, ids) => ids.map((id) => [base, id]);
const FAMILY_UPGRADES = Object.freeze({
  leopard2: [['leopard2_proto', 'leo2a2'], ['leo2a2', 'leo2a3'], ['leo2a3', 'leo2a4'],
    ...after('leo2a4', ['leo2a4_v', 'leo2a4_otco', 'leo2a4m', 'leo2a4m_can', 'leo2a5', 'leo2_revolution', 'strv121']),
    ...after('leo2a5', ['leo2a5m', 'leo2a6', 'strv122']), ...after('leo2a6', ['leo2a6m', 'leo2a6_ua', 'leo2a7v'])],
  m1: [...after('m1a1', ['m1a1ha', 'm1a1_abrams_aim', 'm1a1_abrams_sa', 'm1a1_abrams_fep', 'm1a2_abrams']),
    ['m1a1ha', 'm1a1_abrams_hc'], ['m1a1_abrams_sa', 'ua_m1a1'], ['m1a2_abrams_sepv2', 'm1a2_abrams_sepv3'],
    ...after('m1a2_abrams', ['m1a2_abrams_sepv2', 'm1a2_abrams_tusk', 'ua_m1a2_abrams'])],
  t72: [['t72b_1987', 't72b3'], ['t72b3', 't72b3m_2016'], ['t72b3m_2016', 't72b3m_2022'],
    ...after('t72b3', ['t72b3_sich', 't72b3_zubr', 't72b3_zubr_ii', 't72b3_qilin', 't72b3_bastion_m', 't72b3m_hetman',
      't72b3m_hetman_ii', 't72b3m_wilk', 't72b3m_kunlun', 't72b3m_bulat_m'])],
  t80: [['t80', 't80b'], ['t80b', 't80bv'], ['t80bv', 't80u'], ['t80bv', 'ua_t80bv'], ['t84', 't84bm_oplot_m'],
    // 262: the T-84U Oplot (478DU9) -> the T-84BM Oplot-M (478DU9-1) -> its Thai export, the Oplot-T (478DU9-T)
    ['t84bm_oplot_m', 'bm_oplot_m'], ['bm_oplot_m', 'bm_oplot_t'],
    ...after('t80u', ['t80u_kursk', 't80uk', 't84', 't80u_zoria', 't80u_husarz', 't80u_yun', 't80u_bars_m'])],
  t90: [['t72bu', 't90_1992'], ['t90_1992', 't90'], ['t90a_2004', 't90a'], ['t90a_2006', 't90a_vladimir'],
    ['t90ms_2011', 't90ms_tagil'], ['t90sm_2013', 't90sm'], ['t90am', 't90m']],
  challenger: [['challenger1_mk1', 'challenger1_mk2'], ['challenger1_mk2', 'challenger1_mk3'], ['challenger1_mk3', 'challenger2'],
    ...after('challenger2', ['challenger2e', 'ua_challenger2', 'challenger3'])],
  leclerc: [['leclerc_s1', 'leclerc_s2'], ['leclerc_s2', 'leclerc_sxxi'], ['leclerc_sxxi', 'leclerc_xlr']],
  merkava: [['merkava1b', 'merkava2b'], ['merkava2b', 'merkava2d'], ['merkava2d', 'merkava3c'], ['merkava3c', 'merkava3_baz'],
    ['merkava3_baz', 'merkava3d'], ['merkava3d', 'merkava4'], ...after('merkava4', ['merkava4b', 'merkava4_trophy', 'merkava4_barak'])],
  other: [['chieftain3', 'chieftain5'], ['chieftain5', 'chieftain_mk9'], ['chieftain_mk9', 'chieftain_mk10'],
    ['centurion3', 'centurion5_2'], ['amx30', 'amx30b'], ['amx30b', 'amx30b2'], ['m48a5_patton', 'm60a1'], ['m60a1', 'm60a3'],
    ['m60a1', 'm60a2'], ['m60a3', 'sabra_mk2'], ['t62_1975', 't62mv1'], ['t64bv1', 't64bv_donbas'], ['t64bv1', 't64bm1m'], ['t64bv1', 't64bv'], ['t64bv_donbas', 't64b1v_2022'], ['type90', 'type90a'],
    ['ztz99a', 'ztz99a2'], ['c1_ariete', 'c2_ariete']],
  // 265: the Danish Leopards
  denmark: [['leo1a3dk', 'leo1a5dk'], ['leo1a5dk', 'leo2a5dk']],
});
const upgrades = Object.values(FAMILY_UPGRADES).flat();
for (const id of upgrades.flat()) assert.ok(TANK_SPECS[id] && displayTier(id), `${id}: a drawn vehicle in the family map`);
for (const [base, upgrade] of upgrades) assert.ok(displayTier(upgrade) >= displayTier(base), `${upgrade} never shows below ${base}`);
for (const [proto, production] of [['amx40_proto', 'amx40'], ['c1_ariete_proto_serie1', 'c1_ariete'],
  ['c1_ariete_preserie', 'c1_ariete'], ['c2_ariete_proto', 'c2_ariete'], ['challenger3_proto', 'challenger3'],
  ['challenger3_td', 'challenger3'], ['challenger3_td_rws', 'challenger3'],
  ['cv90_mk4_concept', 'cv90_mk4'], ['leo2_revolution_proto', 'leo2_revolution'], ['leopard2_proto', 'leo2a2'],
  ['t90a_burlak_proto', 't90a_burlak'], ['ztz100_prototype', 'ztz100'], ['ztz20_prototype', 'ztz20'], ['t84', 't84bm_oplot_m']]) {
  assert.ok(displayTier(proto) <= displayTier(production), `${proto} never shows above ${production}`);
}
// no tier piles up: at most about 1.6x the average
const perTier = new Map();
for (const id of drawn) perTier.set(displayTier(id), (perTier.get(displayTier(id)) ?? 0) + 1);
for (const [tier, count] of perTier) assert.ok(count <= Math.ceil(1.6 * drawn.length / 10), `Tier ${tier} holds ${count}`);

// ------------------------------------------------------------------------------------------------ read-only
for (const entry of TECH_TREES) {
  for (const n of entry.nodes) {
    assert.deepEqual(Object.keys(n).filter((key) => !['id', 'tier', 'line', 'lane', 'parents', 'slot', 'builds'].includes(key)), [],
      `${n.id} carries only the drawing`);
  }
}
const sources = [
  ...readdirSync(new URL('./', import.meta.url)).filter((file) => file.endsWith('.ts')).map((file) => `./${file}`),
  ...readdirSync(new URL('./nations/', import.meta.url)).map((file) => `./nations/${file}`),
  '../ui/techTree.ts', '../ui/techTreeStrings.ts',
];
for (const file of sources) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /progression\/|ratedTier|tierNote/, `${file} reaches nothing of the progression work`);
}

// ------------------------------------------------------------------------------------------------ pin
const digest = createHash('sha256').update(JSON.stringify(TECH_TREES)).digest('hex').slice(0, 16);
// 2026-10-26 re-pin (257): every tree re-tiered by capability and re-laid (RETIER-257.md), keeping the owner's anchors and
// the Japan and Korea rulings. 258b: the Leopard 2A5M drawn on its 2A5's node at IX, the T-84 at VI with its T-80U
// (FAMILY_UPGRADES above). 262: the Challenger 1 Mk 1 at VIII on the Challenger line, lane 0, off the Chieftain Mk 5
// beside the Mk 2; the fictional FV4030/5 and FV4030/6 (the rebuilt hull's turrets as their own tanks) at VIII, lanes 4
// and 5, off the Chieftain Mk 10.
// 2026-10-27 re-pin (262): the Danish Christian II drawn as a Nordic special at VIII in the Sweden tree (its special line
// added; 'Denmark' joins the tree's nations).
// 262: the T-55A joins Russia at I, stacked between the KV-2 and the T-62 obr. 1975.
// 262: China's line ends ZTZ-100 Prototype → ZTZ-100 → ZTZ-20 Prototype → ZTZ-20, all at X.
// 262: the new true T-64s, the T-64BM1M and the T-64B1V mod. 2022 at IV under the T-64BV mod. 2017
// and the T-64BV at III beside the T-64BV1.
// 262 (owner approval 2026-10-27): the T-84BM Oplot-M and Oplot-T at X on the Kharkiv line;
// the older pair renamed Object 478DU2 (VI) and T-84U Oplot (VI on its period 2000 ammunition, score 0.772), the T-84U
// leading the line's row 0 to the Oplot-M, the T-80U Kursk a VI side branch; the M1A1 SA (Ukraine) moves to lane 1 so
// the Oplot-M's connector clears it.
// 262: the Challenger 3 TD in the UK special lane at VIII (with its prototype's tier), its RWS field fit as its twin.
// 2026-10-28 re-cut (263, the merged release tree): every node above at once (the T-55A, the Challenger 1 Mk 1, the
// FV4030/5 and FV4030/6 (vickers-cr1-262 @ 31d83cdcdb), the Christian II, the ZTZ-20 pair, the four true T-64s, the two Oplots and the two Challenger 3 TDs).
// 2026-10-29 re-pin (263): vickers-cr1-262 a3b7d3f661's FV4030/5 and FV4030/6 at VIII, lanes 4 and 5, in the Challenger 1
// Granby's place.
// 2026-10-29 re-pin (265, Main's ruling on the Denmark line): the Denmark tree, its root the Leopard 1A3 DK (I) and the
// Leopard line on through the 1A5 DK (I, the DK-1 its twin) to the 2A5 DK (IX), the 2A7 DK held (2026-10-30, Main: its
// Barracuda lands later); the Christian II moves out of the Sweden tree into Denmark's special lane, and Sweden's nations
// are Sweden's alone again.
assert.equal(digest, '55930523db85a4b3', `tree content changed: re-pin to ${digest} if deliberate`);
console.log(`techTree: ${TECH_TREES.length} trees, ${drawn.length} vehicles, pin ${digest}`);
