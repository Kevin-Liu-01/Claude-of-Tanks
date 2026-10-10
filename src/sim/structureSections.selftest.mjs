// Structure sections (destruction P2, docs/DESTRUCTION.md §3.4, §6): sections derived from a structure's records (the
// eaves from the bands' plan area, storeys, hit-point shares), the openings the raycasts read (a hole passes a ray to the
// far side's inner face, two aligned holes pass it through, a fallen wall panel above its stub, a fallen roof and the
// storeys that drop after it), the blows that open them (a blast's hole by its charge, a penetrator's by its calibre, a
// shaped charge's one hole), the events and the log, a replay on a fresh table and through the wire, a peer's mirror,
// and the switch: off in every mode until the gates pass, nothing opens without it.
import assert from 'node:assert/strict';
import {
  nearestColliderHit, setCompoundShape, setObbShape, structureOpeningAt, STRUCTURE_WALL_STUB_M,
} from '../world/collision.ts';
import { BREACH_EVENTS_PER_TICK, createStructureDamage } from './structureDamage.ts';
import {
  blastHoleRadiusM, cascadeFalls, createStructureSections, eavesHeight, MAX_STOREYS, NO_HOLE, sectionAt, sectionCentre,
} from './structureSections.ts';
import { createDestructionMatch, resetStructureRecords } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { GAME_MODE_IDS } from './matchModes.ts';
import { penetratorHoleRadiusM, structureBlastPoints } from './munitionBlast.ts';
import { readDestructionEntries, writeDestructionEntries, quantizeDestructionEntry } from '../mp/wire/destructionLog.ts';
import { ByteReader, ByteWriter } from '../mp/wire/bytes.ts';
import { createDestructionMirror } from '../mp/presentation/destructionMirror.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps,
  `${label}: ${actual} is not within ${eps} of ${expected}`);

/**
 * A two-storey house at the origin, 8 m across (x) and 10 m along (z), walls to 5.5 m as one filled band (as the shards
 * carry a plain wall), a pitched roof of four half-metre strips narrowing along z (the staircase a sloped roof bands
 * into) to 7.5 m. `role` 'setpiece' makes it a landmark (it never collapses).
 */
function house(id = 0, role) {
  const tag = (record) => { record.kind = 'structure'; record.structureIdx = id; if (role) record.structureRole = role; return record; };
  const contact = tag(setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0] }, 0, 0, 4, 5, 0));
  const walls = tag(setCompoundShape({ min: [0, 0, 0], max: [0, 5.5, 0] }, [{ kind: 'obb', cx: 0, cz: 0, hw: 4, hl: 5, yaw: 0 }]));
  const roof = [3.5, 2.5, 1.5, 0.5].map((hl, i) => tag(setCompoundShape({ min: [0, 5.5 + i * 0.5, 0], max: [0, 6 + i * 0.5, 0] },
    [{ kind: 'obb', cx: 0, cz: 0, hw: 4, hl, yaw: 0 }])));
  return { obstacles: [contact], colliders: [walls, ...roof] };
}
const blow = (x, y, z, munition = 'he', cause = 'blast', holeRadiusM = 0) => ({ cause, munition, x, y, z, dirX: -1, dirZ: 0, holeRadiusM });
const hit = { distance: Infinity, record: null };
const normal = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
/** The world raycasts' narrow phase over these records (world/map.ts and headlessCollisionWorld.ts both run it). */
function ray(records, ox, oy, oz, dx, dy, dz, max = 100) {
  const length = Math.hypot(dx, dy, dz);
  nearestColliderHit(records, { x: ox, y: oy, z: oz }, { x: dx / length, y: dy / length, z: dz / length }, max, normal, hit);
  return hit.distance;
}
const drain = (table) => { table.step(); const out = []; table.drainBreaches(out); return out; };
const state = (s) => JSON.stringify({ holes: [...s.holes], down: [...s.down], count: [...s.holeCount], cap: s.capY });

