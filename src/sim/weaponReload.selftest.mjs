import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, selectShell, startMagazineReload, startPostShotReload, tickReload } from './damage.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: ${actual} vs ${expected}`);
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const controls = (shellSlot, fire) => ({ throttle: 0, steer: 0, brake: true, fire,
  shellSlot, aimYaw: 0, aimPitch: .25, aimDistance: 300, actionBits: 0 });

// Swapping ammo must neither bypass nor extend a shared barrel/feed's cycle.
for (const id of ['mbt70', 'm1a2', 'leclerc']) {
  const spec = getSpec(id), combat = createCombatState(spec);
  const gun = combat.reload;
  const ammo = [...combat.ammo];
  startPostShotReload(combat, spec);
  const duration = gun.t, rounds = combat.magazine?.rounds;
  tickReload(combat, .25);
  for (let swap = 0; swap < 10; swap++) {
    const slot = swap % spec.gun.shells.length;
    assert(selectShell(combat, slot, spec));
    assert.equal(combat.reload, gun, `${id}: every round fired through this gun shares its cycle`);
    near(combat.reload.t, duration - .25, `${id}: no timer reset or bypass`);
    assert.equal(combat.magazine?.rounds, rounds, `${id}: no discarded or free magazine rounds`);
  }
  assert.deepEqual(combat.ammo, ammo, `${id}: selection does not consume inventory`);
}

function soloHarness(id = 'm1a3') {
  const spec = getSpec(id), combat = createCombatState(spec), game = createGameState();
  const entity = { id: 'shooter', specId: spec.id, spec, isPlayer: true, team: 'player', combat,
    state: createTankState(spec, new Vector3(), 0), input: controls(0, false),
    visual: { root: new Group(), gunMuzzleWorld: out => out.set(0, 5, 10),
      gunDirWorld: out => out.set(0, .25, 1).normalize(), recoilKick() {} } };
  combat.equipMults = {};
  game.tanks = [entity]; game.allTanks = [entity]; game.tankById.set(entity.id, entity);
  const fired = [], bus = createBus((name, payload) => { if (name === 'shell:fired') fired.push(payload.shellName); });
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  return { entity, fired, step(slot, fire = false) {
    Object.assign(entity.input, controls(slot, fire));
    simStep(game, bus, { heightField: flat, raycast: () => null }, null, collider);
  } };
}
function authorityHarness(id = 'm1a3') {
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, seed: 12,
    worldCollision: { mapId: 'verdant', heightField: flat, obstacles: [] }, players: [
      { id: 'shooter', specId: id, team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 400, z: -400, yaw: 0 } },
    ] });
  match.onMatchReady();
  const entity = match.entityById.get('shooter'), fired = [];
  entity.combat.equipMults = {};
  let tick = 0, latest;
  return { entity, fired, get snapshot() { return latest; }, step(slot, fire = false) {
    match.step({ dt: SIM_DT, inputs: new Map([['shooter', controls(slot, fire)]]) });
    latest = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'shooter', ackInputSeq: tick });
    for (const event of latest.events) if (event.type === 'shell_fired' && event.shooterId === 'shooter') fired.push(event.shellName);
    match.afterSnapshotBroadcast(); tick++;
  } };
}

