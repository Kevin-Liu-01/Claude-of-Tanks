// World events and hidden enemies (2026-10-13, MP-SINCE-0930 §5b C; the repo rule: never send a hidden enemy's
// coordinates and rely on rendering). A prop's fall, a structure's stage, a hole and a crater are world state every viewer
// receives — the destroyed list and the destruction log carry them anyway, so a rejoin and a migration stay whole. How
// they were dealt does not: the rammer's heading and speed, the blow's point (a ram's is the hull's contact), the shot's
// bearing, the munition told every seat where a hidden tank was and which way it went. The blow's source rides the
// destruction events on the authority only (never the wire, never the log), and the authority withholds those fields
// from a viewer whose team does not see the source; its own team, a spotting team and a spectator read them whole.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createDestructionMatch } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createTerrainDeformation } from './terrainDeformation.ts';
import { setCompoundShape, setObbShape } from '../world/collision.ts';

const STAGE_WITHHELD = ['cause', 'munition', 'x', 'y', 'z', 'dirX', 'dirZ'];
const PROP_WITHHELD = ['cause', 'directionX', 'directionZ', 'speedMps'];

/** A house at the origin (8 m × 10 m, walls to 5.5 m): one contact record, one wall band. */
function house(id = 0) {
  const tag = (record) => { record.kind = 'structure'; record.structureIdx = id; return record; };
  const contact = tag(setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0] }, 0, 0, 4, 5, 0));
  const walls = tag(setCompoundShape({ min: [0, 0, 0], max: [0, 5.5, 0] }, [{ kind: 'obb', cx: 0, cz: 0, hw: 4, hl: 5, yaw: 0 }]));
  return { obstacles: [contact], colliders: [walls] };
}

// ---- the destruction core: the source rides stage, breach and crater events; never the log; absent when unnamed
{
  const { obstacles, colliders } = house();
  const rules = { ...matchRulesetFor('standard').destruction, sections: true, craters: true, maxCraters: 8 };
  const match = createDestructionMatch({ rules, obstacles, colliders, ground: createTerrainDeformation() });
  const he = { type: 'HE', caliberMm: 125 };
  for (let i = 0; i < 6; i++) match.shellWorldHit(he, colliders[0], 0.5, 1.6, -5, 0, 1, false, 'shooter-b');
  match.shellWorldHit(he, null, 30, 0, 30, 0, 1, true, 'shooter-b');
  match.step();
  const stages = [], breaches = [], craters = [];
  match.drainEvents(stages); match.drainBreaches(breaches); match.drainCraters(craters);
  assert.ok(stages.length > 0 && breaches.length > 0 && craters.length === 1, `stages ${stages.length}, breaches ${breaches.length}, craters ${craters.length}`);
  for (const event of [...stages, ...breaches, ...craters]) assert.equal(event.sourceId, 'shooter-b', 'the blow names its source on the authority');
  assert.ok(match.log.every((entry) => !('sourceId' in entry)), 'the log (the wire\'s world state) never carries it');
  const unnamed = createDestructionMatch({ rules, ...house(), ground: createTerrainDeformation() });
  unnamed.shellWorldHit(he, null, 30, 0, 30, 0, 1, true);
  unnamed.step();
  const plain = [];
  unnamed.drainCraters(plain);
  assert.equal(plain.length, 1);
  assert.ok(!('sourceId' in plain[0]), 'an unnamed blow adds no field (the solo step and the old receipts read the same events)');
}

