// Twin cannons on the page's own step (round 8 Y1 s5-01; sim/launcherPolicy.ts nextCannonMuzzle): the solo step asks the
// barrel owner the authority asks, so a gepard_1a2's rounds leave the same mouths in the same order on both drivers, and
// each round's origin is taken at that mouth of the drawn gun. Before the fix the solo step kept its own alternation and
// the authority none (its rounds left the centre line, shell_fired named -1), so the two drivers fired from origins
// 0.7-1.2 m apart.
// The selector itself, the authority's mouths, the network screens and the cursor census are
// src/sim/twinMuzzleParity.selftest.mjs (default tier); this case seats a battle with the page's setupBattle and steps it
// with simStep, which costs a page import, a world and a fleet: MANUAL suite 'sims' (tools/selftest-tiers.mjs).
import assert from 'node:assert/strict';
import { Group } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// the staged roster (random: false) and the shooter, their combat anatomy only: no vehicle builders
await ensureAuthorityFleet([...TANK_IDS, 'gepard_1a2', 'm1a1_abrams_hc']);

// ---- the authority: the mouths a gepard_1a2's first three rounds leave ------------------------------------------------
const authorityMouths = [];
{
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0, players: [
    { id: 'aa', specId: 'gepard_1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 350, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  for (let tick = 1; tick <= 3000 && authorityMouths.length < 3; tick++) {
    const input = { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: 0.02, shellSlot: 0 };
    match.step({ dt: 1 / 60, tick, inputs: new Map([['aa', input]]) });
    const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'aa', ackInputSeq: tick });
    for (const event of snapshot.events) if (event.type === 'shell_fired' && event.shooterId === 'aa') authorityMouths.push(event.muzzleIndex);
    match.afterSnapshotBroadcast();
  }
  assert.deepEqual(authorityMouths, [0, 1, 0], 'the authority names the mouth each round leaves, in turn');
}

// ---- the solo step asks the same selector: the same mouths in the same order -------------------------------------------
{
  const world = createDedicatedWorldCollision('verdant');
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 4 });
  game.mapId = 'verdant';
  spawnTanks(game, { scene: { remove() {} } });
  const asked = [];
  const visualFor = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
    resetDestroyed() {},
    gunMuzzleWorld: (out, index) => { if (entity.isPlayer) asked.push(index); return out.copy(entity.state.pos).setY(entity.state.pos.y + 2); },
    gunDirWorld: (out) => out.set(Math.sin(entity.state.yaw), 0.01, Math.cos(entity.state.yaw)).normalize(),
    gunPivotWorld: (out) => out.copy(entity.state.pos) });
  for (const entity of game.allTanks) entity.visual = visualFor(entity);
  game.battleCount = 1;
  setupBattle(game, 'gepard_1a2', world, { gameMode: 'standard', random: false, brain: null, arrangement: { allies: 0, enemies: 1 },
    deferVisuals: true, deferCamoRepaint: true });
  for (const entity of game.allTanks) entity.visual = visualFor(entity);
  game.preBattleS = 0;
  const bus = createBus(() => {});
  const fired = [];
  bus.on('shell:fired', (event) => { if (event.isPlayer) fired.push(event.muzzleIndex); });
  const collider = createCollider(game, world);
  const player = game.player;
  try {
    for (let tick = 0; tick < 400 && fired.length < 3; tick++) {
      player.input.fire = true;
      player.input.aimPoint.set(player.state.pos.x + 300 * Math.sin(player.state.yaw), player.state.pos.y + 4,
        player.state.pos.z + 300 * Math.cos(player.state.yaw));
      simStep(game, bus, world, null, collider);
    }
  } finally {
    world.release?.();
  }
  assert.deepEqual(fired, authorityMouths, 'the solo step fires the same mouths in the same order');
  assert.deepEqual(asked, fired, 'and takes each round\'s origin at that mouth of the drawn gun');
}

console.log(`twinMuzzleSolo.selftest: the authority and the solo step fire gepard_1a2 mouths ${authorityMouths.join(', ')}, each `
  + 'solo round from that mouth of the drawn gun PASS');
process.exit(0);
