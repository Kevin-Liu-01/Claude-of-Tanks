// The Germany tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const GERMANY_TREE: NationTree = Object.freeze({
  id: 'germany',
  nations: Object.freeze(['Germany']),
  flagNation: 'Germany',
  name: 'Germany',
  lines: Object.freeze([
    { id: 'leopard2', name: 'Leopard 2' },
    { id: 'leopard_side', name: 'Leopard 1 and 2 variants' },
    { id: 'export', name: 'Export Leopard 2' },
    { id: 'rheinmetall', name: 'Revolution and Panther' },
    { id: 'marder', name: 'Marder, Puma and Lynx' },
    { id: 'm41', name: 'M41' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Leopard 2
    node({ id: 'jpz_e100', tier: 1, line: 'leopard2', lane: 1, parents: [], slot: 'line' }),
    node({ id: 'leopard2_proto', tier: 3, line: 'leopard2', lane: 0, parents: ['leo1a5'], slot: 'line' }),
    node({ id: 'leo2a2', tier: 3, line: 'leopard2', lane: 4, parents: ['leopard2_proto'], slot: 'line' }),
    node({ id: 'leo2a4_v', tier: 8, line: 'leopard2', lane: 5, parents: ['leo2a2'], slot: 'line' }),
    node({
      id: 'leo2a5', tier: 9, line: 'leopard2', lane: 1, parents: ['leo2a4_v'], slot: 'line', builds: ['leo2a5m'],
    }),
    node({ id: 'leo2a6m', tier: 9, line: 'leopard2', lane: 3, parents: ['leo2a5'], slot: 'line' }),
    node({ id: 'leo2a7v', tier: 10, line: 'leopard2', lane: 3, parents: ['leo2a6m'], slot: 'line' }),
    node({ id: 'kf51_panther', tier: 10, line: 'leopard2', lane: 1, parents: ['leo2a7v'], slot: 'line' }),
    // Leopard 1 and 2 variants
    node({ id: 'leo1a5', tier: 1, line: 'leopard_side', lane: 5, parents: ['jpz_e100'], slot: 'line' }),
    node({ id: 'leo2a3', tier: 4, line: 'leopard_side', lane: 3, parents: ['leo2a2'], slot: 'line' }),
    node({ id: 'leo2a6', tier: 9, line: 'leopard_side', lane: 0, parents: ['leo2a5'], slot: 'line' }),
    node({ id: 'leo2_improved', tier: 8, line: 'leopard_side', lane: 0, parents: ['leo2a4'], slot: 'line' }),
    node({
      id: 'kf51_evo', tier: 10, line: 'leopard_side', lane: 0, parents: ['kf51_panther'], slot: 'line',
      builds: ['kf51_u'],
    }),
    node({ id: 'mbt70', tier: 3, line: 'leopard_side', lane: 5, parents: ['leo1a5'], slot: 'line' }),
    // Export Leopard 2
    node({ id: 'leo2a4', tier: 8, line: 'export', lane: 1, parents: ['leo2a2'], slot: 'line' }),
    node({ id: 'leo2a4m_can', tier: 8, line: 'export', lane: 2, parents: ['leo2a4'], slot: 'line' }),
    node({ id: 'leo2a4m', tier: 8, line: 'export', lane: 3, parents: ['leo2a4m_can'], slot: 'line' }),
    // Revolution and Panther
    node({
      id: 'leo2_revolution', tier: 8, line: 'rheinmetall', lane: 4, parents: ['leo2a4m'], slot: 'line',
      builds: ['leo2_revolution_proto'],
    }),
    // Marder, Puma and Lynx
    node({ id: 'marder1a3', tier: 2, line: 'marder', lane: 6, parents: ['leo1a5'], slot: 'line' }),
    node({ id: 'marder2', tier: 5, line: 'marder', lane: 6, parents: ['marder1a3'], slot: 'line' }),
    node({ id: 'spz_puma', tier: 4, line: 'marder', lane: 7, parents: ['marder1a3'], slot: 'line' }),
    node({ id: 'kf41_lynx', tier: 5, line: 'marder', lane: 7, parents: ['spz_puma'], slot: 'line' }),
    node({
      id: 'puma_s1', tier: 6, line: 'marder', lane: 7, parents: ['kf41_lynx'], slot: 'line', builds: ['spz_wotan'],
    }),
    // M41: the Bundeswehr's armoured reconnaissance M41 (1956-66), release 265
    node({ id: 'm41_bw', tier: 1, line: 'm41', lane: 0, parents: ['jpz_e100'], slot: 'line' }),
    // Special
    node({ id: 'leo2a4_otco', tier: 8, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
