// The yards round a kit's houses (maps/regional/yards.ts, regional-buildings lane 2026-10-03): the planner puts a yard
// on the house's freest side and keeps every element (the enclosure's modules, the gate, the outbuilding, the beds)
// off the road frontage, the other plots, the solids, the larger destructibles, the objective discs and the spawn pads,
// skipping what does not fit; the beds are dressing.
import assert from 'node:assert/strict';
import { ROAD_FRONTAGE_CLEARANCE } from '../../roadBuildingFrontage.ts';
import { gardenParts, planCourt, planYard, yardBackSide, yardKeepOut, YARD_SHED } from './yards.ts';
import { streamFrom } from './geometry.ts';

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
// the map-revival lane (2026-10-05, Frontier's Hofreiten): a farmhouse gable-on to the road (its front, local +z, to the
// road at x = 0) with its barn behind the court on its +x flank keeps the court between them: walled on the street end
// with the gate, the court as deep as the barn reaches, nothing inside the barn's plot, no outbuilding or beds; a
// neighbour's barn (nearer a farmhouse of its own) is not its partner; a plain house keeps no court; the barn's back is
// the side away from the road
const COURT = { kinds: ['farmhouse'], partners: ['barn', 'granary'], reach: 16, wall: 'wallstone', gate: 'gate' };
const farm = { x: 13.6, z: 20, w: 15.5, d: 10.7, rot: -Math.PI / 2, kind: 'farmhouse' };   // front (+z local) toward -x
const local = (p, lx, lz) => { const c = Math.cos(p.rot), s = Math.sin(p.rot); return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; };
const [bx, bz] = local(farm, 13.8, -12.2);
const barn = { x: bx, z: bz, w: 8.6, d: 12.8, rot: farm.rot, kind: 'barn' };
const farmBody = { minX: -3.8, maxX: 8.5, minZ: -5.2, maxZ: 5.2 };
const courtWorld = world({ plots: [farm, barn] });
const court = planCourt(farm, courtWorld, COURT, 3.0, farmBody);
assert.ok(court, 'the farmhouse keeps a court with its barn');
assert.equal(court.partner, barn, 'the court belongs to its own barn');
assert.equal(court.plan.side, '+x', 'the court lies on the wing flank, toward the barn');
assert.ok(court.plan.depth >= 6 && court.plan.depth <= 10, `the court reaches the barn's far side at most (${court.plan.depth})`);
assert.ok(court.plan.gate, 'the street end carries the gate');
assert.ok(!court.plan.shed && !court.plan.garden, 'no outbuilding or beds in the court');
const gateRoad = ground.roadDist(court.plan.gate.x, court.plan.gate.z);
assert.ok(gateRoad >= ROAD_FRONTAGE_CLEARANCE && gateRoad < 12, `the gate stands in the street end (${gateRoad.toFixed(1)} m off the road)`);
for (const m of court.plan.modules) {
  const [lx, lz] = toLocal(barn, m.x, m.z);
  assert.ok(Math.abs(lx) > barn.w / 2 || Math.abs(lz) > barn.d / 2, 'no wall module on the barn');
}
const [nx, nz] = local(farm, -40, 0);
const neighbour = { ...farm, x: nx, z: nz };
const shared = planCourt(neighbour, world({ plots: [farm, barn, neighbour] }), COURT, 3.0, farmBody);
assert.equal(shared, null, "a neighbour's barn is not this farmhouse's partner");
assert.equal(planCourt(house, courtWorld, COURT, 3.0), null, 'a house with no partner on a flank keeps no court');
assert.equal(yardBackSide(barn, courtWorld), '-z', "the barn's back is its side away from the road");
const behind = planYard(barn, courtWorld, STYLE, streamFrom(4), 2.0, undefined, yardBackSide(barn, courtWorld));
if (behind) assert.equal(behind.side, '-z', 'the garden behind the barn keeps to its back');

console.log(`yards.selftest: ${plan.side} yard ${plan.depth} m deep, ${plan.modules.length} modules, gate, outbuilding and beds; `
  + `spawn pad ${moved ? `moves it to ${moved.side}` : 'leaves no yard'}; crowded house without one; beds ${tris} triangles; `
  + `court ${court.plan.depth} m to its barn, ${court.plan.modules.length} wall modules and the gate`);
