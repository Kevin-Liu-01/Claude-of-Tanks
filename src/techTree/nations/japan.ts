// The Japan tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const JAPAN_TREE: NationTree = Object.freeze({
  id: 'japan',
  nations: Object.freeze(['Japan']),
  flagNation: 'Japan',
  name: 'Japan',
  lines: Object.freeze([
    { id: 'type', name: 'STB-1 to Type 10' },
    { id: 'ifv', name: 'Hayate to Raijū' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // STB-1 to Type 10
    node({ id: 'stb1', tier: 2, line: 'type', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'type74', tier: 3, line: 'type', lane: 0, parents: ['stb1'], slot: 'line' }),
    node({
      id: 'type90', tier: 6, line: 'type', lane: 0, parents: ['type74'], slot: 'line', builds: ['type90_kyumaru'],
    }),
    node({ id: 'type90a', tier: 7, line: 'type', lane: 0, parents: ['type90'], slot: 'line' }),
    node({ id: 'type10_tk_x', tier: 8, line: 'type', lane: 0, parents: ['type90a'], slot: 'line' }),
    node({
      id: 'type10', tier: 9, line: 'type', lane: 0, parents: ['type10_tk_x'], slot: 'line', builds: ['type10_dozer'],
    }),
    node({ id: 'type10b', tier: 10, line: 'type', lane: 0, parents: ['type10'], slot: 'line' }),
    // Hayate to Raijū
    node({ id: 'hayate_ifv', tier: 5, line: 'ifv', lane: 1, parents: ['type74'], slot: 'line' }),
    node({ id: 'type89', tier: 9, line: 'ifv', lane: 1, parents: ['hayate_ifv'], slot: 'line' }),
    node({ id: 'raiju_ifv', tier: 10, line: 'ifv', lane: 1, parents: ['type89'], slot: 'line' }),
  ]),
});
