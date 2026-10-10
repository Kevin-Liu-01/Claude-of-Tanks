// Structures that take damage and collapse (docs/DESTRUCTION.md §3, §5): the table derived from the collision groups,
// the hit-point and stage laws, the blast and ram pricing, the collapse queue and its collision swap, landmarks that
// only breach, fixed groups that take nothing, and the destruction match's log and restore.
import assert from 'node:assert/strict';
import { setCompoundShape, setObbShape, setCircleShape } from '../world/collision.ts';
import {
  COLLAPSES_PER_TICK, RAM_SCUFF_KJ, STAGE_EVENTS_PER_TICK, createStructureDamage, minimumAreaRectangle, ramStructurePoints,
  stageForIntegrity, structureHitPoints, structureMassClass,
} from './structureDamage.ts';
import { createDestructionMatch, resetStructureRecords } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { GAME_MODE_IDS } from './matchModes.ts';
import { cookOffChargeKg, structureBlastPoints } from './munitionBlast.ts';
import { structureMaterialFor, wallMaterialForStyle } from './structureMaterial.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps,
  `${label}: ${actual} is not within ${eps} of ${expected}`);

/** One building: a contact record (an oriented box w × d) and `bands` shell bands of 0.5 m up to `h`. */
function building(id, cx, cz, w, d, h, yaw = 0, role) {
  const contact = setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: id }, cx, cz, w / 2, d / 2, yaw);
  const shell = setCompoundShape({ min: [0, 0, 0], max: [0, h, 0], kind: 'structure', structureIdx: id },
    [{ kind: 'obb', cx, cz, hw: w / 2, hl: d / 2, yaw }]);
  if (role) { contact.structureRole = role; shell.structureRole = role; }
  return { obstacles: [contact], colliders: [shell] };
}
function world(...parts) {
  const obstacles = [], colliders = [];
  for (const part of parts) { obstacles.push(...part.obstacles); colliders.push(...part.colliders); }
  // unrelated records: a tree and a prop never join a structure
  obstacles.push(setCircleShape({ min: [0, 0, 0], max: [0, 8, 0], kind: 'tree', treeIdx: 4, crushable: true }, 200, 200, 0.4));
  colliders.push(setObbShape({ min: [0, 0, 0], max: [0, 1, 0], kind: 'crate', propIdx: 9, crushable: true }, 210, 210, 0.5, 0.5));
  return { obstacles, colliders };
}
const blowAt = (x, y, z, cause = 'blast', munition = 'he') => ({ cause, munition, x, y, z, dirX: 1, dirZ: 0 });

