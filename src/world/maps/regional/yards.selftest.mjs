// The yards round a kit's houses (maps/regional/yards.ts, regional-buildings lane 2026-10-03): the planner puts a yard
// on the house's freest side and keeps every element (the enclosure's modules, the gate, the outbuilding, the beds)
// off the road frontage, the other plots, the solids, the larger destructibles, the objective discs and the spawn pads,
// skipping what does not fit; the beds are dressing.
import assert from 'node:assert/strict';
import { ROAD_FRONTAGE_CLEARANCE } from '../../roadBuildingFrontage.ts';
import { gardenParts, planYard, yardKeepOut, YARD_SHED } from './yards.ts';
import { streamFrom } from './geometry.ts';
import { assertR2 } from '../../../../tools/r2-standard.mjs';

const STYLE = { kinds: ['cottage'], fence: 'fencepicket', gate: 'gate', shed: 'woodshed', garden: true };
// a level dry world with a road along the z axis (x = 0)
const ground = { roadDist: (x) => Math.abs(x), water: () => 0, normalY: () => 1 };
const world = (extra = {}) => ({ ground, plots: [], solids: [], destructibles: [], keepOut: { discs: [], rects: [] }, ...extra });
const house = { x: 12, z: 0, w: 10, d: 8, rot: 0, kind: 'cottage' };
const toLocal = (p, x, z) => { const c = Math.cos(p.rot), s = Math.sin(p.rot), dx = x - p.x, dz = z - p.z; return [dx * c - dz * s, dx * s + dz * c]; };

function check(plan, w, label) {
  assert.ok(plan, `${label}: a yard`);
  const points = [...plan.modules, ...(plan.gate ? [plan.gate] : []), ...(plan.shed ? [plan.shed] : []), ...(plan.garden ? [plan.garden] : [])];
  for (const p of points) {
    assert.ok(w.ground.roadDist(p.x, p.z) >= ROAD_FRONTAGE_CLEARANCE, `${label}: an element at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) stands in the road frontage`);
    for (const q of w.plots) {
      if (q === house) continue;
      const [lx, lz] = toLocal(q, p.x, p.z);
      assert.ok(Math.abs(lx) > q.w / 2 || Math.abs(lz) > q.d / 2, `${label}: an element stands on another plot`);
    }
    for (const [cx, cz, r] of w.keepOut.discs) assert.ok(Math.hypot(p.x - cx, p.z - cz) >= r, `${label}: an element stands in a keep-out disc`);
    // nothing of the yard on the house's own plot
    const [lx, lz] = toLocal(house, p.x, p.z);
    assert.ok(Math.abs(lx) > house.w / 2 || Math.abs(lz) > house.d / 2, `${label}: an element stands on the house's plot`);
  }
  return points;
}

// the side toward the road (-x, 7 m from it) cannot hold a yard clear of the frontage: another side takes it
const open = world();
const plan = planYard(house, open, STYLE, streamFrom(3), 2.0);
check(plan, open, 'open ground');
assert.notEqual(plan.side, '-x', 'the yard is not on the road side');
assert.ok(plan.depth >= 3 && plan.depth <= 8, `the yard is 3-8 m deep (${plan.depth})`);
assert.ok(plan.modules.length >= 6, `the yard is enclosed (${plan.modules.length} modules)`);
assert.ok(plan.gate, 'the outer run has a gate');
assert.ok(plan.shed && plan.garden, 'an outbuilding and the beds fit an open yard');
assert.equal(plan.shed.w, YARD_SHED.w, 'the default outbuilding plot');

// a spawn pad over the yard's side moves it; a neighbour's plot and a large destructible move it again
const side = plan.side;
const sideCentre = { '+x': [24, 0], '+z': [12, 10], '-z': [12, -10] }[side];
const padded = world({ keepOut: yardKeepOut('selftest', { player: { x: sideCentre[0], z: sideCentre[1] }, enemies: [{ x: 300, z: 0 }] }, [], []) });
const moved = planYard(house, padded, STYLE, streamFrom(3), 2.0);
if (moved) {
  check(moved, padded, 'spawn pad');
  assert.notEqual(moved.side, side, 'a spawn pad over the yard moves it to another side');
}
const crowded = world({
  plots: [house, { x: 12, z: 10, w: 10, d: 8, rot: 0 }, { x: 12, z: -10, w: 10, d: 8, rot: 0 }],
  destructibles: [{ x: 19, z: 0, r: 2.5, kind: 'bunker' }],
});
const tight = planYard(house, crowded, STYLE, streamFrom(5), 2.0);
assert.equal(tight, null, 'with the road on one side, plots on two and a bunker on the fourth, no yard');

