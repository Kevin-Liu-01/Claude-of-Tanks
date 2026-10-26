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
assert.equal(TECH_TREES.length, 13, 'thirteen national trees');
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
const merge = layoutTree(tree('usa')).edges.find((edge) => edge.parent === 'm48a5_patton' && edge.child === 'm60a3');
assert.equal(merge.points.length, 3, 'the M48A5 enters the M60A3 from below');

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
assert.deepEqual(childrenOf(tree('usa'), 'm1a1_abrams_hc').map((n) => n.id).sort(), ['m1a1_abrams_aim', 'm1a1_abrams_sa']);
assert.equal(nodeForVehicle('t90a')?.node.id, 't90a_2004', 'a twin build resolves to its node');

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
// 2026-10-25 re-pin: the owner's Japan and South Korea tiers (the Type 10 and its dozer at X, the TK-X and 10B its tier IX
// prototypes; the K1A1 ahead of the K1E1 and K2B, the XK2 ahead of the K21, the K2 ahead of the K2B prototype).
assert.equal(digest, 'cb5a5ca24c440814', `tree content changed: re-pin to ${digest} if deliberate`);
console.log(`techTree: ${TECH_TREES.length} trees, ${drawn.length} vehicles, pin ${digest}`);