// ---- derivation: the eaves where the bands' plan area falls under ¾ of the walls', two storeys, the shares
{
  const { obstacles, colliders } = house();
  const table = createStructureDamage(obstacles, colliders, { sections: true });
  const s0 = table.structures[0];
  assert.equal(s0.sections, null, 'sections are derived when first needed');
  const sections = table.sectionsOf(s0);
  assert.equal(eavesHeight(s0), 5.5, 'the eaves: the roof strips (56 m² and less) are under ¾ of the walls\' 80 m²');
  assert.equal(sections.eavesY, 5.5);
  assert.equal(sections.storeys, 2, 'two storeys of 2.75 m');
  near(sections.storeyH, 2.75, 1e-9, 'storey height');
  assert.equal(sections.count, 9);
  assert.ok(MAX_STOREYS >= 6);
  // shares: 2 × the section's share of the 278 m² envelope, within 5–30 %
  const envelope = 2 * (8 + 10) * 5.5 + 80;
  near(sections.maxHp[0] / s0.maxHp, 2 * 8 * 2.75 / envelope, 1e-9, 'an end wall panel');
  near(sections.maxHp[2] / s0.maxHp, 2 * 10 * 2.75 / envelope, 1e-9, 'a side wall panel');
  near(sections.maxHp[8] / s0.maxHp, 0.3, 1e-9, 'the roof (capped at 30 %)');
  // a storey can drop before the building comes down: the roof and three of the top storey's faces under the whole
  assert.ok(sections.maxHp[8] + sections.maxHp[4] + sections.maxHp[5] + sections.maxHp[6] < s0.maxHp, 'a storey drop is reachable');
  // sections at points: the roof above the eaves, faces by the nearest plane, storeys by height, the room's floor none
  assert.equal(sectionAt(sections, 4, 2, 0), 2, '+across face, ground storey');
  assert.equal(sectionAt(sections, -4, 4, 1), 7, '−across face, upper storey');
  assert.equal(sectionAt(sections, 0, 2, 5), 0, '+forward end');
  assert.equal(sectionAt(sections, 1, 1, -5), 1, '−forward end');
  assert.equal(sectionAt(sections, 0, 6.2, 0), 8, 'the roof');
  assert.equal(sectionAt(sections, 0, 0.1, 0), -1, 'the floor of the room');
  const centre = sectionCentre(sections, 2, { x: 0, y: 0, z: 0 });
  assert.deepEqual([centre.x, centre.z], [4, 0], 'a face\'s centre on its plane');
  near(centre.y, (STRUCTURE_WALL_STUB_M + 2.75) / 2, 1e-9, 'the ground storey\'s centre above its stub');
}

// ---- a hole passes a ray to the far side's inner face; two aligned pass it through
{
  const { obstacles, colliders } = house();
  const table = createStructureDamage(obstacles, colliders, { sections: true });
  const s0 = table.structures[0];
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0), 16, 'intact: the near wall stops the ray');
  table.applyBlast(3.52, 'he', blow(4, 2, 0), s0);
  const [opened] = drain(table);
  assert.ok(opened && !opened.sectionDown && opened.section === 2 && opened.hole === 0, 'one hole in the +across ground panel');
  near(opened.radiusM, Math.round(blastHoleRadiusM(3.52, 'he') * 100) / 100, 1e-12, 'a 125 mm HE round\'s hole');
  near(opened.radiusM, 0.68, 1e-12, '0.45 · W^⅓ = 0.68 m');
  assert.deepEqual([opened.nx, opened.ny, opened.nz], [1, 0, 0], 'it faces out of the +across side');
  assert.deepEqual([opened.y0, opened.y1, opened.sectionKind], [0, 2.75, 'wall']);
  assert.ok(colliders.every((record) => record.openings === s0.sections), 'every shell band now points at the openings');
  assert.equal(obstacles[0].openings, undefined, 'the contact record (movement) is untouched');
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0), 24, 'through the hole: the far wall\'s inner face');
  assert.deepEqual([normal.x, normal.y, normal.z], [1, 0, 0], 'which faces the room');
  assert.equal(ray(colliders, 20, 2, 0.6, -1, 0, 0), 24, 'anywhere within the hole');
  assert.equal(ray(colliders, 20, 2, 0.8, -1, 0, 0), 16, 'beside it, the wall');
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0, 20), Infinity, 'a ray that ends inside the room meets nothing');
  // from inside (a round that came in through the hole last tick): the far face
  assert.equal(ray(colliders, 2, 2, 0, -1, 0, 0), 6, 'from inside: the far face');
  // a round through the hole down to the floor stops on it
  const descending = ray(colliders, 6, 2.4, 0, -2, -0.8, 0);
  near(descending, Math.hypot(2, 0.8) * 3, 1e-9, 'through the hole and down to the floor at y = 0');
  assert.deepEqual([normal.x, normal.y, normal.z], [0, 1, 0], 'the floor faces up');
  near(ray(colliders, 6, 2.4, 0, -2, -0.4, 0), Math.hypot(2, 0.4) * 5, 1e-9, 'a shallower one meets the far wall low down');
  // a second hole on the far side, on the line: the ray passes the house
  table.applyPoints(s0, 0.1, blow(-4, 2, 0, 'kinetic', 'kinetic', penetratorHoleRadiusM({ type: 'APFSDS', caliberMm: 125 })));
  const [far] = drain(table);
  assert.equal(far.section, 3, 'the −across ground panel');
  near(far.radiusM, 0.44, 1e-12, 'a 125 mm penetrator\'s hole (0.0035 · 125 mm)');
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0), Infinity, 'both holes on the line: the ray passes');
  assert.equal(ray(colliders, 20, 2, 0.6, -1, 0, 0), 24, 'past the far hole\'s rim: the far wall');
  // the holes are discs on their faces: an oblique ray through the near hole that misses the far one stops there
  assert.equal(ray(colliders, 20, 2, 4, -1, 0, -0.25) > 16, true, 'an oblique ray through the near hole crosses the room');
  // the same point again opens nothing new (it lies in the hole)
  table.applyBlast(3.52, 'he', blow(4, 2, 0.1), s0);
  assert.equal(drain(table).filter((e) => !e.sectionDown).length, 0, 'a burst in an open hole opens no new hole');
  // the next battle stands it up again
  resetStructureRecords(obstacles, colliders);
  assert.ok(colliders.every((record) => !record.openings), 'reset clears the openings');
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0), 16, 'and the wall stops the ray again');
}

