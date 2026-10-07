// The map-revival lane (2026-10-06, Chimney Valley round 2; gauntlet wave 136: "a straight-sided grey drum ... no gate,
// passage or doorway cut through it"): the rooms cut into Chimney Valley's castle and gate rocks (rockRooms.ts).
//
//   1. the sites are the map's own pinnacles: every site stands on a knoll landform of the same centre, radii and
//      height, the castle rocks' rotation of each other, and the gate rocks carry a passage on the valley's axis;
//   2. laid on the real ground, every opening sits on the face it is cut into: the ground a step out from it lies
//      under its centre and the rock a step in stands over it (no opening floats off a wall or sinks into the crown),
//      each tier and each rock carries openings, and each gate rock's passage has both mouths;
//   3. the dressing is soft (the dark of an opening, the tuff of a built front, the lime of a dovecote band: no
//      collision record), finite, deterministic, and only Chimney Valley's dressing lays it, last in the stream.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { getMapConfig } = await import('./index.ts');
const { createHeightField } = await import('../terrain.ts');
const { GOREME_ROCK_ROOMS } = await import('./goreme.ts');
const { dressRockRooms } = await import('./rockRooms.ts');

const cfg = getMapConfig('goreme');
const knolls = cfg.terrain.landforms.filter((l) => l.kind === 'knoll');
assert.equal(GOREME_ROCK_ROOMS.length, 4, 'two castle rocks and two gate rocks');
for (const site of GOREME_ROCK_ROOMS) {
  const knoll = knolls.find((k) => k.x === site.x && k.z === site.z);
  assert.ok(knoll, `the site at (${site.x}, ${site.z}) is one of the map's pinnacles`);
  assert.deepEqual([knoll.rx, knoll.rz, knoll.height], [site.rx, site.rz, site.height], 'with its radii and height');
  assert.equal(site.apron, knoll.geology.apron, 'the rooms start over its own talus apron');
}
const [castleA, castleB, gateA, gateB] = GOREME_ROCK_ROOMS;
assert.ok(castleA.x === -castleB.x && castleA.z === -castleB.z && !castleA.gateBearings && !castleB.gateBearings,
  'the castle rocks are each other\'s rotation and carry no passage');
for (const gate of [gateA, gateB]) {
  assert.equal(gate.gateBearings.length, 2, 'a gate rock\'s passage has two mouths');
  const toCentre = Math.atan2(-gate.z, -gate.x);
  assert.ok(gate.gateBearings.some((b) => Math.abs(Math.atan2(Math.sin(b - toCentre), Math.cos(b - toCentre))) < 1e-9),
    'one mouth faces the valley\'s middle and the other away, on its axis');
}

const ground = createHeightField(1337, cfg);
const lay = (seed) => {
  let s = seed >>> 0;
  const rng = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const buckets = { dark: [], stone: [], plaster: [], plaster2: [] };
  const openings = dressRockRooms(GOREME_ROCK_ROOMS, ground, rng, buckets);
  return { openings, buckets };
};
const { openings, buckets } = lay(7);
assert.ok(openings >= 120, `the rocks are hollowed into a village (${openings} openings)`);
assert.equal(buckets.plaster.length, 0, 'the dovecote bands take the kit\'s lime, not the render');
assert.ok(buckets.plaster2.length >= 6 && buckets.stone.length >= 6, 'dovecote bands and built fronts on the rocks');

const centreOf = (geometry) => {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
};
const perSite = GOREME_ROCK_ROOMS.map(() => 0);
let offFace = 0, worst = '';
for (const geometry of [...buckets.dark, ...buckets.stone, ...buckets.plaster2]) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), 'finite');
}
for (const geometry of buckets.dark) {
  const c = centreOf(geometry);
  let k = 0;
  for (let j = 1; j < GOREME_ROCK_ROOMS.length; j++) {
    const a = GOREME_ROCK_ROOMS[j], b = GOREME_ROCK_ROOMS[k];
    if (Math.hypot(c.x - a.x, c.z - a.z) < Math.hypot(c.x - b.x, c.z - b.z)) k = j;
  }
  const site = GOREME_ROCK_ROOMS[k];
  perSite[k]++;
  const r = Math.hypot(c.x - site.x, c.z - site.z), ux = (c.x - site.x) / r, uz = (c.z - site.z) / r;
  const out = ground.getHeightAt(c.x + ux * 2.5, c.z + uz * 2.5), inn = ground.getHeightAt(c.x - ux * 2.5, c.z - uz * 2.5);
  if (!(out < c.y && inn > c.y - 1)) { offFace++; worst = `(${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}): out ${out.toFixed(1)}, in ${inn.toFixed(1)}`; }
}
assert.equal(offFace, 0, `every opening sits on the face it is cut into (${offFace} off: ${worst})`);
perSite.forEach((n, i) => assert.ok(n >= 20, `rock ${i} carries its rooms (${n} openings)`));

const again = lay(7);
assert.equal(again.openings, openings, 'deterministic: the same stream lays the same rooms');
assert.deepEqual(Array.from(again.buckets.dark[0].attributes.position.array.slice(0, 9)),
  Array.from(buckets.dark[0].attributes.position.array.slice(0, 9)), 'to the vertex');

// only Chimney Valley's dressing lays them, after every earlier kit (so the stream's earlier dressing holds)
const kits = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
const call = kits.indexOf("if (kits.includes('rockRooms') && mapId === 'goreme') dressRockRooms(");
assert.ok(call > 0 && call > kits.indexOf('if (L.railSpurs?.length) dressRailSpurs(focused, L.railSpurs);'),
  'mapKits.ts lays the rooms last, for Chimney Valley only');
assert.deepEqual(cfg.props.extraKits, ['rockRooms'], 'Chimney Valley opts in');
console.log(`rockRooms: ${openings} openings on ${GOREME_ROCK_ROOMS.length} rocks (${perSite.join(', ')} dark cuts), ${buckets.stone.length} built fronts and gate surrounds, ${buckets.plaster2.length} dovecote bands; every opening on its face`);