// ---- the authority, structures: a hidden shooter's blows reach a viewer that does not see it as world state alone
const houseWorld = () => {
  const h = house();
  return {
    mapId: 'verdant',
    getObstacles: () => h.obstacles, getColliders: () => h.colliders,
    queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; out.push(...h.obstacles); return out; },
    raycast(origin, dir, maxDist) {
      if (Math.abs(dir.z) < 1e-9) return null;
      const distance = (-5 - origin.z) / dir.z;
      if (distance < 0 || distance > maxDist) return null;
      const x = origin.x + dir.x * distance, y = origin.y + dir.y * distance;
      return Math.abs(x) <= 4 && y <= 5.5 ? { dist: distance, kind: 'structure', record: h.colliders[0], normal: new Vector3(0, 0, -1) } : null;
    },
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
};
function shellHouse(bravoZ, extra = []) {
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: houseWorld(), players: [
    { id: 'shooter', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -30, yaw: 0 } },
    { id: 'enemy', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: bravoZ, yaw: Math.PI } },
    ...extra,
  ] });
  match.onMatchReady();
  const inputs = new Map([['shooter', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: 2 }]]);
  for (let i = 0; i < 1200; i++) match.step({ dt: 1 / 60, inputs });
  return match;
}
const worldEvents = (match, viewerId) => match.eventsForViewer(viewerId).filter((event) => /^(structure_|terrain_crater|world_prop_destroyed)/.test(event.type));
{
  const match = shellHouse(600, [{ id: 'mate', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 300, z: 300, yaw: 0 } }]);
  const enemyView = match.snapshot({ tick: 1200, serverTimeMs: 20_000, viewerId: 'enemy', ackInputSeq: 1 });
  assert.ok(!enemyView.entities.some((entity) => entity.id === 'shooter'), 'the shooter is hidden from bravo (the case under test)');
  const own = worldEvents(match, 'shooter').filter((event) => event.type === 'structure_stage');
  const mate = worldEvents(match, 'mate').filter((event) => event.type === 'structure_stage');
  const hidden = worldEvents(match, 'enemy').filter((event) => event.type === 'structure_stage');
  assert.ok(own.length >= 1, `the HE shots stage the house (${own.length})`);
  assert.deepEqual(hidden.map((event) => event.stage), own.map((event) => event.stage), 'the enemy receives every stage: world state');
  for (const event of own) for (const field of STAGE_WITHHELD) assert.ok(field in event, `the shooter reads ${field}`);
  assert.deepEqual(mate, own, 'a teammate reads them whole');
  for (const event of hidden) {
    for (const field of STAGE_WITHHELD) assert.ok(!(field in event), `a viewer that does not see the shooter never reads ${field} (${JSON.stringify(event)})`);
    for (const field of ['structureId', 'stage', 'previous', 'cx', 'cz', 'hw', 'hd', 'yaw', 'baseY', 'topY', 'integrity'])
      assert.ok(field in event, `the world state stays: ${field}`);
    assert.ok(!('sourceId' in event));
  }
  assert.ok(own.every((event) => !('sourceId' in event)), 'the source never leaves the authority');
  // the persistent state every view reads is one: the log and the destroyed list
  const ownView = match.snapshot({ tick: 1200, serverTimeMs: 20_000, viewerId: 'shooter', ackInputSeq: 1 });
  assert.deepEqual(enemyView.meta.destructionLog, ownView.meta.destructionLog, 'one destruction log for every viewer');
  assert.deepEqual(enemyView.meta.destroyedObstacleIndices, ownView.meta.destroyedObstacleIndices);
  // the snapshot's own event list follows the same rule
  const snapshotHidden = enemyView.events.filter((event) => event.type === 'structure_stage');
  assert.ok(snapshotHidden.length > 0 && snapshotHidden.every((event) => !('dirX' in event) && !('cause' in event)));
  // a spectator (no hull) reads them whole
  assert.deepEqual(worldEvents(match, 'spectator:watcher').filter((event) => event.type === 'structure_stage'), own);
}
{
  // the same blows with bravo close enough to spot the shooter: whole
  const match = shellHouse(10);
  const enemyView = match.snapshot({ tick: 1200, serverTimeMs: 20_000, viewerId: 'enemy', ackInputSeq: 1 });
  assert.ok(enemyView.entities.some((entity) => entity.id === 'shooter'), 'bravo spots the shooter here');
  const seen = worldEvents(match, 'enemy').filter((event) => event.type === 'structure_stage');
  assert.ok(seen.length >= 1);
  assert.deepEqual(seen, worldEvents(match, 'shooter').filter((event) => event.type === 'structure_stage'), 'a spotting team reads them whole');
}

