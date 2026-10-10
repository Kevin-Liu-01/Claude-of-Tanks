// A Studio strike round breaks the light cover in its path and flies on (destruction core lane, 2026-10-08; the facades
// lane's Quonset hut strip). A battle round meeting light cover — a hut, a fence, a tree, crates — breaks it and flies on
// (state.ts crushWorldPropFromShell, world/collision.ts shellPassesThroughCollisionRecord); a Studio strike round stopped
// dead on it and burst there, and nothing broke. The actual strikePassesRecord and traceStrikeRound of studio.ts, run
// here over a headless world: a round through a fence breaks it (the world's own crush) and meets the house wall behind,
// which takes the strike; dense cover (a stone wall) stops a round and stands; a step that meets nothing leaves the round
// flying. The Studio restates the pass-through law (it takes no new static import), held here to collision.ts's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { Vector3 } from 'three';
import { setObbShape, setCompoundShape, shellPassesThroughCollisionRecord } from '../world/collision.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';

const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', studioSource, ts.ScriptTarget.Latest, true);
const names = new Set(['strikePassesRecord', 'traceStrikeRound']);
const functions = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
})(source);
assert.equal(functions.length, 2, 'the Studio\'s strikePassesRecord and traceStrikeRound');
const passMax = /const STRIKE_PASS_THROUGH_MAX = (\d+);/.exec(studioSource);
assert.ok(passMax, 'the Studio\'s pass-through cap');

/** The two functions over stub ports: strikeWorld recorded, the scratch vectors the Studio's. */
function studioTrace() {
  const struck = [];
  const code = stripTypeScriptTypes(`
    function make(ports) {
      const { strikeWorld } = ports;
      const _strikeDir = new ports.Vector3(), _strikeFrom = new ports.Vector3();
      const STRIKE_PASS_THROUGH_MAX = ${passMax[1]};
      ${functions.join('\n')}
      return { strikePassesRecord, traceStrikeRound };
    }
  `);
  const api = new Function('ports', `${code}\nreturn make(ports);`)({ Vector3,
    strikeWorld: (sh, hit) => struck.push({ record: hit.record, z: hit.point.z, x: hit.point.x }) });
  return { api, struck };
}

// ---- one law with the battle's: every kind the collision module names, crushable or not, with and without a kind
{
  const { api } = studioTrace();
  const collisionSource = readFileSync(new URL('../world/collision.ts', import.meta.url), 'utf8');
  const kinds = new Set(['structure', 'tree', 'fencepicket', 'fencerail', 'quonsethut', 'barrel', 'crate', undefined]);
  for (const m of collisionSource.matchAll(/kind === '([a-z0-9_]+)'/g)) kinds.add(m[1]);
  for (const kind of kinds) {
    for (const crushable of [true, false, undefined]) {
      const record = { kind, crushable };
      assert.equal(api.strikePassesRecord(record), shellPassesThroughCollisionRecord(record),
        `the Studio's pass-through law agrees with collision.ts for ${kind} (crushable ${crushable})`);
    }
  }
  assert.equal(api.strikePassesRecord(null), shellPassesThroughCollisionRecord(null), 'and for no record');
}

// a flat field; a house (structure 0) whose south wall stands at z = -38; a picket fence (prop 7, light cover) across the
// line at z = -45; a stone field wall (prop 8, dense cover) across a second line at x = 30, z = -45
const field = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new Vector3(0, 1, 0), maxY: 0 };
const house = setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: 0 },
  [{ kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 3, yaw: 0 }]);
const houseContact = setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: 0 }, 0, -35, 12, 3, 0);
const fence = (propIdx, kind, x) => setObbShape({ min: [0, 0, 0], max: [0, 1.2, 0], kind, crushable: true, propIdx }, x, -45, 4, 0.1, 0);
const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: field, manifest: {
  obstacles: [houseContact, fence(7, 'fencepicket', 0), fence(8, 'wallstone', 30)].map(packCollisionRecord),
  colliders: [house, fence(7, 'fencepicket', 0), fence(8, 'wallstone', 30)].map(packCollisionRecord),
  concealers: [] } });
const crushes = [];
const tracedWorld = { raycast: (o, d, max) => world.raycast(o, d, max),
  crushObstacle: (record, dx, dz, speed, cause) => { crushes.push({ propIdx: record.propIdx, kind: record.kind, dx, dz, speed, cause }); return world.crushObstacle(record); } };
const shell = (z, x = 0) => ({ dead: false, pos: new Vector3(x, 1, z), spec: { velocityMps: 600 } });

// ---- through the fence to the house: the fence breaks (the world's crush, along the round's heading), the wall stops it
{
  const { api, struck } = studioTrace();
  const sh = shell(-30);
  const stopped = api.traceStrikeRound(sh, tracedWorld, new Vector3(0, 1, -60), new Vector3(0, 1, -30));
  assert.equal(stopped, true, 'the round stops this step');
  assert.deepEqual(crushes.map((c) => [c.propIdx, c.kind, c.cause]), [[7, 'fencepicket', 'shell']], 'the fence broke as a battle round breaks it');
  assert.ok(Math.abs(crushes[0].dz - 1) < 1e-9 && crushes[0].speed === 600, 'along its heading, at its speed');
  assert.equal(struck.length, 1, 'one strike');
  assert.equal(struck[0].record?.structureIdx, 0, 'on the house');
  assert.ok(Math.abs(struck[0].z + 38) < 1e-6 && sh.dead && Math.abs(sh.pos.z + 38) < 1e-6, `at its south wall (z ${struck[0].z})`);
  const after = world.raycast(new Vector3(0, 1, -60), new Vector3(0, 0, 1), 40);
  assert.equal(after?.record?.structureIdx, 0, 'the broken fence no longer stands in the line');
}

// ---- dense cover stops the round and stands
{
  const { api, struck } = studioTrace();
  crushes.length = 0;
  const sh = shell(-30, 30);
  assert.equal(api.traceStrikeRound(sh, tracedWorld, new Vector3(30, 1, -60), new Vector3(30, 1, -30)), true, 'stopped');
  assert.equal(crushes.length, 0, 'nothing broke');
  assert.equal(struck[0].record?.kind, 'wallstone', 'the stone wall takes the strike');
  assert.ok(Math.abs(struck[0].z + 45.1) < 1e-6, `on its face (z ${struck[0].z})`);
}

// ---- a step that meets nothing (or only the ground) leaves the round flying
{
  const { api, struck } = studioTrace();
  const sh = shell(-70);
  assert.equal(api.traceStrikeRound(sh, tracedWorld, new Vector3(0, 1, -90), new Vector3(0, 1, -70)), false, 'nothing in the way');
  assert.equal(struck.length, 0, 'no strike');
  assert.equal(sh.dead, false, 'the round flies on');
}

console.log('studioStrikeCover: a Studio strike round breaks the light cover in its path (the world\'s own crush, along its '
  + 'heading) and flies on to the house wall, which takes the strike; dense cover stops it and stands; a clear step leaves '
  + 'it flying; the Studio\'s pass-through law is collision.ts\'s PASS');
