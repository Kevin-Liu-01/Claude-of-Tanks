// The favourites the Garage and the Tank Gallery share (favouriteTanks.ts). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { readFavouriteTanks, writeFavouriteTanks } = await import('./favouriteTanks.ts');

assert.equal(readFavouriteTanks().size, 0, 'none before the first');
store.set('cot.gallery.v2', JSON.stringify({ sort: 'tier', layout: 'grid', favourites: ['m1a3', 7, 't90am'] }));
assert.deepEqual([...readFavouriteTanks()], ['m1a3', 't90am'], 'the Gallery\'s favourites, ids only');
writeFavouriteTanks(new Set(['m1a3', 'challenger3']));
const saved = JSON.parse(store.get('cot.gallery.v2'));
assert.deepEqual(saved.favourites, ['m1a3', 'challenger3']);
assert.equal(saved.sort, 'tier', 'the Gallery\'s other preferences stay');
store.set('cot.gallery.v2', '[1,2]');
assert.equal(readFavouriteTanks().size, 0, 'a malformed store reads as none');
console.log('favouriteTanks.selftest: one favourites set for the Garage and the Gallery, the Gallery\'s prefs kept');
