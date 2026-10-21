// The proving ground in the solo battle (v2 progression, owner 2026-10-17: proving ground / test drive), run for real on
// its battlefield: the player on the firing line, one target hull on every lane's mark with no AI and no trigger, the
// range card and the lane markers in the mode state, a destroyed hull standing again on its mark, the quick reset, the
// moving-target switch (hulls shuttle in their lanes), no verdict however long the range stays open, nothing recorded,
// and the entry points: the Garage's launch, the Gallery's link (untrusted input) and the session controls.
import assert from 'node:assert/strict';
import { createBus, createGameState, resetProvingRange, setProvingTargetsMoving, setupBattle, simStep, createCollider } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { PROVING_GROUND_RULES, TEST_DRIVE } from '../sim/matchRuleset.ts';
import { planSoloProvingRange } from './provingRange.ts';
import { objectiveMarkers, markersStandOnSpawns } from '../ui/minimapObjectives.ts';
import { createProvingControls, testDriveLaunch } from './provingGroundSession.ts';
import { TEST_DRIVE_PARAM, readTestDriveIntent, testDriveHref, withoutTestDriveIntent } from './testDriveLink.ts';
import { createTankIdResolver } from '../vehicles/tankIdAliases.ts';
import { readTeamArrangement } from './teamArrangement.ts';

const rules = PROVING_GROUND_RULES;
const PLAYER = 'm1a1_abrams_hc';

// --- the entry points ---------------------------------------------------------------------------------------------------
assert.deepEqual(testDriveLaunch('leo2a4'), { specId: 'leo2a4', mapId: rules.mapId, gameMode: TEST_DRIVE.gameMode },
  'the Garage launches the range on its own battlefield');
assert.equal(TEST_DRIVE_PARAM, 'testdrive');
const schema1 = createTankIdResolver({ schema: 1, renames: [] });
const schema2 = createTankIdResolver({ schema: 2, renames: [{ old_tank: 'new_tank' }] });
assert.equal(testDriveHref('leo2a4', schema1), '/?testdrive=leo2a4');
assert.equal(testDriveHref('new_tank', schema2), '/?testdrive=new_tank&ids=2', 'a link carries the id schema it was written in');
assert.equal(readTestDriveIntent('?testdrive=leo2a4', schema1), 'leo2a4');
assert.equal(readTestDriveIntent('?testdrive=old_tank', schema2), 'new_tank', 'an unstamped link resolves through the renames');
assert.equal(readTestDriveIntent('?testdrive=new_tank&ids=2', schema2), 'new_tank');
for (const hostile of ['?testdrive=', '?testdrive=../x', '?testdrive=%3Cscript%3E', '?testdrive=' + 'a'.repeat(65), '?testdrive=LEO', '?other=1', '', null]) {
  assert.equal(readTestDriveIntent(hostile, schema1), null, `rejects ${JSON.stringify(hostile)}`);
}
assert.equal(withoutTestDriveIntent('https://x.test/cn/?testdrive=leo2a4&ids=3&tier=high#top'), '/cn/?tier=high#top',
  'the address drops the intent and keeps the rest');
assert.equal(withoutTestDriveIntent('https://x.test/?tier=high'), '/?tier=high');

