// The Ukraine tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const UKRAINE_TREE: NationTree = Object.freeze({
  id: 'ukraine',
  nations: Object.freeze(['Ukraine']),
  flagNation: 'Ukraine',
  name: 'Ukraine',
  lines: Object.freeze([
    { id: 'kharkiv', name: 'T-84 and Oplot' },
    { id: 'soviet', name: 'T-64 and T-80 upgrades' },
    { id: 'aid', name: 'Allied vehicles' },
    { id: 'aid_mbt', name: 'Allied tanks' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // T-84 and Oplot (262: the Object 478DU2 prototype, the 2000 T-84U Oplot and the T-80U Kursk at VI; the
    // T-84BM Oplot-M and its Thai export Oplot-T at X)
    node({ id: 't84', tier: 6, line: 'kharkiv', lane: 1, parents: ['t64bv_donbas'], slot: 'line' }),
    node({ id: 't80u_kursk', tier: 6, line: 'kharkiv', lane: 2, parents: ['t84'], slot: 'line' }),
    node({ id: 't84bm_oplot_m', tier: 6, line: 'kharkiv', lane: 0, parents: ['t84'], slot: 'line' }),
    node({
      id: 't72b3m_hetman', tier: 7, line: 'kharkiv', lane: 1, parents: ['t84bm_oplot_m'], slot: 'line',
      builds: ['t72b3m_hetman_ii'],
    }),
    node({ id: 'bm_oplot_m', tier: 10, line: 'kharkiv', lane: 0, parents: ['t84bm_oplot_m'], slot: 'line' }),
    node({ id: 'bm_oplot_t', tier: 10, line: 'kharkiv', lane: 1, parents: ['bm_oplot_m'], slot: 'line' }),
    // T-64 and T-80 upgrades
    node({ id: 't64bv_donbas', tier: 4, line: 'soviet', lane: 2, parents: [], slot: 'line' }),
    node({ id: 't64b1v_2022', tier: 4, line: 'soviet', lane: 1, parents: ['t64bv_donbas'], slot: 'line' }),
    node({ id: 't64bm1m', tier: 4, line: 'soviet', lane: 0, parents: ['t64b1v_2022'], slot: 'line' }),
    node({ id: 'ua_t80bv', tier: 5, line: 'soviet', lane: 3, parents: ['t64bv_donbas'], slot: 'line' }),
    node({ id: 't72b3_sich', tier: 7, line: 'soviet', lane: 2, parents: ['ua_t80bv'], slot: 'line' }),
    // Allied tanks
    node({
      id: 'ua_m1a1', tier: 9, line: 'aid_mbt', lane: 1, parents: ['ua_t80bv'], slot: 'line',
      builds: ['ua_m1a2_abrams'],
    }),
    node({ id: 'leo2a6_ua', tier: 9, line: 'aid_mbt', lane: 3, parents: ['ua_m1a1'], slot: 'line' }),
    // Allied vehicles
    node({ id: 'ua_m2a3_bradley', tier: 4, line: 'aid', lane: 4, parents: ['t64bv_donbas'], slot: 'line' }),
    node({ id: 'ua_challenger2', tier: 9, line: 'aid', lane: 4, parents: ['ua_m2a3_bradley'], slot: 'line' }),
    // Special
    node({ id: 't80u_zoria', tier: 7, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
