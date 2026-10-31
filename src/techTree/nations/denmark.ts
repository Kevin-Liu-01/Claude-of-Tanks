// The Denmark tech tree (release 265; Main's ruling 2026-10-29 on the owner's "add a bunch more denmark tanks"): lines
// as rows, tiers as columns, the special lane under them. `builds` are near-identical twins drawn on one node. One root,
// the Leopard 1A3 DK; the Christian II, a Danish Army concept, moved here from the Sweden tree as its special.
// src/techTree/techTree.selftest.mjs checks its shape and pins its content. Pure data, Node-runnable. First-party:
// Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const DENMARK_TREE: NationTree = Object.freeze({
  id: 'denmark',
  nations: Object.freeze(['Denmark']),
  flagNation: 'Denmark',
  name: 'Denmark',
  lines: Object.freeze([
    { id: 'leopard', name: 'Leopard 1 to Leopard 2A5 DK' },
    { id: 'recce', name: 'M41 DK-1 and Centurion' },
    { id: 'cv90', name: 'CV9035 DK' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Leopard 1 to Leopard 2A5 DK: the 1976 welded-turret 1A3 DK, its 1990-94 EMES 18 conversion (the Bosnia DK-1 fit
    // its twin) and the 2A5 DK of 2002 (the 2A7 DK it became in 2019-22 is held, 2026-10-30)
    node({ id: 'leo1a3dk', tier: 1, line: 'leopard', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'leo1a5dk', tier: 1, line: 'leopard', lane: 1, parents: ['leo1a3dk'], slot: 'line', builds: ['leo1a5dk1'] }),
    node({ id: 'leo2a5dk', tier: 9, line: 'leopard', lane: 1, parents: ['leo1a5dk'], slot: 'line' }),
    // M41 DK-1 and Centurion: the reconnaissance squadrons' M41 DK-1
    node({ id: 'm41dk1', tier: 2, line: 'recce', lane: 0, parents: ['leo1a3dk'], slot: 'line' }),
    // CV9035 DK: the Royal Life Guards' and Guard Hussars' infantry fighting vehicle (2007)
    node({ id: 'cv9035dk', tier: 5, line: 'cv90', lane: 0, parents: ['m41dk1'], slot: 'line' }),
    // the Christian II, a Danish Army concept on the Type 90 X (release 262), the Danish special
    node({ id: 'christian2', tier: 8, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
