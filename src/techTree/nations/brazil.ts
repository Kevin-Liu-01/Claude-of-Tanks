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
    // Bernardini and Engesa: the EE-T1 Osório's two prototypes, the 105 mm P.1 of the Army's 1986-87 homologation and the
    // 120 mm P.2 of the 1987 Saudi trials
    node({ id: 'osorio_p1', tier: 3, line: 'indigenous', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'osorio_p2', tier: 4, line: 'indigenous', lane: 0, parents: ['osorio_p1'], slot: 'line' }),
  ]),
});
