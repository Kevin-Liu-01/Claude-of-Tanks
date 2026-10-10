// Receipt (the map-revival lane, mr1, Suzhou round 3, 2026-10-07; gauntlet wave 209's after frames: the station's
// "unmullioned panels", its train shed read as a "quonset-hut-shaped roof by the clocktower", the station "on bare
// dirt"): Shanghai North Station reads as a terminus and stands on its own ground.
//   - the skyline kit's stationHall: the head building's mullions drawn at any range (a phone's build keeps them), each
//     shed span a pointed arch rising all the way to its crown, a smoke-vent lantern over each crown, the open end's
//     screen glazed; the shed's arches, lanterns and screens dressing only (the station's collision is its walls');
//   - the street kit's dressing (shanghaiStreets.ts dressNorthStation): a forecourt of setts before the head building,
//     clear of a road's core, two tracks a span out of the shed's open end, the rails across a road's core flush with
//     it; no collision record added.
import assert from 'node:assert/strict';
import { stationHall } from './regional/skyline.ts';
import { streamFrom } from './regional/geometry.ts';
import { dressShanghai } from './shanghaiStreets.ts';

// ---- the station hall on North Station's plot (33.2 x 22.8 m), intact so no damage draw removes a part
const W = 33.2, D = 22.8;
const ctx = (tier) => ({ structureId: 'civichall', info: { w: W, d: D, h: 20 }, bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2, maxY: 20 },
  wallBucket: 'stone', rng: streamFrom(5), variant: streamFrom(6), mapId: 'blackglass', snowCap: false, tier });
const phone = stationHall({ damage: 0, nameBoard: true })(ctx('mobile'));
const coarse = (bucket) => (phone[bucket] ?? []).filter((g) => !g.userData.fine);
const tris = (list, test) => {
  const out = [];
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i + 2 < p.count; i += 3) {
      const t = { y: (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, x: (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z: (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3,
        nx: n.getX(i), ny: n.getY(i), nz: n.getZ(i),
        w: Math.max(p.getX(i), p.getX(i + 1), p.getX(i + 2)) - Math.min(p.getX(i), p.getX(i + 1), p.getX(i + 2)) };
      if (test(t)) out.push(t);
    }
  }
  return out;
};
// the head's mullions: thin metal panels facing the street on the phone's build
const mullions = tris(coarse('structureMetal'), (t) => t.nz > 0.99 && t.w < 0.08 && t.y > 1 && t.y < 12);
assert.ok(mullions.length >= 12, `the head building's mullions draw at any range (${mullions.length / 2} panels on a phone)`);
// the shed: two spans on a 33 m plot, a glazed screen at the open end (-z) of each, a lantern over each crown
const zMin = Math.min(...Object.values(phone).flat().map((g) => { g.computeBoundingBox(); return g.boundingBox.min.z; }));
const screen = tris(coarse('glass'), (t) => t.nz < -0.99 && Math.abs(t.z - zMin) < 0.2 && t.y > 7.5);
const spans = new Set(screen.map((t) => Math.sign(t.x)));
assert.ok(screen.length >= 20 && spans.size === 2, `the open end's two spans glazed (${screen.length} triangles, spans ${[...spans]})`);
const lantern = tris(coarse('dark'), (t) => t.y > 12.9);
assert.ok(lantern.length > 0 && new Set(lantern.map((t) => Math.sign(t.x))).size === 2, 'a smoke-vent lantern over each span\'s crown');
// each span's arch rises all the way to its crown: along the outer vault, the highest point stands at the span's middle
const vault = tris([...coarse('glass'), ...coarse('roof')], (t) => t.ny > 0.1 && t.y > 7.6 && t.z > zMin + 1);
for (const side of [-1, 1]) {
  const span = vault.filter((t) => Math.sign(t.x) === side);
  const top = span.reduce((a, b) => (b.y > a.y ? b : a));
  const centre = side * (W - 0.8 - 1) / 4;
  assert.ok(Math.abs(top.x - centre) < 1.2, `span ${side}: the vault's highest band at its middle (${top.x.toFixed(2)} by ${centre.toFixed(2)})`);
  const flanks = span.filter((t) => Math.abs(t.x - centre) > 1.0 && Math.abs(t.x - centre) < 2.4);
  assert.ok(flanks.every((t) => t.ny < 0.995), `span ${side}: the arch still climbs beside its crown (a point, not a barrel's flat top)`);
}
// the shed's arches, lanterns and screens are dressing: the structural parts are the walls, the head and the tower
const structural = Object.values(stationHall({ damage: 0 })(ctx('desktop'))).flat().filter((g) => !g.userData.noCollision);
for (const g of structural) {
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.y < 30, 'no structural part above the clock tower');
}

// ---- the street kit's dressing: a station seat on the Zhabei bank, a road down its right side
const seat = { kind: 'civichall', x: 100, z: 220, w: W, d: D, rot: 0 };
const road = [[100 + W / 2 + 9, 120], [100 + W / 2 + 9, 320]];
const buckets = {};
const obstacles = [], colliders = [];
dressShanghai({ L: { roads: [road] }, heightField: { getHeightAt: () => 0 }, buckets, obstacles, colliders, buildings: [seat] });
assert.equal(obstacles.length + colliders.length, 0, 'the station\'s ground adds no collision record');
const setts = tris(buckets.stone ?? [], (t) => t.ny > 0.99 && Math.abs(t.y - 0.035) < 0.01);
assert.ok(setts.length >= 100, `a forecourt of setts (${setts.length} triangles)`);
assert.ok(setts.every((t) => t.z > seat.z + D / 2 - 0.2), 'the forecourt before the head building');
assert.ok(setts.every((t) => Math.abs(t.x - road[0][0]) > 3.5), 'the forecourt clear of the road\'s core');
const rails = tris(buckets.structureMetal ?? [], (t) => t.ny > 0.99 && t.w < 0.1 && t.z < seat.z - D / 2 - 20);
assert.ok(new Set(rails.map((t) => Math.round(t.x))).size >= 8, `the rails run out of the shed's open end (${new Set(rails.map((t) => Math.round(t.x))).size} rail lines past 20 m)`);
console.log(`northStation.selftest: the head's mullions on a phone (${mullions.length / 2} panels), two pointed spans under lanterns and glazed screens, `
  + `${setts.length / 2} forecourt setts clear of the road, rails out of the shed, no collision added`);
