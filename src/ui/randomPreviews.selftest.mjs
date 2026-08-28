import assert from 'node:assert/strict';
import { randomMapPreviewEntries } from './randomPreviews.ts';

const maps = [
  { id: 'random', thumb: '' },
  { id: 'foundry', thumb: '/foundry.webp' },
  { id: 'winter', thumb: '/winter.webp' },
  { id: 'desert', thumb: '/desert.webp' },
  { id: 'verdant', thumb: '/verdant.webp' },
  { id: 'coastal', thumb: '/coastal.webp' },
];

assert.deepEqual(
  randomMapPreviewEntries(maps).map((map) => map.id),
  ['verdant', 'desert', 'winter', 'foundry'],
  'random preview keeps a deliberate four-biome editorial order',
);
assert.deepEqual(
  randomMapPreviewEntries([{ id: 'random' }, { id: 'coastal', thumb: '/coastal.webp' }], 2)
    .map((map) => map.id),
  ['coastal'],
  'random and missing-art entries never become preview tiles',
);

console.log('randomPreviews.selftest: ok');
