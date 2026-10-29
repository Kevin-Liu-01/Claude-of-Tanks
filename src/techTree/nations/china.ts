// The China tech tree: lines as rows, tiers as columns, the special lane under them. `builds` are
// near-identical twins drawn on one node. Generated with the other national trees; src/techTree/techTree.selftest.mjs
// checks its shape and pins its content. Pure data, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from '../model.ts';

const node = (row: TreeNode): TreeNode => Object.freeze({
  ...row, parents: Object.freeze([...row.parents]), ...(row.builds ? { builds: Object.freeze([...row.builds]) } : {}),
});

export const CHINA_TREE: NationTree = Object.freeze({
  id: 'china',
  nations: Object.freeze(['China']),
  flagNation: 'China',
  name: 'China',
  lines: Object.freeze([
    { id: 'ztz', name: 'Type 59 to ZTZ-20' },
    { id: 'type96', name: 'Type 96' },
    { id: 'support', name: 'AFT-10 and Type 100' },
    { id: 'special', name: 'Special' },
  ].map((line) => Object.freeze(line))),
  nodes: Object.freeze([
    // Type 59 to ZTZ-20
    node({ id: 'type59', tier: 1, line: 'ztz', lane: 1, parents: [], slot: 'line' }),
    node({ id: 'ztz85_iii', tier: 1, line: 'ztz', lane: 2, parents: ['type59'], slot: 'line' }),
    node({ id: 'ztz99_longwei', tier: 6, line: 'ztz', lane: 2, parents: ['ztz85_iii'], slot: 'line' }),
    node({ id: 'ztz99a', tier: 9, line: 'ztz', lane: 2, parents: ['ztz99_longwei'], slot: 'line' }),
    node({ id: 'ztz99a2', tier: 10, line: 'ztz', lane: 3, parents: ['ztz99a'], slot: 'line' }),
    node({ id: 'ztz100', tier: 10, line: 'ztz', lane: 2, parents: ['ztz99a2', 'vt4a1'], slot: 'line' }),
    // 262: the ZTZ-20 Prototype turret testbed after the pre-production ZTZ-100, then the production ZTZ-20
    node({ id: 'ztz20_prototype', tier: 10, line: 'ztz', lane: 1, parents: ['ztz100'], slot: 'line' }),
    node({ id: 'ztz20', tier: 10, line: 'ztz', lane: 0, parents: ['ztz20_prototype'], slot: 'line' }),
    // Type 96
    node({ id: 'type96_72_long', tier: 5, line: 'type96', lane: 1, parents: ['ztz85_iii'], slot: 'line' }),
    node({ id: 'type96b', tier: 6, line: 'type96', lane: 0, parents: ['type96_72_long'], slot: 'line' }),
    node({
      id: 'type96_72m_lei', tier: 6, line: 'type96', lane: 1, parents: ['type96b'], slot: 'line',
      builds: ['type96_80_feng'],
    }),
    node({ id: 'vt4a1', tier: 8, line: 'type96', lane: 1, parents: ['type96_72m_lei'], slot: 'line' }),
    // AFT-10 and Type 100
    node({ id: 'aft10', tier: 3, line: 'support', lane: 3, parents: ['ztz85_iii'], slot: 'line' }),
    node({ id: 'ztz100_prototype', tier: 10, line: 'support', lane: 5, parents: ['aft10'], slot: 'line' }),
    node({ id: 'type100', tier: 10, line: 'support', lane: 4, parents: ['ztz100_prototype'], slot: 'line' }),
    // Special
    node({ id: 't72b3m_kunlun', tier: 7, line: 'special', lane: 1, parents: [], slot: 'special' }),
    node({ id: 't72b3_qilin', tier: 7, line: 'special', lane: 2, parents: [], slot: 'special' }),
    node({ id: 't80u_yun', tier: 7, line: 'special', lane: 0, parents: [], slot: 'special' }),
  ]),
});