// ---- laws
near(structureHitPoints(60), 13.73, 0.01, 'a 60 m³ shed');
near(structureHitPoints(560), 68.55, 0.01, 'a 560 m³ house');
near(structureHitPoints(7200), 431.13, 0.01, 'a 7,200 m³ warehouse');
assert.equal(structureHitPoints(1), 10, 'the floor');
assert.equal(structureMassClass(150, 'building'), 'shed');
assert.equal(structureMassClass(1500, 'building'), 'house');
assert.equal(structureMassClass(9000, 'building'), 'large');
assert.equal(structureMassClass(30000, 'building'), 'landmark');
assert.equal(structureMassClass(150, 'setpiece'), 'landmark', 'a set piece is a landmark whatever its size');
assert.deepEqual([1, 0.71, 0.7, 0.36, 0.35, 0.01, 0, -1].map(stageForIntegrity), [0, 0, 1, 1, 2, 2, 3, 3]);
// the ram law (§4.4, 2026-10-08): (½·m·v² − E₀(material)) / 40, E₀ the energy the wall's face absorbs crushing 2 cm over
// a hull's 2 m² bow (σc · A · d): timber 30, mudbrick 60, masonry 300, concrete 1,100 kJ; masonry when unnamed
near(ramStructurePoints(60, 10), (3000 - 300) / 40, 1e-9, '60 t at 10 m/s on masonry');
near(ramStructurePoints(60, 9), (2430 - 300) / 40, 1e-9, '60 t at 9 m/s');
near(ramStructurePoints(40, 6, 'timber'), (720 - 30) / 40, 1e-9, 'a 40 t medium at 6 m/s on a timber shed');
assert.deepEqual(RAM_SCUFF_KJ, { timber: 30, adobe: 60, masonry: 300, concrete: 1100 });
for (const [material, speed] of [['timber', 1.1], ['adobe', 1.55], ['masonry', 3.46], ['concrete', 6.63]]) {
  assert.equal(ramStructurePoints(50, speed - 0.02, material), 0, `${material}: a 50 t hull under ${speed} m/s only scuffs it`);
  assert.ok(ramStructurePoints(50, speed + 0.02, material) > 0, `${material}: above it, structure`);
}
assert.equal(ramStructurePoints(50, 1.3), 0, 'the coordinator\'s 1.3 m/s bump (42 kJ) scuffs masonry');
assert.equal(ramStructurePoints(60, 1), 0, 'a nudge at 1 m/s');
// the material from the map's style and the class: sheds timber, houses the map's walls, halls no softer than masonry
assert.equal(wallMaterialForStyle('ksar'), 'adobe');
assert.equal(wallMaterialForStyle('glencanyon'), 'concrete');
assert.equal(wallMaterialForStyle('franconian'), 'masonry');
assert.equal(wallMaterialForStyle(null), 'masonry');
assert.deepEqual(['shed', 'house', 'large', 'landmark'].map((c) => structureMaterialFor(c, 'adobe')), ['timber', 'adobe', 'masonry', 'masonry']);
assert.deepEqual(['shed', 'house', 'large', 'landmark'].map((c) => structureMaterialFor(c, 'concrete')), ['timber', 'concrete', 'concrete', 'concrete']);
// the feel targets (coordinator 2026-10-07): a 600 m³ house, a 60 m³ shed, a 125 mm HE contact round
{
  const house = structureHitPoints(600), shed = structureHitPoints(60), he = structureBlastPoints(3.52, 'he', 0);
  assert.equal(Math.ceil(house * 0.30 / he), 2, 'a house is damaged by the second HE round');
  assert.equal(Math.ceil(house * 0.65 / he), 4, 'breached by the fourth');
  assert.equal(Math.ceil(house / he), 6, 'down by the sixth');
  assert.ok(structureBlastPoints(20.04, 'howitzer', 0) < house && structureBlastPoints(20.04, 'howitzer', 0) + he > house,
    'one gunship howitzer shell and a little');
  assert.equal(Math.ceil(shed / he), 2, 'a shed falls to two HE rounds');
  assert.ok(ramStructurePoints(40, 6, 'timber') >= shed * 0.9, 'or nearly to a medium hull at 6 m/s');
  for (const material of ['masonry', 'adobe']) {
    assert.ok(ramStructurePoints(60, 9, material) >= house * 0.65 - 1e-9 && ramStructurePoints(60, 9, material) < house,
      `a heavy hull at 9 m/s breaches a ${material} house`);
    assert.ok(ramStructurePoints(60, 12, material) >= house, `at 12 m/s it brings it down (${material})`);
    assert.ok(ramStructurePoints(37.5, 8, material) >= house * 0.30, `a medium at 8 m/s damages it (${material})`);
  }
  assert.ok(ramStructurePoints(37.5, 8) < house * 0.65, 'without breaching masonry');
}

// ---- footprints: the minimum-area rectangle, canonical (forward along the longer side, yaw in [0, π))
for (const yaw of [0, 0.4, 1.2, Math.PI / 2, 2.6, -0.7]) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const points = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [0.3, 0.2], [-0.5, 0.9]]) {
    points.push([12 + rx * 3 * a + fx * 7 * b, -5 + rz * 3 * a + fz * 7 * b]);
  }
  const rect = minimumAreaRectangle(points);
  near(rect.cx, 12, 1e-6, `centre x at yaw ${yaw}`);
  near(rect.cz, -5, 1e-6, `centre z at yaw ${yaw}`);
  near(rect.hw, 3, 1e-6, `half width at yaw ${yaw}`);
  near(rect.hd, 7, 1e-6, `half depth at yaw ${yaw}`);
  const expected = ((yaw % Math.PI) + Math.PI) % Math.PI;
  near(Math.abs(Math.sin(rect.yaw - expected)), 0, 1e-6, `yaw at ${yaw}`);
  assert.ok(rect.yaw >= 0 && rect.yaw < Math.PI, 'canonical yaw');
}

