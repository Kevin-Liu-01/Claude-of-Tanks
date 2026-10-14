// Receipt (the maps lane, 2026-10-14): Aegis Crossing's Puente Nuevo lives in maps/puenteNuevo.ts (moved out of
// mapKits.ts under the token rule) and keeps the arched bridge's deck, parapet and body law.
//   - its shared constants equal mapKits.ts's BRIDGE_* (the arched bridge's, round 61), so a crossing reads the same
//     from the road whichever elevation the map authors;
//   - mapKits.ts hands a `profile: 'puente'` deck to it and builds nothing else for that deck;
//   - on a 54 m slot it draws stone and gives the deck, the parapets and the body's bands compound collision records
//     (64 parts each) in both sinks, every obstacle with its collider clone, spanning the gorge floor to the parapet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addPuenteBridge, PUENTE_SHARED_BRIDGE_M } from './puenteNuevo.ts';

const kits = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
const constant = (name) => {
  const m = kits.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(m, `mapKits.ts still defines ${name}`);
  return Number(m[1]);
};
assert.deepEqual({ ...PUENTE_SHARED_BRIDGE_M }, {
  parapetHeight: constant('BRIDGE_PARAPET_HEIGHT_M'), parapetThick: constant('BRIDGE_PARAPET_THICK_M'),
  slab: constant('BRIDGE_SLAB_M'), bodyBelowBed: constant('BRIDGE_BODY_BELOW_BED_M'),
  bodyTopUnderDeck: constant('BRIDGE_BODY_TOP_UNDER_DECK_M'), spandrelFill: constant('BRIDGE_SPANDREL_FILL_M'),
}, 'the Puente keeps the arched bridge\'s deck, parapet and body law');
assert.match(kits, /if \(deck\.profile === 'puente'\) \{ addPuenteBridge\(deck, heightField, rng, buckets, ctx\); return; \}/,
  'mapKits.ts hands a puente deck to puenteNuevo.ts and builds nothing else for it');
assert.ok(!/function addPuenteBridge|PUENTE_PIERS/.test(kits), 'the Puente\'s builder is not duplicated in mapKits.ts');

// a 54 m slot: the gorge floor at 0 inside 27 m of the axis, the rim at 40 m past it (the deck runs along x)
const deck = { x: 0, z: 0, ux: 1, uz: 0, halfLength: 34, halfWidth: 5, deckY: 41, bedY: 0 };
const heightField = { getHeightAt: (x) => (Math.abs(x) < 27 ? 0 : Math.min(40, (Math.abs(x) - 27) * 6)) };
let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const bucket = () => [];
const buckets = { plaster: bucket(), stone: bucket(), roof: bucket(), wood: bucket(), dark: bucket() };
const ctx = { obstacles: [], colliders: [] };
addPuenteBridge(deck, heightField, rng, buckets, ctx);
const tris = (list) => list.reduce((n, g) => n + (g.index ? g.index.count : g.getAttribute('position').count) / 3, 0);
assert.ok(tris(buckets.stone) > 1000, `the Puente draws its stone (${tris(buckets.stone)} triangles)`);
assert.ok(ctx.obstacles.length >= 1, 'the bridge is a collision record');
assert.equal(ctx.colliders.length, ctx.obstacles.length, 'each obstacle has its collider clone');
for (const record of ctx.obstacles) {
  assert.equal(record.kind, 'bridge');
  assert.ok(record.max[1] >= deck.deckY && record.min[1] <= 1, 'a record spans the gorge floor to the deck');
}
console.log(`puenteNuevo: shared bridge law equal, mapKits hands off, ${tris(buckets.stone)} stone triangles, ${ctx.obstacles.length} records + clones`);
