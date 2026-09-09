import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createHeightField } from '../world/terrain.ts';
import { MAP_IDS, getMapConfig } from '../world/maps/index.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { tankContactRect } from './tankContactShape.ts';
import { createMatchPlacement, matchPlacementAnchors, placementTankRadius } from './matchPlacement.ts';
import { collisionFootprintContainsPoint } from '../world/collision.ts';

// f9c88b5d7 added safe placement AFTER this unchanged nominal policy. Explicit
// test/tool spawns intentionally bypass that resolver, so raw nominal explicit
// spawns are no longer an oracle for the final implicit deployment.
function spawnSource(text) {
  const start = 'function spawnFor(', end = '\nfunction botOpeningGoal(';
  assert.equal(text.split(start).length, 2, 'one actual nominal spawn policy');
  assert.equal(text.split(end).length, 2, 'one following helper boundary');
  assert.ok(text.indexOf(end) > text.indexOf(start));
  return text.slice(text.indexOf(start), text.indexOf(end));
}
const historicalSource = spawnSource(execFileSync('git', ['show',
  '76039d225d4c9718ea99845498536a869210215c:src/sim/authoritativeMatch.ts'], { encoding: 'utf8' }));
assert.equal(createHash('sha256').update(historicalSource).digest('hex'),
  'b3a4341449a74a3bcd9e754846f1d160a8ad9d96a9af3582a60f4ab93c865218',
  'independently published pre-f9 nominal policy, never a refreshed output golden');
const currentSource = spawnSource(readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8'));
const compileSpawn = source => new Function('TEAM_ALPHA', 'finite',
  `${stripTypeScriptTypes(source)}; return spawnFor;`)('alpha', (value, fallback) => Number.isFinite(value) ? value : fallback);
const historicalSpawn = compileSpawn(historicalSource), currentSpawn = compileSpawn(currentSource);

const roster = ['t84', 'jpz_e100', 'm1a2', 'k2', 't95', 'jpz_e100', 'leclerc'];
const players = ['alpha', 'bravo'].flatMap(team => roster.map((specId, index) => ({ id: `${team}-${index}`, team, specId })));
function make(field, records = players, obstacles = []) {
  return createAuthoritativeMatch({ players: records, mapId: 'reservoir', countdownS: 0,
    worldCollision: { heightField: field, getObstacles: () => obstacles } });
}
function rows(match) {
  return match.entities.map(entity => ({ id: entity.id, pos: entity.state.pos.toArray(), yaw: entity.state.yaw }));
}
function preferred(field, policy = historicalSpawn, records = players) {
  const slots = { alpha: 0, bravo: 0 };
  return records.map(record => ({ ...record, spawn: policy(slots[record.team]++, record.team, field._layout, record.spawn) }));
}
function resolved(field, nominal, obstacles = []) {
  const placement = createMatchPlacement({ mapId: 'reservoir', heightField: field, obstacles,
    anchors: matchPlacementAnchors(field._layout.spawns), mode: 'standard' });
  return nominal.map(record => ({ ...record,
    spawn: placement.spawn(record.spawn, record.id, placementTankRadius(getSpec(record.specId))) }));
}
function assertTerrainFootprint(field, spawn, radius) {
  const limit = Math.min(480, (field.size ?? 1024) * .5 - 24) - radius, heights = [];
  assert.ok(Math.abs(spawn.x) <= limit && Math.abs(spawn.z) <= limit, 'full footprint inside the map');
  const sample = (dx, dz) => {
    const x = spawn.x + dx, z = spawn.z + dz, y = field.getHeightAt(x, z);
    assert.ok(Number.isFinite(y), 'finite support height');
    assert.ok(field.getNormalAt(x, z).y >= .90, 'safe full-footprint slope');
    assert.ok((field.getWaterMaskAt?.(x, z) ?? 0) <= .05, 'dry full footprint');
    assert.notEqual(field.getGroundType?.(x, z), 'soft', 'no liquid/soft ground');
    heights.push(y);
  };
  sample(0, 0);
  for (let dz = -radius; dz <= radius; dz += 2) for (let dx = -radius; dx <= radius; dx += 2) {
    if (dx * dx + dz * dz <= radius * radius) sample(dx, dz);
  }
  const count = Math.max(16, Math.ceil(2 * Math.PI * radius / 2));
  for (let i = 0; i < count; i++) sample(Math.sin(i / count * Math.PI * 2) * radius, Math.cos(i / count * Math.PI * 2) * radius);
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, 'bounded footprint relief');
}
function assertSafe(field, records, obstacles = []) {
  for (let i = 0; i < records.length; i++) {
    const { spawn, specId } = records[i], radius = placementTankRadius(getSpec(specId));
    assertTerrainFootprint(field, spawn, radius);
    for (const obstacle of obstacles) assert.equal(collisionFootprintContainsPoint(obstacle, spawn.x, spawn.z, radius), false, 'no obstacle overlap');
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(spawn.x - records[j].spawn.x, spawn.z - records[j].spawn.z)
      >= radius + placementTankRadius(getSpec(records[j].specId)) + 3, 'full vehicle-radius reservation clearance');
  }
}
function assertComposed(field, nominal, label, obstacles = []) {
  const expected = resolved(field, nominal, obstacles);
  assertSafe(field, expected, obstacles);
  assert.deepEqual(rows(make(field, players, obstacles)), rows(make(field, expected, obstacles)),
    `${label}: original nominal policy, safe placement and canonical thirty-step settlement`);
  return expected;
}