// ---- the table
{
  const { obstacles, colliders } = world(building(0, 0, 0, 4, 5, 3), building(1, 40, 0, 10, 8, 7, 0.3),
    building(2, 80, 0, 30, 40, 12), building(3, 0, 60, 50, 50, 20, 0, 'setpiece'), building(4, 40, 60, 8, 60, 6, 0, 'fixed'));
  const damage = createStructureDamage(obstacles, colliders);
  assert.deepEqual(damage.structures.map((s) => s.id), [0, 1, 2, 3, 4]);
  assert.deepEqual(damage.structures.map((s) => s.massClass), ['shed', 'house', 'large', 'landmark', 'large']);
  near(damage.byId(1).volumeM3, 560, 1e-6, 'volume = band area × height');
  near(damage.byId(1).maxHp, 68.55, 0.01, 'house hit points');
  assert.equal(damage.byId(3).collapsible, false, 'a landmark never collapses');
  assert.equal(damage.byId(4).destructible, false, 'a fixed group takes nothing');
  assert.equal(damage.structureOf(obstacles[1]), damage.byId(1));
  assert.equal(damage.structureOf(colliders[2]), damage.byId(2));
  assert.equal(damage.structureOf(obstacles.at(-1)), null, 'a tree is no structure');
  near(damage.byId(1).yaw, 0.3 + Math.PI / 2, 1e-6, 'the footprint turns forward along its longer (10 m) side');
  near(damage.byId(1).hd, 5, 1e-6, 'half depth along the longer side');
}

// ---- stages, events and the collapse swap
{
  const { obstacles, colliders } = world(building(0, 0, 0, 10, 8, 7));
  const collapsed = [];
  const damage = createStructureDamage(obstacles, colliders, { onCollapse: (s) => collapsed.push(s.id) });
  const house = damage.byId(0);
  const events = [];
  damage.applyPoints(house, house.maxHp * 0.2, blowAt(5, 1, 0));
  damage.step(); damage.drainEvents(events);
  assert.deepEqual(events, [], '80 % integrity is intact');
  damage.applyPoints(house, house.maxHp * 0.15, blowAt(5, 1, 0));
  damage.step(); damage.drainEvents(events);
  assert.deepEqual(events.map((e) => [e.stage, e.previous]), [['damaged', 'intact']]);
  assert.equal(events[0].cause, 'blast');
  near(events[0].integrity, 0.65, 1e-9, 'the event carries the integrity left');
  events.length = 0;
  // one blow across two thresholds: breached, then collapsed, in order; the collapse waits for its swap in step
  damage.applyPoints(house, house.maxHp, blowAt(5, 1, 0, 'ram', null));
  assert.equal(house.collapsePending, true);
  assert.equal(obstacles[0].crushed, undefined, 'no swap before the step');
  damage.step(); damage.drainEvents(events);
  assert.deepEqual(events.map((e) => [e.stage, e.previous]), [['breached', 'damaged'], ['collapsed', 'breached']]);
  assert.equal(obstacles[0].crushed, true, 'the contact record no longer pushes');
  assert.equal(colliders[0].crushed && colliders[0].dead, true, 'the shell bands no longer stop shells or sight');
  assert.equal(obstacles.at(-1).crushed, undefined, 'unrelated records untouched');
  assert.deepEqual(collapsed, [0]);
  damage.applyPoints(house, 100, blowAt(5, 1, 0));
  damage.step(); damage.drainEvents(events);
  assert.equal(events.length, 2, 'a collapsed structure takes nothing more');
  resetStructureRecords(obstacles, colliders);
  assert.equal(obstacles[0].crushed || colliders[0].crushed || colliders[0].dead, false, 'a new battle stands it again');
}