// a destructible standing on the outer run's line leaves its module out
const blocker = world({ destructibles: [{ x: plan.modules[0].x, z: plan.modules[0].z, r: 0.5, kind: 'barrel' }] });
const gapped = planYard(house, blocker, STYLE, streamFrom(3), 2.0);
assert.ok(gapped && gapped.modules.length < plan.modules.length + (plan.gate ? 1 : 0), 'a module that would stand on a barrel is left out');

// a turned house: its yard keeps off its own plot and the road
const turned = { ...house, rot: 0.7 };
check(planYard(turned, open, STYLE, streamFrom(9), 2.0), open, 'turned house');

// the beds are dressing: finite, flagged no-collision, and raised on a slope by the drop they are given
const bed = gardenParts(3.6, 2.4, streamFrom(1), 0.3);
let tris = 0, minY = Infinity;
for (const list of Object.values(bed)) for (const g of list) {
  assert.equal(g.userData.noCollision, true, 'the beds are dressing');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { assert.ok(Number.isFinite(p.getY(i))); minY = Math.min(minY, p.getY(i)); }
  tris += p.count / 3;
}
assert.ok(tris > 20 && tris < 1200, `a bed is a few hundred triangles (${tris})`);
assert.ok(minY <= -0.3, 'the raised bed reaches down to the ground on its low side');
// (props lane A, #18b) each country's kitchen garden: dressing, inside its bed (a hand over its edge for the hedge or the
// hurdle), within its budget, and its own (no two countries' gardens the same)
const sizes = new Map();
for (const mapId of ['verdant', 'frontier', 'polders', 'coastal', 'cliffbridge', 'monsoon', 'caldera', 'longleaf']) {
  const g = gardenParts(4.2, 2.6, streamFrom(7), 0, mapId);
  let n = 0;
  for (const list of Object.values(g)) for (const geo of list) {
    assert.equal(geo.userData.noCollision, true, `${mapId}: its garden is dressing`);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(p.getX(i)) <= 2.1 + 0.25 && Math.abs(p.getZ(i)) <= 1.3 + 0.25, `${mapId}: inside its bed`);
      assert.ok(p.getY(i) <= 2.6, `${mapId}: nothing over a sunflower's head`);
    }
    n += p.count / 3;
  }
  assert.ok(n > 300 && n < 1500, `${mapId}: its garden ${n} triangles`);
  sizes.set(mapId, n);
}
assert.ok(new Set([...sizes.values()]).size >= 6, 'the countries keep their gardens their own ways');
// (the r2 sweep, 2026-10-16: the kitchen garden graded 0 — its bed a plain box, the sunflowers' dark discs painted on
// their heads, the gourds and tomatoes hung in the air) every country's garden to the bunker r2 standard, at the planner's
// sizes (1.8-4.2 m by 1.4-3.2 m) level and raised on a slope; dressing, no destroyed state
const GARDEN_MAPS = ['airfield', 'autumn', 'caldera', 'cliffbridge', 'coastal', 'fjord', 'frontier', 'longleaf', 'mangrove', 'monsoon',
  'orchard', 'polders', 'railyard', 'reservoir', 'saltwind', 'steppe', 'urban', 'verdant'];
const GARDEN_FORM = { verdant: 'slavic', steppe: 'slavic', polders: 'dutch', coastal: 'french', autumn: 'french', orchard: 'med',
  saltwind: 'med', cliffbridge: 'med', monsoon: 'monsoon', mangrove: 'monsoon', caldera: 'japan', longleaf: 'american' };
for (const [gw, gd, seed, drop] of [[4.2, 2.6, 7, 0], [3.6, 2.4, 1, 0.3], [4.2, 3.2, 11, 0.1], [2.0, 1.5, 3, 0]]) {
  assertR2({ kind: `site:kitchen-garden ${gw}x${gd}`, maps: GARDEN_MAPS, route: 'crush', noBroken: true, caps: { near: 2400 },
    resolve: (mapId) => ({ form: GARDEN_FORM[mapId] ?? 'german', build: () => gardenParts(gw, gd, streamFrom(seed), drop, mapId) }) });
}
console.log(`yards.selftest: ${plan.side} yard ${plan.depth} m deep, ${plan.modules.length} modules, gate, outbuilding and beds; `
  + `spawn pad ${moved ? `moves it to ${moved.side}` : 'leaves no yard'}; crowded house without one; beds ${tris} triangles; 8 countries' gardens ${[...sizes.values()].join('/')}`);