// ---- a wall panel falls to its stub; the roof falls; with it down, a storey with three faces down drops whole
{
  const { obstacles, colliders } = house(0, 'setpiece'); // a landmark: the whole never collapses, its sections do
  const table = createStructureDamage(obstacles, colliders, { sections: true });
  const s0 = table.structures[0];
  const sections = table.sectionsOf(s0);
  const panel = sections.maxHp[2];
  table.applyPoints(s0, panel + 0.01, blow(4, 1.5, 3, 'he'));
  const [down] = drain(table);
  assert.ok(down.sectionDown && down.section === 2 && down.hole === NO_HOLE && down.radiusM === 0, 'the panel falls');
  assert.deepEqual([down.x, down.z], [4, 0], 'the fall stands at the panel\'s centre on its face');
  assert.equal(ray(colliders, 20, 0.5, 2, -1, 0, 0), 16, 'its stub (the lowest metre) still stops a ray');
  assert.equal(ray(colliders, 20, 2, 2, -1, 0, 0), 24, 'above it the panel is open');
  assert.equal(ray(colliders, 20, 3.5, 2, -1, 0, 0), 16, 'the storey above stands');
  // the roof: one blow at it takes it down
  table.applyPoints(s0, sections.maxHp[8] + 0.01, blow(0, 6.2, 0));
  const roofFall = drain(table);
  assert.deepEqual(roofFall.map((e) => [e.section, e.sectionKind, e.sectionDown]), [[8, 'roof', true]]);
  assert.equal(sections.capY, 5.5, 'nothing stands above the eaves');
  assert.equal(ray(colliders, 20, 6.2, 0, -1, 0, 0), Infinity, 'a ray where the roof was passes over the walls');
  assert.equal(ray(colliders, 0, 20, 0, 0, -1, 0), 20, 'a round from above falls into the room, onto its floor');
  // the upper storey: three faces down bring the fourth (the roof is down)
  for (const [x, z] of [[4, 0], [-4, 0], [0, 5]]) table.applyPoints(s0, 1e3, blow(x, 4, z));
  const storeyFall = drain(table);
  assert.deepEqual(storeyFall.map((e) => e.section), [6, 7, 4, 5], 'three faces fall, then the fourth with them');
  assert.deepEqual(storeyFall.map((e) => e.storeyDown === true), [false, false, false, true], 'the fourth completes the storey');
  assert.ok(roofFall.every((e) => !e.storeyDown) && !down.storeyDown, 'a panel or the roof alone completes none');
  assert.equal(sections.capY, 2.75, 'the upper storey dropped');
  assert.equal(ray(colliders, 20, 3.5, 2, -1, 0, 0), Infinity, 'where it stood, rays pass');
  assert.equal(ray(colliders, 20, 2, 2, -1, 0, 0), 24, 'the ground storey\'s open panel still shows the far wall');
  // a fall the cascade brings, applied alone (as the log carries each), changes nothing more
  assert.deepEqual(cascadeFalls(sections, []), [], 'settled');
  // the opening laws at points
  assert.equal(structureOpeningAt(sections, 4, 0.5, 2), false, 'a stub');
  assert.equal(structureOpeningAt(sections, -4, 2, 2, 3), false, 'a standing panel');
}