// ---- landmarks breach only; fixed groups take nothing
{
  const { obstacles, colliders } = world(building(0, 0, 0, 50, 50, 20, 0, 'setpiece'), building(1, 100, 0, 8, 60, 6, 0, 'fixed'));
  const damage = createStructureDamage(obstacles, colliders);
  const events = [];
  damage.applyPoints(damage.byId(0), 1e6, blowAt(0, 1, 0));
  damage.applyPoints(damage.byId(1), 1e6, blowAt(100, 1, 0));
  damage.step(); damage.drainEvents(events);
  assert.deepEqual(events.map((e) => [e.structureId, e.stage]), [[0, 'damaged'], [0, 'breached']]);
  near(damage.byId(0).hp / damage.byId(0).maxHp, 0.05, 1e-9, 'a landmark floors at 5 %');
  assert.equal(obstacles[0].crushed, undefined, 'a landmark keeps its collision');
  assert.equal(damage.byId(1).hp, damage.byId(1).maxHp, 'a fixed group is untouched');
}

// ---- blasts: contact, falloff, reach, bucket edges, ascending order
{
  // three 6 × 6 m sheds (108 m³, 20.9 HP) in a row across a 16 m bucket edge (x = 0 is a bucket edge: −512 + 32 · 16)
  const { obstacles, colliders } = world(building(0, -3.5, 0, 6, 6, 3), building(1, 3.5, 0, 6, 6, 3), building(2, 40, 0, 6, 6, 3));
  const damage = createStructureDamage(obstacles, colliders);
  const [a, b, c] = damage.structures;
  const before = [a.hp, b.hp, c.hp];
  damage.applyBlast(3.5, 'he', blowAt(-3.5, 1, 3.01), a);
  near(before[0] - a.hp, structureBlastPoints(3.5, 'he', 0), 1e-9, 'the struck shed takes the contact blast');
  // b's nearest surface: x 0.5 and z 3, the burst at x −3.5, z 3.01 → 4 m and 1 cm away
  near(before[1] - b.hp, structureBlastPoints(3.5, 'he', Math.hypot(4.0, 0.01)), 1e-9,
    'its neighbour across the bucket edge takes the falloff');
  assert.equal(c.hp, before[2], 'a shed 40 m off is out of a 3.5 kg charge’s reach');
  damage.applyBlast(0, 'he', blowAt(-3.5, 1, 0));
  damage.applyBlast(20, 'howitzer', blowAt(40, 1, 0), c);
  assert.ok(c.hp < before[2], 'the gunship howitzer reaches it');
}

// ---- ram: the crash's added energy, once
{
  const { obstacles, colliders } = world(building(0, 0, 0, 10, 8, 7));
  const damage = createStructureDamage(obstacles, colliders);
  const house = damage.byId(0);
  damage.applyRam(house, 60, 6, 0, blowAt(5, 1, 0, 'ram', null));
  const first = house.maxHp - house.hp;
  near(first, ramStructurePoints(60, 6), 1e-9, 'a 6 m/s ram');
  damage.applyRam(house, 60, 10, 6, blowAt(5, 1, 0, 'ram', null));
  near(house.maxHp - house.hp, ramStructurePoints(60, 10), 1e-9, 'the crash grown to 10 m/s costs what one 10 m/s blow does');
}

// ---- the collapse queue: at most COLLAPSES_PER_TICK swaps a tick, events in authority order
{
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(building(i, i * 20, 0, 4, 5, 3));
  const { obstacles, colliders } = world(...parts);
  const damage = createStructureDamage(obstacles, colliders);
  for (const structure of damage.structures) damage.applyPoints(structure, 1e6, blowAt(structure.cx, 1, structure.cz));
  const ticks = [];
  for (let tick = 0; tick < 6; tick++) {
    damage.step();
    const events = [];
    damage.drainEvents(events);
    ticks.push(events.map((e) => `${e.structureId}:${e.stage}`));
  }
  assert.equal(COLLAPSES_PER_TICK, 1);
  assert.equal(STAGE_EVENTS_PER_TICK, 4);
  const collapsesPerTick = ticks.map((events) => events.filter((e) => e.endsWith('collapsed')).length);
  assert.deepEqual(collapsesPerTick, [1, 1, 1, 1, 1, 0], 'one swap a tick, the fifth in the fifth');
  assert.ok(collapsesPerTick.every((n) => n <= COLLAPSES_PER_TICK), `collapse swaps per tick ${collapsesPerTick}`);
  assert.equal(ticks.flat().filter((e) => e.endsWith('collapsed')).length, 5, 'every collapse arrives');
  const order = ticks.flat().filter((e) => e.endsWith('collapsed')).map((e) => Number(e.split(':')[0]));
  assert.deepEqual(order, [0, 1, 2, 3, 4], 'collapses in authority order');
  for (const tick of ticks) assert.ok(tick.filter((e) => !e.endsWith('collapsed')).length <= STAGE_EVENTS_PER_TICK);
}