// ---- the authority, props: a hidden rammer's fall carries no heading, speed or cause to a viewer that does not see it
{
  const fence = { min: [-12, -100, -35.5], max: [12, 100, -34.5], shape2: { kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 0.5, yaw: 0 }, crushable: true, kind: 'fence' };
  const world = {
    mapId: 'verdant', getObstacles: () => [fence],
    queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; out.push(fence); return out; },
    raycast: () => null,
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'rammer', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 600, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const drive = new Map([['rammer', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  for (let i = 0; i < 360; i++) match.step({ dt: 1 / 60, inputs: drive });
  assert.equal(fence.crushed, true, 'the rammer felled the fence');
  const farView = match.snapshot({ tick: 360, serverTimeMs: 6000, viewerId: 'far', ackInputSeq: 1 });
  assert.ok(!farView.entities.some((entity) => entity.id === 'rammer'), 'the rammer is hidden from bravo');
  const [own] = worldEvents(match, 'rammer');
  const [hidden] = worldEvents(match, 'far');
  assert.equal(own?.type, 'world_prop_destroyed');
  assert.equal(own.cause, 'ram');
  assert.ok(own.directionZ > 0.9 && own.speedMps > 0, 'the rammer\'s own view: its heading and speed');
  assert.equal(hidden?.type, 'world_prop_destroyed', 'the fall still reaches bravo (world state)');
  for (const field of PROP_WITHHELD) assert.ok(!(field in hidden), `bravo never reads ${field}`);
  for (const field of ['obstacleIndex', 'kind', 'x', 'y', 'z']) assert.equal(hidden[field], own[field], `what fell stays: ${field}`);
  assert.deepEqual(farView.meta.destroyedObstacleIndices, [0], 'and the destroyed list is the same');
}

// ---- the authority, props felled by a hidden shooter's shell: no bearing to the shooter
{
  const tree = { min: [-1, -100, -35.5], max: [1, 100, -34.5], shape2: { kind: 'circle', cx: 0, cz: -35, r: 1 }, crushable: true, treeIdx: 17, kind: 'tree' };
  const world = {
    mapId: 'verdant', getObstacles: () => [tree],
    queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; out.push(tree); return out; },
    raycast(origin, dir, maxDist) {
      if (Math.abs(dir.z) < 1e-9) return null;
      const distance = (-35 - origin.z) / dir.z;
      return distance < 0 || distance > maxDist ? null : { dist: distance, kind: 'prop', record: tree, normal: new Vector3(0, 0, -1) };
    },
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'gunner', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 600, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const fire = new Map([['gunner', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  for (let i = 0; i < 90; i++) match.step({ dt: 1 / 60, inputs: fire });
  assert.equal(tree.crushed, true);
  const own = worldEvents(match, 'gunner').find((event) => event.type === 'world_prop_destroyed');
  const hidden = worldEvents(match, 'far').find((event) => event.type === 'world_prop_destroyed');
  assert.equal(own?.cause, 'shell');
  assert.ok(own.directionZ > 0.9, 'the shooter\'s view: the shot\'s bearing');
  assert.ok(hidden && PROP_WITHHELD.every((field) => !(field in hidden)), `bravo: the tree fell, nothing of the shot (${JSON.stringify(hidden)})`);
  assert.equal(hidden.treeIdx, 17);
}

console.log('hiddenWorldEvents.selftest: the blow\'s source rides the destruction events on the authority only; a viewer that does not see it reads stages, holes, craters and falls as world state, without the cause, heading, speed, blow point or munition; its own team, a spotting team and a spectator read them whole; one log and one destroyed list for every viewer');
