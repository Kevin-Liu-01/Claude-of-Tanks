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
    node({ id: 'bwp1', tier: 3, line: 'bwp', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'upior', tier: 10, line: 'bwp', lane: 2, parents: ['bwp1'], slot: 'line' }),
    node({ id: 'borsuk', tier: 5, line: 'bwp', lane: 1, parents: ['bwp1'], slot: 'line' }),
    // T-72M1 to Zubr
    node({ id: 't72m1_jaguar', tier: 4, line: 'pt91', lane: 2, parents: ['bwp1'], slot: 'line' }),
    node({ id: 'pt91m', tier: 4, line: 'pt91', lane: 3, parents: ['t72m1_jaguar'], slot: 'line' }),
    node({ id: 't72_rys', tier: 5, line: 'pt91', lane: 3, parents: ['pt91m'], slot: 'line' }),
    node({
      id: 't72b3_zubr', tier: 6, line: 'pt91', lane: 3, parents: ['t72_rys'], slot: 'line', builds: ['t72b3_zubr_ii'],
    }),
    // Twardy
    node({ id: 'pt91a_twardy', tier: 5, line: 'pt91_side', lane: 2, parents: ['t72m1_jaguar'], slot: 'line' }),
    // release 262: the PT-64 Tur, the Polish what-if on the true T-64 (profiles/pt64Tur.ts)
    node({ id: 'pt64_tur', tier: 4, line: 'pt91_side', lane: 1, parents: ['t72m1_jaguar'], slot: 'line' }),
    // PL-01
    node({ id: 'pl01', tier: 10, line: 'pl01', lane: 1, parents: ['upior'], slot: 'line', builds: ['pl01_105'] }),
    // Special
    node({ id: 't72b3m_wilk', tier: 7, line: 'special', lane: 1, parents: [], slot: 'special' }),
    node({ id: 't80u_husarz', tier: 7, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