// ---- the match: rules, the log, restore, cook-off
{
  const rules = matchRulesetFor('standard').destruction;
  assert.equal(rules.structures, true);
  for (const mode of GAME_MODE_IDS) {
    const ruleset = matchRulesetFor(mode);
    assert.equal(ruleset.destruction.structures, mode !== 'turbo_ball', `${mode}: structures`);
    assert.equal(ruleset.destruction.craters, false, `${mode}: craters off until the drawn terrain follows the overlay (P3)`);
  }
  assert.equal(matchRulesetFor('ac130').destruction.craterScale, 1.25);
  const make = () => world(building(0, 0, 0, 4, 5, 3), building(1, 20, 0, 10, 8, 7));
  const first = make();
  const match = createDestructionMatch({ rules, ...first });
  assert.equal(match.enabled, true);
  const events = [];
  // a hull cooking off against the shed's wall (contact: 25.2 SP of its 13.7) brings it down; the house 18 m off stands
  match.tankDeath('ammorack', 60, 1, 0.5, 2.4);
  match.step();
  match.drainEvents(events);
  assert.deepEqual(events.map((e) => [e.structureId, e.stage, e.munition]),
    [[0, 'damaged', 'cook_off'], [0, 'breached', 'cook_off'], [0, 'collapsed', 'cook_off']], 'a cook-off against a shed');
  // a heavy hull ramming the house at 9 m/s breaches it; a second ram brings it down
  match.ram(first.obstacles[1], 60, 9, 0, 15, 0.5, 0, 1, 0);
  match.step();
  match.drainEvents(events);
  assert.deepEqual(events.slice(3).map((e) => [e.structureId, e.stage, e.cause]), [[1, 'damaged', 'ram'], [1, 'breached', 'ram']],
    'a 60 t hull at 9 m/s breaches the house');
  match.ram(first.obstacles[1], 60, 9, 0, 15, 0.5, 0, 1, 0);
  match.step();
  match.drainEvents(events);
  assert.deepEqual(events.slice(5).map((e) => [e.structureId, e.stage]), [[1, 'collapsed']], 'the second ram brings it down');
  assert.deepEqual(match.log.map((e) => `${e.structureId}:${e.stage}`), events.map((e) => `${e.structureId}:${e.stage}`),
    'the log records every released stage in order');
  // a resumed host lays the log down: same flags, same log, no events
  const second = make();
  const resumed = createDestructionMatch({ rules, ...second });
  assert.equal(resumed.restore(match.log), match.log.length);
  resumed.step();
  assert.equal(resumed.drainEvents([]), 0, 'a restore emits nothing');
  assert.deepEqual(resumed.log, match.log);
  assert.equal(second.obstacles[0].crushed, true, 'the restored collapse swapped its collision');
  near(cookOffChargeKg(60), 9, 1e-9, 'the cook-off charge');
  // inert without groups or with the rules off
  const bare = world();
  assert.equal(createDestructionMatch({ rules, ...bare }).enabled, false, 'a shard without groups has no structures');
  assert.equal(createDestructionMatch({ rules: matchRulesetFor('turbo_ball').destruction, ...make() }).enabled, false);
}

console.log('structureDamage: laws, footprints, table, stages and swap, landmarks and fixed groups, blast reach and '
  + 'buckets, ram increments, collapse queue, rules, log and restore PASS');