// Drive both real firing loops, rather than preselecting a weapon in the fixture.
// The same input must let the launcher fire while the cannon is busy, keep both
// timers advancing, and reject an attempted cannon shot during its magazine load.
for (const [name, createHarness] of [['solo', soloHarness], ['authority', authorityHarness]]) {
  const h = createHarness(), { combat, spec } = h.entity;
  h.step(0, true);
  assert.equal(h.fired.length, 1, `${name}: cannon shot`);
  const rounds = combat.magazine.rounds;
  const gun = combat.reload;
  h.step(1, true);
  assert.equal(h.fired.length, 2, `${name}: ready launcher fires immediately while cannon is cycling`);
  const launcher = combat.reload;
  assert.notEqual(gun, launcher);
  near(gun.t, spec.gun.autoloader.intraClipS - SIM_DT, `${name}: deselected cannon progresses`);
  assert.equal(combat.magazine.rounds, rounds);
  assert(startMagazineReload(combat, spec));
  const gunStart = gun.t, launcherStart = launcher.t;
  h.step(2, true);
  assert.equal(h.fired.length, 2, `${name}: switching cannon ammo cannot bypass its magazine reload`);
  near(gun.t, gunStart - SIM_DT, `${name}: shared ammo slots tick only once`);
  near(launcher.t, launcherStart - SIM_DT, `${name}: deselected launcher progresses concurrently`);
  for (let i = 0; i < 180; i++) h.step(2);
  assert.equal(launcher.t, 0);
  assert(gun.t > 0);
  assert.equal(combat.magazine.rounds, 0, `${name}: launcher completion cannot refill cannon magazine`);
  h.step(1, true);
  assert.equal(h.fired.length, 3, `${name}: launcher fires again during the same cannon reload`);
  near(gun.t, gunStart - 182 * SIM_DT, `${name}: selection never restarted cannon progress`);
  assert.deepEqual(h.fired, [spec.gun.shells[0].name, spec.gun.shells[1].name, spec.gun.shells[1].name]);
  assert.equal(combat.ammo[0], spec.gun.shells[0].count - 1);
  assert.equal(combat.ammo[1], spec.gun.shells[1].count - 2);
  assert.equal(combat.ammo[2], spec.gun.shells[2].count);
  if (h.snapshot) {
    const own = h.snapshot.entities.find(entity => entity.id === 'shooter');
    assert.equal(own.reloadMs, Math.round(launcher.t * 1000));
    assert.equal(own.gunReloadMs, Math.round(gun.t * 1000), 'snapshot retains both independent reloads');
  }
}

// The BMP-3 carries two guns: HE and ATGM use the same 100 mm barrel while
// the 30 mm autocannon remains independently available during that reload.
for (const [name, createHarness] of [['solo', soloHarness], ['authority', authorityHarness]]) {
  for (const id of ['bmp3', 'bmp3_rok']) {
    const h = createHarness(id), { combat, spec } = h.entity;
    const [autocannon, missile, highExplosive] = combat.reloadChannels;
    assert.notEqual(autocannon, highExplosive);
    assert.equal(missile, highExplosive, `${name} ${id}: ATGM and HE share the 100 mm gun`);
    h.step(2, true);
    assert.equal(h.fired.length, 1, `${name} ${id}: 100 mm HE fires`);
    near(highExplosive.t, 4, `${name} ${id}: HE starts its full reload`);
    h.step(0, true);
    assert.equal(h.fired.length, 2, `${name} ${id}: autocannon fires during 100 mm reload`);
    near(highExplosive.t, 4 - SIM_DT, `${name} ${id}: inactive 100 mm reload advances`);
    assert(autocannon.t > 0, `${name} ${id}: both weapons are cycling`);
    h.step(1, true);
    assert.equal(h.fired.length, 2, `${name} ${id}: missile cannot bypass the HE reload`);
    near(highExplosive.t, 4 - 2 * SIM_DT, `${name} ${id}: shared channel ticks only once`);
    for (let i = 0; i < 240; i++) h.step(i % 3);
    assert.equal(autocannon.t, 0);
    assert.equal(highExplosive.t, 0);
    h.step(1, true);
    assert.equal(h.fired.length, 3, `${name} ${id}: ATGM available after 100 mm reload`);
    near(missile.t, spec.gun.shells[1].reloadS, `${name} ${id}: fired ATGM starts its own duration`);
    h.step(2, true);
    assert.equal(h.fired.length, 3, `${name} ${id}: HE also waits for ATGM reload`);
    for (let slot = 0; slot < 3; slot++) {
      assert.equal(combat.ammo[slot], spec.gun.shells[slot].count - 1,
        `${name} ${id}: only successful shots consume ammunition`);
    }
  }
}
console.log('weaponReload: shared-gun ammo, magazine preservation, concurrent weapons, BMP-3 dual guns, solo/authority and snapshots PASS');