// ---- the budget, the log and its replay (a fresh table, the wire, a peer's mirror) open exactly the same (a landmark:
// it never collapses, so every blow below reaches its sections)
{
  const { obstacles, colliders } = house(0, 'setpiece');
  const rules = { ...matchRulesetFor('standard').destruction, sections: true };
  const match = createDestructionMatch({ rules, obstacles, colliders });
  const s0 = match.structures.structures[0];
  const he = { type: 'HE', caliberMm: 125 };
  const ap = { type: 'APFSDS', caliberMm: 125, pen100Mm: 600 };
  const heat = { type: 'HEAT', caliberMm: 125, pen100Mm: 500 };
  const record = colliders[0];
  // a volley in one tick: more holes than the tick's budget
  const points = [[4, 1, -3], [4, 2.2, 3], [-4, 1.2, 2], [-4, 2.4, -2], [1, 1.5, 5], [-1, 2.2, -5], [4, 4, -3], [-4, 4.2, 3]];
  for (const [x, y, z] of points) match.shellWorldHit(ap, record, x, y, z, -1, 0);
  match.step();
  const first = [];
  match.drainBreaches(first);
  assert.equal(first.length, BREACH_EVENTS_PER_TICK, `a tick releases at most ${BREACH_EVENTS_PER_TICK} breaches`);
  match.step();
  const second = [];
  match.drainBreaches(second);
  assert.equal(first.length + second.length, points.length, 'the rest in the next tick');
  assert.ok([...first, ...second].every((e) => !e.sectionDown && e.radiusM === 0.44), 'penetrator holes (0.0035 · 125 mm)');
  // a shaped charge opens one hole, the larger of its jet's and its blast's
  match.shellWorldHit(heat, record, 1, 2, -5, 0, 1);
  match.step();
  const heatHoles = [];
  match.drainBreaches(heatHoles);
  const heatHole = heatHoles.filter((e) => !e.sectionDown);
  assert.equal(heatHole.length, 1, 'one hole for a HEAT round');
  assert.ok(heatHole[0].radiusM > penetratorHoleRadiusM(heat), `its blast's (${heatHole[0].radiusM} m)`);
  // HE until the struck panel falls
  for (let i = 0; i < 4; i++) match.shellWorldHit(he, record, 0.5, 1.6, 5, 0, -1);
  match.step(); match.step();
  const log = match.log;
  const breaches = log.filter((entry) => entry.kind === 'breach');
  assert.ok(breaches.some((entry) => entry.sectionDown), 'a panel fell to the HE');
  assert.ok(breaches.every((entry) => entry.cx === s0.cx && entry.cz === s0.cz), 'every breach carries its footprint centre');
  const authority = state(s0.sections);

  // a migrated host: a fresh match restored from the log opens the same, with no event
  const fresh = house(0, 'setpiece');
  const restored = createDestructionMatch({ rules, obstacles: fresh.obstacles, colliders: fresh.colliders });
  assert.equal(restored.restore(log), log.length, 'every entry applies');
  restored.step();
  assert.equal(restored.drainBreaches([]), 0, 'restored without events');
  assert.equal(state(restored.structures.structures[0].sections), authority, 'the restored host opens the same');

  // the wire: the log round-trips exactly (centres to the millimetre, radii to the centimetre, the identity bit)
  const writer = new ByteWriter();
  writeDestructionEntries(writer, log);
  const reader = new ByteReader(writer.toBytes());
  const decoded = readDestructionEntries(reader);
  reader.finish();
  assert.deepEqual(decoded, log.map(quantizeDestructionEntry), 'the wire carries the log exactly');
  assert.deepEqual(decoded.filter((e) => e.kind === 'breach'), breaches, 'the authority\'s breaches are already quantized');

  // a peer's mirror: the live events (each once, even when the log names them again), then a late joiner's log
  const events = [...first, ...second, ...heatHoles];
  const live = house(0, 'setpiece');
  const seen = [];
  const mirror = createDestructionMirror({ getObstacles: () => live.obstacles, getColliders: () => live.colliders },
    { emit: (type, payload) => { if (type === 'structure:breach') seen.push(payload); } });
  for (const event of events) mirror.applyBreachEvent({ ...event });
  for (const event of events) mirror.applyBreachEvent({ ...event });
  assert.equal(seen.length, events.length, 'each live breach opens and emits once');
  mirror.applyLog(decoded, () => false);
  assert.equal(seen.length, breaches.length, 'the log adds only what the events did not carry');
  assert.equal(state(mirror.structures.structures[0].sections), authority, 'the peer opens the same');
  assert.ok(seen.slice(events.length).every((event) => event.settled), 'the log\'s are laid down settled');
  // a match with sections says so on its stages (the presentation then cuts no hole of a breached stage's own)
  const stages = [];
  match.drainEvents(stages);
  const stageLog = log.filter((entry) => entry.kind === 'stage');
  assert.ok(stageLog.length > 0, 'the house crossed stages');
  const authorityStages = [];
  const again = house(0, 'setpiece');
  const replay = createDestructionMatch({ rules, obstacles: again.obstacles, colliders: again.colliders });
  replay.shellWorldHit(he, again.colliders[0], 0.5, 1.6, 5, 0, -1);
  for (let i = 0; i < 6; i++) replay.shellWorldHit(he, again.colliders[0], 3, 1.6 + i * 0.6, -4, 0, 1);
  replay.step();
  replay.drainEvents(authorityStages);
  assert.ok(authorityStages.length > 0 && authorityStages.every((event) => event.sections === true), 'stage events carry sections');
  const stageSeen = [];
  const flagged = createDestructionMirror({ getObstacles: () => house(0, 'setpiece').obstacles, getColliders: () => [] },
    { emit: (type, payload) => { if (type === 'structure:stage') stageSeen.push(payload); } });
  flagged.setSections(true);
  flagged.applyLog(stageLog, () => false);
  assert.ok(stageSeen.length > 0 && stageSeen.every((event) => event.sections === true), 'a mirror told the ruleset plays sections says so too');
  const late = house(0, 'setpiece');
  const lateSeen = [];
  const lateMirror = createDestructionMirror({ getObstacles: () => late.obstacles, getColliders: () => late.colliders },
    { emit: (type, payload) => { if (type === 'structure:breach') lateSeen.push(payload); } });
  lateMirror.applyLog(decoded, () => false);
  assert.equal(state(lateMirror.structures.structures[0].sections), authority, 'a late joiner opens the same');
  assert.equal(lateSeen.length, breaches.length);
  assert.ok(late.colliders.every((record) => record.openings), 'and its shell bands read them');
}