// Keep the original independent old-map formula, not current output. Check
// nominal policy separately, then apply the maintained safety resolver to both
// its historical result and the live match before comparing exact settlement.
let defaultMaps = 0, relocatedMaps = 0;
for (const mapId of MAP_IDS) {
  const field = createHeightField(1337, getMapConfig(mapId)), pads = field._layout.spawns;
  const nominal = players.map((record, index) => {
    const slot = index % 7, pad = record.team === 'alpha' ? pads.player : pads.enemies[slot];
    return { ...record, spawn: record.team === 'alpha'
      ? { x: pad.x + (slot % 4 - 1.5) * 8, z: pad.z - Math.floor(slot / 4) * 10, yaw: pad.yaw }
      : pad };
  });
  if (!pads.player.formation) {
    assert.deepEqual(preferred(field, currentSpawn), nominal, `${mapId}: original default nominal formula unchanged`);
    defaultMaps++;
  }
  const original = preferred(field);
  assert.deepEqual(preferred(field, currentSpawn), original, `${mapId}: exact published nominal policy`);
  const placed = assertComposed(field, original, mapId);
  if (placed.some((record, i) => record.spawn.x !== original[i].spawn.x || record.spawn.z !== original[i].spawn.z)) relocatedMaps++;
}
assert.ok(defaultMaps > 0 && relocatedMaps > 0, 'old-map formula and real relocation paths both exercised');

