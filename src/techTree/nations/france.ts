// The France tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const FRANCE_TREE: NationTree = Object.freeze({
  id: 'france',
  nations: Object.freeze(['France']),
  flagNation: 'France',
  name: 'France',
  lines: Object.freeze([
    { id: 'amx', name: 'AMX-30 to Leclerc' },
    { id: 'amx10', name: 'AMX-10P' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // AMX-30 to Leclerc
    node({ id: 'amx30', tier: 1, line: 'amx', lane: 1, parents: [], slot: 'line', builds: ['amx30b'] }),
    node({ id: 'amx30b2', tier: 1, line: 'amx', lane: 0, parents: ['amx30'], slot: 'line' }),
    node({ id: 'amx40', tier: 3, line: 'amx', lane: 0, parents: ['amx30b2'], slot: 'line', builds: ['amx40_proto'] }),
    node({ id: 'leclerc_s1', tier: 8, line: 'amx', lane: 0, parents: ['amx40'], slot: 'line' }),
    node({ id: 'leclerc_s2', tier: 9, line: 'amx', lane: 0, parents: ['leclerc_s1'], slot: 'line', builds: ['amx56'] }),
    node({ id: 'leclerc_sxxi', tier: 9, line: 'amx', lane: 1, parents: ['leclerc_s2'], slot: 'line' }),
    node({ id: 'leclerc_xlr', tier: 10, line: 'amx', lane: 1, parents: ['leclerc_sxxi'], slot: 'line' }),
    // AMX-10P
    node({ id: 'amx10p', tier: 3, line: 'amx10', lane: 1, parents: ['amx30b2'], slot: 'line' }),
    node({ id: 'amx10p_25', tier: 4, line: 'amx10', lane: 1, parents: ['amx10p'], slot: 'line' }),
  ]),
});
