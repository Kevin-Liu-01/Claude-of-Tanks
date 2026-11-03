// The South Africa tech tree (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south african and
// australian tank trees"): lines as rows, tiers as columns, the special lane under them. `builds` are near-identical
// twins drawn on one node. One line, the Centurion as South Africa rebuilt it: the Olifant Mk 1 of 1978 the root, the
// Semel of 1974 (the Skokiaan's powerpack in service) its twin, then the Mk 1A of 1985, the Mk 1B of 1991 and the Mk 2
// of 2007 (moved here from the UK tree's special lane); the TTD, Project Loggim's 1992 demonstrator, the special. The
// wheeled Ratel, Rooikat, Eland and Badger are out (the fleet is tracked only). src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const SOUTH_AFRICA_TREE: NationTree = Object.freeze({
  id: 'south_africa',
  nations: Object.freeze(['South Africa']),
  flagNation: 'South Africa',
  name: 'South Africa',
  lines: Object.freeze([
    { id: 'olifant', name: 'Centurion and Olifant' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Centurion and Olifant: the 20-pdr Mk 1 (and the Semel before it), the 105 mm Mk 1A, the torsion-bar Mk 1B and the
    // Mk 2's thermal fire control
    node({ id: 'olifant_mk1', tier: 2, line: 'olifant', lane: 0, parents: [], slot: 'line', builds: ['semel'] }),
    node({ id: 'olifant_mk1a', tier: 3, line: 'olifant', lane: 0, parents: ['olifant_mk1'], slot: 'line' }),
    node({ id: 'olifant_mk1b', tier: 3, line: 'olifant', lane: 1, parents: ['olifant_mk1a'], slot: 'line' }),
    node({ id: 'olifant_mk2', tier: 3, line: 'olifant', lane: 2, parents: ['olifant_mk1b'], slot: 'line' }),
    // the TTD (one prototype, 1992; at the SA Armour Museum) on the fleet's Leopard 2, the South African special at III,
    // where its same-tier duels hold (0.49; 0.21 at IV: its 105 mm against the 120 mm guns)
    node({ id: 'ttd', tier: 3, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