// --- the battle on the range --------------------------------------------------------------------------------------------
await ensureFullFleet();
const world = createDedicatedWorldCollision(rules.mapId);
const authored = world.heightField._layout.spawns;
const spawn = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawn(authored.player), enemies: authored.enemies.map(spawn) };
const visual = () => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {} });
const events = [];
const bus = createBus((name, payload) => events.push([name, payload]));
try {
  const layout = planSoloProvingRange(rules, world);
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = rules.mapId;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual();
  setupBattle(game, PLAYER, world, { gameMode: TEST_DRIVE.gameMode, random: true, arrangement: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  const collider = createCollider(game, world);
  const step = (n) => { for (let i = 0; i < n; i++) simStep(game, bus, world, null, collider); };
  const player = game.player;
  const targets = game.tanks.filter((entity) => entity !== player);
  assert.equal(game.ruleset.provingGround, rules);
  assert.equal(targets.length, rules.lanes.length, 'one target hull per lane');
  assert.ok(Math.hypot(player.state.pos.x - layout.origin.x, player.state.pos.z - layout.origin.z) < 3, 'the player deploys on the firing line');
  for (const [index, target] of targets.entries()) {
    assert.equal(target.team, 'enemy', 'a target is shootable');
    assert.equal(target.aiCtl, null, 'a target has no brain');
    assert.ok(target._provingMark, 'a target knows its mark');
    const lane = layout.lanes[index];
    assert.ok(Math.hypot(target.state.pos.x - lane.x, target.state.pos.z - lane.z) < 4, `target ${index} stands on lane ${index}'s mark`);
  }
  assert.equal(game.jev ?? null, null, 'no commander for the targets');

  const range = game.matchModeState.range;
  assert.ok(range, 'the mode state carries the range');
  assert.equal(range.mapId, rules.mapId);
  assert.deepEqual(range.lanes.map((lane) => lane.targetId), targets.map((target) => target.id), 'each lane names the hull on it');
  assert.ok(range.lanes.every((lane) => lane.shells.length === player.spec.gun.shells.length), 'a card per round of the player\'s loadout');
  const markers = objectiveMarkers(game.matchModeState);
  assert.deepEqual(markers.filter((marker) => marker.kind === 'lane').map((marker) => marker.label), range.lanes.map((lane) => String(lane.index + 1)),
    'a numbered lane marker per lane (one derivation for the map and the field)');
  assert.deepEqual(markers.filter((marker) => marker.kind === 'spawn').map((marker) => [marker.x, marker.z]), [[layout.origin.x, layout.origin.z]],
    'the firing line is the one spawn marked');
  assert.ok(markersStandOnSpawns(markers));

  // the targets hold still and never fire
  const marks = targets.map((target) => ({ x: target.state.pos.x, z: target.state.pos.z }));
  step(60 * 3);
  for (const [index, target] of targets.entries()) {
    assert.ok(Math.hypot(target.state.pos.x - marks[index].x, target.state.pos.z - marks[index].z) < 0.6, `target ${index} holds its mark`);
  }
  const hostileShots = () => events.filter(([name, payload]) => name === 'shell:fired' && payload?.shooterId && payload.shooterId !== player.id).length;
  assert.equal(hostileShots(), 0, 'no target fires');

  // a live round down lane 1 reaches its hull and resolves to an outcome the shot card shows
  {
    const lane = targets[0];
    const centre = { x: lane.state.pos.x, y: lane.state.pos.y + lane.spec.dims.heightM * 0.5, z: lane.state.pos.z };
    player.input.aimPoint.set(centre.x, centre.y, centre.z);
    step(60 * 5);
    // headless: the barrel is laid on the hull's centre (the rendered model owns the muzzle in the page)
    const muzzle = (out) => out.set(player.state.pos.x, player.state.pos.y + 2.4, player.state.pos.z);
    player.visual = { ...visual(), gunMuzzleWorld: (out) => muzzle(out),
      gunDirWorld: (out) => muzzle(out).multiplyScalar(-1).add({ x: centre.x, y: centre.y, z: centre.z }).normalize() };
    const before = events.length;
    for (let i = 0; i < 60 * 4 && !events.slice(before).some(([name, payload]) => name === 'shell:hit' && payload?.targetId === lane.id); i++) {
      player.input.fire = i < 2;
      step(1);
    }
    player.input.fire = false;
    const hit = events.slice(before).find(([name, payload]) => name === 'shell:hit' && payload?.targetId === lane.id);
    assert.ok(hit, 'the round down lane 1 strikes its hull');
    assert.equal(typeof hit[1].kind, 'string', `and resolves to an outcome (${hit[1].kind})`);
    step(60 * 5);
  }

  // a destroyed hull stands again on its mark, and the range never ends
  const victim = targets[1];
  victim.combat.hp = 0; victim.combat.destroyed = true;
  step(30);
  assert.equal(victim.combat.destroyed, true);
  step(60 * rules.lanes.length);
  assert.equal(victim.combat.destroyed, false, 'the hull stands again after the respawn delay');
  assert.ok(victim.combat.hp > 0 && victim.combat.hp === victim.combat.maxHp, 'at full health');
  assert.ok(Math.hypot(victim.state.pos.x - marks[1].x, victim.state.pos.z - marks[1].z) < 4, 'on its own mark');
  for (const target of targets) { target.combat.hp = 0; target.combat.destroyed = true; }
  step(60);
  assert.equal(game.result, null, 'every target down is no victory: the range has no verdict');
  step(60 * 4);
  assert.ok(targets.every((target) => !target.combat.destroyed), 'the whole line stands again');

  // the quick reset: every hull back on its mark at full health, the round in the breech kept
  player.state.pos.x += 30;
  victim.combat.hp = Math.floor(victim.combat.maxHp / 3);
  const slot = player.spec.gun.shells.length > 1 ? 1 : 0;
  player.input.shellSlot = slot; player.combat.shellSlot = slot;
  assert.equal(resetProvingRange(game), true);
  assert.ok(Math.hypot(player.state.pos.x - layout.origin.x, player.state.pos.z - layout.origin.z) < 3, 'the player is back on the firing line');
  assert.equal(victim.combat.hp, victim.combat.maxHp, 'the hulls are whole again');
  assert.equal(player.combat.shellSlot, slot, 'the tested round stays loaded');

  // moving targets: they shuttle along their hull axes, inside their lanes
  assert.equal(setProvingTargetsMoving(game, true), true);
  assert.equal(game.ruleset.provingGround.moving, true);
  assert.equal(game.matchModeState.range.moving, true, 'the card reads the switch');
  step(60 * 6);
  let moved = 0;
  for (const [index, target] of targets.entries()) {
    const mark = target._provingMark;
    const dx = target.state.pos.x - mark.x, dz = target.state.pos.z - mark.z;
    const along = dx * Math.sin(mark.yaw) + dz * Math.cos(mark.yaw), off = dx * Math.cos(mark.yaw) - dz * Math.sin(mark.yaw);
    if (Math.abs(along) > 2) moved++;
    assert.ok(Math.abs(off) < 6, `target ${index} keeps to its line (${off.toFixed(1)} m off)`);
  }
  assert.ok(moved >= targets.length - 1, `the targets drive (${moved}/${targets.length})`);
  step(60 * 40);
  for (const [index, target] of targets.entries()) {
    const mark = target._provingMark;
    assert.ok(Math.hypot(target.state.pos.x - mark.x, target.state.pos.z - mark.z) < rules.patrol.halfLengthM + 15, `target ${index} never leaves its lane`);
  }
  assert.equal(hostileShots(), 0, 'moving targets never fire');
  assert.equal(game.result, null, 'no verdict however long the range stays open');
  assert.equal(events.filter(([name]) => name === 'battle:ended').length, 0, 'the range never reports a battle');
  assert.equal(setProvingTargetsMoving(game, false), true);
  for (const [index, target] of targets.entries()) {
    assert.ok(Math.hypot(target.state.pos.x - target._provingMark.x, target.state.pos.z - target._provingMark.z) < 4, `target ${index} back on its mark`);
  }

  // the controls: inert outside a proving-ground battle, the switch remembered for the next test drive
  const storage = new Map();
  const store = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } };
  let active = true;
  const controls = createProvingControls({
    active: () => active, reset: () => resetProvingRange(game), setMoving: (value) => setProvingTargetsMoving(game, value),
    moving: () => !!game.ruleset.provingGround?.moving, storage: store,
  });
  assert.equal(controls.toggleMoving(), true);
  assert.equal(game.ruleset.provingGround.moving, true);
  assert.deepEqual(readTeamArrangement(TEST_DRIVE.gameMode, store), { movingTargets: true }, 'the switch is remembered');
  assert.equal(controls.toggleMoving(), true);
  assert.equal(readTeamArrangement(TEST_DRIVE.gameMode, store), null);
  active = false;
  assert.equal(controls.reset(), false, 'inert outside the range');
  assert.equal(controls.toggleMoving(), false);

  // a battle of any other mode resets nothing
  setupBattle(game, PLAYER, world, { gameMode: 'standard', random: true, arrangement: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true });
  assert.equal(game.matchModeState.range, undefined, 'only the range carries a range');
  assert.equal(resetProvingRange(game), false);
  assert.equal(setProvingTargetsMoving(game, true), false);
  assert.ok(game.tanks.filter((entity) => entity !== game.player).every((entity) => !entity._provingMark), 'no seat keeps a mark');
} finally {
  world.release();
}
console.log(`provingSession.selftest: test-drive entry points, ${rules.lanes.length} target lanes seated on ${rules.mapId}, a live round resolved on its hull, still and moving targets that never fire, respawn on the mark, quick reset, no verdict and the controls pass`);
