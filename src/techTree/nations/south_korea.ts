// The South Korea tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const SOUTH_KOREA_TREE: NationTree = Object.freeze({
  id: 'south_korea',
  nations: Object.freeze(['South Korea']),
  flagNation: 'South Korea',
  name: 'South Korea',
  lines: Object.freeze([
    { id: 'k1', name: 'K1 to K2' },
    { id: 'k2', name: 'K2 prototypes' },
    { id: 'k21', name: 'BMP-3 and K21' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // K1 to K2
    node({ id: 'k1e1', tier: 5, line: 'k1', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'k1a1', tier: 8, line: 'k1', lane: 0, parents: ['k1e1'], slot: 'line' }),
    node({
      id: 'k2_black_panther', tier: 10, line: 'k1', lane: 0, parents: ['k1a1', 'xk2_black_panther'], slot: 'line',
    }),
    // K2 prototypes
    node({ id: 'k2b', tier: 7, line: 'k2', lane: 1, parents: ['k1e1'], slot: 'line' }),
    node({ id: 'xk2_black_panther', tier: 7, line: 'k2', lane: 2, parents: ['k2b'], slot: 'line' }),
    // BMP-3 and K21
    node({ id: 'bmp3_rok', tier: 5, line: 'k21', lane: 1, parents: ['k1e1'], slot: 'line' }),
    node({ id: 'k21', tier: 6, line: 'k21', lane: 1, parents: ['bmp3_rok'], slot: 'line' }),
  ]),
});
