// The Sweden tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const SWEDEN_TREE: NationTree = Object.freeze({
  id: 'sweden',
  // release 262: the Danish Christian II is drawn here, a Nordic special under the Swedish lines
  nations: Object.freeze(['Sweden', 'Denmark']),
  flagNation: 'Sweden',
  name: 'Sweden',
  lines: Object.freeze([
    { id: 'strv', name: 'Strv 81 to Strv 122' },
    { id: 'strv_side', name: 'UDES 03' },
    { id: 'cv90', name: 'CV90' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Strv 81 to Strv 122
    node({ id: 'strv81', tier: 2, line: 'strv', lane: 2, parents: ['udes03'], slot: 'line' }),
    node({ id: 'strv103a', tier: 2, line: 'strv', lane: 1, parents: ['strv81'], slot: 'line' }),
    node({ id: 'strv103b', tier: 2, line: 'strv', lane: 0, parents: ['strv103a'], slot: 'line' }),
    node({ id: 'strv122', tier: 9, line: 'strv', lane: 2, parents: ['strv103b'], slot: 'line', builds: ['strv121'] }),
    // UDES 03
    node({ id: 'udes03', tier: 1, line: 'strv_side', lane: 2, parents: [], slot: 'line' }),
    // CV90
    node({ id: 'cv90105_tml', tier: 2, line: 'cv90', lane: 3, parents: ['udes03'], slot: 'line' }),
    node({ id: 'cv90', tier: 4, line: 'cv90', lane: 2, parents: ['cv90105_tml'], slot: 'line' }),
    node({ id: 'cv9040c', tier: 4, line: 'cv90', lane: 3, parents: ['cv90'], slot: 'line' }),
    node({
      id: 'cv90_mk4', tier: 7, line: 'cv90', lane: 3, parents: ['cv9040c'], slot: 'line',
      builds: ['cv90_mk4_concept'],
    }),
    // release 262: the Christian II, a Danish Army concept on the Type 90 X (Nordic special)
    node({ id: 'christian2', tier: 8, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
