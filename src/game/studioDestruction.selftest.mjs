// The Studio's destruction (destruction P2, docs/DESTRUCTION.md §3.4, §11): the core's own rules over the Studio world's
// records, sections on whatever the battle switch says — a wall strike opens the sim's hole and raises structure:breach
// under the solo step's name, a round traced through the world afterwards passes the hole and meets the far wall's inner
// face (where its own strike opens another), stages ride along, and a reset stands the house up again.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createStudioDestruction } from './studioDestruction.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { setCompoundShape, setObbShape } from '../world/collision.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';

// a flat field and a 24 × 6 m house on it (its south wall at z = −38, its north wall at z = −32)
const field = {
  getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new Vector3(0, 1, 0), maxY: 0,
};
const contact = setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: 0 }, 0, -35, 12, 3, 0);
const band = setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: 0 },
  [{ kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 3, yaw: 0 }]);
const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: field,
  manifest: { obstacles: [packCollisionRecord(contact)], colliders: [packCollisionRecord(band)], concealers: [] } });
const raised = [];
const bus = { emit: (event, payload) => raised.push({ event, payload }) };
assert.equal(matchRulesetFor('standard').destruction.sections, false, 'the battle switch is off');
const studio = createStudioDestruction(world, bus, { rules: matchRulesetFor('standard').destruction });

const origin = new Vector3(0, 2, -68), north = new Vector3(0, 0, 1);
const he = { type: 'HE', caliberMm: 120 }, ap = { type: 'APFSDS', caliberMm: 120, pen100Mm: 700 };
let hit = world.raycast(origin, north, 200);
assert.ok(hit && hit.record?.structureIdx === 0 && Math.abs(hit.point.z + 38) < 1e-6, 'the first round meets the south wall');
studio.strike(he, hit.record, hit.point.x, hit.point.y, hit.point.z, 0, 1);
studio.step();
const hole = raised.find((entry) => entry.event === 'structure:breach')?.payload;
assert.ok(hole && !hole.sectionDown && hole.radiusM > 0.5 && Math.abs(hole.z + 38) < 1e-6,
  `the sim's hole, raised as the solo step raises it (${JSON.stringify(hole)})`);
assert.ok(raised.some((entry) => entry.event === 'structure:stage' && entry.payload.stage === 'damaged') || studio.match.structures.structures[0].stage === 0,
  'a stage it crossed rides along');

hit = world.raycast(origin, north, 200);
assert.ok(hit && Math.abs(hit.point.z + 32) < 1e-6, `the next round passes the hole to the north wall's inner face (z ${hit?.point.z})`);
assert.ok(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z + 1) < 1e-9, 'which faces the room');
studio.strike(ap, hit.record, hit.point.x, hit.point.y, hit.point.z, 0, 1);
studio.step();
const far = raised.filter((entry) => entry.event === 'structure:breach').map((entry) => entry.payload);
assert.equal(far.length, 2, 'its strike opens the far wall too');
assert.ok(Math.abs(far[1].z + 32) < 1e-6 && Math.abs(far[1].radiusM - 0.42) < 1e-9, 'a penetrator\'s hole on the north wall');
assert.equal(world.raycast(origin, north, 200)?.record ?? null, null, 'both holes on the line: the next round flies on through');

studio.reset();
hit = world.raycast(origin, north, 200);
assert.ok(hit && Math.abs(hit.point.z + 38) < 1e-6, 'a reset stands the house up again');
assert.equal(studio.match.log.length, 0, 'with a fresh log');

console.log('studioDestruction: a Studio wall strike opens the sim\'s hole (structure:breach as the solo step raises it), the '
  + 'next round traced through the world passes it to the far inner face and opens that, the one after flies through; '
  + 'reset stands it up PASS');
