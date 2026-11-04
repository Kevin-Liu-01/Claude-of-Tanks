// The Russia tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const RUSSIA_TREE: NationTree = Object.freeze({
  id: 'russia',
  nations: Object.freeze(['USSR', 'USSR/Russia', 'Russia']),
  flagNation: 'Russia',
  name: 'Russia',
  lines: Object.freeze([
    { id: 't80', name: 'T-64 and T-80' },
    { id: 't80_side', name: 'T-80 variants' },
    { id: 't72', name: 'T-62 to T-72B3' },
    { id: 't90', name: 'T-90' },
    { id: 't90_side', name: 'T-90 variants' },
    { id: 't90_late', name: 'T-90MS, Burlak and Object 695' },
    { id: 'bmp', name: 'BMP and Kurganets' },
    { id: 'support', name: 'TOS and BMPT' },
    // release 269 (owner 2026-11-04): the 152 mm line
    { id: 'mm152', name: '152 mm' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // T-62 to T-72B3
    node({ id: 'kv2', tier: 1, line: 't72', lane: 0, parents: [], slot: 'line' }),
    // 262 (owner 2026-10-27; tier I approved 2026-10-28): the T-55A, the T-54/T-55 family the T-62 grew from,
    // stacked between the KV-2 and the T-62
    node({ id: 't55a', tier: 1, line: 't72', lane: 1, parents: ['kv2'], slot: 'line' }),
    node({ id: 't62_1975', tier: 1, line: 't72', lane: 2, parents: ['t55a'], slot: 'line' }),
    node({ id: 't62mv1', tier: 2, line: 't72', lane: 0, parents: ['t62_1975'], slot: 'line' }),
    node({ id: 't72b_1987', tier: 3, line: 't72', lane: 0, parents: ['t62mv1'], slot: 'line' }),
    node({ id: 't72bu_1989', tier: 3, line: 't72', lane: 1, parents: ['t72b_1987'], slot: 'line', builds: ['t72bu'] }),
    node({ id: 't72b3', tier: 6, line: 't72', lane: 2, parents: ['t72bu_1989'], slot: 'line' }),
    node({ id: 't72b3m_2016', tier: 6, line: 't72', lane: 7, parents: ['t72b3'], slot: 'line' }),
    node({ id: 't72b3m_2022', tier: 6, line: 't72', lane: 8, parents: ['t72b3m_2016'], slot: 'line' }),
    // T-64 and T-80
    node({ id: 't64bv1', tier: 3, line: 't80', lane: 2, parents: ['t62_1975'], slot: 'line' }),
    node({ id: 't80', tier: 3, line: 't80', lane: 7, parents: ['t64bv1'], slot: 'line' }),
    node({ id: 't64bv', tier: 3, line: 't80', lane: 8, parents: ['t62_1975'], slot: 'line' }),
    node({ id: 't80bv', tier: 4, line: 't80', lane: 6, parents: ['t80'], slot: 'line' }),
    // T-80 variants
    node({ id: 't80b', tier: 4, line: 't80_side', lane: 7, parents: ['t80'], slot: 'line' }),
    node({ id: 't80u', tier: 6, line: 't80_side', lane: 9, parents: ['t80b'], slot: 'line', builds: ['t80uk'] }),
    // T-90
    node({ id: 't90_1992', tier: 7, line: 't90', lane: 1, parents: ['t72bu_1989'], slot: 'line', builds: ['t90'] }),
    node({
      id: 't90a_2006', tier: 9, line: 't90', lane: 4, parents: ['t90a_2004'], slot: 'line', builds: ['t90a_vladimir'],
    }),
    node({ id: 't90m', tier: 10, line: 't90', lane: 2, parents: ['t90a_2006'], slot: 'line' }),
    node({ id: 't90m_proryv', tier: 10, line: 't90', lane: 4, parents: ['t90m'], slot: 'line' }),
    // T-90 variants
    node({
      id: 't90a_2004', tier: 9, line: 't90_side', lane: 3, parents: ['t90_1992'], slot: 'line', builds: ['t90a'],
    }),
    node({ id: 't90am', tier: 9, line: 't90_side', lane: 5, parents: ['t90a_2006'], slot: 'line' }),
    node({ id: 't90sm_2013', tier: 9, line: 't90_side', lane: 6, parents: ['t90am'], slot: 'line', builds: ['t90sm'] }),
    // T-90MS, Burlak and Object 695
    node({
      id: 't90ms_2011', tier: 9, line: 't90_late', lane: 2, parents: ['t90a_2004'], slot: 'line',
      builds: ['t90ms_tagil'],
    }),
    node({
      id: 't90a_burlak', tier: 9, line: 't90_late', lane: 1, parents: ['t90ms_2011'], slot: 'line',
      builds: ['t90a_burlak_proto'],
    }),
    node({ id: 'object695', tier: 10, line: 't90_late', lane: 1, parents: ['t90a_burlak'], slot: 'line' }),
    // BMP and Kurganets
    node({ id: 'bmp2', tier: 1, line: 'bmp', lane: 10, parents: ['t62_1975'], slot: 'line' }),
    node({ id: 'bmp3', tier: 2, line: 'bmp', lane: 10, parents: ['bmp2'], slot: 'line' }),
    node({ id: 'bmp3m_dragun125', tier: 10, line: 'bmp', lane: 10, parents: ['bmp3'], slot: 'line' }),
    node({ id: 'kurganets25', tier: 10, line: 'bmp', lane: 11, parents: ['bmp3m_dragun125'], slot: 'line' }),
    // TOS and BMPT
    node({ id: 'tos1a_tagil', tier: 5, line: 'support', lane: 11, parents: ['bmp3'], slot: 'line' }),
    node({ id: 'bmpt_terminator2', tier: 5, line: 'support', lane: 12, parents: ['tos1a_tagil'], slot: 'line' }),
    node({ id: 'bmpt_t90', tier: 6, line: 'support', lane: 12, parents: ['bmpt_terminator2'], slot: 'line' }),
    // 152 mm (release 269, owner 2026-11-04: "a full line of 152 mm variant tanks"; tiers proposed for Main's ruling on
    // the lane's fairness numbers): on from the T-80U along its row, the Object 292 (the T-80 family's 152 mm), the Kharkiv
    // Molot and the Object 195, the T-14 152 beside it
    node({ id: 'object292', tier: 7, line: 'mm152', lane: 9, parents: ['t80u'], slot: 'line' }),
    node({ id: 'object477_molot', tier: 9, line: 'mm152', lane: 9, parents: ['object292'], slot: 'line' }),
    node({ id: 'object195', tier: 10, line: 'mm152', lane: 9, parents: ['object477_molot'], slot: 'line' }),
    node({ id: 't14_152', tier: 10, line: 'mm152', lane: 8, parents: ['object195'], slot: 'line' }),
    // Special
    node({
      id: 't14_armata', tier: 10, line: 'special', lane: 0, parents: [], slot: 'special', builds: ['object148_proto'],
    }),
    node({ id: 't80u_bars_m', tier: 8, line: 'special', lane: 1, parents: [], slot: 'special' }),
    node({
      id: 't72b3m_bulat_m', tier: 8, line: 'special', lane: 0, parents: [], slot: 'special',
      builds: ['t72b3_bastion_m'],
    }),
  ]),
});
