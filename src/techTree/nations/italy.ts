// The Italy tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const ITALY_TREE: NationTree = Object.freeze({
  id: 'italy',
  nations: Object.freeze(['Italy']),
  flagNation: 'Italy',
  name: 'Italy',
  lines: Object.freeze([
    { id: 'ariete', name: 'Carro 45t to C2 Ariete' },
    { id: 'dardo', name: 'Dardo and Lynx' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Carro 45t to C2 Ariete
    node({ id: 'carro45t', tier: 3, line: 'ariete', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'c1_ariete_preserie', tier: 5, line: 'ariete', lane: 0, parents: ['carro45t'], slot: 'line' }),
    node({
      id: 'c1_ariete', tier: 7, line: 'ariete', lane: 0, parents: ['c1_ariete_preserie'], slot: 'line',
      builds: ['c1_ariete_proto_serie1'],
    }),
    node({ id: 'c2_ariete_proto', tier: 9, line: 'ariete', lane: 0, parents: ['c1_ariete'], slot: 'line' }),
    node({ id: 'c2_ariete', tier: 9, line: 'ariete', lane: 1, parents: ['c2_ariete_proto'], slot: 'line' }),
    // Dardo and Lynx
    node({ id: 'dardo', tier: 6, line: 'dardo', lane: 2, parents: ['c1_ariete_preserie'], slot: 'line' }),
    node({ id: 'lrmv_lynx', tier: 9, line: 'dardo', lane: 2, parents: ['dardo'], slot: 'line' }),
  ]),
});
