// The Australia tech tree (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south african and australian
// tank trees" and "no senntinnel please"): lines as rows, tiers as columns. One root, the Leopard AS1 (Denmark's shape:
// a Leopard 1 root with its Centurion off it). The tanks line runs the Army's gun tanks after the Centurion: the AS1 of
// 1976, the M1A1 AIM SA of 2007 and the M1A2 SEPv3 of 2024; the Centurion Mk 5/1 (moved here from the UK tree's special
// lane) hangs off the root; the cavalry line runs the tracked fighting vehicles as the Army replaced them: the M113A1
// FSV of 1970, the MRV of 1978, the M113AS4 of 2007 and the AS21 Redback that replaces it. The wheeled ASLAV and Boxer
// are out (the fleet is tracked only). src/techTree/techTree.selftest.mjs checks its shape and pins its content. Pure
// data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const AUSTRALIA_TREE: NationTree = Object.freeze({
  id: 'australia',
  nations: Object.freeze(['Australia']),
  flagNation: 'Australia',
  name: 'Australia',
  lines: Object.freeze([
    { id: 'tanks', name: 'Leopard and Abrams' },
    { id: 'centurion', name: 'Centurion' },
    { id: 'cavalry', name: 'M113 and Redback' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Leopard and Abrams: the Leopard AS1 (1976-2007), the M1A1 AIM SA that replaced it and the M1A2 SEPv3 (2024)
    node({ id: 'leopard_as1', tier: 1, line: 'tanks', lane: 0, parents: [], slot: 'line' }),
    node({ id: 'm1a1_aim_sa_aus', tier: 8, line: 'tanks', lane: 0, parents: ['leopard_as1'], slot: 'line' }),
    node({ id: 'm1a2_sepv3_aus', tier: 9, line: 'tanks', lane: 0, parents: ['m1a1_aim_sa_aus'], slot: 'line' }),
    // Centurion: the Mk 5/1 of the Vietnam squadrons (1968-71)
    node({ id: 'centurion5_1_aus', tier: 2, line: 'centurion', lane: 1, parents: ['leopard_as1'], slot: 'line' }),
    // M113 and Redback: the Saladin-turreted FSV (1970), the Scorpion-turreted MRV (1978), the stretched AS4 (2007) and
    // the AS21 Redback (LAND 400 Phase 3, 2027)
    node({ id: 'm113a1_fsv', tier: 1, line: 'cavalry', lane: 2, parents: ['leopard_as1'], slot: 'line' }),
    node({ id: 'm113a1_mrv', tier: 1, line: 'cavalry', lane: 3, parents: ['m113a1_fsv'], slot: 'line' }),
    // the AS4 at II with the Ares APC it shares its 12.7 mm and its footing with (capability 0.205 against the Ares's 0.208)
    node({ id: 'm113as4', tier: 2, line: 'cavalry', lane: 3, parents: ['m113a1_mrv'], slot: 'line' }),
    node({ id: 'redback', tier: 6, line: 'cavalry', lane: 3, parents: ['m113as4'], slot: 'line' }),
  ]),
});
