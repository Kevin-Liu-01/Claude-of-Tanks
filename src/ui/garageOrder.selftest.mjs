import assert from 'node:assert/strict';
import { compareNationThenName } from './garageOrder.js';

const rank = new Map([
  ['USA', 0], ['USSR', 1], ['USSR/Russia', 1], ['Russia', 1], ['UK', 2],
]);
const cards = [
  { id: 'challenger', nation: 'UK', name: 'Challenger' },
  { id: 't72bu', nation: 'USSR/Russia', name: 'T-72BU' },
  { id: 'm1a2', nation: 'USA', name: 'M1A2 Abrams' },
  { id: 't90', nation: 'Russia', name: 'T-90' },
  { id: 't72b3m', nation: 'Russia', name: 'T-72B3M obr. 2022' },
  { id: 'm1a1', nation: 'USA', name: 'M1A1 Abrams' },
];

assert.deepEqual(
  cards.sort((a, b) => compareNationThenName(a, b, rank)).map((card) => card.id),
  ['m1a1', 'm1a2', 't72b3m', 't72bu', 't90', 'challenger'],
  'garage cards sort by nation block and display name, not tier or registration order',
);

const duplicateNames = [
  { id: 'variant_b', nation: 'Russia', name: 'T-72' },
  { id: 'variant_a', nation: 'Russia', name: 'T-72' },
];
assert.deepEqual(
  duplicateNames.sort((a, b) => compareNationThenName(a, b, rank)).map((card) => card.id),
  ['variant_a', 'variant_b'],
  'duplicate display names use a deterministic id tie-break',
);

console.log('garageOrder.selftest: nation blocks and display-name ordering verified');