const up = new Vector3(0, 1, 0);
const template = createHeightField(1337, getMapConfig('reservoir'));
// Any mixed row pair must fit, including asymmetric contact center offsets.
const rects = ALL_TANK_IDS.map(id => tankContactRect(getSpec(id)));
const frontExtent = Math.max(...rects.map(rect => rect.centerZ + rect.halfLength));
const rearExtent = Math.max(...rects.map(rect => rect.halfLength - rect.centerZ));
const rightExtent = Math.max(...rects.map(rect => rect.centerX + rect.halfWidth));
const leftExtent = Math.max(...rects.map(rect => rect.halfWidth - rect.centerX));
assert.ok(13 - frontExtent - rearExtent >= .5, '13m facing rows retain real full-fleet mixed-hull clearance');
assert.ok(8 - rightExtent - leftExtent >= .5, '8m columns retain real full-fleet mixed-hull clearance');
for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI, .31, -.77]) {
  const field = { ...template, getHeightAt: () => 0, getHeightAtFast: () => 0,
    getNormalAt: () => up, getWaterMaskAt: () => 0, getGroundType: () => 'hard',
    _layout: { ...template._layout, spawns: { ...template._layout.spawns,
      player: { x: 20, z: -30, yaw, formation: { columnSpacingM: 8, rowSpacingM: 13 } } } } };
  const nominal = preferred(field, currentSpawn);
  assert.deepEqual(nominal, preferred(field), 'six-yaw policy retains the exact published formula');
  for (let index = 0; index < 7; index++) {
    const state = nominal[index].spawn, dx = state.x - 20, dz = state.z + 30;
    assert.ok(Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw) - (index % 4 - 1.5) * 8) < 1e-10, 'columns follow tank right');
    assert.ok(Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw) + Math.floor(index / 4) * 13) < 1e-10, 'rows follow tank backward');
  }
  const placed = assertComposed(field, preferred(field), `yaw ${yaw}`);
  const explicit = players.map(record => ({ ...record, spawn: { x: 70, z: 80, yaw: .2 } }));
  assert.ok(rows(make(field, explicit)).every(row => row.pos[0] === 70 && row.pos[2] === 80 && row.yaw === .2), 'explicit placements precede the formation policy');
  const unconfigured = { ...field, _layout: { ...field._layout, spawns: { ...field._layout.spawns, player: { x: 20, z: -30, yaw } } } };
  assert.deepEqual(nominal.slice(7), preferred(unconfigured, currentSpawn).slice(7), 'Bravo authored preferred pads unchanged');
  for (const formation of [{ columnSpacingM: 0, rowSpacingM: 13 }, { columnSpacingM: 8, rowSpacingM: NaN }, { columnSpacingM: Infinity, rowSpacingM: 13 }]) {
    const bad = { ...field, _layout: { ...field._layout, spawns: { ...field._layout.spawns,
      player: { ...field._layout.spawns.player, formation } } } };
    assert.throws(() => make(bad), /finite and positive/, 'malformed opt-in spacing fails explicitly');
  }
  if (yaw === .31) {
    for (const [from, to] of [
      ['right * cos - back * sin', 'right * cos + back * sin'],
      ['const back = row * rowSpacingM;', 'const back = row * rowSpacingM * 2;'],
      ['const col = index % 4;', 'const col = (index + 1) % 4;'],
      ['yaw: finite(base.yaw, Math.PI)', 'yaw: finite(base.yaw, Math.PI) + Math.PI'],
    ]) {
      assert.equal(currentSource.split(from).length, 2, 'one exact nominal-policy mutant seam');
      const wrong = preferred(field, compileSpawn(currentSource.replace(from, to)));
      assert.throws(() => assert.deepEqual(wrong, preferred(field)), 'wrong rotation/spacing/order/Bravo yaw rejected');
      assert.notDeepEqual(resolved(field, wrong), placed, 'safety resolution cannot hide the nominal-policy mutant');
    }
    const oldSpacing = currentSource.replace('(col - 1.5) * 8', '(col - 1.5) * 9');
    assert.notEqual(oldSpacing, currentSource);
    assert.throws(() => assert.deepEqual(preferred(unconfigured, compileSpawn(oldSpacing)), preferred(unconfigured)), 'old default 8m spacing remains guarded');
    const overlap = structuredClone(placed); overlap[1].spawn = { ...overlap[0].spawn };
    assert.throws(() => assertSafe(field, overlap), /reservation clearance/, 'unsafe overlap cannot pass');
    assert.throws(() => assertSafe(field, preferred(field)), /reservation clearance/, 'bypassing safe placement is a failing witness');
    assert.throws(() => assertSafe({ ...field, getWaterMaskAt: () => 1 }, placed), /dry full footprint/, 'wet placement cannot pass');
    assert.throws(() => assertSafe({ ...field, getNormalAt: () => ({ y: .89 }) }, placed), /slope/, 'steep placement cannot pass');
    const at = placed[0].spawn, wall = { min: [at.x - 2, -1, at.z - 2], max: [at.x + 2, 5, at.z + 2] };
    assert.throws(() => assertSafe(field, placed, [wall]), /obstacle overlap/, 'blocked placement cannot pass');
    assertComposed(field, preferred(field), 'real obstacle relocation', [wall]);
  }
}
console.log(`formationPlacement.selftest: ${MAP_IDS.length} maps (${defaultMaps} old-formula, ${relocatedMaps} relocated), exact pre-f9 policy/settlement, six orientations, explicit bypass, Bravo, malformed policy and rejecting mutants passed`);