// ---- the switch: off in every mode until the gates pass; without it nothing opens
for (const mode of GAME_MODE_IDS) assert.equal(matchRulesetFor(mode).destruction.sections, false, `${mode}: sections off`);
{
  const { obstacles, colliders } = house();
  const match = createDestructionMatch({ rules: matchRulesetFor('standard').destruction, obstacles, colliders });
  match.shellWorldHit({ type: 'HE', caliberMm: 125 }, colliders[0], 4, 2, 0, -1, 0);
  match.step();
  assert.equal(match.drainBreaches([]), 0, 'no breach events');
  assert.ok(colliders.every((record) => !record.openings), 'no openings');
  assert.equal(match.structures.structures[0].sections, null, 'no sections derived');
  assert.ok(match.structures.structures[0].hp < match.structures.structures[0].maxHp, 'the whole still takes the round (P1)');
  assert.equal(ray(colliders, 20, 2, 0, -1, 0, 0), 16, 'and the wall still stops the ray');
}
// P1's tuning stands with sections on: the whole takes every blow at full weight
{
  const a = house(), b = house();
  const on = createStructureDamage(a.obstacles, a.colliders, { sections: true });
  const off = createStructureDamage(b.obstacles, b.colliders);
  for (const table of [on, off]) for (let i = 0; i < 3; i++) table.applyBlast(3.52, 'he', blow(4, 2 + i * 0.01, -2 + i * 2), table.structures[0]);
  assert.equal(on.structures[0].hp, off.structures[0].hp, 'the whole\'s hit points are P1\'s');
  near(off.structures[0].maxHp - off.structures[0].hp, 3 * structureBlastPoints(3.52, 'he', 0), 1e-9, 'three contact rounds');
}

console.log('structureSections: eaves from the bands\' plan area, 2 storeys, area shares; a hole passes a ray to the far '
  + 'inner face (two aligned pass it through), a panel falls to its stub, the roof falls, a storey drops after three '
  + `faces; ${BREACH_EVENTS_PER_TICK} breaches a tick; restored host, wire, live and late mirrors open the same; off in every mode PASS`);
