import assert from 'node:assert/strict';
import { compareCountryThenTierThenName, countryFilterGroups } from './garageOrder.js';

const rank = new Map([
  ['USA', 0], ['USSR', 1], ['USSR/Russia', 1], ['Russia', 1], ['UK', 2],
]);
const tiers = new Map([
  ['challenger', 8], ['t72bu', 8], ['m1a2', 10], ['t90', 9],
  ['t72b3m', 9], ['m1a1', 9],
]);
const tierOf = (id) => tiers.get(id) ?? 6;
const cards = [
  { id: 'challenger', nation: 'UK', name: 'Challenger' },
  { id: 't72bu', nation: 'USSR/Russia', name: 'T-72BU' },
  { id: 'm1a2', nation: 'USA', name: 'M1A2 Abrams' },
  { id: 't90', nation: 'Russia', name: 'T-90' },
  { id: 't72b3m', nation: 'Russia', name: 'T-72B3M obr. 2022' },
  { id: 'm1a1', nation: 'USA', name: 'M1A1 Abrams' },
];

assert.deepEqual(
  cards.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['m1a1', 'm1a2', 't72bu', 't72b3m', 't90', 'challenger'],
  'garage cards sort by country first, tier second and display name third',
);

const combinedEras = [
  { id: 'm1a2', nation: 'USA', era: 'modern' },
  { id: 'm4a3', nation: 'USA', era: 'ww2' },
  { id: 't90', nation: 'Russia', era: 'modern' },
  { id: 't34', nation: 'USSR', era: 'ww2' },
];
const countryCode = (spec) => spec.nation === 'USA' ? 'us' : 'ru';
assert.deepEqual(
  countryFilterGroups(combinedEras, countryCode).map(({ id, count }) => [id, count]),
  [['us', 2], ['ru', 2]],
  'country filters combine modern, Cold War and WWII vehicles under one flag',
);

const duplicateNames = [
  { id: 'variant_b', nation: 'Russia', name: 'T-72' },
  { id: 'variant_a', nation: 'Russia', name: 'T-72' },
];
assert.deepEqual(
  duplicateNames.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['variant_a', 'variant_b'],
  'duplicate display names use a deterministic id tie-break',
);

console.log('garageOrder.selftest: country / tier / display-name ordering verified');
