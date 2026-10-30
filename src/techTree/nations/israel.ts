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
    node({ id: 'merkava1b', tier: 1, line: 'merkava', lane: 2, parents: [], slot: 'line' }),
    node({ id: 'merkava2b', tier: 3, line: 'merkava', lane: 2, parents: ['merkava1b'], slot: 'line' }),
    node({ id: 'merkava3c', tier: 8, line: 'merkava', lane: 0, parents: ['merkava2b'], slot: 'line' }),
    node({
      id: 'merkava3_baz', tier: 8, line: 'merkava', lane: 2, parents: ['merkava3c'], slot: 'line',
      builds: ['merkava3d'],
    }),
    node({ id: 'merkava4', tier: 9, line: 'merkava', lane: 2, parents: ['merkava3_baz'], slot: 'line' }),
    node({ id: 'merkava4_trophy', tier: 9, line: 'merkava', lane: 1, parents: ['merkava4'], slot: 'line' }),
    node({ id: 'merkava4_barak', tier: 9, line: 'merkava', lane: 0, parents: ['merkava4_trophy'], slot: 'line' }),
    // Merkava variants
    node({ id: 'merkava2d', tier: 3, line: 'merkava_side', lane: 3, parents: ['merkava2b'], slot: 'line' }),
    node({ id: 'merkava4b', tier: 9, line: 'merkava_side', lane: 3, parents: ['merkava3_baz'], slot: 'line' }),
    // Namer
    node({ id: 'namer_ifv', tier: 4, line: 'namer', lane: 0, parents: ['merkava2b'], slot: 'line' }),
    // Special
    node({ id: 'sabra_mk2', tier: 2, line: 'special', lane: 0, parents: [], slot: 'special' }),
    // release 266: the Magach 3, the IDF's M48 (pattonCast.ts on the M48A5's castings)
    node({ id: 'magach3', tier: 1, line: 'special', lane: 0, parents: [], slot: 'special' }),
    // release 262: the IDF's Centurion of 1973, beside the Sabra (both foreign hulls in IDF service)
    node({ id: 'shot_kal', tier: 3, line: 'special', lane: 0, parents: [], slot: 'special' }),
    // release 267: the IDF's M60s (pattonCast.ts on the M60A1's castings), a second special lane beside the Magach 3 and the Sabra
    node({ id: 'magach6b', tier: 1, line: 'special', lane: 1, parents: [], slot: 'special' }),
    node({ id: 'magach7c', tier: 2, line: 'special', lane: 1, parents: [], slot: 'special' }),
  ]),
});
