// The Poland tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const POLAND_TREE: NationTree = Object.freeze({
  id: 'poland',
  nations: Object.freeze(['Poland']),
  flagNation: 'Poland',
  name: 'Poland',
  lines: Object.freeze([
    { id: 'pt91', name: 'T-72M1 to Zubr' },
    { id: 'pt91_side', name: 'Twardy' },
    { id: 'bwp', name: 'BWP-1, Upiór and Borsuk' },
    { id: 'pl01', name: 'PL-01' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // BWP-1, Upiór and Borsuk
    node({ id: 'bwp1', tier: 4, line: 'bwp', lane: 2, parents: [], slot: 'line' }),
    // T-72M1 to Zubr
    node({ id: 't72m1_jaguar', tier: 5, line: 'pt91', lane: 0, parents: ['bwp1'], slot: 'line' }),
    // Twardy
    node({ id: 'pt91a_twardy', tier: 5, line: 'pt91_side', lane: 1, parents: ['t72m1_jaguar'], slot: 'line' }),
    // T-72M1 to Zubr
    node({ id: 'pt91m', tier: 6, line: 'pt91', lane: 0, parents: ['t72m1_jaguar', 'pt91a_twardy'], slot: 'line' }),
    node({ id: 't72_rys', tier: 8, line: 'pt91', lane: 0, parents: ['pt91m'], slot: 'line' }),
    node({
      id: 't72b3_zubr', tier: 9, line: 'pt91', lane: 0, parents: ['t72_rys'], slot: 'line', builds: ['t72b3_zubr_ii'],
    }),
    // BWP-1, Upiór and Borsuk
    node({ id: 'upior', tier: 8, line: 'bwp', lane: 2, parents: ['bwp1'], slot: 'line' }),
    node({ id: 'borsuk', tier: 9, line: 'bwp', lane: 2, parents: ['upior'], slot: 'line' }),
    // PL-01
    node({ id: 'pl01', tier: 9, line: 'pl01', lane: 3, parents: ['upior'], slot: 'line', builds: ['pl01_105'] }),
    // Special
    node({ id: 't72b3m_wilk', tier: 8, line: 'special', lane: 0, parents: [], slot: 'special' }),
    node({ id: 't80u_husarz', tier: 9, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
