// The Israel tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const ISRAEL_TREE: NationTree = Object.freeze({
  id: 'israel',
  nations: Object.freeze(['Israel']),
  flagNation: 'Israel',
  name: 'Israel',
  lines: Object.freeze([
    { id: 'merkava', name: 'Merkava' },
    { id: 'merkava_side', name: 'Merkava variants' },
    { id: 'namer', name: 'Namer' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Merkava
    node({ id: 'merkava1b', tier: 3, line: 'merkava', lane: 1, parents: [], slot: 'line' }),
    node({ id: 'merkava2b', tier: 5, line: 'merkava', lane: 1, parents: ['merkava1b'], slot: 'line' }),
    node({ id: 'merkava3c', tier: 6, line: 'merkava', lane: 1, parents: ['merkava2b'], slot: 'line' }),
    node({
      id: 'merkava3_baz', tier: 7, line: 'merkava', lane: 1, parents: ['merkava3c'], slot: 'line',
      builds: ['merkava3d'],
    }),
    node({ id: 'merkava4', tier: 7, line: 'merkava', lane: 0, parents: ['merkava3_baz'], slot: 'line' }),
    node({ id: 'merkava4_trophy', tier: 9, line: 'merkava', lane: 0, parents: ['merkava4'], slot: 'line' }),
    node({ id: 'merkava4_barak', tier: 10, line: 'merkava', lane: 0, parents: ['merkava4_trophy'], slot: 'line' }),
    // Merkava variants
    node({ id: 'merkava2d', tier: 5, line: 'merkava_side', lane: 2, parents: ['merkava2b'], slot: 'line' }),
    node({ id: 'merkava4b', tier: 7, line: 'merkava_side', lane: 2, parents: ['merkava3_baz'], slot: 'line' }),
    // Namer
    node({ id: 'namer_ifv', tier: 7, line: 'namer', lane: 3, parents: ['merkava4b'], slot: 'line' }),
    // Special
    node({ id: 'sabra_mk2', tier: 6, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
