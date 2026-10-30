// The Brazil tech tree (release 266; Main's ruling 2026-10-29 on the owner's "lets build brazil, not taiwan, and flesh it
// out with all its own tanks"): lines as rows, tiers as columns. One root, the X1 Pioneiro; the indigenous line runs the
// Army's tank programme as it went (the Bernardini X1 and X1A2, the MB-3 Tamoyo that lost to the Engesa EE-T1 Osório), the
// Army-fleet line the tanks it fielded from abroad. Brazil never fielded a modern MBT, so the tree tops out at the Osório
// P.2 (IV). src/techTree/techTree.selftest.mjs checks its shape and pins its content. Pure data, Node-runnable.
// First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const BRAZIL_TREE: NationTree = Object.freeze({
  id: 'brazil',
  nations: Object.freeze(['Brazil']),
  flagNation: 'Brazil',
  name: 'Brazil',
  lines: Object.freeze([
    { id: 'indigenous', name: 'Bernardini and Engesa' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Bernardini and Engesa: the X1 Pioneiro (the Stuart rebuilt, 1977) and the X1A2 Carcará (1981), the MB-3 Tamoyo 1 of the Army's 1987-88 trials and Bernardini's 105 mm Tamoyo 3, then the
    // EE-T1 Osório that won the Army over: the 105 mm P.1 of its 1986-87 homologation and the 120 mm P.2 of the Saudi trials
    node({ id: 'x1_pioneiro', tier: 1, line: 'indigenous', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'x1a2_carcara', tier: 1, line: 'indigenous', lane: 1, parents: ['x1_pioneiro'], slot: 'line' }),
    node({ id: 'tamoyo1', tier: 2, line: 'indigenous', lane: 1, parents: ['x1a2_carcara'], slot: 'line' }),
    node({ id: 'tamoyo3', tier: 3, line: 'indigenous', lane: 1, parents: ['tamoyo1'], slot: 'line' }),
    node({ id: 'osorio_p1', tier: 3, line: 'indigenous', lane: 2, parents: ['tamoyo3'], slot: 'line' }),
    node({ id: 'osorio_p2', tier: 4, line: 'indigenous', lane: 2, parents: ['osorio_p1'], slot: 'line' }),
  ]),
});
