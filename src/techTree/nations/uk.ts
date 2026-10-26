// The United Kingdom tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const UK_TREE: NationTree = Object.freeze({
  id: 'uk',
  nations: Object.freeze(['UK']),
  flagNation: 'UK',
  name: 'United Kingdom',
  lines: Object.freeze([
    { id: 'centurion', name: 'Centurion and Vickers' },
    { id: 'challenger', name: 'Chieftain to Challenger 3' },
    { id: 'chieftain', name: 'Late Chieftain' },
    { id: 'warrior', name: 'Warrior and Ajax' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Centurion and Vickers
    node({ id: 'centurion3', tier: 1, line: 'centurion', lane: 2, parents: [], slot: 'line' }),
    node({ id: 'centurion5_2', tier: 3, line: 'centurion', lane: 2, parents: ['centurion3'], slot: 'line' }),
    node({ id: 'vickers_mk1', tier: 3, line: 'centurion', lane: 3, parents: ['centurion5_2'], slot: 'line' }),
    node({ id: 'fv4034', tier: 5, line: 'centurion', lane: 2, parents: ['chieftain5'], slot: 'line' }),
    // Chieftain to Challenger 3
    node({
      id: 'chieftain5', tier: 2, line: 'challenger', lane: 1, parents: ['centurion3'], slot: 'line',
      builds: ['chieftain3'],
    }),
    node({ id: 'challenger1_mk2', tier: 5, line: 'challenger', lane: 1, parents: ['chieftain5'], slot: 'line' }),
    node({
      id: 'challenger1_mk3', tier: 6, line: 'challenger', lane: 1, parents: ['challenger1_mk2', 'fv4034'],
      slot: 'line',
    }),
    node({ id: 'challenger2', tier: 7, line: 'challenger', lane: 1, parents: ['challenger1_mk3'], slot: 'line' }),
    node({ id: 'challenger2e', tier: 8, line: 'challenger', lane: 1, parents: ['challenger2'], slot: 'line' }),
    node({ id: 'challenger3_proto', tier: 9, line: 'challenger', lane: 1, parents: ['challenger2e'], slot: 'line' }),
    node({ id: 'challenger3', tier: 10, line: 'challenger', lane: 1, parents: ['challenger3_proto'], slot: 'line' }),
    // Late Chieftain
    node({
      id: 'chieftain_mk10', tier: 5, line: 'chieftain', lane: 3, parents: ['chieftain5'], slot: 'line',
      builds: ['chieftain_mk9'],
    }),
    // Warrior and Ajax
    node({ id: 'fv510', tier: 3, line: 'warrior', lane: 0, parents: ['chieftain5'], slot: 'line' }),
    node({ id: 'fv510_milan', tier: 6, line: 'warrior', lane: 0, parents: ['fv510'], slot: 'line' }),
    node({ id: 'warrior_tes_h', tier: 7, line: 'warrior', lane: 0, parents: ['fv510_milan'], slot: 'line' }),
    node({ id: 'ajax', tier: 8, line: 'warrior', lane: 0, parents: ['warrior_tes_h'], slot: 'line' }),
    // Special
    node({ id: 'ares_apc', tier: 3, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
