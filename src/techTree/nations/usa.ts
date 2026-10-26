// The United States tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const USA_TREE: NationTree = Object.freeze({
  id: 'usa',
  nations: Object.freeze(['USA']),
  flagNation: 'USA',
  name: 'United States',
  lines: Object.freeze([
    { id: 'patton', name: 'Patton' },
    { id: 'm1a1', name: 'Abrams M1A1' },
    { id: 'm1a2', name: 'Abrams M1A2' },
    { id: 'sheridan', name: 'Sheridan' },
    { id: 'bradley', name: 'Bradley' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Patton
    node({ id: 'm46_patton', tier: 1, line: 'patton', lane: 1, parents: [], slot: 'line' }),
    node({ id: 'm47_patton', tier: 1, line: 'patton', lane: 2, parents: ['m46_patton'], slot: 'line' }),
    node({ id: 'm60a1', tier: 3, line: 'patton', lane: 1, parents: ['m47_patton'], slot: 'line' }),
    node({ id: 'm48a5_patton', tier: 3, line: 'patton', lane: 2, parents: ['m47_patton'], slot: 'line' }),
    node({ id: 'm60a3', tier: 4, line: 'patton', lane: 1, parents: ['m60a1', 'm48a5_patton'], slot: 'line' }),
    // Abrams M1A1
    node({ id: 'm1a1', tier: 5, line: 'm1a1', lane: 1, parents: ['m60a3'], slot: 'line' }),
    node({ id: 'm1a1_abrams_hc', tier: 7, line: 'm1a1', lane: 1, parents: ['m1a1'], slot: 'line' }),
    node({ id: 'm1a1_abrams_sa', tier: 7, line: 'm1a1', lane: 0, parents: ['m1a1_abrams_hc'], slot: 'line' }),
    node({ id: 'm1a1_abrams_aim', tier: 7, line: 'm1a1', lane: 2, parents: ['m1a1_abrams_hc'], slot: 'line' }),
    node({
      id: 'm1a1_abrams_fep', tier: 8, line: 'm1a1', lane: 1, parents: ['m1a1_abrams_aim', 'm1a1_abrams_sa'],
      slot: 'line',
    }),
    // Abrams M1A2
    node({ id: 'm1a1ha', tier: 5, line: 'm1a2', lane: 2, parents: ['m1a1'], slot: 'line' }),
    node({ id: 'm1a2_abrams', tier: 7, line: 'm1a2', lane: 3, parents: ['m1a1ha'], slot: 'line' }),
    node({ id: 'm1a2_abrams_sepv2', tier: 7, line: 'm1a2', lane: 4, parents: ['m1a2_abrams'], slot: 'line' }),
    node({ id: 'm1a2_abrams_sepv3', tier: 8, line: 'm1a2', lane: 4, parents: ['m1a2_abrams_sepv2'], slot: 'line' }),
    node({ id: 'abramsx', tier: 10, line: 'm1a2', lane: 4, parents: ['m1a2_abrams_sepv3'], slot: 'line' }),
    node({ id: 'm1a3', tier: 10, line: 'm1a2', lane: 0, parents: ['abramsx', 'm1a1_abrams_fep'], slot: 'line' }),
    // Sheridan
    node({ id: 'm551_sheridan', tier: 5, line: 'sheridan', lane: 5, parents: ['m48a5_patton'], slot: 'line' }),
    node({ id: 'm551a1_tts', tier: 7, line: 'sheridan', lane: 5, parents: ['m551_sheridan'], slot: 'line' }),
    node({ id: 'griffin_viper', tier: 8, line: 'sheridan', lane: 5, parents: ['m551a1_tts'], slot: 'line' }),
    // Bradley
    node({ id: 'm2a2_bradley', tier: 5, line: 'bradley', lane: 6, parents: ['m551_sheridan'], slot: 'line' }),
    node({ id: 'm3a3_bradley', tier: 7, line: 'bradley', lane: 6, parents: ['m2a2_bradley'], slot: 'line' }),
    node({ id: 'm6_linebacker', tier: 7, line: 'bradley', lane: 7, parents: ['m2a2_bradley'], slot: 'line' }),
    node({ id: 'griffin50mm', tier: 10, line: 'bradley', lane: 6, parents: ['m3a3_bradley'], slot: 'line' }),
    // Special
    node({ id: 'm60a2', tier: 5, line: 'special', lane: 0, parents: [], slot: 'special' }),
    node({ id: 'm1a2_abrams_tusk', tier: 7, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
