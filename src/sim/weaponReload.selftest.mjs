import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
// guards 229: no eager fleet factory (it cost 7 of the receipt's 12 s CPU): specs, the authority's calibrations
// (prepareCounterDrone) and the solo battle load on their own, and every pinned value here reads the same without it.
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, selectShell, startMagazineReload, startPostShotReload, tickReload } from './damage.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
import { COUNTER_DRONE_CLASSES, hoverCounterDrone, prepareCounterDrone, roofStations, soloHoverCounterDrone } from './counterDroneEngagement.test-support.mjs';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';

// Every harness below reaches the authority or the solo battle with finalized combat anatomy, as the match service
// does (server/match/service.ts calls ensureAuthorityFleet first; guards 229 critic round 2).
await ensureAuthorityFleet(['mbt70', 'm1a1_abrams_hc', 'leclerc_s2', 'm1a3', 'bmp3', 'bmp3_rok']);

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: ${actual} vs ${expected}`);
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const controls = (shellSlot, fire) => ({ throttle: 0, steer: 0, brake: true, fire,
  shellSlot, aimYaw: 0, aimPitch: .25, aimDistance: 300, actionBits: 0 });

// Swapping ammo must neither bypass nor extend a shared barrel/feed's cycle.
for (const id of ['mbt70', 'm1a1_abrams_hc', 'leclerc_s2']) {
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
      { id: 'target', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 400, z: -400, yaw: 0 } },
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
// VH.15 counter-drone hovers (227 guards; here since guards 229, where the authority and the solo battle are already
// loaded: counterDroneEngagement.selftest holds the levers as data, the release check pins the pilot runs). Owner
// 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng", hitsToDown 1.1.
// On the authority, one lone station per class (the Rh 202 hull is the entry point's): a drone hovering about 33 m off
// the bow takes the class's capped rounds (7.62 8 inside one burst; 12.7 6 and 30 mm 4, each only after a burst pause),
// about 102 m out every round is below the cap (46, 38 and 20 rounds); ticks from the first round to the fall pinned;
// a drone relaunched after a downed one starts clean. Deterministic: the same flight every run.
{
  const anchors = Object.fromEntries(Object.entries(COUNTER_DRONE_CLASSES).filter(([name]) => name !== 'rh202').map(([name, c]) => [name, c.anchor]));
  await prepareCounterDrone(Object.values(anchors));
  const ticks = (s) => (s === null ? null : Math.round(s / SIM_DT));
  const TICKS = { rifle: { at30: 42, at100: 617 }, heavy: { at30: 117, at100: 830 }, cannon: { at30: 135, at100: 812 } };
  for (const [name, id] of Object.entries(anchors)) {
    const c = COUNTER_DRONE_CLASSES[name], near = hoverCounterDrone({ specId: id }), far = hoverCounterDrone({ specId: id, distanceM: 100, seconds: 30 });
    assert.ok(near.rangeM > 25 && near.rangeM < 38 && far.rangeM > 95 && far.rangeM < 110, `${id}: the hovers sit about 33 m and 102 m out (${near.rangeM?.toFixed(1)}, ${far.rangeM?.toFixed(1)} m)`);
    assert.deepEqual([near.rounds, ticks(near.downedS)], [[c.capped], TICKS[name].at30],
      `a lone ${name} station downs a drone hovering 33 m out in ${c.capped} capped rounds, ${TICKS[name].at30} ticks after its first (measured ${JSON.stringify(near.rounds)}, ${ticks(near.downedS)} ticks; hitsToDown 1 gives fewer)`);
    assert.equal(near.insideFirstBurst, !c.survivesBurst, c.survivesBurst
      ? `a lone ${name} station's first capped burst leaves the drone flying (${near.totalRounds} rounds; a burst is ${roofStations(id)[0].burstRounds})`
      : `a lone ${name} station still downs a drone inside one capped burst`);
    assert.deepEqual([far.rounds, ticks(far.downedS)], [[c.at100], TICKS[name].at100],
      `below the cap (102 m) a lone ${name} station needs ${c.at100} rounds, ${TICKS[name].at100} ticks (measured ${JSON.stringify(far.rounds)}, ${ticks(far.downedS)} ticks)`);
  }
  const twice = hoverCounterDrone({ specId: anchors.rifle, flights: 2, seconds: 45 });
  assert.deepEqual(twice.flights.map((f) => [f.rounds, ticks(f.downedS)]), [[[8], 42], [[8], 42]],
    'a drone relaunched after a downed one starts with no strikes on it: the second flight takes the same 8 rounds');
}
// The solo battle (227 guards): game/state.ts's own GunContext (its droneHit and 'drone:down') downs a drone hovering
// 33 m off an M1A1's bow in the 8 capped 7.62 rounds, 42 ticks after the first, that the authority takes above.
{
  const h = soloHoverCounterDrone({ specId: 'm1a1', solo: { createGameState, createBus, simStep } });
  assert.deepEqual([h.rounds, Math.round(h.downedS / SIM_DT), h.insideFirstBurst], [[COUNTER_DRONE_CLASSES.rifle.capped], 42, true],
    `solo: a lone 7.62 downs the hovering drone in the authority's 8 rounds and 42 ticks (measured ${JSON.stringify(h.rounds)}, ${h.downedS} s)`);
}
console.log('weaponReload: shared-gun ammo, magazine preservation, concurrent weapons, BMP-3 dual guns, solo/authority and snapshots, the counter-drone hovers (authority: 7.62 / 12.7 / 30 mm at 33 m and 102 m, a relaunch; solo: 7.62) PASS');
